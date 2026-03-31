const mongoose = require("mongoose");
const addTaskAudit = require("./audits/auditTaskTrail");

const taskSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String },
    type: { type: String },
    due_date: { type: Date, required: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    lead_id: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", default: null },
    poc_id: { type: mongoose.Schema.Types.ObjectId, default: null },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date },
    pushNotificationSent: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now },
});

addTaskAudit(taskSchema);

module.exports = mongoose.model("Task", taskSchema);
