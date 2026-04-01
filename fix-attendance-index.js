/**
 * One-time script to drop the stale 'user_1_date_1' index from the attendances collection.
 * This index was created when the field was called 'user' instead of 'user_id'.
 * Run: node fix-attendance-index.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function fixIndex() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        const db = mongoose.connection.db;
        const collection = db.collection('attendances');

        const indexes = await collection.indexes();
        console.log('Current indexes:', indexes.map(i => i.name));

        // Drop the old stale index if it exists
        const staleIndex = indexes.find(i => i.name === 'user_1_date_1');
        if (staleIndex) {
            await collection.dropIndex('user_1_date_1');
            console.log('✅ Dropped stale index: user_1_date_1');
        } else {
            console.log('ℹ️ Stale index not found (already cleaned up or not present).');
        }

        // Also, clean up any attendance documents where user_id is null (leftover corrupt records)
        const deleteResult = await collection.deleteMany({ user_id: null });
        console.log(`🗑️ Deleted ${deleteResult.deletedCount} corrupt attendance records with null user_id.`);

        console.log('\n✅ Done! Restart your server now.');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

fixIndex();
