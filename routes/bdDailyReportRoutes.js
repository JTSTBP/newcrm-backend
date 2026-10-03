const express = require('express');
const auth = require('../middleware/authMiddleware');
const BDDailyReportHistory = require('../models/BDDailyReportHistory');
const {
    getOrCreateSettings,
    generateReportData,
    renderHtmlReport,
    renderWhatsappReport,
    sendEmailReport,
    sendWhatsappReport,
    saveReportHistory
} = require('../services/bdDailyReportService');

const router = express.Router();

const requireAdmin = (req, res) => {
    if (req.user.role !== 'Admin') {
        res.status(403).json({ message: 'Access denied. Admins only.' });
        return false;
    }
    return true;
};

router.get('/settings', auth, async (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json(await getOrCreateSettings());
});

router.put('/settings', auth, async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const settings = await getOrCreateSettings();
    const fields = ['enable12PmReport', 'enable7PmReport', 'ceoRecipients', 'ccRecipients', 'timezone', 'whatsappRecipients'];
    fields.forEach((field) => {
        if (req.body[field] !== undefined) settings[field] = req.body[field];
    });
    await settings.save();
    res.json(settings);
});

router.get('/generate', auth, async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const report = await generateReportData({ reportType: req.query.reportType || '12PM', date: req.query.date });
    res.json(report);
});

router.post('/generate', auth, async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const report = await generateReportData({ reportType: req.body.reportType || '12PM', date: req.body.date });
    const history = await saveReportHistory({ report, generatedBy: req.user.id, sendEmail: false, sendWhatsapp: false });
    res.status(201).json(history);
});

router.post('/send', auth, async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const report = await generateReportData({ reportType: req.body.reportType || '12PM', date: req.body.date });
    const history = await saveReportHistory({ report, generatedBy: req.user.id, sendEmail: true, sendWhatsapp: true });
    res.status(201).json(history);
});

router.post('/test', auth, async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const settings = await getOrCreateSettings();
    const report = await generateReportData({ reportType: req.body.reportType || '12PM', date: req.body.date });
    const email = await sendEmailReport(report, settings);
    const whatsapp = await sendWhatsappReport(report, settings).catch((err) => ({ status: 'Failed', error: err.message, recipients: settings.whatsappRecipients || [] }));
    res.json({ email, whatsapp, whatsappPreview: renderWhatsappReport(report) });
});

router.get('/history', auth, async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const history = await BDDailyReportHistory.find()
        .select('-data.executiveRows.executiveId')
        .sort({ generatedAt: -1 })
        .limit(Number(req.query.limit) || 30);
    res.json(history);
});

router.get('/history/:id', auth, async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const history = await BDDailyReportHistory.findById(req.params.id);
    if (!history) return res.status(404).json({ message: 'Report not found.' });
    res.json(history);
});

router.post('/history/:id/send', auth, async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const history = await BDDailyReportHistory.findById(req.params.id);
    if (!history) return res.status(404).json({ message: 'Report not found.' });
    const settings = await getOrCreateSettings();
    try {
        const result = await sendEmailReport(history.data, settings);
        history.email = { ...result, sentAt: result.status === 'Sent' ? new Date() : undefined };
        const whatsappResult = await sendWhatsappReport(history.data, settings);
        history.whatsapp = { ...whatsappResult, sentAt: whatsappResult.status === 'Sent' ? new Date() : undefined };
        await history.save();
        res.json(history);
    } catch (err) {
        history.email = { status: 'Failed', error: err.message, recipients: settings.ceoRecipients || [] };
        await history.save();
        res.status(500).json(history);
    }
});

router.get('/history/:id/html', auth, async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const history = await BDDailyReportHistory.findById(req.params.id);
    if (!history) return res.status(404).send('Report not found.');
    res.type('html').send(renderHtmlReport(history.data));
});

router.get('/history/:id/download', auth, async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const history = await BDDailyReportHistory.findById(req.params.id);
    if (!history) return res.status(404).send('Report not found.');

    const safeDate = String(history.reportDate || 'report').replace(/[^0-9-]/g, '');
    const safeType = String(history.reportType || 'bd-report').toLowerCase();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="bd-executive-${safeType}-${safeDate}.html"`);
    res.send(renderHtmlReport(history.data));
});

module.exports = router;
