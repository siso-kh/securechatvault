const AuditLog = require('../models/AuditLog');
const User = require('../models/User');

const LIMIT_MAX = 200;

// GET /api/audit?limit=&action=&actorId=
exports.list = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), LIMIT_MAX);
    const filter = {};
    if (req.query.action) filter.action = req.query.action;
    if (req.query.actorId) filter.actorId = req.query.actorId;

    // _id breaks ties between actions written in the same millisecond
    const logs = await AuditLog.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();

    // Attach who did it without exposing password hashes.
    const actors = await User.find({ _id: { $in: logs.map((l) => l.actorId) } })
      .select('email name')
      .lean();
    const byId = new Map(actors.map((u) => [String(u._id), u]));

    res.json({
      logs: logs.map((l) => {
        const actor = byId.get(String(l.actorId));
        return {
          id: l._id,
          action: l.action,
          target: l.target,
          meta: l.meta,
          createdAt: l.createdAt,
          actor: actor ? { id: actor._id, email: actor.email, name: actor.name } : null,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
};
