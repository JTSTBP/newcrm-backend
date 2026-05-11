const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');

dotenv.config();

const findAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const admin = await User.findOne({ role: 'Admin' });
        if (admin) {
            console.log('Found Admin:', admin.email);
        } else {
            console.log('No Admin found');
        }
        const bd = await User.findOne({ role: 'BD Executive' });
        if (bd) {
            console.log('Found BD:', bd.email);
        } else {
            console.log('No BD found');
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

findAdmin();
