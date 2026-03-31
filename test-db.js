require('dotenv').config();
const mongoose = require('mongoose');
const Task = require('./models/Task');

mongoose.connect(process.env.MONGO_URI).then(async () => {
    try {
        const tasks = await Task.find().sort({ _id: -1 }).limit(5);
        console.log(JSON.stringify(tasks, null, 2));
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
});
