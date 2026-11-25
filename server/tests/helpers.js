const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');

async function registerUser(overrides = {}) {
  const payload = {
    email: overrides.email || `user_${Date.now()}@example.com`,
    password: overrides.password || 'Password123!',
    name: overrides.name || 'Test User',
  };
  const res = await request(app).post('/api/auth/register').send(payload);
  return { res, body: res.body, payload };
}

async function createConversation(token, title = 'New conversation') {
  const res = await request(app)
    .post('/api/conversations')
    .set('Authorization', `Bearer ${token}`)
    .send({ title });
  return { res, body: res.body };
}

// The credentials the environment ships with (seed.js reads the same vars).
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@securechat.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'aaazzzeee';

// Register, promote in the DB, then log in again so the JWT carries role=admin.
async function createAdmin({ email = ADMIN_EMAIL, password = ADMIN_PASSWORD, name = 'Admin' } = {}) {
  const { res, body } = await registerUser({ email, password, name });
  if (res.status !== 201) throw new Error(`admin registration failed: ${res.status}`);

  await User.findByIdAndUpdate(body.user.id, { role: 'admin' });
  const login = await request(app).post('/api/auth/login').send({ email, password });
  if (login.status !== 200) throw new Error(`admin login failed: ${login.status}`);

  return { token: login.body.token, id: body.user.id, email, password };
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

module.exports = { registerUser, createConversation, createAdmin, auth, app, ADMIN_EMAIL, ADMIN_PASSWORD };
