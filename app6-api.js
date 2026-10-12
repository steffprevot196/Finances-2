// =====================================================================
// app6-api.js — API EXTERNES (CoinGecko, Frankfurter), IndexedDB,
//               sauvegardes locales, Google Drive chiffré, refreshAllUI
// Dépend de : app1-core.js, app2-ui.js, app3-charts.js, app4-forms.js, app5-fiscal.js
// =====================================================================

// ---------------------------------------------------------------------
// IndexedDB pour le cache d'historique de prix réel
// ---------------------------------------------------------------------
// Version UNIFIÉE pour la DB partagée par tous les stores (prix, FX, appData).
// Toute ouverture doit utiliser cette constante pour éviter les VersionError.
const PRICE_DB_NAME  = 'patriMonialPriceHistory';
const PRICE_DB_VERSION = 3;
const PRICE_DB_STORE = 'series';

// Ouvre la DB unifiée en s'assurant que TOUS les stores existent,
// quel que soit l'appelant. Idempotent : peut être appelé en parallèle
// sans risque de conflit de version.
function openPriceDB() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) { reject(new Error('IndexedDB indisponible dans ce navigateur.')); return; }
        const req = indexedDB.open(PRICE_DB_NAME, PRICE_DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(PRICE_DB_STORE))    db.createObjectStore(PRICE_DB_STORE);
            if (!db.objectStoreNames.contains('fxRates'))         db.createObjectStore('fxRates');
            if (!db.objectStoreNames.contains('appData'))         db.createObjectStore('appData');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    });
}

async function priceDBGet(key) {
    const db = await openPriceDB();
    return new Promise((resolve, reject) => {
        const req = db.transaction(PRICE_DB_STORE, 'readonly').objectStore(PRICE_DB_STORE).get(key);
        req.onsuccess = () => { db.close(); resolve(req.result || null); };
        req.onerror   = () => { db.close(); reject(req.error); };
    });
}

async function priceDBSet(key, value) {
    const db = await openPriceDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PRICE_DB_STORE, 'readwrite');
        tx.objectStore(PRICE_DB_STORE).put(value, key);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror    = () => { db.close(); reject(tx.error); };
        tx.onabort    = () => { db.close(); reject(tx.error || new Error('Transaction aborted')); };
    });
}

// ---------------------------------------------------------------------
// Récupération d'historique (1 an) — CoinGecko + Frankfurter
// ---------------------------------------------------------------------
async function fetchCoinGeckoHistory(coingeckoId, days = 365) {
    const res = await fetch(`https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart?vs_currency=eur&days=${days}&interval=daily`);
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const data = await res.json();
    return (data.prices || []).map(([ts, price]) => ({ date: ts, price }));
}

// ---------------------------------------------------------------------
// Twelve Data — API moderne avec CORS natif (pas de proxy, rapide, fiable)
// Couvre toutes les places mondiales avec les mêmes suffixes que Yahoo :
//   FLXC.DE (Francfort/Xetra), CEMA.L (Londres), STN.PA (Paris), QDVF.MU (Munich)
// Plan Basic gratuit : 800 requêtes/jour, 8 requêtes/minute.
// ---------------------------------------------------------------------
async function fetchTwelveDataQuote(symbol) {
    if (!twelveDataApiKey) return null;
    try {
        const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(twelveDataApiKey)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.status === 'error' || data.code) {
            throw new Error(data.message || `Code ${data.code}`);
        }
        const price = parseFloat(data.close ?? data.previous_close);
        return Number.isFinite(price) && price > 0 ? price : null;
    } catch (err) {
        console.warn(`TwelveData quote failed for ${symbol}:`, err);
        throw err; // propagé pour affichage détaillé
    }
}

async function fetchTwelveDataHistory(symbol, days = 365) {
    if (!twelveDataApiKey) throw new Error('Clé Twelve Data manquante');
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=${days}&apikey=${encodeURIComponent(twelveDataApiKey)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.status === 'error' || data.code) {
        throw new Error(data.message || `Code ${data.code}`);
    }
    if (!Array.isArray(data.values)) throw new Error('Format de réponse inattendu');
    return data.values
        .map(v => ({ date: new Date(v.datetime).getTime(), price: parseFloat(v.close) }))
        .filter(p => Number.isFinite(p.date) && Number.isFinite(p.price) && p.price > 0)
        .sort((a, b) => a.date - b.date);
}

function saveTwelveDataKey() {
    twelveDataApiKey = document.getElementById('twelve-key-input').value.trim();
    // ── SECURITY ── Session-only : pas de persistance dans localStorage.
    const el = document.getElementById('twelve-status');
    if (el) el.innerText = twelveDataApiKey
        ? '✅ Clé enregistrée (mémoire de session)'
        : '⚠️ Aucune clé';
}

// ---------------------------------------------------------------------
// Yahoo Finance via proxy CORS public — fallback multi-fournisseur
// ---------------------------------------------------------------------
// L'API Yahoo Finance ne renvoie pas d'en-tête CORS, il faut donc passer
// par un proxy. On utilise une liste ordonnée : si le premier échoue
// (timeout, 5xx, blocage réseau), on essaie le suivant.
const YAHOO_PROXIES = [
    { name: 'allorigins.win', prefix: 'https://api.allorigins.win/raw?url=' },
    { name: 'corsproxy.io',   prefix: 'https://corsproxy.io/?url=' }
];

function yahooChartUrl(symbol, range) {
    return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
}

// Tente une URL sur tous les proxies disponibles en cascade.
// Retourne la réponse JSON parsée ou null si tout échoue.
async function _fetchViaProxy(url, timeoutMs = 5000) {
    for (const proxy of YAHOO_PROXIES) {
        const proxiedUrl = proxy.prefix + encodeURIComponent(url);
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            const res = await fetch(proxiedUrl, { signal: controller.signal });
            clearTimeout(timer);

            if (!res.ok) {
                console.warn(`[Yahoo] ${proxy.name} → HTTP ${res.status}`);
                continue;
            }
            return await res.json();
        } catch (err) {
            console.warn(`[Yahoo] ${proxy.name} échoué (${err.message})`);
            // continue vers le proxy suivant
        }
    }
    return null;
}

// Prix de marché actuel (quote simple)
//
// ⚠ GESTION DES SYMBOLES UK (.L) :
//   Yahoo Finance retourne les prix LSE en PENCE (GBp) et non en livres.
//   On divise donc par 100 si le symbole se termine par .L et que le prix
//   est supérieur à 100 (un prix normal en livres est < 100 ; une valeur
//   > 100 signale un prix en pence).
//
// ⚠ FALLBACK DE TICKERS ALTERNATIFS :
//   Certains ETF/ETC ont plusieurs symboles selon la bourse ou le
//   fournisseur de données. On teste une courte liste de variantes
//   en cascade si le symbole principal échoue.
const YAHOO_TICKER_FALLBACKS = {
    // --- Or / Argent physique ---
    'IGLN.L':  ['SGLN.L', 'IGLN.AS', 'PPFD.AS'],
    'ISLN.L':  ['SSLN.L', 'ISLN.AS'],
    'SGLN.L':  ['IGLN.L'],
    'IGLN.AS': ['IGLN.L'],
    'SGLN.AS': ['SGLN.L'],

    // --- ETF MSCI EM Asia (iShares) ---
    // CEMA.L est listé à Londres ; ses équivalents sont à Amsterdam et sur Xetra.
    'CEMA.L':  ['CEMA.AS', 'CEMAU.L', 'CEMA.DE', 'IEMA.L', 'IEMA.AS'],
    'CEMA.AS': ['CEMA.L'],
    'IEMA.L':  ['IEMA.AS', 'CEMA.L'],

    // --- ETF HSBC MSCI AC Far East ---
    'HMAF.L':  ['HMAF.AS', 'HMAF.DE'],

    // --- ETF MSCI World (Xtrackers) ---
    'XDW0.L':  ['XDW0.DE', 'XDW0.MI', 'XDWD.DE'],

    // --- ETF S&P 500 Energy (iShares) ---
    // QDVF.MU est listé à Munich ; Yahoo ne le couvre pas bien.
    // On tente les places principales (Xetra, Francfort, Milan, Londres, Amsterdam).
    'QDVF.MU': ['QDVF.DE', 'QDVF.F', 'QDVF.MI', 'IS0D.DE', 'I5E3.DE', 'IUES.L', 'IUES.AS'],
    'QDVF.DE': ['QDVF.MU', 'QDVF.F'],
    'QDVF.F':  ['QDVF.DE', 'QDVF.MU'],

    // --- ETF S&P 500 Energy (Amundi/BnP alternatives) ---
    'IUES.L':  ['IUES.AS', 'QDVF.DE'],
    'IUES.AS': ['IUES.L']
};

async function fetchYahooQuote(symbol) {
    // 1) Test du symbole principal
    let price = await _fetchYahooQuoteRaw(symbol);
    if (price !== null) return price;

    // 2) Test des symboles alternatifs connus
    const fallbacks = YAHOO_TICKER_FALLBACKS[symbol] || [];
    for (const alt of fallbacks) {
        price = await _fetchYahooQuoteRaw(alt);
        if (price !== null) {
            console.info(`[Yahoo] ${symbol} → fallback ${alt} utilisé (prix ${price})`);
            return price;
        }
    }
    return null;
}

// Extraction bas niveau du prix, avec correction pence→livres pour les .L.
//
// ⚠️ Retourne null en cas de 404 SILENCIEUX (ticker inexistant chez Yahoo)
//    pour que la boucle de fallback continue à essayer les autres symboles.
//    Le 404 est un cas normal : certains ETF listés à Munich (QDVF.MU) ou
//    à Londres (CEMA.L) ne sont tout simplement pas couverts par Yahoo.
async function _fetchYahooQuoteRaw(symbol) {
    try {
        const data = await _fetchViaProxy(yahooChartUrl(symbol, '1d'));
        if (!data) return null;

        // Yahoo renvoie ceci pour un ticker inconnu :
        //   { chart: { error: { code: 'Not Found', description: 'No data found, symbol may be delisted' } } }
        const chartError = data?.chart?.error;
        if (chartError) {
            // Log informatif (pas d'alerte, c'est un cas normal pour les
            // tickers exotiques type Munich)
            console.info(`[Yahoo] Ticker ${symbol} non reconnu : ${chartError.description || chartError.code}`);
            return null;
        }

        const meta = data?.chart?.result?.[0]?.meta;
        let p = meta?.regularMarketPrice;
        if (!Number.isFinite(p) || p <= 0) return null;

        // Correction pence → livres pour les symboles LSE
        if (/\.L$/i.test(symbol) && p > 100) {
            p = p / 100;
        }
        return p;
    } catch (err) {
        // Erreur réseau (timeout, CORS, etc.) : on laisse remonter pour
        // que la boucle principale puisse tenter un autre proxy ou un autre
        // symbole. Le 404 silencieux ci-dessus est déjà géré par le retour null.
        throw err;
    }
}

// Historique de prix (1 an par défaut) sous le même format que les autres sources
async function fetchYahooHistory(symbol, days = 365) {
    const range = days <= 30 ? '1mo' : days <= 90 ? '3mo' : days <= 180 ? '6mo' : days <= 365 ? '1y' : '2y';
    const data = await _fetchViaProxy(yahooChartUrl(symbol, range), 12000);
    if (!data) throw new Error('Yahoo indisponible (tous proxies en échec)');
    const result = data?.chart?.result?.[0];
    if (!result?.timestamp || !result?.indicators?.quote?.[0]?.close) return [];
    const closes = result.indicators.quote[0].close;
    return result.timestamp
        .map((ts, i) => ({ date: ts * 1000, price: closes[i] }))
        .filter(p => Number.isFinite(p.price) && p.price > 0);
}

async function fetchFrankfurterHistory(currency, days = 365) {
    const end = new Date();
    const start = new Date(Date.now() - days * 864e5);
    const fmt = d => d.toISOString().slice(0, 10);
    const res = await fetch(`https://api.frankfurter.dev/v1/${fmt(start)}..${fmt(end)}?base=EUR&symbols=${currency}`);
    if (!res.ok) throw new Error(`Frankfurter HTTP ${res.status}`);
    const data = await res.json();
    return Object.entries(data.rates || {})
        .map(([date, rates]) => ({ date: new Date(date).getTime(), price: 1 / rates[currency] }))
        .sort((a, b) => a.date - b.date);
}

// =====================================================================
// MULTI-DEVISES — Service de taux de change EUR (Chantier 1.2)
// ---------------------------------------------------------------------
// Fournit :
//   • getFxRateToEUR(currency, dateISO)  → taux EUR/devise à une date
//   • getCurrentFxRateToEUR(currency)    → taux du jour (ou dernier dispo)
//   • convertToEUR(amount, currency, dateISO) → conversion
//   • buildCurrencyExposure(list)        → agrégat pour KPI "Exposition devise"
//
// Sources et stratégie :
//   1. Cache mémoire (fxRateCache) → instantané si déjà calculé
//   2. IndexedDB (store dédié 'fxRates') → persistant entre sessions
//   3. API Frankfurter (BCE) → taux officiels quotidiens
//   4. Fallback statique (dernière valeur connue en dur) → garantit un résultat
//      même hors-ligne, avec un avertissement explicite dans la console.
//
// ⚠️ Convention : on stocke / retourne TOUJOURS le taux dans le sens
// "combien d'EUR vaut 1 unité de la devise cible".
//   EUR→EUR = 1.0
//   USD→EUR = ~0.92 (1 USD vaut ~0,92 €)
//   JPY→EUR = ~0.0062 (1 JPY vaut ~0,0062 €)
// =====================================================================

const FX_SUPPORTED = ['EUR', 'USD', 'GBP', 'CHF', 'JPY'];

// Fallback statique (valeurs indicatives 2024-2025, jamais parfaites mais
// toujours disponibles même si les APIs sont bloquées).
const FX_FALLBACK = {
    EUR: 1.0,
    USD: 0.92,
    GBP: 1.18,
    CHF: 1.05,
    JPY: 0.0062
};

// =====================================================================
// BENCHMARK RÉEL — CW8.PA (Amundi MSCI World, Chantier 1.6)
// ---------------------------------------------------------------------
// Remplace l'hypothèse de corrélation 0.7 par un vrai calcul apparié :
//   • Bêta / R² / Alpha / Tracking Error / Ratio d'Information / Treynor
//     calculés sur les mêmes dates que le portefeuille.
// Sources (cascade) :
//   1. Twelve Data si clé API configurée (source principale, CORS natif)
//   2. Yahoo Finance via proxy CORS (fallback universel)
//   3. Fallback statique : rendements annuels MSCI World 2014-2024
//      déjà définis dans MSCI_WORLD_ANNUAL_RETURNS_EUR (app1-core.js)
//
// La série est persistée dans IndexedDB (store PRICE_DB_STORE, clé
// 'BENCHMARK_CW8') pour éviter de retélécharger à chaque session.
// =====================================================================

// Symboles essayés en cascade pour le benchmark (CW8.PA est le plus
// représentatif pour un investisseur français — éligible PEA).
const BENCHMARK_SYMBOLS = ['CW8.PA', 'EWLD.PA', 'CW8', 'URTH', 'IWDA.AS'];
const BENCHMARK_STORAGE_KEY = 'BENCHMARK_CW8';

// Cache mémoire de la série benchmark : tableau [{ date, price }]
let benchmarkSeriesCache = null;
let benchmarkMetaCache = null;  // { symbol, updatedAt, source }

// Récupère la série benchmark depuis IndexedDB (ou null si absente).
async function loadBenchmarkFromDB() {
    if (benchmarkSeriesCache) return benchmarkSeriesCache;
    try {
        const stored = await priceDBGet(BENCHMARK_STORAGE_KEY);
        if (stored && Array.isArray(stored.series) && stored.series.length >= 30) {
            benchmarkSeriesCache = stored.series;
            benchmarkMetaCache = {
                symbol: stored.symbol || '—',
                updatedAt: stored.updatedAt || 0,
                source: stored.source || 'cache'
            };
            return benchmarkSeriesCache;
        }
    } catch (_) {}
    return null;
}

// Télécharge la série benchmark via Twelve Data puis Yahoo (cascade).
// Renvoie { series, symbol, source } ou throw si toutes les sources échouent.
async function fetchBenchmarkSeries() {
    const errors = [];

    // 1) Twelve Data (si configuré)
    if (twelveDataApiKey) {
        for (const sym of BENCHMARK_SYMBOLS) {
            try {
                const series = await fetchTwelveDataHistory(sym, 730);
                if (Array.isArray(series) && series.length >= 60) {
                    return { series, symbol: sym, source: 'Twelve Data' };
                }
            } catch (err) {
                errors.push(`${sym} (12D: ${err.message})`);
            }
        }
    }

    // 2) Yahoo via proxy CORS
    for (const sym of BENCHMARK_SYMBOLS) {
        try {
            const series = await fetchYahooHistory(sym, 730);
            if (Array.isArray(series) && series.length >= 60) {
                return { series, symbol: sym, source: 'Yahoo' };
            }
        } catch (err) {
            errors.push(`${sym} (Yahoo: ${err.message})`);
        }
    }

    throw new Error('Aucune source benchmark disponible. Détails : ' + errors.join(' | '));
}

// Rafraîchit la série benchmark (fetch + persistance IndexedDB + cache mémoire).
// opts.force = true → refetch même si un cache < 24h existe.
async function refreshBenchmarkSeries(opts = {}) {
    const force = !!opts.force;

    // Vérifie la fraîcheur du cache DB
    if (!force) {
        const existing = await loadBenchmarkFromDB();
        if (existing && benchmarkMetaCache && benchmarkMetaCache.updatedAt) {
            const ageMs = Date.now() - benchmarkMetaCache.updatedAt;
            if (ageMs < 24 * 3600 * 1000) {
                return { refreshed: false, series: existing, meta: benchmarkMetaCache };
            }
        }
    }

    const { series, symbol, source } = await fetchBenchmarkSeries();

    // Persiste
    try {
        await priceDBSet(BENCHMARK_STORAGE_KEY, {
            updatedAt: Date.now(),
            symbol, source, series
        });
    } catch (_) { /* silencieux : le cache mémoire suffit pour la session */ }

    benchmarkSeriesCache = series;
    benchmarkMetaCache = { symbol, source, updatedAt: Date.now() };

    return { refreshed: true, series, meta: benchmarkMetaCache };
}

// Helpers : renvoie la série en cache (mémoire → DB), ou null.
async function getBenchmarkSeries() {
    if (benchmarkSeriesCache) return benchmarkSeriesCache;
    return await loadBenchmarkFromDB();
}

// Indique si un benchmark réel est disponible (sans fetch).
function hasBenchmarkAvailable() {
    return !!(benchmarkSeriesCache && benchmarkSeriesCache.length >= 60);
}

// Cache mémoire : clé = 'USD_2024-03-15' ou 'USD_latest', valeur = taux
const fxRateCache = new Map();

function _fxCacheKey(currency, dateISO) {
    return currency + '_' + (dateISO || 'latest');
}

// Ouvre (et crée si besoin) le store IndexedDB pour les taux de change.
// On utilise le même nom de DB que les séries de prix, mais un store dédié.
const FX_DB_STORE = 'fxRates';

// Délègue à openPriceDB (DB partagée). Alias conservé pour compat.
function openFxDB() {
    return openPriceDB();
}

async function fxDBGet(key) {
    try {
        const db = await openFxDB();
        return await new Promise((resolve, reject) => {
            const req = db.transaction(FX_DB_STORE, 'readonly').objectStore(FX_DB_STORE).get(key);
            req.onsuccess = () => { db.close(); resolve(req.result || null); };
            req.onerror   = () => { db.close(); reject(req.error); };
        });
    } catch (_) { return null; }
}

async function fxDBSet(key, value) {
    try {
        const db = await openFxDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(FX_DB_STORE, 'readwrite');
            tx.objectStore(FX_DB_STORE).put(value, key);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror    = () => { db.close(); reject(tx.error); };
        });
    } catch (_) { /* silencieux : le cache mémoire prendra le relais */ }
}

// Récupère l'historique complet des taux EUR→devise sur 2 ans (1 seul appel
// API pour tout l'historique, puis on pioche dedans par date).
// Retourne un objet { 'YYYY-MM-DD': rate_eur_par_devise }.
async function _fetchFxHistory(currency, days = 730) {
    const end = new Date();
    const start = new Date(Date.now() - days * 864e5);
    const fmt = d => d.toISOString().slice(0, 10);
    const res = await fetch(`https://api.frankfurter.dev/v1/${fmt(start)}..${fmt(end)}?base=EUR&symbols=${currency}`);
    if (!res.ok) throw new Error(`Frankfurter HTTP ${res.status}`);
    const data = await res.json();
    // L'API renvoie { '2024-03-15': { USD: 1.087 }, ... } : 1 EUR = 1.087 USD
    // On veut le taux inverse : combien d'EUR vaut 1 USD → 1 / 1.087
    const map = {};
    Object.entries(data.rates || {}).forEach(([date, rates]) => {
        if (rates[currency] > 0) map[date] = 1 / rates[currency];
    });
    return map;
}

// Trouve la date la plus proche dans un map { 'YYYY-MM-DD': rate } pour une
// date cible (tolérance max : 7 jours en arrière, puis on abandonne).
function _pickClosestRate(ratesMap, targetDateISO) {
    if (!targetDateISO) return null;
    const keys = Object.keys(ratesMap).sort();
    if (!keys.length) return null;

    const target = new Date(targetDateISO).getTime();
    if (isNaN(target)) return null;

    let best = null, bestDelta = Infinity;
    for (const k of keys) {
        const t = new Date(k).getTime();
        if (t > target) break;  // pas de taux "futur"
        const delta = target - t;
        if (delta < bestDelta) { bestDelta = delta; best = k; }
    }
    if (best && bestDelta <= 7 * 864e5) return { date: best, rate: ratesMap[best] };
    return null;
}

// API PUBLIQUE — récupère le taux EUR/devise à une date donnée.
//   • currency : 'USD', 'GBP', 'CHF', 'JPY', 'EUR'…
//   • dateISO  : 'YYYY-MM-DD' (optionnel ; si absent → taux du jour)
//   • opts.allowFetch : si false, n'appelle PAS l'API (mode rapide/sync).
// Retourne un nombre (ex: 0.92 pour USD→EUR) ou null si inconnu.
async function getFxRateToEUR(currency, dateISO, opts = {}) {
    const cur = String(currency || 'EUR').toUpperCase();
    if (cur === 'EUR') return 1.0;
    if (!FX_SUPPORTED.includes(cur)) {
        console.warn(`[FX] Devise non supportée : ${cur}. Retour au fallback 1.0.`);
        return FX_FALLBACK[cur] || null;
    }

    const cacheKey = _fxCacheKey(cur, dateISO);
    if (fxRateCache.has(cacheKey)) return fxRateCache.get(cacheKey);

    // Historique complet mis en cache dans IndexedDB (clé 'history_<devise>')
    const historyKey = 'history_' + cur;
    let history = await fxDBGet(historyKey);

    // Si l'historique est absent ou date de plus de 24h → refetch (sauf si allowFetch=false)
    const isStale = !history || !history.updatedAt || (Date.now() - history.updatedAt > 24 * 3600 * 1000);
    if (isStale && opts.allowFetch !== false) {
        try {
            const ratesMap = await _fetchFxHistory(cur);
            history = { updatedAt: Date.now(), rates: ratesMap };
            await fxDBSet(historyKey, history);
        } catch (err) {
            console.warn(`[FX] Échec fetch historique ${cur} :`, err.message);
            // On garde l'ancien cache s'il existe
            if (!history || !history.rates) {
                const fb = FX_FALLBACK[cur] || null;
                if (fb !== null) fxRateCache.set(cacheKey, fb);
                return fb;
            }
        }
    }

    if (!history || !history.rates) {
        const fb = FX_FALLBACK[cur] || null;
        if (fb !== null) fxRateCache.set(cacheKey, fb);
        return fb;
    }

    // Cherche la date la plus proche (ou "dernier taux connu" si dateISO absent)
    let rate = null;
    if (dateISO) {
        const found = _pickClosestRate(history.rates, dateISO);
        if (found) rate = found.rate;
    } else {
        // Dernier taux connu
        const keys = Object.keys(history.rates).sort();
        if (keys.length) rate = history.rates[keys[keys.length - 1]];
    }

    if (rate === null) rate = FX_FALLBACK[cur] || null;

    if (rate !== null) fxRateCache.set(cacheKey, rate);
    return rate;
}

// Wrapper synchrone : retourne le taux du jour depuis le cache si présent,
// sinon le fallback statique. Utile pour les fonctions non-async.
function getFxRateSync(currency) {
    const cur = String(currency || 'EUR').toUpperCase();
    if (cur === 'EUR') return 1.0;
    const cacheKey = _fxCacheKey(cur, 'latest');
    if (fxRateCache.has(cacheKey)) return fxRateCache.get(cacheKey);
    // Tente 'latest' sans date
    const k2 = _fxCacheKey(cur, undefined);
    if (fxRateCache.has(k2)) return fxRateCache.get(k2);
    return FX_FALLBACK[cur] || 1.0;
}

// Convertit un montant en devise native vers EUR, à une date donnée.
async function convertToEUR(amount, currency, dateISO) {
    const rate = await getFxRateToEUR(currency, dateISO);
    if (rate === null) return null;
    return amount * rate;
}

// Précharge les taux des devises utilisées par le portefeuille (appelé au boot
// ou après un import). Non bloquant.
async function preloadUsedCurrencies() {
    const currencies = new Set();
    assets.forEach(a => {
        if (a.currency && a.currency !== 'EUR') currencies.add(a.currency);
    });
    if (!currencies.size) return;
    const today = new Date().toISOString().slice(0, 10);
    await Promise.all([...currencies].map(c =>
        getFxRateToEUR(c, today).catch(() => null)
    ));
}

// =====================================================================
// EXPOSITION DEVISE — agrégation pour KPI
// =====================================================================
// Renvoie un tableau trié par valeur EUR décroissante :
//   [{ currency, valueEUR, pct, count, assetIds }]
function buildCurrencyExposure(list) {
    const src = (list || assets).filter(a => !isPaperAsset(a));
    const total = src.reduce((s, a) => s + (a.value || 0), 0);
    if (total <= 0) return [];

    const byCur = {};
    src.forEach(a => {
        const cur = (a.currency || 'EUR').toUpperCase();
        if (!byCur[cur]) byCur[cur] = { currency: cur, valueEUR: 0, count: 0, assetIds: [] };
        byCur[cur].valueEUR += a.value || 0;
        byCur[cur].count    += 1;
        byCur[cur].assetIds.push(a.id);
    });
    return Object.values(byCur)
        .map(g => ({ ...g, pct: (g.valueEUR / total) * 100 }))
        .sort((a, b) => b.valueEUR - a.valueEUR);
}

// Bouton "Historique de prix" : télécharge l'historique réel (1 an) pour
// toutes les cryptos et devises reconnues du portefeuille.
async function refreshRealPriceHistory() {
    if (_priceFetchInProgress) {
        if (typeof toastWarning === 'function') {
            toastWarning('Actualisation déjà en cours', 'Patientez la fin de l\'opération précédente.');
        } else {
            alert('Une actualisation est déjà en cours. Patientez.');
        }
        return;
    }
    _priceFetchInProgress = true;

    const btn  = document.getElementById('btn-refresh-history');
    const icon = document.getElementById('icon-refresh-history');
    if (icon) icon.classList.add('fa-spin');
    if (btn) btn.disabled = true;

    // Skeleton immédiat sur l'inventaire + la table crypto (feedback visuel)
    showSkeletonFor('#table-inventory-body', 6, 13);
    showSkeletonFor('#table-crypto-body', 3, 7);

    let done = 0;
    const failed = [];

    const cryptoTickers = [...new Set(
        assets.filter(a => hasTag(a, 'Crypto') && CRYPTO_COINGECKO_IDS[a.ticker.toUpperCase()])
              .map(a => a.ticker.toUpperCase())
    )];

    // Parallélisation 2 workers + retry + pause 1,5 s entre appels
    // (CoinGecko free tier : 10-30 req/min → les gros portefeuilles
    //  déclenchaient des 429 en série avec le loop séquentiel nu).
    const cryptoQueue = cryptoTickers.slice();
    const cryptoWorkers = Array.from({ length: Math.min(2, cryptoQueue.length) }, async () => {
        while (cryptoQueue.length) {
            const ticker = cryptoQueue.shift();
            try {
                const series = await _fetchWithRetry(
                    `https://api.coingecko.com/api/v3/coins/${CRYPTO_COINGECKO_IDS[ticker]}/market_chart?vs_currency=eur&days=365&interval=daily`,
                    {},
                    4
                ).then(r => r.json())
                 .then(d => (d.prices || []).map(([ts, price]) => ({ date: ts, price })));

                if (series.length < 30) throw new Error(`données insuffisantes (${series.length} points)`);
                await priceDBSet('CRYPTO_' + ticker, { updatedAt: Date.now(), series });
                done++;
            } catch (err) {
                failed.push(ticker + ' (' + err.message + ')');
            }
            if (cryptoQueue.length) await new Promise(r => setTimeout(r, 1500));
        }
    });
    await Promise.all(cryptoWorkers);

    const currencyTickers = [...new Set(
        assets.filter(a => hasTag(a, 'Devises/Liquidités') && CASH_CURRENCY_TICKERS.includes(a.ticker.toUpperCase()))
              .map(a => a.ticker.toUpperCase())
    )];
    for (const ticker of currencyTickers) {
        try {
            const series = await fetchFrankfurterHistory(ticker);
            await priceDBSet('CUR_' + ticker, { updatedAt: Date.now(), series });
            done++;
        } catch (err) { failed.push(ticker + ' (' + err.message + ')'); }
    }

    // --- Actions / ETF via Twelve Data (fallback Yahoo si non configuré) ---
    const equityAssets = assets.filter(a =>
        (hasTag(a, 'Action') || hasTag(a, 'ETF')) && !hasTag(a, 'Crypto')
    );
    
        const showToast = equityAssets.length > 1;
        if (showToast) {
            showProgressToast(
                'Téléchargement de l\'historique…',
                `0 / ${equityAssets.length} · démarrage`,
                0
            );
        }
    
        let processed = 0;
        for (const a of equityAssets) {
            processed++;
            const symbol = a.yahooTicker || a.ticker;
            if (!symbol) continue;
            const key = 'EQUITY_' + symbol.toUpperCase();
    
            if (showToast) {
                updateProgressToast(
                    `${processed} / ${equityAssets.length} · ${symbol}`,
                    (processed - 1) / equityAssets.length * 100
                );
            }
    
            try {
                let series;
                if (twelveDataApiKey) {
                    series = await fetchTwelveDataHistory(symbol);
                } else {
                    series = await fetchYahooHistory(symbol);
                }
                if (series.length < 30) {
                    failed.push(`${symbol} (données insuffisantes : ${series.length} points)`);
                    continue;
                }
                await priceDBSet(key, { updatedAt: Date.now(), series });
                done++;
            } catch (err) { failed.push(`${symbol} (${err.message})`); }
    
            if (processed < equityAssets.length) {
                if (showToast) {
                    updateProgressToast(
                        `${processed} / ${equityAssets.length} · pause API (8 s)…`,
                        processed / equityAssets.length * 100
                    );
                }
                await new Promise(r => setTimeout(r, twelveDataApiKey ? 8000 : 200));
            }
        }
    
        if (icon) icon.classList.remove('fa-spin');
        if (btn) btn.disabled = false;
        hideProgressToast(400);

    if (done === 0 && failed.length === 0) {
        if (typeof toastInfo === 'function') {
            toastInfo('Aucun actif éligible', 'Ajoutez des cryptos, devises ou actions/ETF avec ticker Yahoo.');
        }
    } else if (done === 0 && failed.length > 0) {
        if (typeof toastError === 'function') {
            toastError(
                `Historique : ${failed.length} échec(s)`,
                failed.slice(0, 3).join(' · ') + (failed.length > 3 ? ' …' : ''),
                { duration: 9000 }
            );
        }
        console.warn('[History] Échecs :\n' + failed.join('\n'));
    } else if (failed.length > 0) {
        if (typeof toastWarning === 'function') {
            toastWarning(
                `Historique partiel : ${done} OK, ${failed.length} échec(s)`,
                failed.slice(0, 2).join(' · ') + (failed.length > 2 ? ' …' : ''),
                { duration: 8000 }
            );
        }
    } else {
        if (typeof toastSuccess === 'function') {
            toastSuccess('Historique de prix mis à jour', `${done} actif(s) — cours réels activés.`);
        }
    }

    // B5 : recharge le cache mémoire des volatilités réelles puis redessine.
    // primeRealVolCache() appelle lui-même renderInventoryTable() et
    // calculateRiskMetrics() en fin de traitement — le skeleton est alors
    // écrasé par le rendu réel de renderInventoryTable().
    await primeRealVolCache();

    // ⭐ NOUVEAU : reconstruit l'historique de valorisation de chaque actif
    // à partir des cours réels + des lots détenus. C'est ce qui permet à la
    // Trajectoire Patrimoniale d'afficher une vraie courbe "Valeur" qui se
    // détache du "Investi" même sur les années passées.
    try {
        const n = rebuildAllHistoriesFromRealPrices();
        if (n > 0) {
            saveToStorage();
            console.info(`[History] ${n} historique(s) reconstruit(s) depuis les cours réels.`);
        }
    } catch (err) {
        console.warn('[History] Reconstruction échouée :', err);
    }

    // Chantier §5 — invalide la matrice de corrélation : de nouvelles séries
    // réelles viennent d'être chargées, les corrélations doivent être
    // recalculées au prochain rendu du dashboard.
    if (typeof invalidateCorrelationCache === 'function') {
        invalidateCorrelationCache();
    }
    if (typeof activeTab !== 'undefined' && activeTab === 'tab-dashboard' &&
        typeof renderCorrelationSection === 'function') {
        renderCorrelationSection();
    }

    _priceFetchInProgress = false;
}

// =====================================================================
// RECONSTRUCTION D'HISTORIQUE DEPUIS LES COURS RÉELS (fix 2026)
// ---------------------------------------------------------------------
// Problème : quand vous cliquez sur "Historique de prix", les cours sont
// stockés dans realSeriesCache (utilisé pour la volatilité, le benchmark,
// la corrélation) mais JAMAIS injectés dans a.history[]. Résultat : la
// Trajectoire Patrimoniale n'a que 2 points par actif (date d'achat +
// aujourd'hui), et Investi = Valeur sur toute la période — la courbe
// "Valeur" reste collée à la courbe "Investi".
//
// Solution : pour chaque actif couvert par une série réelle, on reconstruit
// un historique complet en combinant :
//   • La quantité détenue à chaque date (issue des lots)
//   • Le cours réel à cette date (issu de realSeriesCache)
//
// Échantillonnage : 1 point par semaine (dimanche) pour limiter la taille
// localStorage. Limite : 3 ans d'historique maximum.
// =====================================================================

function rebuildHistoryFromRealPrices(asset) {
    const ticker = (asset.ticker || '').toUpperCase();
    const series = realSeriesCache[ticker];

    // Récupère les lots triés par date
    const lots = (asset.lots || [])
        .map(l => ({
            d: parseFlexDate(l.date),
            q: Number(l.qty) || 0,
            p: Number(l.price) || 0,
            f: Number(l.frais) || 0
        }))
        .filter(l => l.d && l.q > 0)
        .sort((a, b) => a.d - b.d);
    if (lots.length === 0) return false;

    // ⭐ Fenêtre étendue à 5 ans (au lieu de 3) pour couvrir 2023-2024
    const cutoff = Date.now() - 5 * 365 * 864e5;
    const startTs = Math.max(lots[0].d.getTime(), cutoff);

    // -------------------- Cas 1 : cours réels disponibles --------------------
    if (Array.isArray(series) && series.length >= 2) {
        const newHistory = [];
        let cumQty = 0, cumInvested = 0, lotIdx = 0;
        let lastMonthKey = null;

        for (const pt of series) {
            if (pt.date < startTs) continue;

            while (lotIdx < lots.length && lots[lotIdx].d.getTime() <= pt.date) {
                cumQty += lots[lotIdx].q;
                cumInvested += lots[lotIdx].q * lots[lotIdx].p + lots[lotIdx].f;
                lotIdx++;
            }
            if (cumQty <= 0) continue;

            // ⭐ Échantillonnage MENSUEL (1 point par mois, dernier jour du mois)
            const dd = new Date(pt.date);
            const monthKey = dd.getFullYear() + '-' + String(dd.getMonth() + 1).padStart(2, '0');

            if (monthKey !== lastMonthKey) {
                newHistory.push({
                    date: dd.toLocaleDateString('fr-FR'),
                    value: cumQty * pt.price,
                    invested: cumInvested
                });
                lastMonthKey = monthKey;
            } else {
                // Remplace le point existant (pour garder le dernier jour du mois)
                newHistory[newHistory.length - 1] = {
                    date: dd.toLocaleDateString('fr-FR'),
                    value: cumQty * pt.price,
                    invested: cumInvested
                };
            }
        }

        // Point final "aujourd'hui"
        if (cumQty > 0) {
            newHistory.push({
                date: new Date().toLocaleDateString('fr-FR'),
                value: asset.value,
                invested: cumInvested
            });
        }

        if (newHistory.length >= 2) {
            asset.history = newHistory;
            return true;
        }
    }

    // -------------------- Cas 2 : interpolation linéaire (fallback) --------------------
    // Si aucun cours réel n'est disponible (obligations, SCPI, or physique,
    // ou cours trop anciens non couverts), on génère un historique mensuel
    // par interpolation linéaire entre le coût d'achat et la valeur actuelle.
    //
    // Méthode :
    //   • À la date de chaque lot   → valeur = coût cumulé (gris = valeur)
    //   • Entre deux lots           → valeur = coût cumulé
    //   • Entre dernier lot et auj. → interpolation vers la valeur actuelle
    //
    // Ceci donne un tracé au moins cohérent (pas de trou, pas de saut brutal).

    const firstDate = lots[0].d;
    const today = new Date();
    const spanMs = today.getTime() - firstDate.getTime();
    if (spanMs < 30 * 864e5) return false;   // < 1 mois : rien à interpoler

    // Coût cumulé à un instant T
    const investedAt = (ts) => {
        let sum = 0;
        for (const l of lots) {
            if (l.d.getTime() <= ts) sum += l.q * l.p + l.f;
        }
        return sum;
    };

    const totalInvested = investedAt(today.getTime());
    const currentValue = asset.value || 0;
    const totalGain = currentValue - totalInvested;

    const newHistory = [];
    const cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
    let lastMonthKey = null;

    while (cursor <= today) {
        const ts = cursor.getTime();
        const monthKey = cursor.getFullYear() + '-' + String(cursor.getMonth() + 1).padStart(2, '0');
        if (monthKey !== lastMonthKey) {
            const inv = investedAt(ts);

            // Progression temporelle entre premier achat et aujourd'hui
            const progress = Math.max(0, Math.min(1, (ts - firstDate.getTime()) / spanMs));

            // Interpolation : valeur = investi + (gain_total × progression)
            const val = inv + totalGain * progress;

            newHistory.push({
                date: cursor.toLocaleDateString('fr-FR'),
                value: Math.max(0, val),
                invested: inv
            });
            lastMonthKey = monthKey;
        }
        // Avance d'un mois
        cursor.setMonth(cursor.getMonth() + 1);
    }

    if (newHistory.length >= 2) {
        asset.history = newHistory;
        return true;
    }
    return false;
}

// Applique rebuildHistoryFromRealPrices() à tous les actifs éligibles.
// Retourne le nombre d'historiques reconstruits.
function rebuildAllHistoriesFromRealPrices() {
    if (!assets || !assets.length) return 0;
    if (!realSeriesCache || Object.keys(realSeriesCache).length === 0) return 0;

    let count = 0;
    assets.forEach(a => {
        try {
            if (rebuildHistoryFromRealPrices(a)) count++;
        } catch (err) {
            console.warn(`[History] Échec pour ${a.name} :`, err.message);
        }
    });
    return count;
}

// Expose l'API globalement
window.rebuildHistoryFromRealPrices     = rebuildHistoryFromRealPrices;
window.rebuildAllHistoriesFromRealPrices = rebuildAllHistoriesFromRealPrices;

// ---------------------------------------------------------------------
// Volatilité annualisée à partir d'une série de prix quotidienne
// ---------------------------------------------------------------------
function annualizedVolFromSeries(series) {
    if (!series || series.length < 30) return null;
    const returns = [];
    for (let i = 1; i < series.length; i++) {
        if (series[i - 1].price > 0) returns.push((series[i].price - series[i - 1].price) / series[i - 1].price);
    }
    if (returns.length < 20) return null;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, r) => a + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance) * Math.sqrt(365); // séries quotidiennes
}

// Précharge le cache mémoire (volatilité + séries brutes) pour éviter de lire
// IndexedDB à chaque rendu. Appelé au démarrage et après chaque actualisation.
function primeRealVolCache() {
    const keys = [];
    assets.forEach(a => {
        if (hasTag(a, 'Crypto') && CRYPTO_COINGECKO_IDS[a.ticker.toUpperCase()]) {
            keys.push(['CRYPTO_' + a.ticker.toUpperCase(), a.ticker.toUpperCase()]);
        }
        if (hasTag(a, 'Devises/Liquidités') && CASH_CURRENCY_TICKERS.includes(a.ticker.toUpperCase())) {
            keys.push(['CUR_' + a.ticker.toUpperCase(), a.ticker.toUpperCase()]);
        }
        if ((hasTag(a, 'Action') || hasTag(a, 'ETF')) && !hasTag(a, 'Crypto')) {
            const sym = (a.yahooTicker || a.ticker || '').toUpperCase();
            if (sym) keys.push(['EQUITY_' + sym, sym]);
        }
    });
        return Promise.all(keys.map(([k]) => priceDBGet(k).catch(() => null))).then(results => {
        let anyNewSeries = false;
        results.forEach((r, i) => {
            if (r && Array.isArray(r.series) && r.series.length >= 30) {
                realVolCache[keys[i][1]]    = annualizedVolFromSeries(r.series);
                realSeriesCache[keys[i][1]] = r.series;
                anyNewSeries = true;
            }
        });
        // Invalide le cache sparkline : de nouvelles séries réelles viennent
        // d'être chargées, les mini-courbes doivent se rafraîchir.
        if (anyNewSeries && typeof _sparklineCache !== 'undefined' && _sparklineCache.clear) {
            _sparklineCache.clear();
        }
        // Chantier §5 — invalide la matrice de corrélation si de nouvelles
        // séries ont été chargées (les cours réels alimentent le calcul).
        if (anyNewSeries && typeof invalidateCorrelationCache === 'function') {
            invalidateCorrelationCache();
        }
        if (typeof renderInventoryTable === 'function') renderInventoryTable();
        if (typeof calculateRiskMetrics === 'function') calculateRiskMetrics();
        // Re-render la matrice si l'onglet dashboard est actif et que de
        // nouvelles séries ont été chargées.
        if (anyNewSeries && typeof activeTab !== 'undefined' && activeTab === 'tab-dashboard' &&
            typeof renderCorrelationSection === 'function') {
            renderCorrelationSection();
        }
    });
}

// ---------------------------------------------------------------------
// Actualisation live (crypto + devises) puis mise à jour manuelle groupée
// ---------------------------------------------------------------------
// Verrou global : empêche deux actualisations concurrentes (source du 429)
let _priceFetchInProgress = false;

// Retry avec backoff exponentiel sur les fetch échoués (429, réseau).
// Utilisé pour amortir les rate-limits CoinGecko / Frankfurter.
async function _fetchWithRetry(url, options = {}, maxRetries = 3) {
    let lastErr = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const res = await fetch(url, options);
            if (res.status === 429) {
                const waitMs = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
                console.warn(`[Fetch] 429 rate-limited, retry dans ${Math.round(waitMs)}ms`);
                await new Promise(r => setTimeout(r, waitMs));
                continue;
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res;
        } catch (err) {
            lastErr = err;
            if (attempt < maxRetries - 1) {
                const waitMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
                await new Promise(r => setTimeout(r, waitMs));
            }
        }
    }
    throw lastErr || new Error('Fetch failed after retries');
}

async function fetchLivePrices() {
    if (_priceFetchInProgress) {
        console.warn('[Prices] Actualisation déjà en cours — ignorée.');
        return;
    }
    _priceFetchInProgress = true;

    const btn  = document.getElementById('btn-live-prices');
    const icon = document.getElementById('icon-refresh-prices');
    if (icon) icon.classList.add('fa-spin');
    if (btn)  btn.disabled = true;

    const invBackup = showSkeletonFor('#table-inventory-body', 6, 13);
    const cryptoBackup = showSkeletonFor('#table-crypto-body', 3, 7);

    const cryptoMap = CRYPTO_COINGECKO_IDS;
    const currencyTickers = ['USD', 'JPY', 'CHF', 'GBP'];
    let updated = 0;
    const sourceErrors = [];

    // --- Crypto (CoinGecko, avec retry) ---
    try {
        const cryptoAssets = assets.filter(a => hasTag(a, 'Crypto') && cryptoMap[a.ticker.toUpperCase()]);
        if (cryptoAssets.length) {
            try {
                const ids = [...new Set(cryptoAssets.map(a => cryptoMap[a.ticker.toUpperCase()]))].join(',');
                const res = await _fetchWithRetry(
                    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=eur`,
                    {},
                    3
                );
                const prices = await res.json();
                cryptoAssets.forEach(a => {
                    const priceEUR = prices[cryptoMap[a.ticker.toUpperCase()]]?.eur;
                    if (priceEUR) {
                        a.value = a.qty * priceEUR;
                        upsertTodayHistoryPoint(a, a.value, a.invested);
                        updated++;
                    }
                });
            } catch (err) {
                sourceErrors.push(`Crypto (CoinGecko) : ${err.message}`);
            }
        }
    } catch (err) { console.warn(err); }

    // --- Devises (Frankfurter, avec retry) ---
    try {
        const currencyAssets = assets.filter(a => hasTag(a, 'Devises/Liquidités') && currencyTickers.includes(a.ticker.toUpperCase()));
        if (currencyAssets.length) {
            try {
                const to = [...new Set(currencyAssets.map(a => a.ticker.toUpperCase()))].join(',');
                const res = await _fetchWithRetry(
                    `https://api.frankfurter.dev/v1/latest?base=EUR&symbols=${to}`,
                    {},
                    3
                );
                const data = await res.json();
                currencyAssets.forEach(a => {
                    const rate = data.rates?.[a.ticker.toUpperCase()];
                    if (rate) {
                        a.value = a.qty * (1 / rate);
                        upsertTodayHistoryPoint(a, a.value, a.invested);
                        updated++;
                    }
                });
            } catch (err) {
                sourceErrors.push(`Devises (Frankfurter) : ${err.message}`);
            }
        }
    } catch (err) { console.warn(err); }

    // =================================================================
    // ACTIONS / ETF — Yahoo EN PARALLÈLE (concurrency 3)
    // -----------------------------------------------------------------
    // Le loop séquentiel historique prenait 3-4 minutes si Yahoo était
    // indisponible (2 proxies × 8 s × 14 symboles). On parallélise sur
    // 3 workers avec un timeout réduit à 5 s par proxy (10 s pire cas).
    // =================================================================
    const updatedStockIds = new Set();
    const stockAssets = assets.filter(a => (hasTag(a, 'Action') || hasTag(a, 'ETF')) && !hasTag(a, 'Crypto'));

    if (stockAssets.length) {
        const showToast = stockAssets.length > 1;
        if (showToast) showProgressToast('Actualisation Actions / ETF…', `0 / ${stockAssets.length}`, 0);

        // --- Phase 1 : Yahoo en parallèle (concurrency 3) ---
        const yahooResults = {};
        let yahooDone = 0;

        const queue = stockAssets
            .map(a => ({ asset: a, symbol: a.yahooTicker || a.ticker }))
            .filter(x => x.symbol);

        const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
            while (queue.length) {
                const item = queue.shift();
                try {
                    const price = await fetchYahooQuote(item.symbol);
                    yahooResults[item.symbol] = { price: price || null };
                } catch (err) {
                    yahooResults[item.symbol] = { price: null, error: err.message };
                }
                yahooDone++;
                if (showToast) {
                    updateProgressToast(
                        `${yahooDone} / ${stockAssets.length} · Yahoo`,
                        (yahooDone / stockAssets.length) * 60
                    );
                }
            }
        });
        await Promise.all(workers);

        // Applique les résultats Yahoo réussis
        stockAssets.forEach(a => {
            const symbol = a.yahooTicker || a.ticker;
            if (!symbol) return;
            const r = yahooResults[symbol];
            if (r && r.price) {
                a.value = a.qty * r.price;
                upsertTodayHistoryPoint(a, a.value, a.invested);
                updatedStockIds.add(a.id);
            }
        });

        // --- Phase 2 : fallback séquentiel pour les échecs Yahoo ---
        const failedYahoo = stockAssets.filter(a => {
            const symbol = a.yahooTicker || a.ticker;
            return symbol && !updatedStockIds.has(a.id);
        });

        if (failedYahoo.length > 0) {
            let processed = 0;
            for (const a of failedYahoo) {
                processed++;
                const symbol = a.yahooTicker || a.ticker;
                if (!symbol) continue;

                if (showToast) {
                    updateProgressToast(
                        `${yahooDone + processed} / ${stockAssets.length} · fallback`,
                        60 + (processed / failedYahoo.length) * 40
                    );
                }

                let price = null;

                // Twelve Data (si configuré) — 8 s de pause entre appels
                if (twelveDataApiKey) {
                    try {
                        price = await fetchTwelveDataQuote(symbol);
                        if (processed < failedYahoo.length) {
                            await new Promise(r => setTimeout(r, 8000));
                        }
                    } catch (err) { /* ignore */ }
                }

                // Finnhub (fallback US)
                if (!price && finnhubApiKey) {
                    try {
                        price = await fetchFinnhubQuote(symbol);
                    } catch (err) { /* ignore */ }
                }

                if (price) {
                    a.value = a.qty * price;
                    upsertTodayHistoryPoint(a, a.value, a.invested);
                    updatedStockIds.add(a.id);
                } else {
                    const yahooErr = yahooResults[symbol]?.error || 'aucune source';
                    sourceErrors.push(`${a.name} (${symbol}) : ${yahooErr}`);
                }
            }
        }

        updated += updatedStockIds.size;
    }

    // --- Pièces AuCoffre ---
    try {
        const auCoffreUpdated = await updateAuCoffreAssetsFromGoldPrice();
        if (auCoffreUpdated > 0) updated += auCoffreUpdated;
    } catch (err) { console.warn('AuCoffre update failed:', err); }

    if (updated > 0) {
        saveToStorage();
        refreshAllUI();
    }

    if (icon) icon.classList.remove('fa-spin');
    if (btn)  btn.disabled = false;
    hideProgressToast(400);

    if (sourceErrors.length > 0 && updated === 0) {
        if (typeof toastError === 'function') {
            toastError(
                `Aucun cours récupéré (${sourceErrors.length} actif(s))`,
                sourceErrors.slice(0, 3).join(' · ') + (sourceErrors.length > 3 ? ' …' : ''),
                { duration: 10000 }
            );
        }
        console.warn('[Prices] Échecs :\n' + sourceErrors.join('\n'));
    } else if (sourceErrors.length > 0) {
        if (typeof toastWarning === 'function') {
            toastWarning(
                `${updated} cours mis à jour, ${sourceErrors.length} échec(s)`,
                sourceErrors.slice(0, 2).join(' · ') + (sourceErrors.length > 2 ? ' …' : ''),
                { duration: 7000 }
            );
        }
    } else if (updated > 0) {
        if (typeof toastSuccess === 'function') {
            toastSuccess('Cours actualisés', `${updated} actif(s) mis à jour.`);
        }
    }

    if (document.querySelector('#table-inventory-body')?.querySelector('.skeleton-row')) {
        restoreSkeletonFor('#table-inventory-body', invBackup);
    }
    if (document.querySelector('#table-crypto-body')?.querySelector('.skeleton-row')) {
        restoreSkeletonFor('#table-crypto-body', cryptoBackup);
    }

    // --- Mise à jour manuelle groupée : UNIQUEMENT les actifs non couverts ---
    const autoUpdatedIds = new Set(
        assets.filter(a =>
            (hasTag(a, 'Crypto') && cryptoMap[a.ticker.toUpperCase()]) ||
            (hasTag(a, 'Devises/Liquidités') && currencyTickers.includes(a.ticker.toUpperCase()))
        ).map(a => a.id)
    );
    updatedStockIds.forEach(id => autoUpdatedIds.add(id));

    const manualAssets = assets.filter(a => !autoUpdatedIds.has(a.id));
    if (manualAssets.length) openManualRefreshModal(manualAssets);

    _priceFetchInProgress = false;
}

// ---------------------------------------------------------------------
// Mise à jour manuelle groupée (pour les actifs sans cours automatique)
// ---------------------------------------------------------------------
function openManualRefreshModal(manualAssets) {
    const body = document.getElementById('manual-refresh-body');
    if (body) {
        const preamble = `
            <div class="bg-blue-950/20 border border-blue-800/40 rounded-lg p-3 mb-3 text-[11px] text-blue-200 leading-relaxed">
                <i class="fa-solid fa-circle-info text-blue-400 mr-1"></i>
                Les <b>${manualAssets.length} actif(s)</b> ci-dessous n'ont pas de cours public accessible depuis
                un navigateur (Or physique, SCPI, obligations non cotées, immobilier…). Vérifiez leur valeur
                unitaire actuelle et cliquez sur « Tout enregistrer » — ou ignorez pour plus tard.
            </div>`;
        body.innerHTML = preamble + manualAssets.map(a => {
            const unitValue = a.qty ? (a.value / a.qty) : a.value;
            return `<div class="grid grid-cols-[1fr_auto] items-center gap-3 p-2 bg-gray-950 border border-gray-800 rounded-lg" data-asset-id="${a.id}" data-qty="${a.qty}" data-invested="${a.invested}">
                <div class="min-w-0">
                    <div class="font-bold text-white truncate">${escapeHTML(a.name)}</div>
                    <div class="text-[10px] text-gray-500 font-mono">${escapeHTML(a.ticker)} • Qté ${fmtQty(a.qty)} • Valeur actuelle : ${formatEUR(a.value)}</div>
                </div>
                <div class="flex items-center gap-1.5">
                    <span class="text-[10px] text-gray-500">Nouv. valeur unitaire</span>
                    <input type="number" step="any" class="manual-refresh-input w-28 bg-gray-900 border border-gray-800 rounded-lg p-1.5 text-white font-mono text-right focus:outline-none focus:border-teal-500" value="${unitValue.toFixed(4)}">
                </div>
            </div>`;
        }).join('');
    }
    document.getElementById('modal-manual-refresh').classList.remove('hidden');
}

function saveManualRefresh() {
    let updated = 0;
    document.querySelectorAll('#manual-refresh-body > div').forEach(row => {
        const id  = parseFloat(row.dataset.assetId);
        const qty = parseFloat(row.dataset.qty) || 0;
        const input = row.querySelector('.manual-refresh-input');
        const newUnitValue = parseFloat(input.value);
        if (isNaN(newUnitValue)) return;
        const asset = assets.find(a => a.id === id);
        if (!asset) return;
        const newValue = qty * newUnitValue;
        if (newValue === asset.value) return;
        asset.value = newValue;
        upsertTodayHistoryPoint(asset, asset.value, asset.invested);
        updated++;
    });
    if (updated > 0) {
        saveToStorage();
        refreshAllUI();
    }
    closeModal('modal-manual-refresh');
    alert(updated > 0 ? `${updated} actif(s) mis à jour manuellement.` : 'Aucune valeur modifiée.');
}

// ---------------------------------------------------------------------
// Point d'entrée central du rendu
// ---------------------------------------------------------------------
function refreshAllUI() {
    // On calcule la fiscalité AVANT le bandeau pour que l'impôt estimé soit disponible
    calculateAnneeN1();
    renderCessionsTable(cessionFilter);

    calculateOverallStats();
    calculateRiskMetrics();
    renderInventoryTable();
    renderCryptoTable();
    renderHorsGaveTable();
    updateGaveSection();
    updatePiliersSection();
    renderArbitragesTable();
    computeAdvancedStats();

    if (activeTab === 'tab-dashboard') {
        initDashboardCharts();
        // Chantier §3 — comparateur CW8 (rendu automatique sur le dashboard)
        if (typeof renderCw8Comparison === 'function') renderCw8Comparison();
        // Chantier §3 — scoring ESG du portefeuille
        if (typeof renderEsgDashboardSection === 'function') renderEsgDashboardSection();
        // Chantier §4 — rapport de performance mensuel
        if (typeof renderMonthlySnapshotsSection === 'function') renderMonthlySnapshotsSection();
        // Chantier §5 — matrice de corrélation
        if (typeof renderCorrelationSection === 'function') renderCorrelationSection();
        // Chantier §7 — waterfall du P&L
        if (typeof renderWaterfallSection === 'function') renderWaterfallSection();
        // Chantier #10 — détection des petites lignes mortes
        if (typeof renderDeadLinesSection === 'function') renderDeadLinesSection();
    }
    // tab-accueil : uniquement les KPI banners — pas de graphique à initialiser
    else if (activeTab === 'tab-gave') initGaveDonutChart();
    else if (activeTab === 'tab-strategies' && typeof renderStrategiesTab === 'function') renderStrategiesTab();
    else if (activeTab === 'tab-objectifs' && typeof renderGoalsTab === 'function') {
        renderGoalsTab();
        // Chantier §3 — simulateur PER (rendu automatique sur l'onglet Objectifs)
        if (typeof renderPerPanel === 'function') renderPerPanel();
        // Chantier §6 — panneau DCA planifié
        if (typeof renderDcaPanel === 'function') renderDcaPanel();
        // Chantier §9 — simulateur de sortie progressive
        if (typeof renderWithdrawalPanel === 'function') renderWithdrawalPanel();
    }
    else if (activeTab === 'tab-watchlist' && typeof renderWatchlistTab === 'function') renderWatchlistTab();
    else if (activeTab === 'tab-annee-n1' && typeof renderTaxOptimizer === 'function') renderTaxOptimizer();
    else if (activeTab === 'tab-ledger' && typeof renderLedgerTab === 'function') renderLedgerTab();

    if (compareActive) {
        if (compareSegmentA) renderComparePanel('A');
        if (compareSegmentB) renderComparePanel('B');
    }

    // Maintient le compteur/badge/label du bouton Paper en cohérence
    // (utile après un switch de portefeuille ou une promotion en réel).
    if (typeof updatePaperToggleUI === 'function') updatePaperToggleUI();

    // Évaluation des alertes personnalisées (Chantier F)
    if (typeof evaluateAlerts === 'function') evaluateAlerts();

    // Recalcul du TRI (Chantier G) — invalidate cache + KPI global
    if (typeof refreshTIR === 'function') refreshTIR();

    // Recalcul des KPI de revenus passifs (Chantier 1.1)
    if (typeof renderDividendsKPIs === 'function') renderDividendsKPIs();

    // Recalcul des KPI d'exposition devise (Chantier 1.2)
    if (typeof renderCurrencyExposureKPI === 'function') renderCurrencyExposureKPI();

    // Recalcul du scoring des actifs (Chantier H) — leaderboard + cache
    if (typeof refreshScoring === 'function') refreshScoring();

    // Suggestions intelligentes (Chantier L)
    if (typeof renderSuggestions === 'function') renderSuggestions();

    // Chantier §6 — évaluation DCA (throttled 1 h, cooldown 1 mois)
    if (typeof evaluateDca === 'function') evaluateDca();

    // Chantier §10 — section "Thèses à revoir" + histogramme annuel (accueil)
    if (activeTab === 'tab-accueil') {
        if (typeof renderThesesReviewSection === 'function') renderThesesReviewSection();
        if (typeof renderAnnualPnlChart === 'function') renderAnnualPnlChart();
    }
}

// =====================================================================
// GOOGLE DRIVE — sauvegardes chiffrées AES-GCM 256 / PBKDF2
// =====================================================================
// Le chiffrement est autonome et fonctionne immédiatement.
// La synchro Drive nécessite un Client ID Google Cloud (OAuth) que VOUS
// devez créer (Google ne fournit pas de client générique pour des raisons
// de sécurité) : console.cloud.google.com -> nouveau projet -> API Google
// Drive -> Identifiants -> ID client OAuth (type "Application Web"), avec
// comme origine JavaScript autorisée l'URL exacte où cette page est hébergée.
// Un simple fichier ouvert en file:// ne peut PAS utiliser OAuth.
// =====================================================================
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
let driveTokenClient  = null;
let driveAccessToken  = null;

function getDriveClientId()    { return localStorage.getItem('patriMonial_driveClientId') || ''; }
function setDriveClientId(id)  { localStorage.setItem('patriMonial_driveClientId', id.trim()); }

// --- Chiffrement AES-GCM 256 (clé maîtresse non-extractible) ---
// Format v2 : plus de sel dans l'enveloppe — le sel est propre à la clé
// mémorisée (une seule dérivation PBKDF2 par appareil, pas par sauvegarde).
// Format v1 reste déchiffrable pour la compatibilité avec les anciennes
// sauvegardes Drive (schéma d'origine : sel par enveloppe).
async function encryptPayload(obj, passphrase) {
    const { key } = await getOrCreateMasterKey(passphrase);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj))
    );
    const toB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
    return { v: 2, iv: toB64(iv), data: toB64(cipher) };
}

async function decryptPayload(envelope, passphrase) {
    const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

    // Compatibilité avec les sauvegardes v1 (ancien format, sel par enveloppe)
    if (envelope.v === 1 && envelope.salt) {
        const key = await deriveMasterKey(passphrase, fromB64(envelope.salt));
        const plain = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: fromB64(envelope.iv) }, key, fromB64(envelope.data)
        );
        return JSON.parse(new TextDecoder().decode(plain));
    }

    // ⚠️ FIX 2026 : mode 'decrypt' → la clé ne sera JAMAIS écrasée même
    //    si la passphrase est erronée (évite la perte du backup en cas de
    //    faute de frappe).
    const { key } = await getOrCreateMasterKey(passphrase, { mode: 'decrypt' });
    const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromB64(envelope.iv) }, key, fromB64(envelope.data)
    );
    return JSON.parse(new TextDecoder().decode(plain));
}

// --- Modal de synchronisation ---
function openDriveSyncModal() {
    document.getElementById('drive-client-id-input').value = getDriveClientId();
    renderDriveBackupList();
    updateDriveSyncStatus();
    // Chantier 5.2 — affiche l'état du miroir IndexedDB + l'aperçu de compaction
    if (typeof refreshIdbSection === 'function') {
        refreshIdbSection();
    }
    if (typeof refreshCompactionPreview === 'function') {
        refreshCompactionPreview();
    }
    document.getElementById('modal-drive-sync').classList.remove('hidden');
}

function renderDriveBackupList() {
    const backups = listLocalBackups();
    document.getElementById('local-backup-list').innerHTML = backups.length
        ? backups.map((b, i) => `
            <div class="flex justify-between items-center p-2 bg-gray-950 border border-gray-800 rounded-lg text-[11px] gap-2">
                <span class="text-gray-300 truncate">${escapeHTML(b.label)}</span>
                <span class="flex gap-1 flex-shrink-0">
                    <button onclick="restoreLocalBackup(${i})" class="px-2 py-1 rounded bg-gray-800 hover:bg-indigo-700 text-white text-[10px]">Restaurer</button>
                    <button onclick="deleteLocalBackup(${i})" class="px-2 py-1 rounded bg-rose-900/60 hover:bg-rose-800 text-rose-200 text-[10px]" title="Supprimer cette sauvegarde">✕</button>
                </span>
            </div>`).reverse().join('')
        : '<div class="text-gray-500 italic text-[11px]">Aucune sauvegarde locale pour le moment.</div>';
}

function deleteLocalBackup(index) {
    const backups = listLocalBackups();
    const b = backups[index];
    if (!b) return;
    if (!confirm(`Supprimer la sauvegarde "${b.label}" ? Cette action est irréversible.`)) return;
    backups.splice(index, 1);
    try {
        localStorage.setItem(pfKey('patriMonial_localBackups'), JSON.stringify(backups));
    } catch (err) {
        alert('Suppression impossible : ' + err.message);
        return;
    }
    renderDriveBackupList();
}

function saveDriveClientId() {
    setDriveClientId(document.getElementById('drive-client-id-input').value);
    updateDriveSyncStatus();
}

function initDriveSyncUI() {
    document.getElementById('drive-status-text').innerText = getDriveClientId()
        ? 'Client ID configuré — cliquez sur "Se connecter à Drive".'
        : 'Aucun Client ID Google configuré (voir les instructions ci-dessous).';
    const finnhubInput = document.getElementById('finnhub-key-input');
    const finnhubStatus = document.getElementById('finnhub-status');
    if (finnhubInput) finnhubInput.value = finnhubApiKey;
    if (finnhubStatus) finnhubStatus.innerText = finnhubApiKey ? '✅ Clé enregistrée' : '⚠️ Aucune clé';

    const twelveInput = document.getElementById('twelve-key-input');
    const twelveStatus = document.getElementById('twelve-status');
    if (twelveInput) twelveInput.value = twelveDataApiKey;
    if (twelveStatus) twelveStatus.innerText = twelveDataApiKey ? '✅ Clé enregistrée' : '⚠️ Aucune clé — requise pour les ETF';

    // Met à jour le libellé du champ mot de passe si une clé est déjà mémorisée
    hasStoredMasterKey().then(has => {
        const input = document.getElementById('drive-passphrase-input');
        if (input && has) {
            input.placeholder = 'Clé mémorisée — laissez vide pour utiliser la clé stockée';
        }
    });
}

function updateDriveSyncStatus() {
    const el = document.getElementById('drive-status-text');
    if (!getDriveClientId()) {
        el.innerText = 'Renseignez d\'abord un Client ID Google (voir instructions).';
        return;
    }
    el.innerText = driveAccessToken
        ? 'Connecté à Google Drive.'
        : 'Client ID enregistré — cliquez sur "Se connecter à Drive".';
}

// Charge dynamiquement la librairie Google Identity Services (GIS) si nécessaire
function loadGisScript() {
    return new Promise((resolve, reject) => {
        if (window.google && window.google.accounts) { resolve(); return; }
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.onload  = resolve;
        s.onerror = () => reject(new Error('Impossible de charger Google Identity Services (bloqué par un bloqueur de scripts ?).'));
        document.head.appendChild(s);
    });
}

async function connectDrive() {
    const clientId = getDriveClientId();
    if (!clientId) { alert('Renseignez d\'abord un Client ID Google Cloud (OAuth).'); return; }
    try {
        await loadGisScript();
        driveTokenClient = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: DRIVE_SCOPE,
            callback: (resp) => {
                if (resp.error) { alert('Connexion refusée : ' + resp.error); return; }
                driveAccessToken = resp.access_token;
                updateDriveSyncStatus();
                alert('Connecté à Google Drive.');
            }
        });
        driveTokenClient.requestAccessToken();
    } catch (err) {
        alert('Erreur de connexion Drive : ' + err.message);
    }
}

async function driveApiFetch(path, options = {}) {
    if (!driveAccessToken) throw new Error('Non connecté à Drive.');
    const res = await fetch('https://www.googleapis.com/drive/v3/' + path, {
        ...options,
        headers: { ...(options.headers || {}), Authorization: 'Bearer ' + driveAccessToken }
    });
    if (!res.ok) throw new Error('Drive API HTTP ' + res.status);
    return res;
}

async function pushToDrive() {
    let passphrase = document.getElementById('drive-passphrase-input').value;
    const hasKey = await hasStoredMasterKey();

    if (!passphrase && !hasKey) {
        alert('Choisissez une phrase secrète d\'au moins 8 caractères (elle seule permet de déchiffrer vos données — Google ne la connaît pas et ne peut pas la récupérer).');
        return;
    }
    if (passphrase && passphrase.length < 8) {
        alert('La phrase secrète doit contenir au moins 8 caractères.');
        return;
    }
    // null = "utiliser la clé mémorisée" (voir getOrCreateMasterKey, correctif 8).
    if (!passphrase && hasKey) passphrase = null;

    try {
        // ⚠ includeApiKeys=true : l'enveloppe Drive est chiffrée AES-GCM,
// donc les clés API sont protégées en transit et au repos.
const envelope = await encryptPayload(currentDataSnapshot(true), passphrase);
        const metadata = { name: 'patrimonial-backup-' + Date.now() + '.json', parents: ['appDataFolder'] };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([JSON.stringify(envelope)], { type: 'application/json' }));
        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + driveAccessToken },
            body: form
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        alert('Sauvegarde envoyée sur Google Drive (chiffrée AES-256).');
        listDriveBackups();
    } catch (err) {
        alert('Échec de l\'envoi vers Drive : ' + err.message);
    }
}

async function listDriveBackups() {
    try {
        const res = await driveApiFetch('files?spaces=appDataFolder&fields=files(id,name,createdTime,size)&orderBy=createdTime desc&pageSize=50');
        const data = await res.json();
        const files = data.files || [];

        if (!files.length) {
            document.getElementById('drive-backup-list').innerHTML = '<div class="text-gray-500 italic text-[11px]">Aucune sauvegarde sur Drive.</div>';
            return;
        }

        // Le premier de la liste (le plus récent) est mis en avant
        const [latest, ...rest] = files;

        document.getElementById('drive-backup-list').innerHTML = `
            <div class="p-2 bg-indigo-950/40 border border-indigo-800/60 rounded-lg text-[11px] space-y-1.5">
                <div class="text-[10px] text-indigo-300 uppercase tracking-wider font-bold">Dernière sauvegarde</div>
                <div class="text-gray-200 font-mono truncate">${escapeHTML(latest.name)}</div>
                <div class="text-[10px] text-gray-500">${new Date(latest.createdTime).toLocaleString('fr-FR')}</div>
                <button onclick="pullFromDrive('${latest.id}')" class="w-full px-2 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium">
                    ⬇ Restaurer la dernière
                </button>
            </div>
            ${rest.length ? `
            <details class="text-[11px]">
                <summary class="cursor-pointer text-gray-400 hover:text-white py-1">Voir les ${rest.length} sauvegardes précédentes</summary>
                <div class="space-y-1.5 mt-1.5">
                    ${rest.map(f => `
                        <div class="flex justify-between items-center p-2 bg-gray-950 border border-gray-800 rounded-lg gap-2">
                            <div class="min-w-0">
                                <div class="text-gray-300 truncate font-mono">${escapeHTML(f.name)}</div>
                                <div class="text-[9px] text-gray-500">${new Date(f.createdTime).toLocaleString('fr-FR')}</div>
                            </div>
                            <div class="flex gap-1 flex-shrink-0">
                                <button onclick="pullFromDrive('${f.id}')" class="px-2 py-1 rounded bg-gray-800 hover:bg-indigo-700 text-white text-[10px]">Restaurer</button>
                                <button onclick="deleteDriveBackup('${f.id}')" class="px-2 py-1 rounded bg-rose-900/60 hover:bg-rose-800 text-rose-200 text-[10px]" title="Supprimer cette sauvegarde">✕</button>
                            </div>
                        </div>`).join('')}
                </div>
            </details>` : ''}
        `;
    } catch (err) {
        document.getElementById('drive-backup-list').innerHTML = `<div class="text-rose-400 text-[11px]">${err.message}</div>`;
    }
}

async function deleteDriveBackup(fileId) {
    if (!confirm('Supprimer définitivement cette sauvegarde sur Google Drive ?')) return;
    try {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
            method: 'DELETE',
            headers: { Authorization: 'Bearer ' + driveAccessToken }
        });
        if (!res.ok && res.status !== 204) throw new Error('HTTP ' + res.status);
        listDriveBackups();
    } catch (err) {
        alert('Suppression impossible : ' + err.message);
    }
}

// =====================================================================
// GESTION DE LA CLÉ MAÎTRESSE (Option A)
// =====================================================================
// La phrase secrète n'est PLUS stockée en clair. À la première saisie sur
// un appareil, une CryptoKey AES-GCM est dérivée (PBKDF2 250 000 itérations)
// avec extractable=false, puis mémorisée dans IndexedDB : elle devient
// physiquement impossible à exporter (crypto.subtle.exportKey échoue).
// Elle reste utilisable tant que la page est ouverte, mais aucun script
// malveillant ne peut la copier pour l'emporter hors du navigateur.
// =====================================================================
const KEY_DB_NAME  = 'patriMonialKeys';
const KEY_DB_STORE = 'keys';
const KEY_WITNESS  = 'patrimonial-master-key-v1';

function openKeyDB() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) { reject(new Error('IndexedDB indisponible.')); return; }
        const req = indexedDB.open(KEY_DB_NAME, 1);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(KEY_DB_STORE)) {
                req.result.createObjectStore(KEY_DB_STORE);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    });
}
async function keyDBGet(k) {
    const db = await openKeyDB();
    return new Promise((resolve, reject) => {
        const r = db.transaction(KEY_DB_STORE, 'readonly').objectStore(KEY_DB_STORE).get(k);
        r.onsuccess = () => { db.close(); resolve(r.result || null); };
        r.onerror   = () => { db.close(); reject(r.error); };
    });
}
async function keyDBSet(k, v) {
    const db = await openKeyDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(KEY_DB_STORE, 'readwrite');
        tx.objectStore(KEY_DB_STORE).put(v, k);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror    = () => { db.close(); reject(tx.error); };
    });
}
async function keyDBDelete(k) {
    const db = await openKeyDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(KEY_DB_STORE, 'readwrite');
        tx.objectStore(KEY_DB_STORE).delete(k);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror    = () => { db.close(); reject(tx.error); };
    });
}

async function deriveMasterKey(passphrase, salt) {
    const base = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
        base,
        { name: 'AES-GCM', length: 256 },
        false,                                        // ← non-extractible
        ['encrypt', 'decrypt']
    );
}

// Récupère la clé mémorisée ou en dérive une.
//
// ⚠️ FIX CRITIQUE 2026 : séparation stricte entre mode "encrypt" et
// "decrypt". Avant ce fix, appeler la fonction avec une passphrase qui
// ne correspondait pas à la clé stockée ÉCRASAIT la clé mémorisée,
// rendant impossible tout déchiffrement des backups existants.
//
//   • mode 'auto' (défaut) : comportement historique (peut écraser)
//   • mode 'encrypt'       : peut créer/écraser une nouvelle clé
//   • mode 'decrypt'       : ne stocke JAMAIS — dérive à la volée et
//                            utilise le sel de la clé existante si
//                            disponible, pour retrouver la clé
//                            correspondant à la passphrase saisie.
//
// Retourne { key, isNew, notStored? }.
async function getOrCreateMasterKey(passphrase, opts = {}) {
    const mode = opts.mode || 'auto';

    // ── Cas 1 : sentinel (utiliser la clé mémorisée) ──
    if (!passphrase || passphrase === '__cached__') {
        const stored = await keyDBGet('driveMasterKey');
        if (!stored || !stored.key) {
            throw new Error('Aucune clé mémorisée — saisissez la phrase secrète.');
        }
        try {
            const probe = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: new Uint8Array(stored.witnessIv) },
                stored.key,
                new Uint8Array(stored.witness)
            );
            if (new TextDecoder().decode(probe) !== KEY_WITNESS) {
                throw new Error('Witness mismatch');
            }
        } catch (_) {
            throw new Error('Clé mémorisée corrompue — ressaisissez la phrase secrète.');
        }
        return { key: stored.key, isNew: false };
    }

    // ── Cas 2 : passphrase fournie explicitement ──
    const stored = await keyDBGet('driveMasterKey');

    // 2a. Si une clé est stockée avec un sel, on teste si la passphrase
    //     saisie correspond (re-dérivation à partir du MÊME sel).
    if (stored && stored.key && stored.salt) {
        try {
            const candidateKey = await deriveMasterKey(passphrase, new Uint8Array(stored.salt));
            const probe = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: new Uint8Array(stored.witnessIv) },
                candidateKey,
                new Uint8Array(stored.witness)
            );
            if (new TextDecoder().decode(probe) === KEY_WITNESS) {
                // La passphrase correspond à la clé stockée : on la réutilise.
                return { key: candidateKey, isNew: false };
            }
        } catch (_) { /* pas de match → on continue */ }
    }

    // 2b. Mode 'decrypt' : NE JAMAIS écraser la clé stockée.
    //     On dérive à la volée, avec le sel de la clé existante si présent
    //     (pour retrouver la même clé qu'un backup créé sur un autre appareil
    //     avec la même passphrase).
    if (mode === 'decrypt') {
        const salt = (stored && stored.salt)
            ? new Uint8Array(stored.salt)
            : crypto.getRandomValues(new Uint8Array(16));
        const key = await deriveMasterKey(passphrase, salt);
        console.info('[Key] Mode decrypt : clé dérivée à la volée (non stockée).');
        return { key, isNew: false, notStored: true };
    }

    // 2c. Aucune clé stockée : on peut créer et mémoriser.
    if (!stored || !stored.key) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const key  = await deriveMasterKey(passphrase, salt);
        const iv   = crypto.getRandomValues(new Uint8Array(12));
        const witness = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv }, key, new TextEncoder().encode(KEY_WITNESS)
        );
        await keyDBSet('driveMasterKey', {
            key,
            salt: Array.from(salt),
            witness: Array.from(new Uint8Array(witness)),
            witnessIv: Array.from(iv),
            createdAt: Date.now()
        });
        return { key, isNew: true };
    }

    // 2d. Une clé existe avec une AUTRE passphrase.
    //     - en mode 'encrypt' : on ÉCRASE (comportement legacy, délibéré).
    //     - en mode 'auto'    : on ÉCRASE aussi (compat historique).
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key  = await deriveMasterKey(passphrase, salt);
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const witness = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv }, key, new TextEncoder().encode(KEY_WITNESS)
    );
    await keyDBSet('driveMasterKey', {
        key,
        salt: Array.from(salt),
        witness: Array.from(new Uint8Array(witness)),
        witnessIv: Array.from(iv),
        createdAt: Date.now()
    });
    return { key, isNew: true };
}

// Retourne true si une clé est déjà mémorisée sur cet appareil.
async function hasStoredMasterKey() {
    const stored = await keyDBGet('driveMasterKey');
    return !!(stored && stored.key);
}

// Efface la clé mémorisée (bouton "Oublier la phrase").
async function forgetMasterKey() {
    if (!confirm('Oublier la phrase secrète mémorisée sur cet appareil ?\nVous devrez la ressaisir pour vos prochaines sauvegardes Drive.')) return;
    await keyDBDelete('driveMasterKey');
    const input = document.getElementById('drive-passphrase-input');
    if (input) input.value = '';
    alert('Phrase oubliée. La clé de chiffrement locale a été effacée.');
}

async function pullFromDrive(fileId) {
    let passphrase = document.getElementById('drive-passphrase-input').value;
    const hasKey = await hasStoredMasterKey();
    if (!passphrase && !hasKey) {
        alert('Saisissez la phrase secrète utilisée lors de l\'envoi.');
        return;
    }
    if (!passphrase && hasKey) passphrase = null;
    try {
        const res = await driveApiFetch(`files/${fileId}?alt=media`);
        const envelope = await res.json();
        const payload  = await decryptPayload(envelope, passphrase);

        // Détection de conflit : prévient si la sauvegarde locale est plus récente
        const localSnap = currentDataSnapshot();
        if (localSnap.savedAt && payload.savedAt && new Date(localSnap.savedAt) > new Date(payload.savedAt)) {
            if (!confirm('Attention : vos données locales semblent plus récentes que cette sauvegarde Drive. Écraser quand même vos données locales ?')) return;
        }
        createSnapshot('Avant restauration Drive');
        assets    = payload.assets;
        cessions  = payload.cessions;
        arbitrages = payload.arbitrages;
        if (payload.cadranNames) {
            cadranNames = payload.cadranNames;
            localStorage.setItem(pfKey('patriMonial_cadranNames'), JSON.stringify(cadranNames));
        }
        assets.forEach(normalizeAsset);
        cessions.forEach(normalizeCession);

        if (payload.apiKeys && typeof payload.apiKeys === 'object') {
            try {
                if (typeof payload.apiKeys.finnhub === 'string') {
                    finnhubApiKey = payload.apiKeys.finnhub;
                }
                if (typeof payload.apiKeys.twelveData === 'string') {
                    twelveDataApiKey = payload.apiKeys.twelveData;
                }
                if (payload.apiKeys.brokerKeys && typeof payload.apiKeys.brokerKeys === 'object'
                    && typeof _brokerKeysMemory === 'object') {
                    Object.keys(payload.apiKeys.brokerKeys).forEach(broker => {
                        const entry = payload.apiKeys.brokerKeys[broker];
                        if (entry && entry.key && entry.secret) {
                            _brokerKeysMemory[broker] = entry;
                        }
                    });
                }
                console.info('[Drive] Clés API restaurées en mémoire de session.');
            } catch (err) {
                console.warn('[Drive] Restauration des clés API échouée :', err);
            }
        }

        saveToStorage(); saveCessions(); saveArbitrages();
        refreshAllUI();

        if (typeof initDriveSyncUI === 'function') initDriveSyncUI();

        alert('Données restaurées depuis Google Drive.'
            + (payload.apiKeys ? '\n\nLes clés API ont été restaurées en mémoire de session.' : ''));
    } catch (err) {
        const msg = err.message || 'erreur inconnue';
        // Message enrichi : aide l'utilisateur à diagnostiquer
        const isCryptoError = /operation-specific|decrypt|witness|corrompue/i.test(msg);
        if (isCryptoError) {
            alert(
                '🔐 Échec du déchiffrement\n\n' +
                'Cause : la clé de déchiffrement ne correspond pas à celle utilisée lors de l\'envoi.\n\n' +
                'Solutions :\n' +
                '1. Saisissez la phrase secrète EXACTE utilisée lors de la sauvegarde Drive\n' +
                '   (majuscules/minuscules et espaces comptent)\n' +
                '2. Si le backup a été créé sur un AUTRE appareil, il faut la même phrase\n' +
                '3. Si vous avez oublié la phrase, le backup ne peut PAS être récupéré\n' +
                '   (chiffrement AES-256 sans porte dérobée)\n\n' +
                'Détail technique : ' + msg
            );
        } else {
            alert('Échec de la restauration : ' + msg);
        }
    }
}

// --- Restauration d'une sauvegarde locale ---
function restoreLocalBackup(index) {
    const backups = listLocalBackups();
    const b = backups[index];
    if (!b) return;
    if (!confirm(`Restaurer la sauvegarde du ${new Date(b.at).toLocaleString('fr-FR')} ? Les données actuelles seront remplacées (une sauvegarde de l'état courant est prise avant).`)) return;

    createSnapshot('Avant restauration');
    assets    = b.data.assets;
    cessions  = b.data.cessions;
    arbitrages = b.data.arbitrages;
    if (b.data.cadranNames) {
        cadranNames = b.data.cadranNames;
        localStorage.setItem(pfKey('patriMonial_cadranNames'), JSON.stringify(cadranNames));
    }
    assets.forEach(normalizeAsset);
    cessions.forEach(normalizeCession);
    saveToStorage(); saveCessions(); saveArbitrages();
    refreshAllUI();
    renderDriveBackupList();
    alert('Sauvegarde restaurée.');
}

// =====================================================================
// FINNHUB — Cours Actions / ETF (Partie 4.1)
// =====================================================================
function saveFinnhubKey() {
    finnhubApiKey = document.getElementById('finnhub-key-input').value.trim();
    // ── SECURITY ── Session-only : pas de persistance dans localStorage.
    document.getElementById('finnhub-status').innerText = finnhubApiKey
        ? '✅ Clé enregistrée (mémoire de session)'
        : '⚠️ Aucune clé';
}

async function searchFinnhubSymbol(query) {
    if (!finnhubApiKey || query.length < 2) return [];
    try {
        const res = await fetch(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${finnhubApiKey}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return (data.result || []).slice(0, 8).map(r => ({
            type: 'stock',
            badge: r.type === 'ETP' ? 'ETF' : 'Action',
            badgeColor: r.type === 'ETP' ? 'bg-indigo-950 text-indigo-300 border-indigo-800/50' : 'bg-gray-800 text-gray-300 border-gray-700',
            name: r.description,
            ticker: r.symbol,
            tags: r.type === 'ETP' ? ['ETF'] : ['Action'],
            cadran: 'ASIE',
            taxCategory: 'NON_CONCERNE',
            priceEUR: 0
        }));
    } catch (err) { console.warn('Finnhub search failed:', err); return []; }
}

async function fetchFinnhubQuote(symbol) {
    if (!finnhubApiKey) return null;
    try {
        const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${finnhubApiKey}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return data.c || null;
    } catch (err) { console.warn(`Finnhub quote failed for ${symbol}:`, err); return null; }
}

// =====================================================================
// VALORISATION AUTOMATIQUE DES MÉTAUX PRÉCIEUX (Or / Argent)
// ---------------------------------------------------------------------
// Récupère les cours spot via Yahoo Futures :
//   • GC=F → Or (Gold Futures, USD/oz)
//   • SI=F → Argent (Silver Futures, USD/oz)
// Puis convertit en EUR/g et valorise chaque actif Or & Métaux.
//
// Sources dans l'ordre :
//   1. Yahoo Finance via proxy (GC=F / SI=F)
//   2. Stooq.com (CSV public, pas de CORS)
//   3. Dernier cours connu en cache localStorage (30 min TTL)
// =====================================================================

const METALS_CACHE_KEY = 'patriMonial_metalsCache';
const METALS_CACHE_TTL = 30 * 60 * 1000;   // 30 minutes
const TROY_OUNCE_IN_GRAMS = 31.1035;       // once troy = 31,1035 g

// --- Récupère le cours d'un symbole Yahoo (GC=F ou SI=F) ---
async function _fetchYahooMetalPriceUSD(symbol) {
    try {
        const price = await fetchYahooQuote(symbol);
        if (Number.isFinite(price) && price > 0) return price;
    } catch (err) {
        console.warn(`[Metals] Yahoo ${symbol} échoué :`, err.message);
    }
    return null;
}

// --- Fallback : Stooq.com (CSV public, pas de CORS) ---
async function _fetchStooqMetalPriceUSD(symbol) {
    const stooqSymbol = symbol === 'GC=F' ? 'xauusd' : 'xagusd';
    const url = `https://stooq.com/q/l/?s=${stooqSymbol}&f=sd2t2ohlc&h&e=csv`;
    const proxied = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);

    try {
        const res = await fetch(proxied);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const csv = await res.text();
        const lines = csv.trim().split('\n');
        if (lines.length < 2) throw new Error('CSV vide');
        const cols = lines[1].split(',');
        const close = parseFloat(cols[6]);
        if (Number.isFinite(close) && close > 0) return close;
    } catch (err) {
        console.warn(`[Metals] Stooq ${symbol} échoué :`, err.message);
    }
    return null;
}

// --- Récupère le cours Or/Argent en EUR/g (avec cache 30 min) ---
async function fetchMetalPriceEURPerGram(metal) {
    const symbol = metal === 'gold' ? 'GC=F' : 'SI=F';

    // 1) Cache localStorage
    try {
        const cached = JSON.parse(localStorage.getItem(METALS_CACHE_KEY) || '{}');
        const entry = cached[metal];
        if (entry && entry.timestamp && (Date.now() - entry.timestamp) < METALS_CACHE_TTL) {
            console.info(`[Metals] ${metal} : cache utilisé (${entry.eurPerGram.toFixed(4)} €/g)`);
            return entry.eurPerGram;
        }
    } catch (_) {}

    // 2) Yahoo via proxy
    let priceUSDPerOZ = await _fetchYahooMetalPriceUSD(symbol);

    // 3) Fallback Stooq
    if (!priceUSDPerOZ) {
        console.info(`[Metals] ${metal} : Yahoo échoué, tentative Stooq…`);
        priceUSDPerOZ = await _fetchStooqMetalPriceUSD(symbol);
    }

    if (!priceUSDPerOZ) {
        // 4) Dernier recours : cache expiré
        try {
            const cached = JSON.parse(localStorage.getItem(METALS_CACHE_KEY) || '{}');
            const entry = cached[metal];
            if (entry && entry.eurPerGram) {
                console.warn(`[Metals] ${metal} : toutes sources échouées, cache expiré utilisé`);
                return entry.eurPerGram;
            }
        } catch (_) {}
        return null;
    }

    // Conversion USD/oz → EUR/g
    const usdToEur = (typeof getFxRateSync === 'function') ? getFxRateSync('USD') : 0.92;
    const eurPerGram = (priceUSDPerOZ * usdToEur) / TROY_OUNCE_IN_GRAMS;

    try {
        const cached = JSON.parse(localStorage.getItem(METALS_CACHE_KEY) || '{}');
        cached[metal] = { eurPerGram, timestamp: Date.now(), source: 'yahoo' };
        localStorage.setItem(METALS_CACHE_KEY, JSON.stringify(cached));
    } catch (_) {}

    console.info(`[Metals] ${metal} : ${priceUSDPerOZ.toFixed(2)} $/oz → ${eurPerGram.toFixed(4)} €/g`);
    return eurPerGram;
}

// Compatibilité avec les anciens noms
async function fetchGoldPriceEURPerGram()   { return fetchMetalPriceEURPerGram('gold'); }
async function fetchSilverPriceEURPerGram() { return fetchMetalPriceEURPerGram('silver'); }

// --- Détecte le métal d'un actif (or ou argent) ---
function _detectMetalType(asset) {
    const name = String(asset.name || '').toLowerCase();
    const ticker = String(asset.ticker || '').toUpperCase();
    if (/silver|argent/i.test(name) || /^VS/i.test(ticker) || ticker.includes('SILVER')) {
        return 'silver';
    }
    return 'gold';
}

// --- Enrichit un asset avec weightGrams / primePct depuis le catalogue ---
function _enrichAssetFromCatalog(asset) {
    if (asset.weightGrams && asset.primePct !== undefined) return false;

    const ticker = String(asset.ticker || '').toUpperCase();
    if (!ticker) return false;

    const catalogItem = (typeof auCoffreCatalog !== 'undefined' ? auCoffreCatalog : [])
        .find(c => c.ticker.toUpperCase() === ticker);

    if (!catalogItem) return false;

    if (!asset.weightGrams && catalogItem.weightGrams) {
        asset.weightGrams = catalogItem.weightGrams;
    }
    if (asset.primePct === undefined && catalogItem.primePct !== undefined) {
        asset.primePct = catalogItem.primePct;
    }
    return true;
}

// --- Fonction principale : valorise tous les actifs Or & Métaux ---
async function updateAuCoffreAssetsFromGoldPrice() {
    // Enrichit d'abord les assets legacy
    let enriched = 0;
    assets.forEach(a => {
        if (hasTag(a, 'Or & Métaux') && _enrichAssetFromCatalog(a)) enriched++;
    });

    const metalAssets = assets.filter(a =>
        hasTag(a, 'Or & Métaux') &&
        a.weightGrams &&
        !a.manualValueOverride
    );

    if (metalAssets.length === 0) {
        if (enriched > 0) saveToStorage();
        return enriched;
    }

    // Récupère les cours des 2 métaux en parallèle
    const [goldPrice, silverPrice] = await Promise.all([
        fetchMetalPriceEURPerGram('gold'),
        fetchMetalPriceEURPerGram('silver')
    ]);

    if (!goldPrice && !silverPrice) {
        console.warn('[Metals] Aucun cours disponible, valorisation annulée');
        return enriched;
    }

    let updated = 0;
    const errors = [];

    metalAssets.forEach(a => {
        try {
            const metal = _detectMetalType(a);
            const pricePerGram = metal === 'silver' ? silverPrice : goldPrice;

            if (!pricePerGram) {
                errors.push(`${a.name} (${metal} indisponible)`);
                return;
            }

            const prime = Number(a.primePct) || 0;
            const estimatedValue = a.qty * a.weightGrams * pricePerGram * (1 + prime);

            if (Math.abs(estimatedValue - a.value) > 0.5) {
                const oldValue = a.value;
                a.value = Math.round(estimatedValue * 100) / 100;
                upsertTodayHistoryPoint(a, a.value, a.invested);
                updated++;
                console.info(`[Metals] ${a.name} : ${oldValue.toFixed(2)} € → ${a.value.toFixed(2)} €`);
            }
        } catch (err) {
            errors.push(`${a.name} : ${err.message}`);
        }
    });

    if (updated > 0 || enriched > 0) {
        saveToStorage();
    }

    if (errors.length > 0) {
        console.warn('[Metals] Erreurs partielles :\n' + errors.join('\n'));
    }

    return updated + enriched;
}

// Force un rafraîchissement (ignore le cache 30 min)
async function forceRefreshMetals() {
    try { localStorage.removeItem(METALS_CACHE_KEY); } catch (_) {}
    const n = await updateAuCoffreAssetsFromGoldPrice();
    if (n > 0 && typeof refreshAllUI === 'function') refreshAllUI();
    return n;
}

// Expose globalement
window.fetchMetalPriceEURPerGram   = fetchMetalPriceEURPerGram;
window.fetchSilverPriceEURPerGram  = fetchSilverPriceEURPerGram;
window.forceRefreshMetals          = forceRefreshMetals;

function openManualGoldUpdate(assetId) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;
    document.getElementById('manual-gold-asset-id').value = assetId;
    document.getElementById('manual-gold-price').value = asset.qty ? (asset.value / asset.qty).toFixed(2) : '';
    document.getElementById('manual-gold-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('manual-gold-source').value = '';
    document.getElementById('modal-manual-gold').classList.remove('hidden');
}

function handleManualGoldUpdate(e) {
    e.preventDefault();
    const assetId = parseFloat(document.getElementById('manual-gold-asset-id').value);
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;
    const unitPrice = parseFloat(document.getElementById('manual-gold-price').value);
    const updateDate = document.getElementById('manual-gold-date').value;
    const source = document.getElementById('manual-gold-source').value;
    asset.value = asset.qty * unitPrice;
    asset.manualValueOverride = true;
    asset.manualUpdateDate = updateDate;
    asset.manualUpdateSource = source;
    const dateFR = new Date(updateDate).toLocaleDateString('fr-FR');
    asset.history = (asset.history || []).filter(h => h.date !== dateFR);
    asset.history.push({ date: dateFR, value: asset.value, invested: asset.invested });
    saveToStorage();
    closeModal('modal-manual-gold');
    refreshAllUI();
    alert(`Valeur mise à jour : ${formatEUR(asset.value)} (${formatEUR(unitPrice)} / unité)`);
}

// =====================================================================


// =====================================================================
// SAUVEGARDE AUTOMATIQUE GOOGLE DRIVE (Chantier M)
// ---------------------------------------------------------------------
// Déclenche un push silencieux si :
//   • le dernier backup Drive date de plus de 24 h
//   • l'utilisateur est déjà connecté à Drive (driveAccessToken présent)
//   • une clé maîtresse est mémorisée sur cet appareil
// Si l'une de ces conditions n'est pas remplie, on ne fait RIEN — pas de
// popup OAuth surprise, pas de demande de mot de passe inopinée.
// =====================================================================

const AUTO_BACKUP_KEY = 'patriMonial_lastAutoDriveBackup';
const AUTO_BACKUP_INTERVAL_MS = 24 * 3600 * 1000; // 24 h

// Renvoie true si un push silencieux peut / doit être déclenché.
async function shouldAutoBackupToDrive() {
    // 1) Connecté à Drive ?
    if (!driveAccessToken) return false;

    // 2) Clé maîtresse mémorisée ?
    try {
        const has = await hasStoredMasterKey();
        if (!has) return false;
    } catch (_) { return false; }

    // 3) Intervalle écoulé ?
    const lastStr = localStorage.getItem(AUTO_BACKUP_KEY);
    if (lastStr) {
        const last = parseInt(lastStr, 10);
        if (Number.isFinite(last) && (Date.now() - last) < AUTO_BACKUP_INTERVAL_MS) {
            return false;
        }
    }

    return true;
}

// Push silencieux — n'affiche aucune boîte de dialogue, ne demande rien.
// Retourne true si succès, false sinon. Les erreurs sont loggées en console
// uniquement (pas d'alerte).
async function performSilentDriveBackup() {
    try {
        const envelope = await encryptPayload(currentDataSnapshot(true), null);
        const metadata = {
            name: 'patrimonial-backup-auto-' + Date.now() + '.json',
            parents: ['appDataFolder']
        };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([JSON.stringify(envelope)], { type: 'application/json' }));

        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + driveAccessToken },
            body: form
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);

        localStorage.setItem(AUTO_BACKUP_KEY, String(Date.now()));
        console.info('[Auto-Backup] Sauvegarde silencieuse envoyée sur Drive.');
        return true;
    } catch (err) {
        console.warn('[Auto-Backup] Échec du push silencieux :', err);
        return false;
    }
}

// Point d'entrée appelé au démarrage par app7-init.js. Vérifie l'opportunité
// et déclenche le push en arrière-plan si possible.
async function checkAndRunAutoDriveBackup() {
    try {
        const should = await shouldAutoBackupToDrive();
        if (!should) return;

        // Léger différé pour ne pas bloquer le premier rendu
        setTimeout(async () => {
            const ok = await performSilentDriveBackup();
            if (ok && typeof showUndoToast === 'function') {
                // Utilise le toast Undo existant (non intrusif, disparaît seul)
                showUndoToast('Sauvegarde Drive automatique effectuée.', false);
            }
        }, 2500);
    } catch (err) {
        console.warn('[Auto-Backup] Erreur :', err);
    }
}

// Force un backup manuel silencieux (bouton "Sauvegarder maintenant" depuis
// le modal Drive, ou raccourci clavier).
async function forceAutoDriveBackup() {
    if (!driveAccessToken) {
        alert('Connectez-vous d\'abord à Google Drive (bouton "Se connecter à Drive").');
        return;
    }
    const has = await hasStoredMasterKey();
    if (!has) {
        alert('Aucune phrase secrète mémorisée. Faites au moins un envoi manuel avec une phrase pour activer la sauvegarde automatique.');
        return;
    }
    const ok = await performSilentDriveBackup();
    if (ok) {
        if (typeof showUndoToast === 'function') {
            showUndoToast('Sauvegarde Drive manuelle effectuée.', false);
        }
    } else {
        alert('Échec de la sauvegarde silencieuse. Vérifiez votre connexion.');
    }
}

// =====================================================================
// BENCHMARK RÉEL — Bouton de téléchargement (Chantier 1.6)
// =====================================================================
// Télécharge la série historique du benchmark (CW8.PA en priorité) et
// force un recalcul complet des ratios de risque.
async function downloadBenchmarkAndRecalc(force = false) {
    const btn  = document.getElementById('btn-download-benchmark');
    const icon = document.getElementById('icon-download-benchmark');
    if (btn)  btn.disabled = true;
    if (icon) icon.classList.add('fa-spin');

    showProgressToast('Téléchargement du benchmark…', 'CW8.PA (MSCI World)', 20);

    try {
        const result = await refreshBenchmarkSeries({ force: true });
        updateProgressToast(`Symbole : ${result.meta.symbol} · ${result.series.length} points`, 70);

        // Force un recalcul immédiat
        if (typeof invalidateTIRCache === 'function') invalidateTIRCache();
        if (typeof calculateRiskMetrics === 'function') calculateRiskMetrics();

        updateProgressToast('Ratios recalculés', 100);
        hideProgressToast(400);

        if (typeof showUndoToast === 'function') {
            showUndoToast(`Benchmark ${result.meta.symbol} chargé (${result.series.length} points, source ${result.meta.source})`, false);
        }
    } catch (err) {
        hideProgressToast(0);
        alert(
            `Impossible de télécharger le benchmark :\n\n${err.message}\n\n` +
            `Sources testées : ${BENCHMARK_SYMBOLS.join(', ')}\n\n` +
            `Vérifiez votre connexion, ou configurez une clé Twelve Data ` +
            `(bouton « Synchronisation ») pour une source plus fiable.`
        );
    } finally {
        if (btn)  btn.disabled = false;
        if (icon) icon.classList.remove('fa-spin');
    }
}

// =====================================================================
// SECTION INDEXEDDB — Modal Synchronisation (Chantier 5.2)
// =====================================================================
// Affiche l'état du miroir IndexedDB (date du dernier snapshot, nombre
// d'entités) et propose une restauration manuelle ou un snapshot immédiat.

async function refreshIdbSection() {
    const infoEl  = document.getElementById('idb-snapshot-info');
    const badgeEl = document.getElementById('idb-status-badge');
    if (!infoEl) return;

    // Vérifie la disponibilité d'IndexedDB
    if (!window.indexedDB || typeof loadFromIdb !== 'function') {
        infoEl.innerHTML = '<div class="text-gray-500 italic">IndexedDB non disponible dans ce navigateur.</div>';
        if (badgeEl) {
            badgeEl.innerText = 'Indisponible';
            badgeEl.className = 'text-[9px] px-1.5 py-0.5 rounded border border-rose-800/50 bg-rose-950/40 text-rose-300 font-normal';
        }
        return;
    }

    // Force un snapshot immédiat si demandé par l'utilisateur
    // (le bouton "Snapshot maintenant" appelle refreshIdbSection après forceIdbMirror)

    try {
        const idbData = await loadFromIdb(currentPortfolioId);

        if (!idbData || (!idbData.assets && !idbData.cessions && !idbData.arbitrages)) {
            infoEl.innerHTML = '<div class="text-gray-500 italic">Aucun snapshot enregistré pour ce portefeuille.</div>';
            if (badgeEl) {
                badgeEl.innerText = 'Vide';
                badgeEl.className = 'text-[9px] px-1.5 py-0.5 rounded border border-gray-700 bg-gray-800 text-gray-500 font-normal';
            }
            return;
        }

        const countA  = Array.isArray(idbData.assets) ? idbData.assets.length : 0;
        const countC  = Array.isArray(idbData.cessions) ? idbData.cessions.length : 0;
        const countAr = Array.isArray(idbData.arbitrages) ? idbData.arbitrages.length : 0;
        const dateStr = idbData.updatedAt
            ? new Date(idbData.updatedAt).toLocaleString('fr-FR')
            : 'date inconnue';

        // Calcule la fraîcheur
        const ageMin = idbData.updatedAt ? Math.round((Date.now() - idbData.updatedAt) / 60000) : null;
        const freshLabel = ageMin === null ? '—'
            : ageMin < 1 ? 'à l\'instant'
            : ageMin < 60 ? `il y a ${ageMin} min`
            : ageMin < 1440 ? `il y a ${Math.floor(ageMin / 60)} h`
            : `il y a ${Math.floor(ageMin / 1440)} j`;
        const freshColor = ageMin === null ? 'text-gray-500'
            : ageMin < 60 ? 'text-emerald-400'
            : ageMin < 1440 ? 'text-amber-400'
            : 'text-rose-400';

        infoEl.innerHTML = `
            <div class="flex justify-between items-baseline gap-2">
                <span class="text-gray-400">Dernier snapshot :</span>
                <span class="text-gray-200 font-mono text-[10px]">${escapeHTML(dateStr)}</span>
            </div>
            <div class="flex justify-between items-baseline gap-2">
                <span class="text-gray-400">Fraîcheur :</span>
                <span class="${freshColor} font-mono text-[10px]">${freshLabel}</span>
            </div>
            <div class="flex justify-between items-baseline gap-2 pt-1 border-t border-gray-800 mt-1">
                <span class="text-gray-400">Contenu :</span>
                <span class="text-gray-300 font-mono text-[10px]">${countA} actif(s) · ${countC} cession(s) · ${countAr} arbitrage(s)</span>
            </div>
        `;

        if (badgeEl) {
            if (ageMin !== null && ageMin < 60) {
                badgeEl.innerText = 'À jour';
                badgeEl.className = 'text-[9px] px-1.5 py-0.5 rounded border border-emerald-800/50 bg-emerald-950/40 text-emerald-300 font-normal';
            } else if (ageMin !== null && ageMin < 1440) {
                badgeEl.innerText = 'Récent';
                badgeEl.className = 'text-[9px] px-1.5 py-0.5 rounded border border-amber-800/50 bg-amber-950/40 text-amber-300 font-normal';
            } else {
                badgeEl.innerText = 'Ancien';
                badgeEl.className = 'text-[9px] px-1.5 py-0.5 rounded border border-rose-800/50 bg-rose-950/40 text-rose-300 font-normal';
            }
        }
    } catch (err) {
        console.warn('[IDB Section] Erreur :', err);
        infoEl.innerHTML = `<div class="text-rose-400 text-[10px]">Erreur de lecture : ${escapeHTML(err.message)}</div>`;
    }
}

// Force un snapshot immédiat dans IndexedDB puis rafraîchit la section.
async function forceIdbSnapshotNow() {
    if (typeof forceIdbMirror !== 'function') return;
    try {
        await forceIdbMirror();
        if (typeof toastSuccess === 'function') {
            toastSuccess('Snapshot IndexedDB', 'Écriture immédiate effectuée.');
        }
        await refreshIdbSection();
    } catch (err) {
        if (typeof toastError === 'function') {
            toastError('Snapshot échoué', err.message || 'Erreur inconnue');
        }
    }
}

// Restauration manuelle depuis IndexedDB (avec confirmation).
async function restoreFromIdbManual() {
    if (typeof loadFromIdb !== 'function') {
        alert('Module IndexedDB non disponible.');
        return;
    }
    const idbData = await loadFromIdb(currentPortfolioId);
    if (!idbData || (!idbData.assets && !idbData.cessions && !idbData.arbitrages)) {
        alert('Aucun snapshot IndexedDB disponible pour ce portefeuille.');
        return;
    }

    const countA  = Array.isArray(idbData.assets) ? idbData.assets.length : 0;
    const countC  = Array.isArray(idbData.cessions) ? idbData.cessions.length : 0;
    const countAr = Array.isArray(idbData.arbitrages) ? idbData.arbitrages.length : 0;
    const dateStr = idbData.updatedAt ? new Date(idbData.updatedAt).toLocaleString('fr-FR') : '—';

    if (!confirm(
        `Restaurer depuis IndexedDB ?\n\n` +
        `Date du snapshot : ${dateStr}\n` +
        `Contenu : ${countA} actif(s) · ${countC} cession(s) · ${countAr} arbitrage(s)\n\n` +
        `Vos données actuelles seront REMPLACÉES. Une sauvegarde locale de l'état actuel sera créée avant.`
    )) return;

    // Sauvegarde défensive avant écrasement
    if (typeof createSnapshot === 'function') createSnapshot('Avant restauration IDB');
    if (typeof pushUndo === 'function') pushUndo('Restauration IndexedDB (manuelle)');

    // Restaure chaque ensemble disponible
    if (Array.isArray(idbData.assets))      assets = idbData.assets;
    if (Array.isArray(idbData.cessions))    cessions = idbData.cessions;
    if (Array.isArray(idbData.arbitrages))  arbitrages = idbData.arbitrages;

    // Normalisation
    assets.forEach(a => { if (typeof migrateAssetToV2 === 'function') migrateAssetToV2(a); });
    cessions.forEach(c => { if (typeof normalizeCession === 'function') normalizeCession(c); });

    // Persistance
    if (typeof saveToStorage === 'function') saveToStorage();
    if (typeof saveCessions === 'function') saveCessions();
    if (typeof saveArbitrages === 'function') saveArbitrages();
    if (typeof refreshAllUI === 'function') refreshAllUI();

    if (typeof toastSuccess === 'function') {
        toastSuccess('Données restaurées', `${countA} actif(s) · ${countC} cession(s) · ${countAr} arbitrage(s)`);
    }
    closeModal('modal-drive-sync');
}

// Expose l'API globalement
window.refreshIdbSection = refreshIdbSection;
window.forceIdbSnapshotNow = forceIdbSnapshotNow;
window.restoreFromIdbManual = restoreFromIdbManual;

// =====================================================================
// SECTION COMPACTION D'HISTORIQUE (Chantier 5.2 — dette technique)
// =====================================================================
// Affiche l'aperçu de ce qui serait supprimé pour un nombre d'années
// donné, puis applique la compaction avec undo (Ctrl+Z).

let _compactionYears = 2;

function onCompactionYearsChange(value) {
    const v = parseInt(value, 10);
    _compactionYears = Number.isFinite(v) && v >= 1 ? v : 2;
    const labelEl = document.getElementById('compaction-years-label');
    if (labelEl) labelEl.innerText = _compactionYears + (_compactionYears > 1 ? ' ans' : ' an');
    refreshCompactionPreview();
}

// Calcule et affiche l'aperçu sans modifier les données
function refreshCompactionPreview() {
    const previewEl = document.getElementById('compaction-preview');
    const badgeEl = document.getElementById('compaction-size-badge');
    if (!previewEl) return;

    // Vérifie que la fonction est disponible
    if (typeof previewHistoryCompaction !== 'function') {
        previewEl.innerHTML = '<div class="text-gray-500 italic">Module de compaction non disponible.</div>';
        return;
    }

    const preview = previewHistoryCompaction(_compactionYears);
    const { assetsAffected, pointsRemoved, currentBytes, estimatedBytes } = preview;

    // Badge de taille
    if (badgeEl && typeof formatBytes === 'function') {
        badgeEl.innerText = formatBytes(currentBytes);
        badgeEl.className = currentBytes > 4 * 1024 * 1024
            ? 'text-[9px] px-1.5 py-0.5 rounded border border-rose-800/50 bg-rose-950/40 text-rose-300 font-normal'
            : currentBytes > 2 * 1024 * 1024
                ? 'text-[9px] px-1.5 py-0.5 rounded border border-amber-800/50 bg-amber-950/40 text-amber-300 font-normal'
                : 'text-[9px] px-1.5 py-0.5 rounded border border-emerald-800/50 bg-emerald-950/40 text-emerald-300 font-normal';
    }

    // Pas de suppression à faire
    if (pointsRemoved === 0) {
        previewEl.innerHTML = `
            <div class="flex items-center gap-2 text-emerald-400">
                <i class="fa-solid fa-circle-check text-[11px]"></i>
                <span>Aucun point à supprimer pour ${_compactionYears} an${_compactionYears > 1 ? 's' : ''}.</span>
            </div>
            <div class="text-[10px] text-gray-500">Taille actuelle : <span class="font-mono text-gray-400">${formatBytes(currentBytes)}</span></div>
        `;
        const applyBtn = document.getElementById('compaction-apply-btn');
        if (applyBtn) applyBtn.disabled = true;
        return;
    }

    // Aperçu chiffré
    const ratio = currentBytes > 0 ? (1 - estimatedBytes / currentBytes) * 100 : 0;
    previewEl.innerHTML = `
        <div class="flex justify-between items-baseline">
            <span class="text-gray-400">Points à supprimer :</span>
            <span class="font-mono font-bold text-amber-300">${pointsRemoved.toLocaleString('fr-FR')}</span>
        </div>
        <div class="flex justify-between items-baseline">
            <span class="text-gray-400">Actifs concernés :</span>
            <span class="font-mono text-gray-300">${assetsAffected}</span>
        </div>
        <div class="flex justify-between items-baseline pt-1 border-t border-gray-800 mt-1">
            <span class="text-gray-400">Taille avant :</span>
            <span class="font-mono text-gray-300">${formatBytes(currentBytes)}</span>
        </div>
        <div class="flex justify-between items-baseline">
            <span class="text-gray-400">Taille estimée après :</span>
            <span class="font-mono text-emerald-400">${formatBytes(estimatedBytes)} <span class="text-[10px] text-emerald-300/70">(−${ratio.toFixed(0)} %)</span></span>
        </div>
        <div class="text-[10px] text-gray-500 mt-1.5 leading-relaxed">
            <i class="fa-solid fa-circle-info text-blue-400 mr-1"></i>
            <b>Non impacté :</b> lots, achats, cessions, TRI, fiscalité, badge session, sparkline 30 j, heatmap 12 mois.
        </div>
    `;

    const applyBtn = document.getElementById('compaction-apply-btn');
    if (applyBtn) applyBtn.disabled = false;
}

// Applique la compaction après confirmation.
async function applyCompaction() {
    if (typeof compactAllHistories !== 'function') {
        alert('Module de compaction non disponible.');
        return;
    }

    const preview = previewHistoryCompaction(_compactionYears);
    if (preview.pointsRemoved === 0) {
        if (typeof toastInfo === 'function') {
            toastInfo('Rien à compacter', `Aucun point d'historique de plus de ${_compactionYears} an${_compactionYears > 1 ? 's' : ''}.`);
        }
        return;
    }

    if (!confirm(
        `Compacter l'historique ?\n\n` +
        `• Points supprimés : ${preview.pointsRemoved.toLocaleString('fr-FR')}\n` +
        `• Actifs concernés : ${preview.assetsAffected}\n` +
        `• Taille : ${formatBytes(preview.currentBytes)} → ≈ ${formatBytes(preview.estimatedBytes)}\n\n` +
        `Les données suivantes sont PRÉSERVÉES :\n` +
        `  ✓ Lots et prix de revient\n` +
        `  ✓ Achats, ventes, cessions\n` +
        `  ✓ Calculs fiscaux et TRI\n\n` +
        `Seul le graphique « Tout l'historique » perdra les points anciens.\n\n` +
        `Réversible via Ctrl+Z.`
    )) return;

    // Capture pour undo
    if (typeof pushUndo === 'function') pushUndo(`Compaction historique (${_compactionYears} ans)`);

    const result = compactAllHistories(_compactionYears);

    // Persiste + mirror IDB + refresh
    if (typeof saveToStorage === 'function') saveToStorage();
    if (typeof forceIdbMirror === 'function') forceIdbMirror().catch(() => {});

    // Invalide les caches dépendants (les sparklines et heatmaps peuvent
    // référencer les points supprimés)
    if (typeof _sparklineCache !== 'undefined' && _sparklineCache.clear) _sparklineCache.clear();

    if (typeof refreshAllUI === 'function') refreshAllUI();

    // Toast de confirmation
    if (typeof toastSuccess === 'function') {
        toastSuccess(
            'Compaction réussie',
            `${result.pointsRemoved.toLocaleString('fr-FR')} point(s) supprimé(s) sur ${result.assetsAffected} actif(s) · Taille : ${formatBytes(result.beforeBytes)} → ${formatBytes(result.afterBytes)}`
        );
    }

    // Rafraîchit l'aperçu (qui devrait maintenant être vide)
    setTimeout(refreshCompactionPreview, 200);
}

// Expose l'API globalement
window.onCompactionYearsChange = onCompactionYearsChange;
window.refreshCompactionPreview = refreshCompactionPreview;
window.applyCompaction = applyCompaction;
