// Service worker: bare push-varsler. Ingen mellomlagring – appen hentes alltid fersk fra nettet.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { tekst: e.data ? e.data.text() : '' }; }
  const base = self.registration.scope;
  e.waitUntil(self.registration.showNotification(d.tittel || 'Sulamitten', {
    body: d.tekst || '',
    icon: `${base}ikon-192.png`,
    data: { url: base + (d.url || '') },
  }));
});

// Trykk på varselet åpner appen på riktig side (eller fokuserer et åpent vindu)
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil((async () => {
    const vinduer = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const v of vinduer) {
      if ('focus' in v) {
        await v.focus();
        if ('navigate' in v) await v.navigate(url).catch(() => {});
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
