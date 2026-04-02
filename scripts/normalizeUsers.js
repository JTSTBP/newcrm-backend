const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const User = require('../models/User');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const normalizeUsers = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected.');

        const users = await User.find({});
        console.log(`Found ${users.length} users. Checking for emails to normalize...`);

        let updatedCount = 0;
        for (const user of users) {
            const originalEmail = user.email;
            const normalizedEmail = originalEmail.toLowerCase().trim();

            if (originalEmail !== normalizedEmail) {
                console.log(`Normalizing: ${originalEmail} -> ${normalizedEmail}`);
                user.email = normalizedEmail;
                // We use save() to trigger any hooks, or updateOne if we want to bypass hooks
                // Since our model has lowercase: true, save() will definitely lowercase it.
                await user.save();
                updatedCount++;
            }
        }

        console.log(`Normalization complete. ${updatedCount} users updated.`);
        process.exit(0);
    } catch (err) {
        console.error('Error during normalization:', err);
        process.exit(1);
    }
};

normalizeUsers();
