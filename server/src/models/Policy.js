
const mongoose = require('mongoose');

// "api key" -> "API_KEY": the category becomes the [API_KEY] placeholder
function normalizeCategory(v) {
  if (typeof v !== 'string') return v;
  return v.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

const policySchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 80, unique: true },
    pattern: { type: String, required: [true, 'Pattern is required'], maxlength: 200 },
    category: {
      type: String,
      required: [true, 'Category is required'],
      set: normalizeCategory,
      match: [/^[A-Z][A-Z0-9_]{1,39}$/, 'Category must be 2-40 chars, letters/digits/underscore, starting with a letter'],
    },
    severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    action: { type: String, enum: ['mask', 'block', 'warn'], required: [true, 'Action is required'] },
    enabled: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Policy', policySchema);