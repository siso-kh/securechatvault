const request = require('supertest');
const { registerUser, app } = require('./helpers');

describe('error handling', () => {
  it('returns 400 for malformed ObjectId (not 500)', async () => {
    const { body } = await registerUser();
    const res = await request(app)
      .get('/api/conversations/not-an-objectid')
      .set('Authorization', `Bearer ${body.token}`);

    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
    expect(res.body.error.length).toBeGreaterThan(0);
  });

  it('returns 400 for title exceeding maxlength (not 500)', async () => {
    const { body } = await registerUser();
    const res = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${body.token}`)
      .send({ title: 'x'.repeat(101) });

    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
    expect(res.body.error.length).toBeGreaterThan(0);
  });
});

describe('POST /api/conversations — security', () => {
  it('ignores userId in body (cannot spoof ownership)', async () => {
    const Conversation = require('../src/models/Conversation');

    const { body: alice } = await registerUser();
    const { body: bob } = await registerUser();

    const res = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ title: 'Spoof attempt', userId: bob.user.id });

    expect(res.status).toBe(201);
    expect(res.body.conversation.userId).toBe(alice.user.id);
    expect(res.body.conversation.userId).not.toBe(bob.user.id);

    // The response could look right while the DB holds the spoofed owner.
    const stored = await Conversation.findOne({ title: 'Spoof attempt' });
    expect(stored.userId.toString()).toBe(alice.user.id);
  });
});

describe('DELETE /api/conversations — DB state', () => {
  it('removes the document from MongoDB (not just 200 response)', async () => {
    const Conversation = require('../src/models/Conversation');
    const { body } = await registerUser();

    const created = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${body.token}`)
      .send({ title: 'Will be deleted' });
    const id = created.body.conversation._id;

    const res = await request(app)
      .delete(`/api/conversations/${id}`)
      .set('Authorization', `Bearer ${body.token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });

    const gone = await Conversation.findById(id);
    expect(gone).toBeNull();
  });
});
