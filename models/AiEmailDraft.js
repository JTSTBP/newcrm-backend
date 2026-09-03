const mongoose = require('mongoose');

const AiEmailDraftSchema = new mongoose.Schema({
  cacheKey: { type: String, required: true, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, required: true },
  pocId: { type: mongoose.Schema.Types.ObjectId, required: true },
  promptVersion: { type: String, required: true },
  model: { type: String, required: true },
  subject: { type: String, required: true },
  content: { type: mongoose.Schema.Types.Mixed, required: true },
  htmlBody: { type: String },
  plainText: { type: String },
  research: { type: mongoose.Schema.Types.Mixed, required: true },
  enrichment: { type: mongoose.Schema.Types.Mixed },
  diagnostics: { type: mongoose.Schema.Types.Mixed },
  jobDiscovery: { type: mongoose.Schema.Types.Mixed },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: true });

module.exports = mongoose.models.AiEmailDraft || mongoose.model('AiEmailDraft', AiEmailDraftSchema);
