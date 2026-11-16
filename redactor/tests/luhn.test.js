// tests/luhn.test.js
const luhn = require('../src/utils/luhn');

describe('luhn', () => {
  describe('valid card numbers', () => {
    test.each([
      ['Visa',       '4111111111111111'],
      ['Mastercard', '5500005555555559'],
      ['Amex',       '378282246310005'],
      ['Discover',   '6011111111111117'],
      ['Diners',     '30569309025904'],
      ['JCB',        '3530111333300000'],
    ])('%s: %s', (_brand, num) => {
      expect(luhn(num)).toBe(true);
    });
  });

  describe('invalid card numbers', () => {
    test.each([
      ['off-by-one last digit', '4111111111111112'],
      ['random 16 digits',      '1234567890123456'],
      ['all nines (16)',        '9999999999999999'],
      ['truncated Visa',        '411111111111111'],
    ])('%s: %s', (_label, num) => {
      expect(luhn(num)).toBe(false);
    });
  });

  describe('edge cases', () => {
    // NOTE: a stale test here asserted luhn('0') === true, contradicting the
    // length-floor test below. The 12-digit floor makes false correct, so the
    // contradictory case was removed.
    test('single non-zero digit is invalid', () => {
      expect(luhn('7')).toBe(false);
    });

    test('empty string is invalid', () => {
      expect(luhn('')).toBe(false);
    });

    test('does not mutate — same input twice → same output', () => {
      expect(luhn('4111111111111111')).toBe(luhn('4111111111111111'));
    });

    test('all zeros (16 digits) is valid', () => {
      // sum of doubled 0s = 0 → valid. Documenting behavior.
      expect(luhn('0000000000000000')).toBe(true);
    });
    test('empty string is invalid', () => {
  expect(luhn('')).toBe(false);
});

test('single "0" is invalid (length floor)', () => {
  expect(luhn('0')).toBe(false);
});

test('all zeros (16 digits) still passes (documented)', () => {
  expect(luhn('0000000000000000')).toBe(true);
});

test('non-digit inside → false', () => {
  expect(luhn('4111x1111111111')).toBe(false);
});
  });
});