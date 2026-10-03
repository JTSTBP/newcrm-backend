const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const User = require('../models/User');
const Task = require('../models/Task');
const CallActivity = require('../models/CallActivity');
const LeadActivity = require('../models/LeadActivity');
const BDDailyReportSettings = require('../models/BDDailyReportSettings');
const BDDailyReportHistory = require('../models/BDDailyReportHistory');

const STAGES = ['New', 'Contacted', 'Proposal Sent', 'Negotiation', 'Won', 'Lost', 'Onboarded', 'No Vendor', 'Future Reference'];
const STAGE_ALIASES = { 'No vendor': 'No Vendor', Proposal: 'Proposal Sent' };

const pad = (value) => String(value).padStart(2, '0');
const escapeHtml = (value = '') => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const normalizeStage = (stage) => STAGE_ALIASES[stage] || stage || 'Unknown';
const objectId = (id) => new mongoose.Types.ObjectId(id);

const getIstParts = (date = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(date).reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
    }, {});
    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour),
        minute: Number(parts.minute)
    };
};

const istDateString = (date = new Date()) => {
    const p = getIstParts(date);
    return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
};

const formatDisplayDate = (dateString) => {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, day)));
};

const formatShortDate = (dateString) => {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, day)));
};

const istDateToUtc = (dateString, hour, minute = 0) => {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, hour - 5, minute - 30, 0, 0));
};

const getReportWindow = ({ reportType, date }) => {
    const reportDate = date || istDateString();
    const endHour = reportType === '7PM' ? 19 : 12;
    return {
        reportDate,
        periodStart: istDateToUtc(reportDate, 0, 0),
        periodEnd: istDateToUtc(reportDate, endHour, 0)
    };
};

const zeroStageCounts = () => STAGES.reduce((acc, stage) => ({ ...acc, [stage]: 0 }), {});
const increment = (target, key, amount = 1) => {
    target[key] = (target[key] || 0) + amount;
};

const getOrCreateSettings = async () => {
    let settings = await BDDailyReportSettings.findOne();
    if (!settings) settings = await BDDailyReportSettings.create({});
    return settings;
};

const getActivityOwnerId = (activity, lead) => {
    return activity.performedBy?._id?.toString?.()
        || activity.performedBy?.toString?.()
        || lead?.assignedBy?._id?.toString?.()
        || lead?.assignedBy?.toString?.()
        || lead?.createdBy?._id?.toString?.()
        || lead?.createdBy?.toString?.()
        || null;
};

const generateReportData = async ({ reportType = '12PM', date } = {}) => {
    const { reportDate, periodStart, periodEnd } = getReportWindow({ reportType, date });
    const periodQuery = { $gte: periodStart, $lte: periodEnd };
    const activeExecutives = await User.find({ role: 'BD Executive', status: 'Active' }).select('name email').sort({ name: 1 });
    const executiveIds = activeExecutives.map((user) => user._id);
    const executiveIdStrings = executiveIds.map((id) => id.toString());
    const byExec = new Map(activeExecutives.map((user) => [user._id.toString(), {
        executiveId: user._id.toString(),
        name: user.name,
        assignedLeads: 0,
        newLeadsToday: 0,
        companiesToday: 0,
        pocsToday: 0,
        callsToday: 0,
        followupsToday: 0,
        outreachToday: 0,
        meetingsToday: 0,
        won: 0,
        lost: 0,
        onboarded: 0,
        pendingFollowups: 0
    }]));

    const approvedLeadBase = { status: { $nin: ['incomplete', 'rejected'] } };
    const assignedCounts = await Lead.aggregate([
        { $match: { ...approvedLeadBase, assignedBy: { $in: executiveIds } } },
        { $group: { _id: '$assignedBy', count: { $sum: 1 } } }
    ]);
    assignedCounts.forEach((row) => {
        const exec = byExec.get(row._id?.toString());
        if (exec) exec.assignedLeads = row.count;
    });

    const activities = await LeadActivity.find({ timestamp: periodQuery })
        .populate('leadId', 'company_name stage assignedBy createdBy points_of_contact')
        .populate('performedBy', 'name role')
        .sort({ timestamp: -1 });

    const summary = {
        activeBDExecutives: activeExecutives.length,
        totalAssignedLeads: assignedCounts.reduce((sum, row) => sum + row.count, 0),
        newLeadsAddedToday: 0,
        companiesAddedToday: 0,
        pocsAddedToday: 0,
        callsMadeToday: 0,
        followupsCompleted: 0,
        outreachEmails: 0,
        meetingsBookings: 0,
        won: 0,
        lost: 0,
        onboarded: 0
    };

    const leadActivity = {
        newLeadsCreated: 0,
        leadsAssigned: 0,
        leadsContacted: 0,
        followupsCompleted: 0,
        leadsWithRemarksAdded: 0,
        leadsWithActivitiesRecorded: new Set(),
        leadsMovedToAnotherStage: 0
    };
    const stageChanges = zeroStageCounts();
    const outcomes = { won: [], lost: [], onboarded: [], proposalSent: 0, negotiation: 0 };
    const recentActivity = [];

    activities.forEach((activity) => {
        const lead = activity.leadId;
        const ownerId = getActivityOwnerId(activity, lead);
        if (!ownerId || !executiveIdStrings.includes(ownerId)) return;
        const exec = byExec.get(ownerId);
        leadActivity.leadsWithActivitiesRecorded.add(activity.leadId?._id?.toString?.() || activity.leadId?.toString?.());

        if (activity.type === 'Lead Created') {
            summary.newLeadsAddedToday += 1;
            summary.companiesAddedToday += 1;
            exec.newLeadsToday += 1;
            exec.companiesToday += 1;
            leadActivity.newLeadsCreated += 1;
        }
        if (activity.type === 'Reassigned') {
            leadActivity.leadsAssigned += 1;
        }
        if (activity.type === 'POC Added') {
            summary.pocsAddedToday += 1;
            exec.pocsToday += 1;
        }
        if (activity.type === 'Task Completed') {
            summary.followupsCompleted += 1;
            exec.followupsToday += 1;
            leadActivity.followupsCompleted += 1;
        }
        if (activity.type === 'Remark Added') {
            leadActivity.leadsWithRemarksAdded += 1;
        }
        if (activity.type === 'Email Sent' || activity.type === 'Auto Message Email Sent') {
            summary.outreachEmails += 1;
            exec.outreachToday += 1;
        }
        if (activity.type === 'Task Created' && /meeting|booking|demo/i.test(`${activity.description} ${activity.metadata?.type || ''} ${activity.metadata?.title || ''}`)) {
            summary.meetingsBookings += 1;
            exec.meetingsToday += 1;
        }
        if (activity.type === 'Stage Changed') {
            const nextStage = normalizeStage(activity.metadata?.newStage || activity.metadata?.to || lead?.stage);
            if (STAGES.includes(nextStage)) increment(stageChanges, nextStage);
            leadActivity.leadsMovedToAnotherStage += 1;
            if (nextStage === 'Contacted') leadActivity.leadsContacted += 1;
            if (nextStage === 'Won') {
                summary.won += 1;
                exec.won += 1;
                outcomes.won.push({ company: lead?.company_name || 'Unknown Company', executive: exec.name });
            }
            if (nextStage === 'Lost') {
                summary.lost += 1;
                exec.lost += 1;
                outcomes.lost.push({ company: lead?.company_name || 'Unknown Company', executive: exec.name });
            }
            if (nextStage === 'Onboarded') {
                summary.onboarded += 1;
                exec.onboarded += 1;
                outcomes.onboarded.push({ company: lead?.company_name || 'Unknown Company', executive: exec.name });
            }
            if (nextStage === 'Proposal Sent') outcomes.proposalSent += 1;
            if (nextStage === 'Negotiation') outcomes.negotiation += 1;
        }

        if (recentActivity.length < 25) {
            recentActivity.push({
                time: activity.timestamp,
                bdExecutive: exec.name,
                action: activity.type,
                company: lead?.company_name || '',
                leadOrPoc: activity.metadata?.pocName || activity.metadata?.pocId || '',
                stage: normalizeStage(activity.metadata?.newStage || lead?.stage || '')
            });
        }
    });

    const calls = await CallActivity.find({ timestamp: periodQuery, userId: { $in: executiveIds } })
        .populate('userId', 'name')
        .populate('leadId', 'company_name stage points_of_contact')
        .sort({ timestamp: -1 });
    const callsByExecutive = {};
    calls.forEach((call) => {
        const id = call.userId?._id?.toString();
        const exec = byExec.get(id);
        if (!exec) return;
        summary.callsMadeToday += 1;
        exec.callsToday += 1;
        increment(callsByExecutive, exec.name);
    });

    const pendingTasks = await Task.aggregate([
        { $match: { completed: false, user_id: { $in: executiveIds }, due_date: { $lte: periodEnd } } },
        { $group: { _id: '$user_id', count: { $sum: 1 } } }
    ]);
    pendingTasks.forEach((row) => {
        const exec = byExec.get(row._id?.toString());
        if (exec) exec.pendingFollowups = row.count;
    });

    const pocsAdded = await Lead.aggregate([
        { $match: approvedLeadBase },
        { $unwind: '$points_of_contact' },
        { $match: { 'points_of_contact.createdAt': periodQuery, 'points_of_contact.createdBy': { $in: executiveIds } } },
        { $group: { _id: '$points_of_contact.createdBy', count: { $sum: 1 } } }
    ]);
    pocsAdded.forEach((row) => {
        const exec = byExec.get(row._id?.toString());
        if (exec && exec.pocsToday < row.count) {
            summary.pocsAddedToday += row.count - exec.pocsToday;
            exec.pocsToday = row.count;
        }
    });

    const meetings = await Task.find({
        user_id: { $in: executiveIds },
        created_at: periodQuery,
        $or: [{ type: /meeting|booking|demo/i }, { title: /meeting|booking|demo/i }]
    }).populate('user_id', 'name').populate('lead_id', 'company_name stage points_of_contact').sort({ due_date: 1 }).limit(20);

    return {
        reportType,
        title: reportType === '7PM' ? 'CRM BD Executive Daily Closing Report - 7 PM' : 'CRM BD Executive Progress Report - 12 PM',
        reportDate,
        displayDate: formatDisplayDate(reportDate),
        shortDate: formatShortDate(reportDate),
        periodStart,
        periodEnd,
        generatedAt: new Date(),
        summary,
        executiveRows: Array.from(byExec.values()),
        leadActivity: { ...leadActivity, leadsWithActivitiesRecorded: leadActivity.leadsWithActivitiesRecorded.size },
        stageChanges,
        calls: {
            total: summary.callsMadeToday,
            byExecutive: callsByExecutive,
            completed: summary.callsMadeToday,
            missed: 0,
            followUpCalls: calls.filter((call) => /follow/i.test(call.remarks || call.stage || '')).length,
            latest: calls.slice(0, 10).map((call) => ({
                time: call.timestamp,
                bdExecutive: call.userId?.name || 'Unknown',
                company: call.leadId?.company_name || 'Unknown Company',
                stage: call.stage,
                remarks: call.remarks || ''
            }))
        },
        followups: Array.from(byExec.values()).map((exec) => ({
            bdExecutive: exec.name,
            completed: exec.followupsToday,
            pending: exec.pendingFollowups
        })),
        companiesPocs: {
            companiesAddedToday: summary.companiesAddedToday,
            pocsAddedToday: summary.pocsAddedToday,
            byExecutive: Array.from(byExec.values()).map((exec) => ({ bdExecutive: exec.name, companies: exec.companiesToday, pocs: exec.pocsToday }))
        },
        outreach: {
            total: summary.outreachEmails,
            byExecutive: Array.from(byExec.values()).map((exec) => ({ bdExecutive: exec.name, outreach: exec.outreachToday }))
        },
        meetings: {
            booked: summary.meetingsBookings,
            completed: meetings.filter((task) => task.completed).length,
            upcoming: meetings.filter((task) => !task.completed).length,
            rows: meetings.map((task) => ({
                company: task.lead_id?.company_name || 'Unknown Company',
                poc: task.poc_id || '',
                bdExecutive: task.user_id?.name || '',
                meetingTime: task.due_date,
                stage: task.lead_id?.stage || ''
            }))
        },
        outcomes,
        recentActivity
    };
};

const renderHtmlReport = (report) => {
    const formatReportTime = (value) => new Date(value).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
    const formatMetricLabel = (key) => escapeHtml(key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase()));
    const summaryEntries = Object.entries(report.summary);
    const metricRows = [];

    for (let i = 0; i < summaryEntries.length; i += 2) {
        const first = summaryEntries[i];
        const second = summaryEntries[i + 1];
        metricRows.push(`
            <tr>
                <td class="stack-column" width="50%" style="padding:6px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;">
                        <tr><td style="padding:14px;">
                            <div style="font-size:11px;line-height:15px;text-transform:uppercase;color:#64748b;font-weight:700;">${formatMetricLabel(first[0])}</div>
                            <div style="font-size:24px;line-height:30px;font-weight:800;color:#0f172a;">${first[1]}</div>
                        </td></tr>
                    </table>
                </td>
                <td class="stack-column" width="50%" style="padding:6px;">
                    ${second ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;">
                        <tr><td style="padding:14px;">
                            <div style="font-size:11px;line-height:15px;text-transform:uppercase;color:#64748b;font-weight:700;">${formatMetricLabel(second[0])}</div>
                            <div style="font-size:24px;line-height:30px;font-weight:800;color:#0f172a;">${second[1]}</div>
                        </td></tr>
                    </table>` : '&nbsp;'}
                </td>
            </tr>
        `);
    }

    const execRows = report.executiveRows.map((row) => `<tr>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#0f172a;">${escapeHtml(row.name)}</td>
        <td align="right" style="padding:10px;border-bottom:1px solid #e2e8f0;">${row.assignedLeads}</td>
        <td align="right" style="padding:10px;border-bottom:1px solid #e2e8f0;">${row.newLeadsToday}</td>
        <td align="right" style="padding:10px;border-bottom:1px solid #e2e8f0;">${row.companiesToday}</td>
        <td align="right" style="padding:10px;border-bottom:1px solid #e2e8f0;">${row.pocsToday}</td>
        <td align="right" style="padding:10px;border-bottom:1px solid #e2e8f0;">${row.callsToday}</td>
        <td align="right" style="padding:10px;border-bottom:1px solid #e2e8f0;">${row.followupsToday}</td>
        <td align="right" style="padding:10px;border-bottom:1px solid #e2e8f0;">${row.outreachToday}</td>
        <td align="right" style="padding:10px;border-bottom:1px solid #e2e8f0;">${row.meetingsToday}</td>
        <td align="right" style="padding:10px;border-bottom:1px solid #e2e8f0;">${row.won}</td>
        <td align="right" style="padding:10px;border-bottom:1px solid #e2e8f0;">${row.lost}</td>
        <td align="right" style="padding:10px;border-bottom:1px solid #e2e8f0;">${row.onboarded}</td>
    </tr>`).join('');

    const stageRows = STAGES.map((stage) => `<tr>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#334155;">${stage}</td>
        <td align="right" style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:800;color:#0f172a;">${report.stageChanges[stage] || 0}</td>
    </tr>`).join('');

    const activityRows = report.recentActivity.slice(0, 12).map((item) => `<tr>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;white-space:nowrap;">${formatReportTime(item.time)}</td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#0369a1;">${escapeHtml(item.bdExecutive)}</td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(item.action)}</td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(item.company)}</td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(item.stage)}</td>
    </tr>`).join('');

    const dashboardUrl = escapeHtml(process.env.CRM_DASHBOARD_URL || '');
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(report.title)}</title>
  <style>
    @media only screen and (max-width: 640px) {
      .email-shell { width: 100% !important; }
      .mobile-pad { padding: 16px !important; }
      .stack-column { display: block !important; width: 100% !important; box-sizing: border-box !important; }
      .responsive-table-wrap { overflow-x: auto !important; -webkit-overflow-scrolling: touch !important; }
      .responsive-table { min-width: 760px !important; }
      .mobile-title { font-size: 22px !important; line-height: 28px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#eef2f7;">
    <tr>
      <td align="center" style="padding:24px 10px;">
        <table role="presentation" class="email-shell" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:980px;background:#ffffff;border:1px solid #dbe3ef;">
          <tr>
            <td class="mobile-pad" style="padding:28px 30px;background:#0f1c2e;color:#ffffff;">
              <div style="font-size:12px;line-height:16px;text-transform:uppercase;letter-spacing:1.4px;color:#7dd3fc;font-weight:800;">BD Executive Daily Report</div>
              <h1 class="mobile-title" style="margin:8px 0 8px;font-size:28px;line-height:34px;color:#ffffff;font-weight:800;">${escapeHtml(report.title)}</h1>
              <p style="margin:0;color:#cbd5e1;font-size:14px;line-height:22px;">${escapeHtml(report.displayDate)} | ${formatReportTime(report.periodStart)} - ${formatReportTime(report.periodEnd)} IST</p>
            </td>
          </tr>
          <tr>
            <td class="mobile-pad" style="padding:22px 24px;">
              <h2 style="margin:0 0 10px;font-size:18px;line-height:24px;color:#0f172a;">CEO Summary</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${metricRows.join('')}</table>
            </td>
          </tr>
          <tr>
            <td class="mobile-pad" style="padding:8px 24px 22px;">
              <h2 style="margin:0 0 10px;font-size:18px;line-height:24px;color:#0f172a;">BD Executive Performance</h2>
              <div class="responsive-table-wrap" style="width:100%;overflow-x:auto;">
                <table class="responsive-table" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;min-width:920px;background:#ffffff;border:1px solid #e2e8f0;font-size:13px;line-height:18px;">
                  <thead>
                    <tr style="background:#e2e8f0;color:#334155;">
                      <th align="left" style="padding:10px;">BD Executive</th>
                      <th align="right" style="padding:10px;">Assigned</th>
                      <th align="right" style="padding:10px;">New Leads</th>
                      <th align="right" style="padding:10px;">Companies</th>
                      <th align="right" style="padding:10px;">POCs</th>
                      <th align="right" style="padding:10px;">Calls</th>
                      <th align="right" style="padding:10px;">Follow-ups</th>
                      <th align="right" style="padding:10px;">Outreach</th>
                      <th align="right" style="padding:10px;">Meetings</th>
                      <th align="right" style="padding:10px;">Won</th>
                      <th align="right" style="padding:10px;">Lost</th>
                      <th align="right" style="padding:10px;">Onboarded</th>
                    </tr>
                  </thead>
                  <tbody>${execRows}</tbody>
                </table>
              </div>
            </td>
          </tr>
          <tr>
            <td class="mobile-pad" style="padding:8px 24px 22px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr>
                  <td class="stack-column" width="50%" valign="top" style="padding:0 8px 12px 0;">
                    <h2 style="margin:0 0 10px;font-size:18px;line-height:24px;color:#0f172a;">Stage Changes Today</h2>
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;font-size:14px;">${stageRows}</table>
                  </td>
                  <td class="stack-column" width="50%" valign="top" style="padding:0 0 12px 8px;">
                    <h2 style="margin:0 0 10px;font-size:18px;line-height:24px;color:#0f172a;">Today's Outcome</h2>
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;font-size:14px;">
                      <tr><td style="padding:10px;border-bottom:1px solid #e2e8f0;">Won</td><td align="right" style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:800;">${report.summary.won}</td></tr>
                      <tr><td style="padding:10px;border-bottom:1px solid #e2e8f0;">Lost</td><td align="right" style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:800;">${report.summary.lost}</td></tr>
                      <tr><td style="padding:10px;border-bottom:1px solid #e2e8f0;">Onboarded</td><td align="right" style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:800;">${report.summary.onboarded}</td></tr>
                      <tr><td style="padding:10px;">Proposal / Negotiation</td><td align="right" style="padding:10px;font-weight:800;">${report.outcomes.proposalSent} / ${report.outcomes.negotiation}</td></tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="mobile-pad" style="padding:8px 24px 24px;">
              <h2 style="margin:0 0 10px;font-size:18px;line-height:24px;color:#0f172a;">Recent BD Activity</h2>
              <div class="responsive-table-wrap" style="width:100%;overflow-x:auto;">
                <table class="responsive-table" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;min-width:680px;background:#ffffff;border:1px solid #e2e8f0;font-size:13px;line-height:18px;">
                  <tbody>${activityRows}</tbody>
                </table>
              </div>
              ${dashboardUrl ? `<p style="margin:22px 0 0;"><a href="${dashboardUrl}" style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:6px;">Open CRM Dashboard</a></p>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

const renderWhatsappReport = (report) => {
    const title = report.reportType === '7PM' ? '*CRM BD EXECUTIVE CLOSING REPORT*' : '*CRM BD EXECUTIVE REPORT*';
    return `${title}
${report.shortDate} - ${report.reportType === '7PM' ? '7 PM' : '12 PM'}

Active BD Executives: ${report.summary.activeBDExecutives}
New Leads: ${report.summary.newLeadsAddedToday}
Companies: ${report.summary.companiesAddedToday}
POCs: ${report.summary.pocsAddedToday}
Calls: ${report.summary.callsMadeToday}
Follow-ups: ${report.summary.followupsCompleted}
Outreach: ${report.summary.outreachEmails}
Meetings: ${report.summary.meetingsBookings}

Outcomes
Won: ${report.summary.won}
Lost: ${report.summary.lost}
Onboarded: ${report.summary.onboarded}

Stage Changes
Contacted: ${report.stageChanges.Contacted || 0}
Proposal: ${report.stageChanges['Proposal Sent'] || 0}
Negotiation: ${report.stageChanges.Negotiation || 0}`;
};

const sendEmailReport = async (report, settings) => {
    const recipients = settings.ceoRecipients || [];
    if (!recipients.length) return { status: 'Skipped', error: 'No CEO recipients configured.', recipients };
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    if (!smtpUser || !smtpPass || smtpUser === 'youraddress@gmail.com') return { status: 'Skipped', error: 'SMTP is not configured.', recipients };
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT, 10) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: smtpUser, pass: smtpPass }
    });
    const suffix = report.reportType === '7PM' ? '7 PM' : '12 PM';
    const subjectTitle = report.reportType === '7PM' ? 'CRM BD Executive Daily Closing Report' : 'CRM BD Executive Progress Report';
    await transporter.sendMail({
        from: `"CRM Reports" <${process.env.SMTP_FROM || smtpUser}>`,
        to: recipients.join(','),
        cc: (settings.ccRecipients || []).join(','),
        subject: `${subjectTitle} - ${report.shortDate} - ${suffix}`,
        html: renderHtmlReport(report),
        text: renderWhatsappReport(report)
    });
    return { status: 'Sent', recipients };
};

const sendWhatsappReport = async (report, settings) => {
    const recipients = settings.whatsappRecipients || [];
    if (!recipients.length) return { status: 'Skipped', error: 'No WhatsApp recipients configured.', recipients };
    if (!process.env.WHATSAPP_REPORT_WEBHOOK_URL) {
        return { status: 'Skipped', error: 'WHATSAPP_REPORT_WEBHOOK_URL is not configured.', recipients };
    }

    const response = await fetch(process.env.WHATSAPP_REPORT_WEBHOOK_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(process.env.WHATSAPP_REPORT_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.WHATSAPP_REPORT_WEBHOOK_TOKEN}` } : {})
        },
        body: JSON.stringify({
            recipients,
            message: renderWhatsappReport(report),
            reportType: report.reportType,
            reportDate: report.reportDate
        })
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`WhatsApp webhook failed (${response.status})${body ? `: ${body}` : ''}`);
    }

    return { status: 'Sent', recipients };
};

const saveReportHistory = async ({ report, generatedBy = null, sendEmail = false, sendWhatsapp = false }) => {
    const settings = await getOrCreateSettings();
    const history = await BDDailyReportHistory.create({
        reportType: report.reportType,
        title: report.title,
        reportDate: report.reportDate,
        periodStart: report.periodStart,
        periodEnd: report.periodEnd,
        generatedBy,
        data: report
    });
    if (sendEmail) {
        try {
            const result = await sendEmailReport(report, settings);
            history.email = { ...result, sentAt: result.status === 'Sent' ? new Date() : undefined };
        } catch (err) {
            history.email = { status: 'Failed', error: err.message, recipients: settings.ceoRecipients || [] };
        }
    }
    if (sendWhatsapp) {
        try {
            const result = await sendWhatsappReport(report, settings);
            history.whatsapp = { ...result, sentAt: result.status === 'Sent' ? new Date() : undefined };
        } catch (err) {
            history.whatsapp = { status: 'Failed', error: err.message, recipients: settings.whatsappRecipients || [] };
        }
    }
    await history.save();
    return history;
};

module.exports = {
    STAGES,
    getIstParts,
    getReportWindow,
    getOrCreateSettings,
    generateReportData,
    renderHtmlReport,
    renderWhatsappReport,
    sendEmailReport,
    sendWhatsappReport,
    saveReportHistory
};
