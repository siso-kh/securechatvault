#!/usr/bin/env node
'use strict';

/**
 * Full-pipeline smoke test.
 *
 * Starts the redactor, the prior-router gateway (using the real catalogues and
 * provider keys), and the backend server (with in-memory MongoDB), then sends
 * one authenticated chat message through POST /api/chat and prints the HTTP
 * status, router headers, and full JSON response.
 *
 * Run from the repository root:
 *   node server/scripts/full_pipeline_test.js
 *
 * Or from server/:
 *   node scripts/full_pipeline_test.js
 *
 * Optional environment variables:
 *   FULL_TEST_MESSAGE       Message sent to the backend
 *   FULL_TEST_TASK          Router task (default: coding)
 *   FULL_TEST_TIMEOUT_MS    Request timeout (default: 120000)
 *   PYTHON                  Python interpreter for the gateway
 *   FULL_TEST_REDACTOR_PORT Fixed redactor port
 *   FULL_TEST_GATEWAY_PORT  Fixed gateway port
 *   FULL_TEST_SERVER_PORT   Fixed server port
 *
 * The gateway reads provider credentials from prior-router/.env; the server
 * uses the existing server/.env for anything not overridden here. Services are
 * always stopped when the script exits.
 */

const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { MongoMemoryServer } = require('mongodb-memory-server');

const ROOT = path.resolve(__dirname, '../..');
const SERVER_DIR = path.join(ROOT, 'server');
const REDACTOR_DIR = path.join(ROOT, 'redactor');
const ROUTER_DIR = path.join(ROOT, 'prior-router');
const CATALOGUE_DIR = path.join(ROUTER_DIR, 'gateway', 'catalogues');

const GATEWAY_KEY = 'full-pipeline-gateway-key';
const JWT_SECRET = 'full-pipeline-jwt-secret';

const DEFAULT_MESSAGE =
  'My deploy failed. Reply with exactly: BACKEND PIPELINE OK. ' +
  'Debug context: api_key=sk-live-1234567890abcdef';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const children = {};
const ports = {};
const urls = {};

function resolvePython() {
  if (process.env.PYTHON) return process.env.PYTHON;

  const venvPython = path.join(
    ROUTER_DIR,
    '.venv',
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'
  );
  if (fs.existsSync(venvPython)) return venvPython;

  return process.platform === 'win32' ? 'python' : 'python3';
}

async function allocatePorts() {
  const overrides = {
    redactor: process.env.FULL_TEST_REDACTOR_PORT,
    gateway: process.env.FULL_TEST_GATEWAY_PORT,
    server: process.env.FULL_TEST_SERVER_PORT,
  };

  // Keep every probe open until all free ports are chosen, so the OS cannot
  // hand out the same port twice. Close them only after the set is fixed.
  const probes = [];
  for (const [name, override] of Object.entries(overrides)) {
    if (override) {
      ports[name] = Number(override);
      continue;
    }

    const probe = http.createServer();
    probes.push(probe);
    await new Promise((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(0, '127.0.0.1', resolve);
    });
    ports[name] = probe.address().port;
  }

  await Promise.all(
    probes.map((probe) => new Promise((resolve) => probe.close(resolve)))
  );

  urls.redactor = `http://127.0.0.1:${ports.redactor}`;
  urls.gateway = `http://127.0.0.1:${ports.gateway}`;
  urls.server = `http://127.0.0.1:${ports.server}`;
}

function startService(name, command, args, options) {
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });

  const lines = [];
  const collect = (chunk) => {
    lines.push(chunk.toString());
    if (lines.length > 300) lines.shift();
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  child.on('error', (err) => lines.push(`spawn error: ${err.message}\n`));

  child.logs = () => lines.join('');
  children[name] = child;
  return child;
}

async function waitFor(name, url, timeout = 45_000) {
  const deadline = Date.now() + timeout;
  let lastError = 'no attempt made';

  while (Date.now() < deadline) {
    const child = children[name];
    if (child && child.exitCode !== null) {
      throw new Error(`${name} exited early with code ${child.exitCode}\n${child.logs()}`);
    }

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return;
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err.message;
    }
    await sleep(250);
  }

  throw new Error(`${name} was not ready at ${url} (${lastError})`);
}

async function stopService(name) {
  const child = children[name];
  if (!child || child.exitCode !== null) return;

  child.kill();
  await Promise.race([once(child, 'exit'), sleep(4000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function postJson(url, body, token, timeout = 30_000) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return { status: res.status, headers: res.headers, data };
}

function printServiceLogs() {
  for (const [name, child] of Object.entries(children)) {
    const logs = typeof child.logs === 'function' ? child.logs().trim() : '';
    if (logs) console.error(`\n--- ${name} log ---\n${logs}`);
  }
}

async function main() {
  let mongo;
  let exitCode = 0;

  if (!fs.existsSync(CATALOGUE_DIR)) {
    throw new Error(
      `Catalogue directory not found: ${CATALOGUE_DIR}\n` +
      'Run the prior-router catalogue build first.'
    );
  }

  try {
    await allocatePorts();
    console.log(
      `services: redactor=${ports.redactor} gateway=${ports.gateway} server=${ports.server}`
    );

    startService(
      'gateway',
      resolvePython(),
      ['-m', 'uvicorn', 'gateway.app:app',
        '--host', '127.0.0.1', '--port', String(ports.gateway), '--log-level', 'warning'],
      {
        cwd: ROUTER_DIR,
        env: {
          ...process.env,
          GATEWAY_KEY,
          PORT: String(ports.gateway),
          GATEWAY_CATALOGUE_DIR: CATALOGUE_DIR,
          UPSTREAM_TIMEOUT: '90',
        },
      }
    );

    startService('redactor', process.execPath, ['src/index.js'], {
      cwd: REDACTOR_DIR,
      env: { ...process.env, PORT: String(ports.redactor), NODE_ENV: 'test' },
    });

    mongo = await MongoMemoryServer.create();
    startService('server', process.execPath, ['src/index.js'], {
      cwd: SERVER_DIR,
      env: {
        ...process.env,
        PORT: String(ports.server),
        MONGO_URI: mongo.getUri(),
        JWT_SECRET,
        JWT_EXPIRES_IN: '1h',
        REDACTOR_URL: urls.redactor,
        GATEWAY_URL: urls.gateway,
        GATEWAY_KEY,
      },
    });

    await waitFor('redactor', `${urls.redactor}/health`);
    await waitFor('gateway', `${urls.gateway}/readyz`);
    await waitFor('server', `${urls.server}/health`);

    const email = `full_pipeline_${Date.now()}@example.com`;
    const registration = await postJson(`${urls.server}/api/auth/register`, {
      email,
      password: 'Password123!',
      name: 'Full Pipeline Test',
    });

    if (registration.status !== 201 || !registration.data?.token) {
      throw new Error(
        `registration failed: HTTP ${registration.status} ${JSON.stringify(registration.data)}`
      );
    }

    const token = registration.data.token;
    const task = process.env.FULL_TEST_TASK || 'coding';
    const message = process.env.FULL_TEST_MESSAGE || DEFAULT_MESSAGE;
    const timeout = Number(process.env.FULL_TEST_TIMEOUT_MS || 120_000);

    console.log(`\nmessage (${task}): ${message}`);

    const startedAt = Date.now();
    const result = await postJson(
      `${urls.server}/api/chat`,
      {
        task,
        redact_response: true,
        messages: [{ role: 'user', content: message }],
      },
      token,
      timeout
    );
    const elapsed = Date.now() - startedAt;

    console.log(`\nHTTP ${result.status} in ${elapsed} ms`);
    console.log('router headers:');
    for (const header of ['x-router-task', 'x-router-model', 'x-router-hops', 'x-router-attempts']) {
      console.log(`  ${header}: ${result.headers.get(header)}`);
    }

    console.log('\nresponse body:');
    console.log(JSON.stringify(result.data, null, 2));

    if (result.status !== 200) exitCode = 1;
  } catch (err) {
    console.error(`\nFatal: ${err.message}`);
    printServiceLogs();
    exitCode = 1;
  } finally {
    await Promise.all(Object.keys(children).map(stopService));
    if (mongo) await mongo.stop();
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
