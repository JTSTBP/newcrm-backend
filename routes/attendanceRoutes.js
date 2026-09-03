const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const auth = require('../middleware/authMiddleware');

const USER_ROLE_VALUES = User.schema.path('role').enumValues;

// Helper to get formatted time HH:mm:ss
const getFormattedTime = () => {
    const now = new Date();
    return now.toTimeString().split(' ')[0]; // Returns HH:MM:SS
};

const escapeRegex = value => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseLocalDateStart = value => {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
};

const parseLocalDateEnd = value => {
    if (!value) return null;
    const date = new Date(`${value}T23:59:59.999`);
    return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeStatus = value => {
    const status = String(value || '').trim();
    if (!status || status.toLowerCase() === 'all') return '';
    return status;
};

const buildAttendanceFilter = async ({
    user,
    role,
    status,
    startDate,
    endDate,
    from,
    to,
    search,
    employeeId,
    user_id,
    managerId
}) => {
    if (user.role !== 'Admin') {
        const error = new Error('Access denied. Admins only.');
        error.status = 403;
        throw error;
    }

    const query = {};
    const userConditions = {};
    const selectedRole = String(role || '').trim();
    const selectedEmployeeId = employeeId || user_id;
    const selectedManagerId = managerId;
    const selectedStatus = normalizeStatus(status);

    if (selectedStatus) query.status = selectedStatus;
    if (selectedEmployeeId) query.user_id = selectedEmployeeId;

    const rangeStart = parseLocalDateStart(startDate || from);
    const rangeEnd = parseLocalDateEnd(endDate || to);
    if (rangeStart || rangeEnd) {
        query.date = {};
        if (rangeStart) query.date.$gte = rangeStart;
        if (rangeEnd) query.date.$lte = rangeEnd;
    }

    if (selectedRole && selectedRole.toLowerCase() !== 'all') {
        if (!USER_ROLE_VALUES.includes(selectedRole)) {
            const error = new Error('Invalid role filter.');
            error.status = 400;
            throw error;
        }
        userConditions.role = selectedRole;
    }

    if (selectedManagerId) userConditions.reporter = selectedManagerId;

    const searchText = String(search || '').trim();
    if (searchText) {
        const regex = new RegExp(escapeRegex(searchText), 'i');
        userConditions.$or = [{ name: regex }, { email: regex }];
    }

    if (Object.keys(userConditions).length) {
        const matchingUsers = await User.find(userConditions).select('_id').lean();
        const ids = matchingUsers.map(item => item._id);
        query.user_id = selectedEmployeeId
            ? query.user_id
            : { $in: ids };
        if (!ids.length && !selectedEmployeeId) query.user_id = { $in: [] };
    }

    return query;
};

const populateAttendance = query => query.populate({
    path: 'user_id',
    select: 'name email role reporter',
    populate: { path: 'reporter', select: 'name email role' }
});

const csvValue = value => {
    const text = String(value ?? '-').replace(/\r?\n/g, ' ');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const formatDate = value => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-IN', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const formatTime = value => value || '-';

const statusText = value => value || '-';

const firstSessionValue = (record, key) => {
    const session = record.sessions?.[0];
    return session?.[key] || '-';
};

const calculateBreakDuration = record => {
    const sessions = record.sessions || [];
    if (sessions.length < 2) return '-';
    const toMinutes = time => {
        if (!time) return null;
        const [h, m] = String(time).split(':').map(Number);
        return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
    };
    let total = 0;
    for (let i = 1; i < sessions.length; i += 1) {
        const previousOut = toMinutes(sessions[i - 1].logoutTime);
        const currentIn = toMinutes(sessions[i].loginTime);
        if (previousOut !== null && currentIn !== null && currentIn > previousOut) total += currentIn - previousOut;
    }
    if (!total) return '-';
    return `${Math.floor(total / 60)}h ${total % 60}m`;
};

const makeExportFilename = ({ datePreset, role, startDate, endDate }) => {
    const today = new Date().toISOString().slice(0, 10);
    const sanitize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'all';
    const range = datePreset === 'lastMonth'
        ? (startDate || '').slice(0, 7)
        : datePreset === 'thisMonth'
            ? 'this_month'
            : `${startDate || 'start'}_to_${endDate || 'end'}`;
    return `attendance_${sanitize(range)}_${sanitize(role || 'all_roles')}_${today}.csv`;
};

const attendanceToCsv = records => {
    const headers = [
        'S.No',
        'Employee Name',
        'Employee Email',
        'Role',
        'Date',
        'Check-in Time',
        'Check-out Time',
        'Working Hours',
        'Attendance Status',
        'Late Status or Late Minutes',
        'Break Duration',
        'Remarks',
        'Manager or Reporting Person'
    ];
    const rows = records.map((record, index) => {
        const user = record.user_id || {};
        const manager = user.reporter || {};
        return [
            index + 1,
            user.name || '-',
            user.email || '-',
            user.role || '-',
            formatDate(record.date),
            formatTime(record.firstLogin || firstSessionValue(record, 'loginTime')),
            formatTime(record.lastLogout || firstSessionValue(record, 'logoutTime')),
            record.totalWorkingHours || '-',
            statusText(record.status),
            '-',
            calculateBreakDuration(record),
            '-',
            manager.name || '-'
        ].map(csvValue).join(',');
    });
    return `\uFEFF${headers.map(csvValue).join(',')}\n${rows.join('\n')}`;
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

// @route   GET /api/attendance/roles
// @desc    Get available user roles for attendance filters
// @access  Private (Admin Role)
router.get('/roles', auth, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'Access denied. Admins only.' });
        }
        res.json({ roles: USER_ROLE_VALUES });
    } catch (err) {
        console.error('Fetch attendance roles error:', err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
});

// @route   GET /api/attendance/export
// @desc    Export filtered attendance records
// @access  Private (Admin Role)
router.get('/export', auth, async (req, res) => {
    try {
        const query = await buildAttendanceFilter({
            user: req.user,
            role: req.query.role,
            status: req.query.status,
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            from: req.query.from,
            to: req.query.to,
            search: req.query.search,
            employeeId: req.query.employeeId,
            user_id: req.query.user_id,
            managerId: req.query.managerId
        });

        const records = await populateAttendance(Attendance.find(query))
            .sort({ date: -1, createdAt: -1 })
            .lean();
        const csv = attendanceToCsv(records);
        const filename = makeExportFilename({
            datePreset: req.query.datePreset,
            role: req.query.role && req.query.role !== 'all' ? req.query.role : 'all_roles',
            startDate: req.query.startDate || req.query.from,
            endDate: req.query.endDate || req.query.to
        });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
    } catch (err) {
        console.error('Export attendance error:', err);
        res.status(err.status || 500).json({ message: err.message || 'Server Error', error: err.message });
    }
});

// @route   GET /api/attendance
// @desc    Get attendance records (for Admin)
// @access  Private (Admin Role)
router.get('/', auth, async (req, res) => {
    try {
        const query = await buildAttendanceFilter({
            user: req.user,
            role: req.query.role,
            status: req.query.status,
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            from: req.query.from,
            to: req.query.to,
            search: req.query.search,
            employeeId: req.query.employeeId,
            user_id: req.query.user_id,
            managerId: req.query.managerId
        });

        if (!query.date && req.query.date) {
            // Legacy single-date support
            const queryDate = new Date(req.query.date);
            queryDate.setHours(0, 0, 0, 0);
            const nextDate = new Date(queryDate);
            nextDate.setDate(queryDate.getDate() + 1);
            query.date = { $gte: queryDate, $lt: nextDate };
        }

        const page = Math.max(parseInt(req.query.page, 10) || 0, 0);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 200);
        const total = await Attendance.countDocuments(query);
        let findQuery = populateAttendance(Attendance.find(query)).sort({ date: -1, createdAt: -1 });
        if (page) findQuery = findQuery.skip((page - 1) * limit).limit(limit);
        const records = await findQuery.lean();

        if (!page) return res.json(records);
        res.json({
            records,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('Fetch attendance error:', err);
        res.status(err.status || 500).json({ message: err.message || 'Server Error', error: err.message });
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
