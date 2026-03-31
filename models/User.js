const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['Admin', 'Manager', 'BD Executive'],
        default: 'BD Executive'
    },
    status: {
        type: String,
        enum: ['Active', 'Inactive'],
        default: 'Active'
    },
    phone: {
        type: String,
        trim: true
    },
    personal_email: {
        type: String,
        trim: true,
        lowercase: true
    },
    date_of_joining: {
        type: Date,
        default: null
    },
    dob: {
        type: Date,
        default: null
    },
    appPassword: {
        type: String,
        trim: true,
        default: null
    },
    lastLogin: {
        type: Date,
        default: null
    },
    lastLogout: {
        type: Date,
        default: null
    },
    no_of_calls: {
        type: Number,
        default: 0
    },
    reporter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users',
        default: null
    },
    pushSubscription: {
        type: Object,
        default: null
    },
    poc_bucket: [{
        leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
        pocId: { type: mongoose.Schema.Types.ObjectId },
        name: String,
        designation: String,
        phone: String,
        email: String,
        company_name: String,
        added_at: { type: Date, default: Date.now }
    }]
}, {
    timestamps: {
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    }
});

// Hash password before saving
userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('users', userSchema);
module.exports = User;
