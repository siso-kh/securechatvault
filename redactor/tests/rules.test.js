// tests/rules.test.js
const { applyRules } = require('../src/engine');
const { DEFAULT_RULES } = require('../src/rules');

const ruleFor = (id) => DEFAULT_RULES.find((r) => r.id === id);
const runRule = (id, text) => applyRules(text, [ruleFor(id)]);
const maskOf = (id, text) => runRule(id, text).maskedText;

describe('DEFAULT_RULES — per rule', () => {

  describe('email', () => {
    test.each([
      ['simple',     'contact john@mail.com now',  'contact [EMAIL] now'],
      ['subdomain',  'send to a.b+c-d@x.y.io',     'send to [EMAIL]'],
      ['two emails', 'me@a.co or you@b.org',       '[EMAIL] or [EMAIL]'],
    ])('%s', (_label, input, expected) => {
      expect(maskOf('email', input)).toBe(expected);
    });

    test.each([
      ['no @',         'not-an-email'],
      ['no TLD',       'john@mail'],
      ['no local part','@mail.com'],
    ])('does not match: %s', (_label, input) => {
      expect(runRule('email', input).detections).toHaveLength(0);
    });

    // Documented limitation — no \b anchors on either side.
    // Documented limitation — no \b at end, so trailing '.' is swallowed into the mask.
test('known FP: trailing dot is swallowed', () => {
  expect(maskOf('email', 'send to john@mail.com.')).toBe('send to [EMAIL]'); // no dot
});
  });

  // ─── aws-key ──────────────────────────────────────────────────────────
  describe('aws-key', () => {
    test('matches a real-looking AKIA key', () => {
      expect(maskOf('aws-key', 'AKIAIOSFODNN7EXAMPLE')).toBe('[API_KEY]');
    });

    test('does not match wrong prefix', () => {
      expect(runRule('aws-key', 'BKIAIOSFODNN7EXAMPLE').detections).toHaveLength(0);
    });

    test('does not match 15-char suffix', () => {
      expect(runRule('aws-key', 'AKIAIOSFODNN7EXAMPL').detections).toHaveLength(0);
    });
  });

  // ─── api-key ──────────────────────────────────────────────────────────
  describe('api-key', () => {
    test('matches sk- with 20 alnum', () => {
      expect(maskOf('api-key', 'sk-1234567890abcdefghij')).toBe('[API_KEY]');
    });

    test('does not match sk- with 19 alnum', () => {
      expect(runRule('api-key', 'sk-1234567890abcdefghi').detections).toHaveLength(0);
    });

    test('matches Stripe-style sk_live_ keys', () => {
      expect(maskOf('api-key', 'sk_live_1234567890abcdefghij')).toBe('[API_KEY]');
    });

    test('matches OpenAI-style sk-proj- keys', () => {
      expect(maskOf('api-key', 'sk-proj-abcdefghij0123456789AB')).toBe('[API_KEY]');
    });
  });

  // ─── jwt ──────────────────────────────────────────────────────────────
  describe('jwt', () => {
    const validJwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';

    test('matches a 3-part JWT', () => {
      expect(maskOf('jwt', `token=${validJwt}`)).toBe('token=[TOKEN]');
    });

    test('does not match 2-part (missing signature)', () => {
      expect(
        runRule('jwt', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0').detections,
      ).toHaveLength(0);
    });

    test('does not match without eyJ prefix', () => {
      expect(runRule('jwt', 'abc.def.ghi').detections).toHaveLength(0);
    });
  });

  // ─── credit-card (Luhn) ───────────────────────────────────────────────
  describe('credit-card', () => {
    test.each([
      ['plain 16',      '4111111111111111',      '[CREDIT_CARD]'],
      ['space-sep',     '4111 1111 1111 1111',   '[CREDIT_CARD]'],
      ['dash-sep',      '4111-1111-1111-1111',   '[CREDIT_CARD]'],
      ['Amex 15 digits','378282246310005',       '[CREDIT_CARD]'],
      ['with context',  'card: 5500005555555559','card: [CREDIT_CARD]'],
    ])('masks %s', (_label, input, expected) => {
      expect(maskOf('credit-card', input)).toBe(expected);
    });

    test('does NOT mask invalid Luhn (this is the point of the validator)', () => {
      const r = runRule('credit-card', 'number 4111111111111112 here');
      expect(r.detections).toHaveLength(0);
      expect(r.maskedText).toBe('number 4111111111111112 here');
    });

    test('does not mask a 12-digit number (below 13 min)', () => {
      expect(runRule('credit-card', '411111111111').detections).toHaveLength(0);
    });

    test('does not mask a 20-digit number (above 19 max)', () => {
      expect(runRule('credit-card', '41111111111111111111').detections).toHaveLength(0);
    });

    test('does not match a UUID (has letters)', () => {
      expect(
        runRule('credit-card', 'f47ac10b-58cc-4372-a567-0e02b2c3d479').detections,
      ).toHaveLength(0);
    });
  });

  // ─── ipv4 ─────────────────────────────────────────────────────────────
  describe('ipv4', () => {
    test.each([
      ['loopback',    '127.0.0.1',           '[IP_ADDRESS]'],
      ['private',     'at 10.0.0.1 via vpn', 'at [IP_ADDRESS] via vpn'],
      ['public',      '8.8.8.8',             '[IP_ADDRESS]'],
    ])('%s', (_label, input, expected) => {
      expect(maskOf('ipv4', input)).toBe(expected);
    });

    test('does not match 3 octets', () => {
      expect(runRule('ipv4', '1.2.3').detections).toHaveLength(0);
    });

    // Documented limitation — no range validation.
    test('known FP: 999.999.999.999 matches pattern', () => {
      expect(maskOf('ipv4', '999.999.999.999')).toBe('[IP_ADDRESS]');
    });
  });

  // ─── phone ────────────────────────────────────────────────────────────
  describe('phone', () => {
    test.each([
      ['US with country',  '+1-555-123-4567',     '[PHONE]'],
      ['no separators',    'call 5551234567 now', 'call [PHONE] now'],
      ['spaces',           '555 123 4567',        '[PHONE]'],
    ])('%s', (_label, input, expected) => {
      expect(maskOf('phone', input)).toBe(expected);
    });

    test('does not match 3 digits', () => {
      expect(runRule('phone', '123').detections).toHaveLength(0);
    });

    // Documented limitation — greedy over date+year patterns.
    test('known FP: date + year gets masked', () => {
      const r = runRule('phone', '2024-01-15 2024-01-15');
      expect(r.detections.length).toBeGreaterThan(0);
    });
  });

  // ─── password ─────────────────────────────────────────────────────────
  describe('password', () => {
    test.each([
      ['password=',  'password=hunter2',  '[PASSWORD]'],
      ['pwd: ',      'pwd: hunter2',      '[PASSWORD]'],
      ['pass =',     'pass = hunter2',    '[PASSWORD]'],
      ['uppercase',  'PASSWORD=Hunter2',  '[PASSWORD]'],
    ])('%s', (_label, input, expected) => {
      expect(maskOf('password', input)).toBe(expected);
    });

    test('does not match without : or =', () => {
      expect(runRule('password', 'my password is secret').detections).toHaveLength(0);
    });

    test('stops at comma / semicolon', () => {
      expect(maskOf('password', 'password=hunter2, next=foo')).toBe('[PASSWORD], next=foo');
    });

    // Documented limitation — no \b before prefix.
    test('known FP: "compass:" matches the "pass" alternation', () => {
      const r = runRule('password', 'compass: not-a-password');
      expect(r.detections).toHaveLength(1); // matches "pass: not-a-password"
    });
  });

  // ─── cross-rule overlap ───────────────────────────────────────────────
  describe('overlap across rules', () => {
    test('credit card wins over phone (CC listed first)', () => {
      const r = applyRules('4111 1111 1111 1111', DEFAULT_RULES);
      expect(r.detections).toHaveLength(1);
      expect(r.detections[0].category).toBe('credit_card');
    });

    test('email beats phone for "a@b.co" (no phone match anyway)', () => {
      const r = applyRules('a@b.co', DEFAULT_RULES);
      expect(r.detections).toHaveLength(1);
      expect(r.detections[0].category).toBe('email');
    });
  });
});