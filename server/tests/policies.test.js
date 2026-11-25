const request = require('supertest');
const mongoose = require('mongoose');

const { app, registerUser } = require('./helpers');
const User = require('../src/models/User');
const Policy = require('../src/models/Policy');
const AuditLog = require('../src/models/AuditLog');
const policyService = require('../src/services/policyService');

// The credentials the environment ships with (seed.js reads the same vars).
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@securechat.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'aaazzzeee';

let admin;

// Register, promote in the DB, then log in again so the JWT carries role=admin.
async function createAdmin(email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  const { res, body } = await registerUser({ email, password, name: 'Admin' });
  expect(res.status).toBe(201);
  await User.findByIdAndUpdate(body.user.id, { role: 'admin' });

  const login = await request(app).post('/api/auth/login').send({ email, password });
  expect(login.status).toBe(200);
  return { token: login.body.token, id: body.user.id, email, password };
}

function auth(token = admin.token) {
  return { Authorization: `Bearer ${token}` };
}

const VALID_POLICY = {
  name: 'API key',
  pattern: 'sk-[a-z0-9]{20,}',
  category: 'api key',
  severity: 'high',
  action: 'mask',
};

beforeEach(async () => {
  policyService.invalidate();          // the cache outlives the collection wipe
  await Policy.init();                 // unique index on name must exist
  admin = await createAdmin();
});

describe('admin access control', () => {
  it('rejects an anonymous request with 401', async () => {
    const res = await request(app).get('/api/policies');
    expect(res.status).toBe(401);
  });

  it('rejects a normal user with 403', async () => {
    const { body } = await registerUser({ email: 'plain@example.com' });
    const res = await request(app).get('/api/policies').set(auth(body.token));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  it('logs the seeded admin in with the current credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
  });

  it('lets the admin list policies', async () => {
    await Policy.create({ ...VALID_POLICY, createdBy: admin.id });
    const res = await request(app).get('/api/policies').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.policies).toHaveLength(1);
    expect(res.body.policies[0].name).toBe('API key');
  });
});

describe('POST /api/policies', () => {
  it('creates a policy, normalises the category and records the author', async () => {
    const res = await request(app).post('/api/policies').set(auth()).send(VALID_POLICY);

    expect(res.status).toBe(201);
    expect(res.body.policy).toMatchObject({
      name: 'API key',
      category: 'API_KEY',
      severity: 'high',
      action: 'mask',
      enabled: true,
      createdBy: admin.id,
    });
  });

  it('rejects an invalid regex with 400 INVALID_PATTERN', async () => {
    const res = await request(app)
      .post('/api/policies')
      .set(auth())
      .send({ ...VALID_POLICY, pattern: '[unclosed' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PATTERN');
    expect(await Policy.countDocuments()).toBe(0);
  });

  it('rejects a pattern that matches the empty string', async () => {
    const res = await request(app)
      .post('/api/policies')
      .set(auth())
      .send({ ...VALID_POLICY, pattern: '^' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PATTERN');
  });

  it('rejects a catastrophic-backtracking pattern', async () => {
    const res = await request(app)
      .post('/api/policies')
      .set(auth())
      .send({ ...VALID_POLICY, pattern: '(a+)+$' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PATTERN');
  });

  it('ignores a spoofed createdBy', async () => {
    const { body } = await registerUser({ email: 'other@example.com' });
    const res = await request(app)
      .post('/api/policies')
      .set(auth())
      .send({ ...VALID_POLICY, createdBy: body.user.id });

    expect(res.status).toBe(201);
    expect(res.body.policy.createdBy).toBe(admin.id);
  });

  it('rejects a duplicate name with 409', async () => {
    await request(app).post('/api/policies').set(auth()).send(VALID_POLICY);
    const res = await request(app).post('/api/policies').set(auth()).send(VALID_POLICY);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE');
  });

  it('writes a policy.create audit row', async () => {
    const res = await request(app).post('/api/policies').set(auth()).send(VALID_POLICY);

    const log = await AuditLog.findOne({ action: 'policy.create' });
    expect(log).not.toBeNull();
    expect(String(log.actorId)).toBe(admin.id);
    expect(log.target).toBe(`policy:${res.body.policy._id}`);
    expect(log.meta).toMatchObject({ name: 'API key', action: 'mask' });
  });
});

describe('PUT /api/policies/:id', () => {
  let policy;

  beforeEach(async () => {
    policy = await Policy.create({ ...VALID_POLICY, createdBy: admin.id });
  });

  it('updates the whitelisted fields', async () => {
    const res = await request(app)
      .put(`/api/policies/${policy._id}`)
      .set(auth())
      .send({ action: 'block', severity: 'low', enabled: false });

    expect(res.status).toBe(200);
    expect(res.body.policy).toMatchObject({ action: 'block', severity: 'low', enabled: false });
  });

  it('refuses to reassign createdBy or _id', async () => {
    const { body } = await registerUser({ email: 'attacker@example.com' });
    const res = await request(app)
      .put(`/api/policies/${policy._id}`)
      .set(auth())
      .send({ name: 'Renamed', createdBy: body.user.id, _id: new mongoose.Types.ObjectId() });

    expect(res.status).toBe(200);
    expect(res.body.policy.name).toBe('Renamed');
    expect(res.body.policy.createdBy).toBe(admin.id);
    expect(res.body.policy._id).toBe(String(policy._id));
  });

  it('rejects an invalid pattern', async () => {
    const res = await request(app)
      .put(`/api/policies/${policy._id}`)
      .set(auth())
      .send({ pattern: '(a+)+$' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PATTERN');
  });

  it('returns 404 for an unknown id and 400 for a malformed one', async () => {
    const missing = await request(app)
      .put(`/api/policies/${new mongoose.Types.ObjectId()}`)
      .set(auth())
      .send({ name: 'Nope' });
    expect(missing.status).toBe(404);

    const malformed = await request(app).put('/api/policies/not-an-id').set(auth()).send({ name: 'Nope' });
    expect(malformed.status).toBe(400);
  });

  it('invalidates the active-policy cache', async () => {
    const before = await policyService.getActive();
    expect(before.rules[0]).toMatchObject({ action: 'mask', category: 'API_KEY' });

    await request(app).put(`/api/policies/${policy._id}`).set(auth()).send({ action: 'block' });

    const after = await policyService.getActive();
    expect(after.rules[0].action).toBe('block');
  });

  it('writes a policy.update audit row naming the changed fields', async () => {
    await request(app).put(`/api/policies/${policy._id}`).set(auth()).send({ severity: 'low' });

    const log = await AuditLog.findOne({ action: 'policy.update' });
    expect(log).not.toBeNull();
    expect(log.meta).toMatchObject({ changed: ['severity'] });
  });
});

describe('PATCH /api/policies/:id/enabled', () => {
  let policy;

  beforeEach(async () => {
    policy = await Policy.create({ ...VALID_POLICY, createdBy: admin.id });
  });

  it('requires a boolean', async () => {
    const res = await request(app)
      .patch(`/api/policies/${policy._id}/enabled`)
      .set(auth())
      .send({ enabled: 'false' });

    expect(res.status).toBe(400);
  });

  it('disables a policy and drops it from the active set', async () => {
    const res = await request(app)
      .patch(`/api/policies/${policy._id}/enabled`)
      .set(auth())
      .send({ enabled: false });

    expect(res.status).toBe(200);
    expect(res.body.policy.enabled).toBe(false);
    expect((await policyService.getActive()).rules).toHaveLength(0);
    expect(await AuditLog.countDocuments({ action: 'policy.toggle' })).toBe(1);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app)
      .patch(`/api/policies/${new mongoose.Types.ObjectId()}/enabled`)
      .set(auth())
      .send({ enabled: true });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/policies/:id', () => {
  it('deletes the policy, its cache entry, and audits the action', async () => {
    const policy = await Policy.create({ ...VALID_POLICY, createdBy: admin.id });
    await policyService.getActive();

    const res = await request(app).delete(`/api/policies/${policy._id}`).set(auth());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
    expect(await Policy.countDocuments()).toBe(0);
    expect((await policyService.getActive()).rules).toHaveLength(0);
    expect(await AuditLog.countDocuments({ action: 'policy.delete' })).toBe(1);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app)
      .delete(`/api/policies/${new mongoose.Types.ObjectId()}`)
      .set(auth());
    expect(res.status).toBe(404);
  });
});

describe('policyService.getActive', () => {
  it('orders rules block, then mask, then warn so a warn rule cannot steal a masked span', async () => {
    await Policy.create({ ...VALID_POLICY, name: 'warn rule', action: 'warn' });
    await Policy.create({ ...VALID_POLICY, name: 'mask rule', action: 'mask' });
    await Policy.create({ ...VALID_POLICY, name: 'block rule', action: 'block' });

    const { rules } = await policyService.getActive();
    expect(rules.map((r) => r.action)).toEqual(['block', 'mask', 'warn']);
    expect(rules[0].id).toEqual(expect.any(String));
    expect(rules[0].pattern).toBe(VALID_POLICY.pattern);
  });

  it('only returns enabled policies', async () => {
    await Policy.create({ ...VALID_POLICY, name: 'on', enabled: true });
    await Policy.create({ ...VALID_POLICY, name: 'off', enabled: false });

    const { rules } = await policyService.getActive();
    expect(rules).toHaveLength(1);
  });
});
