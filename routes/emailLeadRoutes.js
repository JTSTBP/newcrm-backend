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
const dns = require('dns');
const net = require('net');
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

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

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

    const { leadId, pocId, content, pointOfContactOverrides = {} } = req.body || {};
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
    const overrideText = (value, fallback = '') => typeof value === 'string' && value.trim() ? value.trim() : fallback;
    const displayName = value => String(value || '').trim().replace(/\b([a-z])/g, char => char.toUpperCase());
    const renderedPoc = {
      name: displayName(overrideText(pointOfContactOverrides.name, poc.name)),
      email: overrideText(pointOfContactOverrides.email, poc.email),
      designation: overrideText(pointOfContactOverrides.designation, poc.designation),
      phone: overrideText(pointOfContactOverrides.phone, poc.phone),
      linkedInUrl: overrideText(
        pointOfContactOverrides.linkedInUrl || pointOfContactOverrides.linkedin_url || pointOfContactOverrides.linkedin_link,
        poc.linkedin_url || poc.linkedin_link
      )
    };
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
        pointOfContact: renderedPoc
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

const gmailTransporterCache = new Map();
const SMTP_DEFAULT_TIMEOUT_MS = Number(process.env.SMTP_TEST_TIMEOUT_MS || 8_000);
const lookupIpv4Only = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, family: 4 }, callback);
};
const resolveGmailIpv4 = () => new Promise((resolve, reject) => {
  dns.resolve4('smtp.gmail.com', (error, addresses) => {
    if (error) return reject(error);
    const address = addresses?.[0];
    if (!address) return reject(new Error('No IPv4 address found for smtp.gmail.com'));
    resolve(address);
  });
});
const tcpConnectTest = ({ host, port, family = 4, timeoutMs = SMTP_DEFAULT_TIMEOUT_MS }) => new Promise((resolve) => {
  const startedAt = Date.now();
  const socket = net.connect({ host, port, family, timeout: timeoutMs });
  const finish = result => {
    socket.removeAllListeners();
    socket.destroy();
    resolve({ ...result, durationMs: Date.now() - startedAt, host, port, family });
  };
  socket.once('connect', () => finish({ ok: true }));
  socket.once('timeout', () => finish({ ok: false, code: 'TIMEOUT', message: `TCP connection timed out after ${timeoutMs}ms` }));
  socket.once('error', error => finish({ ok: false, code: error.code, message: error.message }));
});
const getGmailIpv4Socket = (options, callback) => {
  dns.resolve4('smtp.gmail.com', (dnsError, addresses) => {
    if (dnsError) return callback(dnsError);
    const address = addresses && addresses[0];
    if (!address) return callback(new Error('No IPv4 address found for smtp.gmail.com'));
    let completed = false;
    const finish = (error, result) => {
      if (completed) return;
      completed = true;
      callback(error, result);
    };
    const socket = net.connect({
      host: address,
      port: options.port || 587,
      family: 4,
      timeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 8_000)
    });
    socket.once('connect', () => finish(null, { connection: socket }));
    socket.once('timeout', () => {
      socket.destroy();
      finish(new Error(`SMTP socket timed out after ${Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 8_000)}ms`));
    });
    socket.once('error', error => finish(error));
  });
};
const buildGmailTransportConfig = async ({ email, appPassword, mode = process.env.SMTP_TRANSPORT_MODE || 'direct-ipv4-587' }) => {
  const common = {
    auth: { user: email, pass: appPassword },
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 8_000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 8_000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 15_000)
  };
  if (mode === 'ssl-465') {
    return {
      ...common,
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      family: 4,
      lookup: lookupIpv4Only,
      tls: { servername: 'smtp.gmail.com' }
    };
  }
  if (mode === 'default-587') {
    return {
      ...common,
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: process.env.SMTP_REQUIRE_TLS !== 'false',
      tls: { servername: 'smtp.gmail.com' }
    };
  }
  if (mode === 'custom-socket-587') {
    return {
      ...common,
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      family: 4,
      lookup: lookupIpv4Only,
      getSocket: getGmailIpv4Socket,
      requireTLS: process.env.SMTP_REQUIRE_TLS !== 'false',
      tls: { servername: 'smtp.gmail.com' }
    };
  }
  if (mode === 'direct-ipv4-587') {
    const ipv4 = await resolveGmailIpv4();
    return {
      ...common,
      host: ipv4,
      port: 587,
      secure: false,
      requireTLS: process.env.SMTP_REQUIRE_TLS !== 'false',
      tls: { servername: 'smtp.gmail.com' }
    };
  }
  return {
    ...common,
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    family: 4,
    lookup: lookupIpv4Only,
    requireTLS: process.env.SMTP_REQUIRE_TLS !== 'false',
    tls: { servername: 'smtp.gmail.com' }
  };
};
const getSmtpAttemptModes = () => {
  const configuredMode = process.env.SMTP_TRANSPORT_MODE || 'direct-ipv4-587';
  const fallbackModes = String(
    process.env.SMTP_FALLBACK_MODES || 'direct-ipv4-587,ipv4-lookup-587,ssl-465,default-587,custom-socket-587'
  )
    .split(',')
    .map(mode => mode.trim())
    .filter(Boolean);

  return [...new Set([configuredMode, ...fallbackModes])];
};

const isConnectionLevelSmtpError = error => {
  const text = [
    error?.message,
    error?.code,
    error?.errno,
    error?.syscall,
    error?.command
  ].filter(Boolean).join(' ').toLowerCase();

  return /timeout|etimedout|enetunreach|econnrefused|ehostunreach|eai_again|enotfound|connection|socket/i.test(text);
};

const sanitizeSmtpError = error => ({
  code: error?.code || null,
  errno: error?.errno || null,
  syscall: error?.syscall || null,
  address: error?.address || null,
  port: error?.port || null,
  command: error?.command || null,
  responseCode: error?.responseCode || null,
  message: error?.message || 'Unknown SMTP error'
});

const getGmailTransporterForUser = async ({ userId, email, appPassword, mode = process.env.SMTP_TRANSPORT_MODE || 'direct-ipv4-587' }) => {
  const passwordHash = crypto.createHash('sha256').update(String(appPassword || '')).digest('hex');
  const config = await buildGmailTransportConfig({ email, appPassword, mode });
  const cacheKey = `smtp-${mode}:${config.host}:${config.port}:${userId}:${email}:${passwordHash}`;
  const cached = gmailTransporterCache.get(cacheKey);
  if (cached) return cached;

  const userTransporter = nodemailer.createTransport({
    ...config,
    pool: true,
    maxConnections: 1,
    maxMessages: 20
  });
  userTransporter.__debugConfig = {
    mode,
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTLS,
    hasLookup: Boolean(config.lookup),
    hasGetSocket: Boolean(config.getSocket)
  };

  gmailTransporterCache.set(cacheKey, userTransporter);
  if (gmailTransporterCache.size > 50) {
    const oldestKey = gmailTransporterCache.keys().next().value;
    const oldest = gmailTransporterCache.get(oldestKey);
    oldest?.close?.();
    gmailTransporterCache.delete(oldestKey);
  }
  return userTransporter;
};

const sendMailWithSmtpFallbacks = async ({ userId, sendingUser, mailOptions, traceId }) => {
  const modes = getSmtpAttemptModes();
  const attempts = [];
  let lastError = null;

  for (const mode of modes) {
    const attemptStartedAt = Date.now();
    let debugConfig = { mode };

    try {
      const mailTransporter = await getGmailTransporterForUser({
        userId,
        email: sendingUser.email,
        appPassword: sendingUser.appPassword,
        mode
      });
      debugConfig = mailTransporter.__debugConfig || debugConfig;

      console.info('[SMTP ATTEMPT] started', {
        traceId,
        userId: String(userId),
        senderEmail: sendingUser.email,
        config: debugConfig
      });

      const info = await mailTransporter.sendMail(mailOptions);
      const attempt = {
        mode,
        ok: true,
        durationMs: Date.now() - attemptStartedAt,
        config: debugConfig,
        messageId: info?.messageId || null
      };
      attempts.push(attempt);
      console.info('[SMTP ATTEMPT] completed', {
        traceId,
        userId: String(userId),
        senderEmail: sendingUser.email,
        attempt
      });

      return { info, attempts, transporter: mailTransporter };
    } catch (error) {
      const attempt = {
        mode,
        ok: false,
        durationMs: Date.now() - attemptStartedAt,
        config: debugConfig,
        error: sanitizeSmtpError(error)
      };
      attempts.push(attempt);
      lastError = error;

      console.warn('[SMTP ATTEMPT] failed', {
        traceId,
        userId: String(userId),
        senderEmail: sendingUser.email,
        attempt
      });

      if (!isConnectionLevelSmtpError(error)) {
        break;
      }
    }
  }

  const finalError = lastError || new Error('SMTP send failed before any transport attempt was completed.');
  finalError.smtpAttempts = attempts;
  throw finalError;
};

const getEmailProvider = () => String(process.env.EMAIL_PROVIDER || process.env.MAIL_PROVIDER || 'smtp').trim().toLowerCase();

const normalizeEmailList = value => {
  if (!value) return undefined;
  if (Array.isArray(value)) return value.filter(Boolean).map(item => String(item).trim()).filter(Boolean);
  return String(value).split(',').map(item => item.trim()).filter(Boolean);
};

const getResendFromAddress = ({ fromName, fallbackEmail }) => {
  const configured = String(process.env.RESEND_FROM_EMAIL || process.env.MAIL_FROM || process.env.SMTP_FROM || '').trim();
  if (configured) return configured;
  const domain = String(process.env.RESEND_FROM_DOMAIN || '').trim();
  if (domain) return fromName ? `"${fromName}" <noreply@${domain}>` : `noreply@${domain}`;
  return fromName ? `"${fromName}" <${fallbackEmail}>` : fallbackEmail;
};

const sendMailWithResend = async ({ sendingUser, mailOptions, traceId }) => {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    const error = new Error('Resend API key is not configured. Set RESEND_API_KEY.');
    error.code = 'EMAIL_PROVIDER_NOT_CONFIGURED';
    error.traceId = traceId;
    throw error;
  }
  if (typeof fetch !== 'function') {
    const error = new Error('Global fetch is unavailable in this Node runtime. Use Node 18+ or add a fetch polyfill.');
    error.code = 'EMAIL_PROVIDER_NOT_CONFIGURED';
    error.traceId = traceId;
    throw error;
  }

  const payload = {
    from: getResendFromAddress({
      fromName: sendingUser.name || 'Jobs Territory',
      fallbackEmail: sendingUser.email
    }),
    to: normalizeEmailList(mailOptions.to),
    cc: normalizeEmailList(mailOptions.cc),
    bcc: normalizeEmailList(mailOptions.bcc),
    reply_to: mailOptions.replyTo || sendingUser.email,
    subject: mailOptions.subject,
    html: mailOptions.html,
    text: mailOptions.text
  };
  Object.keys(payload).forEach(key => {
    if (payload[key] === undefined || payload[key] === '' || (Array.isArray(payload[key]) && payload[key].length === 0)) {
      delete payload[key];
    }
  });

  const startedAt = Date.now();
  console.info('[EMAIL PROVIDER] Sending via Resend HTTPS API', {
    traceId,
    from: payload.from,
    replyTo: payload.reply_to,
    toCount: payload.to?.length || 0,
    ccCount: payload.cc?.length || 0
  });

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || `Resend API failed with status ${response.status}`);
    error.code = response.status === 401 || response.status === 403 ? 'EMAIL_PROVIDER_AUTH_FAILED' : 'EMAIL_PROVIDER_SEND_FAILED';
    error.traceId = traceId;
    error.providerResponse = data;
    throw error;
  }

  console.info('[EMAIL PROVIDER] Resend send completed', {
    traceId,
    durationMs: Date.now() - startedAt,
    messageId: data?.id || null
  });
  return { provider: 'resend', messageId: data?.id || null };
};

const sendMailWithConfiguredProvider = async ({ emailProvider, userId, sendingUser, mailOptions, traceId }) => {
  if (emailProvider === 'resend') {
    return sendMailWithResend({ sendingUser, mailOptions, traceId });
  }
  if (emailProvider === 'smtp') {
    return sendMailWithSmtpFallbacks({
      userId,
      sendingUser,
      mailOptions,
      traceId
    });
  }

  const error = new Error(`Unsupported email provider "${emailProvider}". Use "smtp" or "resend".`);
  error.code = 'EMAIL_PROVIDER_UNSUPPORTED';
  error.traceId = traceId;
  throw error;
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

// @route   GET /api/email-leads/smtp-diagnostics
// @desc    Diagnose Gmail SMTP connectivity from the deployed backend without sending email
// @access  Private (Admin, Manager, BD Executive)
router.get('/smtp-diagnostics', auth, async (req, res) => {
  const startedAt = Date.now();
  try {
    if (!['Admin', 'Manager', 'BD Executive'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    const sendingUser = await User.findById(req.user.id).select('appPassword email name').lean();
    if (!sendingUser) return res.status(404).json({ message: 'User not found.' });
    const envStatus = {
      NODE_ENV: process.env.NODE_ENV || null,
      SMTP_TRANSPORT_MODE: process.env.SMTP_TRANSPORT_MODE || 'direct-ipv4-587',
      SMTP_CONNECTION_TIMEOUT_MS: process.env.SMTP_CONNECTION_TIMEOUT_MS || null,
      SMTP_GREETING_TIMEOUT_MS: process.env.SMTP_GREETING_TIMEOUT_MS || null,
      SMTP_SOCKET_TIMEOUT_MS: process.env.SMTP_SOCKET_TIMEOUT_MS || null,
      SMTP_REQUIRE_TLS: process.env.SMTP_REQUIRE_TLS || null,
      hasSenderEmail: Boolean(sendingUser.email),
      hasAppPassword: Boolean(sendingUser.appPassword)
    };
    console.info('[SMTP DIAG] started', { userId: String(req.user.id), senderEmail: sendingUser.email, envStatus });
    const dnsResult = {};
    try {
      dnsResult.lookupDefault = await new Promise((resolve, reject) => dns.lookup('smtp.gmail.com', { all: true }, (error, addresses) => error ? reject(error) : resolve(addresses)));
    } catch (error) {
      dnsResult.lookupDefaultError = { code: error.code, message: error.message };
    }
    try {
      dnsResult.resolve4 = await new Promise((resolve, reject) => dns.resolve4('smtp.gmail.com', (error, addresses) => error ? reject(error) : resolve(addresses)));
    } catch (error) {
      dnsResult.resolve4Error = { code: error.code, message: error.message };
    }
    try {
      dnsResult.resolve6 = await new Promise((resolve, reject) => dns.resolve6('smtp.gmail.com', (error, addresses) => error ? reject(error) : resolve(addresses)));
    } catch (error) {
      dnsResult.resolve6Error = { code: error.code, message: error.message };
    }

    const ipv4 = Array.isArray(dnsResult.resolve4) ? dnsResult.resolve4[0] : null;
    const tcpTests = [];
    tcpTests.push(await tcpConnectTest({ host: 'smtp.gmail.com', port: 587, family: 0 }));
    tcpTests.push(await tcpConnectTest({ host: 'smtp.gmail.com', port: 587, family: 4 }));
    tcpTests.push(await tcpConnectTest({ host: 'smtp.gmail.com', port: 465, family: 4 }));
    if (ipv4) tcpTests.push(await tcpConnectTest({ host: ipv4, port: 587, family: 4 }));
    if (ipv4) tcpTests.push(await tcpConnectTest({ host: ipv4, port: 465, family: 4 }));

    const controlTcpTests = [];
    controlTcpTests.push(await tcpConnectTest({ host: 'www.google.com', port: 443, family: 4 }));
    controlTcpTests.push(await tcpConnectTest({ host: 'gmail.googleapis.com', port: 443, family: 4 }));
    const smtpTcpReachable = tcpTests.some(test => test.ok);
    const httpsTcpReachable = controlTcpTests.some(test => test.ok);
    const networkConclusion = smtpTcpReachable
      ? 'At least one Gmail SMTP TCP connection succeeded.'
      : httpsTcpReachable
        ? 'HTTPS outbound connectivity works, but Gmail SMTP ports 587/465 are unreachable from this deployment.'
        : 'Both Gmail SMTP and HTTPS control connections failed from this deployment.';

    const modes = String(req.query.modes || 'default-587,ipv4-lookup-587,direct-ipv4-587,ssl-465')
      .split(',')
      .map(mode => mode.trim())
      .filter(Boolean);
    const transportTests = [];
    if (sendingUser.email && sendingUser.appPassword) {
      for (const mode of modes) {
        const modeStartedAt = Date.now();
        try {
          const config = await buildGmailTransportConfig({ email: sendingUser.email, appPassword: sendingUser.appPassword, mode });
          const testTransporter = nodemailer.createTransport(config);
          await testTransporter.verify();
          testTransporter.close?.();
          transportTests.push({
            mode,
            ok: true,
            durationMs: Date.now() - modeStartedAt,
            config: {
              host: config.host,
              port: config.port,
              secure: config.secure,
              requireTLS: config.requireTLS,
              hasLookup: Boolean(config.lookup),
              hasGetSocket: Boolean(config.getSocket)
            }
          });
        } catch (error) {
          transportTests.push({
            mode,
            ok: false,
            durationMs: Date.now() - modeStartedAt,
            error: {
              code: error.code,
              errno: error.errno,
              syscall: error.syscall,
              address: error.address,
              port: error.port,
              command: error.command,
              responseCode: error.responseCode,
              message: error.message,
              stack: error.stack
            }
          });
        }
      }
    }
    console.info('[SMTP DIAG] completed', { userId: String(req.user.id), durationMs: Date.now() - startedAt, tcpTests, controlTcpTests, networkConclusion, transportTests });
    return res.json({
      success: true,
      durationMs: Date.now() - startedAt,
      senderEmail: sendingUser.email,
      envStatus,
      dns: dnsResult,
      tcpTests,
      controlTcpTests,
      networkConclusion,
      transportTests
    });
  } catch (error) {
    console.error('[SMTP DIAG] failed', { userId: req.user?.id, message: error.message, stack: error.stack });
    return res.status(500).json({ success: false, message: error.message, stack: error.stack });
  }
});

// @route   POST /api/email-leads/send-mails
// @desc    Send an email as the logged-in user, using their own stored app password
// @access  Private (Admin, Manager, BD Executive)
router.post('/send-mails', auth, async (req, res) => {
    let reservationId = null;
    const requestStartedAt = Date.now();
    const traceId = crypto.randomUUID();
    const stepTimings = [];
    const markStep = (step, startedAt, extra = {}) => {
      const entry = { step, durationMs: Date.now() - startedAt, ...extra };
      stepTimings.push(entry);
      console.info('[SEND EMAIL STEP]', { traceId, userId: req.user?.id, ...entry });
    };
    try {
    console.info('[SEND EMAIL] API request received', {
      traceId,
      userId: req.user?.id,
      role: req.user?.role,
      hasBody: Boolean(req.body),
      leadId: req.body?.leadId || null,
      pocId: req.body?.pocId || null,
      recipientEmail: req.body?.to || null
    });
    let stepStartedAt = Date.now();
    if (!['Admin', 'Manager', 'BD Executive'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const { to, subject, htmlBody, plainText, leadId, pocId, pointOfContactOverrides = {} } = req.body;

    if (!to || !to.trim()) {
      return res.status(400).json({ message: 'Recipient email (to) is required.' });
    }
    if (!subject || !subject.trim()) {
      return res.status(400).json({ message: 'Subject is required.' });
    }
    if (!htmlBody || !htmlBody.trim()) {
      return res.status(400).json({ message: 'Email body is required.' });
    }
    markStep('validate_request', stepStartedAt);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to.trim())) {
      return res.status(400).json({ message: 'Recipient email is not a valid email address.' });
    }
     
    stepStartedAt = Date.now();
    const sendingUser = await User.findById(req.user.id).select('appPassword email name');
    markStep('find_sending_user', stepStartedAt, {
      senderEmail: sendingUser?.email || null,
      hasAppPassword: Boolean(sendingUser?.appPassword)
    });
    if (!sendingUser) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const emailProvider = getEmailProvider();
    const usingSmtpProvider = emailProvider === 'smtp';

    if (usingSmtpProvider && (!sendingUser.appPassword || !sendingUser.appPassword.trim())) {
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
    let selectedPoc = null;
    if (leadId) {
      stepStartedAt = Date.now();
      ({ lead } = await findLeadAcrossCollections(leadId));
      markStep('find_lead', stepStartedAt, { leadFound: Boolean(lead) });
      if (!lead) {
        return res.status(404).json({ message: 'Lead not found.' });
      }

      if (req.user.role !== 'Admin') {
        let userIds = [req.user.id];
        if (req.user.role === 'Manager') {
          stepStartedAt = Date.now();
          const reporters = await User.find({ reporter: req.user.id }).select('_id');
          markStep('find_manager_reporters', stepStartedAt, { reporterCount: reporters.length });
          userIds = userIds.concat(reporters.map(r => r._id.toString()));
        }
        const isOwner = userIds.includes(lead.assignedBy?.toString()) ||
          userIds.includes(lead.createdBy?.toString()) ||
          (lead.assignedTo && lead.assignedTo.some(u => userIds.includes(u.toString())));

        if (!isOwner) {
          return res.status(403).json({ message: 'Access denied. You do not own this lead.' });
        }
      }
      if (pocId && lead.points_of_contact?.id) selectedPoc = lead.points_of_contact.id(pocId);
    }

    const escapeRegExp = value => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const replaceIfChanged = (body, original, current) => {
      if (!body || !original || !current || String(original).trim() === String(current).trim()) return body;
      return String(body).replace(new RegExp(escapeRegExp(String(original).trim()), 'gi'), String(current).trim());
    };
    const currentPoc = {
      name: String(pointOfContactOverrides.name || selectedPoc?.name || '').trim().replace(/\b([a-z])/g, char => char.toUpperCase()),
      email: pointOfContactOverrides.email || to.trim(),
      designation: pointOfContactOverrides.designation || selectedPoc?.designation || '',
      phone: pointOfContactOverrides.phone || selectedPoc?.phone || '',
      linkedInUrl: pointOfContactOverrides.linkedInUrl || pointOfContactOverrides.linkedin_url || pointOfContactOverrides.linkedin_link || selectedPoc?.linkedin_url || selectedPoc?.linkedin_link || ''
    };
    const originalFirstName = String(selectedPoc?.name || '').trim().split(/\s+/)[0] || '';
    const currentFirstName = String(currentPoc.name || '').trim().split(/\s+/)[0] || '';
    const applyPocOverridesToBody = body => {
      let output = String(body || '')
        .replace(/\{\{\s*POC_NAME\s*\}\}/gi, currentPoc.name)
        .replace(/\{\{\s*POC_FIRST_NAME\s*\}\}/gi, currentFirstName)
        .replace(/\{\{\s*POC_EMAIL\s*\}\}/gi, currentPoc.email)
        .replace(/\{\{\s*POC_DESIGNATION\s*\}\}/gi, currentPoc.designation)
        .replace(/\{\{\s*POC_PHONE\s*\}\}/gi, currentPoc.phone)
        .replace(/\{\{\s*POC_LINKEDIN\s*\}\}/gi, currentPoc.linkedInUrl);
      output = replaceIfChanged(output, selectedPoc?.name, currentPoc.name);
      output = replaceIfChanged(output, originalFirstName, currentFirstName);
      output = replaceIfChanged(output, selectedPoc?.email, currentPoc.email);
      output = replaceIfChanged(output, selectedPoc?.designation, currentPoc.designation);
      output = replaceIfChanged(output, selectedPoc?.phone, currentPoc.phone);
      output = replaceIfChanged(output, selectedPoc?.linkedin_url || selectedPoc?.linkedin_link, currentPoc.linkedInUrl);
      return output;
    };
    const finalHtmlBody = applyPocOverridesToBody(htmlBody);
    const finalPlainText = plainText ? applyPocOverridesToBody(plainText) : undefined;
    markStep('prepare_email_body', requestStartedAt, { cumulative: true });

    stepStartedAt = Date.now();
    const limitResult = await reserveDailyEmailSlot({
      userId: req.user.id,
      leadId: lead?._id,
      pocId,
      recipientEmail: to.trim(),
      subject: subject.trim()
    });
    markStep('reserve_daily_email_slot', stepStartedAt, { allowed: limitResult.allowed });
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

    stepStartedAt = Date.now();
    const smtpAttemptModes = getSmtpAttemptModes();
    markStep('create_or_get_transporter', stepStartedAt, { provider: emailProvider, modes: emailProvider === 'smtp' ? smtpAttemptModes : undefined });

    try {
      const providerStartedAt = Date.now();
      console.info('Sending email', {
        traceId,
        provider: emailProvider,
        userId: String(req.user.id),
        senderEmail: sendingUser.email,
        recipientEmail: to.trim(),
        leadId: lead?._id ? String(lead._id) : null,
        pocId: pocId || null,
        modes: emailProvider === 'smtp' ? smtpAttemptModes : undefined
      });
      const mailOptions = {
        from: sendingUser.name ? `"${sendingUser.name}" <${sendingUser.email}>` : sendingUser.email,
        to: to.trim(),
        subject: subject.trim(),
        html: finalHtmlBody,
        ...(finalPlainText ? { text: finalPlainText } : {})
      };
      const sendResult = await sendMailWithConfiguredProvider({
        emailProvider,
        userId: req.user.id,
        sendingUser,
        mailOptions,
        traceId
      });
      markStep('send_mail', providerStartedAt, {
        provider: emailProvider,
        attempts: sendResult.attempts,
        messageId: sendResult.messageId
      });
      console.info('Email send completed', {
        traceId,
        provider: emailProvider,
        userId: String(req.user.id),
        senderEmail: sendingUser.email,
        recipientEmail: to.trim(),
        durationMs: Date.now() - providerStartedAt,
        attempts: sendResult.attempts,
        messageId: sendResult.messageId
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
      const smtpResponse = String(mailErr.response || mailErr.message || '');
      const smtpAttempts = mailErr.smtpAttempts || [];
      if (mailErr.responseCode === 550 && /Daily user sending limit exceeded/i.test(smtpResponse)) {
        console.warn('Gmail daily sending limit exceeded', {
          traceId,
          userId: String(req.user.id),
          senderEmail: sendingUser.email,
          recipientEmail: to.trim(),
          responseCode: mailErr.responseCode,
          command: mailErr.command,
          smtpAttempts
        });
        return res.status(429).json({
          success: false,
          code: 'GMAIL_DAILY_LIMIT_EXCEEDED',
          message: `Gmail says the sender account ${sendingUser.email} has reached its daily sending limit. This limit is controlled by Google and can include emails sent outside this CRM. Please try again after Gmail resets the quota or use another sender account.`,
          senderEmail: sendingUser.email,
          traceId,
          smtpAttempts
        });
      }
      const isConnectionError = isConnectionLevelSmtpError(mailErr);
      console.error('Send email error:', {
        traceId,
        provider: emailProvider,
        userId: String(req.user.id),
        senderEmail: sendingUser.email,
        recipientEmail: to.trim(),
        responseCode: mailErr.responseCode,
        code: mailErr.code,
        providerResponse: mailErr.providerResponse,
        command: mailErr.command,
        message: mailErr.message,
        smtpAttempts,
        stack: mailErr.stack
      });
      return res.status(isConnectionError ? 504 : 502).json({
        success: false,
        code: mailErr.code || (isConnectionError ? 'SMTP_CONNECTION_FAILED' : 'EMAIL_SEND_FAILED'),
        message: isConnectionError
          ? 'The deployed server could not connect to Gmail SMTP before timeout. Please check the SMTP attempts in the response/logs and try a working SMTP_TRANSPORT_MODE.'
          : mailErr.message || 'Failed to send email. Please verify provider configuration and try again.',
        error: mailErr.message,
        traceId,
        smtpAttempts,
        providerResponse: mailErr.providerResponse
      });
    }

    stepStartedAt = Date.now();
    try {
      await completeDailyEmailReservation(reservationId);
      markStep('complete_daily_email_reservation', stepStartedAt);
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
      stepStartedAt = Date.now();
      updatedLimitStatus = await getDailyLimitStatus(req.user.id);
      markStep('refresh_daily_limit_status', stepStartedAt);
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

    logActivity({
        leadId: lead ? lead._id : undefined,
        type: 'Email Sent',
        description: `Email "${subject.trim()}" sent to ${to.trim()}${lead ? ` for lead "${lead.company_name || lead.website_url}"` : ''}.`,
        userId: req.user.id,
        userName: req.user.name || 'Admin'
      }).catch(logErr => {
      console.error('logActivity error (non-blocking):', logErr.message);
    });

    console.info('[SEND EMAIL] response returned', {
      traceId,
      userId: String(req.user.id),
      totalDurationMs: Date.now() - requestStartedAt,
      stepTimings
    });
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
  console.error('[SEND EMAIL] failed', {
    traceId,
    userId: req.user?.id,
    totalDurationMs: Date.now() - requestStartedAt,
    stepTimings,
    error: {
      code: mailErr.code,
      errno: mailErr.errno,
      syscall: mailErr.syscall,
      address: mailErr.address,
      port: mailErr.port,
      command: mailErr.command,
      responseCode: mailErr.responseCode,
      message: mailErr.message,
      stack: mailErr.stack
    }
  });

  if (mailErr.responseCode === 550 && /sending limit/i.test(mailErr.response || '')) {
    return res.status(429).json({
      success: false,
      code: 'GMAIL_DAILY_LIMIT_EXCEEDED',
      message: 'Daily Gmail sending limit reached for this account. Try again after 24 hours, or use a different sender account.'
    });
  }

  return res.status(502).json({
    success: false,
    code: 'SMTP_SEND_FAILED',
    message: 'Failed to send email through Gmail SMTP. Please verify the sender email/app password and try again.',
    error: mailErr.message,
    traceId
  });
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
