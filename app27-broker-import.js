// =====================================================================
// app27-broker-import.js — IMPORT DEPUIS API BROKER (Chantier 1.7)
// Dépend de : app1-core.js, app6-api.js (proxy Yahoo déjà configuré)
// Charge après app26-sidebar.js, avant app7-init.js
// =====================================================================
//
// ⚠ SÉCURITÉ — À LIRE AVANT TOUTE UTILISATION :
//
//   1. Utilisez UNIQUEMENT des clés API en LECTURE SEULE (read-only).
//      Ne JAMAIS activer les permissions de trading ou de retrait.
//   2. Les clés sont stockées dans localStorage du navigateur — elles ne
//      quittent JAMAIS votre appareil. Aucun serveur tiers n'intercepte
//      les requêtes (les APIs broker sont appelées directement en fetch).
//   3. Si votre navigateur ou une extension peut lire localStorage, elle
//      peut techniquement lire ces clés. Pour un niveau de sécurité
//      maximal, préférez des clés read-only avec restriction IP.
//   4. La fonction « Effacer les clés » purge immédiatement les
//      credentials du localStorage.
//
// PÉRIMÈTRE FONCTIONNEL :
//   • Binance    : soldes spot (API signée HMAC-SHA256)
//   • Coinbase   : soldes compte (via proxy CORS allorigins.win)
//   • Kraken     : soldes balance (API signée HMAC-SHA512)
//   • Autres brokers (Trade Republic, IBKR) : pas d'API navigateur
//     accessible → non supportés (à faire via export CSV)
//
// L'import est TOUJOURS présenté en prévisualisation : l'utilisateur
// voit les positions détectées, coche celles qu'il veut importer, puis
// valide la fusion. Rien n'est écrit en base avant confirmation.

// ---------------------------------------------------------------------
// CONSTANTES
// ---------------------------------------------------------------------
const BROKER_KEYS_STORAGE = 'patriMonial_brokerKeys';
const BROKER_SUPPORTED = ['binance', 'coinbase', 'kraken'];

// Symboles de devises fiat à ignorer (ce sont des liquidités, pas des cryptos)
const BROKER_FIAT_SYMBOLS = new Set(['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'FDUSD']);

// Mapping Binance → ticker interne + id CoinGecko (pour récupérer le cours EUR)
const BINANCE_ASSET_MAP = {
    'BTC': { ticker: 'BTC', coingeckoId: 'bitcoin', name: 'Bitcoin' },
    'ETH': { ticker: 'ETH', coingeckoId: 'ethereum', name: 'Ethereum' },
    'SOL': { ticker: 'SOL', coingeckoId: 'solana', name: 'Solana' },
    'ADA': { ticker: 'ADA', coingeckoId: 'cardano', name: 'Cardano' },
    'XRP': { ticker: 'XRP', coingeckoId: 'ripple', name: 'Ripple' },
    'DOGE': { ticker: 'DOGE', coingeckoId: 'dogecoin', name: 'Dogecoin' },
    'BNB': { ticker: 'BNB', coingeckoId: 'binancecoin', name: 'Binance Coin' },
    'LTC': { ticker: 'LTC', coingeckoId: 'litecoin', name: 'Litecoin' },
    'DOT': { ticker: 'DOT', coingeckoId: 'polkadot', name: 'Polkadot' },
    'AVAX': { ticker: 'AVAX', coingeckoId: 'avalanche-2', name: 'Avalanche' },
    'MATIC': { ticker: 'MATIC', coingeckoId: 'matic-network', name: 'Polygon' },
    'LINK': { ticker: 'LINK', coingeckoId: 'chainlink', name: 'Chainlink' }
};

// ---------------------------------------------------------------------
// STOCKAGE DES CLÉS API (localStorage, séparées par broker)
// ---------------------------------------------------------------------
function loadBrokerKeys() {
    try {
        const raw = localStorage.getItem(BROKER_KEYS_STORAGE);
        if (raw) return JSON.parse(raw);
    } catch (_) {}
    return {};
}

function saveBrokerKeys(keys) {
    try {
        localStorage.setItem(BROKER_KEYS_STORAGE, JSON.stringify(keys || {}));
    } catch (err) {
        console.warn('[Broker] Sauvegarde clés impossible :', err);
    }
}

function getBrokerKeys(broker) {
    const all = loadBrokerKeys();
    return all[broker] || null;
}

function setBrokerKeys(broker, key, secret, extra = {}) {
    const all = loadBrokerKeys();
    all[broker] = { key, secret, ...extra, savedAt: Date.now() };
    saveBrokerKeys(all);
}

function clearBrokerKeys(broker) {
    const all = loadBrokerKeys();
    if (broker) {
        delete all[broker];
    } else {
        Object.keys(all).forEach(k => delete all[k]);
    }
    saveBrokerKeys(all);
}

// ---------------------------------------------------------------------
// HELPERS CRYPTO (Web Crypto API — natif navigateur)
// ---------------------------------------------------------------------

// Encode une chaîne en Uint8Array UTF-8
function _strToBytes(s) {
    return new TextEncoder().encode(String(s));
}

// Encode en hexadécimal
function _bytesToHex(buf) {
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Encode en base64
function _bytesToBase64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

// HMAC-SHA256 (utilisé par Binance)
async function hmacSHA256Hex(secret, message) {
    const key = await crypto.subtle.importKey(
        'raw', _strToBytes(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, _strToBytes(message));
    return _bytesToHex(sig);
}

// SHA-256 simple (utilisé par Kraken pour l'étape 1 de la signature)
async function sha256Bytes(message) {
    const buf = await crypto.subtle.digest('SHA-256', message);
    return new Uint8Array(buf);
}

// HMAC-SHA512 retournant un ArrayBuffer (utilisé par Kraken)
async function hmacSHA512Base64(binaryKey, message) {
    const key = await crypto.subtle.importKey(
        'raw', binaryKey,
        { name: 'HMAC', hash: 'SHA-512' },
        false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, _strToBytes(message));
    return _bytesToBase64(sig);
}

// ---------------------------------------------------------------------
// HELPERS DE FORMATAGE DES RÉSULTATS
// ---------------------------------------------------------------------

// Formate une position détectée en objet unifié pour la preview :
//   { broker, rawSymbol, ticker, name, qty, priceEUR, valueEUR, coingeckoId }
async function _buildPosition(broker, rawSymbol, qty, coingeckoId, name) {
    // Récupère le cours en EUR via CoinGecko (endpoint public, sans clé)
    let priceEUR = 0;
    try {
        const res = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coingeckoId)}&vs_currencies=eur`
        );
        if (res.ok) {
            const data = await res.json();
            priceEUR = data[coingeckoId]?.eur || 0;
        }
    } catch (_) { /* silencieux */ }

    return {
        broker,
        rawSymbol,
        ticker: rawSymbol,
        name: name || rawSymbol,
        qty: Number(qty) || 0,
        priceEUR: Number(priceEUR) || 0,
        valueEUR: (Number(qty) || 0) * (Number(priceEUR) || 0),
        coingeckoId
    };
}

// ---------------------------------------------------------------------
// CONNECTEURS — STRUCTURE COMMUNE
// ---------------------------------------------------------------------
// Chaque connecteur est une fonction async qui retourne :
//   { positions: [{ broker, ticker, name, qty, priceEUR, valueEUR, coingeckoId }],
//     errors: [...] }
//
// L'API broker peut refuser la requête pour plusieurs raisons :
//   • clés invalides → erreur 401
//   • permissions insuffisantes → erreur 403
//   • CORS bloqué (Coinbase) → utilise le proxy allorigins
//   • réseau hors ligne → erreur réseau

// =====================================================================
// CONNECTEUR 1 : BINANCE
// =====================================================================
// Endpoint : GET /api/v3/account
// Doc : https://binance-docs.github.io/apidocs/spot/en/#account-information-user_data
//
// Signature :
//   queryString = "timestamp=" + Date.now() + "&recvWindow=10000"
//   signature   = HMAC_SHA256(secretKey, queryString)
//   Header      : X-MBX-APIKEY: <apiKey>
//   URL finale  : /api/v3/account?timestamp=...&recvWindow=10000&signature=...
async function fetchBinanceBalances(apiKey, secretKey) {
    const endpoint = 'https://api.binance.com/api/v3/account';
    const timestamp = Date.now();
    const recvWindow = 10000;
    const query = `timestamp=${timestamp}&recvWindow=${recvWindow}`;
    const signature = await hmacSHA256Hex(secretKey, query);
    const url = `${endpoint}?${query}&signature=${signature}`;

    const res = await fetch(url, {
        method: 'GET',
        headers: { 'X-MBX-APIKEY': apiKey }
    });
    if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Binance HTTP ${res.status}${txt ? ' : ' + txt.slice(0, 200) : ''}`);
    }
    const data = await res.json();
    if (!data.balances || !Array.isArray(data.balances)) {
        throw new Error('Réponse Binance inattendue (pas de champ balances)');
    }
    return data.balances;
}

// Convertit les balances Binance en positions Crypto PatriMonial
async function importBinancePositions(apiKey, secretKey) {
    const balances = await fetchBinanceBalances(apiKey, secretKey);
    const positions = [];
    const errors = [];

    for (const b of balances) {
        const asset = String(b.asset || '').toUpperCase();
        const free = parseFloat(b.free) || 0;
        const locked = parseFloat(b.locked) || 0;
        const total = free + locked;
        if (total <= 0) continue;
        // Ignore les stablecoins et les fiat (ce sont des liquidités, pas des cryptos)
        if (BROKER_FIAT_SYMBOLS.has(asset)) continue;

        const mapping = BINANCE_ASSET_MAP[asset];
        if (!mapping) {
            errors.push(`${asset} : non supporté par le catalogue (quantité ${total})`);
            continue;
        }
        const pos = await _buildPosition('binance', mapping.ticker, total, mapping.coingeckoId, mapping.name);
        positions.push(pos);
        // Pause 1 s pour ne pas spammer CoinGecko (limite 10-30 req/min sans clé)
        await new Promise(r => setTimeout(r, 1000));
    }
    return { positions, errors };
}

// =====================================================================
// CONNECTEUR 2 : COINBASE
// =====================================================================
// Endpoint : GET /v2/accounts
// Doc : https://docs.cloud.coinbase.com/sign-in-with-coinbase/docs/api-accounts
//
// ⚠ CORS : l'endpoint privé de Coinbase ne renvoie PAS les headers
//   Access-Control-Allow-Origin → un fetch direct depuis le navigateur
//   échoue. On utilise donc le proxy allorigins.win (déjà utilisé pour
//   Yahoo dans app6-api.js).
//
// Authentification : Coinbase utilise un système de JWT signé (ES256)
//   complexe. Pour rester pragmatique, on utilise l'ancien système
//   CB-ACCESS-KEY / CB-ACCESS-SIGN (HMAC-SHA256) qui est encore
//   supporté par l'API v2.
async function fetchCoinbaseBalances(apiKey, secretKey) {
    throw new Error('Coinbase : l\'API v2 (CB-ACCESS-*) est dépréciée depuis 2023. Utilisez l\'export CSV officiel (menu « Documents » du compte Coinbase) puis la fonction « Import CSV ».');
    // eslint-disable-next-line no-unreachable
    const path = '/v2/accounts?limit=100';
    const timestamp = Math.floor(Date.now() / 1000);
    const method = 'GET';
    const message = timestamp + method + path;
    const signature = await hmacSHA256Hex(secretKey, message);

    const url = 'https://api.coinbase.com' + path;
    const proxied = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);

    const res = await fetch(proxied, {
        method: 'GET',
        headers: {
            'CB-ACCESS-KEY': apiKey,
            'CB-ACCESS-SIGN': signature,
            'CB-ACCESS-TIMESTAMP': String(timestamp),
            'CB-VERSION': '2024-01-01'
        }
    });
    if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Coinbase HTTP ${res.status}${txt ? ' : ' + txt.slice(0, 200) : ''}`);
    }
    const data = await res.json();
    if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Réponse Coinbase inattendue (pas de champ data)');
    }
    return data.data;
}

async function importCoinbasePositions(apiKey, secretKey) {
    const accounts = await fetchCoinbaseBalances(apiKey, secretKey);
    const positions = [];
    const errors = [];

    for (const acc of accounts) {
        const asset = String(acc.balance?.currency || '').toUpperCase();
        const qty = parseFloat(acc.balance?.amount) || 0;
        if (qty <= 0) continue;
        if (BROKER_FIAT_SYMBOLS.has(asset)) continue;

        // Coinbase utilise les mêmes tickers que Binance
        const mapping = BINANCE_ASSET_MAP[asset];
        if (!mapping) {
            errors.push(`${asset} : non supporté par le catalogue (quantité ${qty})`);
            continue;
        }
        const pos = await _buildPosition('coinbase', mapping.ticker, qty, mapping.coingeckoId, mapping.name);
        positions.push(pos);
        await new Promise(r => setTimeout(r, 1000));
    }
    return { positions, errors };
}

// =====================================================================
// CONNECTEUR 3 : KRAKEN
// =====================================================================
// Endpoint : POST /0/private/Balance
// Doc : https://docs.kraken.com/rest/#tag/Account-Data/operation/getAccountBalance
//
// Signature (algorithme Kraken, plus complexe que Binance) :
//   postData = "nonce=<timestamp_ms>"
//   message = path + SHA256(nonce + postData)  → encodé en binaire
//   secret  = base64_decode(apiSecret)
//   signature = HMAC_SHA512(secret, message)   → encodé en base64
async function fetchKrakenBalances(apiKey, secretKey) {
    const path = '/0/private/Balance';
    const nonce = Date.now();
    const postData = `nonce=${nonce}`;

    // Étape 1 : SHA256 de (nonce + postData)
    const sha = await sha256Bytes(_strToBytes(nonce + postData));

    // Étape 2 : concatène path + sha (binaire)
    const pathBytes = _strToBytes(path);
    const message = new Uint8Array(pathBytes.length + sha.length);
    message.set(pathBytes, 0);
    message.set(sha, pathBytes.length);

    // Étape 3 : HMAC-SHA512 avec le secret base64-décodé
    let secretBytes;
    try {
        secretBytes = Uint8Array.from(atob(secretKey), c => c.charCodeAt(0));
    } catch (_) {
        throw new Error('Clé secrète Kraken invalide (base64 attendu)');
    }
    const signature = await hmacSHA512Base64(secretBytes, message);

    // Requête POST (Kraken ne supporte que POST pour les endpoints privés)
    const url = 'https://api.kraken.com' + path;
    const proxied = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);

    const res = await fetch(proxied, {
        method: 'POST',
        headers: {
            'API-Key': apiKey,
            'API-Sign': signature,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: postData
    });
    if (!res.ok) throw new Error(`Kraken HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data.error) && data.error.length) {
        throw new Error('Kraken : ' + data.error.join(', '));
    }
    if (!data.result || typeof data.result !== 'object') {
        throw new Error('Réponse Kraken inattendue (pas de champ result)');
    }
    return data.result;
}

// Kraken utilise des tickers particuliers (XBT pour Bitcoin, XDG pour Dogecoin…)
const KRAKEN_TICKER_MAP = {
    'XBT': 'BTC', 'XDG': 'DOGE', 'XXBT': 'BTC', 'XETH': 'ETH',
    'XXRP': 'XRP', 'XLTC': 'LTC', 'XZEC': 'ZEC', 'XREP': 'REP'
};

async function importKrakenPositions(apiKey, secretKey) {
    const balances = await fetchKrakenBalances(apiKey, secretKey);
    const positions = [];
    const errors = [];

    for (const [rawAsset, rawQty] of Object.entries(balances)) {
        let asset = rawAsset.toUpperCase();
        // Retire le préfixe Z (fiat) et X (crypto historique)
        asset = asset.replace(/^Z/, '').replace(/^X/, '');
        // Applique le mapping Kraken → standard
        asset = KRAKEN_TICKER_MAP[asset] || asset;

        const qty = parseFloat(rawQty) || 0;
        if (qty <= 0) continue;
        if (BROKER_FIAT_SYMBOLS.has(asset)) continue;

        const mapping = BINANCE_ASSET_MAP[asset];
        if (!mapping) {
            errors.push(`${rawAsset} : non supporté par le catalogue (quantité ${qty})`);
            continue;
        }
        const pos = await _buildPosition('kraken', mapping.ticker, qty, mapping.coingeckoId, mapping.name);
        positions.push(pos);
        await new Promise(r => setTimeout(r, 1000));
    }
    return { positions, errors };
}

// ---------------------------------------------------------------------
// POINT D'ENTRÉE UNIFIÉ
// ---------------------------------------------------------------------
// brokerId : 'binance' | 'coinbase' | 'kraken'
// Renvoie { positions, errors, broker } — jamais de throw global.
async function fetchBrokerPositions(brokerId) {
    const keys = getBrokerKeys(brokerId);
    if (!keys || !keys.key || !keys.secret) {
        return { positions: [], errors: ['Clés API non configurées pour ' + brokerId], broker: brokerId };
    }

    try {
        if (brokerId === 'binance')  return { ...(await importBinancePositions(keys.key, keys.secret)), broker: brokerId };
        if (brokerId === 'coinbase') return { ...(await importCoinbasePositions(keys.key, keys.secret)), broker: brokerId };
        if (brokerId === 'kraken')   return { ...(await importKrakenPositions(keys.key, keys.secret)), broker: brokerId };
        return { positions: [], errors: ['Broker non supporté : ' + brokerId], broker: brokerId };
    } catch (err) {
        return { positions: [], errors: [err.message || 'Erreur inconnue'], broker: brokerId };
    }
}

// ---------------------------------------------------------------------
// INITIALISATION
// ---------------------------------------------------------------------
function initBrokerImportModule() {
    // Rien de spécifique à faire au boot — tout est déclenché par le modal.
    // On expose juste les helpers globalement (déjà fait en bas du fichier).
    console.info('[BrokerImport] Module chargé — 3 brokers supportés (binance, coinbase, kraken).');
}

// =====================================================================
// ÉTAT DU MODAL
// =====================================================================
const BROKER_TOTAL_STEPS = 3;

let brokerImportState = {
    step: 1,
    broker: '',                 // 'binance' | 'coinbase' | 'kraken'
    keys: { key: '', secret: '' },
    positions: [],              // positions détectées (après test)
    errors: [],                 // erreurs lors du fetch
    selected: new Set(),        // clés des positions cochées (ticker)
    importing: false            // flag pour bloquer les double-clics
};

// Métadonnées d'affichage par broker (logo, couleur, doc)
const BROKER_META = {
    binance: {
        label: 'Binance',
        icon: 'fa-brands fa-bitcoin',
        color: 'text-yellow-400',
        bg: 'bg-yellow-950/30',
        bd: 'border-yellow-700/50',
        hint: 'Clé API avec permission « Enable Reading » uniquement (jamais « Enable Trading » ni « Enable Withdrawals »).',
        docUrl: 'https://www.binance.com/fr/my/settings/api-management',
        placeholder: { key: 'Clé API Binance (X-MBX-APIKEY)', secret: 'Clé secrète Binance' }
    },
    coinbase: {
        label: 'Coinbase',
        icon: 'fa-solid fa-circle-dollar-to-slot',
        color: 'text-blue-400',
        bg: 'bg-blue-950/30',
        bd: 'border-blue-700/50',
        hint: '⚠ L\'API v2 de Coinbase (CB-ACCESS-*) est dépréciée depuis 2023. Utilisez l\'export CSV officiel de Coinbase — l\'import automatique n\'est plus supporté.',
        docUrl: 'https://www.coinbase.com/settings/api',
        placeholder: { key: 'Indisponible', secret: 'Indisponible' }
    },
    kraken: {
        label: 'Kraken',
        icon: 'fa-solid fa-anchor',
        color: 'text-purple-400',
        bg: 'bg-purple-950/30',
        bd: 'border-purple-700/50',
        hint: 'Clé API créée sur Kraken avec permissions « Query Funds » uniquement (pas de trading ni retrait).',
        docUrl: 'https://pro.kraken.com/app/settings/api',
        placeholder: { key: 'Clé API Kraken (API-Key)', secret: 'Clé secrète (base64)' }
    }
};

// =====================================================================
// OUVERTURE / FERMETURE
// =====================================================================
function openBrokerImportModal() {
    // Reset l'état (mais conserve les clés déjà saisies pour ce broker)
    brokerImportState.step = 1;
    brokerImportState.broker = '';
    brokerImportState.keys = { key: '', secret: '' };
    brokerImportState.positions = [];
    brokerImportState.errors = [];
    brokerImportState.selected.clear();
    brokerImportState.importing = false;

    document.getElementById('modal-broker-import').classList.remove('hidden');
    renderBrokerImportStep();
}

// =====================================================================
// NAVIGATION
// =====================================================================
function brokerImportNextStep() {
    const step = brokerImportState.step;

    // Étape 1 → 2 : on teste la connexion et récupère les positions
    if (step === 1) {
        if (!brokerImportState.broker) {
            alert('Sélectionnez un broker.');
            return;
        }
        if (!brokerImportState.keys.key || !brokerImportState.keys.secret) {
            alert('Renseignez la clé API et la clé secrète.');
            return;
        }
        testBrokerConnection();   // asynchrone, gère la transition
        return;
    }

    // Étape 2 → 3 : on passe simplement (les positions sont déjà sélectionnées)
    if (step === 2) {
        if (brokerImportState.selected.size === 0) {
            alert('Cochez au moins une position à importer.');
            return;
        }
        brokerImportState.step = 3;
        renderBrokerImportStep();
        return;
    }

    // Étape 3 : confirmation finale
    if (step === 3) {
        confirmBrokerImport();
    }
}

function brokerImportPrevStep() {
    if (brokerImportState.step <= 1) return;
    brokerImportState.step--;
    renderBrokerImportStep();
}

// =====================================================================
// RENDU DU MODAL — DISPATCHER
// =====================================================================
function renderBrokerImportStep() {
    const step = brokerImportState.step;

    // Label + segments de progression
    const labels = ['Choix du broker', 'Prévisualisation', 'Confirmation'];
    document.getElementById('broker-step-label').innerText = `Étape ${step} · ${labels[step - 1]}`;
    const pct = Math.round((step / BROKER_TOTAL_STEPS) * 100);
    document.getElementById('broker-step-percent').innerText = pct + ' %';

    for (let i = 0; i < BROKER_TOTAL_STEPS; i++) {
        const seg = document.getElementById('broker-progress-' + i);
        if (!seg) continue;
        if (i < step) {
            seg.className = 'flex-1 h-1 rounded-full bg-purple-500 transition-all';
        } else {
            seg.className = 'flex-1 h-1 rounded-full bg-gray-800 transition-all';
        }
    }

    // Bouton "Retour" visible dès l'étape 2
    const prevBtn = document.getElementById('broker-prev-btn');
    if (prevBtn) prevBtn.classList.toggle('hidden', step === 1);

    // Libellé du bouton principal selon l'étape
    const nextLabel = document.getElementById('broker-next-label');
    const nextIcon  = document.getElementById('broker-next-icon');
    if (step === 1) {
        nextLabel.innerText = 'Tester la connexion';
        nextIcon.className = 'fa-solid fa-plug text-[10px]';
    } else if (step === 2) {
        nextLabel.innerText = 'Continuer';
        nextIcon.className = 'fa-solid fa-arrow-right text-[10px]';
    } else {
        nextLabel.innerText = 'Confirmer l\'import';
        nextIcon.className = 'fa-solid fa-check text-[10px]';
    }

    // Contenu dynamique
    const content = document.getElementById('broker-step-content');
    if (!content) return;
    if (step === 1) content.innerHTML = _renderBrokerStep1();
    else if (step === 2) content.innerHTML = _renderBrokerStep2();
    else content.innerHTML = _renderBrokerStep3();

    // Listeners post-render
    if (step === 1) _attachBrokerStep1Listeners();
}

// =====================================================================
// ÉTAPE 1 — Choix du broker + saisie des clés
// =====================================================================
function _renderBrokerStep1() {
    const current = brokerImportState.broker;

    const brokerCards = Object.entries(BROKER_META).map(([id, meta]) => {
        const isActive = current === id;
        return `
            <button type="button" onclick="selectBroker('${id}')" class="p-3 rounded-xl border ${isActive ? 'border-purple-500 bg-purple-950/30' : 'border-gray-800 bg-gray-950/40 hover:border-gray-700'} text-left transition">
                <div class="flex items-center gap-2.5">
                    <span class="flex-shrink-0 w-9 h-9 rounded-lg ${meta.bg} border ${meta.bd} flex items-center justify-center ${meta.color}">
                        <i class="${meta.icon}"></i>
                    </span>
                    <div class="min-w-0 flex-1">
                        <div class="font-bold text-white text-[12px]">${escapeHTML(meta.label)}</div>
                        <div class="text-[10px] text-gray-500">${id === 'binance' ? 'Spot EUR' : id === 'coinbase' ? 'Compte principal' : 'Balance spot'}</div>
                    </div>
                    ${isActive ? '<i class="fa-solid fa-circle-check text-purple-400 text-sm"></i>' : ''}
                </div>
            </button>`;
    }).join('');

    // Formulaire clés (affiché seulement si un broker est sélectionné)
    const meta = current ? BROKER_META[current] : null;
    const keysForm = meta ? `
        <div class="bg-gray-950 border border-gray-800 rounded-xl p-4 space-y-3">
            <div class="flex items-center justify-between">
                <div class="text-[11px] font-bold ${meta.color} uppercase tracking-wider flex items-center gap-1.5">
                    <i class="fa-solid fa-key text-[10px]"></i>
                    Clés API ${escapeHTML(meta.label)}
                </div>
                <a href="${meta.docUrl}" target="_blank" rel="noopener noreferrer" class="text-[10px] text-indigo-400 hover:text-indigo-300 underline">
                    <i class="fa-solid fa-external-link text-[9px]"></i> Créer une clé
                </a>
            </div>

            <div class="bg-amber-950/20 border border-amber-800/40 rounded-lg p-2.5 text-[10px] text-amber-200 leading-relaxed">
                <i class="fa-solid fa-triangle-exclamation mr-1 text-amber-400"></i>
                <b>Sécurité :</b> ${escapeHTML(meta.hint)}
            </div>

            <div>
                <label class="block text-gray-400 mb-1">Clé API publique</label>
                <input type="password" id="broker-key-input" placeholder="${escapeHTML(meta.placeholder.key)}" value="${escapeHTML(brokerImportState.keys.key)}" autocomplete="off" class="w-full bg-gray-900 border border-gray-800 rounded-lg p-2 text-white font-mono text-[11px] focus:outline-none focus:border-purple-500">
            </div>

            <div>
                <label class="block text-gray-400 mb-1">Clé secrète</label>
                <input type="password" id="broker-secret-input" placeholder="${escapeHTML(meta.placeholder.secret)}" value="${escapeHTML(brokerImportState.keys.secret)}" autocomplete="off" class="w-full bg-gray-900 border border-gray-800 rounded-lg p-2 text-white font-mono text-[11px] focus:outline-none focus:border-purple-500">
            </div>

            <label class="flex items-center gap-2 cursor-pointer select-none text-[11px] text-gray-300">
                <input type="checkbox" id="broker-save-keys" class="accent-purple-500">
                <span>Mémoriser ces clés dans ce navigateur (localStorage)</span>
            </label>

            ${brokerImportState.keys.key ? `
                <button type="button" onclick="clearBrokerKeysAndRefresh()" class="text-[10px] text-rose-400 hover:text-rose-300 underline">
                    <i class="fa-solid fa-trash text-[9px] mr-1"></i> Effacer les clés mémorisées pour ${escapeHTML(meta.label)}
                </button>
            ` : ''}
        </div>
    ` : `
        <div class="bg-gray-950/40 border border-dashed border-gray-700 rounded-xl p-6 text-center text-[11px] text-gray-500 italic">
            <i class="fa-solid fa-arrow-up text-gray-600 text-lg block mb-1"></i>
            Sélectionnez un broker ci-dessus pour saisir vos clés API.
        </div>
    `;

    return `
        <div class="space-y-4">
            <div>
                <div class="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Exchange à connecter</div>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">${brokerCards}</div>
            </div>
            ${keysForm}
            <div class="bg-blue-950/20 border border-blue-800/40 rounded-xl p-3 text-[10px] text-blue-200 leading-relaxed">
                <i class="fa-solid fa-shield-halved text-blue-400 mr-1"></i>
                <b>Comment ça marche :</b> l'application appelle directement l'API publique de votre exchange depuis votre navigateur. Aucun serveur intermédiaire. Les clés sont chiffrées uniquement si vous cochez « Mémoriser » — sinon elles restent en mémoire volatile le temps de la session.
            </div>
        </div>
    `;
}

// =====================================================================
// SÉLECTION DU BROKER
// =====================================================================
function selectBroker(brokerId) {
    brokerImportState.broker = brokerId;

    // Pré-remplit avec les clés déjà mémorisées pour ce broker
    const saved = getBrokerKeys(brokerId);
    if (saved && saved.key && saved.secret) {
        brokerImportState.keys = { key: saved.key, secret: saved.secret };
    } else {
        brokerImportState.keys = { key: '', secret: '' };
    }

    renderBrokerImportStep();
}

// Efface les clés mémorisées pour le broker courant
function clearBrokerKeysAndRefresh() {
    if (!brokerImportState.broker) return;
    if (!confirm(`Effacer les clés API mémorisées pour ${BROKER_META[brokerImportState.broker].label} ?`)) return;
    clearBrokerKeys(brokerImportState.broker);
    brokerImportState.keys = { key: '', secret: '' };
    renderBrokerImportStep();
    if (typeof toastInfo === 'function') {
        toastInfo('Clés effacées', 'Les identifiants ont été supprimés de ce navigateur.');
    }
}

// =====================================================================
// LISTENERS ÉTAPE 1
// =====================================================================
function _attachBrokerStep1Listeners() {
    const keyInput = document.getElementById('broker-key-input');
    const secretInput = document.getElementById('broker-secret-input');
    if (keyInput) keyInput.addEventListener('input', () => {
        brokerImportState.keys.key = keyInput.value.trim();
    });
    if (secretInput) secretInput.addEventListener('input', () => {
        brokerImportState.keys.secret = secretInput.value.trim();
    });
}

// Expose l'API globalement
window.fetchBrokerPositions = fetchBrokerPositions;
window.getBrokerKeys = getBrokerKeys;
window.setBrokerKeys = setBrokerKeys;
window.clearBrokerKeys = clearBrokerKeys;
window.BROKER_SUPPORTED = BROKER_SUPPORTED;
window.openBrokerImportModal = openBrokerImportModal;
window.brokerImportNextStep = brokerImportNextStep;
window.brokerImportPrevStep = brokerImportPrevStep;
window.renderBrokerImportStep = renderBrokerImportStep;
window.selectBroker = selectBroker;
window.clearBrokerKeysAndRefresh = clearBrokerKeysAndRefresh;

// =====================================================================
// TEST DE CONNEXION + RÉCUPÉRATION DES POSITIONS (Étape 1 → 2)
// =====================================================================
async function testBrokerConnection() {
    if (brokerImportState.importing) return;
    brokerImportState.importing = true;

    const brokerId = brokerImportState.broker;
    const meta = BROKER_META[brokerId];

    // Feedback visuel : spinner dans le bouton principal
    const nextLabel = document.getElementById('broker-next-label');
    const nextIcon  = document.getElementById('broker-next-icon');
    const nextBtn   = document.getElementById('broker-next-btn');
    if (nextBtn) nextBtn.disabled = true;
    if (nextLabel) nextLabel.innerText = 'Connexion…';
    if (nextIcon) nextIcon.className = 'fa-solid fa-spinner fa-spin text-[10px]';

    // Affiche un état "chargement" dans la zone de contenu
    const content = document.getElementById('broker-step-content');
    if (content) {
        content.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 gap-3">
                <div class="w-12 h-12 rounded-xl ${meta.bg} border ${meta.bd} flex items-center justify-center ${meta.color}">
                    <i class="${meta.icon} text-xl"></i>
                </div>
                <div class="text-[12px] text-white font-bold">Connexion à ${escapeHTML(meta.label)}…</div>
                <div class="text-[11px] text-gray-500" id="broker-progress-detail">Signature de la requête…</div>
                <div class="w-48 h-1 bg-gray-800 rounded-full overflow-hidden mt-1">
                    <div class="h-full bg-purple-500 animate-pulse" style="width: 60%"></div>
                </div>
            </div>
        `;
    }

    // Message détaillé (peut prendre quelques secondes : appels CoinGecko en série)
    setTimeout(() => {
        const d = document.getElementById('broker-progress-detail');
        if (d) d.innerText = 'Récupération des soldes et cours EUR…';
    }, 1200);

    // Appel asynchrone au module broker
    const result = await fetchBrokerPositions(brokerId);

    brokerImportState.importing = false;
    if (nextBtn) nextBtn.disabled = false;

    // Gestion d'erreurs
    if (result.errors.length && result.positions.length === 0) {
        // Échec total — affiche un message d'erreur, reste sur l'étape 1
        if (content) {
            content.innerHTML = `
                <div class="bg-rose-950/30 border border-rose-800/50 rounded-xl p-4 space-y-2">
                    <div class="flex items-start gap-3">
                        <i class="fa-solid fa-circle-exclamation text-rose-400 text-lg"></i>
                        <div>
                            <div class="font-bold text-white text-sm">Connexion refusée</div>
                            <div class="text-[11px] text-rose-200 mt-1 leading-relaxed">${result.errors.map(e => escapeHTML(e)).join('<br>')}</div>
                        </div>
                    </div>
                    <div class="text-[10px] text-gray-400 bg-gray-950/60 rounded-lg p-2.5 mt-2 leading-relaxed">
                        <b>Pistes :</b> vérifiez que vos clés sont en <b>lecture seule</b>, que vous avez activé la permission « Reading » (Binance) ou « Query Funds » (Kraken), que votre adresse IP n'est pas bloquée, et que l'horloge de votre ordinateur est à l'heure (une dérive > 1 min fait échouer la signature).
                    </div>
                </div>
            `;
        }
        // Restaure le libellé du bouton
        if (nextLabel) nextLabel.innerText = 'Tester la connexion';
        if (nextIcon) nextIcon.className = 'fa-solid fa-plug text-[10px]';
        // Bandeau de progression remis à 1
        for (let i = 0; i < BROKER_TOTAL_STEPS; i++) {
            const seg = document.getElementById('broker-progress-' + i);
            if (!seg) continue;
            seg.className = i === 0
                ? 'flex-1 h-1 rounded-full bg-purple-500 transition-all'
                : 'flex-1 h-1 rounded-full bg-gray-800 transition-all';
        }
        return;
    }

    // Succès (total ou partiel)
    brokerImportState.positions = result.positions;
    brokerImportState.errors = result.errors;

    // Sélectionne par défaut TOUTES les positions
    brokerImportState.selected = new Set(result.positions.map(p => p.ticker));

    // Mémorise les clés si la case était cochée
    const saveCb = document.getElementById('broker-save-keys');
    if (saveCb && saveCb.checked) {
        setBrokerKeys(brokerId, brokerImportState.keys.key, brokerImportState.keys.secret);
    }

    // Toasts informatifs
    if (typeof toastSuccess === 'function' && result.positions.length > 0) {
        toastSuccess(
            `${result.positions.length} position(s) détectée(s)`,
            result.errors.length > 0
                ? `${result.errors.length} actif(s) ignoré(s) — voir détails.`
                : 'Toutes les positions crypto ont été récupérées.'
        );
    }

    // Passe à l'étape 2
    brokerImportState.step = 2;
    renderBrokerImportStep();
}

// =====================================================================
// ÉTAPE 2 — Prévisualisation des positions
// =====================================================================
function _renderBrokerStep2() {
    const positions = brokerImportState.positions;
    const errors = brokerImportState.errors;

    if (!positions.length) {
        return `
            <div class="text-center py-8 text-gray-500 italic text-sm">
                <i class="fa-solid fa-inbox text-3xl text-gray-700 mb-2 block"></i>
                Aucune position détectée sur ce compte.
            </div>
        `;
    }

    const totalValue = positions.reduce((s, p) => s + (p.valueEUR || 0), 0);

    // Carte de position avec checkbox
    const rowsHTML = positions.map(p => {
        const isSelected = brokerImportState.selected.has(p.ticker);
        return `
            <label class="flex items-center gap-3 p-2.5 bg-gray-950/40 border ${isSelected ? 'border-purple-700/60 bg-purple-950/20' : 'border-gray-800'} rounded-lg cursor-pointer hover:border-purple-700 transition">
                <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleBrokerPosition('${p.ticker}', this.checked)" class="accent-purple-500 mt-0.5">
                <span class="flex-shrink-0 w-9 h-9 rounded-lg bg-purple-950/60 border border-purple-800/50 flex items-center justify-center text-purple-400 font-bold text-[11px]">
                    ${escapeHTML(p.ticker.slice(0, 4))}
                </span>
                <div class="flex-1 min-w-0">
                    <div class="font-bold text-white text-[12px] truncate">${escapeHTML(p.name)}</div>
                    <div class="text-[10px] text-gray-500 font-mono">
                        ${fmtQty(p.qty)} × ${formatEUR(p.priceEUR)}
                    </div>
                </div>
                <div class="text-right flex-shrink-0">
                    <div class="font-mono font-bold text-white text-[12px]">${formatEUR(p.valueEUR)}</div>
                    <div class="text-[9px] text-gray-500">${totalValue > 0 ? ((p.valueEUR / totalValue) * 100).toFixed(1) + ' %' : '—'}</div>
                </div>
            </label>`;
    }).join('');

    // Bloc erreurs (positions ignorées)
    const errorsHTML = errors.length ? `
        <div class="bg-amber-950/20 border border-amber-800/40 rounded-xl p-3 mt-3">
            <div class="text-[11px] font-bold text-amber-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <i class="fa-solid fa-triangle-exclamation text-[10px]"></i>
                ${errors.length} actif(s) ignoré(s)
            </div>
            <div class="text-[10px] text-amber-100 space-y-0.5 max-h-24 overflow-y-auto">
                ${errors.map(e => `<div>· ${escapeHTML(e)}</div>`).join('')}
            </div>
            <div class="text-[10px] text-gray-400 mt-2 italic">
                Ajoutez ces cryptos manuellement si nécessaire (via « Ajouter un actif »).
            </div>
        </div>
    ` : '';

    // Résumé en haut
    const selectedCount = brokerImportState.selected.size;
    const selectedValue = positions
        .filter(p => brokerImportState.selected.has(p.ticker))
        .reduce((s, p) => s + (p.valueEUR || 0), 0);

    return `
        <div class="space-y-3">
            <div class="grid grid-cols-3 gap-2">
                <div class="bg-gray-950 border border-gray-800 rounded-lg p-2.5">
                    <div class="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Détectées</div>
                    <div class="font-mono font-bold text-white">${positions.length}</div>
                </div>
                <div class="bg-purple-950/30 border border-purple-800/50 rounded-lg p-2.5">
                    <div class="text-[9px] text-purple-300 uppercase tracking-wider mb-0.5">Sélectionnées</div>
                    <div class="font-mono font-bold text-white">${selectedCount}</div>
                </div>
                <div class="bg-gray-950 border border-gray-800 rounded-lg p-2.5">
                    <div class="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Valeur totale</div>
                    <div class="font-mono font-bold text-emerald-400 text-[12px]">${formatEUR(selectedValue)}</div>
                </div>
            </div>

            <div class="flex justify-between items-center text-[11px]">
                <span class="text-gray-400 font-bold uppercase tracking-wider">Positions détectées</span>
                <div class="flex gap-1.5">
                    <button type="button" onclick="toggleAllBrokerPositions(true)" class="text-[10px] text-purple-400 hover:text-purple-300">Tout cocher</button>
                    <span class="text-gray-700">·</span>
                    <button type="button" onclick="toggleAllBrokerPositions(false)" class="text-[10px] text-purple-400 hover:text-purple-300">Tout décocher</button>
                </div>
            </div>

            <div class="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">${rowsHTML}</div>

            ${errorsHTML}

            <div class="bg-blue-950/20 border border-blue-800/40 rounded-xl p-3 text-[10px] text-blue-200 leading-relaxed">
                <i class="fa-solid fa-circle-info text-blue-400 mr-1"></i>
                <b>Prochaine étape :</b> vous validerez la fusion. Chaque position deviendra un actif
                <b>Crypto</b>, ou sera <b>fusionnée</b> à un actif existant si le ticker correspond déjà.
                La quantité importée sera <b>ajoutée</b> à la quantité actuelle — pensez à vérifier avant de valider.
            </div>
        </div>
    `;
}

// Coche / décoche une position
function toggleBrokerPosition(ticker, checked) {
    if (checked) brokerImportState.selected.add(ticker);
    else brokerImportState.selected.delete(ticker);
    renderBrokerImportStep();
}

// Coche / décoche tout d'un coup
function toggleAllBrokerPositions(selectAll) {
    if (selectAll) {
        brokerImportState.selected = new Set(brokerImportState.positions.map(p => p.ticker));
    } else {
        brokerImportState.selected.clear();
    }
    renderBrokerImportStep();
}

window.testBrokerConnection = testBrokerConnection;
window.toggleBrokerPosition = toggleBrokerPosition;
window.toggleAllBrokerPositions = toggleAllBrokerPositions;

// =====================================================================
// ÉTAPE 3 — Confirmation finale + fusion
// =====================================================================
function _renderBrokerStep3() {
    const positions = brokerImportState.positions;
    const selected = positions.filter(p => brokerImportState.selected.has(p.ticker));
    const meta = BROKER_META[brokerImportState.broker];

    if (!selected.length) {
        return `<div class="text-center py-8 text-gray-500 italic text-sm">Aucune position sélectionnée.</div>`;
    }

    // Analyser en amont les conséquences de l'import (dry-run)
    const analysis = _analyzeBrokerImport(selected);

    const totalValue = selected.reduce((s, p) => s + (p.valueEUR || 0), 0);

    // Rendu par catégorie : nouvelles créations vs fusions
    const newRows = analysis.toCreate.map(p => `
        <div class="flex items-center justify-between gap-2 py-1.5 border-b border-gray-800/60 last:border-b-0">
            <div class="flex items-center gap-2 min-w-0">
                <span class="flex-shrink-0 w-2 h-2 rounded-full bg-emerald-500"></span>
                <span class="font-bold text-white text-[11px] truncate">${escapeHTML(p.name)}</span>
                <span class="text-[10px] text-gray-500 font-mono">${escapeHTML(p.ticker)}</span>
            </div>
            <span class="text-[11px] font-mono text-gray-300 whitespace-nowrap">${fmtQty(p.qty)} → ${formatEUR(p.valueEUR)}</span>
        </div>
    `).join('');

    const mergeRows = analysis.toMerge.map(item => `
        <div class="flex items-center justify-between gap-2 py-1.5 border-b border-gray-800/60 last:border-b-0">
            <div class="flex items-center gap-2 min-w-0">
                <span class="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500"></span>
                <span class="font-bold text-white text-[11px] truncate">${escapeHTML(item.position.name)}</span>
                <span class="text-[10px] text-blue-300 font-mono">fusion</span>
            </div>
            <span class="text-[10px] text-gray-400 whitespace-nowrap">
                ${fmtQty(item.existing.qty)} + ${fmtQty(item.position.qty)} = <b class="text-white">${fmtQty(item.newQty)}</b>
            </span>
        </div>
    `).join('');

    return `
        <div class="space-y-4">
            <!-- En-tête -->
            <div class="flex items-start gap-3">
                <div class="flex-shrink-0 w-10 h-10 rounded-xl ${meta.bg} border ${meta.bd} flex items-center justify-center ${meta.color}">
                    <i class="${meta.icon} text-lg"></i>
                </div>
                <div>
                    <h4 class="text-base font-bold text-white">Confirmer l'import depuis ${escapeHTML(meta.label)}</h4>
                    <p class="text-[11px] text-gray-400 mt-1 leading-relaxed">
                        Vérifiez le récapitulatif ci-dessous. Les quantités seront <b>ajoutées</b> à vos positions existantes
                        (aucune donnée n'est écrasée). Aucune cession ni modification fiscale n'est enregistrée.
                    </p>
                </div>
            </div>

            <!-- Résumé chiffré -->
            <div class="grid grid-cols-3 gap-2">
                <div class="bg-gray-950 border border-gray-800 rounded-lg p-2.5">
                    <div class="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Positions</div>
                    <div class="font-mono font-bold text-white">${selected.length}</div>
                </div>
                <div class="bg-emerald-950/30 border border-emerald-800/50 rounded-lg p-2.5">
                    <div class="text-[9px] text-emerald-300 uppercase tracking-wider mb-0.5">Nouveaux actifs</div>
                    <div class="font-mono font-bold text-white">${analysis.toCreate.length}</div>
                </div>
                <div class="bg-blue-950/30 border border-blue-800/50 rounded-lg p-2.5">
                    <div class="text-[9px] text-blue-300 uppercase tracking-wider mb-0.5">Fusions</div>
                    <div class="font-mono font-bold text-white">${analysis.toMerge.length}</div>
                </div>
            </div>

            <!-- Liste : créations -->
            ${analysis.toCreate.length ? `
                <div class="bg-gray-950/40 border border-emerald-900/40 rounded-xl p-3">
                    <div class="text-[11px] font-bold text-emerald-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <i class="fa-solid fa-plus-circle text-[10px]"></i>
                        Nouveaux actifs (${analysis.toCreate.length})
                    </div>
                    <div class="max-h-40 overflow-y-auto">${newRows}</div>
                </div>
            ` : ''}

            <!-- Liste : fusions -->
            ${analysis.toMerge.length ? `
                <div class="bg-gray-950/40 border border-blue-900/40 rounded-xl p-3">
                    <div class="text-[11px] font-bold text-blue-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <i class="fa-solid fa-code-merge text-[10px]"></i>
                        Fusions avec actifs existants (${analysis.toMerge.length})
                    </div>
                    <div class="max-h-40 overflow-y-auto">${mergeRows}</div>
                </div>
            ` : ''}

            <!-- Valeur totale -->
            <div class="bg-gradient-to-br from-purple-950/40 to-indigo-950/30 border border-purple-800/50 rounded-xl p-4 flex justify-between items-center">
                <span class="text-[11px] text-purple-200 uppercase tracking-wider font-bold">Valeur totale importée</span>
                <span class="text-xl font-bold font-mono text-white">${formatEUR(totalValue)}</span>
            </div>

            <!-- Avertissement -->
            <div class="bg-amber-950/20 border border-amber-800/40 rounded-xl p-3 text-[10px] text-amber-200 leading-relaxed">
                <i class="fa-solid fa-triangle-exclamation text-amber-400 mr-1"></i>
                <b>Fiscalité :</b> cet import crée ou modifie des <b>positions actuelles</b>. Il ne génère
                <b>aucune cession</b>. Si votre courtier vous fournit le détail de vos achats (prix PRU, dates),
                saisissez-les ensuite via « Modifier » sur chaque actif pour affiner le calcul du TRI et de
                l'impôt futur. Sans ces informations, le PRU sera calculé au <b>prix du jour de l'import</b>.
            </div>
        </div>
    `;
}

// ---------------------------------------------------------------------
// ANALYSE PRÉ-IMPORT (dry-run)
// ---------------------------------------------------------------------
// Parcourt les positions sélectionnées et détecte :
//   • toCreate : positions sans actif existant correspondant
//   • toMerge  : positions à fusionner avec un actif existant (par ticker)
function _analyzeBrokerImport(selectedPositions) {
    const toCreate = [];
    const toMerge = [];

    selectedPositions.forEach(pos => {
        // Cherche un actif existant avec le même ticker ET tag Crypto
        const existing = assets.find(a =>
            !isPaperAsset(a) &&
            hasTag(a, 'Crypto') &&
            (a.ticker || '').toUpperCase() === pos.ticker.toUpperCase()
        );

        if (existing) {
            toMerge.push({
                position: pos,
                existing,
                newQty: (existing.qty || 0) + pos.qty
            });
        } else {
            toCreate.push(pos);
        }
    });

    return { toCreate, toMerge };
}

// ---------------------------------------------------------------------
// FUSION EFFECTIVE
// ---------------------------------------------------------------------
async function confirmBrokerImport() {
    if (brokerImportState.importing) return;
    brokerImportState.importing = true;

    const positions = brokerImportState.positions.filter(p => brokerImportState.selected.has(p.ticker));
    const brokerId = brokerImportState.broker;
    const meta = BROKER_META[brokerId];
    const analysis = _analyzeBrokerImport(positions);

    // Confirmation finale
    const totalQty = positions.reduce((s, p) => s + (p.qty || 0), 0);
    if (!confirm(
        `Confirmer l'import de ${positions.length} position(s) depuis ${meta.label} ?\n\n` +
        `• ${analysis.toCreate.length} nouvel/aux actif(s)\n` +
        `• ${analysis.toMerge.length} fusion(s)\n\n` +
        `Les quantités seront AJOUTÉES à votre portefeuille. Cette action est réversible via Ctrl+Z.`
    )) {
        brokerImportState.importing = false;
        return;
    }

    // Capture pour undo
    if (typeof pushUndo === 'function') {
        pushUndo(`Import ${meta.label} (${positions.length} positions)`);
    }

    const todayISO = new Date().toISOString().slice(0, 10);
    const todayFR  = new Date().toLocaleDateString('fr-FR');

    let created = 0, merged = 0, failed = 0;
    const failures = [];

    // --- 1) Nouvelles créations ---
    analysis.toCreate.forEach(pos => {
        try {
            const newAsset = {
                id: Date.now() + Math.floor(Math.random() * 100000),
                name: pos.name || pos.ticker,
                ticker: pos.ticker,
                categories: ['Crypto'],
                taxCategory: 'NON_CONCERNE',
                cadrans: { primary: 'CRYPTO', secondary: [] },
                cadran: 'CRYPTO',
                qty: pos.qty,
                frais: 0,
                invested: pos.qty * pos.priceEUR,
                value: pos.valueEUR,
                envelope: '',
                envelopeOpenedAt: '',
                zone: 'UE',
                valuationMode: 'QUOTE',
                yahooTicker: '',
                purchaseDate: todayISO,
                broker: meta.label,
                lots: [typeof makeLot === 'function'
                    ? makeLot(todayISO, pos.qty, pos.priceEUR, 0, '')
                    : { id: Date.now(), date: todayISO, qty: pos.qty, qtyRemaining: pos.qty, price: pos.priceEUR, frais: 0, reference: '' }],
                buys: [{
                    date: todayFR,
                    type: `Import ${meta.label}`,
                    qty: pos.qty,
                    price: pos.priceEUR,
                    frais: 0,
                    total: pos.qty * pos.priceEUR,
                    reference: ''
                }],
                history: [{
                    date: todayFR,
                    value: pos.valueEUR,
                    invested: pos.qty * pos.priceEUR
                }],
                dividends: [],
                splits: []
            };
            if (typeof normalizeAsset === 'function') normalizeAsset(newAsset);
            assets.push(newAsset);
            created++;
        } catch (err) {
            failed++;
            failures.push(`${pos.ticker} : ${err.message}`);
        }
    });

    // --- 2) Fusions ---
    analysis.toMerge.forEach(item => {
        try {
            const existing = item.existing;
            const pos = item.position;

            // Valeur unitaire marché AVANT modification
            const oldUnitValue = existing.qty > 0 ? (existing.value / existing.qty) : pos.priceEUR;

            // Nouveau lot
            const newLot = typeof makeLot === 'function'
                ? makeLot(todayISO, pos.qty, pos.priceEUR, 0, '')
                : { id: Date.now() + Math.floor(Math.random() * 1000), date: todayISO, qty: pos.qty, qtyRemaining: pos.qty, price: pos.priceEUR, frais: 0, reference: '' };

            existing.lots = (existing.lots || []).concat([newLot]);
            existing.buys = (existing.buys || []).concat([{
                date: todayFR,
                type: `Import ${meta.label}`,
                qty: pos.qty,
                price: pos.priceEUR,
                frais: 0,
                total: pos.qty * pos.priceEUR,
                reference: ''
            }]);

            // Recalcule qty / invested / frais depuis les lots
            if (typeof syncAssetFromLots === 'function') syncAssetFromLots(existing);

            // Recalcule la valeur de marché = nouvelle quantité × dernier prix connu
            existing.value = Math.round(existing.qty * oldUnitValue * 100) / 100;

            if (typeof upsertTodayHistoryPoint === 'function') {
                upsertTodayHistoryPoint(existing, existing.value, existing.invested);
            }
            merged++;
        } catch (err) {
            failed++;
            failures.push(`${item.position.ticker} (fusion) : ${err.message}`);
        }
    });

    // --- 3) Sauvegarde + rafraîchissement ---
    if (typeof saveToStorage === 'function') saveToStorage();

    brokerImportState.importing = false;
    brokerImportState.positions = [];
    brokerImportState.errors = [];
    brokerImportState.selected.clear();

    closeModal('modal-broker-import');

    if (typeof refreshAllUI === 'function') refreshAllUI();

    // --- 4) Message final ---
    if (failed > 0) {
        if (typeof toastWarning === 'function') {
            toastWarning(
                `${failed} erreur(s) pendant l'import`,
                failures.slice(0, 2).join(' · ') + (failures.length > 2 ? ` (+${failures.length - 2})` : '')
            );
        }
    } else if (typeof toastSuccess === 'function') {
        toastSuccess(
            'Import réussi',
            `${created} actif(s) créé(s) · ${merged} fusion(s) · Total : ${positions.length} position(s) importée(s).`
        );
    }

    // Marque les actifs concernés comme "nouveaux" (Chantier 2.7)
    if (typeof markSessionNewBatch === 'function') {
        const newIds = assets
            .filter(a => a.broker === meta.label && (a.buys || []).some(b => b.type === `Import ${meta.label}`))
            .map(a => a.id);
        if (newIds.length) markSessionNewBatch('asset', newIds);
    }
}

window.confirmBrokerImport = confirmBrokerImport;
window._analyzeBrokerImport = _analyzeBrokerImport;