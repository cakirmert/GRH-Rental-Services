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

function notificationDestination(value) {
  const fallback = new URL('/', self.location.origin).href;
  if (typeof value !== 'string') return fallback;
  try {
    const url = new URL(value, self.location.origin);
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.origin !== self.location.origin || url.username || url.password
    ) return fallback;
    // Notifications use native paths; old query links are not navigation aliases.
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return fallback;
  }
}

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const target = notificationDestination(event.notification.data?.url);

  event.waitUntil((async () => {
    const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      try {
        if (new URL(client.url).origin !== self.location.origin) continue;
        const destination = client.url === target ? client : await client.navigate(target);
        if (destination) {
          await destination.focus();
          return;
        }
      } catch {
        // A closing or unavailable window must not prevent opening the requested page.
      }
    }
    return clients.openWindow(target);
  })());
});
