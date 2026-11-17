const luhn = require('./utils/luhn');
const strip = (s) => s.replace(/\D/g, '');

const R = String.raw; // avoids double-escaping, produces the same regex strings
const KV_TAIL = R`["']?\s*[:=]\s*`;
const VALUE   = R`(?:"[^"]*"|'[^']*'|[^\s,;]+)`;

exports.DEFAULT_RULES = [
  // ---- Secrets and credentials ----
  { id: 'private-key', category: 'private_key', severity: 'high', action: 'block',
    pattern: R`-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)` },
  { id: 'db-url', category: 'connection_string', severity: 'high', action: 'mask',
    pattern: R`\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp)://[^\s:@/]+:[^\s@/]+@\S+` },
  { id: 'aws-key', category: 'api_key', severity: 'high', action: 'mask',
    pattern: R`\b(?:AKIA|ASIA)[0-9A-Z]{16}\b` },
  { id: 'api-key', category: 'api_key', severity: 'high', action: 'mask',
    pattern: R`\bsk[-_](?:live|test|proj|svcacct)?[-_]?[A-Za-z0-9_-]{20,}\b` },
  { id: 'vendor-token', category: 'api_key', severity: 'high', action: 'mask',
    pattern: R`\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|gsk_[A-Za-z0-9]{20,})\b` },
  { id: 'jwt', category: 'token', severity: 'high', action: 'mask',
    pattern: R`\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*` },
  { id: 'bearer', category: 'token', severity: 'high', action: 'mask',
    pattern: R`(?<=\bBearer\s+)[A-Za-z0-9._~+/-]{16,}=*` },
  { id: 'password', category: 'password', severity: 'high', action: 'mask',
    pattern: R`(?<=(?:[\w-]*(?:password|passwd|pwd|mdp)|\bpass|mot de passe)${KV_TAIL})${VALUE}` },
  { id: 'secret-kv', category: 'secret', severity: 'high', action: 'mask',
    pattern: R`(?<=[\w-]*(?:secret|token|api[_-]?key|access[_-]?key)${KV_TAIL})${VALUE}` },
  { id: 'url-secret', category: 'secret', severity: 'medium', action: 'mask',
    pattern: R`(?<=[?&](?:token|access_token|api_key|apikey|key|secret|password|sig)=)[^&\s#]+` },

  // ---- Personal data ----
  { id: 'credit-card', category: 'credit_card', severity: 'high', action: 'mask',
    pattern: R`\b\d(?:[ -]?\d){12,18}\b`,
    validator: (m) => luhn(strip(m)) },
  { id: 'email', category: 'email', severity: 'medium', action: 'warn',
    pattern: R`\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b` },
  { id: 'phone-intl', category: 'phone', severity: 'medium', action: 'warn',
    pattern: R`(?<![\w.])\+\d{1,3}[ .-]?\(?\d{1,4}\)?(?:[ .-]?\d{2,4}){2,4}(?!\w)` },
  { id: 'ipv4', category: 'ip_address', severity: 'low', action: 'mask',
    pattern: R`\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b` },
];