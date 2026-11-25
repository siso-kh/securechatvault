const request = require('supertest');
const jwt = require('jsonwebtoken');

const { app, registerUser, createAdmin, auth } = require('./helpers');

const ADMIN_ENDPOINTS = [
  ['get', '/api/policies'],
  ['get', '/api/users'],
  ['get', '/api/audit'],
];

let admin;
let userToken;

beforeEach(async () => {
  admin = await createAdmin();
  const { body } = await registerUser({ email: 'regular@example.com' });
  userToken = body.token;
});

describe('admin authentication', () => {
  it.each(ADMIN_ENDPOINTS)('%s %s requires a token (401)', async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Missing token');
  });

  it.each(ADMIN_ENDPOINTS)('%s %s rejects a malformed header (401)', async (method, path) => {
    const res = await request(app)[method](path).set('Authorization', 'Token abc.def.ghi');
    expect(res.status).toBe(401);
  });

  it.each(ADMIN_ENDPOINTS)('%s %s rejects a garbage token (401)', async (method, path) => {
    const res = await request(app)[method](path).set(auth('not-a-jwt'));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid or expired token');
  });

  it.each(ADMIN_ENDPOINTS)('%s %s rejects a token signed with another secret (401)', async (method, path) => {
    const forged = jwt.sign({ sub: admin.id, role: 'admin' }, 'attacker-secret', { expiresIn: '1h' });
    const res = await request(app)[method](path).set(auth(forged));
    expect(res.status).toBe(401);
  });

  it.each(ADMIN_ENDPOINTS)('%s %s rejects an expired token (401)', async (method, path) => {
    const expired = jwt.sign(
      { sub: admin.id, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' }
    );
    const res = await request(app)[method](path).set(auth(expired));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid or expired token');
  });

  it.each(ADMIN_ENDPOINTS)('%s %s rejects a normal user token (403)', async (method, path) => {
    const res = await request(app)[method](path).set(auth(userToken));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  it.each(ADMIN_ENDPOINTS)('%s %s accepts an admin token (200)', async (method, path) => {
    const res = await request(app)[method](path).set(auth(admin.token));
    expect(res.status).toBe(200);
  });

  it('gate orders auth before role: a user token on a write is 403, not 400', async () => {
    const res = await request(app)
      .post('/api/policies')
      .set(auth(userToken))
      .send({ name: 'nope', pattern: 'x', category: 'X', severity: 'low', action: 'mask' });
    expect(res.status).toBe(403);
  });

  it('does not let a user token reach user management writes', async () => {
    const { body } = await registerUser({ email: 'target@example.com' });

    const ban = await request(app)
      .patch(`/api/users/${body.user.id}/ban`)
      .set(auth(userToken))
      .send({ isBanned: true });
    expect(ban.status).toBe(403);

    const role = await request(app)
      .patch(`/api/users/${body.user.id}/role`)
      .set(auth(userToken))
      .send({ role: 'admin' });
    expect(role.status).toBe(403);

    const del = await request(app).delete(`/api/users/${body.user.id}`).set(auth(userToken));
    expect(del.status).toBe(403);
  });
});
