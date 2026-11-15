const request = require('supertest');
const { registerUser, app } = require('./helpers');

describe('POST /api/auth/register', () => {
  it('creates a user and returns a token', async () => {
    const { res, body } = await registerUser({ email: 'a@b.com' });

    expect(res.status).toBe(201);
    expect(body.token).toEqual(expect.any(String));
    expect(body.user).toMatchObject({
      email: 'a@b.com',
      name: 'Test User',
      role: 'user',
    });
    expect(body.user).not.toHaveProperty('passwordHash');
  });

  it('rejects duplicate email with 409', async () => {
    await registerUser({ email: 'dup@b.com' });
    const { res, body } = await registerUser({ email: 'dup@b.com' });

    expect(res.status).toBe(409);
    expect(body.error).toMatch(/already in use/i);
  });

  it('stores a bcrypt hash, not the raw password', async () => {
    const User = require('../src/models/User');
    await registerUser({ email: 'hash@b.com', password: 'Secret123!' });

    const user = await User.findOne({ email: 'hash@b.com' });
    expect(user.passwordHash).not.toBe('Secret123!');
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/); // bcrypt prefix
  });
});

describe('POST /api/auth/login', () => {
  it('returns a token for valid credentials', async () => {
    await registerUser({ email: 'login@b.com', password: 'Password123!' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@b.com', password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('rejects wrong password with 401', async () => {
    await registerUser({ email: 'wrong@b.com', password: 'Password123!' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'wrong@b.com', password: 'nope' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  it('rejects unknown email with 401 (same message as wrong password)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@b.com', password: 'x' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  it('rejects banned users with 403', async () => {
    const { body } = await registerUser({ email: 'banned@b.com' });
    const User = require('../src/models/User');
    await User.findByIdAndUpdate(body.user.id, { isBanned: true });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'banned@b.com', password: 'Password123!' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Account banned');
  });
});

describe('GET /api/auth/me', () => {
  it('returns the current user with a valid token', async () => {
    const { body } = await registerUser({ email: 'me@b.com' });
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('me@b.com');
  });

  it('rejects missing token with 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Missing token');
  });

  it('rejects malformed token with 401', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.jwt');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid or expired token');
  });
});