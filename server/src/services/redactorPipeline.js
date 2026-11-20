const {
  redact,
  RedactorBlockedError,
  RedactorUnavailableError,
  RedactorBadInputError,
  RedactorInvalidResponseError,
} = require('./redactorClient');

class ChatRedactionError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.name = 'ChatRedactionError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Redacts every text part of every message.
 * Returns { maskedMessages, report } on success.
 * Throws ChatRedactionError on:
 *   422 — a message was blocked (err.details.detections explains why)
 *   503 — the redactor is unreachable / timed out (fail closed)
 *   500 — redactor gave a bad response (our bug)
 */
async function redactMessages(messages, { rules } = {}) {
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
      result = await redact(msg.content, rules);
    } catch (err) {
      if (err instanceof RedactorBlockedError) {
        throw new ChatRedactionError(422, 'CONTENT_BLOCKED',
          'Content blocked by policy', {
            message_index: i,
            role: msg.role,
            detections: err.detections,
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
        ...d,
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