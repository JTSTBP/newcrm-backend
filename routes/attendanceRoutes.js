const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const auth = require('../middleware/authMiddleware');

// Helper to get formatted time HH:mm:ss
const getFormattedTime = () => {
    const now = new Date();
    return now.toTimeString().split(' ')[0]; // Returns HH:MM:SS
};

// @route   POST /api/attendance/logout
// @desc    Record logout time for user session
// @access  Private
router.post('/logout', auth, async (req, res) => {
    try {
        if (req.user.role === 'Admin') {
            return res.json({ message: 'Logout successful (Admin attendance not tracked)' });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const attendance = await Attendance.findOne({
            user_id: req.user.id,
            date: today
        });

        if (!attendance) {
            return res.status(404).json({ message: 'No active attendance record found for today' });
        }

        // Find the active session
        const activeSession = attendance.sessions.find(s => s.isActive);
        if (activeSession) {
            activeSession.logoutTime = getFormattedTime();
            activeSession.isActive = false;
        } else {
            // If somehow no active session, get the last session without logoutTime
            const lastSession = attendance.sessions[attendance.sessions.length - 1];
            if (lastSession && !lastSession.logoutTime) {
                lastSession.logoutTime = getFormattedTime();
                lastSession.isActive = false;
            }
        }

        await attendance.save();
        res.json({ message: 'Logout recorded successfully', attendance });
    } catch (err) {
        console.error('Logout attendance error:', err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
});

// @route   GET /api/attendance
// @desc    Get all attendance records (for Admin)
// @access  Private (Admin Role)
router.get('/', auth, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'Access denied. Admins only.' });
        }

        let query = {};

        if (req.query.from || req.query.to) {
            query.date = {};
            if (req.query.from) {
                const fromDate = new Date(req.query.from);
                fromDate.setHours(0, 0, 0, 0);
                query.date.$gte = fromDate;
            }
            if (req.query.to) {
                const toDate = new Date(req.query.to);
                toDate.setHours(23, 59, 59, 999);
                query.date.$lte = toDate;
            }
        } else if (req.query.date) {
            // Legacy single-date support
            const queryDate = new Date(req.query.date);
            queryDate.setHours(0, 0, 0, 0);
            const nextDate = new Date(queryDate);
            nextDate.setDate(queryDate.getDate() + 1);
            query.date = { $gte: queryDate, $lt: nextDate };
        }

        const records = await Attendance.find(query)
            .populate('user_id', 'name email role')
            .sort({ date: -1 });

        res.json(records);
    } catch (err) {
        console.error('Fetch attendance error:', err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
});

// @route   GET /api/attendance/me
// @desc    Get current user's attendance records
// @access  Private
router.get('/me', auth, async (req, res) => {
    try {
        const records = await Attendance.find({ user_id: req.user.id })
            .sort({ date: -1 });

        res.json(records);
    } catch (err) {
        console.error('Fetch personal attendance error:', err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
});

// @route   DELETE /api/attendance/:id
// @desc    Delete a specific attendance record (Admin Role)
// @access  Private
router.delete('/:id', auth, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') return res.status(403).json({ message: 'Access denied. Admins only.' });
        const record = await Attendance.findByIdAndDelete(req.params.id);
        if (!record) return res.status(404).json({ message: 'Record not found' });
        res.json({ message: 'Attendance record deleted successfully' });
    } catch (err) {
        console.error('Delete attendance error:', err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
});

// @route   DELETE /api/attendance
// @desc    Clear all attendance records (Admin Role)
// @access  Private
router.delete('/', auth, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') return res.status(403).json({ message: 'Access denied. Admins only.' });
        await Attendance.deleteMany({});
        res.json({ message: 'All attendance records cleared' });
    } catch (err) {
        console.error('Clear attendance error:', err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
});

module.exports = router;
