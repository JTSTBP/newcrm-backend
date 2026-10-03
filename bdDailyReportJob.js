const { getIstParts, getOrCreateSettings, generateReportData, saveReportHistory } = require('./services/bdDailyReportService');

let lastRunKey = null;

const runScheduledReport = async (reportType) => {
    const settings = await getOrCreateSettings();
    if (reportType === '12PM' && !settings.enable12PmReport) return;
    if (reportType === '7PM' && !settings.enable7PmReport) return;
    const report = await generateReportData({ reportType });
    await saveReportHistory({ report, sendEmail: true, sendWhatsapp: true });
};

const startBDDailyReportJob = () => {
    console.log('[BDDailyReport] Scheduler started, checking IST report windows every 60 seconds.');
    setInterval(async () => {
        try {
            const now = getIstParts();
            const reportType = now.hour === 12 && now.minute === 0 ? '12PM' : now.hour === 19 && now.minute === 0 ? '7PM' : null;
            if (!reportType) return;
            const key = `${now.year}-${now.month}-${now.day}-${reportType}`;
            if (lastRunKey === key) return;
            lastRunKey = key;
            await runScheduledReport(reportType);
        } catch (err) {
            console.error('[BDDailyReport] Scheduler error:', err.message);
        }
    }, 60 * 1000);
};

module.exports = { startBDDailyReportJob, runScheduledReport };
