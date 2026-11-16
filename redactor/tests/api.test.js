// tests/api.test.js

const os = require('os');
const request = require('supertest');
const app = require('../src/app');


const EMAIL_RULE = {
  id: 'email',
  pattern: '\\b[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,}\\b',
  category: 'email',
  severity: 'high',
  action: 'mask',
};
const PHONE_RULE = {
  id: 'phone',
  pattern: '\\b\\d{3}-\\d{3}-\\d{4}\\b',
  category: 'phone',
  severity: 'medium',
  action: 'mask',
};

// tests/api.test.js


describe('POST /redact — email rule, multi-match', () => {
  test('masks two emails and reports exact spans', async () => {
    const res = await request(app)
      .post('/redact')
      .send({
        text: 'Contact john@mail.com or admin@test.org today',
        rules: [
          {
            id: 'r1',
            pattern: '[\\w.]+@[\\w.]+\\.\\w+',
            category: 'email',
            severity: 'medium',
            action: 'mask',
          },
        ],
      })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).toEqual({
      maskedText: 'Contact [EMAIL] or [EMAIL] today',
      detections: [
        {
          ruleId: 'r1',
          category: 'email',
          severity: 'medium',
          action: 'mask',
          start: 8,
          end: 21,
        },
        {
          ruleId: 'r1',
          category: 'email',
          severity: 'medium',
          action: 'mask',
          start: 25,
          end: 39,
        },
      ],
      blocked: false,
      servedBy: os.hostname(),
    });
  });
});

describe('POST /redact', () => {
  describe('happy path', () => {
    test('masks email with provided rule', async () => {
      const res = await request(app)
        .post('/redact')
        .send({ text: 'email me at john@x.com', rules: [EMAIL_RULE] })
        .expect(200);

      expect(res.body).toHaveProperty('maskedText');
      expect(res.body.maskedText).toBe('email me at [EMAIL]');
      expect(res.body.maskedText).not.toContain('john@x.com');
      expect(res.body.detections).toHaveLength(1);
      expect(res.body.blocked).toBe(false);
      expect(res.body).toHaveProperty('servedBy');
    });

    test('masks multiple PII types', async () => {
      const res = await request(app)
        .post('/redact')
        .send({
          text: 'call 555-123-4567 or email jane@test.com',
          rules: [EMAIL_RULE, PHONE_RULE],
        })
        .expect(200);

      expect(res.body.maskedText).toBe('call [PHONE] or email [EMAIL]');
      expect(res.body.maskedText).not.toContain('jane@test.com');
      expect(res.body.maskedText).not.toContain('555-123-4567');
    });

    test('no rules → text unchanged', async () => {
      const res = await request(app)
        .post('/redact')
        .send({ text: 'nothing to hide here' })
        .expect(200);
      expect(res.body.maskedText).toBe('nothing to hide here');
      expect(res.body.detections).toEqual([]);
    });
  });

  describe('edge cases', () => {
    test('empty string text → 200', async () => {
      const res = await request(app).post('/redact').send({ text: '' }).expect(200);
      expect(res.body.maskedText).toBe('');
    });

    test('unicode / emoji preserved', async () => {
      const res = await request(app)
        .post('/redact')
        .send({ text: 'tëst 😀 +1-555-0100', rules: [PHONE_RULE] })
        .expect(200);
      expect(res.body.maskedText).toContain('tëst 😀');
    });

    test('50kb text within 100kb limit → 200', async () => {
      const text = 'x'.repeat(50_000);
      const res = await request(app).post('/redact').send({ text }).expect(200);
      expect(res.body.maskedText).toHaveLength(50_000);
    });

    test('payload over 100kb → 413', async () => {
  
  const text = 'x'.repeat(150_000);
  const res = await request(app).post('/redact').send({ text }).expect(413);
  expect(res.type).toMatch(/json/);
  expect(res.body).toHaveProperty('error');
});
test('payload just under 100 KiB → 200', async () => {
  // `bytes` parses '100kb' as 102,400. JSON wrapper {"text":""} = 12 bytes.
  // Use '!' — not in [\w.+-], so the email regex cannot backtrack.
  const text = '!'.repeat(102_388 - 1);
  await request(app).post('/redact').send({ text }).expect(200);
});
test('text just under 100 KiB → 200', async () => {
  // 102,400 - 12 bytes of {"text":""} overhead = 102,388 text bytes
  const text = 'x'.repeat(102_388 - 1);
  await request(app).post('/redact').send({ text }).expect(200);
});

test('text just over 100 KiB → 413', async () => {
  const text = 'x'.repeat(102_400);
  await request(app).post('/redact').send({ text }).expect(413);
});
  });

  describe('negative cases', () => {
    test('missing text → 400 with error message', async () => {
      const res = await request(app).post('/redact').send({}).expect(400);
      expect(res.body).toHaveProperty('error');
      expect(JSON.stringify(res.body).toLowerCase()).toContain('text');
    });

    test('empty body → 400', async () => {
      await request(app)
        .post('/redact')
        .set('Content-Type', 'application/json')
        .send('')
        .expect(400);
    });

    test.each([
      ['number', 123],
      ['null', null],
      ['array', ['x']],
      ['boolean', true],
      ['object', { a: 1 }],
    ])('text is %s → 400', async (_label, value) => {
      await request(app).post('/redact').send({ text: value }).expect(400);
    });

    test.each([
      ['rules is not an array', { rules: {} }],
      ['rule is null', { rules: [null] }],
      ['rule has no pattern', { rules: [{ action: 'mask' }] }],
      ['unknown action', { rules: [{ pattern: 'x', action: 'drop' }] }],
    ])('invalid policy (%s) → 400', async (_label, extra) => {
      const res = await request(app)
        .post('/redact')
        .send({ text: 'hello', ...extra })
        .expect(400);
      expect(res.body).toHaveProperty('error');
    });

    test('malformed JSON → 400 JSON response (not HTML)', async () => {
      const res = await request(app)
        .post('/redact')
        .set('Content-Type', 'application/json')
        .send('{ "text": "unterminated')
        .expect(400);
      expect(res.type).toMatch(/json/);
    });

    test('wrong content-type → 400/415 (never 500)', async () => {
      const res = await request(app)
        .post('/redact')
        .set('Content-Type', 'text/plain')
        .send('{"text":"hello"}');
      expect([400, 415]).toContain(res.status);
    });
  });

  describe('security', () => {
    test('SQL-injection-shaped input does not 5xx', async () => {
      const res = await request(app)
        .post('/redact')
        .send({ text: "'; DROP TABLE users; -- admin@test.com", rules: [EMAIL_RULE] });
      expect(res.status).toBeLessThan(500);
    });

    test('XSS payload returns JSON (not HTML)', async () => {
      const res = await request(app)
        .post('/redact')
        .send({ text: "<script>alert('xss')</script>", rules: [] })
        .expect(200);
      // Content-type is what matters — the maskedText is data, not HTML.
      expect(res.type).toMatch(/json/);
    });

    test('block action → blocked:true', async () => {
      const res = await request(app)
        .post('/redact')
        .send({
          text: 'this is forbidden',
          rules: [{ id: 'kw', pattern: 'forbidden', category: 'kw', severity: 'high', action: 'block' }],
        })
        .expect(200);
      expect(res.body.blocked).toBe(true);
    });
  });
});

describe('GET /health', () => {
  test('returns ok', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', service: 'redactor' });
  });
});