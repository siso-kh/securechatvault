// End-to-end workflow against the running services:
// admin dashboard -> policies -> server -> redactor -> gateway -> history.
//
// Skipped automatically when the redactor or gateway is down, unless
// REQUIRE_LIVE_SERVICES=true (npm run test:integration).
const request = require('supertest');

const { app, registerUser, createAdmin, auth } = require('./helpers');
const policyService = require('../src/services/policyService');

const REDACTOR_URL = process.env.REDACTOR_URL || 'http://127.0.0.1:4000';
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://127.0.0.1:8090';

let servicesUp = false;
let admin;

beforeAll(async () => {
  try {
    const [redactor, gateway] = await Promise.all([
      fetch(`${REDACTOR_URL}/health`, { signal: AbortSignal.timeout(1500) }),
      fetch(`${GATEWAY_URL}/readyz`, { signal: AbortSignal.timeout(1500) }),
    ]);
    servicesUp = redactor.ok && gateway.ok;
  } catch {
    servicesUp = false;
  }

  if (!servicesUp && process.env.REQUIRE_LIVE_SERVICES === 'true') {
    throw new Error(
      `Live services required but unreachable (REDACTOR_URL=${REDACTOR_URL}, GATEWAY_URL=${GATEWAY_URL})`
    );
  }
});

beforeEach(async () => {
  policyService.invalidate(); // the cache outlives the collection wipe
  admin = await createAdmin();
});

const liveTest = (name, fn, timeout = 65_000) =>
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

const EMAIL_RULE = {
  name: 'Email',
  pattern: '[\\w.+-]+@[\\w-]+\\.[\\w.]+',
  category: 'email',
  severity: 'low',
  action: 'mask',
};

const BADGE_RULE = {
  name: 'Employee ID',
  pattern: 'EMP-\\d{6}',
  category: 'employee id',
  severity: 'medium',
  action: 'mask',
};

const BLOCK_RULE = {
  name: 'Secret header',
  pattern: 'BEGIN SECRET',
  category: 'secret',
  severity: 'high',
  action: 'block',
};

const createPolicy = (rule) =>
  request(app).post('/api/policies').set(auth(admin.token)).send(rule);

const deletePolicy = (id) =>
  request(app).delete(`/api/policies/${id}`).set(auth(admin.token));

const chat = (token, content, extra = {}) =>
  request(app)
    .post('/api/chat')
    .set(auth(token))
    .send({ messages: [{ role: 'user', content }], ...extra });

describe('admin policy -> redactor -> chat workflow', () => {
  liveTest('a rule added by an admin masks a chat and its saved history', async () => {
    expect((await createPolicy(EMAIL_RULE)).status).toBe(201);
    const badge = await createPolicy(BADGE_RULE);
    expect(badge.status).toBe(201);

    const { body: session } = await registerUser();
    const res = await chat(session.token, 'mail a@b.co badge EMP-654321');

    expect(res.status).toBe(200);
    expect(res.headers['x-router-model']).toBeTruthy();

    const report = res.body.redactor_report;
    expect(report.blocked).toBe(false);
    expect(report.detections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: String(badge.body.policy._id),
          ruleName: 'Employee ID',
          action: 'mask',
        }),
      ])
    );

    expect(res.body.masked_messages[0].content).toContain('[EMPLOYEE_ID]');
    expect(JSON.stringify(res.body)).not.toContain('EMP-654321');

    // The stored conversation keeps the masked text, not the raw badge id.
    expect(res.body.conversation_id).toBeTruthy();
    const history = await request(app)
      .get(`/api/conversations/${res.body.conversation_id}`)
      .set(auth(session.token));
    expect(history.status).toBe(200);

    const stored = history.body.conversation.messages[0];
    expect(stored.content).toContain('[EMPLOYEE_ID]');
    expect(stored.content).not.toContain('EMP-654321');

    // Removing the rule from the dashboard stops masking it.
    expect((await deletePolicy(badge.body.policy._id)).status).toBe(200);

    const after = await chat(session.token, 'mail a@b.co badge EMP-654321');
    expect(after.status).toBe(200);
    expect(after.body.masked_messages[0].content).toContain('[EMAIL]');
    expect(after.body.redactor_report.detections).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ ruleName: 'Employee ID' })])
    );

    // The admin actions are in the audit trail.
    const audit = await request(app).get('/api/audit').set(auth(admin.token));
    expect(audit.status).toBe(200);
    const actions = audit.body.logs.map((l) => l.action);
    expect(actions.filter((a) => a === 'policy.create')).toHaveLength(2);
    expect(actions.filter((a) => a === 'policy.delete')).toHaveLength(1);
  });

  liveTest('the report reflects the masked message', async () => {
    await createPolicy(EMAIL_RULE);
    await createPolicy(BADGE_RULE);

    const { body: session } = await registerUser();
    const res = await chat(session.token, 'badge EMP-111222 mail a@b.co');
    expect(res.status).toBe(200);

    const report = await request(app).get('/api/stats/me').set(auth(session.token));
    expect(report.status).toBe(200);
    expect(report.body.totals).toMatchObject({ messagesSent: 1, protectedCount: 1 });
    expect(report.body.items[0]).toMatchObject({ status: 'masked' });
    expect(report.body.items[0].categories).toEqual(
      expect.arrayContaining(['EMAIL', 'EMPLOYEE_ID'])
    );
  });

  liveTest('a block rule added by an admin rejects the chat with 422', async () => {
    await createPolicy(BLOCK_RULE);

    const { body: session } = await registerUser();
    const res = await chat(session.token, 'BEGIN SECRET do-not-forward');

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('CONTENT_BLOCKED');
    expect(res.body.redactor_report.blocked).toBe(true);
    expect(res.body.redactor_report.detections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleName: 'Secret header', action: 'block' }),
      ])
    );
  });
});
