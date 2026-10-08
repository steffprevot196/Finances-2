
// ---------------------------------------------------------------------
// NOTIFICATIONS SYSTÈME — clic sur la notification
// ---------------------------------------------------------------------
// Quand l'utilisateur clique sur une notification native, on ramène
// l'application au premier plan (ou on l'ouvre si elle est fermée) puis
// on ferme la notification.
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const targetUrl = event.notification.data && event.notification.data.url
        ? event.notification.data.url
        : './index.html';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clients) => {
                // Cherche un onglet déjà ouvert sur l'app
                for (const client of clients) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        client.focus();
                        // Relaie l'info au client pour qu'il puisse réagir
                        client.postMessage({
                            type: 'NOTIFICATION_CLICKED',
                            alertId: (event.notification.data && event.notification.data.alertId) || null
                        });
                        return;
                    }
                }
                // Aucun onglet ouvert : on en ouvre un
                if (self.clients.openWindow) {
                    return self.clients.openWindow(targetUrl);
                }
            })
    );
});

// Ferme proprement la notification si elle est rejetée par l'utilisateur
self.addEventListener('notificationclose', (event) => {
    // Rien à faire, mais on peut tracer pour le debug
    console.info('[SW] Notification fermée sans clic :', event.notification.tag);
});