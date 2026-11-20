// scripts/mockRedactor.js
// Minimal stand-in for the redactor service. Real one will follow the same
// contract: POST /redact { text } -> 200 { maskedText, detections, blocked }
//                                  or 422 { blocked: true, detections }
const express = require('express');
const app = express();
app.use(express.json({ limit: '5mb' }));

const RULES = [
  { id: 'email',        action: 'mask',  pattern: /[\w.+-]+@[\w-]+\.[\w.-]+/g,       replace: '[EMAIL]' },
  { id: 'phone',        action: 'mask',  pattern: /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g, replace: '[PHONE]' },
  { id: 'ssn',          action: 'mask',  pattern: /\b\d{3}-\d{2}-\d{4}\b/g,           replace: '[SSN]' },
  { id: 'credit_card',  action: 'mask',  pattern: /\b(?:\d[ -]?){13,16}\b/g,          replace: '[CARD]' },
  { id: 'block_keyword', action: 'block', pattern: /\b(BOMB|TERRORIST|EXPLICIT_BAN)\b/i },
];

app.post('/redact', (req, res) => {
  const text = String(req.body?.text ?? '');
  let masked = text;
  const detections = [];
  let blocked = false;

  for (const rule of RULES) {
    if (rule.action === 'block') {
      if (rule.pattern.test(text)) {
        blocked = true;
        detections.push({ ruleId: rule.id, action: 'block' });
      }
    } else {
      masked = masked.replace(rule.pattern, (match) => {
        detections.push({ ruleId: rule.id, action: 'mask', match });
        return rule.replace;
      });
    }
  }

  if (blocked) return res.status(422).json({ blocked: true, detections });
  return res.json({ maskedText: masked, detections, blocked: false });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => console.log(`mock redactor on :${PORT}`));