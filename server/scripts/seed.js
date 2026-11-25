const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');
const Policy = require('../src/models/Policy');
const { validatePattern } = require('../src/utils/regexSafety');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/securechat';

// Flags are always "gi" (set by the redactor engine).
const DEFAULT_POLICIES = [
  { name: 'AWS access key', category: 'AWS_KEY', severity: 'high', action: 'block',
    pattern: String.raw`\b(?:AKIA|ASIA)[0-9A-Z]{16}\b` },
  { name: 'Private key (PEM)', category: 'PRIVATE_KEY', severity: 'high', action: 'block',
    pattern: String.raw`-----BEGIN (?:[A-Z]{2,10} ){0,3}PRIVATE KEY-----` },
  { name: 'API key / token', category: 'API_KEY', severity: 'high', action: 'mask',
    pattern: String.raw`\b(?:sk-[a-z0-9_-]{20,}|gh[pousr]_[a-z0-9]{36,}|AIza[a-z0-9_-]{35}|gsk_[a-z0-9]{20,}|xox[baprs]-[a-z0-9-]{10,}|sk_live_[a-z0-9]{16,})` },
  { name: 'Password after keyword', category: 'PASSWORD', severity: 'high', action: 'mask',
    pattern: String.raw`(?<=\b(?:password|passwd|pwd|passphrase|mot de passe|mdp)\s{0,3}[:=]\s{0,3})\S{1,128}` },
  { name: 'Credit card number', category: 'CREDIT_CARD', severity: 'high', action: 'mask',
    pattern: String.raw`\b(?:\d{4}(?:[ -]?\d{4}){3}|3[47]\d{2}[ -]?\d{6}[ -]?\d{5})\b` },
  { name: 'JWT', category: 'JWT', severity: 'high', action: 'mask',
    pattern: String.raw`\beyJ[a-z0-9_-]{5,}\.eyJ[a-z0-9_-]{5,}\.[a-z0-9_-]{5,}` },
  { name: 'Database connection string', category: 'DB_CONNECTION_STRING', severity: 'high', action: 'mask',
    pattern: String.raw`\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp)://[^\s'"]{3,200}` },
  { name: 'IPv4 address', category: 'IP_ADDRESS', severity: 'medium', action: 'mask',
    pattern: String.raw`\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b` },
  { name: 'Email address', category: 'EMAIL', severity: 'low', action: 'warn',
    pattern: String.raw`\b[a-z0-9._%+-]{1,64}@(?:[a-z0-9-]{1,63}\.){1,4}[a-z]{2,24}\b` },
  { name: 'Phone number', category: 'PHONE', severity: 'low', action: 'warn',
    pattern: String.raw`(?<!\d)(?:(?:\+|00)\d{1,3}(?:[\s.-]?\d{2,4}){2,4}|\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})(?!\d)` },
];

async function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';

  if (!email || password.length < 8) {
    console.warn('! ADMIN_EMAIL / ADMIN_PASSWORD missing (password: 8+ chars) -> admin not created');
    return User.findOne({ role: 'admin' });
  }

  let admin = await User.findOne({ email });
  if (!admin) {
    admin = await User.create({
      email,
      name: process.env.ADMIN_NAME || 'Administrator',
      passwordHash: await bcrypt.hash(password, 10),
      role: 'admin',
    });
    console.log(`+ admin created: ${email}`);
  } else if (admin.role !== 'admin') {
    admin.role = 'admin';
    await admin.save();
    console.log(`~ existing user promoted to admin: ${email}`);
  } else {
    console.log(`= admin already exists: ${email}`);
  }
  return admin;
}

async function main() {
  await mongoose.connect(MONGO_URI);
  await Promise.all([User.init(), Policy.init()]);   // make sure unique indexes exist

  const admin = await ensureAdmin();

  let added = 0;
  for (const p of DEFAULT_POLICIES) {
    const problem = validatePattern(p.pattern);
    if (problem) throw new Error(`Default policy "${p.name}" has a bad pattern: ${problem}`);

    // $setOnInsert: re-running never overwrites edits made by the admin
    const r = await Policy.updateOne(
      { name: p.name },
      { $setOnInsert: { ...p, enabled: true, ...(admin ? { createdBy: admin._id } : {}) } },
      { upsert: true }
    );
    if (r.upsertedCount) added++;
  }
  console.log(`policies: ${added} added, ${DEFAULT_POLICIES.length - added} already present`);
}

main()
  .catch((err) => { console.error('Seed failed:', err.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());