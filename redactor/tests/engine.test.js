// tests/engine.test.js
const { applyRules } = require('../src/engine');

const rule = (overrides = {}) => ({
  id: 'r1',
  pattern: 'x',
  category: 'test',
  severity: 'low',
  action: 'mask',
  ...overrides,
});

describe('applyRules', () => {
  describe('trivial input', () => {
    test('empty text + no rules', () => {
      expect(applyRules('', [])).toEqual({ maskedText: '', detections: [], blocked: false });
    });

    test('non-empty text + no rules leaves text unchanged', () => {
      const r = applyRules('hello world', []);
      expect(r.maskedText).toBe('hello world');
      expect(r.detections).toEqual([]);
      expect(r.blocked).toBe(false);
    });
    // tests/engine.test.js
test('private-key block + inner secret-kv mask: order-independent masking', () => {
  const rules = [
    // deliberately reversed relative to DEFAULT_RULES to expose the bug
    { id: 'secret-kv', pattern: 'secret:\\s*\\S+', category: 'secret',  action: 'mask' },
    { id: 'private-key', pattern: '-----BEGIN [A-Z ]*PRIVATE KEY-----[\\s\\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)',
      category: 'private_key', action: 'block' },
  ];
  const text = '-----BEGIN PRIVATE KEY-----\nsecret: hunter2\nMIIE...\n-----END PRIVATE KEY-----';

  const result = applyRules(text, rules);

  expect(result.blocked).toBe(true);
  // Without the fix: maskedText still contains "secret: hunter2" because the
  // mask detection was dropped when it overlapped the block detection.
  expect(result.maskedText).not.toContain('hunter2');
});
    test('undefined rules arg defaults to []', () => {
      expect(applyRules('hello').maskedText).toBe('hello');
    });
  });

  describe('mask action', () => {
    test('masks email', () => {
      const r = applyRules('contact me at john@x.com please', [
        rule({ pattern: '\\b[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,}\\b', category: 'email' }),
      ]);
      expect(r.maskedText).toBe('contact me at [EMAIL] please');
      expect(r.detections).toHaveLength(1);
      expect(r.detections[0]).toMatchObject({ category: 'email', action: 'mask' });
    });

    test('masks multiple occurrences', () => {
      const r = applyRules('a 555-111-2222 b 555-333-4444', [
        rule({ pattern: '\\b\\d{3}-\\d{3}-\\d{4}\\b', category: 'phone' }),
      ]);
      expect(r.maskedText).toBe('a [PHONE] b [PHONE]');
      expect(r.detections).toHaveLength(2);
    });

    test('empty-match regex does not infinite-loop', () => {
      // "a*" matches empty string at every position. The lastIndex++ guard must terminate it.
      const r = applyRules('bbb', [rule({ pattern: 'a*', category: 'x' })]);
      expect(r.maskedText).toBe('bbb');
    });

    test('unicode / emoji preserved around masks', () => {
      const r = applyRules('tëst 😀 555-1234 ✓', [
        rule({ pattern: '\\d{3}-\\d{4}', category: 'num' }),
      ]);
      expect(r.maskedText).toBe('tëst 😀 [NUM] ✓');
    });
  });

  describe('warn action', () => {
    test('reports detection but leaves text intact', () => {
      const r = applyRules('the secret is out', [
        rule({ pattern: 'secret', category: 'keyword', action: 'warn' }),
      ]);
      expect(r.maskedText).toBe('the secret is out');
      expect(r.detections).toHaveLength(1);
      expect(r.detections[0].action).toBe('warn');
      expect(r.blocked).toBe(false);
    });
  });

  describe('block action', () => {
    test('sets blocked=true but leaves text intact', () => {
      const r = applyRules('this is forbidden stuff', [
        rule({ pattern: 'forbidden', category: 'keyword', action: 'block' }),
      ]);
      expect(r.blocked).toBe(true);
      expect(r.maskedText).toBe('this is forbidden stuff');
    });
  });

  describe('overlap handling', () => {
    test('second rule skips overlapping span', () => {
      const r = applyRules('abcd', [
        rule({ id: 'a', pattern: 'abc', category: 'first' }),
        rule({ id: 'b', pattern: 'bcd', category: 'second' }),
      ]);
      expect(r.detections).toHaveLength(1);
      expect(r.detections[0].category).toBe('first');
      expect(r.maskedText).toBe('[FIRST]d');
    });

    test('non-overlapping matches both fire', () => {
      const r = applyRules('ab-cd', [rule({ pattern: 'ab|cd', category: 'x' })]);
      expect(r.detections).toHaveLength(2);
      expect(r.maskedText).toBe('[X]-[X]');
    });

    test('block rule fires even when a mask rule claims the same span first', () => {
      // A masking rule must not silence a blocking rule via rule ordering.
      const r = applyRules('the secret', [
        rule({ id: 'm', pattern: 'secret', category: 'kw', action: 'mask' }),
        rule({ id: 'b', pattern: 'secret', category: 'kw', action: 'block' }),
      ]);
      expect(r.maskedText).toBe('the [KW]');
      expect(r.blocked).toBe(true);
      expect(r.detections).toHaveLength(2);
    });
  });

  describe('invalid regex', () => {
    test('invalid pattern is skipped without throwing', () => {
      const r = applyRules('abc', [rule({ pattern: '([', category: 'bad' })]);
      expect(r.detections).toEqual([]);
      expect(r.maskedText).toBe('abc');
    });
  });

  describe('case insensitivity', () => {
    test('matches regardless of case', () => {
      const r = applyRules('SECRET Secret secret', [
        rule({ pattern: 'secret', category: 'kw' }),
      ]);
      expect(r.detections).toHaveLength(3);
      expect(r.maskedText).toBe('[KW] [KW] [KW]');
    });
  });

  describe('security invariants', () => {
    test('detections never include the matched raw text', () => {
      const r = applyRules('my password here', [
        rule({ pattern: 'password', category: 'kw' }),
      ]);
      expect(JSON.stringify(r.detections)).not.toContain('password');
    });

    test('mask + block on different spans coexist', () => {
      const r = applyRules('send to a@b.co the forbidden doc', [
        rule({ id: 'em', pattern: '\\w+@\\w+\\.\\w+', category: 'email', action: 'mask' }),
        rule({ id: 'bad', pattern: 'forbidden', category: 'kw', action: 'block' }),
      ]);
      expect(r.maskedText).toBe('send to [EMAIL] the forbidden doc');
      expect(r.blocked).toBe(true);
      expect(r.detections).toHaveLength(2);
    });
  });
});