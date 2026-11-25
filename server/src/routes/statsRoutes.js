const router = require('express').Router();
const mongoose = require('mongoose');
const { auth } = require('../middlewares/auth');
const RedactionEvent = require('../models/RedactionEvent');
const Conversation = require('../models/Conversation');
const Policy = require('../models/Policy');

router.use(auth);

const PRIORITY = { block: 0, mask: 1, warn: 2 };

// GET /api/stats/me
router.get('/me', async (req, res, next) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    // One row per message: events share a batchId (older events fall back to their own _id)
    const groups = await RedactionEvent.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: { $ifNull: ['$batchId', '$_id'] },
          createdAt: { $min: '$createdAt' },
          conversationId: { $first: '$conversationId' },
          events: { $push: { ruleId: '$ruleId', action: '$action' } },
          categories: { $addToSet: '$category' },
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: 200 },
    ]);

    // Titles for the conversations that exist
    const convIds = groups.map((g) => g.conversationId).filter(Boolean);
    const convs = await Conversation.find({ _id: { $in: convIds } }).select('title');
    const titles = new Map(convs.map((c) => [String(c._id), c.title]));

    // Rule names/severity for the policies that still exist
    const ruleIds = [
      ...new Set(
        groups.flatMap((g) => g.events.map((e) => e.ruleId)).filter(Boolean).map(String)
      ),
    ].filter((id) => mongoose.isValidObjectId(id));
    const policies = await Policy.find({ _id: { $in: ruleIds } }).select('name severity');
    const policyById = new Map(policies.map((p) => [String(p._id), p]));

    const items = groups.map((g) => {
      const actions = g.events.map((e) => e.action);
      const count = (a) => actions.filter((x) => x === a).length;
      const status = count('block') ? 'blocked' : count('mask') ? 'masked' : 'warned';

      // The "main" rule of a message: block > mask > warn
      const main = [...g.events]
        .filter((e) => e.ruleId)
        .sort((a, b) => PRIORITY[a.action] - PRIORITY[b.action])[0];
      const policy = main ? policyById.get(String(main.ruleId)) : null;

      return {
        id: String(g._id),
        createdAt: g.createdAt,
        conversationId: g.conversationId ?? null,
        title: titles.get(String(g.conversationId)) || 'Untitled message',
        status,
        categories: g.categories.filter(Boolean),
        maskedCount: count('mask'),
        ruleName: policy ? policy.name : null,
        severity: policy ? policy.severity : null,
      };
    });

    // Messages sent = user messages saved in the user's conversations
    const [sent] = await Conversation.aggregate([
      { $match: { userId } },
      { $unwind: '$messages' },
      { $match: { 'messages.role': 'user' } },
      { $count: 'n' },
    ]);

    res.json({
      totals: {
        messagesSent: sent?.n ?? 0,
        protectedCount: items.filter((i) => i.status !== 'warned').length,
      },
      items,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;