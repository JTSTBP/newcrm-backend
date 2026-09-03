const mongoose = require('mongoose');

const EmailSendLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    required: true
  },
  leadId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  pocId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  recipientEmail: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  sentAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['pending', 'success'],
    required: true,
    default: 'pending'
  },
  dayKey: {
    type: String,
    required: true
  },
  dailySlot: {
    type: Number,
    required: true,
    min: 1,
    max: 50
  },
  reservationExpiresAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

EmailSendLogSchema.index({ userId: 1, sentAt: 1, status: 1 });
EmailSendLogSchema.index({ userId: 1, dayKey: 1, dailySlot: 1 }, { unique: true });
EmailSendLogSchema.index({ reservationExpiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.EmailSendLog || mongoose.model('EmailSendLog', EmailSendLogSchema);
