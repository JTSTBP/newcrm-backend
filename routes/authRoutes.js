const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Attendance = require('../models/Attendance');

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', async (req, res) => {
    const { email, password, loginType } = req.body;

    try {
        // Check for user
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }

        // Role-based restrictions
        if (loginType === 'admin') {
            if (user.role !== 'Admin') {
                return res.status(403).json({ message: 'Access denied. Use agent login.' });
            }
        } else if (loginType === 'agent') {
            if (user.role === 'Admin') {
                return res.status(403).json({ message: 'Admins must use admin login.' });
            }
            if (user.role !== 'Manager' && user.role !== 'BD Executive') {
                return res.status(403).json({ message: 'Unauthorized role.' });
            }
        } else {
            return res.status(400).json({ message: 'Invalid login type.' });
        }

        // Check if user is active
        if (user.status !== 'Active') {
            return res.status(403).json({ message: 'Account is inactive' });
        }

        // Validate password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Create JWT Payload
        const payload = {
            user: {
                id: user.id,
                name: user.name,
                role: user.role
            }
        };

        // Sign token synchronously for simplicity in this case
        const token = jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Update lastLogin
        user.lastLogin = new Date();
        await user.save();

        // Handle attendance tracking
        if (user.role !== 'Admin') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const getFormattedTime = () => {
                const now = new Date();
                return now.toTimeString().split(' ')[0];
            };

            const userAgent = req.headers['user-agent'] || '';
            const isMobile = /mobile/i.test(userAgent) || /android/i.test(userAgent) || /iphone/i.test(userAgent);
            const detectedDevice = isMobile ? 'Phone' : 'System';

            let attendance = await Attendance.findOne({ user_id: user.id, date: today });
            if (!attendance) {
                attendance = new Attendance({
                    user_id: user.id,
                    date: today,
                    sessions: [{
                        loginTime: getFormattedTime(),
                        isActive: true,
                        deviceType: detectedDevice
                    }]
                });
            } else {
                // Check if there's already an active session without a logout time
                const hasActiveSession = attendance.sessions.some(s => s.isActive && !s.logoutTime);
                if (!hasActiveSession) {
                    attendance.sessions.push({
                        loginTime: getFormattedTime(),
                        isActive: true,
                        deviceType: detectedDevice
                    });
                }
            }
            await attendance.save();
        }

        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status,
                phone: user.phone,
                personal_email: user.personal_email,
                date_of_joining: user.date_of_joining,
                dob: user.dob,
                appPassword: user.appPassword,
                createdAt: user.created_at,
                updatedAt: user.updated_at,
                lastLogin: user.lastLogin
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
});

const auth = require('../middleware/authMiddleware');

// @route   PUT /api/auth/profile
// @desc    Update user profile (name, email, phone)
// @access  Private
router.put('/profile', auth, async (req, res) => {
    const { name, email, phone, personal_email, dob } = req.body;

    try {
        let user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if email is already taken by another user
        if (email && email !== user.email) {
            const emailExists = await User.findOne({ email });
            if (emailExists) {
                return res.status(400).json({ message: 'Email already exists' });
            }
            user.email = email;
        }

        // Check if phone is already taken by another user
        if (phone && phone !== user.phone) {
            const phoneExists = await User.findOne({ phone });
            if (phoneExists) {
                return res.status(400).json({ message: 'Phone number already exists' });
            }
            user.phone = phone;
        }

        if (name) user.name = name;
        if (personal_email) user.personal_email = personal_email;
        if (dob) user.dob = dob;

        await user.save();

        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.status,
            phone: user.phone,
            personal_email: user.personal_email,
            dob: user.dob,
            appPassword: user.appPassword,
            createdAt: user.created_at,
            updatedAt: user.updated_at,
            lastLogin: user.lastLogin
        });
    } catch (err) {
        console.error('Profile update error:', err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
});

// @route   GET /api/auth/users/list
// @desc    Get simplified list of users (ID and Name) for dropdowns
// @access  Private (Admin, Manager, BD Executive)
router.get('/users/list', auth, async (req, res) => {
    try {
        if (!['Admin', 'Manager', 'BD Executive'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Access denied.' });
        }

        const users = await User.find({}, 'name role').sort({ name: 1 });
        res.json(users);
    } catch (err) {
        console.error('Fetch user list error:', err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
});

// @route   GET /api/auth/users
// @desc    Get all users
// @access  Private (Admin only)
router.get('/users', auth, async (req, res) => {
    try {
        // Double check admin role
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'Access denied. Admins only.' });
        }

        const users = await User.find({}, '-password')
            .populate('reporter', 'name role')
            .sort({ created_at: -1 });
        res.json(users);
    } catch (err) {
        console.error('Fetch users error:', err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
});

// @route   POST /api/auth/users
// @desc    Add new user
// @access  Private (Admin only)
router.post('/users', auth, async (req, res) => {
    const { name, email, password, role, phone, status, personal_email, date_of_joining, dob, reporter } = req.body;

    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'Access denied. Admins only.' });
        }

        // Check unique fields
        const emailExists = await User.findOne({ email });
        if (emailExists) return res.status(400).json({ message: 'Email already exists' });

        if (phone) {
            const phoneExists = await User.findOne({ phone });
            if (phoneExists) return res.status(400).json({ message: 'Phone number already exists' });
        }

        const newUser = new User({
            name,
            email,
            password, // Will be hashed by pre-save hook
            role,
            phone,
            status: status || 'Active',
            personal_email,
            date_of_joining,
            dob,
            reporter: reporter || null
        });

        await newUser.save();

        res.status(201).json({
            id: newUser.id,
            name: newUser.name,
            email: newUser.email,
            role: newUser.role,
            status: newUser.status,
            phone: newUser.phone,
            personal_email: newUser.personal_email,
            date_of_joining: newUser.date_of_joining,
            dob: newUser.dob,
            reporter: newUser.reporter,
            createdAt: newUser.created_at
        });
    } catch (err) {
        console.error('Add user error:', err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
});

// @route   PUT /api/auth/users/:id
// @desc    Update user details
// @access  Private (Admin only)
router.put('/users/:id', auth, async (req, res) => {
    const { name, email, role, phone, status, password, personal_email, date_of_joining, dob, reporter } = req.body;

    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'Access denied. Admins only.' });
        }

        let user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Uniqueness checks
        if (email && email !== user.email) {
            const emailExists = await User.findOne({ email });
            if (emailExists) return res.status(400).json({ message: 'Email already exists' });
            user.email = email;
        }

        if (phone && phone !== user.phone) {
            const phoneExists = await User.findOne({ phone });
            if (phoneExists) return res.status(400).json({ message: 'Phone number already exists' });
            user.phone = phone;
        }

        if (name) user.name = name;
        if (role) user.role = role;
        if (status) user.status = status;
        if (password) user.password = password; // Will be hashed by hook
        if (personal_email !== undefined) user.personal_email = personal_email;
        if (date_of_joining !== undefined) user.date_of_joining = date_of_joining;
        if (dob !== undefined) user.dob = dob;
        if (reporter !== undefined) user.reporter = reporter === '' ? null : reporter;

        await user.save();

        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.status,
            phone: user.phone,
            personal_email: user.personal_email,
            date_of_joining: user.date_of_joining,
            dob: user.dob,
            reporter: user.reporter,
            updatedAt: user.updated_at
        });
    } catch (err) {
        console.error('Update user error:', err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
});

// @route   DELETE /api/auth/users/:id
// @desc    Delete user
// @access  Private (Admin only)
router.get('/users/delete-all', auth, async (req, res) => {
    // This is just a placeholder to avoid accidental bulk delete, but implementation is for single delete below
});

router.delete('/users/:id', auth, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'Access denied. Admins only.' });
        }

        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
});

// @route   PATCH /api/auth/users/:id/status
// @desc    Toggle user status
// @access  Private (Admin only)
router.patch('/users/:id/status', auth, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'Access denied. Admins only.' });
        }

        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.status = user.status === 'Active' ? 'Inactive' : 'Active';
        await user.save();

        res.json({ id: user.id, status: user.status });
    } catch (err) {
        console.error('Status toggle error:', err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
});

module.exports = router;
