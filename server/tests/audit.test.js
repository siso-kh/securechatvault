const request = require('supertest');
const mongoose = require('mongoose');

const { app, registerUser, createAdmin, auth } = require('./helpers');
const AuditLog = require('../src/models/AuditLog');

const VALID_POLICY = {
  name: 'Session rule',
  pattern: 'TOKEN-[0-9]{4}',
  category: 'api key',
  severity: 'medium',
  action: 'mask',
};

let admin;

beforeEach(async () => {
  admin = await createAdmin();
});

async function makeUser(email) {
  const { body } = await registerUser({ email, name: 'Audit Target' });
  return body.user;
}

function actionOf(log) {
  return log.action;
}

describe('GET /api/audit', () => {
  it('is admin-only', async () => {
    const { body } = await registerUser({ email: 'peek@example.com' });
    const res = await request(app).get('/api/audit').set(auth(body.token));
    expect(res.status).toBe(403);
  });

  it('returns newest first with the actor attached and no hashes', async () => {
    const policy = await request(app).post('/api/policies').set(auth(admin.token)).send(VALID_POLICY);
    await request(app)
      .put(`/api/policies/${policy.body.policy._id}`)
      .set(auth(admin.token))
      .send({ severity: 'high' });

    const res = await request(app).get('/api/audit').set(auth(admin.token));

    expect(res.status).toBe(200);
    expect(res.body.logs.map(actionOf)).toEqual(['policy.update', 'policy.create']);
    expect(res.body.logs[0].actor).toMatchObject({
      id: admin.id,
      email: admin.email,
      name: 'Admin',
    });
    expect(res.body.logs[0].actor).not.toHaveProperty('passwordHash');
    expect(res.body.logs[0]).toMatchObject({
      id: expect.anything(),
      target: expect.stringMatching(/^policy:/),
      createdAt: expect.any(String),
    });
  });

  it('honours limit (clamped to 200)', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/policies')
        .set(auth(admin.token))
        .send({ ...VALID_POLICY, name: `Rule ${i}`, pattern: `R${i}-[0-9]{3}` });
    }

    const one = await request(app).get('/api/audit?limit=1').set(auth(admin.token));
    expect(one.body.logs).toHaveLength(1);

    const huge = await request(app).get('/api/audit?limit=99999').set(auth(admin.token));
    expect(huge.status).toBe(200);
    expect(huge.body.logs.length).toBeLessThanOrEqual(200);
  });

  it('filters by action and by actor', async () => {
    const policy = await request(app).post('/api/policies').set(auth(admin.token)).send(VALID_POLICY);
    await request(app).delete(`/api/policies/${policy.body.policy._id}`).set(auth(admin.token));

    const onlyDeletes = await request(app)
      .get('/api/audit?action=policy.delete')
      .set(auth(admin.token));
    expect(onlyDeletes.body.logs).toHaveLength(1);
    expect(onlyDeletes.body.logs[0].action).toBe('policy.delete');

    const others = await request(app)
      .get(`/api/audit?actorId=${new mongoose.Types.ObjectId()}`)
      .set(auth(admin.token));
    expect(others.body.logs).toHaveLength(0);
  });
});

describe('audit trail end to end', () => {
  it('records a full admin session: policies, roles, bans and deletion in order', async () => {
    const target = await makeUser('flow-user@example.com');

    const created = await request(app).post('/api/policies').set(auth(admin.token)).send(VALID_POLICY);
    expect(created.status).toBe(201);
    const policyId = created.body.policy._id;

    await request(app)
      .put(`/api/policies/${policyId}`)
      .set(auth(admin.token))
      .send({ action: 'block', severity: 'high' });
    await request(app)
      .patch(`/api/policies/${policyId}/enabled`)
      .set(auth(admin.token))
      .send({ enabled: false });
    await request(app)
      .patch(`/api/users/${target.id}/role`)
      .set(auth(admin.token))
      .send({ role: 'admin' });
    await request(app)
      .patch(`/api/users/${target.id}/ban`)
      .set(auth(admin.token))
      .send({ isBanned: true });
    await request(app).delete(`/api/users/${target.id}`).set(auth(admin.token));
    await request(app).delete(`/api/policies/${policyId}`).set(auth(admin.token));

    const res = await request(app).get('/api/audit').set(auth(admin.token));

    expect(res.body.logs.map(actionOf)).toEqual([
      'policy.delete',
      'user.delete',
      'user.ban',
      'user.role_change',
      'policy.toggle',
      'policy.update',
      'policy.create',
    ]);
    expect(res.body.logs.every((l) => l.actor && l.actor.id === admin.id)).toBe(true);

    const targets = res.body.logs.map((l) => l.target);
    expect(targets.slice(0, 2)).toEqual([`policy:${policyId}`, `user:${target.id}`]);
  });

  it('does not audit rejected admin requests', async () => {
    const bad = await request(app)
      .post('/api/policies')
      .set(auth(admin.token))
      .send({ ...VALID_POLICY, pattern: '(a+)+$' });
    expect(bad.status).toBe(400);

    const user = await makeUser('noop@example.com');
    const badRole = await request(app)
      .patch(`/api/users/${user.id}/role`)
      .set(auth(admin.token))
      .send({ role: 'superuser' });
    expect(badRole.status).toBe(400);

    const selfBan = await request(app)
      .patch(`/api/users/${admin.id}/ban`)
      .set(auth(admin.token))
      .send({ isBanned: true });
    expect(selfBan.status).toBe(400);

    expect(await AuditLog.countDocuments()).toBe(0);
  });

  it('keeps audit rows after the policy or user is deleted', async () => {
    const policy = await request(app).post('/api/policies').set(auth(admin.token)).send(VALID_POLICY);
    await request(app).delete(`/api/policies/${policy.body.policy._id}`).set(auth(admin.token));

    const res = await request(app).get('/api/audit?action=policy.create').set(auth(admin.token));
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.logs[0].meta).toMatchObject({ name: 'Session rule' });
  });
});
