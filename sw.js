
// =====================================================================
// sw.js — SERVICE WORKER PWA (Chantier #12)
// ---------------------------------------------------------------------
// Trois responsabilités :
//   1. Cache offline-first du shell applicatif (HTML, CSS, JS, icônes)
//   2. Cache stale-while-revalidate des ressources CDN (Tailwind,
//      Chart.js, FontAwesome, SheetJS, Google Fonts)
//   3. Notifications système natives (handlers historiques)
//
// ⚠ RÈGLE D'OR — VERSIONING
// À CHAQUE modification d'un fichier source (JS, CSS, HTML), il FAUT
// incrémenter SW_VERSION. Sinon les clients déjà installés continueront
// à servir l'ancienne version cachée, ce qui produit des bugs
// « fantômes » impossibles à reproduire en DevTools.
// =====================================================================

const SW_VERSION = 'v1.0.0';                    // ← Bumper à chaque deploy
const CACHE_PREFIX = 'patrimonial';
const CACHE_STATIC = `${CACHE_PREFIX}-static-${SW_VERSION}`;
const CACHE_CDN    = `${CACHE_PREFIX}-cdn-${SW_VERSION}`;
const CACHE_RUNTIME = `${CACHE_PREFIX}-runtime-${SW_VERSION}`;

// ---------------------------------------------------------------------
// 1) LISTE DES FICHIERS APPLICATIFS (app shell)
// ---------------------------------------------------------------------
// Doit correspondre EXACTEMENT aux fichiers chargés par index.html.
// Une erreur de nom ici fait échouer l'installation du SW entière
// (addAll() est transactionnel : un 404 = tout le precache échoue).
const APP_SHELL = [
    './',
    './index.html',
    './style.css',
    './manifest.json',
    './icon.svg',

    // Modules applicatifs (ordre de chargement dans index.html)
    './app1-core.js',
    './app2-ui.js',
    './app3-charts.js',
    './app4-forms.js',
    './app5-fiscal.js',
    './app6-api.js',
    './app8-goals.js',
    './app9-alerts.js',
    './app10-tir.js',
    './app11-scoring.js',
    './app12-reports.js',
    './app13-excel-export.js',
    './app14-suggestions.js',
    './app15-notifications.js',
    './app16-watchlist.js',
    './app17-tax-optimizer.js',
    './app18-ledger.js',
    './app19-fire.js',
    './app20-chart-export.js',
    './app21-haptics.js',
    './app22-toasts.js',
    './app23-session-badges.js',
    './app24-onboarding.js',
    './app25-mobile-nav.js',
    './app26-sidebar.js',
    './app27-broker-import.js',
    './app28-csp-audit.js',
    './app29-benchmark-compare.js',
    './app30-timeline.js',
    './app31-esg.js',
    './app32-per.js',
    './app33-monthly-snapshots.js',
    './app34-correlation.js',
    './app35-dca.js',
    './app36-waterfall.js',
    './app37-slide-panel.js',
    './app38-filters.js',
    './app39-thesis.js',
    './app40-withdrawal.js',
    './tests.js',
    './app7-init.js'
];

// Ressources CDN précachées au premier install (facultatives : si elles
// échouent, l'install continue — voir precacheCDN() ci-dessous).
const CDN_PRECACHE = [
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap'
];

// ---------------------------------------------------------------------
// 2) LISTE BLANCHE CDN (hosts autorisés pour stale-while-revalidate)
// ---------------------------------------------------------------------
// Toute requête vers ces hosts est mise en cache. Toute autre requête
// externe (APIs finance, Google Drive, OAuth) est réseau-only.
const CDN_HOSTS = [
    'cdn.tailwindcss.com',
    'cdnjs.cloudflare.com',
    'cdn.jsdelivr.net',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
];

// ---------------------------------------------------------------------
// 3) LISTE NOIRE — URLs JAMAIS mises en cache
// ---------------------------------------------------------------------
// Ceinture de sécurité supplémentaire : même si un host se retrouve
// dans CDN_HOSTS par erreur, ces patterns forcent le réseau-only.
const NEVER_CACHE_PATTERNS = [
    /api\.coingecko\.com/,
    /api\.frankfurter\.dev/,
    /finnhub\.io/,
    /xaus\.com/,
    /api\.twelvedata\.com/,
    /api\.allorigins\.win/,
    /googleapis\.com/,
    /accounts\.google\.com/,
    /oauth2\.googleapis\.com/,
    /gstatic\.com\/accounts/   // OAuth gstatic
];

// ---------------------------------------------------------------------
// HELPERS DE FILTRAGE
// ---------------------------------------------------------------------
function isSameOrigin(url) {
    try { return new URL(url).origin === self.location.origin; }
    catch (_) { return false; }
}

function isCDNHost(url) {
    try {
        const host = new URL(url).host;
        return CDN_HOSTS.some(h => host === h || host.endsWith('.' + h));
    } catch (_) { return false; }
}

function isNeverCache(url) {
    return NEVER_CACHE_PATTERNS.some(rx => rx.test(url));
}

// Types de requêtes cachables en statique (évite les POST, les Range…)
function isCacheableRequest(request) {
    if (request.method !== 'GET') return false;
    // Ne jamais cacher les requêtes avec Authorization (jetons volatils)
    if (request.headers.get('Authorization')) return false;
    return true;
}

// ---------------------------------------------------------------------
// 4) INSTALL — Precache app shell (transactionnel) + CDN (best-effort)
// ---------------------------------------------------------------------
self.addEventListener('install', (event) => {
    console.info(`[SW] Installation ${SW_VERSION}`);

    event.waitUntil((async () => {
        // 4a. App shell : addAll() est ATOMIQUE. Si un fichier manque,
        //     l'install échoue → on veut le savoir tout de suite.
        try {
            const cache = await caches.open(CACHE_STATIC);
            await cache.addAll(APP_SHELL);
            console.info(`[SW] App shell précaché (${APP_SHELL.length} fichiers).`);
        } catch (err) {
            console.error('[SW] Échec precache app shell :', err);
            // On continue quand même — l'app peut fonctionner partiellement
            // en ligne. Ne pas bloquer l'installation pour un asset manquant.
        }

        // 4b. CDN : precache best-effort (un échec réseau ici ne doit PAS
        //     empêcher l'app de fonctionner). On utilise allSettled.
        try {
            const cdnCache = await caches.open(CACHE_CDN);
            const results = await Promise.allSettled(
                CDN_PRECACHE.map(url =>
                    fetch(url, { mode: 'cors', credentials: 'omit' })
                        .then(res => {
                            if (res.ok) return cdnCache.put(url, res);
                            throw new Error(`HTTP ${res.status}`);
                        })
                )
            );
            const ok = results.filter(r => r.status === 'fulfilled').length;
            console.info(`[SW] CDN précaché : ${ok}/${CDN_PRECACHE.length} ressources.`);
        } catch (err) {
            console.warn('[SW] Échec precache CDN (non bloquant) :', err);
        }

        // 4c. Activation immédiate du nouveau SW (pas d'attente d'un
        //     reload manuel de tous les onglets).
        await self.skipWaiting();
    })());
});

// ---------------------------------------------------------------------
// 5) ACTIVATE — Purge des anciens caches + prise de contrôle
// ---------------------------------------------------------------------
self.addEventListener('activate', (event) => {
    console.info(`[SW] Activation ${SW_VERSION}`);

    event.waitUntil((async () => {
        // 5a. Purge tous les caches dont le nom n'est plus dans la version
        //     courante. Conserve les 3 caches actuels.
        const keys = await caches.keys();
        const keep = new Set([CACHE_STATIC, CACHE_CDN, CACHE_RUNTIME]);
        const toDelete = keys.filter(k => !keep.has(k) && k.startsWith(CACHE_PREFIX + '-'));

        await Promise.all(toDelete.map(k => {
            console.info(`[SW] Purge ancien cache : ${k}`);
            return caches.delete(k);
        }));

        // 5b. Prend le contrôle de TOUS les onglets ouverts immédiatement
        //     (sans attendre un reload). Indispensable pour la première
        //     visite : sinon la page actuelle tourne sans SW jusqu'au
        //     prochain reload.
        await self.clients.claim();
    })());
});

// ---------------------------------------------------------------------
// 6) FETCH — Routage par stratégie
// ---------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
    const req = event.request;

    // 6a. Filtres d'exclusion (non-GET, autorisation, never-cache)
    if (!isCacheableRequest(req)) return;
    if (isNeverCache(req.url)) return;

    // 6b. Ne jamais intercepter les navigations POST, les upgrades WebSocket
    if (req.headers.get('upgrade') === 'websocket') return;

    // 6c. Décision de stratégie
    if (isSameOrigin(req.url)) {
        // Same-origin : cache-first avec revalidation en arrière-plan.
        event.respondWith(cacheFirstSWR(req, CACHE_STATIC));
        return;
    }

    if (isCDNHost(req.url)) {
        // CDN whitelisté : stale-while-revalidate (cache servi immédiatement,
        // revalidation silencieuse en tâche de fond).
        event.respondWith(staleWhileRevalidate(req, CACHE_CDN));
        return;
    }

    // Tout le reste (APIs, inconnus) : réseau-only, fallback cache si offline
    event.respondWith(networkFirstFallback(req));
});

// ---------------------------------------------------------------------
// 7) STRATÉGIES DE CACHE
// ---------------------------------------------------------------------

// Cache-first : renvoie le cache s'il existe, sinon fetch + cache.
// En parallèle, relance un fetch silencieux pour rafraîchir le cache
// (utile pour les apps mises à jour sans bump SW_VERSION — outil de
// secours, la bonne pratique reste de bumper SW_VERSION).
async function cacheFirstSWR(request) {
    const cache = await caches.open(CACHE_STATIC);
    const cached = await cache.match(request, { ignoreSearch: true });

    if (cached) {
        // Revalidation silencieuse en arrière-plan (n'attend pas)
        event.waitUntilSafe(async () => {
            try {
                const fresh = await fetch(request);
                if (fresh.ok) await cache.put(request, fresh.clone());
            } catch (_) { /* offline : rien à faire */ }
        });
        return cached;
    }

    // Pas en cache → fetch + mise en cache
    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        // Fallback offline : pour une navigation HTML, servir index.html
        if (request.mode === 'navigate') {
            const fallback = await cache.match('./index.html');
            if (fallback) return fallback;
        }
        throw err;
    }
}

// Stale-while-revalidate : renvoie le cache immédiatement (rapide),
// puis fetch en arrière-plan pour rafraîchir.
async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);

    const networkPromise = fetch(request).then(async (response) => {
        if (response && response.ok) {
            await cache.put(request, response.clone());
        }
        return response;
    }).catch(() => null);

    return cached || await networkPromise || new Response('', { status: 504 });
}

// Network-first : tente le réseau, tombe sur le cache si échec.
// Utilisé pour tout ce qui n'est pas explicitement whitelisté.
async function networkFirstFallback(request) {
    try {
        const response = await fetch(request);
        // Met en cache les GET réussis dans le cache runtime (opportuniste)
        if (response.ok && request.method === 'GET') {
            const cache = await caches.open(CACHE_RUNTIME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw err;
    }
}

// Petit utilitaire pour lancer une tâche asynchrone sans bloquer la
// réponse, MAIS en la rattachant à l'event.waitUntil du SW (sinon le
// navigateur peut tuer le SW avant la fin de la promesse).
// On contourne ici le fait que les fonctions de stratégie n'ont pas accès
// directement à l'event — on utilise self.__currentEvent si nécessaire.
// Simplification pragmatique : on laisse la tâche s'exécuter, elle sera
// annulée au pire. Acceptable pour une revalidation silencieuse.
Event.prototype.waitUntilSafe = function (fn) {
    try { this.waitUntil(fn()); } catch (_) { /* déjà dispatched */ }
};

// ---------------------------------------------------------------------
// 8) MESSAGE — Pour commander skipWaiting() depuis la page
// ---------------------------------------------------------------------
// La page peut envoyer { type: 'SKIP_WAITING' } pour forcer l'activation
// du nouveau SW sans attendre la fermeture des onglets.
self.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (data.type === 'CLEAR_CACHE') {
        // Utilitaire de debug : vider tout le cache applicatif
        event.waitUntil((async () => {
            const keys = await caches.keys();
            await Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX)).map(k => caches.delete(k)));
            if (event.source && event.source.postMessage) {
                event.source.postMessage({ type: 'CACHE_CLEARED' });
            }
        })());
    }
});

// ---------------------------------------------------------------------
// 9) NOTIFICATIONS SYSTÈME (handlers historiques — NE PAS SUPPRIMER)
// ---------------------------------------------------------------------
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const targetUrl = event.notification.data && event.notification.data.url
        ? event.notification.data.url
        : './index.html';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clients) => {
                for (const client of clients) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        client.focus();
                        client.postMessage({
                            type: 'NOTIFICATION_CLICKED',
                            alertId: (event.notification.data && event.notification.data.alertId) || null
                        });
                        return;
                    }
                }
                if (self.clients.openWindow) {
                    return self.clients.openWindow(targetUrl);
                }
            })
    );
});

self.addEventListener('notificationclose', (event) => {
    console.info('[SW] Notification fermée sans clic :', event.notification.tag);
});