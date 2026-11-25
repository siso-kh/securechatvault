const Conversation = require('../models/Conversation');

// POST /api/conversations
exports.create = async (req, res, next) => {
  try {
    const conv = await Conversation.create({
      userId: req.user.id,                 // from the auth middleware — never from the body
      title: req.body.title || 'New conversation',
    });
    res.status(201).json({ conversation: conv });
  } catch (err) {
    next(err);
  }
};

// GET /api/conversations
exports.list = async (req, res, next) => {
  try {
    const conversations = await Conversation.find({ userId: req.user.id })
      .select('title updatedAt createdAt')  // message bodies not needed for the list view
      .sort({ updatedAt: -1 });               // most recent first
    res.json({ conversations });
  } catch (err) {
    next(err);
  }
};

// GET /api/conversations/:id
exports.get = async (req, res, next) => {
  try {
    const conv = await Conversation.findOne({
      _id: req.params.id,
      userId: req.user.id,     // ownership is part of the query itself
    });
    if (!conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json({ conversation: conv });
  } catch (err) {
    next(err);
  }
};

// PUT /api/conversations/:id  (rename)
exports.update = async (req, res, next) => {
  try {
    const conv = await Conversation.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { title: req.body.title },
      { returnDocument: 'after', runValidators: true }  // return the updated doc, validate the title
    );
    if (!conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json({ conversation: conv });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/conversations/:id
exports.remove = async (req, res, next) => {
  try {
    const conv = await Conversation.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
    });
    if (!conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
};