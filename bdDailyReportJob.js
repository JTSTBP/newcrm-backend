const cron = require('node-cron');
const BDDailyReportHistory = require('./models/BDDailyReportHistory');
const { getIstParts, getOrCreateSettings, generateReportData, saveReportHistory } = require('./services/bdDailyReportService');

const pad = (value) => String(value).padStart(2, '0');
const getReportDate = ({ year, month, day }) => `${year}-${pad(month)}-${pad(day)}`;

const hasSuccessfulEmailReport = async (reportDate, reportType) => {
    const sent = await BDDailyReportHistory.exists({
        reportDate,
        reportType,
        'email.status': 'Sent'
    });
    return Boolean(sent);
};

const runScheduledReport = async (reportType, source = 'scheduled') => {
    const settings = await getOrCreateSettings();
    if (reportType === '12PM' && !settings.enable12PmReport) {
        return { skipped: true, reason: '12 PM report is disabled.' };
    }
    if (reportType === '7PM' && !settings.enable7PmReport) {
        return { skipped: true, reason: '7 PM report is disabled.' };
    }

    const report = await generateReportData({ reportType });
    if (await hasSuccessfulEmailReport(report.reportDate, reportType)) {
        return { skipped: true, reason: `${reportType} report already sent for ${report.reportDate}.` };
    }

    console.log(`[BDDailyReport] ${source} sending ${reportType} report for ${report.reportDate}.`);
    const history = await saveReportHistory({ report, sendEmail: true, sendWhatsapp: true });
    return { skipped: false, history };
};

const runDueBDDailyReports = async (source = 'catch-up') => {
    const now = getIstParts();
    const reportDate = getReportDate(now);
    const dueTypes = [];
    const results = [];

    if (now.hour > 12 || (now.hour === 12 && now.minute >= 0)) {
        dueTypes.push('12PM');
    }
    if (now.hour > 19 || (now.hour === 19 && now.minute >= 0)) {
        dueTypes.push('7PM');
    }

    for (const reportType of dueTypes) {
        try {
            const result = await runScheduledReport(reportType, source);
            results.push({ reportType, ...result });
            if (result.skipped) {
                console.log(`[BDDailyReport] ${source} ${reportType} skipped: ${result.reason}`);
            } else {
                console.log(`[BDDailyReport] ${source} ${reportType} completed with email status ${result.history.email?.status}.`);
            }
        } catch (err) {
            console.error(`[BDDailyReport] ${source} ${reportType} failed:`, err.message);
            results.push({ reportType, success: false, error: err.message });
        }
    }

    return { reportDate, dueTypes, results };
};

const startBDDailyReportJob = () => {
    const timezone = process.env.BD_DAILY_REPORT_TIMEZONE || 'Asia/Kolkata';
    const noonCron = process.env.BD_DAILY_REPORT_12PM_CRON || '0 12 * * *';
    const eveningCron = process.env.BD_DAILY_REPORT_7PM_CRON || '0 19 * * *';
    const catchupIntervalMinutes = Number(process.env.BD_DAILY_REPORT_CATCHUP_INTERVAL_MINUTES || 10);

    const scheduleReport = (reportType, expression) => {
        if (!cron.validate(expression)) {
            console.error(`[BDDailyReport] Invalid cron for ${reportType}: ${expression}`);
            return;
        }

        cron.schedule(
            expression,
            async () => {
                try {
                    const result = await runScheduledReport(reportType, 'cron');
                    if (result.skipped) {
                        console.log(`[BDDailyReport] ${reportType} skipped: ${result.reason}`);
                    } else {
                        console.log(`[BDDailyReport] ${reportType} completed with email status ${result.history.email?.status}.`);
                    }
                } catch (err) {
                    console.error(`[BDDailyReport] ${reportType} failed:`, err.message);
                }
            },
            { timezone, timeZone: timezone }
        );

        console.log(`[BDDailyReport] ${reportType} scheduler started with cron "${expression}" in timezone "${timezone}".`);
    };

    scheduleReport('12PM', noonCron);
    scheduleReport('7PM', eveningCron);

    console.log(`[BDDailyReport] Startup catch-up check enabled in timezone "${timezone}".`);
    runDueBDDailyReports('startup catch-up');

    if (catchupIntervalMinutes > 0) {
        setInterval(() => {
            runDueBDDailyReports('interval catch-up');
        }, catchupIntervalMinutes * 60 * 1000);
        console.log(`[BDDailyReport] Interval catch-up check running every ${catchupIntervalMinutes} minutes.`);
    }
};

module.exports = { startBDDailyReportJob, runScheduledReport, runDueBDDailyReports };
