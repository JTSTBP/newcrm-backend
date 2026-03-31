const webpush = require('web-push');
const Task = require('./models/Task');
const User = require('./models/User');

webpush.setVapidDetails(
    'mailto:admin@newcrm.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

const startNotificationJob = () => {
    console.log('[PushNotifications] Background job started, checking every 60 seconds.');

    const runJob = async () => {
        try {
            const now = new Date();

            // Find tasks that are due, incomplete, and we haven't sent a push yet
            const dueTasks = await Task.find({
                due_date: { $lte: now },
                completed: false,
                pushNotificationSent: false,
                user_id: { $ne: null }
            }).populate('lead_id', 'company_name');

            if (dueTasks.length === 0) return;

            console.log(`[PushNotifications] Found ${dueTasks.length} tasks to notify.`);

            for (const task of dueTasks) {
                try {
                    const user = await User.findById(task.user_id).select('pushSubscription name');
                    if (!user || !user.pushSubscription) {
                        // No subscription, just mark as sent to avoid repeated lookups
                        await Task.findByIdAndUpdate(task._id, { pushNotificationSent: true });
                        continue;
                    }

                    const leadName = task.lead_id?.company_name || 'a lead';
                    const leadId = task.lead_id?._id?.toString() || null;
                    const targetUrl = leadId
                        ? `/admin/leads?openLead=${leadId}&tab=tasks`
                        : '/admin/leads';

                    const payload = JSON.stringify({
                        title: `⏰ Task Due: ${task.title}`,
                        body: `For ${leadName} — Due at ${new Date(task.due_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
                        icon: '/logo192.png',
                        badge: '/logo192.png',
                        tag: `task-${task._id}`,
                        data: { taskId: task._id.toString(), leadId, url: targetUrl }
                    });

                    await webpush.sendNotification(user.pushSubscription, payload);
                    await Task.findByIdAndUpdate(task._id, { pushNotificationSent: true });

                    console.log(`[PushNotifications] Sent notification for task "${task.title}" to user ${user.name}`);
                } catch (pushErr) {
                    console.error(`[PushNotifications] Failed for task ${task._id}:`, pushErr.message);
                    // If subscription is expired/invalid (410 Gone), clear it
                    if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
                        await User.findByIdAndUpdate(task.user_id, { pushSubscription: null });
                    }
                    // Still mark as sent to avoid spam retrying
                    await Task.findByIdAndUpdate(task._id, { pushNotificationSent: true });
                }
            }
        } catch (err) {
            console.error('[PushNotifications] Job error:', err.message);
        }
    };

    // Run immediately
    runJob();
    // Then repeat every 60 seconds
    setInterval(runJob, 60 * 1000);
};

module.exports = { startNotificationJob };
