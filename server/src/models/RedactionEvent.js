const mongoose = require('mongoose');

const redactionEventSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },
    ruleId: String,
    category: { type: String, index: true },
    action: { type: String, enum: ['mask', 'block', 'warn'], required: true },
    // never the raw value, only metadata
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

redactionEventSchema.index({ createdAt: -1 });

module.exports = mongoose.model('RedactionEvent', redactionEventSchema);