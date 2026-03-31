const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Task = require('../models/Task');
const auth = require('../middleware/authMiddleware');
const webpush = require('web-push');

webpush.setVapidDetails(
    'mailto:admin@newcrm.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

// @route   GET /api/push/vapid-public-key
// @desc    Get the public VAPID key for client-side subscription
// @access  Public
router.get('/vapid-public-key', (req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// @route   POST /api/push/subscribe
// @desc    Save push subscription for the current user
// @access  Private
router.post('/subscribe', auth, async (req, res) => {
    try {
        const subscription = req.body;
        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ message: 'Invalid subscription object' });
        }

        await User.findByIdAndUpdate(req.user.id, { pushSubscription: subscription });
        res.json({ message: 'Push subscription saved' });
    } catch (err) {
        console.error('Push subscribe error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   DELETE /api/push/unsubscribe
// @desc    Remove push subscription for the current user
// @access  Private
router.delete('/unsubscribe', auth, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user.id, { pushSubscription: null });
        res.json({ message: 'Push subscription removed' });
    } catch (err) {
        console.error('Push unsubscribe error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
