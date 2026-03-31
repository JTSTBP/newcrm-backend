// Service Worker for Web Push Notifications
// This file must be in the /public directory so it is served at the root.

self.addEventListener('push', (event) => {
    if (!event.data) return;

    let data;
    try {
        data = event.data.json();
    } catch (e) {
        data = {
            title: 'Task Reminder',
            body: event.data.text(),
            icon: '/logo192.png'
        };
    }

    const options = {
        body: data.body || 'You have a task due.',
        icon: data.icon || '/logo192.png',
        badge: data.badge || '/logo192.png',
        tag: data.tag || 'task-reminder',
        data: data.data || {},
        vibrate: [200, 100, 200], // vibrate pattern on mobile
        actions: [
            { action: 'view', title: 'View Task' },
            { action: 'dismiss', title: 'Dismiss' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'Task Due', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    // Get target URL from notification data, fallback to app root
    const targetUrl = event.notification.data?.url || '/';

    if (event.action === 'dismiss') return;

    // 'view' action OR direct notification click both navigate to the lead
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Try to find an existing CRM window and navigate it
            const origin = self.location.origin;
            const fullUrl = origin + targetUrl;

            for (const client of clientList) {
                if (client.url.startsWith(origin) && 'navigate' in client) {
                    client.focus();
                    return client.navigate(fullUrl);
                }
            }
            // No existing tab found — open a new window
            return clients.openWindow(fullUrl);
        })
    );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
