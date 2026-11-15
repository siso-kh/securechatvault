const request = require('supertest');
const app = require('../src/app');

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

module.exports = { registerUser, createConversation, app };
