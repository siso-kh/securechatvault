const luhn = require('./utils/luhn');
const strip = (s) => s.replace(/\D/g, '');

exports.DEFAULT_RULES = [
  { id: 'email',       pattern: '\\b[\\w.+-]+@[\\w-]+\\.[\\w.-]+',                          category: 'email',       severity: 'medium', action: 'mask' },
  { id: 'aws-key',     pattern: '\\bAKIA[0-9A-Z]{16}\\b',                                 category: 'api_key',     severity: 'high',   action: 'mask' },
  { id: 'api-key',     pattern: '\\bsk[-_](?:live|test|proj|svcacct)?[-_]?[A-Za-z0-9_-]{20,}\\b', category: 'api_key', severity: 'high',   action: 'mask' },
  { id: 'jwt',         pattern: '\\beyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\b', category: 'token',  severity: 'high',   action: 'mask' },
  { id: 'credit-card', pattern: '\\b\\d(?:[ -]?\\d){12,18}\\b',                            category: 'credit_card', severity: 'high',   action: 'mask',
                  validator: (m) => luhn(strip(m)) },
  { id: 'ipv4',        pattern: '\\b\\d{1,3}(?:\\.\\d{1,3}){3}\\b',                       category: 'ip_address',  severity: 'low',    action: 'mask' },
  { id: 'phone',       pattern: '\\+?\\b\\d[\\d -]{7,14}\\d\\b',                          category: 'phone',       severity: 'medium', action: 'mask' },
  { id: 'password',    pattern: '(?:password|pwd|pass)\\s*[:=]\\s*[^\\s,;]+',              category: 'password',    severity: 'high',   action: 'mask' },
];