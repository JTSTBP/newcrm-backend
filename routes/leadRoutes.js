const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const CallActivity = require('../models/CallActivity');
const LeadActivity = require('../models/LeadActivity');
const Task = require('../models/Task');
const logActivity = require('../utils/logActivity');
const auth = require('../middleware/authMiddleware');
const mongoose = require('mongoose');

// Helper to build lead query based on filters
const buildLeadQuery = (params) => {
    const { search, leadStage, assignedBy, pocStage, startDate, endDate, status } = params;
    let query = {};

    if (search) {
        query.$or = [
            { company_name: { $regex: search, $options: 'i' } },
            { website_url: { $regex: search, $options: 'i' } },
            { company_email: { $regex: search, $options: 'i' } }
        ];
    }

    if (leadStage) query.stage = leadStage;
    if (assignedBy) query.assignedBy = assignedBy;
    if (pocStage) {
        query.points_of_contact = { $elemMatch: { stage: pocStage } };
    }
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            query.createdAt.$lte = end;
        }
    }

    if (status === 'approved') {
        query.status = { $ne: 'incomplete' };
    } else if (status === 'incomplete') {
        query.$or = [
            { status: 'incomplete' },
            { 'points_of_contact.approvalStatus': 'pending' }
        ];
    } else if (status) {
        query.status = status;
    }

    return query;
};

// @route   GET /api/leads
// @desc    Get all leads with pagination
// @access  Private (Admin)
router.get('/', auth, async (req, res) => {
    try {
        // Admins can see all, others can only see their own (or access might be restricted entirely to valid roles)
        if (!['Admin', 'Manager', 'BD Executive'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Access denied.' });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const query = buildLeadQuery(req.query);

        // Default to approved leads (anything not marked incomplete) if no status filter is provided
        if (!req.query.status) {
            query.status = { $ne: 'incomplete' };
        }

        // Enforce user isolation for non-admins
        if (req.user.role !== 'Admin') {
            const userFilter = {
                $or: [
                    { assignedBy: req.user.id },
                    { createdBy: req.user.id },
                    { assignedTo: req.user.id }
                ]
            };
            // Use $and to combine with existing query (like status filters)
            query.$and = query.$and || [];
            query.$and.push(userFilter);
        }

        const totalLeads = await Lead.countDocuments(query);
        const leads = await Lead.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('assignedBy', 'name email')
            .populate('createdBy', 'name email')
            .populate('assignedTo', 'name email');

        const results = leads.map(lead => {
            const leadObj = lead.toObject();
            // If viewing approved leads (or default), hide pending POCs
            if (!req.query.status || req.query.status === 'approved') {
                leadObj.points_of_contact = (leadObj.points_of_contact || []).filter(poc => poc.approvalStatus !== 'pending');
            }
            return leadObj;
        });

        res.json({
            leads: results,
            currentPage: page,
            totalPages: Math.ceil(totalLeads / limit),
            totalLeads
        });
    } catch (err) {
        console.error('Fetch leads error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   GET /api/leads/check
// @desc    Check if a lead with a specific URL exists
// @access  Private (Admin, Manager, BD Executive)
router.get('/check', auth, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) {
            return res.status(400).json({ message: 'Website URL is required for checking.' });
        }

        // Search for lead with this URL
        const lead = await Lead.findOne({ website_url: url });
        if (!lead) {
            return res.status(404).json({ message: 'No lead found with this website URL.' });
        }

        // Add ownership check for non-admins
        if (req.user.role !== 'Admin') {
            const isOwner = lead.assignedBy?.toString() === req.user.id ||
                lead.createdBy?.toString() === req.user.id ||
                (lead.assignedTo && lead.assignedTo.some(id => id.toString() === req.user.id));

            if (!isOwner) {
                return res.status(403).json({ message: 'Access denied. You do not have permission to add POCs to this lead.' });
            }
        }

        res.json({ id: lead._id, company_name: lead.company_name });
    } catch (err) {
        console.error('Check lead error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// Helper to validate POC uniqueness within a lead
const validatePOCs = (pocs) => {
    const phones = new Set();
    const emails = new Set();
    for (const poc of pocs) {
        if (phones.has(poc.phone)) return `Duplicate phone number found: ${poc.phone}`;
        if (poc.email && emails.has(poc.email)) return `Duplicate email found: ${poc.email}`;
        phones.add(poc.phone);
        if (poc.email) emails.add(poc.email);
    }
    return null;
};

// @route   POST /api/leads
// @desc    Create a new lead
// @access  Private (Admin)
router.post('/', auth, async (req, res) => {
    try {
        if (!['Admin', 'Manager', 'BD Executive'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Access denied.' });
        }

        const {
            company_name,
            company_email,
            website_url,
            company_size,
            industry_name,
            linkedin_link,
            stage,
            assignedBy,
            assignedTo,
            points_of_contact,
            status
        } = req.body;

        // POC uniqueness check
        const pocError = validatePOCs(points_of_contact || []);
        if (pocError) return res.status(400).json({ message: pocError });

        // If lead starts as incomplete, all pOCS should be pending
        // Enforce 'incomplete' status for non-admins if not specified
        let leadStatus = status;
        if (req.user.role !== 'Admin' && !status) {
            leadStatus = 'incomplete';
        }

        const processedPocs = (points_of_contact || []).map(poc => ({
            ...poc,
            approvalStatus: 'pending'
        }));

        const finalAssignedBy = (req.user.role === 'Admin' && assignedBy) ? assignedBy : req.user.id;

        // Basic validation
        if (!website_url) {
            return res.status(400).json({ message: 'Please provide website URL.' });
        }

        if (status !== 'incomplete' && !company_name) {
            return res.status(400).json({ message: 'Company name is required for approved leads.' });
        }

        // Check if website already exists
        const existingLead = await Lead.findOne({ website_url });
        if (existingLead) {
            return res.status(400).json({ message: 'A lead with this website already exists.' });
        }

        const newLead = new Lead({
            company_name,
            company_email,
            website_url,
            company_size,
            industry_name,
            linkedin_link,
            stage: stage || 'New',
            assignedBy: finalAssignedBy,
            createdBy: req.user.id,
            assignedTo: assignedTo || [],
            points_of_contact: processedPocs,
            status: leadStatus || 'approved'
        });

        const lead = await newLead.save();
        const populatedLead = await Lead.findById(lead._id)
            .populate('assignedBy', 'name email')
            .populate('createdBy', 'name email')
            .populate('assignedTo', 'name email');

        // Log activity
        await logActivity({
            leadId: lead._id,
            type: 'Lead Created',
            description: `Lead "${company_name}" was created.`,
            userId: req.user.id,
            userName: req.user.name || 'Admin',
            metadata: { company_name, website_url, stage: stage || 'New' }
        });

        res.status(201).json(populatedLead);
    } catch (err) {
        console.error('Create lead error:', err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
});

// @route   GET /api/leads/pocs
// @desc    Get all POCs across all leads
// @access  Private (Admin)
router.get('/pocs', auth, async (req, res) => {
    try {
        if (!['Admin', 'Manager', 'BD Executive'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Access denied.' });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';

        const pipeline = [];

        // Enforce user isolation for non-admins
        if (req.user.role !== 'Admin') {
            pipeline.push({ $match: { assignedBy: new mongoose.Types.ObjectId(req.user.id) } });
        }

        pipeline.push(
            { $unwind: "$points_of_contact" },
            { $match: { "points_of_contact.approvalStatus": { $ne: 'pending' } } },
            {
                $lookup: {
                    from: "users",
                    localField: "assignedBy",
                    foreignField: "_id",
                    as: "assignedUser"
                }
            },
            { $unwind: { path: "$assignedUser", preserveNullAndEmptyArrays: true } }
        );

        if (search) {
            pipeline.push({
                $match: {
                    $or: [
                        { company_name: { $regex: search, $options: 'i' } },
                        { "points_of_contact.name": { $regex: search, $options: 'i' } },
                        { "points_of_contact.phone": { $regex: search, $options: 'i' } },
                        { "assignedUser.name": { $regex: search, $options: 'i' } }
                    ]
                }
            });
        }

        pipeline.push({
            $facet: {
                metadata: [{ $count: "total" }],
                data: [
                    { $sort: { createdAt: -1, _id: -1, "points_of_contact._id": -1 } },
                    { $skip: skip },
                    { $limit: limit },
                    {
                        $project: {
                            lead_id: "$_id",
                            company_name: 1,
                            poc_id: "$points_of_contact._id",
                            poc_name: "$points_of_contact.name",
                            designation: "$points_of_contact.designation",
                            contact: "$points_of_contact.phone",
                            linkedin_url: "$points_of_contact.linkedin_url",
                            createdAt: "$createdAt",
                            assignedBy: "$assignedUser.name",
                            latest_remark_id: "$points_of_contact.latest_remark_id",
                            remarks: 1
                        }
                    }
                ]
            }
        });

        const pocsData = await Lead.aggregate(pipeline);

        const totalPocs = pocsData[0]?.metadata[0]?.total || 0;
        const paginatedPocs = pocsData[0]?.data || [];

        const formattedPocs = paginatedPocs.map(poc => {
            let latestRemarkContent = "";
            let pocRemarks = [];

            if (Array.isArray(poc.remarks)) {
                // Filter remarks for this specific POC
                pocRemarks = poc.remarks.filter(r => r.poc_id && r.poc_id.toString() === poc.poc_id.toString());
            }

            if (poc.latest_remark_id && pocRemarks.length > 0) {
                const latestRemark = pocRemarks.find(
                    r => r._id && r._id.toString() === poc.latest_remark_id.toString()
                );
                if (latestRemark) {
                    latestRemarkContent = latestRemark.content;
                } else {
                    latestRemarkContent = pocRemarks[pocRemarks.length - 1].content;
                }
            } else if (pocRemarks.length > 0) {
                latestRemarkContent = pocRemarks[pocRemarks.length - 1].content;
            }

            return {
                lead_id: poc.lead_id,
                company_name: poc.company_name,
                poc_id: poc.poc_id,
                name: poc.poc_name,
                designation: poc.designation,
                contact: poc.contact,
                linkedin_url: poc.linkedin_url,
                created_at: poc.createdAt,
                assigned_by: poc.assignedBy,
                remarks: latestRemarkContent,
                remarks_count: pocRemarks.length,
                all_remarks: pocRemarks.map(r => ({
                    content: r.content,
                    created_at: r.created_at,
                    by: r.profile?.name || 'Unknown'
                })).reverse() // Latest first
            };
        });

        res.json({
            pocs: formattedPocs,
            currentPage: page,
            totalPages: Math.ceil(totalPocs / limit),
            totalPocs
        });
    } catch (err) {
        console.error('Fetch all POCs error:', err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
});

// @route   GET /api/leads/poc/:pocId
// @desc    Get detailed info for a specific POC within its lead context
// @access  Private
router.get('/poc/:pocId', auth, async (req, res) => {
    try {
        const lead = await Lead.findOne({ "points_of_contact._id": req.params.pocId }).populate('assignedBy', 'name email').lean();
        if (!lead) {
            return res.status(404).json({ message: 'Contact not found' });
        }

        // Enforce data isolation for non-admins
        if (req.user.role !== 'Admin' && lead.assignedBy._id.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Access denied. You do not own the lead for this contact.' });
        }

        const poc = lead.points_of_contact.find(p => p._id.toString() === req.params.pocId);

        // Fetch Tasks (Filtered by user unless Admin)
        const taskQuery = { poc_id: req.params.pocId };
        if (req.user.role !== 'Admin') {
            taskQuery.user_id = req.user.id;
        }
        const tasks = await Task.find(taskQuery)
            .populate('user_id', 'name')
            .populate('createdBy', 'name')
            .sort({ created_at: -1 });

        // Fetch Logs and activities for the parent lead
        const activities = await LeadActivity.find({ leadId: lead._id }).sort({ timestamp: -1 }).lean();

        // Fetch specifically Call activities for this POC from CallActivity model
        const calls = await CallActivity.find({ pocId: req.params.pocId }).sort({ timestamp: -1 }).lean();

        let pocRemarks = [];
        if (Array.isArray(lead.remarks)) {
            pocRemarks = lead.remarks.filter(r => r.poc_id && r.poc_id.toString() === poc._id.toString());
        }

        // Strict Isolation: Hide from view if pending (unless Admin/Special flag)
        const includePending = req.query.includePending === 'true';
        if (poc.approvalStatus === 'pending' && !includePending) {
            return res.status(403).json({ message: 'Contact is currently pending approval and cannot be viewed in this mode.' });
        }

        res.json({
            lead: {
                _id: lead._id,
                company_name: lead.company_name,
                industry_name: lead.industry_name,
                website_url: lead.website_url,
                stage: lead.stage,
                assignedBy: lead.assignedBy,
                createdAt: lead.createdAt,
                points_of_contact: lead.points_of_contact
            },
            poc,
            remarks: pocRemarks,
            tasks,
            activities,
            calls
        });
    } catch (err) {
        console.error('Fetch specific POC error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   GET /api/leads/:id
// @desc    Get single lead details
// @access  Private (Admin)
router.get('/:id', auth, async (req, res) => {
    try {
        if (!['Admin', 'Manager', 'BD Executive'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Access denied.' });
        }

        const lead = await Lead.findById(req.params.id)
            .populate('assignedBy', 'name email')
            .populate('createdBy', 'name email')
            .populate('assignedTo', 'name email');
        if (!lead) return res.status(404).json({ message: 'Lead not found' });

        // Enforce user isolation for non-admins
        const isOwner = lead.assignedBy?._id?.toString() === req.user.id ||
            lead.createdBy?._id?.toString() === req.user.id ||
            (lead.assignedTo && lead.assignedTo.some(u => u._id?.toString() === req.user.id));

        if (req.user.role !== 'Admin' && !isOwner) {
            return res.status(403).json({ message: 'Access denied. You do not own this lead.' });
        }

        const leadObj = lead.toObject();
        const includePending = req.query.includePending === 'true';

        // Strict isolation: hide pending POCs unless specifically requested (for approval flow)
        if (!includePending) {
            leadObj.points_of_contact = (leadObj.points_of_contact || []).filter(poc => poc.approvalStatus !== 'pending');
        }

        res.json(leadObj);
    } catch (err) {
        console.error('Fetch lead details error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   GET /api/leads/:id/activities
// @desc    Get all activity log entries for a specific lead
// @access  Private
router.get('/:id/activities', auth, async (req, res) => {
    try {
        const activities = await LeadActivity.find({ leadId: req.params.id })
            .sort({ timestamp: -1 })
            .lean();
        res.json(activities);
    } catch (err) {
        console.error('Fetch lead activities error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   PUT /api/leads/:id
// @desc    Update lead details (stage, assignedBy)
// @access  Private (Admin)
router.put('/:id', auth, async (req, res) => {
    try {
        if (!['Admin', 'Manager', 'BD Executive'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Access denied.' });
        }

        const {
            company_name,
            company_email,
            website_url,
            company_size,
            industry_name,
            linkedin_link,
            stage,
            assignedBy,
            assignedTo,
            points_of_contact,
            status
        } = req.body;

        const oldLead = await Lead.findById(req.params.id)
            .populate('assignedBy', 'name')
            .populate('createdBy', 'name')
            .populate('assignedTo', 'name');

        if (!oldLead) return res.status(404).json({ message: 'Lead not found' });

        // Enforce user isolation for non-admins
        const isOwner = oldLead.assignedBy?._id?.toString() === req.user.id ||
            oldLead.createdBy?._id?.toString() === req.user.id ||
            (oldLead.assignedTo && oldLead.assignedTo.some(u => u._id?.toString() === req.user.id));

        if (req.user.role !== 'Admin' && !isOwner) {
            return res.status(403).json({ message: 'Access denied. You do not own this lead.' });
        }

        const oldStage = oldLead?.stage;
        const oldAssignedBy = oldLead?.assignedBy?._id?.toString();
        const oldPocCount = oldLead?.points_of_contact?.length || 0;

        // Website uniqueness check (if changed)
        if (website_url && website_url !== oldLead.website_url) {
            const existingLead = await Lead.findOne({ website_url });
            if (existingLead) {
                return res.status(400).json({ message: 'A lead with this website already exists.' });
            }
        }

        // Prepare update data
        const updateData = {};
        if (company_name !== undefined) updateData.company_name = company_name;
        if (company_email !== undefined) updateData.company_email = company_email;
        if (website_url && req.user.role !== 'BD Executive') updateData.website_url = website_url;
        if (company_size !== undefined) updateData.company_size = company_size;
        if (industry_name !== undefined) updateData.industry_name = industry_name;
        if (linkedin_link !== undefined) updateData.linkedin_link = linkedin_link;
        if (stage) updateData.stage = stage;
        if (assignedBy && req.user.role !== 'BD Executive') updateData.assignedBy = assignedBy;
        if (assignedTo !== undefined) updateData.assignedTo = assignedTo;

        if (points_of_contact) {
            // POC uniqueness check
            const pocError = validatePOCs(points_of_contact);
            if (pocError) return res.status(400).json({ message: pocError });

            // Process POCs: new ones (without _id) are pending if lead is approved (unless admin)
            updateData.points_of_contact = points_of_contact.map(poc => {
                if (poc._id) return poc; // existing

                // New POC logic:
                // 1. If it's an 'incomplete' lead being updated, it's 'pending'
                // 2. If it's an 'approved' lead and user is Admin, it's 'approved'
                // 3. If it's an 'approved' lead and user is NOT Admin, it's 'pending' (granular approval)
                const initialStatus = 'pending';

                return {
                    ...poc,
                    approvalStatus: initialStatus
                };
            });
        }
        if (status) updateData.status = status;

        const updatedLead = await Lead.findByIdAndUpdate(
            req.params.id,
            { $set: updateData },
            { new: true, runValidators: true }
        ).populate('assignedBy', 'name email').populate('createdBy', 'name email').populate('assignedTo', 'name email');

        if (!updatedLead) return res.status(404).json({ message: 'Lead not found' });

        const actorName = req.user.name || 'Admin';
        const leadId = req.params.id;

        // Log stage change
        if (stage && stage !== oldStage) {
            await logActivity({
                leadId,
                type: 'Stage Changed',
                description: `Stage changed from "${oldStage}" to "${stage}".`,
                userId: req.user.id,
                userName: actorName,
                metadata: { from: oldStage, to: stage }
            });
        }

        // Log reassignment
        if (assignedBy && assignedBy !== oldAssignedBy) {
            await logActivity({
                leadId,
                type: 'Reassigned',
                description: `Lead reassigned to a new user.`,
                userId: req.user.id,
                userName: actorName,
                metadata: { newAssignee: updatedLead.assignedBy?.name }
            });
        }

        // Log POC changes
        if (points_of_contact) {
            const newPocCount = updatedLead.points_of_contact.length;
            if (newPocCount > oldPocCount) {
                await logActivity({
                    leadId,
                    type: 'POC Added',
                    description: `${newPocCount - oldPocCount} new contact(s) added (total: ${newPocCount}).`,
                    userId: req.user.id,
                    userName: actorName,
                    metadata: { newPocCount }
                });
            } else if (newPocCount === oldPocCount) {
                await logActivity({
                    leadId,
                    type: 'POC Updated',
                    description: `Contact details updated.`,
                    userId: req.user.id,
                    userName: actorName
                });
            }
        }

        // Log general lead info update
        if (company_name || website_url || company_email || company_size || industry_name || linkedin_link) {
            await logActivity({
                leadId,
                type: 'Lead Updated',
                description: `Lead information was updated.`,
                userId: req.user.id,
                userName: actorName
            });
        }

        res.json(updatedLead);
    } catch (err) {
        console.error('Update lead error:', err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
});

// @route   DELETE /api/leads/:id/poc/:pocId
// @desc    Delete a specific Point of Contact (POC) from a lead
// @access  Private (Admin)
router.delete('/:id/poc/:pocId', auth, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'Access denied. Admins only.' });
        }

        const lead = await Lead.findById(req.params.id);
        if (!lead) return res.status(404).json({ message: 'Lead not found' });

        // Ensure at least one POC remains
        if (lead.points_of_contact.length <= 1) {
            return res.status(400).json({ message: 'A lead must have at least one Point of Contact.' });
        }

        const pocToRemove = lead.points_of_contact.find(p => p._id.toString() === req.params.pocId);

        // Use $pull to remove the POC by its subdocument _id
        const result = await Lead.findByIdAndUpdate(
            req.params.id,
            { $pull: { points_of_contact: { _id: req.params.pocId } } },
            { new: true }
        ).populate('assignedBy', 'name email');

        await logActivity({
            leadId: req.params.id,
            type: 'POC Removed',
            description: `Contact "${pocToRemove?.name || 'Unknown'}" was removed.`,
            userId: req.user.id,
            userName: req.user.name || 'Admin',
            metadata: { pocName: pocToRemove?.name, pocPhone: pocToRemove?.phone }
        });

        console.log(`[DEBUG] POC ${req.params.pocId} removed from lead ${req.params.id}. Remaining: ${result.points_of_contact.length}`);
        res.json(result);
    } catch (err) {
        console.error('Delete POC error:', err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
});

// @route   DELETE /api/leads/:id
// @desc    Delete a lead
// @access  Private (Admin)
router.delete('/:id', auth, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'Access denied. Admins only.' });
        }

        const lead = await Lead.findById(req.params.id);
        if (!lead) return res.status(404).json({ message: 'Lead not found' });

        // Cascading Deletes
        await Promise.all([
            Task.deleteMany({ lead_id: req.params.id }),
            CallActivity.deleteMany({ leadId: req.params.id }),
            LeadActivity.deleteMany({ leadId: req.params.id }),
            Lead.findByIdAndDelete(req.params.id)
        ]);

        res.json({ message: 'Lead and all associated data removed successfully' });
    } catch (err) {
        console.error('Delete lead error:', err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
});

// @route   POST /api/leads/:id/poc
// @desc    Add a point of contact to an existing lead
// @access  Private
router.post('/:id/poc', auth, async (req, res) => {
    try {
        const { name, designation, phone, email, linkedin_url, stage } = req.body;
        if (!name || !phone || !email) {
            return res.status(400).json({ message: 'Name, Phone, and Email are mandatory fields.' });
        }

        const lead = await Lead.findById(req.params.id);
        if (!lead) return res.status(404).json({ message: 'Lead not found' });

        // Enforce user isolation for non-admins
        const isOwner = lead.assignedBy?.toString() === req.user.id ||
            lead.createdBy?.toString() === req.user.id ||
            (lead.assignedTo && lead.assignedTo.some(u => u.toString() === req.user.id));

        if (req.user.role !== 'Admin' && !isOwner) {
            return res.status(403).json({ message: 'Access denied. You do not own this lead.' });
        }

        // Check for duplicates
        const isDuplicate = lead.points_of_contact.some(p =>
            p.phone === phone || (p.email && p.email.toLowerCase() === email.toLowerCase())
        );

        if (isDuplicate) {
            return res.status(400).json({ message: 'A contact with this phone or email already exists in this lead.' });
        }

        const newPOC = {
            name,
            designation,
            phone,
            email,
            linkedin_url,
            stage: stage || 'New',
            approvalStatus: 'pending'
        };
        lead.points_of_contact.push(newPOC);
        await lead.save();

        const addedPOC = lead.points_of_contact[lead.points_of_contact.length - 1];

        // Log activity
        await logActivity({
            leadId: lead._id,
            type: 'POC Added',
            description: `Added new Point of Contact: ${name}`,
            userId: req.user.id,
            userName: req.user.name,
            metadata: { pocId: addedPOC._id, name, designation }
        });

        res.json({ message: 'Point of Contact added successfully', poc: addedPOC });
    } catch (err) {
        console.error('Add POC error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   PUT /api/leads/:id/poc/:pocId
// @desc    Update a specific point of contact within a lead
// @access  Private
router.put('/:id/poc/:pocId', auth, async (req, res) => {
    try {
        const { name, designation, phone, email, linkedin_url, stage } = req.body;
        if (!name || !phone || !email) {
            return res.status(400).json({ message: 'Name, Phone, and Email are mandatory fields.' });
        }

        const lead = await Lead.findById(req.params.id);
        if (!lead) return res.status(404).json({ message: 'Lead not found' });

        // Enforce user isolation for non-admins
        const isOwner = lead.assignedBy?.toString() === req.user.id ||
            lead.createdBy?.toString() === req.user.id ||
            (lead.assignedTo && lead.assignedTo.some(u => u.toString() === req.user.id));

        if (req.user.role !== 'Admin' && !isOwner) {
            return res.status(403).json({ message: 'Access denied. You do not own this lead.' });
        }

        const pocIndex = lead.points_of_contact.findIndex(p => p._id.toString() === req.params.pocId);
        if (pocIndex === -1) return res.status(404).json({ message: 'Contact not found' });

        // Check for duplicates (excluding the current POC)
        const isDuplicate = lead.points_of_contact.some((p, idx) =>
            idx !== pocIndex && (p.phone === phone || (p.email && p.email.toLowerCase() === email.toLowerCase()))
        );

        if (isDuplicate) {
            return res.status(400).json({ message: 'Another contact with this phone or email already exists in this lead.' });
        }

        // Update POC
        lead.points_of_contact[pocIndex] = {
            ...lead.points_of_contact[pocIndex].toObject(),
            name,
            designation,
            phone,
            email,
            linkedin_url,
            stage: stage || lead.points_of_contact[pocIndex].stage
        };

        await lead.save();

        // Log activity
        await logActivity({
            leadId: lead._id,
            type: 'POC Updated',
            description: `Updated Point of Contact: ${name}`,
            userId: req.user.id,
            userName: req.user.name,
            metadata: { pocId: req.params.pocId, name, designation }
        });

        res.json({ message: 'Contact updated successfully', poc: lead.points_of_contact[pocIndex] });
    } catch (err) {
        console.error('Update POC error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   PATCH /api/leads/bulk/update
// @desc    Bulk update lead fields
// @access  Private (Admin)
router.patch('/bulk/update', auth, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'Access denied. Admins only.' });
        }

        const { ids, isAllGlobal, filters, updates } = req.body;

        if (!updates || Object.keys(updates).length === 0) {
            return res.status(400).json({ message: 'Please provide updates.' });
        }

        let query = {};
        if (isAllGlobal) {
            query = buildLeadQuery(filters || {});
        } else if (ids && Array.isArray(ids)) {
            query = { _id: { $in: ids } };
        } else {
            return res.status(400).json({ message: 'Please provide IDs or a global selection flag.' });
        }

        const result = await Lead.updateMany(query, { $set: updates });

        res.json({ message: `Successfully updated ${result.modifiedCount} leads.` });
    } catch (err) {
        console.error('Bulk update error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   PATCH /api/leads/:id/approve
// @desc    Approve an incomplete lead
// @access  Private (Admin)
router.patch('/:id/approve', auth, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'Access denied. Admins only.' });
        }

        const lead = await Lead.findById(req.params.id);
        if (!lead) return res.status(404).json({ message: 'Lead not found' });

        // Enforce validation for approval (if lead is not approved yet)
        if (lead.status !== 'approved') {
            const errors = [];
            if (!lead.company_name) errors.push('Company Name is mandatory.');
            if (!lead.points_of_contact || lead.points_of_contact.length === 0) {
                errors.push('At least one Point of Contact is mandatory.');
            } else {
                // Check for missing fields
                lead.points_of_contact.forEach((poc, index) => {
                    if (!poc.name || !poc.phone) {
                        errors.push(`POC #${index + 1} is missing Name or Phone.`);
                    }
                });

                // Check for duplicates
                const pocUniquenessError = validatePOCs(lead.points_of_contact);
                if (pocUniquenessError) errors.push(pocUniquenessError);
            }

            if (errors.length > 0) {
                return res.status(400).json({
                    message: 'Lead/Contacts are missing mandatory fields for approval.',
                    errors
                });
            }
        }

        // Set lead status to approved and ALL POCs to approved
        lead.status = 'approved';
        lead.points_of_contact.forEach(poc => {
            poc.approvalStatus = 'approved';
        });

        await lead.save();

        // Log activity
        await logActivity({
            leadId: lead._id,
            type: 'Lead Approved',
            description: `Lead "${lead.company_name || lead.website_url}" and all contacts were approved by Admin.`,
            userId: req.user.id,
            userName: req.user.name || 'Admin'
        });

        res.json({ message: 'Lead and all contacts approved successfully', lead });
    } catch (err) {
        console.error('Approve lead error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   PATCH /api/leads/:id/approve-poc/:pocId
// @desc    Approve a specific POC within a lead
// @access  Private (Admin)
router.patch('/:id/approve-poc/:pocId', auth, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'Access denied. Admins only.' });
        }

        const lead = await Lead.findById(req.params.id);
        if (!lead) return res.status(404).json({ message: 'Lead not found' });

        const poc = lead.points_of_contact.id(req.params.pocId);
        if (!poc) return res.status(404).json({ message: 'POC not found' });

        // Validate POC
        if (!poc.name || !poc.phone) {
            return res.status(400).json({ message: 'POC Name and Phone are required for approval' });
        }

        // Check for duplicates within the same lead
        const isDuplicate = lead.points_of_contact.some(p =>
            p._id.toString() !== req.params.pocId &&
            p.approvalStatus === 'approved' &&
            (p.phone === poc.phone || (poc.email && p.email && p.email === poc.email))
        );

        if (isDuplicate) {
            return res.status(400).json({ message: 'A contact with this phone or email already exists in this lead.' });
        }

        poc.approvalStatus = 'approved';
        await lead.save();

        // Log activity
        await logActivity({
            leadId: lead._id,
            type: 'POC Approved',
            description: `POC "${poc.name}" for lead "${lead.company_name || lead.website_url}" was approved by Admin.`,
            userId: req.user.id,
            userName: req.user.name || 'Admin'
        });

        res.json({ message: 'POC approved successfully', lead });
    } catch (err) {
        console.error('Approve POC error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   POST /api/leads/bulk-upload
// @desc    Bulk upload leads
// @access  Private (Admin)
router.post('/bulk-upload', auth, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'Access denied. Admins only.' });
        }

        const { leads } = req.body;
        if (!leads || !Array.isArray(leads)) {
            return res.status(400).json({ message: 'Please provide an array of leads.' });
        }

        const stats = {
            created: 0,
            updated: 0,
            failed: 0,
            errors: []
        };

        for (let i = 0; i < leads.length; i++) {
            const row = leads[i];
            try {
                const {
                    company_name,
                    company_email,
                    website_url,
                    company_size,
                    industry_name,
                    linkedin_link,
                    stage,
                    assignedBy,
                    points_of_contact
                } = row;

                // Basic validation
                if (!company_name || !website_url) {
                    throw new Error(`Row ${i + 1}: Company name and website URL are mandatory.`);
                }

                // POC uniqueness check within the lead
                const pocError = validatePOCs(points_of_contact || []);
                if (pocError) throw new Error(`Row ${i + 1}: ${pocError}`);

                // Prepare lead data
                const leadData = {
                    company_name,
                    company_email,
                    website_url,
                    company_size,
                    industry_name,
                    linkedin_link,
                    stage: stage || 'New',
                    assignedBy: assignedBy || req.user.id, // Default to current user if not provided
                    createdBy: req.user.id,
                    points_of_contact: (points_of_contact || []).map(p => ({ ...p, approvalStatus: 'pending' }))
                };

                // Use findOneAndUpdate with upsert
                // We search by website_url as it's the unique identifier mentioned
                const existingLead = await Lead.findOne({ website_url });

                if (existingLead) {
                    // Update existing lead fields
                    if (company_name) existingLead.company_name = company_name;
                    if (company_email) existingLead.company_email = company_email;
                    if (company_size) existingLead.company_size = company_size;
                    if (industry_name) existingLead.industry_name = industry_name;
                    if (linkedin_link) existingLead.linkedin_link = linkedin_link;
                    if (stage) existingLead.stage = stage;
                    if (assignedBy) existingLead.assignedBy = assignedBy;

                    // Merge POCs
                    if (points_of_contact && points_of_contact.length > 0) {
                        const existingPocs = existingLead.points_of_contact || [];
                        points_of_contact.forEach(newPoc => {
                            const isDuplicate = existingPocs.some(ep =>
                                (newPoc.phone && ep.phone === newPoc.phone) ||
                                (newPoc.email && ep.email === newPoc.email)
                            );
                            if (!isDuplicate) {
                                existingPocs.push({ ...newPoc, approvalStatus: 'pending' });
                            } else {
                                // Optionally update existing POC details if needed
                                const index = existingPocs.findIndex(ep =>
                                    (newPoc.phone && ep.phone === newPoc.phone) ||
                                    (newPoc.email && ep.email === newPoc.email)
                                );
                                if (index !== -1) {
                                    if (newPoc.name) existingPocs[index].name = newPoc.name;
                                    if (newPoc.designation) existingPocs[index].designation = newPoc.designation;
                                    if (newPoc.stage) existingPocs[index].stage = newPoc.stage;
                                    if (newPoc.linkedin_url) existingPocs[index].linkedin_url = newPoc.linkedin_url;
                                }
                            }
                        });
                        existingLead.points_of_contact = existingPocs;
                    }

                    await existingLead.save();
                    stats.updated++;
                } else {
                    // Create new lead
                    const newLead = new Lead(leadData);
                    await newLead.save();
                    stats.created++;
                }
            } catch (err) {
                stats.failed++;
                stats.errors.push(err.message);
            }
        }

        res.json({
            message: `Processed ${leads.length} leads.`,
            stats
        });
    } catch (err) {
        console.error('Bulk upload error:', err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
});

// @route   POST api/leads/:leadId/poc/:pocId/call
// @desc    Update POC stage, add remark, and log call activity
// @access  Private
router.post('/:leadId/poc/:pocId/call', auth, async (req, res) => {
    try {
        const { leadId, pocId } = req.params;
        const { stage, remarks, device } = req.body;
        const userId = req.user.id;

        const lead = await Lead.findById(leadId);
        if (!lead) return res.status(404).json({ message: 'Lead not found' });

        // Enforce user isolation for non-admins
        const isOwner = lead.assignedBy?.toString() === req.user.id ||
            lead.createdBy?.toString() === req.user.id ||
            (lead.assignedTo && lead.assignedTo.some(u => u.toString() === req.user.id));

        if (req.user.role !== 'Admin' && !isOwner) {
            return res.status(403).json({ message: 'Access denied. You do not own this lead.' });
        }

        const poc = lead.points_of_contact.id(pocId);
        if (!poc) return res.status(404).json({ message: 'POC not found' });

        // 1. Update POC stage
        poc.stage = stage;

        // 2. Auto-advance lead stage to 'Contacted' if it's still 'New'
        const stageOrder = ['New', 'Contacted', 'Proposal Sent', 'Negotiation', 'Won', 'Lost', 'Onboarded', 'No vendor', 'Future Reference'];
        const currentStageIndex = stageOrder.indexOf(lead.stage);
        const contactedIndex = stageOrder.indexOf('Contacted');
        if (currentStageIndex < contactedIndex) {
            lead.stage = 'Contacted';
        }

        // 2. Add/Update remark
        const user = await require('../models/User').findById(userId);
        if (remarks) {
            const remarkData = {
                content: remarks,
                profile: {
                    id: userId,
                    name: user.name
                }
            };

            // Sync to main Lead history
            const newRemark = {
                ...remarkData,
                poc_id: pocId,
                content: `[POC: ${poc.name}] ${remarks}`
            };
            lead.remarks.push(newRemark);

            // Get the ID of the newly added remark from history
            const addedRemark = lead.remarks[lead.remarks.length - 1];
            poc.latest_remark_id = addedRemark._id;
        }

        await lead.save();

        // 3. Log Call Activity
        const callActivity = new CallActivity({
            userId,
            leadId,
            pocId,
            phone: poc.phone,
            stage,
            remarks,
            device,
            timestamp: new Date()
        });
        await callActivity.save();

        // Log to LeadActivity
        await logActivity({
            leadId,
            type: 'Call Logged',
            description: `Called "${poc.name}" - Status set to "${stage}". Remark: "${remarks}" ${device ? `(via ${device})` : ''}`,
            userId,
            userName: user.name,
            metadata: { pocId, stage, remarks, device }
        });

        res.json({ message: 'Call activity logged and POC updated', lead });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/leads/:leadId/poc/:pocId/remark
// @desc    Add a standalone remark for a POC
// @access  Private
router.post('/:leadId/poc/:pocId/remark', auth, async (req, res) => {
    try {
        const { leadId, pocId } = req.params;
        const { content } = req.body;
        const userId = req.user.id;

        if (!content) {
            return res.status(400).json({ message: 'Remark content is required' });
        }

        const lead = await Lead.findById(leadId);
        if (!lead) return res.status(404).json({ message: 'Lead not found' });

        // Enforce user isolation for non-admins
        const isOwner = lead.assignedBy?.toString() === req.user.id ||
            lead.createdBy?.toString() === req.user.id ||
            (lead.assignedTo && lead.assignedTo.some(u => u.toString() === req.user.id));

        if (req.user.role !== 'Admin' && !isOwner) {
            return res.status(403).json({ message: 'Access denied.' });
        }

        const poc = lead.points_of_contact.id(pocId);
        if (!poc) return res.status(404).json({ message: 'POC not found' });

        const user = await require('../models/User').findById(userId);

        const newRemark = {
            content: `[POC: ${poc.name}] ${content}`,
            poc_id: pocId,
            profile: {
                id: userId,
                name: user.name
            }
        };

        lead.remarks.push(newRemark);

        // Update the latest remark ID on the POC
        const addedRemark = lead.remarks[lead.remarks.length - 1];
        poc.latest_remark_id = addedRemark._id;

        await lead.save();

        // Log to LeadActivity
        await logActivity({
            leadId,
            type: 'Remark Added',
            description: `Remark added for "${poc.name}": "${content}"`,
            userId,
            userName: user.name,
            metadata: { pocId, content }
        });

        res.json({ message: 'Remark added successfully', lead });
    } catch (err) {
        console.error('Add remark error:', err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
