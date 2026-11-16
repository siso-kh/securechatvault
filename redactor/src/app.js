const os = require('os');
const express = require('express');
const { applyRules, validateRules } = require('./engine');
const { DEFAULT_RULES } = require('./rules');


const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

const REDACTION_TIMEOUT_MS = 500;

app.post('/redact', (req, res) => {
  const body = req.body || {};
  const { text } = body;

  if (typeof text !== 'string') {
    return res.status(400).json({ error: '"text" (string) is required' });
  }

  const ruleError = validateRules(body.rules);
  if (ruleError) {
    return res.status(400).json({ error: ruleError });
  }

  // Omitting "rules" means "apply the default policy". An explicit empty
  // array still means "run no rules".
  const policy = body.rules == null ? DEFAULT_RULES : body.rules;

  const timedOut = { value: false };
  const result = applyRules(text, policy, {
    deadline: Date.now() + REDACTION_TIMEOUT_MS,
    timedOut,
  });

  if (timedOut.value) {
    return res.status(503).json({ error: 'Redaction timed out' });
  }

  res.json({ ...result, servedBy: os.hostname() });
});


app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'redactor' });
});

app.use((err, req, res, _next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload too large' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;