const mongoose = require('mongoose');

const BDDailyReportHistorySchema = new mongoose.Schema({
    reportType: { type: String, enum: ['12PM', '7PM'], required: true },
    title: { type: String, required: true },
    reportDate: { type: String, required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    generatedAt: { type: Date, default: Date.now },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users', default: null },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    email: {
        status: { type: String, enum: ['Not Sent', 'Sent', 'Failed', 'Skipped'], default: 'Not Sent' },
        sentAt: { type: Date },
        error: { type: String },
        recipients: [{ type: String }]
    },
    whatsapp: {
        status: { type: String, enum: ['Not Sent', 'Sent', 'Failed', 'Skipped'], default: 'Not Sent' },
        sentAt: { type: Date },
        error: { type: String },
        recipients: [{ type: String }]
    },
    status: { type: String, enum: ['Success', 'Failed'], default: 'Success' },
    error: { type: String }
}, { timestamps: true });

BDDailyReportHistorySchema.index({ reportDate: -1, reportType: 1 });

module.exports = mongoose.model('BDDailyReportHistory', BDDailyReportHistorySchema);
