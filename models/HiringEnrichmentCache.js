const mongoose = require('mongoose');

const HiringEnrichmentCacheSchema = new mongoose.Schema({
  cacheKey: { type: String, required: true, unique: true, index: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  pocId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  research: { type: mongoose.Schema.Types.Mixed, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: true });

module.exports = mongoose.models.HiringEnrichmentCache || mongoose.model('HiringEnrichmentCache', HiringEnrichmentCacheSchema);
