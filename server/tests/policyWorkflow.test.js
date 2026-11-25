const request = require('supertest');

const { app, createAdmin, auth } = require('./helpers');
const { redactMessages, ChatRedactionError } = require('../src/services/redactorPipeline');
const policyService = require('../src/services/policyService');
const { applyRules } = require('../../redactor/src/engine');

// The dashboard talks to /api/policies; the chat pipeline loads the same rows
// and forwards them to the redactor. These tests replace only the HTTP hop to
// the redactor with the real rule engine, so the whole rule -> redactor
// contract (patterns, categories, actions, masking) is exercised.
const realFetch = global.fetch;
let admin;
let redactorCalls;

const realRedactor = () => {
  redactorCalls = [];
  global.fetch = jest.fn(async (_url, init) => {
    const body = JSON.parse(init.body);
    redactorCalls.push(body);
    const result = applyRules(body.text, body.rules);
    return new Response(
      JSON.stringify({
        maskedText: result.maskedText,
        detections: result.detections,
        blocked: result.blocked,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  });
};

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

const send = (content) => redactMessages([{ role: 'user', content }]);

beforeEach(async () => {
  policyService.invalidate(); // the cache outlives the collection wipe
  admin = await createAdmin();
  realRedactor();
});

afterEach(() => {
  global.fetch = realFetch;
});

describe('rule dashboard -> redactor', () => {
  it('masks with a rule added from the dashboard and sends it to the redactor', async () => {
    expect((await createPolicy(EMAIL_RULE)).status).toBe(201);
    const created = await createPolicy(BADGE_RULE);
    expect(created.status).toBe(201);

    const { maskedMessages, report } = await send('mail a@b.co badge EMP-123456');

    expect(maskedMessages[0].content).toBe('mail [EMAIL] badge [EMPLOYEE_ID]');
    expect(report.detections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: String(created.body.policy._id),
          ruleName: 'Employee ID',
          category: 'EMPLOYEE_ID',
          action: 'mask',
        }),
      ])
    );

    // what the backend asked the redactor to apply
    const sentPatterns = redactorCalls.at(-1).rules.map((r) => r.pattern);
    expect(sentPatterns).toEqual(
      expect.arrayContaining([EMAIL_RULE.pattern, BADGE_RULE.pattern])
    );
  });

  it('stops applying a rule removed from the dashboard', async () => {
    await createPolicy(EMAIL_RULE);
    const badge = await createPolicy(BADGE_RULE);

    const before = await send('mail a@b.co badge EMP-123456');
    expect(before.report.detections).toHaveLength(2);

    const del = await deletePolicy(badge.body.policy._id);
    expect(del.status).toBe(200);

    const after = await send('mail a@b.co badge EMP-123456');
    expect(after.maskedMessages[0].content).toBe('mail [EMAIL] badge EMP-123456');
    expect(after.report.detections).toEqual([
      expect.objectContaining({ ruleName: 'Email', action: 'mask' }),
    ]);

    const sentPatterns = redactorCalls.at(-1).rules.map((r) => r.pattern);
    expect(sentPatterns).toContain(EMAIL_RULE.pattern);
    expect(sentPatterns).not.toContain(BADGE_RULE.pattern);

    const list = await request(app).get('/api/policies').set(auth(admin.token));
    expect(list.body.policies).toHaveLength(1);
    expect(list.body.policies[0].name).toBe('Email');
  });

  it('stops applying a rule disabled from the dashboard', async () => {
    await createPolicy(EMAIL_RULE);
    const badge = await createPolicy(BADGE_RULE);

    const toggle = await request(app)
      .patch(`/api/policies/${badge.body.policy._id}/enabled`)
      .set(auth(admin.token))
      .send({ enabled: false });
    expect(toggle.status).toBe(200);

    const { maskedMessages, report } = await send('badge EMP-123456');
    expect(maskedMessages[0].content).toBe('badge EMP-123456');
    expect(report.detections).toHaveLength(0);
  });

  it('rejects content matching a block rule added from the dashboard', async () => {
    await createPolicy(BLOCK_RULE);

    const err = await send('ok BEGIN SECRET token here').catch((e) => e);

    expect(err).toBeInstanceOf(ChatRedactionError);
    expect(err.status).toBe(422);
    expect(err.code).toBe('CONTENT_BLOCKED');
    expect(err.details.detections[0]).toMatchObject({
      ruleName: 'Secret header',
      action: 'block',
    });
  });

  it('fails closed when removing the last rule leaves no active policy', async () => {
    const created = await createPolicy(EMAIL_RULE);
    await deletePolicy(created.body.policy._id);

    await expect(send('anything')).rejects.toMatchObject({
      status: 503,
      code: 'NO_ACTIVE_POLICIES',
    });
    expect(redactorCalls).toHaveLength(0);
  });
});
