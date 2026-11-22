const { redact, RedactorBlockedError, RedactorUnavailableError,
        RedactorBadInputError, RedactorInvalidResponseError } = require('../src/services/redactorClient');

const mockFetch = (impl) => { global.fetch = jest.fn(impl); };
afterEach(() => jest.restoreAllMocks());

test('200 valid → returns body', async () => {
  mockFetch(async () => new Response(JSON.stringify({
    maskedText: 'hi [EMAIL]', detections: [], blocked: false,
  }), { status: 200, headers: { 'content-type': 'application/json' } }));
  await expect(redact('hi a@b.co')).resolves.toMatchObject({ maskedText: 'hi [EMAIL]' });
});

test('200 with blocked:true → RedactorBlockedError with detections', async () => {
  mockFetch(async () => new Response(JSON.stringify({
    maskedText: 'secret', detections: [{ ruleId: 'private-key', action: 'block' }],
    blocked: true,
  }), { status: 200, headers: { 'content-type': 'application/json' } }));
  const err = await redact('secret').catch((e) => e);
  expect(err).toBeInstanceOf(RedactorBlockedError);
  expect(err.detections).toEqual([{ ruleId: 'private-key', action: 'block' }]);
});

test('422 → RedactorBlockedError with detections', async () => {
  mockFetch(async () => new Response(JSON.stringify({
    blocked: true, detections: [{ ruleId: 'x', action: 'block' }],
  }), { status: 422 }));
  await expect(redact('secret')).rejects.toBeInstanceOf(RedactorBlockedError);
});

test('500 → RedactorUnavailableError', async () => {
  mockFetch(async () => new Response('', { status: 500 }));
  await expect(redact('hi')).rejects.toBeInstanceOf(RedactorUnavailableError);
});

test('400 → RedactorBadInputError', async () => {
  mockFetch(async () => new Response(JSON.stringify({ error: 'bad' }), { status: 400 }));
  await expect(redact('hi')).rejects.toBeInstanceOf(RedactorBadInputError);
});

test('200 with bad shape → RedactorInvalidResponseError', async () => {
  mockFetch(async () => new Response(JSON.stringify({ error: 'oops' }), { status: 200 }));
  await expect(redact('hi')).rejects.toBeInstanceOf(RedactorInvalidResponseError);
});

test('network error → RedactorUnavailableError', async () => {
  mockFetch(async () => { throw new TypeError('ECONNREFUSED'); });
  await expect(redact('hi')).rejects.toBeInstanceOf(RedactorUnavailableError);
});

test('timeout → RedactorUnavailableError', async () => {
  mockFetch((_url, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  }));
  // shorten timeout for test, or use fake timers
  await expect(redact('hi')).rejects.toBeInstanceOf(RedactorUnavailableError);
}, 10_000);