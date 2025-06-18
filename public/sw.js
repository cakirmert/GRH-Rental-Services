self.addEventListener('push', function (event) {
  if (event.data) {
    try {
      const data = event.data.json();
      
      const options = {
        body: data.body,
        icon: data.icon || '/icon-192x192.png',
        badge: data.badge || '/icon-192x192.png',
        data: data,
        requireInteraction: false,
        silent: false,
        tag: 'grh-booking-notification',
        renotify: true,
        timestamp: Date.now(),
        actions: data.url ? [{
          action: 'open',
          title: 'Open App'
        }] : []
      };
      
      event.waitUntil(
        self.registration.showNotification(data.title, options)
      );    } catch {
      // Fallback notification
      event.waitUntil(
        self.registration.showNotification('GRH Booking', {
          body: 'You have a new update',
          icon: '/icon-192x192.png',
          badge: '/icon-192x192.png'
        })
      );
    }
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  
  const notificationData = event.notification.data;
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Check if there's already a window open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin)) {
            client.focus();
            // Send message to client to handle navigation
            client.postMessage({
              type: 'NOTIFICATION_CLICK',
              bookingId: notificationData?.bookingId,
              notificationType: notificationData?.type
            });
            return;
          }
        }
        
        // No window found, open a new one with proper localStorage setup
        // We'll use the main page and let it handle the navigation via URL params
        const url = notificationData?.url || '/';
        return clients.openWindow(url);
      })
  );
});
