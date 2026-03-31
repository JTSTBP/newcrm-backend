const mongoose = require("mongoose");
const addAuditTrail = require("./audits/auditLeadTrail");

const remarkSchema = new mongoose.Schema(
    {
        content: { type: String }, // remark text
        type: { type: String, enum: ["text", "voice", "file"], default: "text" },
        fileUrl: { type: String }, // if type=file
        voiceUrl: { type: String }, // if type=voice
        created_at: { type: Date, default: Date.now },
        profile: {
            id: { type: mongoose.Schema.Types.ObjectId, ref: "users" }, // user who added remark
            name: { type: String, required: true }, // snapshot of user name
        },
        poc_id: { type: mongoose.Schema.Types.ObjectId }, // optional link to a specific POC
    },
    { _id: true }
);

const PointOfContactSchema = new mongoose.Schema({
    name: { type: String, },
    designation: { type: String },
    phone: { type: String, },
    alternate_phone: { type: String, default: "" },
    email: { type: String },
    linkedin_url: { type: String },
    stage: {
        type: String,
        enum: ["New", "Contacted", "Busy", "No Answer", "Wrong Number"],
        default: "New",
    },
    latest_remark_id: { type: mongoose.Schema.Types.ObjectId },
    approvalStatus: {
        type: String,
        enum: ["pending", "approved"],

    },
});

const LeadSchema = new mongoose.Schema(
    {
        company_name: { type: String, required: false },
        company_email: { type: String },
        company_info: { type: String },
        company_size: { type: String },
        website_url: { type: String, unique: true, required: true },
        status: {
            type: String,
            enum: ["incomplete", "approved"],
            default: "approved",
        },
        hiring_needs: [{ type: String }],
        points_of_contact: [PointOfContactSchema],
        lead_source: { type: String },

        linkedin_link: { type: String },
        industry_name: { type: String },
        no_of_designations: { type: Number, default: null },
        no_of_positions: { type: Number, default: null },
        stageProposalUpd: { type: Date, default: null },
        stage: {
            type: String,
            enum: [
                "New",
                "Contacted",
                "Proposal Sent",
                "Negotiation",
                "Won",
                "Lost",
                "Onboarded",
                "No vendor",
                "Future Reference"
            ],
            default: "New",
        },
        assignedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users",
            required: true,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users",

        },
        assignedTo: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "users",
        }],
        remarks: [remarkSchema],
    },
    { timestamps: true }
);

// Add indexes for better query performance
LeadSchema.index({ assignedBy: 1 });
LeadSchema.index({ assignedTo: 1 });
LeadSchema.index({ stage: 1 });
LeadSchema.index({ createdAt: -1 });
LeadSchema.index({ company_name: 1 });
LeadSchema.index({ assignedBy: 1, stage: 1 });

// Attach audit logging
addAuditTrail(LeadSchema, "Leads");

module.exports = mongoose.model("Lead", LeadSchema);
