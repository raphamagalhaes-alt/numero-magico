/* Service worker mínimo: recebe notificações Web Push de novos proventos e abre a carteira ao clicar. */
self.addEventListener('push', (event) => {
  let data = { title: 'Número Mágico', body: 'Novo provento anunciado', url: '/#/carteira' };
  try { data = { ...data, ...event.data.json() }; } catch { /* payload texto */ }
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, data: { url: data.url }, tag: data.title }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data && event.notification.data.url ? event.notification.data.url : '/'));
});
