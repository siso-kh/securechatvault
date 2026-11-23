#!/usr/bin/env node
'use strict';

/**
 * Local development stack launcher.
 *
 * Starts the three services the backend needs:
 *   1. prior-router gateway  (Python, default http://127.0.0.1:8090)
 *   2. redactor              (Node,   default http://127.0.0.1:4000)
 *   3. backend server        (Node,   default http://127.0.0.1:5000)
 *
 * Already-running gateway/redactor instances are reused. The server is always
 * started by this process. Ctrl+C stops every service this script started.
 *
 * Run from server/:
 *   npm start
 *
 * Start only the API (the old behavior):
 *   npm run start:server
 *
 * Ports and URLs come from server/.env, with process environment variables
 * taking precedence. The gateway reads provider keys from prior-router/.env.
 */

const { spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { once } = require('node:events');
const dotenv = require('dotenv');

const ROOT = path.resolve(__dirname, '../..');
const SERVER_DIR = path.join(ROOT, 'server');
const REDACTOR_DIR = path.join(ROOT, 'redactor');
const ROUTER_DIR = path.join(ROOT, 'prior-router');
const CATALOGUE_DIR = path.join(ROUTER_DIR, 'gateway', 'catalogues');
const TASKS = ['general', 'coding', 'reasoning', 'vision'];

dotenv.config({ path: path.join(SERVER_DIR, '.env'), quiet: true });

const gatewayUrl = stripTrailingSlash(process.env.GATEWAY_URL || 'http://127.0.0.1:8090');
const redactorUrl = stripTrailingSlash(process.env.REDACTOR_URL || 'http://127.0.0.1:4000');
const serverPort = Number(process.env.PORT || 5000);
const serverUrl = `http://127.0.0.1:${serverPort}`;

const started = {};
let supervise = false;
let shuttingDown = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function stripTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

function isLocalUrl(value) {
  try {
    const hostname = new URL(value).hostname;
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
  } catch {
    return false;
  }
}

function portFromUrl(value, name) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('unsupported protocol');
    }
    return Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
  } catch {
    throw new Error(`${name} must be an http(s) URL, got ${value}`);
  }
}

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

function checkCatalogues() {
  if (!fs.existsSync(CATALOGUE_DIR)) {
    throw new Error(
      `Catalogue directory not found: ${CATALOGUE_DIR}\n` +
      'Build it first: cd prior-router && .venv/Scripts/python.exe -m gateway.build_catalogues'
    );
  }

  const missing = TASKS.filter(
    (task) => !fs.existsSync(path.join(CATALOGUE_DIR, `${task}.json`))
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing catalogue(s): ${missing.join(', ')}\n` +
      'Build them: cd prior-router && .venv/Scripts/python.exe -m gateway.build_catalogues'
    );
  }
}

async function isHealthy(url, timeout = 1500) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    return res.ok;
  } catch {
    return false;
  }
}

function probeBind(port, host) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.once('listening', () => probe.close(() => resolve()));
    probe.listen(port, host);
  });
}

// Node listens on IPv6 by default on Windows, which also reserves the IPv4
// wildcard. Checking only 127.0.0.1 reports the port as free while another
// server is still using it, so probe both wildcard families.
async function isPortInUse(port, hosts = ['0.0.0.0', '::']) {
  for (const host of hosts) {
    try {
      await probeBind(port, host);
    } catch (err) {
      if (err.code === 'EADDRINUSE') return true;
      if (err.code === 'EAFNOSUPPORT' || err.code === 'EADDRNOTAVAIL') continue;
      throw err;
    }
  }
  return false;
}

function start(name, command, args, options) {
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });

  const lines = [];
  const readers = [];
  const collect = (stream) => {
    const reader = readline.createInterface({ input: stream });
    readers.push(reader);
    reader.on('line', (line) => {
      lines.push(line);
      if (lines.length > 300) lines.shift();
      console.log(`[${name}] ${line}`);
    });
  };
  collect(child.stdout);
  collect(child.stderr);

  child.readers = readers;
  child.logs = () => lines.join('\n');
  child.on('error', (err) => {
    child.spawnError = err;
    console.error(`[stack] failed to start ${name}: ${err.message}`);
  });
  child.on('exit', (code, signal) => {
    if (!supervise || shuttingDown) return;
    console.error(`\n[stack] ${name} exited (code=${code}, signal=${signal}); stopping the stack`);
    stopAll(code ?? 1);
  });

  started[name] = child;
  return child;
}

async function waitFor(name, url, child, timeout = 45_000) {
  const deadline = Date.now() + timeout;
  let lastError = 'no response';

  while (Date.now() < deadline) {
    if (child?.spawnError) {
      throw new Error(`${name} failed to start: ${child.spawnError.message}`);
    }
    if (child && child.exitCode !== null) {
      throw new Error(`${name} exited with code ${child.exitCode}\n${child.logs()}`);
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

  throw new Error(`${name} was not ready at ${url} (${lastError})\n${child ? child.logs() : ''}`);
}

async function validateGatewayKey() {
  const key = process.env.GATEWAY_KEY;
  if (!key) {
    throw new Error('GATEWAY_KEY is missing from server/.env');
  }

  const res = await fetch(`${gatewayUrl}/v1/models`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(3000),
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      'The gateway is running but rejects GATEWAY_KEY. ' +
      'Use the same key in server/.env and prior-router/.env, or stop the gateway and run npm start again.'
    );
  }
  if (!res.ok) {
    throw new Error(`Gateway auth check failed with HTTP ${res.status}`);
  }
}

async function stopAll(code) {
  if (shuttingDown) return;
  shuttingDown = true;

  const alive = Object.entries(started).filter(([, child]) => child.exitCode === null);
  if (alive.length > 0) {
    console.log(`[stack] stopping ${alive.map(([name]) => name).join(', ')}...`);
    const exits = alive.map(([, child]) => once(child, 'exit'));
    for (const [, child] of alive) child.kill();
    await Promise.race([Promise.all(exits), sleep(4000)]);
    for (const [, child] of alive) {
      if (child.exitCode === null) child.kill('SIGKILL');
    }
    await sleep(250);
  }

  for (const child of Object.values(started)) {
    for (const reader of child.readers || []) reader.close();
  }

  // Let the event loop drain instead of calling process.exit(): forcing exit
  // while libuv is closing child/readline handles asserts on Windows.
  process.exitCode = code;
}

async function main() {
  checkCatalogues();

  if (!Number.isInteger(serverPort) || serverPort <= 0 || serverPort > 65535) {
    throw new Error(`PORT must be a valid TCP port, got ${process.env.PORT}`);
  }

  const gatewayPort = portFromUrl(gatewayUrl, 'GATEWAY_URL');
  const redactorPort = portFromUrl(redactorUrl, 'REDACTOR_URL');

  if (await isHealthy(`${gatewayUrl}/readyz`)) {
    console.log(`[stack] gateway already ready at ${gatewayUrl}; reusing it`);
  } else {
    if (!isLocalUrl(gatewayUrl)) {
      throw new Error(`Gateway is not reachable at ${gatewayUrl} and is not a local URL`);
    }
    if (await isPortInUse(gatewayPort, ['127.0.0.1'])) {
      throw new Error(
        `Port ${gatewayPort} is in use, but ${gatewayUrl}/readyz is not healthy. ` +
        'Stop that process or change GATEWAY_URL.'
      );
    }
    if (!process.env.GATEWAY_KEY) {
      throw new Error('GATEWAY_KEY is missing from server/.env');
    }

    console.log(`[stack] starting gateway on ${gatewayUrl}`);
    start(
      'gateway',
      resolvePython(),
      ['-m', 'uvicorn', 'gateway.app:app',
        '--host', '127.0.0.1', '--port', String(gatewayPort), '--log-level', 'info'],
      {
        cwd: ROUTER_DIR,
        env: {
          ...process.env,
          PORT: String(gatewayPort),
          GATEWAY_KEY: process.env.GATEWAY_KEY,
          GATEWAY_CATALOGUE_DIR: CATALOGUE_DIR,
        },
      }
    );
  }

  if (await isHealthy(`${redactorUrl}/health`)) {
    console.log(`[stack] redactor already healthy at ${redactorUrl}; reusing it`);
  } else {
    if (!isLocalUrl(redactorUrl)) {
      throw new Error(`Redactor is not reachable at ${redactorUrl} and is not a local URL`);
    }
    if (await isPortInUse(redactorPort)) {
      throw new Error(
        `Port ${redactorPort} is in use, but ${redactorUrl}/health is not healthy. ` +
        'Stop that process or change REDACTOR_URL.'
      );
    }

    console.log(`[stack] starting redactor on ${redactorUrl}`);
    start('redactor', process.execPath, ['src/index.js'], {
      cwd: REDACTOR_DIR,
      env: { ...process.env, PORT: String(redactorPort) },
    });
  }

  await waitFor('gateway', `${gatewayUrl}/readyz`, started.gateway);
  await validateGatewayKey();
  await waitFor('redactor', `${redactorUrl}/health`, started.redactor);

  if (await isPortInUse(serverPort)) {
    throw new Error(
      `Port ${serverPort} is already in use. Stop the existing server or set PORT to another value.`
    );
  }

  console.log(`[stack] starting server on ${serverUrl}`);
  start('server', process.execPath, ['src/index.js'], {
    cwd: SERVER_DIR,
    env: { ...process.env, PORT: String(serverPort) },
  });

  await waitFor('server', `${serverUrl}/health`, started.server);

  supervise = true;
  console.log('\n[stack] ready');
  console.log(`  gateway   ${gatewayUrl}`);
  console.log(`  redactor  ${redactorUrl}`);
  console.log(`  server    ${serverUrl}`);
  console.log('[stack] press Ctrl+C to stop the services started here\n');
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

main().catch(async (err) => {
  console.error(`\n[stack] ${err.message}`);
  await stopAll(1);
});
