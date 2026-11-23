const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Same shape as the policies the backend will load from MongoDB.
const RULES = [
  { name: 'AWS access key', label: 'AWS access keys', category: 'AWS_KEY', pattern: /AKIA[0-9A-Z]{16}/g, action: 'block' },
  { name: 'API key', label: 'API keys', category: 'API_KEY', pattern: /sk-[A-Za-z0-9]{16,}/g, action: 'mask' },
  { name: 'Email', label: 'emails', category: 'EMAIL', pattern: /[\w.+-]+@[\w-]+\.[\w.-]+/g, action: 'mask' },
  { name: 'Credit card', label: 'card numbers', category: 'CARD_NUMBER', pattern: /\b(?:\d[ -]?){13,16}\b/g, action: 'mask' },
  { name: 'IP address', label: 'IP addresses', category: 'IP_ADDRESS', pattern: /\b\d{1,3}(?:\.\d{1,3}){3}\b/g, action: 'warn' },
];



export async function sendMessage({ text }) {
  await wait(300); // redactor call

  // 1. Block rules are checked against the raw text first
  const blocking = RULES.find((r) => r.action === 'block' && text.match(r.pattern));
  if (blocking) throw new BlockedError(blocking);

  // 2. Mask
  let masked = text;
  let count = 0;
  for (const rule of RULES) {
    if (rule.action !== 'mask') continue;
    const found = masked.match(rule.pattern);
    if (found) {
      count += found.length;
      masked = masked.replace(rule.pattern, `[${rule.category}]`);
    }
  }

  await wait(900); // LLM call

    const reply = count
  ? `${count === 1 ? 'One value was' : `${count} values were`} replaced before this reached the model. If it was real, rotate it, then paste the new one.`
  : 'Your notes stay in the vault. Three releases this week; two rolled back to the earlier tag.';

  const now = new Date().toISOString();
  return {
    user: { id: crypto.randomUUID(), role: 'user', content: masked, createdAt: now },
    assistant: { id: crypto.randomUUID(), role: 'assistant', content: reply, createdAt: now },
  };
}