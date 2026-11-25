const os = require('os');
const express = require('express');
const { applyRules } = require('./engine');

const app = express();
// 200kb: the backend allows 100kb messages and adds the rules to the body
app.use(express.json({ limit: '200kb' }));

app.post('/redact', (req, res) => {
  const { text, rules } = req.body || {};
  if (typeof text !== 'string') {
    return res.status(400).json({ error: '"text" (string) is required' });
  }
  if (rules !== undefined && !Array.isArray(rules)) {
    return res.status(400).json({ error: '"rules" must be an array' });
  }
  res.json({ ...applyRules(text, rules || []), servedBy: os.hostname() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'redactor', servedBy: os.hostname() });
});

// Malformed JSON, oversized body, etc. -> JSON errors instead of HTML
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('[redactor]', err.message);
  res.status(status).json({ error: status === 413 ? 'Payload too large' : status < 500 ? 'Bad request' : 'Server error' });
});

module.exports = app;