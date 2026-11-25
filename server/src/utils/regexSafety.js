const vm = require('vm');

const MAX_LEN = 200;

// Same flags as the redactor engine (it always uses 'gi')
const FLAGS = 'gi';

// Strings that make catastrophic patterns blow up
const PROBES = [
  'a'.repeat(32) + '!',
  '1'.repeat(32) + '!',
  ' '.repeat(32) + '!',
  'a1'.repeat(16) + '!',
  'a.'.repeat(16) + '!',
];

// Heuristic: a group that contains + or * and is itself repeated, like (a+)+ or (.*)*
function hasNestedQuantifier(source) {
  const stripped = source
    .replace(/\\./g, 'x')                 // escaped chars  -> x
    .replace(/\[[^\]]*\]/g, 'x');         // character classes -> x
  return /\([^()]*[+*][^()]*\)\s*(?:[+*]|\{\d+,\d*\})/.test(stripped);
}

// Returns an error message, or null if the pattern is acceptable.
function validatePattern(source) {
  if (typeof source !== 'string' || !source.trim()) return 'Pattern is required';
  if (source.length > MAX_LEN) return `Pattern too long (max ${MAX_LEN} characters)`;

  try {
    new RegExp(source, FLAGS);
  } catch (e) {
    return `Invalid regex: ${e.message}`;
  }

  if (new RegExp(source, FLAGS).test('')) return 'Pattern must not match an empty string';

  if (hasNestedQuantifier(source)) {
    return 'Pattern looks vulnerable to catastrophic backtracking (nested quantifiers)';
  }

  // Run the regex in a sandbox with a hard timeout
  for (const s of PROBES) {
    try {
      vm.runInNewContext('new RegExp(p, f).test(s)', { p: source, f: FLAGS, s }, { timeout: 100 });
    } catch {
      return 'Pattern is too slow on test input (possible catastrophic backtracking)';
    }
  }
  return null;
}

module.exports = { validatePattern };
