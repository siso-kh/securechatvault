const router = require('express').Router();
const { auth } = require('../middlewares/auth');
const {
  chatCompletion,
  RouterUpstreamError,
  RouterUnavailableError,
} = require('../services/routerClient');
const {
  redactMessages,
  ChatRedactionError,
} = require('../services/redactorPipeline');

router.post('/', auth, async (req, res, next) => {
  const { messages, task, model, temperature, max_tokens, redact_response } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages[] is required' });
  }

  // 1. Redact outbound — before the LLM ever sees the text.
  let redaction;
  try {
    redaction = await redactMessages(messages);
  } catch (err) {
    if (err instanceof ChatRedactionError) {
      return res.status(err.status).json({
        error: err.message,
        code: err.code,
        redactor_report: {
          blocked: err.code === 'CONTENT_BLOCKED',
          ...err.details,
        },
      });
    }
    return next(err);
  }

  // 2. Call the gateway with MASKED messages.
  const target = model || (task ? `router/auto:${task}` : 'router/auto');
  const extraHeaders = {};
  if (req.headers['x-router-task']) {
    extraHeaders['X-Router-Task'] = String(req.headers['x-router-task']);
  }

  let llmResult;
  try {
    llmResult = await chatCompletion({
      model: target,
      messages: redaction.maskedMessages,
      temperature,
      max_tokens,
      extraHeaders,
    });
  } catch (err) {
    if (err instanceof RouterUpstreamError) {
      for (const [k, v] of Object.entries(err.headers)) res.set(k, v);
      return res.status(err.status).json({
        ...err.body,
        redactor_report: redaction.report,
      });
    }
    if (err instanceof RouterUnavailableError) {
      return res.status(502).json({
        error: 'Router unavailable',
        redactor_report: redaction.report,
      });
    }
    return next(err);
  }

  // 3. Relay router headers (X-Router-Model / -Task / -Hops / -Latency-Ms).
  for (const [k, v] of Object.entries(llmResult.headers)) res.set(k, v);

  // 4. Optionally redact the assistant's reply too (default off).
  let responseBody = llmResult.body;
  if (redact_response === true && Array.isArray(responseBody.choices)) {
    const assistantMessages = responseBody.choices.map((c) => c.message);
    try {
      const inbound = await redactMessages(assistantMessages);
      responseBody = {
        ...responseBody,
        choices: responseBody.choices.map((c, i) => ({
          ...c,
          message: inbound.maskedMessages[i],
        })),
      };
      redaction.report.inbound = inbound.report;
    } catch (err) {
      // Inbound redaction failure should not destroy a valid reply —
      // log it, leave the reply as-is, and record it in the report.
      console.error('[chat] inbound redaction failed', err.message);
      redaction.report.inbound = { error: err.message };
    }
  }

  // 5. Return completion + report.
  return res.json({
    ...responseBody,
    redactor_report: redaction.report,
  });
});

module.exports = router;