const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/authMiddleware');
const Lead = require('../models/Lead');
const User = require('../models/User');
const CallActivity = require('../models/CallActivity');
const LeadActivity = require('../models/LeadActivity');
const Task = require('../models/Task');

// @route   GET /api/dashboard/admin
// @desc    Get admin dashboard statistics
// @access  Private/Admin
router.get('/admin', auth, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'Access denied' });
        }

        const { startDate, endDate } = req.query;
        let leadQuery = {};
        let activityQuery = {};

        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999); // Inclusion of the full end day

            leadQuery.createdAt = { $gte: start, $lte: end };
            activityQuery.timestamp = { $gte: start, $lte: end };
        }

        const totalLeads = await Lead.countDocuments(leadQuery);
        const activeAgents = await User.countDocuments({
            role: { $in: ['BD Executive', 'Manager'] },
            status: 'Active'
        });
        const totalCalls = await CallActivity.countDocuments(activityQuery);
        const totalProposalSent = await Lead.countDocuments({ ...leadQuery, stage: 'Proposal Sent' });
        const totalOnboarded = await Lead.countDocuments({ ...leadQuery, stage: 'Onboarded' });

        const recentActivity = await LeadActivity.find(activityQuery)
            .sort({ timestamp: -1 })
            .limit(10)
            .populate('leadId', 'company_name')
            .populate('performedBy', 'name');

        // Top Performing Agents (Based on calls in the selected period)
        const topAgentsRaw = await CallActivity.aggregate([
            { $match: activityQuery },
            { $group: { _id: "$userId", callCount: { $sum: 1 } } },
            { $sort: { callCount: -1 } }
        ]);

        let allAgents = await Promise.all(topAgentsRaw.map(async (item) => {
            const user = await User.findById(item._id).select('name');
            if (!user) return null;

            const onboardedCount = await Lead.countDocuments({
                ...leadQuery,
                assignedBy: item._id,
                stage: 'Onboarded'
            });

            return {
                _id: item._id,
                name: user.name,
                calls: item.callCount,
                onboarded: onboardedCount
            };
        }));

        allAgents = allAgents.filter(Boolean);
        const topAgents = allAgents.slice(0, 5);

        res.json({
            stats: {
                totalLeads,
                activeAgents,
                totalProposalSent,
                totalOnboarded
            },
            recentActivity,
            topAgents,
            fullLeaderboard: allAgents
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/dashboard/admin-reports
// @desc    Get comprehensive chart data for Admin Reports tab
// @access  Private/Admin
router.get('/admin-reports', auth, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'Access denied' });
        }

        const { startDate, endDate } = req.query;
        let leadQuery = {};
        let activityQuery = {};

        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);

            leadQuery.createdAt = { $gte: start, $lte: end };
            activityQuery.timestamp = { $gte: start, $lte: end };
        }

        // 1. Leads by Stage
        const leadsByStageRaw = await Lead.aggregate([
            { $match: leadQuery },
            { $group: { _id: '$stage', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        const leadsByStage = leadsByStageRaw.map(item => ({
            name: item._id || 'Unassigned',
            value: item.count
        }));

        // 2. Leads by Industry
        const leadsByIndustryRaw = await Lead.aggregate([
            { $match: leadQuery },
            { $group: { _id: '$industry_name', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);
        const leadsByIndustry = leadsByIndustryRaw.map(item => ({
            name: item._id || 'Unknown',
            value: item.count
        }));

        // 3. Monthly Calls Trend
        let monthlyTimelineMatch = {};
        if (startDate && endDate) {
            monthlyTimelineMatch = activityQuery;
        } else {
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            monthlyTimelineMatch = { timestamp: { $gte: sixMonthsAgo } };
        }

        const monthlyCallsRaw = await CallActivity.aggregate([
            { $match: monthlyTimelineMatch },
            {
                $group: {
                    _id: { month: { $month: "$timestamp" }, year: { $year: "$timestamp" } },
                    calls: { $sum: 1 }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const monthlyTimeline = monthlyCallsRaw.map(item => ({
            name: `${monthNames[item._id.month - 1]} ${item._id.year.toString().slice(2)}`,
            calls: item.calls
        }));

        // 4. Summary Statistics (Range-aware)
        const summaryStats = {
            totalLeads: await Lead.countDocuments(leadQuery),
            totalUsers: await User.countDocuments({ role: { $in: ['BD Executive', 'Manager'] }, status: 'Active' }),
            totalProposalSent: await Lead.countDocuments({ ...leadQuery, stage: 'Proposal Sent' }),
            totalOnboarded: await Lead.countDocuments({ ...leadQuery, stage: 'Onboarded' })
        };

        // 5. Agent Performance Matrix
        const agentPerformanceRaw = await CallActivity.aggregate([
            { $match: activityQuery },
            { $group: { _id: "$userId", callCount: { $sum: 1 } } }
        ]);

        let agentPerformance = await Promise.all(agentPerformanceRaw.map(async (item) => {
            const user = await User.findById(item._id).select('name');
            if (!user) return null;

            const leadsAssigned = await Lead.countDocuments({ ...leadQuery, assignedBy: item._id });
            const leadsWon = await Lead.countDocuments({
                ...leadQuery,
                assignedBy: item._id,
                stage: 'Won'
            });

            const leadsOnboarded = await Lead.countDocuments({
                ...leadQuery,
                assignedBy: item._id,
                stage: 'Onboarded'
            });

            return {
                agentId: item._id,
                name: user.name,
                calls: item.callCount,
                leads: leadsAssigned,
                won: leadsWon,
                onboarded: leadsOnboarded,
                winRate: leadsAssigned > 0 ? Math.round(((leadsWon + leadsOnboarded) / leadsAssigned) * 100) : 0
            };
        }));
        // Sort by calls
        agentPerformance = agentPerformance.filter(Boolean).sort((a, b) => b.calls - a.calls).slice(0, 10);

        res.json({
            leadsByStage,
            leadsByIndustry,
            monthlyTimeline,
            agentPerformance,
            summaryStats
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/dashboard/agent-calls
// @desc    Get detailed call logs for a specific agent
// @access  Private/Admin
router.get('/agent-calls', auth, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'Access denied' });
        }

        const { agentId, startDate, endDate } = req.query;
        if (!agentId) {
            return res.status(400).json({ message: 'Agent ID is required' });
        }

        let query = { userId: agentId };

        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            query.timestamp = { $gte: start, $lte: end };
        }

        const calls = await CallActivity.find(query)
            .sort({ timestamp: -1 })
            .populate('leadId', 'company_name points_of_contact');

        const formattedCalls = calls.map(call => {
            // Find POC name from lead's points_of_contact
            let pocName = 'Unknown';
            if (call.leadId && call.leadId.points_of_contact) {
                const poc = call.leadId.points_of_contact.id(call.pocId);
                if (poc) pocName = poc.name;
            }

            return {
                _id: call._id,
                companyName: call.leadId ? call.leadId.company_name : 'Deleted Lead',
                pocName: pocName,
                phoneNumber: call.phone,
                callType: call.device || 'Manual',
                timestamp: call.timestamp,
                remarks: call.remarks || 'No remarks',
                stageAfterCall: call.stage
            };
        });

        res.json(formattedCalls);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


// @route   GET /api/dashboard/bd
// @desc    Get BD Executive dashboard statistics (real data)
// @access  Private
router.get('/bd', auth, async (req, res) => {
    try {
        const userId = req.user.id;

        // --- Time windows ---
        const now = new Date();
        const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // --- Core lead counts ---
        const totalLeads = await Lead.countDocuments({ assignedBy: userId });
        const wonLeads = await Lead.countDocuments({ assignedBy: userId, stage: { $in: ['Won', 'Onboarded'] } });
        const lostLeads = await Lead.countDocuments({ assignedBy: userId, stage: 'Lost' });
        const activeLeads = totalLeads - wonLeads - lostLeads;

        const conversionRate = totalLeads > 0 ? ((wonLeads / totalLeads) * 100).toFixed(1) : '0';

        // --- Stage breakdown ---
        const stageBreakdown = await Lead.aggregate([
            { $match: { assignedBy: new mongoose.Types.ObjectId(userId) } },
            { $group: { _id: '$stage', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        // --- Calls today ---
        const callsToday = await CallActivity.countDocuments({
            userId,
            timestamp: { $gte: startOfToday }
        });

        // --- Total calls this month ---
        const callsThisMonth = await CallActivity.countDocuments({
            userId,
            timestamp: { $gte: startOfMonth }
        });

        // --- Calls this week ---
        const callsThisWeek = await CallActivity.countDocuments({
            userId,
            timestamp: { $gte: startOfWeek }
        });

        // --- Pending tasks ---
        const pendingTasks = await Task.find({
            user_id: userId,
            completed: false
        })
            .populate('lead_id', 'company_name')
            .sort({ due_date: 1 })
            .limit(5);

        const overdueTasks = await Task.countDocuments({
            user_id: userId,
            completed: false,
            due_date: { $lt: now }
        });

        const totalPendingTasks = await Task.countDocuments({
            user_id: userId,
            completed: false
        });

        // --- New leads this month ---
        const newLeadsThisMonth = await Lead.countDocuments({
            assignedBy: userId,
            createdAt: { $gte: startOfMonth }
        });

        // --- Recent activity ---
        const recentActivity = await LeadActivity.find({ performedBy: userId })
            .sort({ timestamp: -1 })
            .limit(8)
            .populate('leadId', 'company_name');

        // --- Top leads by activity (most engaged) ---
        const topLeadsRaw = await LeadActivity.aggregate([
            { $match: { performedBy: new mongoose.Types.ObjectId(userId) } },
            { $group: { _id: '$leadId', activityCount: { $sum: 1 } } },
            { $sort: { activityCount: -1 } },
            { $limit: 5 }
        ]);

        const topLeads = await Promise.all(topLeadsRaw.map(async (item) => {
            const lead = await Lead.findById(item._id).select('company_name stage');
            return lead ? {
                company_name: lead.company_name,
                stage: lead.stage,
                activityCount: item.activityCount
            } : null;
        })).then(results => results.filter(Boolean));

        // --- Call outcome breakdown (by POC stage after call) ---
        const callOutcomes = await CallActivity.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(userId) } },
            { $group: { _id: '$stage', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        // --- Leads added this week ---
        const leadsThisWeek = await Lead.countDocuments({
            assignedBy: userId,
            createdAt: { $gte: startOfWeek }
        });

        res.json({
            stats: {
                totalLeads,
                activeLeads,
                wonLeads,
                lostLeads,
                conversionRate: conversionRate + '%',
                callsToday,
                callsThisWeek,
                callsThisMonth,
                newLeadsThisMonth,
                leadsThisWeek,
                totalPendingTasks,
                overdueTasks
            },
            stageBreakdown,
            callOutcomes,
            topLeads,
            pendingTasks,
            recentActivity
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/dashboard/bd-reports
// @desc    Get dashboard reports specific to the logged-in BD Executive
// @access  Private
router.get('/bd-reports', auth, async (req, res) => {
    try {
        const userId = req.user.id;

        // 1. Leads by Stage
        const myLeadsByStageRaw = await Lead.aggregate([
            { $match: { assignedBy: new mongoose.Types.ObjectId(userId) } },
            { $group: { _id: '$stage', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        const myLeadsByStage = myLeadsByStageRaw.map(item => ({
            name: item._id || 'Unassigned',
            value: item.count
        }));

        // 2. Leads by Industry
        const myLeadsByIndustryRaw = await Lead.aggregate([
            { $match: { assignedBy: new mongoose.Types.ObjectId(userId) } },
            { $group: { _id: '$industry_name', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);
        const myLeadsByIndustry = myLeadsByIndustryRaw.map(item => ({
            name: item._id || 'Unknown',
            value: item.count
        }));

        // 3. Monthly Calls Trend (Last 6 Months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const myMonthlyCallsRaw = await CallActivity.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(userId),
                    timestamp: { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: { month: { $month: "$timestamp" }, year: { $year: "$timestamp" } },
                    calls: { $sum: 1 }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const myMonthlyTimeline = myMonthlyCallsRaw.map(item => ({
            name: `${monthNames[item._id.month - 1]} ${item._id.year.toString().slice(2)}`,
            calls: item.calls
        }));

        // 4. Call Outcomes Breakdown
        const myCallOutcomesRaw = await CallActivity.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(userId) } },
            { $group: { _id: '$stage', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        const myCallOutcomes = myCallOutcomesRaw.map(item => ({
            name: item._id || 'Uncategorized',
            value: item.count
        }));

        res.json({
            myLeadsByStage,
            myLeadsByIndustry,
            myMonthlyTimeline,
            myCallOutcomes
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
