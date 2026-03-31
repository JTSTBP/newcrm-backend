const LeadActivity = require('../models/LeadActivity');

/**
 * Log an activity event for a lead.
 * @param {Object} options
 * @param {string} options.leadId - The ID of the lead
 * @param {string} options.type - Activity type (must match enum in LeadActivity model)
 * @param {string} options.description - Human-readable description of what happened
 * @param {string|null} options.userId - The user who performed the action (null = System)
 * @param {string} options.userName - The name of the user (default: 'System')
 * @param {Object} options.metadata - Any extra fields to store (old values, new values, etc.)
 */
const logActivity = async ({ leadId, type, description, userId = null, userName = 'System', metadata = {} }) => {
    try {
        await LeadActivity.create({
            leadId,
            type,
            description,
            performedBy: userId || null,
            performedByName: userName,
            metadata,
            timestamp: new Date()
        });
    } catch (err) {
        // Never let activity logging break any main operation
        console.error(`[ActivityLog] Failed to log "${type}" for lead ${leadId}:`, err.message);
    }
};

module.exports = logActivity;
