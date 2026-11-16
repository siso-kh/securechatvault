// src/engine.js

// Resource caps for client-supplied policies. They bound the work a single
// request can request; they do not make catastrophic backtracking impossible,
// so a hard execution budget still belongs at the process boundary.
const MAX_RULES = 50;
const MAX_PATTERN_LENGTH = 500;
const ALLOWED_ACTIONS = new Set(['mask', 'warn', 'block']);

/**
 * Validates a request-supplied policy.
 * @returns {string|null} an error message, or null when the policy is usable.
 */
function validateRules(rules) {
  if (rules === undefined || rules === null) return null; // caller applies defaults
  if (!Array.isArray(rules)) return '"rules" must be an array';
  if (rules.length > MAX_RULES) {
    return `"rules" must contain at most ${MAX_RULES} entries`;
  }

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
      return `rules[${i}] must be an object`;
    }
    if (typeof rule.pattern !== 'string' || rule.pattern.length === 0) {
      return `rules[${i}].pattern must be a non-empty string`;
    }
    if (rule.pattern.length > MAX_PATTERN_LENGTH) {
      return `rules[${i}].pattern must be at most ${MAX_PATTERN_LENGTH} characters`;
    }
    if (!ALLOWED_ACTIONS.has(rule.action)) {
      return `rules[${i}].action must be one of: mask, warn, block`;
    }
  }

  return null;
}

function applyRules(text, rules = [], opts = {}) {
  const detections = [];
  const ruleList = Array.isArray(rules) ? rules : [];
  let timedOut = false;

  for (const rule of ruleList) {
    if (opts.deadline && Date.now() > opts.deadline) {
      timedOut = true;
      break;
    }
    let regex;
    try {
      regex = new RegExp(rule.pattern, 'gi'); // g: all matches, i: case-insensitive
    } catch {
      continue; // skip invalid patterns — validation happens at the policy layer
    }

    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match[0].length === 0) {
        regex.lastIndex++; // avoid infinite loop on empty matches (e.g. "a*")
        continue;
      }

      if (typeof rule.validator === 'function' && !rule.validator(match[0])) continue;

      const start = match.index;
      const end = start + match[0].length;
      const isBlock = rule.action === 'block';

      // Overlap check: is this span already claimed by an earlier rule?
      const overlaps = detections.some((d) => start < d.end && end > d.start);

      if (overlaps) {
        // A masking rule must never silence a blocking rule, otherwise the
        // policy fails open based on rule ordering alone.
        if (!isBlock) continue;
        const alreadyBlocked = detections.some(
          (d) => d.action === 'block' && start < d.end && end > d.start,
        );
        if (alreadyBlocked) continue;
      }

      detections.push({
        ruleId: rule.id,
        category: rule.category,
        severity: rule.severity,
        action: rule.action,
        start,
        end,
      });
    }
  }

  if (timedOut && opts.timedOut) opts.timedOut.value = true;

  const blocked = detections.some((d) => d.action === 'block');

  // Reconstruct: apply masks from the END backwards so earlier
  // start/end indices stay valid after each replacement
  let maskedText = text;
  const byPositionDesc = [...detections].sort((a, b) => b.start - a.start);
  for (const d of byPositionDesc) {
    if (d.action === 'mask') {
      const placeholder = `[${String(d.category).toUpperCase()}]`;
      maskedText =
        maskedText.slice(0, d.start) + placeholder + maskedText.slice(d.end);
    }
    // "warn" -> text stays as-is, detection is only reported
    // "block"  -> text stays as-is here; the backend rejects the message
  }

  return { maskedText, detections, blocked };
}

exports.applyRules = applyRules;
exports.validateRules = validateRules;
exports.MAX_RULES = MAX_RULES;
exports.MAX_PATTERN_LENGTH = MAX_PATTERN_LENGTH;
