const User = require('../models/User');
const { audit } = require('../utils/audit');

const LIMIT_MAX = 100;
const ROLES = ['user', 'admin'];

function publicUser(user) {
  return {
    id: user._id,
    email: user.email,
    name: user.name,
    role: user.role,
    isBanned: user.isBanned,
    createdAt: user.createdAt,
  };
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isSelf(req, user) {
  return String(req.user.id) === String(user._id);
}

// GET /api/users?search=&limit=
exports.list = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), LIMIT_MAX);
    const filter = {};

    const search = (req.query.search || '').trim();
    if (search) {
      const re = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ email: re }, { name: re }];
    }

    const [users, total] = await Promise.all([
      User.find(filter).select('-passwordHash').sort({ createdAt: -1 }).limit(limit).lean(),
      User.countDocuments(filter),
    ]);
    res.json({ users: users.map(publicUser), total });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/users/:id/role   body: { "role": "user"|"admin" }
exports.setRole = async (req, res, next) => {
  try {
    const { role } = req.body || {};
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: `"role" must be one of: ${ROLES.join(', ')}` });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    // An admin demoting themselves would lose access immediately — refuse.
    if (isSelf(req, user) && role !== 'admin') {
      return res.status(400).json({ error: 'You cannot change your own role', code: 'SELF_ROLE_CHANGE' });
    }

    const from = user.role;
    user.role = role;
    await user.save();

    await audit(req, 'user.role_change', `user:${user._id}`, { email: user.email, from, to: role });
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/users/:id/ban   body: { "isBanned": true|false }
exports.setBan = async (req, res, next) => {
  try {
    const { isBanned } = req.body || {};
    if (typeof isBanned !== 'boolean') {
      return res.status(400).json({ error: '"isBanned" (boolean) is required' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (isSelf(req, user) && isBanned) {
      return res.status(400).json({ error: 'You cannot ban yourself', code: 'SELF_BAN' });
    }

    user.isBanned = isBanned;
    await user.save();

    await audit(req, isBanned ? 'user.ban' : 'user.unban', `user:${user._id}`, {
      email: user.email,
    });
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/users/:id
exports.remove = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (isSelf(req, user)) {
      return res.status(400).json({ error: 'You cannot delete your own account', code: 'SELF_DELETE' });
    }

    await user.deleteOne();
    await audit(req, 'user.delete', `user:${user._id}`, { email: user.email, role: user.role });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
};
