// =====================================================================
// app15-notifications.js — NOTIFICATIONS SYSTÈME (Chantier N)
// Charge après app9-alerts.js, avant app7-init.js
// =====================================================================

const NATIF_NOTIF_KEY = 'patriMonial_nativeNotifEnabled';

// 1) Feature detection + état global
function isNativeNotificationsSupported() {
    return 'Notification' in window && 'serviceWorker' in navigator;
}
function isNativeNotificationsEnabled() {
    return localStorage.getItem(NATIF_NOTIF_KEY) !== 'false';
}
function setNativeNotificationsEnabled(enabled) {
    localStorage.setItem(NATIF_NOTIF_KEY, String(!!enabled));
    updateNativeNotifUI();
}
function toggleNativeNotifications() {
    setNativeNotificationsEnabled(!isNativeNotificationsEnabled());
}

// 2) Enregistrement du Service Worker (à appeler depuis app7-init)
async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    try {
        return await navigator.serviceWorker.register('./sw.js');
    } catch (err) {
        console.warn('[SW] Enregistrement échoué :', err);
        return null;
    }
}

// 3) Demande de permission + UI
async function requestNativeNotificationPermission() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied')  return 'denied';
    return await Notification.requestPermission();
}

function updateNativeNotifUI() {
    const statusEl = document.getElementById('native-notif-status');
    const btnEl    = document.getElementById('native-notif-toggle-btn');
    const globalCb = document.getElementById('native-notif-global-toggle');
    if (!statusEl) return;

    if (!isNativeNotificationsSupported()) {
        statusEl.innerText = 'Non supporté par ce navigateur.';
        if (btnEl) btnEl.classList.add('hidden');
        return;
    }
    const perm = Notification.permission;
    const pref = isNativeNotificationsEnabled();
    statusEl.innerText =
        perm === 'granted' ? (pref ? '✅ Activées' : '⏸ Désactivées (permission OK)') :
        perm === 'denied'  ? '🚫 Bloquées par le navigateur' :
                             '⏳ Permission non demandée';
    if (btnEl) {
        btnEl.innerText = perm === 'granted' ? (pref ? 'Désactiver' : 'Activer') : 'Demander la permission';
    }
    if (globalCb) globalCb.checked = pref;
}

// 4) Envoi effectif (préfère le SW, fallback Notification direct)
async function sendNativeNotification(title, body, opts = {}) {
    if (!isNativeNotificationsEnabled()) return false;
    if (!('Notification' in window)) return false;
    if (Notification.permission !== 'granted') return false;

    const options = {
        body,
        tag: opts.tag || 'patrimonial-alert',
        icon: opts.icon || 'data:image/svg+xml,...',
        data: { url: opts.url || './index.html', alertId: opts.alertId || null },
        requireInteraction: false
    };

    try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.showNotification) {
            await reg.showNotification(title, options);
            return true;
        }
    } catch (_) { /* fallback ci-dessous */ }

    try { new Notification(title, options); return true; }
    catch (_) { return false; }
}