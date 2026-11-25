const Policy = require('../models/Policy');
const policyService = require('../services/policyService');
const { validatePattern } = require('../utils/regexSafety');
const { audit } = require('../utils/audit');

const EDITABLE = ['name', 'pattern', 'category', 'severity', 'action', 'enabled'];

function badPattern(res, problem) {
  return res.status(400).json({ error: problem, code: 'INVALID_PATTERN' });
}

// GET /api/policies
exports.list = async (req, res, next) => {
  try {
    const policies = await Policy.find().sort({ createdAt: -1 });
    res.json({ policies });
  } catch (err) {
    next(err);
  }
};

// POST /api/policies
exports.create = async (req, res, next) => {
  try {
    const { name, pattern, category, severity, action, enabled } = req.body || {};

    const problem = validatePattern(pattern);
    if (problem) return badPattern(res, problem);

    const policy = await Policy.create({
      name, pattern, category, severity, action, enabled,
      createdBy: req.user.id,
    });
    policyService.invalidate();
    await audit(req, 'policy.create', `policy:${policy._id}`, {
      name: policy.name, category: policy.category, action: policy.action,
    });
    res.status(201).json({ policy });
  } catch (err) {
    next(err);
  }
};

// PUT /api/policies/:id
exports.update = async (req, res, next) => {
  try {
    const policy = await Policy.findById(req.params.id);
    if (!policy) return res.status(404).json({ error: 'Policy not found' });

    const body = req.body || {};
    if (body.pattern !== undefined) {
      const problem = validatePattern(body.pattern);
      if (problem) return badPattern(res, problem);
    }
    for (const key of EDITABLE) {
      if (body[key] !== undefined) policy[key] = body[key];   // whitelist: no mass assignment
    }
    await policy.save();                                      // runs validators + category setter

    policyService.invalidate();
    await audit(req, 'policy.update', `policy:${policy._id}`, {
      name: policy.name,
      changed: EDITABLE.filter((k) => body[k] !== undefined),
    });
    res.json({ policy });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/policies/:id/enabled   body: { "enabled": true|false }
exports.setEnabled = async (req, res, next) => {
  try {
    const { enabled } = req.body || {};
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: '"enabled" (boolean) is required' });
    }
    const policy = await Policy.findByIdAndUpdate(req.params.id, { enabled }, { returnDocument: 'after' });
    if (!policy) return res.status(404).json({ error: 'Policy not found' });

    policyService.invalidate();
    await audit(req, 'policy.toggle', `policy:${policy._id}`, { name: policy.name, enabled });
    res.json({ policy });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/policies/:id
exports.remove = async (req, res, next) => {
  try {
    const policy = await Policy.findByIdAndDelete(req.params.id);
    if (!policy) return res.status(404).json({ error: 'Policy not found' });

    policyService.invalidate();
    await audit(req, 'policy.delete', `policy:${policy._id}`, { name: policy.name });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
};