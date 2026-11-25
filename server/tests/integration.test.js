// server/tests/integration.test.js
const request = require('supertest');
const { registerUser, app } = require('./helpers');
const Policy = require('../src/models/Policy');
const policyService = require('../src/services/policyService');

const REDACTOR_URL = process.env.REDACTOR_URL || 'http://127.0.0.1:4000';
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://127.0.0.1:8090';

let servicesUp = false;
let policies; // the DB rules the chat pipeline sends to the redactor

// The chat route fails closed when no policy is active, so every live test
// seeds the same three rules an admin would configure.
async function seedPolicies() {
  const [block, apiKey, dbUrl] = await Policy.create([
    {
      name: 'Private key',
      pattern: '-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
      category: 'private key',
      severity: 'high',
      action: 'block',
    },
    {
      name: 'API key',
      pattern: 'sk-[A-Za-z0-9_-]{20,}',
      category: 'api key',
      severity: 'high',
      action: 'mask',
    },
    {
      name: 'Database URL',
      pattern: 'postgres(?:ql)?://[^:\\s]+:[^@\\s]+@',
      category: 'db url',
      severity: 'medium',
      action: 'mask',
    },
  ]);
  policyService.invalidate();
  policies = { block, apiKey, dbUrl };
}

beforeAll(async () => {
  try {
    const [redactorRes, gatewayRes] = await Promise.all([
      fetch(`${REDACTOR_URL}/health`, { signal: AbortSignal.timeout(1500) }),
      fetch(`${GATEWAY_URL}/readyz`, { signal: AbortSignal.timeout(1500) }),
    ]);
    servicesUp = redactorRes.ok && gatewayRes.ok;
  } catch {
    servicesUp = false;
  }

  if (!servicesUp && process.env.REQUIRE_LIVE_SERVICES === 'true') {
    throw new Error(
      `Live services required but unreachable (REDACTOR_URL=${REDACTOR_URL}, GATEWAY_URL=${GATEWAY_URL})`
    );
  }
});

const liveTest = (name, fn, timeout = 30_000) =>
  test(
    name,
    async () => {
      if (!servicesUp) {
        console.warn(`⏭️  Skipping "${name}" (redactor or gateway not running)`);
        return;
      }
      await fn();
    },
    timeout
  );

describe('E2E Pipeline Integration (Server -> Redactor -> Prior-Router Gateway)', () => {
  beforeEach(seedPolicies);

  test('rejects unauthenticated requests to /api/chat with 401', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: 'Hello' }] });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Missing token');
  });

  liveTest('blocks private keys with 422 before reaching the LLM gateway', async () => {
    const { body: auth } = await registerUser();

    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${auth.token}`)
      .send({
        messages: [
          {
            role: 'user',
            content:
              'Here is my key:\n-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...',
          },
        ],
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('CONTENT_BLOCKED');
    expect(res.body.redactor_report.blocked).toBe(true);
    expect(res.body.redactor_report.detections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: String(policies.block._id),
          ruleName: 'Private key',
          category: 'PRIVATE_KEY',
          action: 'block',
        }),
      ])
    );
  });

  liveTest(
    'masks secrets via redactor and routes to a coding model via gateway',
    async () => {
      const { body: auth } = await registerUser();
      const secretKey = 'sk-live-99887766554433221100aabb';
      const dbUri = 'postgres://admin:SuperSecretPass@db.internal:5432/prod';

      const res = await request(app)
        .post('/api/chat')
        .set('Authorization', `Bearer ${auth.token}`)
        .send({
          task: 'coding',
          messages: [
            {
              role: 'user',
              content: `Reply with the single word OK. Config: api_key=${secretKey} db=${dbUri}`,
            },
          ],
        });

      expect(res.status).toBe(200);

      // 1. Verify redaction report & ensure raw secrets never appear in the response
      const report = res.body.redactor_report;
      expect(report.blocked).toBe(false);
      expect(report.redacted_message_count).toBe(1);
      expect(report.detections.length).toBeGreaterThanOrEqual(2);

      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain(secretKey);
      expect(serialized).not.toContain('SuperSecretPass');

      // 2. Verify Prior-Router Gateway headers & completion payload
      expect(res.headers['x-router-model']).toBeTruthy();
      expect(res.headers['x-router-task']).toBe('coding');
      expect(res.body.choices?.[0]?.message?.content).toBeTruthy();
    },
    65_000 // free LLM endpoints can take up to 60s
  );
});
