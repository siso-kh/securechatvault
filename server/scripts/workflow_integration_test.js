#!/usr/bin/env node
'use strict';

/**
 * Workflow integration tests: redactor, prior-router gateway, and backend API.
 *
 * Unlike tests/integration.test.js, this script does NOT require services to
 * already be running, and it does not spend provider quota. It:
 *   1. starts a local OpenAI-compatible stub upstream,
 *   2. starts the prior-router gateway against a temporary catalogue that
 *      points at that stub (including one model that always 429s, to exercise
 *      failover),
 *   3. starts the redactor and the backend (with in-memory MongoDB),
 *   4. checks each service alone over HTTP, then the full
 *      server -> redactor -> gateway -> upstream pipeline.
 *
 * Run: npm run test:workflow   (from server/)
 *      node server/scripts/workflow_integration_test.js
 *
 * Ports can be overridden with WORKFLOW_REDACTOR_PORT, WORKFLOW_GATEWAY_PORT,
 * WORKFLOW_SERVER_PORT, and WORKFLOW_STUB_PORT.
 */

const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { MongoMemoryServer } = require('mongodb-memory-server');

const ROOT = path.resolve(__dirname, '../..');
const SERVER_DIR = path.join(ROOT, 'server');
const REDACTOR_DIR = path.join(ROOT, 'redactor');
const ROUTER_DIR = path.join(ROOT, 'prior-router');

const PYTHON = process.env.PYTHON || (os.platform() === 'win32' ? 'python' : 'python3');
const GATEWAY_KEY = 'workflow-integration-gateway-key';
const STUB_KEY = 'workflow-integration-upstream-key';
const JWT_SECRET = 'workflow-integration-jwt-secret';

// Filled in by allocatePorts(): explicit env overrides win, otherwise the OS
// picks a free ephemeral port (Windows reserves whole ranges such as 14000).
const PORTS = {};
const URLS = {};

async function allocatePorts() {
  const overrides = {
    redactor: process.env.WORKFLOW_REDACTOR_PORT,
    gateway: process.env.WORKFLOW_GATEWAY_PORT,
    server: process.env.WORKFLOW_SERVER_PORT,
    stub: process.env.WORKFLOW_STUB_PORT,
  };

  // Keep every probe socket open while allocating so the OS cannot hand the
  // same port out twice; close them all once the set is chosen.
  const probes = [];
  for (const name of Object.keys(overrides)) {
    if (overrides[name]) {
      PORTS[name] = Number(overrides[name]);
      continue;
    }
    const probe = http.createServer();
    probes.push(probe);
    await new Promise((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(0, '127.0.0.1', resolve);
    });
    PORTS[name] = probe.address().port;
  }
  await Promise.all(probes.map((probe) => new Promise((resolve) => {
    probe.close(() => resolve());
  })));

  URLS.redactor = `http://127.0.0.1:${PORTS.redactor}`;
  URLS.gateway = `http://127.0.0.1:${PORTS.gateway}`;
  URLS.server = `http://127.0.0.1:${PORTS.server}`;
}

const SECRET_KEY = 'sk-live-99887766554433221100aabb';
const DB_URI = 'postgres://admin:SuperSecretPass@db.internal:5432/prod';
const PEM = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const results = [];
const services = {};

function section(title) {
  console.log(`\n${title}`);
}

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: err });
    console.log(`  ✗ ${name}`);
    console.log(`      ${err.message.split('\n').join('\n      ')}`);
  }
}

async function request(url, options = {}) {
  const { timeout = 30_000, ...init } = options;
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, headers: res.headers, body, text };
}

function jsonRequest(url, body, { token, headers = {}, ...rest } = {}) {
  return request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
    ...rest,
  });
}

async function waitFor(name, url, { until = (res) => res.ok, timeout = 30_000 } = {}) {
  const deadline = Date.now() + timeout;
  let lastError = 'no attempt made';

  while (Date.now() < deadline) {
    const child = services[name];
    if (child && child.exitCode !== null) {
      throw new Error(
        `${name} exited early with code ${child.exitCode}\n${serviceLogs(child)}`
      );
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (until(res)) return res;
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err.message;
    }
    await sleep(250);
  }

  throw new Error(`${name} was not ready at ${url} after ${timeout}ms (${lastError})`);
}

function startService(name, command, args, options) {
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });

  const lines = [];
  const collect = (chunk) => {
    lines.push(chunk.toString());
    if (lines.length > 400) lines.shift();
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  child.on('error', (err) => {
    lines.push(`spawn error: ${err.message}\n`);
  });

  child.logs = () => lines.join('');
  services[name] = child;
  return child;
}

function serviceLogs(child) {
  const logs = typeof child.logs === 'function' ? child.logs() : '';
  return logs.trim() ? `\n--- ${'service'} output ---\n${logs.trim()}` : '';
}

async function stopService(name) {
  const child = services[name];
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([once(child, 'exit'), sleep(5000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

// ---------------------------------------------------------------------------
// Stub upstream (OpenAI-compatible)
// ---------------------------------------------------------------------------

const stub = {
  calls: [],
  server: null,
};

function startStub() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
      });
      req.on('end', () => {
        let body = {};
        try {
          body = JSON.parse(raw || '{}');
        } catch {
          // handed back as an invalid body; the gateway will surface it
        }

        stub.calls.push({ path: req.url, auth: req.headers.authorization, body });

        const model = String(body.model || '');
        if (model.endsWith('/flaky')) {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'stub rate limit' } }));
          return;
        }

        const inbound = Array.isArray(body.messages)
          ? body.messages.map((m) => String(m.content ?? '')).join('\n')
          : '';
        const content = inbound.includes('INBOUND_CHECK')
          ? 'here is the key api_key=sk-live-0123456789abcdefghij'
          : 'STUB_OK';

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: 'chatcmpl-stub',
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [{
            index: 0,
            message: { role: 'assistant', content },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }));
      });
    });

    server.once('error', reject);
    server.listen(PORTS.stub, '127.0.0.1', () => resolve(server));
  });
}

function writeCatalogues(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const entry = (name, score) => ({
    name,
    base_url: `http://127.0.0.1:${PORTS.stub}/v1`,
    api_key_env: 'STUB_UPSTREAM_KEY',
    score,
  });

  const catalogues = {
    // flaky first so the gateway's failover path is guaranteed to run.
    coding: [entry('stub/flaky', 99), entry('stub/good', 90)],
    general: [entry('stub/good', 80)],
    reasoning: [entry('stub/good', 80)],
    vision: [entry('stub/good', 80)],
  };

  for (const [task, models] of Object.entries(catalogues)) {
    fs.writeFileSync(
      path.join(dir, `${task}.json`),
      JSON.stringify(models, null, 2),
      'utf8'
    );
  }
}

// ---------------------------------------------------------------------------
// Tests — Redactor alone
// ---------------------------------------------------------------------------

async function testRedactorAlone() {
  section('Redactor (alone)');

  await check('GET /health reports ok', async () => {
    const res = await request(`${URLS.redactor}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 'ok', service: 'redactor' });
  });

  await check('default policy masks a password value', async () => {
    const res = await jsonRequest(`${URLS.redactor}/redact`, {
      text: 'config password=hunter2',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.maskedText, 'config password=[PASSWORD]');
    assert.equal(res.body.blocked, false);
    assert.ok(
      res.body.detections.some((d) => d.ruleId === 'password' && d.action === 'mask'),
      'expected a password detection'
    );
    assert.ok(!res.body.maskedText.includes('hunter2'));
  });

  await check('custom rule masks every email match', async () => {
    const res = await jsonRequest(`${URLS.redactor}/redact`, {
      text: 'a@x.co and b@y.co',
      rules: [{
        id: 'email',
        pattern: '\\b[\\w.+-]+@[\\w-]+\\.[\\w.-]+\\b',
        category: 'email',
        severity: 'medium',
        action: 'mask',
      }],
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.maskedText, '[EMAIL] and [EMAIL]');
    assert.equal(res.body.detections.length, 2);
  });

  await check('block policy returns 200 + blocked:true (documented contract)', async () => {
    const res = await jsonRequest(`${URLS.redactor}/redact`, {
      text: 'this is forbidden',
      rules: [{ id: 'kw', pattern: 'forbidden', category: 'kw', severity: 'high', action: 'block' }],
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.blocked, true);
    assert.equal(res.body.detections[0].action, 'block');
  });

  await check('default policy flags a private key as blocked', async () => {
    const res = await jsonRequest(`${URLS.redactor}/redact`, { text: PEM });
    assert.equal(res.status, 200);
    assert.equal(res.body.blocked, true);
    assert.ok(
      res.body.detections.some((d) => d.ruleId === 'private-key' && d.action === 'block'),
      'expected the private-key block rule to fire'
    );
  });

  await check('missing text returns 400', async () => {
    const res = await jsonRequest(`${URLS.redactor}/redact`, {});
    assert.equal(res.status, 400);
    assert.match(res.body.error, /text/i);
  });

  await check('invalid policy returns 400', async () => {
    const res = await jsonRequest(`${URLS.redactor}/redact`, {
      text: 'hello',
      rules: [{ action: 'mask' }],
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });
}

// ---------------------------------------------------------------------------
// Tests — Prior-router gateway alone
// ---------------------------------------------------------------------------

const gatewayAuth = { Authorization: `Bearer ${GATEWAY_KEY}` };

async function gatewayChat(body, { auth = true, timeout = 30_000 } = {}) {
  return jsonRequest(`${URLS.gateway}/v1/chat/completions`, body, {
    headers: auth ? gatewayAuth : {},
    timeout,
  });
}

async function testGatewayAlone() {
  section('Prior-router gateway (alone)');

  await check('GET /healthz reports ok', async () => {
    const res = await request(`${URLS.gateway}/healthz`);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
  });

  await check('GET /readyz has loaded the catalogue', async () => {
    const res = await request(`${URLS.gateway}/readyz`);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ready');
  });

  await check('chat without a gateway key returns 401', async () => {
    const res = await gatewayChat({ model: 'router/auto', messages: [] }, { auth: false });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.type, 'authentication_error');
  });

  await check('chat with the wrong gateway key returns 401', async () => {
    const res = await jsonRequest(
      `${URLS.gateway}/v1/chat/completions`,
      { model: 'router/auto', messages: [] },
      { headers: { Authorization: 'Bearer wrong-key' } }
    );
    assert.equal(res.status, 401);
  });

  await check('GET /v1/models lists router/auto and concrete models', async () => {
    const res = await request(`${URLS.gateway}/v1/models`, { headers: gatewayAuth });
    assert.equal(res.status, 200);
    const ids = res.body.data.map((m) => m.id);
    assert.ok(ids.includes('router/auto'));
    assert.ok(ids.includes('stub/good'));
  });

  await check('pinned model routes directly with the default task', async () => {
    const res = await gatewayChat({
      model: 'stub/good',
      messages: [{ role: 'user', content: 'hi' }],
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-router-model'), 'stub/good');
    assert.equal(res.headers.get('x-router-task'), 'general');
    assert.equal(res.body.choices[0].message.content, 'STUB_OK');
  });

  await check('router/auto:reasoning selects the reasoning chain', async () => {
    const res = await gatewayChat({
      model: 'router/auto:reasoning',
      messages: [{ role: 'user', content: 'hi' }],
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-router-task'), 'reasoning');
    assert.equal(res.headers.get('x-router-model'), 'stub/good');
  });

  await check('coding chain fails over from 429 to the next model', async () => {
    const res = await gatewayChat({
      model: 'router/auto:coding',
      messages: [{ role: 'user', content: 'hi' }],
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-router-model'), 'stub/good');
    assert.equal(res.headers.get('x-router-task'), 'coding');
    assert.equal(res.headers.get('x-router-hops'), '1');
    assert.equal(res.headers.get('x-router-attempts'), 'stub/flaky');
  });

  await check('unknown model returns 400 without calling upstream', async () => {
    const before = stub.calls.length;
    const res = await gatewayChat({
      model: 'no/such-model',
      messages: [{ role: 'user', content: 'hi' }],
    });
    assert.equal(res.status, 400);
    assert.equal(stub.calls.length, before);
  });

  await check('streaming request returns 501', async () => {
    const res = await gatewayChat({
      model: 'router/auto',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
    });
    assert.equal(res.status, 501);
  });

  await check('GET /v1/router/status exposes the chains', async () => {
    const res = await request(`${URLS.gateway}/v1/router/status`, { headers: gatewayAuth });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.tasks.coding, ['stub/flaky', 'stub/good']);
  });
}

// ---------------------------------------------------------------------------
// Tests — Backend server alone
// ---------------------------------------------------------------------------

async function testServerAlone(token, email) {
  section('Backend server (alone)');

  await check('GET /health reports ok', async () => {
    const res = await request(`${URLS.server}/health`);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
  });

  await check('chat without a JWT returns 401', async () => {
    const res = await jsonRequest(`${URLS.server}/api/chat`, {
      messages: [{ role: 'user', content: 'hello' }],
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'Missing token');
  });

  await check('registration returns a JWT and the public user', async () => {
    assert.ok(token, `registration failed for ${email}`);
    const res = await request(`${URLS.server}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, email);
    assert.equal(res.body.user.passwordHash, undefined);
  });

  await check('conversation create / list / get / delete', async () => {
    const created = await jsonRequest(
      `${URLS.server}/api/conversations`,
      { title: 'Workflow integration chat' },
      { token }
    );
    assert.equal(created.status, 201);
    const id = created.body.conversation._id;
    assert.ok(id);

    const listed = await request(`${URLS.server}/api/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(listed.status, 200);
    assert.ok(listed.body.conversations.some((c) => c._id === id));

    const fetched = await request(`${URLS.server}/api/conversations/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.conversation.title, 'Workflow integration chat');

    const deleted = await request(`${URLS.server}/api/conversations/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(deleted.status, 200);

    const gone = await request(`${URLS.server}/api/conversations/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(gone.status, 404);
  });

  await check('chat with an empty messages[] returns 400', async () => {
    const res = await jsonRequest(`${URLS.server}/api/chat`, { messages: [] }, { token });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /messages/i);
  });

  await check('unknown route returns JSON 404', async () => {
    const res = await request(`${URLS.server}/api/does-not-exist`);
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'Not found');
  });
}

// ---------------------------------------------------------------------------
// Tests — Full workflow
// ---------------------------------------------------------------------------

async function testWorkflowTogether(token) {
  section('Workflow together (server -> redactor -> gateway -> upstream)');

  await check('masks secrets before the gateway and routes to a coding model', async () => {
    const before = stub.calls.length;
    const res = await jsonRequest(
      `${URLS.server}/api/chat`,
      {
        task: 'coding',
        messages: [{
          role: 'user',
          content: `Reply OK. Ignore this config: api_key=${SECRET_KEY} db=${DB_URI}`,
        }],
      },
      { token }
    );

    assert.equal(res.status, 200, JSON.stringify(res.body));
    const report = res.body.redactor_report;
    assert.equal(report.blocked, false);
    assert.equal(report.redacted_message_count, 1);
    assert.ok(report.detections.length >= 2, 'expected api_key + db-url detections');

    // Secrets are gone from the response...
    const serialized = JSON.stringify(res.body);
    assert.ok(!serialized.includes(SECRET_KEY), 'raw API key leaked in response');
    assert.ok(!serialized.includes('SuperSecretPass'), 'raw DB password leaked in response');

    // ...and gone from what actually crossed the network to the upstream.
    // The coding chain always tries stub/flaky (429) before stub/good, so a
    // health round-trip is exactly two upstream calls.
    const newCalls = stub.calls.slice(before);
    assert.equal(newCalls.length, 2, 'expected the failover chain to make 2 calls');
    assert.equal(newCalls[0].body.model, 'stub/flaky');
    assert.equal(newCalls[1].body.model, 'stub/good');

    for (const call of newCalls) {
      const upstreamBody = JSON.stringify(call.body);
      assert.ok(!upstreamBody.includes(SECRET_KEY), 'raw API key reached the upstream');
      assert.ok(!upstreamBody.includes('SuperSecretPass'), 'raw DB password reached the upstream');
      assert.ok(upstreamBody.includes('[API_KEY]'));
      assert.ok(upstreamBody.includes('[CONNECTION_STRING]'));
      assert.equal(call.auth, `Bearer ${STUB_KEY}`);
    }

    // Router headers and payload are relayed to the client.
    assert.equal(res.headers.get('x-router-task'), 'coding');
    assert.equal(res.headers.get('x-router-model'), 'stub/good');
    assert.equal(res.headers.get('x-router-hops'), '1');
    assert.equal(res.body.choices[0].message.content, 'STUB_OK');
  });

  await check('blocked content is rejected with 422 and never reaches the gateway', async () => {
    const before = stub.calls.length;
    const res = await jsonRequest(
      `${URLS.server}/api/chat`,
      {
        messages: [{ role: 'user', content: `Here is my key:\n${PEM}` }],
      },
      { token }
    );

    assert.equal(res.status, 422);
    assert.equal(res.body.code, 'CONTENT_BLOCKED');
    assert.equal(res.body.redactor_report.blocked, true);
    assert.ok(
      res.body.redactor_report.detections.some((d) => d.ruleId === 'private-key'),
      'expected the private-key detection in the report'
    );
    assert.equal(stub.calls.length, before, 'blocked request still reached the upstream');
    assert.ok(
      !stub.calls.some((c) => JSON.stringify(c.body).includes('BEGIN RSA PRIVATE KEY')),
      'private key reached the upstream'
    );
  });

  await check('redact_response masks the assistant reply too', async () => {
    const res = await jsonRequest(
      `${URLS.server}/api/chat`,
      {
        redact_response: true,
        messages: [{ role: 'user', content: 'INBOUND_CHECK' }],
      },
      { token }
    );

    assert.equal(res.status, 200, JSON.stringify(res.body));
    const content = res.body.choices[0].message.content;
    assert.ok(!content.includes('sk-live-0123456789abcdefghij'), 'inbound secret leaked');
    assert.ok(content.includes('[API_KEY]'), 'inbound reply was not masked');
    assert.ok(res.body.redactor_report.inbound.detections.length >= 1);
  });

  await check('gateway outage fails closed with 502 (redaction still reported)', async () => {
    await stopService('gateway');
    const res = await jsonRequest(
      `${URLS.server}/api/chat`,
      { messages: [{ role: 'user', content: 'hello' }] },
      { token }
    );
    assert.equal(res.status, 502);
    assert.equal(res.body.error, 'Router unavailable');
    assert.ok(res.body.redactor_report);
  });

  await check('redactor outage fails closed with 503 (no unredacted forwarding)', async () => {
    await stopService('redactor');
    const res = await jsonRequest(
      `${URLS.server}/api/chat`,
      { messages: [{ role: 'user', content: 'hello' }] },
      { token }
    );
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'REDACTOR_UNAVAILABLE');
  });
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

async function main() {
  const startedAt = Date.now();
  let mongo;
  let stubServer;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-it-'));

  await allocatePorts();

  console.log('Workflow integration tests');
  console.log(`  repo: ${ROOT}`);
  console.log(`  ports: redactor=${PORTS.redactor} gateway=${PORTS.gateway} ` +
              `server=${PORTS.server} stub=${PORTS.stub}`);

  try {
    section('Starting services');
    stubServer = await startStub();
    console.log('  ✓ stub upstream');

    const catalogueDir = path.join(tempDir, 'catalogues');
    writeCatalogues(catalogueDir);

    startService(
      'gateway',
      PYTHON,
      ['-m', 'uvicorn', 'gateway.app:app',
        '--host', '127.0.0.1', '--port', String(PORTS.gateway), '--log-level', 'warning'],
      {
        cwd: ROUTER_DIR,
        env: {
          ...process.env,
          GATEWAY_KEY,
          PORT: String(PORTS.gateway),
          GATEWAY_CATALOGUE_DIR: catalogueDir,
          STUB_UPSTREAM_KEY: STUB_KEY,
          UPSTREAM_TIMEOUT: '10',
        },
      }
    );

    startService(
      'redactor',
      process.execPath,
      ['src/index.js'],
      {
        cwd: REDACTOR_DIR,
        env: { ...process.env, PORT: String(PORTS.redactor), NODE_ENV: 'test' },
      }
    );

    mongo = await MongoMemoryServer.create();
    startService(
      'server',
      process.execPath,
      ['src/index.js'],
      {
        cwd: SERVER_DIR,
        env: {
          ...process.env,
          PORT: String(PORTS.server),
          MONGO_URI: mongo.getUri(),
          JWT_SECRET,
          JWT_EXPIRES_IN: '1h',
          REDACTOR_URL: URLS.redactor,
          GATEWAY_URL: URLS.gateway,
          GATEWAY_KEY,
        },
      }
    );

    await waitFor('redactor', `${URLS.redactor}/health`);
    console.log('  ✓ redactor ready');
    await waitFor('gateway', `${URLS.gateway}/readyz`);
    console.log('  ✓ gateway ready');
    await waitFor('server', `${URLS.server}/health`);
    console.log('  ✓ server ready');

    // One account is shared by the service and workflow suites.
    const email = `workflow_${Date.now()}@example.com`;
    const registration = await jsonRequest(`${URLS.server}/api/auth/register`, {
      email,
      password: 'Password123!',
      name: 'Workflow Tester',
    });
    const token = registration.status === 201 ? registration.body.token : undefined;

    await testRedactorAlone();
    await testGatewayAlone();
    await testServerAlone(token, email);
    await testWorkflowTogether(token);
  } catch (err) {
    console.error(`\nFatal: ${err.message}`);
    for (const [name, child] of Object.entries(services)) {
      const output = serviceLogs(child);
      if (output) console.error(`\n--- ${name} output ---${output}`);
    }
    process.exitCode = 1;
  } finally {
    await Promise.all(Object.keys(services).map((name) => stopService(name)));
    if (stubServer) await new Promise((resolve) => stubServer.close(resolve));
    if (mongo) await mongo.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });

    const passed = results.filter((r) => r.ok).length;
    const failed = results.length - passed;
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

    console.log(`\n${passed} passed, ${failed} failed (${seconds}s)`);
    if (failed > 0) {
      if (!process.exitCode) process.exitCode = 1;
      console.log('\nFailed checks:');
      for (const r of results.filter((x) => !x.ok)) {
        console.log(`  - ${r.name}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
