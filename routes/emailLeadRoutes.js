// const express = require('express');
// const router = express.Router();
// const mongoose = require('mongoose');
// const auth = require('../middleware/authMiddleware');
// const logActivity = require('../utils/logActivity');
// const Lead = require('../models/Lead');

// // Define EmailLead schema (separate collection)
// const EmailLeadSchema = new mongoose.Schema({
//   website_url: { type: String, unique: true, sparse: true, trim: true },
//   company_name: { type: String },
//   company_email: { type: String },
//   company_size: { type: String },
//   industry_name: { type: String },
//   linkedin_link: { type: String },
//   stage: { type: String, default: 'New' },
//   assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
//   createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
//   assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'users' }],
//   points_of_contact: [{
//     name: String,
//     designation: String,
//     phone: String,
//     email: String,
//     linkedin_url: String,
//     approvalStatus: { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
//     createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users' }
//   }],
//   status: { type: String, enum: ['incomplete','approved','rejected'], default: 'incomplete' },
//   source: { type: String, default: 'email_sending' }
// }, { timestamps: true });

// const EmailLead = mongoose.model('EmailLead', EmailLeadSchema);

// // @route   POST /api/email-leads
// // @desc    Add a new company (Email Sending tab)
// // @access  Private (Admin, Manager, BD Executive)
// router.post('/', auth, async (req, res) => {
//   try {
//     if (!['Admin', 'Manager', 'BD Executive'].includes(req.user.role)) {
//       return res.status(403).json({ message: 'Access denied.' });
//     }

//     const {
//       website_url,
//       company_name,
//       company_email,
//       company_size,
//       industry_name,
//       linkedin_link,
//       stage,
//       assignedBy,
//       assignedTo,
//       points_of_contact,
//       status
//     } = req.body;

//     // website_url mandatory
//     if (!website_url) {
//       return res.status(400).json({ message: 'Website URL is required.' });
//     }

//     // Uniqueness check on website_url (case‑insensitive, trimmed)
//     const normalizedUrl = website_url.trim().toLowerCase();
//     const existing = await EmailLead.findOne({ website_url: normalizedUrl });
//     if (existing) {
//       return res.status(400).json({ message: 'A lead with this website URL already exists.' });
//     }

//     // Process POCs – set approval status based on overall lead status
//     const processedPocs = (points_of_contact || []).map(poc => ({
//       ...poc,
//       approvalStatus: (status === 'incomplete' ? 'pending' : 'approved'),
//       createdBy: req.user.id
//     }));

//     const finalAssignedBy = (req.user.role === 'Admin' && assignedBy) ? assignedBy : req.user.id;

//     const leadData = {
//       website_url: normalizedUrl,
//       company_name,
//       company_email,
//       company_size,
//       industry_name,
//       linkedin_link,
//       stage: stage || 'New',
//       assignedBy: finalAssignedBy,
//       createdBy: req.user.id,
//       assignedTo: assignedTo || [],
//       points_of_contact: processedPocs,
//       status: status || 'incomplete',
//       source: 'email_sending'
//     };

//     const lead = await new EmailLead(leadData).save();

//     await logActivity({
//       leadId: lead._id,
//       type: 'EmailLead Created',
//       description: `Lead "${company_name || normalizedUrl}" created via Email Sending tab.`,
//       userId: req.user.id,
//       userName: req.user.name || 'Admin'
//     });

//     return res.status(201).json(lead);
//   } catch (err) {
//     console.error('Create EmailLead error:', err);
//     return res.status(500).json({ message: 'Server Error', error: err.message });
//   }
// });

// // Helper to validate POC uniqueness within a lead for bulk upload
// const validatePOCs = (pocs) => {
//     const phones = new Set();
//     const emails = new Set();
//     for (const poc of pocs) {
//         if (poc.phone && poc.phone.trim() && poc.phone.trim() !== 'N/A') {
//             const p = poc.phone.trim();
//             if (phones.has(p)) return `Duplicate phone number found in upload data: ${p}`;
//             phones.add(p);
//         }
//         if (poc.email && poc.email.trim()) {
//             const e = poc.email.trim();
//             if (emails.has(e)) return `Duplicate email found in upload data: ${e}`;
//             emails.add(e);
//         }
//     }
//     return null;
// };

// // @route   POST /api/email-leads/bulk-upload
// // @desc    Bulk upload email leads (Email Sending tab)
// // @access  Private (Admin, Manager, BD Executive)
// router.post('/bulk-upload', auth, async (req, res) => {
//     try {
//         if (!['Admin', 'Manager', 'BD Executive'].includes(req.user.role)) {
//             return res.status(403).json({ message: 'Access denied.' });
//         }

//         const { leads } = req.body;
//         if (!leads || !Array.isArray(leads)) {
//             return res.status(400).json({ message: 'Please provide an array of leads.' });
//         }

//         const User = require('../models/User');
//         const validEmails = new Set(
//             leads.map(l => l.assigned_by_email?.toLowerCase().trim()).filter(Boolean)
//         );

//         let emailToUserIdMap = {};
//         if (validEmails.size > 0) {
//             const users = await User.find({ email: { $in: Array.from(validEmails) } }, '_id email');
//             users.forEach(user => {
//                 emailToUserIdMap[user.email.toLowerCase()] = user._id;
//             });
//         }

//         const stats = {
//             created: 0,
//             updated: 0,
//             failed: 0,
//             errors: []
//         };

//         for (let i = 0; i < leads.length; i++) {
//             const row = leads[i];
//             try {
//                 const {
//                     company_name,
//                     company_email,
//                     website_url,
//                     company_size,
//                     industry_name,
//                     linkedin_link,
//                     stage,
//                     assigned_by_email,
//                     assignedBy,
//                     points_of_contact
//                 } = row;

//                 // Determine final assigned_by user ID
//                 let finalAssignedBy = req.user.id;
//                 if (assigned_by_email) {
//                     const normalizedEmail = assigned_by_email.toLowerCase().trim();
//                     if (emailToUserIdMap[normalizedEmail]) {
//                         finalAssignedBy = emailToUserIdMap[normalizedEmail];
//                     }
//                 } else if (assignedBy) {
//                     finalAssignedBy = assignedBy;
//                 }

//                 // Validate POC uniqueness within the row
//                 const pocError = validatePOCs(points_of_contact || []);
//                 if (pocError) throw new Error(`Row ${i + 1}: ${pocError}`);

//                 // Prepare lead data
//                 let normalizedUrl = undefined;
//                 if (website_url) {
//                     normalizedUrl = website_url.trim().toLowerCase();
//                 }

//                 const leadData = {
//                     company_name,
//                     company_email,
//                     company_size,
//                     industry_name,
//                     linkedin_link,
//                     stage: stage || 'New',
//                     assignedBy: finalAssignedBy,
//                     createdBy: req.user.id,
//                     points_of_contact: (points_of_contact || []).map(p => ({
//                         ...p,
//                         approvalStatus: 'approved',
//                         createdBy: req.user.id
//                     })),
//                     source: 'email_sending'
//                 };

//                 if (normalizedUrl) {
//                     leadData.website_url = normalizedUrl;
//                 }

//                 // Find existing email lead
//                 let existingLead = null;
//                 if (normalizedUrl) {
//                     existingLead = await EmailLead.findOne({ website_url: normalizedUrl });
//                 } else if (company_name) {
//                     existingLead = await EmailLead.findOne({ company_name: new RegExp(`^${company_name.trim()}$`, 'i') });
//                 }

//                 if (existingLead) {
//                     // Update existing lead fields
//                     if (company_name) existingLead.company_name = company_name;
//                     if (company_email) existingLead.company_email = company_email;
//                     if (company_size) existingLead.company_size = company_size;
//                     if (industry_name) existingLead.industry_name = industry_name;
//                     if (linkedin_link) existingLead.linkedin_link = linkedin_link;
//                     if (stage) existingLead.stage = stage;
//                     if (assigned_by_email || assignedBy) existingLead.assignedBy = finalAssignedBy;

//                     // Merge POCs
//                     if (points_of_contact && points_of_contact.length > 0) {
//                         const existingPocs = existingLead.points_of_contact || [];
//                         points_of_contact.forEach(newPoc => {
//                             const isDuplicate = existingPocs.some(ep =>
//                                 (newPoc.phone && ep.phone === newPoc.phone && newPoc.phone !== 'N/A') ||
//                                 (newPoc.email && ep.email === newPoc.email)
//                             );
//                             if (!isDuplicate) {
//                                 const approval = (!newPoc.name || !newPoc.phone || !newPoc.email || newPoc.phone === 'N/A') ? 'pending' : 'approved';
//                                 existingPocs.push({
//                                     ...newPoc,
//                                     approvalStatus: approval,
//                                     createdBy: req.user.id
//                                 });
//                             } else {
//                                 const index = existingPocs.findIndex(ep =>
//                                     (newPoc.phone && ep.phone === newPoc.phone && newPoc.phone !== 'N/A') ||
//                                     (newPoc.email && ep.email === newPoc.email)
//                                 );
//                                 if (index !== -1) {
//                                     if (newPoc.name) existingPocs[index].name = newPoc.name;
//                                     if (newPoc.designation) existingPocs[index].designation = newPoc.designation;
//                                     if (newPoc.stage) existingPocs[index].stage = newPoc.stage;
//                                     if (newPoc.linkedin_url) existingPocs[index].linkedin_url = newPoc.linkedin_url;
//                                 }
//                             }
//                         });
//                         existingLead.points_of_contact = existingPocs;
//                     }

//                     await existingLead.save();
//                     stats.updated++;
//                 } else {
//                     leadData.status = 'approved';
//                     const newLead = new EmailLead(leadData);
//                     await newLead.save();
//                     stats.created++;
//                 }
//             } catch (err) {
//                 stats.failed++;
//                 stats.errors.push(err.message);
//             }
//         }
//                res.json({
//             message: `Processed ${leads.length} leads.`,
//             stats
//         });
//     } catch (err) {
//         console.error('Bulk upload error:', err);
//         res.status(500).json({ message: 'Server Error', error: err.message });
//     }
// });

// // Helper to build email lead query based on filters
// const buildEmailLeadQuery = (params) => {
//     const { search, leadStage, assignedBy, pocStage, startDate, endDate, status } = params;
//     let query = {};

//     if (search) {
//         query.$and = query.$and || [];
//         query.$and.push({
//             $or: [
//                 { company_name: { $regex: search, $options: 'i' } },
//                 { website_url: { $regex: search, $options: 'i' } },
//                 { company_email: { $regex: search, $options: 'i' } }
//             ]
//         });
//     }

//     if (leadStage) query.stage = leadStage;
//     if (assignedBy) query.assignedBy = assignedBy;
//     if (startDate || endDate) {
//         query.createdAt = {};
//         if (startDate) query.createdAt.$gte = new Date(startDate);
//         if (endDate) {
//             const end = new Date(endDate);
//             end.setHours(23, 59, 59, 999);
//             query.createdAt.$lte = end;
//         }
//     }

//     if (status === 'approved') {
//         query.status = { $nin: ['incomplete', 'rejected'] };
//     } else if (status === 'incomplete') {
//         query.status = 'incomplete';
//     } else if (status) {
//         query.status = status;
//     }

//     return query;
// };

// // @route   GET /api/email-leads
// // @desc    Get all email leads with pagination
// // @access  Private (Admin, Manager, BD Executive)
// router.get('/', auth, async (req, res) => {
//     try {
//         if (!['Admin', 'Manager', 'BD Executive'].includes(req.user.role)) {
//             return res.status(403).json({ message: 'Access denied.' });
//         }

//         const page = parseInt(req.query.page) || 1;
//         const limit = parseInt(req.query.limit) || 10;
//         const skip = (page - 1) * limit;

//         const query = buildEmailLeadQuery(req.query);

//         // Default to approved leads (anything not marked incomplete or rejected) if no status filter is provided
//         if (!req.query.status) {
//             query.status = { $nin: ['incomplete', 'rejected'] };
//         } else {
//             query.status = req.query.status === 'approved' ? { $nin: ['incomplete', 'rejected'] } : req.query.status;
//         }

//         // Enforce user isolation for non-admins
//         if (req.user.role !== 'Admin') {
//             const User = require('../models/User');
//             let userIds = [req.user.id];
//             if (req.user.role === 'Manager') {
//                 const reporters = await User.find({ reporter: req.user.id }).select('_id');
//                 userIds = userIds.concat(reporters.map(r => r._id.toString()));
//             }
//             const userFilter = {
//                 $or: [
//                     { assignedBy: { $in: userIds } },
//                     { createdBy: { $in: userIds } },
//                     { assignedTo: { $in: userIds } }
//                 ]
//             };
//             query.$and = query.$and || [];
//             query.$and.push(userFilter);
//         }

//         const totalLeads = await EmailLead.countDocuments(query);
//         const leads = await EmailLead.find(query)
//             .sort({ createdAt: -1 })
//             .skip(skip)
//             .limit(limit)
//             .populate('assignedBy', 'name email')
//             .populate('createdBy', 'name email')
//             .populate('assignedTo', 'name email');

//         const results = leads.map(lead => {
//             const leadObj = lead.toObject();
//             if (!req.query.status || req.query.status === 'approved') {
//                 leadObj.points_of_contact = (leadObj.points_of_contact || []).filter(poc => !['pending', 'rejected'].includes(poc.approvalStatus));
//             }
//             return leadObj;
//         });

//         res.json({
//             leads: results,
//             currentPage: page,
//             totalPages: Math.ceil(totalLeads / limit),
//             totalLeads
//         });
//     } catch (err) {
//         console.error('Fetch email leads error:', err);
//         res.status(500).json({ message: 'Server Error' });
//     }
// });

// // @route   GET /api/email-leads/:id
// // @desc    Get email lead by ID
// // @access  Private (Admin, Manager, BD Executive)
// router.get('/:id', auth, async (req, res) => {
//     try {
//         if (!['Admin', 'Manager', 'BD Executive'].includes(req.user.role)) {
//             return res.status(403).json({ message: 'Access denied.' });
//         }

//         const lead = await EmailLead.findById(req.params.id)
//             .populate('assignedBy', 'name email')
//             .populate('createdBy', 'name email')
//             .populate('assignedTo', 'name email');

//         if (!lead) {
//             return res.status(404).json({ message: 'Lead not found.' });
//         }

//         // Add ownership check for non-admins
//         let isOwner = true;
//         if (req.user.role !== 'Admin') {
//             const User = require('../models/User');
//             let userIds = [req.user.id];
//             if (req.user.role === 'Manager') {
//                 const reporters = await User.find({ reporter: req.user.id }).select('_id');
//                 userIds = userIds.concat(reporters.map(r => r._id.toString()));
//             }
//             isOwner = userIds.includes(lead.assignedBy?._id?.toString()) ||
//                 userIds.includes(lead.createdBy?._id?.toString()) ||
//                 (lead.assignedTo && lead.assignedTo.some(u => userIds.includes(u._id?.toString())));
//         }

//         if (!isOwner) {
//             return res.status(403).json({ message: 'Access denied. You do not own this lead.' });
//         }

//         const leadObj = lead.toObject();
//         // If not checking status explicitly, filter pending/rejected POCs
//         if (req.query.includePending !== 'true') {
//             leadObj.points_of_contact = (leadObj.points_of_contact || []).filter(poc => !['pending', 'rejected'].includes(poc.approvalStatus));
//         }

//         res.json(leadObj);
//     } catch (err) {
//         console.error('Fetch email lead details error:', err);
//         res.status(500).json({ message: 'Server Error' });
//     }
// });

// // @route   PUT /api/email-leads/:id
// // @desc    Update email lead details
// // @access  Private (Admin, Manager, BD Executive)
// router.put('/:id', auth, async (req, res) => {
//     try {
//         if (!['Admin', 'Manager', 'BD Executive'].includes(req.user.role)) {
//             return res.status(403).json({ message: 'Access denied.' });
//         }

//         let {
//             company_name,
//             company_email,
//             website_url,
//             company_size,
//             industry_name,
//             linkedin_link,
//             stage,
//             assignedBy,
//             assignedTo,
//             points_of_contact,
//             status
//         } = req.body;

//         if (company_name) company_name = company_name.trim();

//         const oldLead = await EmailLead.findById(req.params.id)
//             .populate('assignedBy', 'name')
//             .populate('createdBy', 'name')
//             .populate('assignedTo', 'name');

//         if (!oldLead) return res.status(404).json({ message: 'Lead not found' });

//         // Enforce user isolation for non-admins
//         let isOwner = false;
//         if (req.user.role === 'Admin') {
//             isOwner = true;
//         } else {
//             const User = require('../models/User');
//             let userIds = [req.user.id];
//             if (req.user.role === 'Manager') {
//                 const reporters = await User.find({ reporter: req.user.id }).select('_id');
//                 userIds = userIds.concat(reporters.map(r => r._id.toString()));
//             }
//             isOwner = userIds.includes(oldLead.assignedBy?._id?.toString()) ||
//                 userIds.includes(oldLead.createdBy?._id?.toString()) ||
//                 (oldLead.assignedTo && oldLead.assignedTo.some(u => userIds.includes(u._id?.toString())));
//         }

//         if (!isOwner) {
//             return res.status(403).json({ message: 'Access denied. You do not own this lead.' });
//         }

//         // Update POCs if provided
//         if (points_of_contact) {
//             const pocError = validatePOCs(points_of_contact);
//             if (pocError) return res.status(400).json({ message: pocError });

//             const oldPocs = oldLead.points_of_contact || [];

//             oldLead.points_of_contact = points_of_contact.map(np => {
//                 const existing = oldPocs.find(op => op._id && op._id.toString() === np._id?.toString());
//                 const approvalStatus = existing ? existing.approvalStatus : (oldLead.status === 'incomplete' ? 'pending' : 'approved');
//                 const createdAt = existing ? existing.createdAt : new Date();
//                 const createdBy = existing ? existing.createdBy : req.user.id;

//                 return {
//                     ...np,
//                     approvalStatus,
//                     createdAt,
//                     createdBy
//                 };
//             });
//         }

//         // Website uniqueness check (if changed)
//         let normalizedUrl = undefined;
//         if (website_url) {
//             normalizedUrl = website_url.trim().toLowerCase();
//         }

//         if (normalizedUrl && normalizedUrl !== oldLead.website_url) {
//             const existingLead = await EmailLead.findOne({ website_url: normalizedUrl });
//             if (existingLead) {
//                 return res.status(400).json({ message: 'A lead with this website already exists.' });
//             }
//         }

//         // Prepare update data
//         if (company_name !== undefined) oldLead.company_name = company_name;
//         if (company_email !== undefined) oldLead.company_email = company_email;
//         if (normalizedUrl !== undefined) oldLead.website_url = normalizedUrl;
//         if (company_size !== undefined) oldLead.company_size = company_size;
//         if (industry_name !== undefined) oldLead.industry_name = industry_name;
//         if (linkedin_link !== undefined) oldLead.linkedin_link = linkedin_link;
//         if (stage !== undefined) oldLead.stage = stage;
//         if (status !== undefined) oldLead.status = status;

//         if (req.user.role === 'Admin' && assignedBy !== undefined) {
//             oldLead.assignedBy = assignedBy;
//         }
//         if (Array.isArray(assignedTo)) {
//             oldLead.assignedTo = assignedTo;
//         }

//         await oldLead.save();

//         const populatedLead = await EmailLead.findById(oldLead._id)
//             .populate('assignedBy', 'name email')
//             .populate('createdBy', 'name email')
//             .populate('assignedTo', 'name email');

//         await logActivity({
//             leadId: oldLead._id,
//             type: 'EmailLead Updated',
//             description: `EmailLead "${company_name || oldLead.company_name}" was updated.`,
//             userId: req.user.id,
//             userName: req.user.name || 'Admin'
//         });

//         return res.status(200).json(populatedLead);
//     } catch (err) {
//         console.error('Update email lead error:', err);
//         return res.status(500).json({ message: 'Server Error', error: err.message });
//     }
// });

// module.exports = router;


const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/authMiddleware');
const logActivity = require('../utils/logActivity');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const Lead = require('../models/Lead');
const AiEmailDraft = require('../models/AiEmailDraft');
const AiGenerationUsage = require('../models/AiGenerationUsage');
const { PROMPT_VERSION, MODEL: AI_MODEL } = require('../utils/aiEmailService');
const { buildAiEmailContext } = require('../utils/aiEmailContext');
const { getEmailResources, hasRequiredEmailResources } = require('../utils/emailResourceConfig');
const { classifyPocRole } = require('../utils/pocRoleClassifier');
const { generatePersonalizedEmail, renderEmailDraft } = require('../services/aiEmail/emailGenerator');
const crypto = require('crypto');
const {
  DAILY_EMAIL_LIMIT,
  getDailyLimitStatus,
  reserveDailyEmailSlot,
  completeDailyEmailReservation,
  releaseDailyEmailReservation,
  logDailyLimitDecision
} = require('../services/emailDailyLimitService');

// Define EmailLead schema (separate collection)
const EmailLeadSchema = new mongoose.Schema({
  website_url: { type: String, unique: true, sparse: true, trim: true },
  company_name: { type: String },
  company_email: { type: String },
  company_size: { type: String },
  industry_name: { type: String },
  company_info: { type: String },
  hiring_needs: [{ type: String }],
  no_of_designations: { type: Number, default: null },
  no_of_positions: { type: Number, default: null },
  linkedin_link: { type: String },
  stage: { type: String, default: 'New' },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
  assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'users' }],
  points_of_contact: [{
    name: String,
    designation: String,
    phone: String,
    email: String,
    linkedin_url: String,
    linkedin_link: String,
    requirementId: String,
    remarks: String,
    notes: String,
    approvalStatus: { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users' }
  }],
  status: { type: String, enum: ['incomplete','approved','rejected'], default: 'incomplete' },
  source: { type: String, default: 'email_sending' }
}, { timestamps: true });

const EmailLead = mongoose.model('EmailLead', EmailLeadSchema);

const findLeadAcrossCollections = async (leadId) => {
  let lead = await EmailLead.findById(leadId);
  if (lead) return { lead, leadSource: 'email_sending' };

  lead = await Lead.findById(leadId);
  return { lead, leadSource: lead ? 'regular' : null };
};

const generationRequests = new Map();
const inFlightAiGenerations = new Map();
const DAILY_AI_GENERATION_LIMIT = Number(process.env.DAILY_AI_GENERATION_LIMIT || 10);
const aiDateKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const reserveAiGeneration = async userId => {
  try {
    const usage = await AiGenerationUsage.findOneAndUpdate(
      { userId, dateKey: aiDateKey(), count: { $lt: DAILY_AI_GENERATION_LIMIT } },
      { $inc: { count: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return Boolean(usage);
  } catch (error) {
    if (error.code === 11000) return false;
    throw error;
  }
};
const checkGenerationRateLimit = (userId) => {
  const now = Date.now();
  const recent = (generationRequests.get(userId) || []).filter(time => now - time < 60_000);
  if (recent.length >= 5) return false;
  recent.push(now);
  generationRequests.set(userId, recent);
  return true;
};

// @route   POST /api/email-leads/generate-ai-email
// @desc    Generate (but never send) a personalized email from CRM lead data
// @access  Private (Admin, Manager, BD Executive)
router.post('/generate-ai-email', auth, async (req, res) => {
  const startedAt = Date.now();
  try {
    if (!['Admin', 'Manager', 'BD Executive'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    const { leadId, pocId, regenerate = false, refreshResearch = false, requestId = crypto.randomUUID() } = req.body || {};
    console.log('[AI] Generate request started', { leadId, pocId, regenerate, refreshResearch, requestId });
    if (!mongoose.isValidObjectId(leadId) || !mongoose.isValidObjectId(pocId)) {
      return res.status(400).json({ message: 'Valid leadId and pocId are required.' });
    }

    const { lead, leadSource } = await findLeadAcrossCollections(leadId);
    if (!lead) return res.status(404).json({ message: 'Lead not found.' });

    if (req.user.role !== 'Admin') {
      let userIds = [req.user.id];
      if (req.user.role === 'Manager') {
        const reporters = await User.find({ reporter: req.user.id }).select('_id');
        userIds = userIds.concat(reporters.map(reporter => reporter._id.toString()));
      }
      const allowed = userIds.includes(lead.assignedBy?.toString()) ||
        userIds.includes(lead.createdBy?.toString()) ||
        lead.assignedTo?.some(user => userIds.includes(user.toString()));
      if (!allowed) return res.status(403).json({ message: 'Access denied. You do not own this lead.' });
    }

    const poc = lead.points_of_contact.id(pocId);
    if (!poc) return res.status(404).json({ message: 'Point of contact not found.' });

    const scopeIds = [req.user.id];
    if (req.user.role === 'Manager') {
      const reporters = await User.find({ reporter: req.user.id }).select('_id').lean();
      scopeIds.push(...reporters.map(reporter => reporter._id.toString()));
    }
    const companyMatches = [];
    if (lead.website_url) companyMatches.push({ website_url: lead.website_url });
    if (lead.company_name) companyMatches.push({ company_name: { $regex: `^${String(lead.company_name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
    const crmLead = companyMatches.length ? await Lead.findOne({
      $and: [
        { $or: companyMatches },
        ...(req.user.role === 'Admin' ? [] : [{ $or: [
          { assignedBy: { $in: scopeIds } }, { createdBy: { $in: scopeIds } }, { assignedTo: { $in: scopeIds } }
        ] }])
      ]
    }).select('website_url linkedin_link industry_name company_info hiring_needs no_of_designations no_of_positions points_of_contact remarks').lean() : null;

    const normalizedEmail = String(poc.email || '').trim().toLowerCase();
    const normalizedLinkedIn = String(poc.linkedin_url || '').trim().toLowerCase();
    const previousPoc = crmLead?.points_of_contact?.find(candidate =>
      (normalizedEmail && String(candidate.email || '').trim().toLowerCase() === normalizedEmail) ||
      (normalizedLinkedIn && String(candidate.linkedin_url || '').trim().toLowerCase() === normalizedLinkedIn) ||
      (poc.name && String(candidate.name || '').trim().toLowerCase() === String(poc.name).trim().toLowerCase())
    );
    const crmNotes = previousPoc ? (crmLead.remarks || [])
      .filter(remark => !remark.poc_id || remark.poc_id.toString() === previousPoc._id.toString())
      .filter(remark => remark.type === 'text' && remark.content)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 10)
      .map(remark => String(remark.content).trim().slice(0, 500)) : [];
    const notes = [...new Set([
      poc.remarks,
      poc.notes,
      previousPoc?.remarks,
      previousPoc?.notes,
      ...crmNotes
    ].map(value => String(value || '').trim()).filter(Boolean))].slice(0, 10);
    const initialClassification = classifyPocRole({ designation: poc.designation || previousPoc?.designation });
    const contextLead = {
      ...lead.toObject(),
      company_info: crmLead?.company_info || lead.company_info,
      hiring_needs: crmLead?.hiring_needs?.length ? crmLead.hiring_needs : lead.hiring_needs,
      no_of_designations: crmLead?.no_of_designations ?? lead.no_of_designations,
      no_of_positions: crmLead?.no_of_positions ?? lead.no_of_positions,
      website_url: lead.website_url || crmLead?.website_url,
      linkedin_link: lead.linkedin_link || crmLead?.linkedin_link,
      industry_name: lead.industry_name || crmLead?.industry_name
    };
    const contextPoc = {
      ...poc.toObject(),
      designation: poc.designation || previousPoc?.designation,
      linkedin_url: poc.linkedin_url || poc.linkedin_link || previousPoc?.linkedin_url,
      requirementId: poc.requirementId || previousPoc?.requirementId
    };

    const resources = getEmailResources();
    if (!hasRequiredEmailResources(resources)) {
      return res.status(503).json({ message: 'AI email resource links are not configured.' });
    }

    const sender = await User.findById(req.user.id).select('name').lean();
    const context = buildAiEmailContext({
      lead: contextLead,
      poc: contextPoc,
      sender,
      previousCrm: { department: initialClassification.department, notes },
      resources
    });
    const inputHash = crypto.createHash('sha256').update(JSON.stringify({
      userId: req.user.id,
      leadId,
      pocId,
      context,
      promptVersion: PROMPT_VERSION,
      model: AI_MODEL
    })).digest('hex');

    if (!regenerate && !refreshResearch) {
      const cached = await AiEmailDraft.findOne({
        userId: req.user.id, leadId, pocId, promptVersion: PROMPT_VERSION, model: AI_MODEL, expiresAt: { $gt: new Date() }
      }).sort({ createdAt: -1 }).lean();
      if (cached) {
        const rendered = renderEmailDraft({ content: cached.content, context, resources });
        console.info('[AI RESPONSE]', { success: true, duration: Date.now() - startedAt, cached: true, retry: false, fallback: false });
        return res.json({ success: true, subject: cached.subject, content: cached.content, ...rendered,
          research: cached.research, enrichment: cached.enrichment, jobDiscovery: cached.jobDiscovery,
          diagnostics: cached.diagnostics, resources, cached: true });
      }
    }

    const inFlightKey = `${req.user.id}:${leadId}:${pocId}:${Boolean(regenerate)}:${Boolean(refreshResearch)}`;
    let generationPromise = inFlightAiGenerations.get(inFlightKey);
    if (!generationPromise) {
      generationPromise = (async () => {
        if (!checkGenerationRateLimit(req.user.id)) {
          throw Object.assign(new Error('Too many generation requests. Please wait a minute and try again.'), { code: 'AI_MINUTE_LIMIT' });
        }
        if (!await reserveAiGeneration(req.user.id)) {
          throw Object.assign(new Error("You have reached today's AI generation limit."), { code: 'AI_DAILY_LIMIT' });
        }
        console.info('[AI REQUEST]', { leadId, pocId, userId: req.user.id, provider: 'Google Gemini', model: AI_MODEL });
        const generatedDraft = await generatePersonalizedEmail({ context, resources, leadId, pocId, refreshResearch: Boolean(refreshResearch) });
        const expiresAt = new Date(Date.now() + 30 * 60_000);
        await AiEmailDraft.findOneAndUpdate(
          { cacheKey: inputHash },
          { userId: req.user.id, leadId, pocId, promptVersion: PROMPT_VERSION, model: AI_MODEL, ...generatedDraft, expiresAt },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        return generatedDraft;
      })();
      inFlightAiGenerations.set(inFlightKey, generationPromise);
      generationPromise.finally(() => inFlightAiGenerations.delete(inFlightKey)).catch(() => {});
    }
    const draft = await generationPromise;
    console.info('[AI RESPONSE]', { success: true, duration: Date.now() - startedAt, cached: false, retry: Boolean(draft.retry), fallback: Boolean(draft.fallback), leadSource });
    return res.json({
      success: true,
      subject: draft.subject,
      content: draft.content,
      htmlBody: draft.htmlBody,
      plainText: draft.plainText,
      research: draft.research,
      enrichment: draft.enrichment,
      jobDiscovery: draft.jobDiscovery,
      diagnostics: draft.diagnostics,
      resources,
      cached: false,
      retry: Boolean(draft.retry),
      fallback: Boolean(draft.fallback),
      fallbackReason: draft.fallbackReason || null
    });
  } catch (error) {
    console.info('[AI RESPONSE]', {
      success: false,
      duration: Date.now() - startedAt,
      cached: false,
      retry: error.code === 'AI_PROVIDER_BUSY',
      fallback: false,
      code: error.code || 'AI_GENERATION_FAILED'
    });
    const resources = getEmailResources();
    if (error.code === 'AI_MINUTE_LIMIT') return res.status(429).json({ success: false, code: error.code, message: error.message, resources });
    if (error.code === 'AI_DAILY_LIMIT') return res.status(429).json({ success: false, code: error.code, message: error.message, resources });
    if (error.name === 'AbortError' || error.code === 20 || error.code === 'AI_TIMEOUT') {
      return res.status(504).json({ message: 'AI email generation took too long. Please try again.', code: 'AI_TIMEOUT', resources });
    }
    if (error.code === 'AI_NOT_CONFIGURED') return res.status(503).json({ message: error.message, resources });
    if (error.code === 'AI_RATE_LIMIT') return res.status(429).json({ success: false, code: 'AI_RATE_LIMIT', message: 'Gemini API quota exceeded. Please try later or use another API key.', resources });
    if (error.code === 'AI_PROVIDER_BUSY') return res.status(503).json({ success: false, code: 'AI_PROVIDER_BUSY', message: 'Gemini is currently busy. Please try again shortly.', resources });
    if (error.code === 'INVALID_AI_OUTPUT' || error instanceof SyntaxError) return res.status(422).json({ message: 'AI returned an invalid draft. Please try again.', resources });
    return res.status(502).json({ message: 'Unable to generate an AI email right now. Please try again.', resources });
  }
});

// @route   POST /api/email-leads/render-ai-email
// @desc    Render edited dynamic content with the canonical backend email template
// @access  Private (Admin, Manager, BD Executive)
router.post('/render-ai-email', auth, async (req, res) => {
  try {
    if (!['Admin', 'Manager', 'BD Executive'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const { leadId, pocId, content } = req.body || {};
    if (!mongoose.isValidObjectId(leadId) || !mongoose.isValidObjectId(pocId)) {
      return res.status(400).json({ message: 'Valid leadId and pocId are required.' });
    }
    const { lead } = await findLeadAcrossCollections(leadId);
    if (!lead) return res.status(404).json({ message: 'Lead not found.' });
    const poc = lead.points_of_contact.id(pocId);
    if (!poc) return res.status(404).json({ message: 'Point of contact not found.' });

    if (req.user.role !== 'Admin') {
      let userIds = [req.user.id];
      if (req.user.role === 'Manager') {
        const reporters = await User.find({ reporter: req.user.id }).select('_id');
        userIds = userIds.concat(reporters.map(reporter => reporter._id.toString()));
      }
      const allowed = userIds.includes(lead.assignedBy?.toString()) ||
        userIds.includes(lead.createdBy?.toString()) ||
        lead.assignedTo?.some(user => userIds.includes(user.toString()));
      if (!allowed) return res.status(403).json({ message: 'Access denied. You do not own this lead.' });
    }

    const resources = getEmailResources();
    const rendered = renderEmailDraft({
      content,
      context: {
        company: {
          name: lead.company_name,
          website: lead.website_url,
          linkedInUrl: lead.linkedin_link,
          industry: lead.industry_name,
          companySize: lead.company_size
        },
        pointOfContact: {
          name: poc.name,
          email: poc.email,
          designation: poc.designation,
          linkedInUrl: poc.linkedin_url
        }
      },
      resources
    });
    return res.json(rendered);
  } catch (error) {
    if (error.code === 'INVALID_EMAIL_CONTENT') {
      return res.status(400).json({ message: error.message });
    }
    console.error('Email template rendering failed', { userId: req.user?.id, message: error.message, stack: error.stack });
    return res.status(500).json({ message: 'Unable to prepare the email. Please try again.' });
  }
});

// ---------------------------------------------------------------------------
// Nodemailer transporter (SMTP) — built once and reused across requests.
// Configure via env vars:
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE ('true'/'false'), SMTP_USER, SMTP_PASS,
//   SMTP_FROM (optional display "from" address, falls back to SMTP_USER)
// ---------------------------------------------------------------------------
let transporter = null;
const getTransporter = () => {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS env vars.');
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT ? parseInt(SMTP_PORT, 10) : 587,
    secure: SMTP_SECURE === 'true', // true for port 465, false for 587/25 (STARTTLS)
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });

  return transporter;
};

// @route   POST /api/email-leads/send-email
// @desc    Send an email (Email Sending tab compose modal)
// @access  Private (Admin, Manager, BD Executive)
// @route   GET /api/email-leads/daily-limit
// @desc    Return the authenticated user's daily email usage
// @access  Private (Admin, Manager, BD Executive)
router.get('/daily-limit', auth, async (req, res) => {
  try {
    if (!['Admin', 'Manager', 'BD Executive'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    const status = await getDailyLimitStatus(req.user.id);
    logDailyLimitDecision({ userId: req.user.id, status, allowed: status.canSend });
    return res.json(status);
  } catch (error) {
    console.error('Daily email limit lookup failed', {
      userId: req.user?.id,
      message: error.message,
      stack: error.stack
    });
    return res.status(500).json({ message: 'Unable to load daily email usage.' });
  }
});

// @route   POST /api/email-leads/send-mails
// @desc    Send an email as the logged-in user, using their own stored app password
// @access  Private (Admin, Manager, BD Executive)
router.post('/send-mails', auth, async (req, res) => {
    let reservationId = null;
    try {
       console.log(req.user,"jjjjjj")
    if (!['Admin', 'Manager', 'BD Executive'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const { to, subject, htmlBody, leadId, pocId } = req.body;

    if (!to || !to.trim()) {
      return res.status(400).json({ message: 'Recipient email (to) is required.' });
    }
    if (!subject || !subject.trim()) {
      return res.status(400).json({ message: 'Subject is required.' });
    }
    if (!htmlBody || !htmlBody.trim()) {
      return res.status(400).json({ message: 'Email body is required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to.trim())) {
      return res.status(400).json({ message: 'Recipient email is not a valid email address.' });
    }
     
    const sendingUser = await User.findById(req.user.id).select('appPassword email name');
    console.log(sendingUser,"sendingUser")
    if (!sendingUser) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (!sendingUser.appPassword || !sendingUser.appPassword.trim()) {
      return res.status(400).json({
        message: 'No app password found for your account. Please add your email app password before sending emails.'
      });
    }
    if (!sendingUser.email) {
      return res.status(400).json({
        message: 'No sender email found for your account.'
      });
    }

    // If a leadId is provided, confirm it exists and the requester owns/can access it
    let lead = null;
    if (leadId) {
      ({ lead } = await findLeadAcrossCollections(leadId));
      if (!lead) {
        return res.status(404).json({ message: 'Lead not found.' });
      }

      if (req.user.role !== 'Admin') {
        let userIds = [req.user.id];
        if (req.user.role === 'Manager') {
          const reporters = await User.find({ reporter: req.user.id }).select('_id');
          userIds = userIds.concat(reporters.map(r => r._id.toString()));
        }
        const isOwner = userIds.includes(lead.assignedBy?.toString()) ||
          userIds.includes(lead.createdBy?.toString()) ||
          (lead.assignedTo && lead.assignedTo.some(u => userIds.includes(u.toString())));

        if (!isOwner) {
          return res.status(403).json({ message: 'Access denied. You do not own this lead.' });
        }
      }
    }

    const limitResult = await reserveDailyEmailSlot({
      userId: req.user.id,
      leadId: lead?._id,
      pocId,
      recipientEmail: to.trim(),
      subject: subject.trim()
    });
    if (!limitResult.allowed) {
      logDailyLimitDecision({
        userId: req.user.id,
        status: limitResult.status,
        allowed: false
      });
      return res.status(429).json({
        success: false,
        message: 'Daily email limit reached.',
        dailyLimit: DAILY_EMAIL_LIMIT,
        emailsSentToday: limitResult.status.emailsSentToday,
        emailsRemaining: 0
      });
    }
    reservationId = limitResult.reservation._id;

    const mailTransporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: sendingUser.email,
        pass: sendingUser.appPassword
      }
    });

    try {
      await mailTransporter.sendMail({
        from: sendingUser.name ? `"${sendingUser.name}" <${sendingUser.email}>` : sendingUser.email,
        to: to.trim(),
        subject: subject.trim(),
        html: htmlBody
      });
    } catch (mailErr) {
      await releaseDailyEmailReservation(reservationId).catch(releaseError => {
        console.error('Daily email reservation release failed', {
          userId: req.user.id,
          reservationId: String(reservationId),
          message: releaseError.message
        });
      });
      reservationId = null;
      console.error('Send email error:', mailErr);
      return res.status(502).json({ message: 'Failed to send email. Check your app password is correct and valid.', error: mailErr.message });
    }

    try {
      await completeDailyEmailReservation(reservationId);
    } catch (firstLogError) {
      console.error('Email send log completion failed; retrying', {
        userId: req.user.id,
        reservationId: String(reservationId),
        message: firstLogError.message
      });
      await completeDailyEmailReservation(reservationId).catch(finalLogError => {
        console.error('CRITICAL: successfully sent email could not be marked successful', {
          userId: req.user.id,
          reservationId: String(reservationId),
          message: finalLogError.message,
          stack: finalLogError.stack
        });
      });
    }

    let updatedLimitStatus = {
      dailyLimit: DAILY_EMAIL_LIMIT,
      emailsSentToday: Math.min(DAILY_EMAIL_LIMIT, limitResult.status.emailsSentToday + 1),
      emailsRemaining: limitResult.status.emailsRemaining,
      canSend: limitResult.status.emailsRemaining > 0
    };
    try {
      updatedLimitStatus = await getDailyLimitStatus(req.user.id);
    } catch (statusError) {
      console.error('Post-send daily limit refresh failed', {
        userId: req.user.id,
        message: statusError.message
      });
    }
    logDailyLimitDecision({
      userId: req.user.id,
      status: updatedLimitStatus,
      allowed: true
    });

    try {
      await logActivity({
        leadId: lead ? lead._id : undefined,
        type: 'Email Sent',
        description: `Email "${subject.trim()}" sent to ${to.trim()}${lead ? ` for lead "${lead.company_name || lead.website_url}"` : ''}.`,
        userId: req.user.id,
        userName: req.user.name || 'Admin'
      });
    } catch (logErr) {
      console.error('logActivity error (non-blocking):', logErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Email sent successfully.',
      to: to.trim(),
      subject: subject.trim(),
      leadId: lead ? lead._id : null,
      pocId: pocId || null,
      dailyLimit: DAILY_EMAIL_LIMIT,
      emailsSentToday: updatedLimitStatus.emailsSentToday,
      emailsRemaining: updatedLimitStatus.emailsRemaining
    });
 } catch (mailErr) {
  await releaseDailyEmailReservation(reservationId).catch(releaseError => {
    console.error('Daily email reservation cleanup failed', {
      userId: req.user?.id,
      reservationId: reservationId ? String(reservationId) : null,
      message: releaseError.message
    });
  });
  console.error('Send email error:', mailErr);

  if (mailErr.responseCode === 550 && /sending limit/i.test(mailErr.response || '')) {
    return res.status(429).json({
      message: 'Daily Gmail sending limit reached for this account. Try again after 24 hours, or use a different sender account.'
    });
  }

  return res.status(502).json({ message: 'Failed to send email. Check your app password is correct and valid.', error: mailErr.message });
}
});

// @route   POST /api/email-leads
// @desc    Add a new company (Email Sending tab)
// @access  Private (Admin, Manager, BD Executive)
router.post('/', auth, async (req, res) => {
  try {
    if (!['Admin', 'Manager', 'BD Executive'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const {
      website_url,
      company_name,
      company_email,
      company_size,
      industry_name,
      linkedin_link,
      stage,
      assignedBy,
      assignedTo,
      points_of_contact,
      status
    } = req.body;

    // website_url mandatory
    if (!website_url) {
      return res.status(400).json({ message: 'Website URL is required.' });
    }

    // Uniqueness check on website_url (case‑insensitive, trimmed)
    const normalizedUrl = website_url.trim().toLowerCase();
    const existing = await EmailLead.findOne({ website_url: normalizedUrl });
    if (existing) {
      return res.status(400).json({ message: 'A lead with this website URL already exists.' });
    }

    // Process POCs – set approval status based on overall lead status
    const processedPocs = (points_of_contact || []).map(poc => ({
      ...poc,
      approvalStatus: (status === 'incomplete' ? 'pending' : 'approved'),
      createdBy: req.user.id
    }));

    const finalAssignedBy = (req.user.role === 'Admin' && assignedBy) ? assignedBy : req.user.id;

    const leadData = {
      website_url: normalizedUrl,
      company_name,
      company_email,
      company_size,
      industry_name,
      linkedin_link,
      stage: stage || 'New',
      assignedBy: finalAssignedBy,
      createdBy: req.user.id,
      assignedTo: assignedTo || [],
      points_of_contact: processedPocs,
      status: status || 'incomplete',
      source: 'email_sending'
    };

    const lead = await new EmailLead(leadData).save();

    await logActivity({
      leadId: lead._id,
      type: 'EmailLead Created',
      description: `Lead "${company_name || normalizedUrl}" created via Email Sending tab.`,
      userId: req.user.id,
      userName: req.user.name || 'Admin'
    });

    return res.status(201).json(lead);
  } catch (err) {
    console.error('Create EmailLead error:', err);
    return res.status(500).json({ message: 'Server Error', error: err.message });
  }
});

// Helper to validate POC uniqueness within a lead for bulk upload
const validatePOCs = (pocs) => {
    const phones = new Set();
    const emails = new Set();
    for (const poc of pocs) {
        if (poc.phone && poc.phone.trim() && poc.phone.trim() !== 'N/A') {
            const p = poc.phone.trim();
            if (phones.has(p)) return `Duplicate phone number found in upload data: ${p}`;
            phones.add(p);
        }
        if (poc.email && poc.email.trim()) {
            const e = poc.email.trim();
            if (emails.has(e)) return `Duplicate email found in upload data: ${e}`;
            emails.add(e);
        }
    }
    return null;
};

// @route   POST /api/email-leads/bulk-upload
// @desc    Bulk upload email leads (Email Sending tab)
// @access  Private (Admin, Manager, BD Executive)
router.post('/bulk-upload', auth, async (req, res) => {
    try {
        if (!['Admin', 'Manager', 'BD Executive'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Access denied.' });
        }

        const { leads } = req.body;
        if (!leads || !Array.isArray(leads)) {
            return res.status(400).json({ message: 'Please provide an array of leads.' });
        }

        const User = require('../models/User');
        const validEmails = new Set(
            leads.map(l => l.assigned_by_email?.toLowerCase().trim()).filter(Boolean)
        );

        let emailToUserIdMap = {};
        if (validEmails.size > 0) {
            const users = await User.find({ email: { $in: Array.from(validEmails) } }, '_id email');
            users.forEach(user => {
                emailToUserIdMap[user.email.toLowerCase()] = user._id;
            });
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
                    assigned_by_email,
                    assignedBy,
                    points_of_contact
                } = row;

                // Determine final assigned_by user ID
                let finalAssignedBy = req.user.id;
                if (assigned_by_email) {
                    const normalizedEmail = assigned_by_email.toLowerCase().trim();
                    if (emailToUserIdMap[normalizedEmail]) {
                        finalAssignedBy = emailToUserIdMap[normalizedEmail];
                    }
                } else if (assignedBy) {
                    finalAssignedBy = assignedBy;
                }

                // Validate POC uniqueness within the row
                const pocError = validatePOCs(points_of_contact || []);
                if (pocError) throw new Error(`Row ${i + 1}: ${pocError}`);

                // Prepare lead data
                let normalizedUrl = undefined;
                if (website_url) {
                    normalizedUrl = website_url.trim().toLowerCase();
                }

                const leadData = {
                    company_name,
                    company_email,
                    company_size,
                    industry_name,
                    linkedin_link,
                    stage: stage || 'New',
                    assignedBy: finalAssignedBy,
                    createdBy: req.user.id,
                    points_of_contact: (points_of_contact || []).map(p => ({
                        ...p,
                        approvalStatus: 'approved',
                        createdBy: req.user.id
                    })),
                    source: 'email_sending'
                };

                if (normalizedUrl) {
                    leadData.website_url = normalizedUrl;
                }

                // Find existing email lead
                let existingLead = null;
                if (normalizedUrl) {
                    existingLead = await EmailLead.findOne({ website_url: normalizedUrl });
                } else if (company_name) {
                    existingLead = await EmailLead.findOne({ company_name: new RegExp(`^${company_name.trim()}$`, 'i') });
                }

                if (existingLead) {
                    // Update existing lead fields
                    if (company_name) existingLead.company_name = company_name;
                    if (company_email) existingLead.company_email = company_email;
                    if (company_size) existingLead.company_size = company_size;
                    if (industry_name) existingLead.industry_name = industry_name;
                    if (linkedin_link) existingLead.linkedin_link = linkedin_link;
                    if (stage) existingLead.stage = stage;
                    if (assigned_by_email || assignedBy) existingLead.assignedBy = finalAssignedBy;

                    // Merge POCs
                    if (points_of_contact && points_of_contact.length > 0) {
                        const existingPocs = existingLead.points_of_contact || [];
                        points_of_contact.forEach(newPoc => {
                            const isDuplicate = existingPocs.some(ep =>
                                (newPoc.phone && ep.phone === newPoc.phone && newPoc.phone !== 'N/A') ||
                                (newPoc.email && ep.email === newPoc.email)
                            );
                            if (!isDuplicate) {
                                const approval = (!newPoc.name || !newPoc.phone || !newPoc.email || newPoc.phone === 'N/A') ? 'pending' : 'approved';
                                existingPocs.push({
                                    ...newPoc,
                                    approvalStatus: approval,
                                    createdBy: req.user.id
                                });
                            } else {
                                const index = existingPocs.findIndex(ep =>
                                    (newPoc.phone && ep.phone === newPoc.phone && newPoc.phone !== 'N/A') ||
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
                    leadData.status = 'approved';
                    const newLead = new EmailLead(leadData);
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

// Helper to build email lead query based on filters
const buildEmailLeadQuery = (params) => {
    const { search, leadStage, assignedBy, pocStage, startDate, endDate, status } = params;
    let query = {};

    if (search) {
        query.$and = query.$and || [];
        query.$and.push({
            $or: [
                { company_name: { $regex: search, $options: 'i' } },
                { website_url: { $regex: search, $options: 'i' } },
                { company_email: { $regex: search, $options: 'i' } }
            ]
        });
    }

    if (leadStage) query.stage = leadStage;
    if (assignedBy) query.assignedBy = assignedBy;
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
        query.status = { $nin: ['incomplete', 'rejected'] };
    } else if (status === 'incomplete') {
        query.status = 'incomplete';
    } else if (status) {
        query.status = status;
    }

    return query;
};

// @route   GET /api/email-leads
// @desc    Get all email leads with pagination
// @access  Private (Admin, Manager, BD Executive)
router.get('/', auth, async (req, res) => {
    try {
        if (!['Admin', 'Manager', 'BD Executive'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Access denied.' });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const query = buildEmailLeadQuery(req.query);

        // Default to approved leads (anything not marked incomplete or rejected) if no status filter is provided
        if (!req.query.status) {
            query.status = { $nin: ['incomplete', 'rejected'] };
        } else {
            query.status = req.query.status === 'approved' ? { $nin: ['incomplete', 'rejected'] } : req.query.status;
        }

        // Enforce user isolation for non-admins
        if (req.user.role !== 'Admin') {
            const User = require('../models/User');
            let userIds = [req.user.id];
            if (req.user.role === 'Manager') {
                const reporters = await User.find({ reporter: req.user.id }).select('_id');
                userIds = userIds.concat(reporters.map(r => r._id.toString()));
            }
            const userFilter = {
                $or: [
                    { assignedBy: { $in: userIds } },
                    { createdBy: { $in: userIds } },
                    { assignedTo: { $in: userIds } }
                ]
            };
            query.$and = query.$and || [];
            query.$and.push(userFilter);
        }

        const totalLeads = await EmailLead.countDocuments(query);
        const leads = await EmailLead.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('assignedBy', 'name email')
            .populate('createdBy', 'name email')
            .populate('assignedTo', 'name email');

        const results = leads.map(lead => {
            const leadObj = lead.toObject();
            if (!req.query.status || req.query.status === 'approved') {
                leadObj.points_of_contact = (leadObj.points_of_contact || []).filter(poc => !['pending', 'rejected'].includes(poc.approvalStatus));
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
        console.error('Fetch email leads error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   GET /api/email-leads/:id
// @desc    Get email lead by ID
// @access  Private (Admin, Manager, BD Executive)
router.get('/:id', auth, async (req, res) => {
    try {
        if (!['Admin', 'Manager', 'BD Executive'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Access denied.' });
        }

        const lead = await EmailLead.findById(req.params.id)
            .populate('assignedBy', 'name email')
            .populate('createdBy', 'name email')
            .populate('assignedTo', 'name email');

        if (!lead) {
            return res.status(404).json({ message: 'Lead not found.' });
        }

        // Add ownership check for non-admins
        let isOwner = true;
        if (req.user.role !== 'Admin') {
            const User = require('../models/User');
            let userIds = [req.user.id];
            if (req.user.role === 'Manager') {
                const reporters = await User.find({ reporter: req.user.id }).select('_id');
                userIds = userIds.concat(reporters.map(r => r._id.toString()));
            }
            isOwner = userIds.includes(lead.assignedBy?._id?.toString()) ||
                userIds.includes(lead.createdBy?._id?.toString()) ||
                (lead.assignedTo && lead.assignedTo.some(u => userIds.includes(u._id?.toString())));
        }

        if (!isOwner) {
            return res.status(403).json({ message: 'Access denied. You do not own this lead.' });
        }

        const leadObj = lead.toObject();
        // If not checking status explicitly, filter pending/rejected POCs
        if (req.query.includePending !== 'true') {
            leadObj.points_of_contact = (leadObj.points_of_contact || []).filter(poc => !['pending', 'rejected'].includes(poc.approvalStatus));
        }

        res.json(leadObj);
    } catch (err) {
        console.error('Fetch email lead details error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   PUT /api/email-leads/:id
// @desc    Update email lead details
// @access  Private (Admin, Manager, BD Executive)
router.put('/:id', auth, async (req, res) => {
    try {
        if (!['Admin', 'Manager', 'BD Executive'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Access denied.' });
        }

        let {
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

        if (company_name) company_name = company_name.trim();

        const oldLead = await EmailLead.findById(req.params.id)
            .populate('assignedBy', 'name')
            .populate('createdBy', 'name')
            .populate('assignedTo', 'name');

        if (!oldLead) return res.status(404).json({ message: 'Lead not found' });

        // Enforce user isolation for non-admins
        let isOwner = false;
        if (req.user.role === 'Admin') {
            isOwner = true;
        } else {
            const User = require('../models/User');
            let userIds = [req.user.id];
            if (req.user.role === 'Manager') {
                const reporters = await User.find({ reporter: req.user.id }).select('_id');
                userIds = userIds.concat(reporters.map(r => r._id.toString()));
            }
            isOwner = userIds.includes(oldLead.assignedBy?._id?.toString()) ||
                userIds.includes(oldLead.createdBy?._id?.toString()) ||
                (oldLead.assignedTo && oldLead.assignedTo.some(u => userIds.includes(u._id?.toString())));
        }

        if (!isOwner) {
            return res.status(403).json({ message: 'Access denied. You do not own this lead.' });
        }

        // Update POCs if provided
        if (points_of_contact) {
            const pocError = validatePOCs(points_of_contact);
            if (pocError) return res.status(400).json({ message: pocError });

            const oldPocs = oldLead.points_of_contact || [];

            oldLead.points_of_contact = points_of_contact.map(np => {
                const existing = oldPocs.find(op => op._id && op._id.toString() === np._id?.toString());
                const approvalStatus = existing ? existing.approvalStatus : (oldLead.status === 'incomplete' ? 'pending' : 'approved');
                const createdAt = existing ? existing.createdAt : new Date();
                const createdBy = existing ? existing.createdBy : req.user.id;

                return {
                    ...np,
                    approvalStatus,
                    createdAt,
                    createdBy
                };
            });
        }

        // Website uniqueness check (if changed)
        let normalizedUrl = undefined;
        if (website_url) {
            normalizedUrl = website_url.trim().toLowerCase();
        }

        if (normalizedUrl && normalizedUrl !== oldLead.website_url) {
            const existingLead = await EmailLead.findOne({ website_url: normalizedUrl });
            if (existingLead) {
                return res.status(400).json({ message: 'A lead with this website already exists.' });
            }
        }

        // Prepare update data
        if (company_name !== undefined) oldLead.company_name = company_name;
        if (company_email !== undefined) oldLead.company_email = company_email;
        if (normalizedUrl !== undefined) oldLead.website_url = normalizedUrl;
        if (company_size !== undefined) oldLead.company_size = company_size;
        if (industry_name !== undefined) oldLead.industry_name = industry_name;
        if (linkedin_link !== undefined) oldLead.linkedin_link = linkedin_link;
        if (stage !== undefined) oldLead.stage = stage;
        if (status !== undefined) oldLead.status = status;

        if (req.user.role === 'Admin' && assignedBy !== undefined) {
            oldLead.assignedBy = assignedBy;
        }
        if (Array.isArray(assignedTo)) {
            oldLead.assignedTo = assignedTo;
        }

        await oldLead.save();

        const populatedLead = await EmailLead.findById(oldLead._id)
            .populate('assignedBy', 'name email')
            .populate('createdBy', 'name email')
            .populate('assignedTo', 'name email');

        await logActivity({
            leadId: oldLead._id,
            type: 'EmailLead Updated',
            description: `EmailLead "${company_name || oldLead.company_name}" was updated.`,
            userId: req.user.id,
            userName: req.user.name || 'Admin'
        });

        return res.status(200).json(populatedLead);
    } catch (err) {
        console.error('Update email lead error:', err);
        return res.status(500).json({ message: 'Server Error', error: err.message });
    }
});

// @route   DELETE /api/email-leads/:id
// @desc    Delete an email lead
// @access  Private (Admin)
router.delete('/:id', auth, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'Access denied. Admins only.' });
        }

        const lead = await EmailLead.findById(req.params.id);
        if (!lead) return res.status(404).json({ message: 'Lead not found' });

        const Task = require('../models/Task');
        const CallActivity = require('../models/CallActivity');
        const LeadActivity = require('../models/LeadActivity');

        // Cascading Deletes
        await Promise.all([
            Task.deleteMany({ lead_id: req.params.id }),
            CallActivity.deleteMany({ leadId: req.params.id }),
            LeadActivity.deleteMany({ leadId: req.params.id }),
            EmailLead.findByIdAndDelete(req.params.id)
        ]);

        res.json({ message: 'Email lead and all associated data removed successfully' });
    } catch (err) {
        console.error('Delete email lead error:', err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
});

module.exports = router;
