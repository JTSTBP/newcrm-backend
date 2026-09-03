const mongoose = require('mongoose');

const AiGenerationUsageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
  dateKey: { type: String, required: true },
  count: { type: Number, default: 0 }
}, { timestamps: true });

AiGenerationUsageSchema.index({ userId: 1, dateKey: 1 }, { unique: true });

module.exports = mongoose.models.AiGenerationUsage || mongoose.model('AiGenerationUsage', AiGenerationUsageSchema);
