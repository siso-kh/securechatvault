const router = require('express').Router();
const { auth } = require('../middlewares/auth');
const Conversation = require('../models/Conversation');
const RedactionEvent = require('../models/RedactionEvent');
const {
  chatCompletion,
  RouterUpstreamError,
  RouterUnavailableError,
} = require('../services/routerClient');
const {
  redactMessages,
  ChatRedactionError,
} = require('../services/redactorPipeline');

// Stores metadata only (category, rule, action), never the matched value.
async function logEvents(userId, conversationId, detections) {
  const docs = detections.map((d) => ({
    userId,
    conversationId,
    ruleId: d.ruleId,
    category: d.category,
    action: d.action,
  }));
  if (!docs.length) return;
  try {
    await RedactionEvent.insertMany(docs);
  } catch (e) {
    console.error('[events]', e.message);
  }
}

router.post('/', auth, async (req, res, next) => {
  try {
    const { messages, conversationId, task, model, temperature, max_tokens, redact_response } =
      req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages[] is required' });
    }
    const lastIndex = messages.length - 1;

    // 0. Ownership check before anything else (a bad id format goes to errorHandler -> 400)
    let conversation = null;
    if (conversationId) {
      conversation = await Conversation.findOne({ _id: conversationId, userId: req.user.id });
      if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    }

    // 1. Redact outbound, before the LLM ever sees the text.
    let redaction;
    try {
      redaction = await redactMessages(messages);
    } catch (err) {
      if (err instanceof ChatRedactionError) {
        if (err.code === 'CONTENT_BLOCKED' && err.details.message_index === lastIndex) {
          await logEvents(
            req.user.id,
            conversation?._id,
            (err.details.detections || []).map((d) => ({ ...d, action: 'block' }))
          );
        }
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
        return res.status(err.status).json({ ...err.body, redactor_report: redaction.report });
      }
      if (err instanceof RouterUnavailableError) {
        return res.status(502).json({
          error: 'Router unavailable',
          redactor_report: redaction.report,
        });
      }
      return next(err);
    }

    // 3. Relay router headers.
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
        console.error('[chat] inbound redaction failed', err.message);
        redaction.report.inbound = { error: err.message };
      }
    }

    // 5. Persist, then return.
    const userMsg = redaction.maskedMessages[lastIndex];
    const reply = responseBody.choices?.[0]?.message?.content ?? '';
    const lastDetections = redaction.report.detections.filter((d) => d.message_index === lastIndex);

    if (!conversation) {
      conversation = new Conversation({
        userId: req.user.id,
        title: (userMsg.content || '').slice(0, 60) || 'New conversation',
      });
    }
    conversation.messages.push(
      {
        role: 'user',
        content: userMsg.content,
        maskedContent: userMsg.content,
        redacted: lastDetections.some((d) => d.action === 'mask'),
      },
      { role: 'assistant', content: reply, maskedContent: reply }
    );
    await conversation.save();
    await logEvents(req.user.id, conversation._id, lastDetections);

    return res.json({
      ...responseBody,
      conversation_id: conversation._id,
      masked_messages: redaction.maskedMessages,
      redactor_report: redaction.report,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;