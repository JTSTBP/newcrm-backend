const mongoose = require('mongoose');

const BDDailyReportSettingsSchema = new mongoose.Schema({
    enable12PmReport: { type: Boolean, default: true },
    enable7PmReport: { type: Boolean, default: true },
    ceoRecipients: [{ type: String, trim: true }],
    ccRecipients: [{ type: String, trim: true }],
    timezone: { type: String, default: 'Asia/Kolkata' },
    whatsappRecipients: [{ type: String, trim: true }]
}, { timestamps: true });

module.exports = mongoose.model('BDDailyReportSettings', BDDailyReportSettingsSchema);
