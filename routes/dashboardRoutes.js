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
        // Only count approved leads — exclude incomplete/rejected (matches Company tab behaviour)
        let leadQuery = { status: { $nin: ['incomplete', 'rejected'] } };
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

        const { startDate, endDate, agentId } = req.query;
        // Only count approved leads — exclude incomplete/rejected (matches Company tab behaviour)
        let leadQuery = { status: { $nin: ['incomplete', 'rejected'] } };
        let activityQuery = {};

        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);

            leadQuery.createdAt = { $gte: start, $lte: end };
            activityQuery.timestamp = { $gte: start, $lte: end };
        }

        if (agentId) {
            leadQuery.assignedBy = new mongoose.Types.ObjectId(agentId);
            activityQuery.userId = new mongoose.Types.ObjectId(agentId);
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
            monthlyTimelineMatch = { ...activityQuery };
        } else {
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            monthlyTimelineMatch = { timestamp: { $gte: sixMonthsAgo } };
            if (agentId) {
                monthlyTimelineMatch.userId = new mongoose.Types.ObjectId(agentId);
            }
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
        let agentPerformanceRaw;
        if (agentId) {
            agentPerformanceRaw = [{
                _id: new mongoose.Types.ObjectId(agentId),
                callCount: await CallActivity.countDocuments(activityQuery)
            }];
        } else {
            agentPerformanceRaw = await CallActivity.aggregate([
                { $match: activityQuery },
                { $group: { _id: "$userId", callCount: { $sum: 1 } } }
            ]);
        }

        // 6. Call Outcomes Breakdown (New)
        const callOutcomesRaw = await CallActivity.aggregate([
            { $match: activityQuery },
            { $group: { _id: '$stage', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        const callOutcomes = callOutcomesRaw.map(item => ({
            name: item._id || 'Uncategorized',
            value: item.count
        }));

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
            summaryStats,
            callOutcomes
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
            // Find POC details from lead's points_of_contact
            let pocName = 'Unknown';
            let designation = 'N/A';
            if (call.leadId && call.leadId.points_of_contact) {
                const poc = call.leadId.points_of_contact.id(call.pocId);
                if (poc) {
                    pocName = poc.name;
                    designation = poc.designation || 'N/A';
                }
            }

            return {
                _id: call._id,
                companyName: call.leadId ? call.leadId.company_name : 'Deleted Lead',
                pocName: pocName,
                designation: designation,
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

        // --- Core lead counts (only approved leads — exclude incomplete/rejected) ---
        const approvedLeadBase = { assignedBy: userId, status: { $nin: ['incomplete', 'rejected'] } };

        const totalLeads = await Lead.countDocuments(approvedLeadBase);
        const wonLeads = await Lead.countDocuments({ ...approvedLeadBase, stage: { $in: ['Won', 'Onboarded'] } });
        const lostLeads = await Lead.countDocuments({ ...approvedLeadBase, stage: 'Lost' });
        const activeLeads = totalLeads - wonLeads - lostLeads;

        const conversionRate = totalLeads > 0 ? ((wonLeads / totalLeads) * 100).toFixed(1) : '0';

        // --- Stage breakdown ---
        const stageBreakdown = await Lead.aggregate([
            { $match: { assignedBy: new mongoose.Types.ObjectId(userId), status: { $nin: ['incomplete', 'rejected'] } } },
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

        // --- New leads this month (approved only) ---
        const newLeadsThisMonth = await Lead.countDocuments({
            ...approvedLeadBase,
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

        // --- Leads added this week (approved only) ---
        const leadsThisWeek = await Lead.countDocuments({
            ...approvedLeadBase,
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
        const { startDate, endDate } = req.query;

        // Only show approved leads — exclude incomplete/rejected (matches Company tab behaviour)
        let leadQuery = {
            assignedBy: new mongoose.Types.ObjectId(userId),
            status: { $nin: ['incomplete', 'rejected'] }
        };
        let activityQuery = { userId: new mongoose.Types.ObjectId(userId) };

        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);

            leadQuery.createdAt = { $gte: start, $lte: end };
            activityQuery.timestamp = { $gte: start, $lte: end };
        }

        // 1. Leads by Stage
        const myLeadsByStageRaw = await Lead.aggregate([
            { $match: leadQuery },
            { $group: { _id: '$stage', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        const myLeadsByStage = myLeadsByStageRaw.map(item => ({
            name: item._id || 'Unassigned',
            value: item.count
        }));

        // 2. Leads by Industry
        const myLeadsByIndustryRaw = await Lead.aggregate([
            { $match: leadQuery },
            { $group: { _id: '$industry_name', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);
        const myLeadsByIndustry = myLeadsByIndustryRaw.map(item => ({
            name: item._id || 'Unknown',
            value: item.count
        }));

        // 3. Monthly Calls Trend
        let monthlyTimelineMatch = activityQuery;
        if (!startDate || !endDate) {
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            monthlyTimelineMatch = {
                ...activityQuery,
                timestamp: { $gte: sixMonthsAgo }
            };
        }

        const myMonthlyCallsRaw = await CallActivity.aggregate([
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
        const myMonthlyTimeline = myMonthlyCallsRaw.map(item => ({
            name: `${monthNames[item._id.month - 1]} ${item._id.year.toString().slice(2)}`,
            calls: item.calls
        }));

        // 4. Call Outcomes Breakdown
        const myCallOutcomesRaw = await CallActivity.aggregate([
            { $match: activityQuery },
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

// @route   GET /api/dashboard/manager
// @desc    Get Manager dashboard statistics
// @access  Private/Manager
router.get('/manager', auth, async (req, res) => {
    try {
        if (req.user.role !== 'Manager' && req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'Access denied' });
        }

        const managerId = req.user.id;
        // Get all active BD Executives reporting to this manager
        const reporters = await User.find({ reporter: managerId, status: 'Active' });
        const reporterIds = reporters.map(r => r._id);
        const allAssociatedUserIds = [new mongoose.Types.ObjectId(managerId), ...reporterIds.map(id => new mongoose.Types.ObjectId(id))];

        const { startDate, endDate } = req.query;
        let leadQuery = { 
            status: { $nin: ['incomplete', 'rejected'] },
            assignedBy: { $in: allAssociatedUserIds }
        };
        let activityQuery = {
            userId: { $in: allAssociatedUserIds }
        };

        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);

            leadQuery.createdAt = { $gte: start, $lte: end };
            activityQuery.timestamp = { $gte: start, $lte: end };
        }

        const totalLeads = await Lead.countDocuments(leadQuery);
        const activeAgents = reporters.length;
        const totalCalls = await CallActivity.countDocuments(activityQuery);
        const totalProposalSent = await Lead.countDocuments({ ...leadQuery, stage: 'Proposal Sent' });
        const totalOnboarded = await Lead.countDocuments({ ...leadQuery, stage: 'Onboarded' });

        const recentActivity = await LeadActivity.find({ performedBy: { $in: allAssociatedUserIds } })
            .sort({ timestamp: -1 })
            .limit(10)
            .populate('leadId', 'company_name')
            .populate('performedBy', 'name');

        // Team Performance (reporters + manager)
        const topAgentsRaw = await CallActivity.aggregate([
            { $match: activityQuery },
            { $group: { _id: "$userId", callCount: { $sum: 1 } } },
            { $sort: { callCount: -1 } }
        ]);

        let teamPerformance = await Promise.all(allAssociatedUserIds.map(async (uid) => {
            const user = await User.findById(uid).select('name role');
            if (!user) return null;

            const callItem = topAgentsRaw.find(item => item._id.toString() === uid.toString());
            const calls = callItem ? callItem.callCount : 0;

            const leadsAssigned = await Lead.countDocuments({
                status: { $nin: ['incomplete', 'rejected'] },
                assignedBy: uid
            });

            const onboardedCount = await Lead.countDocuments({
                status: { $nin: ['incomplete', 'rejected'] },
                assignedBy: uid,
                stage: 'Onboarded'
            });

            const wonLeads = await Lead.countDocuments({
                status: { $nin: ['incomplete', 'rejected'] },
                assignedBy: uid,
                stage: 'Won'
            });

            return {
                _id: uid,
                name: user.name,
                role: user.role,
                calls,
                leads: leadsAssigned,
                won: wonLeads,
                onboarded: onboardedCount,
                winRate: leadsAssigned > 0 ? Math.round(((wonLeads + onboardedCount) / leadsAssigned) * 100) : 0
            };
        }));

        teamPerformance = teamPerformance.filter(Boolean).sort((a, b) => b.calls - a.calls);

        // Call Outcomes breakdown
        const callOutcomesRaw = await CallActivity.aggregate([
            { $match: activityQuery },
            { $group: { _id: '$stage', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        const callOutcomes = callOutcomesRaw.map(item => ({
            name: item._id || 'Uncategorized',
            value: item.count
        }));

        // Leads by Stage
        const leadsByStageRaw = await Lead.aggregate([
            { $match: leadQuery },
            { $group: { _id: '$stage', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        const leadsByStage = leadsByStageRaw.map(item => ({
            name: item._id || 'Unassigned',
            value: item.count
        }));

        // Monthly Calls Trend
        let monthlyTimelineMatch = activityQuery;
        if (!startDate || !endDate) {
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            monthlyTimelineMatch = {
                ...activityQuery,
                timestamp: { $gte: sixMonthsAgo }
            };
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

        res.json({
            stats: {
                totalLeads,
                activeAgents,
                totalCalls,
                totalProposalSent,
                totalOnboarded
            },
            recentActivity: recentActivity.map(activity => ({
                _id: activity._id,
                type: activity.type,
                description: activity.description,
                performedByName: activity.performedBy?.name || 'Unknown',
                timestamp: activity.timestamp,
                leadId: activity.leadId ? { company_name: activity.leadId.company_name } : undefined
            })),
            teamPerformance,
            callOutcomes,
            leadsByStage,
            monthlyTimeline
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/dashboard/manager-reports
// @desc    Get comprehensive chart data for Manager Reports tab
// @access  Private/Manager
router.get('/manager-reports', auth, async (req, res) => {
    try {
        if (req.user.role !== 'Manager' && req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'Access denied' });
        }

        const managerId = req.user.id;
        const reporters = await User.find({ reporter: managerId, status: 'Active' }).select('name role email phone status date_of_joining profile_photo');
        const reporterIds = reporters.map(r => r._id);
        const allAssociatedUserIds = [new mongoose.Types.ObjectId(managerId), ...reporterIds.map(id => new mongoose.Types.ObjectId(id))];

        const { startDate, endDate, agentId } = req.query;
        let leadQuery = {
            status: { $nin: ['incomplete', 'rejected'] },
            assignedBy: { $in: allAssociatedUserIds }
        };
        let activityQuery = {
            userId: { $in: allAssociatedUserIds }
        };

        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);

            leadQuery.createdAt = { $gte: start, $lte: end };
            activityQuery.timestamp = { $gte: start, $lte: end };
        }

        // If a specific agent is selected, filter to just that agent
        if (agentId) {
            const agentObjId = new mongoose.Types.ObjectId(agentId);
            // Ensure the agentId is within the manager's team
            if (!allAssociatedUserIds.some(uid => uid.toString() === agentId)) {
                return res.status(403).json({ message: 'Agent not in your team' });
            }
            leadQuery.assignedBy = agentObjId;
            activityQuery.userId = agentObjId;
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

        // 3. Call Outcomes
        const callOutcomesRaw = await CallActivity.aggregate([
            { $match: activityQuery },
            { $group: { _id: '$stage', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        const callOutcomes = callOutcomesRaw.map(item => ({
            name: item._id || 'Uncategorized',
            value: item.count
        }));

        // 4. Monthly Calls Trend
        let monthlyTimelineMatch = activityQuery;
        if (!startDate || !endDate) {
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            monthlyTimelineMatch = {
                ...activityQuery,
                timestamp: { $gte: sixMonthsAgo }
            };
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

        // 5. Summary Stats
        const summaryStats = {
            totalLeads: await Lead.countDocuments(leadQuery),
            totalReportees: reporters.length,
            totalProposalSent: await Lead.countDocuments({ ...leadQuery, stage: 'Proposal Sent' }),
            totalOnboarded: await Lead.countDocuments({ ...leadQuery, stage: 'Onboarded' }),
            totalCalls: await CallActivity.countDocuments(activityQuery)
        };

        // 6. Agent Performance Matrix (Team)
        let agentPerformanceRaw;
        if (agentId) {
            agentPerformanceRaw = [{
                _id: new mongoose.Types.ObjectId(agentId),
                callCount: await CallActivity.countDocuments(activityQuery)
            }];
        } else {
            agentPerformanceRaw = await CallActivity.aggregate([
                { $match: { userId: { $in: allAssociatedUserIds }, ...( activityQuery.timestamp ? { timestamp: activityQuery.timestamp } : {} ) } },
                { $group: { _id: "$userId", callCount: { $sum: 1 } } }
            ]);
        }

        let agentPerformance = await Promise.all(allAssociatedUserIds.map(async (uid) => {
            const user = await User.findById(uid).select('name role');
            if (!user) return null;

            const callItem = agentPerformanceRaw.find(item => item._id.toString() === uid.toString());
            const calls = callItem ? callItem.callCount : 0;

            const leadsAssigned = await Lead.countDocuments({
                status: { $nin: ['incomplete', 'rejected'] },
                assignedBy: uid,
                ...( leadQuery.createdAt ? { createdAt: leadQuery.createdAt } : {} )
            });

            const leadsWon = await Lead.countDocuments({
                status: { $nin: ['incomplete', 'rejected'] },
                assignedBy: uid,
                stage: 'Won',
                ...( leadQuery.createdAt ? { createdAt: leadQuery.createdAt } : {} )
            });

            const leadsOnboarded = await Lead.countDocuments({
                status: { $nin: ['incomplete', 'rejected'] },
                assignedBy: uid,
                stage: 'Onboarded',
                ...( leadQuery.createdAt ? { createdAt: leadQuery.createdAt } : {} )
            });

            return {
                agentId: uid,
                name: user.name,
                role: user.role,
                calls,
                leads: leadsAssigned,
                won: leadsWon,
                onboarded: leadsOnboarded,
                winRate: leadsAssigned > 0 ? Math.round(((leadsWon + leadsOnboarded) / leadsAssigned) * 100) : 0
            };
        }));
        agentPerformance = agentPerformance.filter(Boolean).sort((a, b) => b.calls - a.calls);
        if (agentId) {
            agentPerformance = agentPerformance.filter(a => a.agentId.toString() === agentId);
        }

        // 7. Reportees List (full info)
        const manager = await User.findById(managerId).select('name role email');
        const reporteesList = reporters.map(r => ({
            _id: r._id,
            name: r.name,
            role: r.role,
            email: r.email,
            phone: r.phone || 'N/A',
            status: r.status,
            date_of_joining: r.date_of_joining,
            profile_photo: r.profile_photo
        }));

        res.json({
            leadsByStage,
            leadsByIndustry,
            callOutcomes,
            monthlyTimeline,
            summaryStats,
            agentPerformance,
            reportees: reporteesList,
            managerInfo: manager ? { name: manager.name, role: manager.role } : null
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/dashboard/manager-agent-calls
// @desc    Get detailed call logs for a specific agent (Manager scoped)
// @access  Private/Manager
router.get('/manager-agent-calls', auth, async (req, res) => {
    try {
        if (req.user.role !== 'Manager' && req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'Access denied' });
        }

        const managerId = req.user.id;
        const reporters = await User.find({ reporter: managerId, status: 'Active' });
        const reporterIds = reporters.map(r => r._id.toString());
        const allIds = [managerId, ...reporterIds];

        const { agentId, startDate, endDate } = req.query;
        if (!agentId) {
            return res.status(400).json({ message: 'Agent ID is required' });
        }

        // Verify agent is within the manager's team
        if (!allIds.includes(agentId)) {
            return res.status(403).json({ message: 'Agent not in your team' });
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
            let pocName = 'Unknown';
            let designation = 'N/A';
            if (call.leadId && call.leadId.points_of_contact) {
                const poc = call.leadId.points_of_contact.id(call.pocId);
                if (poc) {
                    pocName = poc.name;
                    designation = poc.designation || 'N/A';
                }
            }

            return {
                _id: call._id,
                companyName: call.leadId ? call.leadId.company_name : 'Deleted Lead',
                pocName,
                designation,
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

module.exports = router;

