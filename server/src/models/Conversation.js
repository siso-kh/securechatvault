const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true,
    },
    content: {              // what is shown/stored — masked if redaction happened
      type: String,
      required: true,
    },
    maskedContent: {        // the masked version actually sent to the LLM (same as content if no redaction)
      type: String,
    },
    redacted: {             // quick flag: were any secrets masked in this message?
      type: Boolean,
      default: false,
    },
    servedBy: {             // which redactor pod handled it (visible in k8s demo)
      type: String,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }            // messages don't need their own ids for this project
);

const conversationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,          // we always query "conversations of user X"
    },
    title: {
      type: String,
      trim: true,
      maxlength: 100,
      default: 'New conversation',
    },
    messages: [messageSchema],   // embedded — always read together, per project doc
  },
  { timestamps: true }
);

module.exports = mongoose.model('Conversation', conversationSchema);