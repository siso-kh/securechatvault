// tests/rules.test.js
const { applyRules, validateRules } = require('../src/engine');
const { DEFAULT_RULES } = require('../src/rules');

const ruleFor = (id) => DEFAULT_RULES.find((r) => r.id === id);
const runRule = (id, text) => applyRules(text, [ruleFor(id)]);
const maskOf = (id, text) => runRule(id, text).maskedText;
const spansOf = (id, text) =>
  runRule(id, text).detections.map((d) => text.slice(d.start, d.end));


describe('DEFAULT_RULES — action contract', () => {
  // ─── 1. Every rule declares one of the three allowed actions ────────
  test.each(DEFAULT_RULES.map((r) => [r.id, r]))(
    '%s declares a valid action',
    (_id, rule) => {
      expect(['mask', 'warn', 'block']).toContain(rule.action);
    }
  );

  // ─── 2. Every rule is accepted by validateRules ─────────────────────
  test('DEFAULT_RULES passes validateRules', () => {
    expect(validateRules(DEFAULT_RULES)).toBeNull();
  });

  // ─── 3. detection.action mirrors rule.action for every rule ─────────
  // One representative probe per rule. If a probe fails, adjust the probe
  // — the point is to prove the rule fires AND propagates its action, not
  // to prove my sample string is representative.
  const probes = {
    'private-key':  '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----',
    'db-url':       'postgres://user:pass@host:5432/db',
    'aws-key':      'AKIAIOSFODNN7EXAMPLE',
    'api-key':      'sk-1234567890abcdefghij',
    'vendor-token': 'ghp_' + 'a'.repeat(36),
    'jwt':          'eyJhbGc.eyJzdWI.sig',
    'bearer':       'Bearer abcdefghijklmnopqrstuv',
    'password':     'password=hunter2',
    'secret-kv':    'api_key=abcdef123456',
    'url-secret':   'https://x.io/?token=abc123',
    'credit-card':  '4111111111111111',
    'email':        'a@b.co',
    'phone-intl':   '+15551234567',
    'ipv4':         '8.8.8.8',
  };

  for (const [id, probe] of Object.entries(probes)) {
    const rule = DEFAULT_RULES.find((r) => r.id === id);
    if (!rule) continue;

    test(`${id}: detection.action === '${rule.action}'`, () => {
      const r = applyRules(probe, [rule]);
      expect(r.detections.length).toBeGreaterThan(0);
      for (const d of r.detections) {
        expect(d.action).toBe(rule.action);
        expect(d.ruleId).toBe(rule.id);
        expect(d.category).toBe(rule.category);
        expect(d.severity).toBe(rule.severity);
      }
    });
  }

  // ─── 4. The behavioral consequence of each action ───────────────────
  describe('behavior per action', () => {
    const mask  = { id: 'm', pattern: 'secret', category: 'kw', action: 'mask'  };
    const warn  = { id: 'w', pattern: 'secret', category: 'kw', action: 'warn'  };
    const block = { id: 'b', pattern: 'secret', category: 'kw', action: 'block' };

    test('mask: text replaced, blocked=false, detection.action=mask', () => {
      const r = applyRules('the secret', [mask]);
      expect(r.maskedText).toBe('the [KW]');
      expect(r.blocked).toBe(false);
      expect(r.detections[0].action).toBe('mask');
    });

    test('warn: text untouched, blocked=false, detection.action=warn', () => {
      const r = applyRules('the secret', [warn]);
      expect(r.maskedText).toBe('the secret');
      expect(r.blocked).toBe(false);
      expect(r.detections[0].action).toBe('warn');
    });

    test('block: text untouched, blocked=true, detection.action=block', () => {
      const r = applyRules('the secret', [block]);
      expect(r.maskedText).toBe('the secret');
      expect(r.blocked).toBe(true);
      expect(r.detections[0].action).toBe('block');
    });

    test('mixed: one of each, behavior is independent per detection', () => {
      const r = applyRules('a@b.co and secret and password=x', [
        { id: 'e', pattern: '\\S+@\\S+', category: 'email', action: 'warn' },
        mask,
        block,
      ]);
      expect(r.blocked).toBe(true);
      expect(r.detections.find((d) => d.ruleId === 'e').action).toBe('warn');
      expect(r.detections.find((d) => d.ruleId === 'm').action).toBe('mask');
      expect(r.detections.find((d) => d.ruleId === 'b').action).toBe('block');
    });
  });
});


describe('DEFAULT_RULES — per rule', () => {

  describe('email (warn — reported, not rewritten)', () => {
    test.each([
      ['simple',     'contact john@mail.com now',  ['john@mail.com']],
      ['subdomain',  'send to a.b+c-d@x.y.io',     ['a.b+c-d@x.y.io']],
      ['two emails', 'me@a.co or you@b.org',       ['me@a.co', 'you@b.org']],
    ])('%s', (_label, input, expectedSpans) => {
      const r = runRule('email', input);
      expect(spansOf('email', input)).toEqual(expectedSpans);
      expect(r.maskedText).toBe(input); // "warn" only reports
    });

    test.each([
      ['no @',         'not-an-email'],
      ['no TLD',       'john@mail'],
      ['no local part','@mail.com'],
    ])('does not match: %s', (_label, input) => {
      expect(runRule('email', input).detections).toHaveLength(0);
    });

    test('trailing dot is no longer swallowed', () => {
      expect(spansOf('email', 'send to john@mail.com.')).toEqual(['john@mail.com']);
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

    test.each([
      ['999.999.999.999', 'octets above 255'],
      ['256.1.1.1',       'single octet above 255'],
    ])('%s does not match (%s)', (input) => {
      expect(runRule('ipv4', input).detections).toHaveLength(0);
    });
  });

  // ─── phone ────────────────────────────────────────────────────────────
  describe('phone-intl (warn — requires a + prefix)', () => {
    test.each([
      ['US with country code', '+1-555-123-4567'],
      ['UK',                   '+44 20 7946 0958'],
      ['parenthesised area',   '+1 (555) 123-4567'],
    ])('matches %s', (_label, input) => {
      expect(spansOf('phone-intl', input)).toEqual([input]);
    });

    test.each([
      ['bare national number', 'call 5551234567 now'],
      ['spaces without +',     '555 123 4567'],
      ['3 digits',             '123'],
      ['date + year (old FP)', '2024-01-15 2024-01-15'],
    ])('does not match %s', (_label, input) => {
      expect(runRule('phone-intl', input).detections).toHaveLength(0);
    });
  });

  // ─── password ─────────────────────────────────────────────────────────
  describe('password (masks the value only, via lookbehind)', () => {
    test.each([
      ['password=', 'password=hunter2',    'password=[PASSWORD]'],
      ['pwd: ',     'pwd: hunter2',        'pwd: [PASSWORD]'],
      ['pass =',    'pass = hunter2',      'pass = [PASSWORD]'],
      ['uppercase', 'PASSWORD=Hunter2',    'PASSWORD=[PASSWORD]'],
      ['quoted',    'password="hunter 2"', 'password=[PASSWORD]'],
    ])('%s', (_label, input, expected) => {
      expect(maskOf('password', input)).toBe(expected);
    });

    test('does not match without : or =', () => {
      expect(runRule('password', 'my password is secret').detections).toHaveLength(0);
    });

    test('stops at comma / semicolon', () => {
      expect(maskOf('password', 'password=hunter2, next=foo')).toBe(
        'password=[PASSWORD], next=foo',
      );
    });

    test('"compass:" is no longer a false positive', () => {
      // The lookbehind requires a real word boundary before "pass".
      expect(runRule('password', 'compass: not-a-password').detections).toHaveLength(0);
    });
  });

  // ─── secrets and credentials (added with the rules rewrite) ────────────
  describe('secrets and credentials', () => {
    test('private-key blocks a PEM block without rewriting it', () => {
      const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----';
      const r = runRule('private-key', pem);
      expect(r.blocked).toBe(true);
      expect(r.maskedText).toBe(pem);
    });

    test('db-url masks credentials in a connection string', () => {
      expect(maskOf('db-url', 'postgres://user:pw@db.internal:5432/app')).toBe(
        '[CONNECTION_STRING]',
      );
    });

    test.each([
      ['GitHub PAT', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789AB'],
      ['Slack bot',  'xoxb-1234567890-abcdefghij'],
    ])('vendor-token masks %s', (_label, input) => {
      expect(maskOf('vendor-token', input)).toBe('[API_KEY]');
    });

    test('bearer masks the token but keeps the scheme', () => {
      expect(maskOf('bearer', 'Authorization: Bearer abcdefghijklmnop123456')).toBe(
        'Authorization: Bearer [TOKEN]',
      );
    });

    test('secret-kv masks only the value', () => {
      expect(maskOf('secret-kv', 'client_secret: s3cr3tvalue')).toBe(
        'client_secret: [SECRET]',
      );
    });

    test('url-secret masks the token parameter only', () => {
      expect(maskOf('url-secret', 'https://x.io/cb?token=abc123&x=1')).toBe(
        'https://x.io/cb?token=[SECRET]&x=1',
      );
    });

    test('aws-key covers the ASIA temporary-credential prefix', () => {
      expect(maskOf('aws-key', 'ASIAIOSFODNN7EXAMPLE')).toBe('[API_KEY]');
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