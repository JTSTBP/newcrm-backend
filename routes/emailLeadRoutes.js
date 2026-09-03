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

// Define EmailLead schema (separate collection)
const EmailLeadSchema = new mongoose.Schema({
  website_url: { type: String, unique: true, sparse: true, trim: true },
  company_name: { type: String },
  company_email: { type: String },
  company_size: { type: String },
  industry_name: { type: String },
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
    approvalStatus: { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users' }
  }],
  status: { type: String, enum: ['incomplete','approved','rejected'], default: 'incomplete' },
  source: { type: String, default: 'email_sending' }
}, { timestamps: true });

const EmailLead = mongoose.model('EmailLead', EmailLeadSchema);

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
// @route   POST /api/email-leads/send-mails
// @desc    Send an email as the logged-in user, using their own stored app password
// @access  Private (Admin, Manager, BD Executive)
router.post('/send-mails', auth, async (req, res) => {
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
      lead = await EmailLead.findById(leadId);
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
      console.error('Send email error:', mailErr);
      return res.status(502).json({ message: 'Failed to send email. Check your app password is correct and valid.', error: mailErr.message });
    }

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
      message: 'Email sent successfully.',
      to: to.trim(),
      subject: subject.trim(),
      leadId: lead ? lead._id : null,
      pocId: pocId || null
    });
 } catch (mailErr) {
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

// ---------------------------------------------------------------------------
// In-memory cache for AI-generated email drafts
// key   = `${leadId ?? 'anon'}_${pocId ?? poc.email ?? 'unknown'}`
// value = { result: { subject, content }, expiresAt: <timestamp ms> }
// TTL   = 10 minutes; entries are swept every 5 minutes
// ---------------------------------------------------------------------------
const AI_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const aiCache = new Map();

// Periodic stale-entry sweep — runs every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of aiCache) {
    if (entry.expiresAt <= now) {
      aiCache.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Helper to build a stable cache key
const buildCacheKey = (leadId, pocId, pocEmail) => {
  const l = leadId  ? String(leadId)  : 'anon';
  const p = pocId   ? String(pocId)   : (pocEmail ? String(pocEmail) : 'unknown');
  return `${l}_${p}`;
};

// ---------------------------------------------------------------------------
// @route   POST /api/email-leads/generate-email
// @desc    Generate a personalised AI email draft for a lead + POC
// @access  Private (Admin, Manager, BD Executive)
//
// Request body:
// {
//   leadId?:  string,               // optional, used for cache key + ownership check
//   pocId?:   string,               // optional, used for cache key
//   company:  { company_name, industry_name, company_size, website_url },
//   poc:      { name, designation, email }
// }
//
// Response (200):
// {
//   subject: string,
//   content: EmailContent,          // matches frontend EmailContent interface
//   cached:  boolean
// }
// ---------------------------------------------------------------------------
router.post('/generate-email', auth, async (req, res) => {
  try {
    // --- Role guard ---
    if (!['Admin', 'Manager', 'BD Executive'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    // --- Env guard — fail fast before any work ---
    if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_API_KEY.trim() ||
        process.env.OPENAI_API_KEY.startsWith('sk-your-')) {
      return res.status(503).json({
        message: 'AI generation is not configured. Please set OPENAI_API_KEY in the server environment.'
      });
    }

    const { leadId, pocId, company, poc } = req.body;

    // --- Basic validation ---
    if (!company || !company.company_name) {
      return res.status(400).json({ message: 'company.company_name is required.' });
    }

    // --- Optional: ownership check when leadId is provided ---
    if (leadId) {
      const lead = await EmailLead.findById(leadId).catch(() => null);
      if (!lead) {
        // Non-blocking — we still generate without the lead record
        console.warn(`[generate-email] leadId ${leadId} not found — proceeding without ownership check.`);
      } else if (req.user.role !== 'Admin') {
        let userIds = [req.user.id];
        if (req.user.role === 'Manager') {
          const reporters = await User.find({ reporter: req.user.id }).select('_id');
          userIds = userIds.concat(reporters.map(r => r._id.toString()));
        }
        const isOwner =
          userIds.includes(lead.assignedBy?.toString()) ||
          userIds.includes(lead.createdBy?.toString()) ||
          (lead.assignedTo && lead.assignedTo.some(u => userIds.includes(u.toString())));

        if (!isOwner) {
          return res.status(403).json({ message: 'Access denied. You do not own this lead.' });
        }
      }
    }

    // --- Cache lookup ---
    const cacheKey = buildCacheKey(leadId, pocId, poc?.email);
    const cached = aiCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      console.log(`[generate-email] Cache HIT — key: ${cacheKey}`);
      return res.status(200).json({ ...cached.result, cached: true });
    }

    // --- Call the AI helper ---
    console.log(`[generate-email] Cache MISS — calling OpenAI for key: ${cacheKey}`);
    const { generateEmail } = require('../utils/aiEmailGenerator');
    let aiResult;
    try {
      aiResult = await generateEmail(company, poc);
    } catch (aiErr) {
      console.error('[generate-email] OpenAI error:', aiErr.message);

      // Map specific error codes to HTTP responses
      if (aiErr.code === 'NO_API_KEY') {
        return res.status(503).json({ message: 'AI service is not configured on the server.' });
      }
      if (/timed out/i.test(aiErr.message)) {
        return res.status(504).json({ message: 'AI generation timed out. Please try again.' });
      }
      if (/rate.?limit|quota|429/i.test(aiErr.message)) {
        return res.status(429).json({ message: 'AI rate limit reached. Please try again in a moment.' });
      }

      return res.status(502).json({
        message: 'AI generation failed. The default template will be used instead.',
        error: aiErr.message
      });
    }

    // --- Store in cache ---
    aiCache.set(cacheKey, {
      result:    aiResult,
      expiresAt: Date.now() + AI_CACHE_TTL_MS
    });

    // --- Return result ---
    return res.status(200).json({ ...aiResult, cached: false });

  } catch (err) {
    console.error('[generate-email] Unexpected error:', err);
    return res.status(500).json({ message: 'Server Error', error: err.message });
  }
});

module.exports = router;