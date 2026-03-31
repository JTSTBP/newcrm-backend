const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const User = require('../models/User');

const Lead = require('../models/Lead');

// @route   GET /api/poc-bucket
// @desc    Get current user's POC bucket with remarks
// @access  Private
router.get('/', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('poc_bucket');
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Enrich bucket with remarks from Lead model
        const enrichedBucket = await Promise.all(user.poc_bucket.map(async (item) => {
            const lead = await Lead.findById(item.leadId).select('remarks');
            if (!lead) return { ...item.toObject(), remarks: [] };

            // Filter remarks for this specific POC
            const relevantRemarks = lead.remarks.filter(r =>
                (r.poc_id && r.poc_id.toString() === item.pocId.toString()) ||
                (r.content && r.content.startsWith(`[POC: ${item.name}]`))
            );

            return {
                ...item.toObject(),
                remarks: relevantRemarks.sort((a, b) => b.created_at - a.created_at)
            };
        }));

        res.json(enrichedBucket);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/poc-bucket/add
// @desc    Add a POC to the bucket
// @access  Private
router.post('/add', auth, async (req, res) => {
    try {
        const { leadId, pocId, name, designation, phone, email, company_name } = req.body;

        const user = await User.findById(req.user.id);

        // Check if already exists
        const exists = user.poc_bucket.find(item => item.pocId.toString() === pocId);
        if (exists) {
            return res.status(400).json({ message: 'POC already in bucket' });
        }

        user.poc_bucket.push({
            leadId,
            pocId,
            name,
            designation,
            phone,
            email,
            company_name
        });

        await user.save();
        res.json(user.poc_bucket);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   DELETE /api/poc-bucket/remove/:pocId
// @desc    Remove a POC from the bucket
// @access  Private
router.delete('/remove/:pocId', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        user.poc_bucket = user.poc_bucket.filter(item => item.pocId.toString() !== req.params.pocId);
        await user.save();
        res.json(user.poc_bucket);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   DELETE /api/poc-bucket/clear
// @desc    Clear the entire bucket
// @access  Private
router.delete('/clear', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        user.poc_bucket = [];
        await user.save();
        res.json({ message: 'Bucket cleared' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
