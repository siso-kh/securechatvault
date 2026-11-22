const REDACTOR_URL = process.env.REDACTOR_URL || 'http://localhost:4000';
const TIMEOUT_MS = 5000;

class RedactorError extends Error {
  constructor(msg, opts) { super(msg, opts); this.name = 'RedactorError'; }
}
class RedactorBlockedError extends RedactorError {
  constructor(detections) { super('Content blocked'); this.name = 'RedactorBlockedError'; this.detections = detections; }
}
class RedactorUnavailableError extends RedactorError {
  constructor(cause) { super('Redactor unavailable', { cause }); this.name = 'RedactorUnavailableError'; }
}
class RedactorBadInputError extends RedactorError {
  constructor(msg) { super(msg); this.name = 'RedactorBadInputError'; }
}
class RedactorInvalidResponseError extends RedactorError {
  constructor(body) { super('Invalid redactor response'); this.name = 'RedactorInvalidResponseError'; this.body = body; }
}

/**
 * Calls the redactor. Throws one of:
 *   RedactorBlockedError          (422 — message contains blocked content)
 *   RedactorUnavailableError      (timeout, network, 5xx)
 *   RedactorBadInputError         (400 — caller bug, never retry)
 *   RedactorInvalidResponseError  (200 with unexpected shape — treat as 500)
 * The caller decides what "fail closed" means per error class.
 */
async function redact(text, rules = undefined) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${REDACTOR_URL}/redact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, rules }),
      signal: controller.signal,
    });
  } catch (err) {
    // AbortError (timeout) or network error (DNS, ECONNREFUSED)
  $console.error('[redactor]', err.name, err.cause?.code || err.message);    throw new RedactorUnavailableError(err);
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 422) {
    const body = await res.json().catch(() => ({}));
    throw new RedactorBlockedError(body.detections || []);
  }
  if (res.status === 400) {
    const body = await res.json().catch(() => ({}));
    throw new RedactorBadInputError(body.error || 'Redactor rejected request');
  }
  if (!res.ok) {
    console.error('[redactor] status', res.status);
    throw new RedactorUnavailableError(new Error(`status ${res.status}`));
  }

  const body = await res.json().catch(() => null);
  if (
    !body ||
    typeof body.maskedText !== 'string' ||
    !Array.isArray(body.detections) ||
    typeof body.blocked !== 'boolean'
  ) {
    console.error('[redactor] invalid response shape', Object.keys(body || {}));
    throw new RedactorInvalidResponseError(body);
  }
  // The redactor reports a policy block as 200 + `blocked: true`.
  // Treat it as a rejection so blocked text is never forwarded upstream.
  if (body.blocked === true) {
    throw new RedactorBlockedError(body.detections);
  }
  return body;
}

module.exports = {
  redact,
  RedactorError,
  RedactorBlockedError,
  RedactorUnavailableError,
  RedactorBadInputError,
  RedactorInvalidResponseError,
};