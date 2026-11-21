// server/scripts/e2e_integration_test.js
const assert = require('node:assert/strict');

const SERVER_URL = process.env.SERVER_URL || 'http://127.0.0.1:5000';
const REDACTOR_URL = process.env.REDACTOR_URL || 'http://127.0.0.1:4000';
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://127.0.0.1:8090';

async function checkHealth(name, url) {
  const res = await fetch(url);
  assert.equal(res.status, 200, `${name} health check failed (${res.status})`);
  console.log(`✅ [1/6] ${name} is healthy (${url})`);
}

async function run() {
  console.log('🚀 Starting End-to-End Integration Verification...\n');

  // 1. Verify all 3 services are reachable
  await checkHealth('Redactor', `${REDACTOR_URL}/health`);
  await checkHealth('Prior-Router Gateway', `${GATEWAY_URL}/readyz`);
  await checkHealth('Backend Server', `${SERVER_URL}/health`);

  // 2. Register a test user and obtain a JWT
  const email = `e2e_${Date.now()}@example.com`;
  const authRes = await fetch(`${SERVER_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'Password123!',
      name: 'E2E Tester',
    }),
  });
  assert.equal(authRes.status, 201, 'User registration failed');
  const { token } = await authRes.json();
  assert.ok(token, 'JWT token missing from registration response');
  console.log(`✅ [2/6] Auth flow verified (registered ${email})`);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // 3. Reject unauthenticated access to /api/chat
  const unauthRes = await fetch(`${SERVER_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
  });
  assert.equal(unauthRes.status, 401, 'Expected 401 without JWT');
  console.log('✅ [3/6] Auth guard verified (401 on missing token)');

  // 4. Test BLOCK policy (Private Key must be stopped with 422 before reaching LLM)
  const blockRes = await fetch(`${SERVER_URL}/api/chat`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      messages: [
        {
          role: 'user',
          content: 'Here is my key:\n-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...',
        },
      ],
    }),
  });
  const blockBody = await blockRes.json();
  assert.equal(
    blockRes.status,
    422,
    `Expected 422 CONTENT_BLOCKED, got ${blockRes.status}: ${JSON.stringify(blockBody)}`
  );
  assert.equal(blockBody.code, 'CONTENT_BLOCKED');
  console.log('✅ [4/6] Block policy verified (private key stopped with 422 before LLM)');

  // 5. Test MASK policy + LLM Gateway Routing
  const secretKey = 'sk-live-99887766554433221100aabb';
  const dbUri = 'postgres://admin:SuperSecretPass@db.internal:5432/prod';
  const chatRes = await fetch(`${SERVER_URL}/api/chat`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      task: 'coding',
      messages: [
        {
          role: 'user',
          content: `Reply with the single word OK. Ignore this config: api_key=${secretKey} db=${dbUri}`,
        },
      ],
    }),
  });
  const chatBody = await chatRes.json();
  assert.equal(
    chatRes.status,
    200,
    `Expected 200 from chat pipeline, got ${chatRes.status}: ${JSON.stringify(chatBody)}`
  );

  // Verify redaction report and ensure raw secrets are absent
  const report = chatBody.redactor_report;
  assert.equal(report.blocked, false);
  assert.equal(report.redacted_message_count, 1);
  assert.ok(report.detections.length >= 2, 'Expected at least 2 detections (api_key + db-url)');
  assert.ok(!JSON.stringify(chatBody).includes(secretKey), 'Raw API key leaked in response!');
  assert.ok(!JSON.stringify(chatBody).includes('SuperSecretPass'), 'Raw DB password leaked!');

  // Verify Prior-Router headers were relayed
  const routedModel = chatRes.headers.get('x-router-model');
  const routedTask = chatRes.headers.get('x-router-task');
  assert.ok(routedModel, 'Missing X-Router-Model header from gateway');
  assert.equal(routedTask, 'coding');
  assert.ok(chatBody.choices?.[0]?.message?.content, 'Missing assistant reply content');

  console.log(
    `✅ [5/6] Mask + Gateway routing verified (task=${routedTask}, model=${routedModel}, detections=${report.detections.length})`
  );

  // 6. Test Conversation CRUD persistence
  const convRes = await fetch(`${SERVER_URL}/api/conversations`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ title: 'Integration Test Chat' }),
  });
  assert.equal(convRes.status, 201);
  const { conversation } = await convRes.json();

  const delRes = await fetch(`${SERVER_URL}/api/conversations/${conversation._id}`, {
    method: 'DELETE',
    headers: authHeaders,
  });
  assert.equal(delRes.status, 200);
  console.log('✅ [6/6] Conversation CRUD verified');

  console.log('\n🎉 All 6 end-to-end integration checks passed!');
}

run().catch((err) => {
  console.error('\n❌ Integration test failed:', err.message);
  process.exit(1);
});
