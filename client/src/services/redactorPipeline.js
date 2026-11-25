const {
  redact,
  RedactorBlockedError,
  RedactorUnavailableError,
  RedactorBadInputError,
  RedactorInvalidResponseError,
} = require('./redactorClient');
const policyService = require('./policyService');

class ChatRedactionError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.name = 'ChatRedactionError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Fail closed: no policies = no chat. The redactor with an empty rule list
// would let everything through.
async function loadPolicies() {
  let active;
  try {
    active = await policyService.getActive();
  } catch (err) {
    console.error('[policies] load failed:', err.message);
    throw new ChatRedactionError(503, 'POLICIES_UNAVAILABLE',
      'Policies could not be loaded — refusing to forward unredacted content');
  }
  if (active.rules.length === 0) {
    throw new ChatRedactionError(503, 'NO_ACTIVE_POLICIES',
      'No active redaction policy — an administrator must enable at least one');
  }
  return active;
}

// Adds the human-readable rule name (looked up from the policy id)
function enrich(d, byId) {
  const p = byId.get(String(d.ruleId));
  return { ...d, ruleName: p ? p.name : null, severity: d.severity ?? (p ? p.severity : null) };
}

/**
 * Redacts every text part of every message.
 * Returns { maskedMessages, report } on success.
 * Throws ChatRedactionError on:
 *   422 — a message was blocked (details.detections, blocking rule first)
 *   503 — policies missing/unloadable, or redactor unreachable (fail closed)
 *   500 — redactor gave a bad response (our bug)
 */
async function redactMessages(messages, { rules } = {}) {
  const active = rules ? null : await loadPolicies();
  const useRules = rules || active.rules;
  const byId = active ? active.byId : new Map();

  const maskedMessages = [];
  const detections = [];
  let redactedMessageCount = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg || typeof msg.content !== 'string' || msg.content.length === 0) {
      maskedMessages.push(msg);
      continue;
    }

    let result;
    try {
      result = await redact(msg.content, useRules);
    } catch (err) {
      if (err instanceof RedactorBlockedError) {
        const enriched = (err.detections || [])
          .map((d) => enrich(d, byId))
          .sort((a, b) => (b.action === 'block') - (a.action === 'block')); // blocking rule first
        throw new ChatRedactionError(422, 'CONTENT_BLOCKED',
          'Content blocked by policy', {
          message_index: i,
          role: msg.role,
          detections: enriched,
        });
      }
      if (err instanceof RedactorUnavailableError) {
        throw new ChatRedactionError(503, 'REDACTOR_UNAVAILABLE',
          'Redactor service unavailable — refusing to forward unredacted content', {
          message_index: i,
        });
      }
      if (err instanceof RedactorBadInputError) {
        throw new ChatRedactionError(500, 'REDACTOR_BAD_INPUT',
          'Redactor rejected the request', { message_index: i, cause: err.message });
      }
      if (err instanceof RedactorInvalidResponseError) {
        throw new ChatRedactionError(500, 'REDACTOR_INVALID_RESPONSE',
          'Redactor returned an invalid response', { message_index: i });
      }
      throw new ChatRedactionError(500, 'REDACTOR_ERROR',
        'Redactor failed', { message_index: i, cause: String(err) });
    }

    if (result.detections.length > 0) redactedMessageCount++;
    for (const d of result.detections) {
      detections.push({
        message_index: i,
        role: msg.role,
        ...enrich(d, byId),
      });
    }
    maskedMessages.push({ ...msg, content: result.maskedText });
  }

  return {
    maskedMessages,
    report: {
      blocked: false,
      message_count: messages.length,
      redacted_message_count: redactedMessageCount,
      detections,
    },
  };
}

module.exports = { redactMessages, ChatRedactionError };