// G<Logger service worker: shows reminder notifications, even when the app is closed.
// (No offline caching on purpose, so the app is never stuck on an old version.)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.title || 'G<Logger', {
    body: d.body || '', tag: d.tag || 'glog', renotify: true,
    icon: '/icon-192.png', badge: '/icon-192.png', data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
    const w = wins.find(x => 'focus' in x);
    return w ? w.focus() : self.clients.openWindow(url);
  }));
});
