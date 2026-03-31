const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const auth = require('../middleware/authMiddleware');
const logActivity = require('../utils/logActivity');

// @route   GET /api/tasks/my-tasks
// @desc    Get all pending tasks assigned to the current user
// @access  Private
router.get('/my-tasks', auth, async (req, res) => {
    try {
        const tasks = await Task.find({
            user_id: req.user.id,
            completed: false
        })
            .populate('lead_id', 'company_name') // Populate lead name for context
            .populate('createdBy', 'name')
            .sort({ due_date: 1 });

        res.json(tasks);
    } catch (err) {
        console.error('Fetch my tasks error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   GET /api/tasks/lead/:leadId
// @desc    Get all tasks for a specific lead
// @access  Private
router.get('/lead/:leadId', auth, async (req, res) => {
    try {
        const query = { lead_id: req.params.leadId };

        // For lead-specific tasks, only Admin sees all. Others see only their own.
        if (req.user.role !== 'Admin') {
            query.user_id = req.user.id;
        }

        const tasks = await Task.find(query)
            .sort({ created_at: -1 })
            .populate('user_id', 'name')
            .populate('createdBy', 'name');
        console.log(`[DEBUG GET] length=${tasks.length} leadId=${req.params.leadId}`);
        res.json(tasks);
    } catch (err) {
        console.error('Fetch tasks error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   POST /api/tasks
// @desc    Create a new task
// @access  Private
router.post('/', auth, async (req, res) => {
    try {
        const { title, description, due_date, type, lead_id, poc_id, user_id } = req.body;
        console.log('[DEBUG POST] Task req.body:', req.body);

        if (!title || !due_date) {
            return res.status(400).json({ message: 'Title and due date are required' });
        }

        const task = new Task({
            title,
            description,
            due_date,
            type,
            lead_id,
            poc_id,
            user_id: user_id || req.user.id,
            createdBy: req.user.id
        });

        await task.save();

        if (lead_id) {
            await logActivity({
                leadId: lead_id,
                type: 'Task Created',
                description: `Task "${title}" was created${due_date ? ` (due ${new Date(due_date).toLocaleDateString()})` : ''}.`,
                userId: req.user.id,
                userName: req.user.name || 'Admin',
                metadata: { taskId: task._id, title, type, due_date }
            });
        }

        res.status(201).json(task);
    } catch (err) {
        console.error('Create task error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   PUT /api/tasks/bulk
// @desc    Mark multiple tasks as completed
// @access  Private
router.put('/bulk', auth, async (req, res) => {
    try {
        const { taskIds, leadId } = req.body;
        if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
            return res.status(400).json({ message: 'No task IDs provided' });
        }

        const result = await Task.updateMany(
            { _id: { $in: taskIds } },
            { $set: { completed: true, completedAt: new Date() } }
        );

        if (leadId) {
            await logActivity({
                leadId: leadId,
                type: 'Bulk Tasks Completed',
                description: `${result.modifiedCount} tasks were marked as completed in bulk.`,
                userId: req.user.id,
                userName: req.user.name || 'Admin',
                metadata: { taskIds, count: result.modifiedCount }
            });
        }

        res.json({ message: 'Tasks completed successfully', modifiedCount: result.modifiedCount });
    } catch (err) {
        console.error('Bulk complete tasks error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   PUT /api/tasks/:id
// @desc    Update task details or status
// @access  Private
router.put('/:id', auth, async (req, res) => {
    try {
        const { title, description, type, due_date, user_id, completed } = req.body;

        let task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ message: 'Task not found' });

        const wasCompleted = task.completed;
        const updateData = {};
        if (title) updateData.title = title;
        if (description !== undefined) updateData.description = description;
        if (type) updateData.type = type;
        if (due_date) updateData.due_date = due_date;
        if (user_id) updateData.user_id = user_id;

        if (completed !== undefined) {
            updateData.completed = completed;
            updateData.completedAt = completed ? new Date() : null;
        }

        task = await Task.findByIdAndUpdate(
            req.params.id,
            { $set: updateData },
            { new: true }
        );

        if (task.lead_id) {
            if (completed !== undefined && !wasCompleted && completed) {
                await logActivity({
                    leadId: task.lead_id,
                    type: 'Task Completed',
                    description: `Task "${task.title}" was marked as completed.`,
                    userId: req.user.id,
                    userName: req.user.name || 'Admin',
                    metadata: { taskId: task._id, title: task.title }
                });
            } else if (completed !== undefined && wasCompleted && !completed) {
                await logActivity({
                    leadId: task.lead_id,
                    type: 'Task Reopened',
                    description: `Task "${task.title}" was reopened.`,
                    userId: req.user.id,
                    userName: req.user.name || 'Admin',
                    metadata: { taskId: task._id, title: task.title }
                });
            } else {
                await logActivity({
                    leadId: task.lead_id,
                    type: 'Task Updated',
                    description: `Task "${task.title}" details were updated.`,
                    userId: req.user.id,
                    userName: req.user.name || 'Admin',
                    metadata: { taskId: task._id, title: task.title }
                });
            }
        }

        res.json(task);
    } catch (err) {
        console.error('Update task error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});



// @route   DELETE /api/tasks/bulk
// @desc    Delete multiple tasks
// @access  Private
router.delete('/bulk', auth, async (req, res) => {
    try {
        const { taskIds, leadId } = req.body;
        if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
            return res.status(400).json({ message: 'No task IDs provided' });
        }

        const result = await Task.deleteMany({ _id: { $in: taskIds } });

        if (leadId) {
            await logActivity({
                leadId: leadId,
                type: 'Bulk Tasks Deleted',
                description: `${result.deletedCount} tasks were deleted in bulk.`,
                userId: req.user.id,
                userName: req.user.name || 'Admin',
                metadata: { taskIds, count: result.deletedCount }
            });
        }

        res.json({ message: 'Tasks removed successfully', deletedCount: result.deletedCount });
    } catch (err) {
        console.error('Bulk delete tasks error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   DELETE /api/tasks/:id
// @desc    Delete a task
// @access  Private
router.delete('/:id', auth, async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ message: 'Task not found' });

        if (task.lead_id) {
            await logActivity({
                leadId: task.lead_id,
                type: 'Task Deleted',
                description: `Task "${task.title}" was deleted.`,
                userId: req.user.id,
                userName: req.user.name || 'Admin',
                metadata: { taskId: task._id, title: task.title }
            });
        }

        await Task.findByIdAndDelete(req.params.id);
        res.json({ message: 'Task removed successfully' });
    } catch (err) {
        console.error('Delete task error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
