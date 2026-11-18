// Loaded by Workbox through importScripts. No personal data is shown in OS notifications.
self.addEventListener('push', event => {
  let payload = {}
  try { payload = event.data ? event.data.json() : {} } catch { /* display generic notification */ }
  const title = '소개팅 주선 노트'
  const options = {
    body: '새 관심 신청이 도착했어요.',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: 'guest-interest',
    data: { url: '/requests' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const path = event.notification.data?.url === '/requests' ? '/requests' : '/'
  const target = new URL(path, self.location.origin).href
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clients) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(target)
        return client.focus()
      }
    }
    return self.clients.openWindow(target)
  })())
})
