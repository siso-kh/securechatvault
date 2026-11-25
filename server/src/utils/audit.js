const AuditLog = require('../models/AuditLog');

// One helper for every admin action. Never throws: a failed audit write
// must not break the admin action itself (it is logged to the console).
async function audit(req, action, target, meta) {
  try {
    await AuditLog.create({ actorId: req.user.id, action, target, meta });
  } catch (err) {
    console.error('[audit]', err.message);
  }
}

module.exports = { audit };
