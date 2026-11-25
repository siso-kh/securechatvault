const request = require('supertest');
const mongoose = require('mongoose');

const { app, registerUser, createAdmin, auth } = require('./helpers');
const User = require('../src/models/User');
const AuditLog = require('../src/models/AuditLog');

let admin;
const unknownId = () => new mongoose.Types.ObjectId().toString();

beforeEach(async () => {
  admin = await createAdmin();
});

async function makeUser(email, name = 'Regular User') {
  const { res, body } = await registerUser({ email, name });
  expect(res.status).toBe(201);
  return body.user;
}

describe('GET /api/users', () => {
  it('lists users without password hashes', async () => {
    await makeUser('alice@example.com', 'Alice');
    await makeUser('bob@example.com', 'Bob');

    const res = await request(app).get('/api/users').set(auth(admin.token));

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3); // admin + 2 users
    expect(res.body.users).toHaveLength(3);
    for (const u of res.body.users) {
      expect(u).toHaveProperty('id');
      expect(u).not.toHaveProperty('_id');
      expect(u).not.toHaveProperty('passwordHash');
      expect(u).toMatchObject({ email: expect.any(String), role: expect.any(String) });
    }
  });

  it('searches email and name case-insensitively', async () => {
    await makeUser('alice@example.com', 'Alice');
    await makeUser('bob@example.com', 'Bob');

    const byEmail = await request(app).get('/api/users?search=ALICE@').set(auth(admin.token));
    expect(byEmail.status).toBe(200);
    expect(byEmail.body.users.map((u) => u.email)).toEqual(['alice@example.com']);

    const byName = await request(app).get('/api/users?search=bo').set(auth(admin.token));
    expect(byName.body.total).toBe(1);
    expect(byName.body.users[0].name).toBe('Bob');
  });

  it('treats regex metacharacters in search literally', async () => {
    await makeUser('a.b@example.com', 'Dot');
    await makeUser('axb@example.com', 'X');

    const res = await request(app).get('/api/users?search=a.b').set(auth(admin.token));
    expect(res.body.users.map((u) => u.email)).toEqual(['a.b@example.com']);
  });

  it('honours the limit and clamps it', async () => {
    await makeUser('c@example.com');
    await makeUser('d@example.com');

    const one = await request(app).get('/api/users?limit=1').set(auth(admin.token));
    expect(one.body.users).toHaveLength(1);
    expect(one.body.total).toBe(3); // total is the unpaginated count

    const huge = await request(app).get('/api/users?limit=99999').set(auth(admin.token));
    expect(huge.status).toBe(200);
    expect(huge.body.users.length).toBeLessThanOrEqual(100);
  });
});

describe('PATCH /api/users/:id/role', () => {
  it('promotes a user and the next login carries the admin role', async () => {
    const user = await makeUser('promote@example.com');

    const res = await request(app)
      .patch(`/api/users/${user.id}/role`)
      .set(auth(admin.token))
      .send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'promote@example.com', password: 'Password123!' });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('admin');

    // and that fresh token can now use admin routes
    const policies = await request(app).get('/api/policies').set(auth(login.body.token));
    expect(policies.status).toBe(200);
  });

  it('demotes another admin', async () => {
    const other = await createAdmin({ email: 'second-admin@example.com' });

    const res = await request(app)
      .patch(`/api/users/${other.id}/role`)
      .set(auth(admin.token))
      .send({ role: 'user' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('user');
    expect((await User.findById(other.id)).role).toBe('user');
  });

  it('rejects an unknown role with 400', async () => {
    const user = await makeUser('badrole@example.com');
    const res = await request(app)
      .patch(`/api/users/${user.id}/role`)
      .set(auth(admin.token))
      .send({ role: 'superuser' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/role/);
  });

  it('refuses to change your own role', async () => {
    const res = await request(app)
      .patch(`/api/users/${admin.id}/role`)
      .set(auth(admin.token))
      .send({ role: 'user' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SELF_ROLE_CHANGE');
    expect((await User.findById(admin.id)).role).toBe('admin');
  });

  it('returns 404 for an unknown user and 400 for a malformed id', async () => {
    const missing = await request(app)
      .patch(`/api/users/${unknownId()}/role`)
      .set(auth(admin.token))
      .send({ role: 'admin' });
    expect(missing.status).toBe(404);

    const malformed = await request(app)
      .patch('/api/users/not-an-id/role')
      .set(auth(admin.token))
      .send({ role: 'admin' });
    expect(malformed.status).toBe(400);
  });

  it('audits the change with from/to values', async () => {
    const user = await makeUser('audited-role@example.com');
    await request(app)
      .patch(`/api/users/${user.id}/role`)
      .set(auth(admin.token))
      .send({ role: 'admin' });

    const log = await AuditLog.findOne({ action: 'user.role_change' });
    expect(log).not.toBeNull();
    expect(String(log.actorId)).toBe(admin.id);
    expect(log.target).toBe(`user:${user.id}`);
    expect(log.meta).toMatchObject({ email: 'audited-role@example.com', from: 'user', to: 'admin' });
  });
});

describe('PATCH /api/users/:id/ban', () => {
  it('bans a user so they can no longer log in, then unbans them', async () => {
    const user = await makeUser('banme@example.com');

    const ban = await request(app)
      .patch(`/api/users/${user.id}/ban`)
      .set(auth(admin.token))
      .send({ isBanned: true });
    expect(ban.status).toBe(200);
    expect(ban.body.user.isBanned).toBe(true);

    const blocked = await request(app)
      .post('/api/auth/login')
      .send({ email: 'banme@example.com', password: 'Password123!' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toBe('Account banned');

    const unban = await request(app)
      .patch(`/api/users/${user.id}/ban`)
      .set(auth(admin.token))
      .send({ isBanned: false });
    expect(unban.status).toBe(200);
    expect(unban.body.user.isBanned).toBe(false);

    const allowed = await request(app)
      .post('/api/auth/login')
      .send({ email: 'banme@example.com', password: 'Password123!' });
    expect(allowed.status).toBe(200);
  });

  it('requires a boolean', async () => {
    const user = await makeUser('stringban@example.com');
    const res = await request(app)
      .patch(`/api/users/${user.id}/ban`)
      .set(auth(admin.token))
      .send({ isBanned: 'true' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/isBanned/);
  });

  it('refuses to ban yourself', async () => {
    const res = await request(app)
      .patch(`/api/users/${admin.id}/ban`)
      .set(auth(admin.token))
      .send({ isBanned: true });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SELF_BAN');
    expect((await User.findById(admin.id)).isBanned).toBe(false);
  });

  it('returns 404 for an unknown user', async () => {
    const res = await request(app)
      .patch(`/api/users/${unknownId()}/ban`)
      .set(auth(admin.token))
      .send({ isBanned: true });
    expect(res.status).toBe(404);
  });

  it('audits ban and unban as separate actions', async () => {
    const user = await makeUser('audit-ban@example.com');
    await request(app).patch(`/api/users/${user.id}/ban`).set(auth(admin.token)).send({ isBanned: true });
    await request(app).patch(`/api/users/${user.id}/ban`).set(auth(admin.token)).send({ isBanned: false });

    expect(await AuditLog.countDocuments({ action: 'user.ban' })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'user.unban' })).toBe(1);
  });
});

describe('DELETE /api/users/:id', () => {
  it('deletes a user and invalidates their credentials', async () => {
    const user = await makeUser('deleteme@example.com');

    const res = await request(app).delete(`/api/users/${user.id}`).set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
    expect(await User.findById(user.id)).toBeNull();

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'deleteme@example.com', password: 'Password123!' });
    expect(login.status).toBe(401);
  });

  it('leaves other users untouched', async () => {
    const keep = await makeUser('keep@example.com');
    const drop = await makeUser('drop@example.com');

    await request(app).delete(`/api/users/${drop.id}`).set(auth(admin.token));

    expect(await User.findById(keep.id)).not.toBeNull();
    expect(await User.countDocuments()).toBe(2); // admin + keep
  });

  it('refuses to delete your own account', async () => {
    const res = await request(app).delete(`/api/users/${admin.id}`).set(auth(admin.token));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SELF_DELETE');
    expect(await User.findById(admin.id)).not.toBeNull();
  });

  it('returns 404 for an unknown user and 400 for a malformed id', async () => {
    const missing = await request(app).delete(`/api/users/${unknownId()}`).set(auth(admin.token));
    expect(missing.status).toBe(404);

    const malformed = await request(app).delete('/api/users/not-an-id').set(auth(admin.token));
    expect(malformed.status).toBe(400);
  });

  it('audits the deletion with the victim email and role', async () => {
    const user = await makeUser('audit-delete@example.com');
    await request(app).delete(`/api/users/${user.id}`).set(auth(admin.token));

    const log = await AuditLog.findOne({ action: 'user.delete' });
    expect(log).not.toBeNull();
    expect(log.target).toBe(`user:${user.id}`);
    expect(log.meta).toMatchObject({ email: 'audit-delete@example.com', role: 'user' });
  });
});
