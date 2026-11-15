const request = require('supertest');
const app = require('../src/app');

async function registerUser(overrides = {}) {
  const body = {
    email: overrides.email || `user_${Date.now()}@example.com`,
    password: overrides.password || 'Password123!',
    name: overrides.name || 'Test User',
  };
  const res = await request(app).post('/api/auth/register').send(body);
  return { res, body };
}

module.exports = { registerUser, app };