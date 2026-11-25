const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

function signToken(user) {
  return jwt.sign(
    { sub: user._id, role: user.role },   // payload
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Shape what we send back — never include passwordHash
function publicUser(user) {
  return {
    id: user._id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

exports.register = async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    // Check for duplicate email (Mongo unique index -> error code 11000)
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    const passwordHash = await bcrypt.hash(password, 10); // 10 = salt rounds
    const user = await User.create({ email, passwordHash, name });

    const token = signToken(user);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    next(err); // let the centralized error handler deal with it
  }
};
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const invalid = { error: 'Invalid email or password' };

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json(invalid);

    if (user.isBanned) {
      return res.status(403).json({ error: 'Account banned' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json(invalid);

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
};
// Admin sign-in with the passcode only: the account is resolved from
// ADMIN_EMAIL (falling back to the first admin) so the client never has to
// know or send an email address.
exports.adminLogin = async (req, res, next) => {
  try {
    const { passcode } = req.body || {};

    if (typeof passcode !== 'string' || passcode.length === 0) {
      return res.status(400).json({ error: 'Passcode is required' });
    }

    const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const user = email
      ? await User.findOne({ email })
      : await User.findOne({ role: 'admin' });

    const invalid = { error: 'Invalid passcode' };
    if (!user || user.role !== 'admin') return res.status(401).json(invalid);

    if (user.isBanned) {
      return res.status(403).json({ error: 'Account banned' });
    }

    const ok = await bcrypt.compare(passcode, user.passwordHash);
    if (!ok) return res.status(401).json(invalid);

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
};
exports.me = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('-passwordHash');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
};