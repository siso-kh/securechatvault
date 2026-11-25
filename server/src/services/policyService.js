const Policy = require('../models/Policy');

const TTL_MS = Number(process.env.POLICY_CACHE_TTL_MS) || 15000;

// The redactor lets the first rule claim a span, so order matters:
// block first, then mask, then warn (a warn rule must not steal a masked span).
const ACTION_ORDER = { block: 0, mask: 1, warn: 2 };

let cache = null; // { rules, byId, expiresAt }

async function getActive() {
  if (cache && cache.expiresAt > Date.now()) return cache;

  const docs = await Policy.find({ enabled: true }).lean();
  docs.sort(
    (a, b) =>
      ACTION_ORDER[a.action] - ACTION_ORDER[b.action] ||
      String(a._id).localeCompare(String(b._id))
  );

  cache = {
    rules: docs.map((p) => ({
      id: String(p._id),
      pattern: p.pattern,
      category: p.category,
      severity: p.severity,
      action: p.action,
    })),
    byId: new Map(docs.map((p) => [String(p._id), { name: p.name, severity: p.severity }])),
    expiresAt: Date.now() + TTL_MS,
  };
  return cache;
}

// Called after every policy write. Only clears THIS process: with several
// backend replicas the others refresh within TTL_MS (15 s).
function invalidate() {
  cache = null;
}

module.exports = { getActive, invalidate };
