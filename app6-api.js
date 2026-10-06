// =====================================================================
// app6-api.js — API EXTERNES (CoinGecko, Frankfurter), IndexedDB,
//               sauvegardes locales, Google Drive chiffré, refreshAllUI
// Dépend de : app1-core.js, app2-ui.js, app3-charts.js, app4-forms.js, app5-fiscal.js
// =====================================================================

// ---------------------------------------------------------------------
// IndexedDB pour le cache d'historique de prix réel
// ---------------------------------------------------------------------
const PRICE_DB_NAME  = 'patriMonialPriceHistory';
const PRICE_DB_STORE = 'series';

function openPriceDB() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) { reject(new Error('IndexedDB indisponible dans ce navigateur.')); return; }
        const req = indexedDB.open(PRICE_DB_NAME, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(PRICE_DB_STORE); };
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    });
}

async function priceDBGet(key) {
    const db = await openPriceDB();
    return new Promise((resolve, reject) => {
        const req = db.transaction(PRICE_DB_STORE, 'readonly').objectStore(PRICE_DB_STORE).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror   = () => reject(req.error);
    });
}

async function priceDBSet(key, value) {
    const db = await openPriceDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PRICE_DB_STORE, 'readwrite');
        tx.objectStore(PRICE_DB_STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror    = () => reject(tx.error);
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

// Bouton "Historique de prix" : télécharge l'historique réel (1 an) pour
// toutes les cryptos et devises reconnues du portefeuille.
async function refreshRealPriceHistory() {
    const btn  = document.getElementById('btn-refresh-history');
    const icon = document.getElementById('icon-refresh-history');
    if (icon) icon.classList.add('fa-spin');
    if (btn) btn.disabled = true;

    let done = 0;
    const failed = [];

    const cryptoTickers = [...new Set(
        assets.filter(a => hasTag(a, 'Crypto') && CRYPTO_COINGECKO_IDS[a.ticker.toUpperCase()])
              .map(a => a.ticker.toUpperCase())
    )];
    for (const ticker of cryptoTickers) {
        try {
            const series = await fetchCoinGeckoHistory(CRYPTO_COINGECKO_IDS[ticker]);
            await priceDBSet('CRYPTO_' + ticker, { updatedAt: Date.now(), series });
            done++;
        } catch (err) { failed.push(ticker + ' (' + err.message + ')'); }
    }

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

    if (icon) icon.classList.remove('fa-spin');
    if (btn) btn.disabled = false;

    if (done === 0 && failed.length === 0) {
        alert('Aucun actif Crypto ou Devise éligible trouvé (tickers supportés : ' +
            Object.keys(CRYPTO_COINGECKO_IDS).join(', ') + ' / ' + CASH_CURRENCY_TICKERS.join(', ') + ').');
    } else {
        alert(`Historique de prix réel mis à jour pour ${done} actif(s).` +
            (failed.length ? `\nÉchecs : ${failed.join(', ')}` : '') +
            '\n\nActions/ETF/Obligations : non disponible depuis un navigateur (Yahoo Finance bloque les requêtes CORS) — le calcul de risque continue d\'utiliser l\'historique de valorisation de votre portefeuille pour ces actifs.');
    }
    renderInventoryTable();
}

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
    });
    return Promise.all(keys.map(([k]) => priceDBGet(k).catch(() => null))).then(results => {
        results.forEach((r, i) => {
            if (r) {
                realVolCache[keys[i][1]]    = annualizedVolFromSeries(r.series);
                realSeriesCache[keys[i][1]] = r.series;
            }
        });
        renderInventoryTable();
        calculateRiskMetrics();
    });
}

// ---------------------------------------------------------------------
// Actualisation live (crypto + devises) puis mise à jour manuelle groupée
// ---------------------------------------------------------------------
async function fetchLivePrices() {
    const btn  = document.getElementById('btn-live-prices');
    const icon = document.getElementById('icon-refresh-prices');
    icon.classList.add('fa-spin');
    btn.disabled = true;

    const cryptoMap = CRYPTO_COINGECKO_IDS; // Correction 8 : utilise la constante globale
    const currencyTickers = ['USD', 'JPY', 'CHF', 'GBP'];
    let updated = 0;
    const sourceErrors = [];

    // --- Crypto (CoinGecko) ---
    try {
        const cryptoAssets = assets.filter(a => hasTag(a, 'Crypto') && cryptoMap[a.ticker.toUpperCase()]);
        if (cryptoAssets.length) {
            try {
                const ids = [...new Set(cryptoAssets.map(a => cryptoMap[a.ticker.toUpperCase()]))].join(',');
                const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=eur`);
                if (!res.ok) throw new Error(`réponse HTTP ${res.status}`);
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
                sourceErrors.push(`Cryptomonnaies (CoinGecko) : ${err.message}`);
            }
        }
    } catch (err) { console.warn(err); }

    // --- Devises (Frankfurter/BCE) ---
    try {
        const currencyAssets = assets.filter(a => hasTag(a, 'Devises/Liquidités') && currencyTickers.includes(a.ticker.toUpperCase()));
        if (currencyAssets.length) {
            try {
                const to = [...new Set(currencyAssets.map(a => a.ticker.toUpperCase()))].join(',');
                const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=EUR&symbols=${to}`);
                if (!res.ok) throw new Error(`réponse HTTP ${res.status}`);
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

    if (updated > 0) {
        saveToStorage();
        refreshAllUI();
    }

    if (sourceErrors.length > 0) {
        const failedFetch = sourceErrors.some(e => /failed to fetch/i.test(e));
        alert(`Problème lors de l'actualisation automatique :\n${sourceErrors.join('\n')}` +
            (failedFetch
                ? `\n\nSi le message contient "Failed to fetch", un bloqueur de publicité ou les Boucliers Brave/uBlock bloquent probablement api.coingecko.com / api.frankfurter.app sur ce site. Essayez de désactiver temporairement les Boucliers pour cette page, ou vérifiez votre connexion internet.`
                : ''));
    } else if (updated > 0) {
        alert(`Cours actualisés automatiquement pour ${updated} actif(s) (crypto/devises).`);
    }

        // --- Actions / ETF (Finnhub) ---
        const stockAssets = assets.filter(a => (hasTag(a, 'Action') || hasTag(a, 'ETF')) && !hasTag(a, 'Crypto'));
        if (stockAssets.length && finnhubApiKey) {
            let stockUpdated = 0;
            for (const a of stockAssets) {
                const symbol = a.yahooTicker || a.ticker;
                if (!symbol) continue;
                try {
                    const price = await fetchFinnhubQuote(symbol);
                    if (price) {
                        a.value = a.qty * price;
                        upsertTodayHistoryPoint(a, a.value, a.invested);
                        stockUpdated++;
                    }
                    await new Promise(r => setTimeout(r, 100));
                } catch (err) { sourceErrors.push(`${a.name} (${symbol}) : ${err.message}`); }
            }
            if (stockUpdated > 0) {
                updated += stockUpdated;
                saveToStorage();
                refreshAllUI();
            }
        }
    
        // --- Pièces AuCoffre : estimation via cours de l'or (Partie 4.3) ---
        const auCoffreUpdated = await updateAuCoffreAssetsFromGoldPrice();
        if (auCoffreUpdated > 0) updated += auCoffreUpdated;
    
        // Mise à jour manuelle groupée pour tout le reste
        const autoUpdatedIds = new Set(
        assets.filter(a =>
            (hasTag(a, 'Crypto') && cryptoMap[a.ticker.toUpperCase()]) ||
            (hasTag(a, 'Devises/Liquidités') && currencyTickers.includes(a.ticker.toUpperCase()))
        ).map(a => a.id)
    );
    const manualAssets = assets.filter(a => !autoUpdatedIds.has(a.id));
    if (manualAssets.length) openManualRefreshModal(manualAssets);

    icon.classList.remove('fa-spin');
    btn.disabled = false;
}

// ---------------------------------------------------------------------
// Mise à jour manuelle groupée (pour les actifs sans cours automatique)
// ---------------------------------------------------------------------
function openManualRefreshModal(manualAssets) {
    document.getElementById('manual-refresh-body').innerHTML = manualAssets.map(a => {
        const unitValue = a.qty ? (a.value / a.qty) : a.value;
        return `<div class="grid grid-cols-[1fr_auto] items-center gap-3 p-2 bg-gray-950 border border-gray-800 rounded-lg" data-asset-id="${a.id}" data-qty="${a.qty}" data-invested="${a.invested}">
            <div class="min-w-0">
                <div class="font-bold text-white truncate">${a.name}</div>
                <div class="text-[10px] text-gray-500 font-mono">${a.ticker} • Qté ${a.qty} • Valeur actuelle : ${formatEUR(a.value)}</div>
            </div>
            <div class="flex items-center gap-1.5">
                <span class="text-[10px] text-gray-500">Nouv. valeur unitaire</span>
                <input type="number" step="any" class="manual-refresh-input w-28 bg-gray-900 border border-gray-800 rounded-lg p-1.5 text-white font-mono text-right focus:outline-none focus:border-teal-500" value="${unitValue.toFixed(4)}">
            </div>
        </div>`;
    }).join('');
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
    calculateOverallStats();
    calculateRiskMetrics();
    renderInventoryTable();
    renderCryptoTable();
    renderHorsGaveTable();
    updateGaveSection();
    updatePiliersSection();
    renderArbitragesTable();
    calculateAnneeN1();
    renderCessionsTable(cessionFilter);

    if (activeTab === 'tab-dashboard') initDashboardCharts();
    else if (activeTab === 'tab-gave') initGaveDonutChart();

    if (compareActive) {
        if (compareSegmentA) renderComparePanel('A');
        if (compareSegmentB) renderComparePanel('B');
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

// --- Chiffrement AES-GCM 256 / PBKDF2 (Web Crypto API, natif du navigateur) ---
async function deriveAESKey(passphrase, saltBytes) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
        'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: saltBytes, iterations: 250000, hash: 'SHA-256' },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

async function encryptPayload(obj, passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const key  = await deriveAESKey(passphrase, salt);
    const data = new TextEncoder().encode(JSON.stringify(obj));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
    return { v: 1, salt: toB64(salt), iv: toB64(iv), data: toB64(cipher) };
}

async function decryptPayload(envelope, passphrase) {
    const fromB64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const key = await deriveAESKey(passphrase, fromB64(envelope.salt));
    const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromB64(envelope.iv) },
        key,
        fromB64(envelope.data)
    );
    return JSON.parse(new TextDecoder().decode(plain));
}

// --- Modal de synchronisation ---
function openDriveSyncModal() {
    document.getElementById('drive-client-id-input').value = getDriveClientId();
    renderDriveBackupList();
    updateDriveSyncStatus();
    document.getElementById('modal-drive-sync').classList.remove('hidden');
}

function renderDriveBackupList() {
    const backups = listLocalBackups();
    document.getElementById('local-backup-list').innerHTML = backups.length
        ? backups.map((b, i) => `
            <div class="flex justify-between items-center p-2 bg-gray-950 border border-gray-800 rounded-lg text-[11px]">
                <span class="text-gray-300">${b.label}</span>
                <button onclick="restoreLocalBackup(${i})" class="px-2 py-1 rounded bg-gray-800 hover:bg-indigo-700 text-white text-[10px]">Restaurer</button>
            </div>`).reverse().join('')
        : '<div class="text-gray-500 italic text-[11px]">Aucune sauvegarde locale pour le moment.</div>';
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
    const passphrase = document.getElementById('drive-passphrase-input').value;
    if (!passphrase || passphrase.length < 8) {
        alert('Choisissez une phrase secrète d\'au moins 8 caractères (elle seule permet de déchiffrer vos données — Google ne la connaît pas et ne peut pas la récupérer).');
        return;
    }
    try {
        const envelope = await encryptPayload(currentDataSnapshot(), passphrase);
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
        const res = await driveApiFetch('files?spaces=appDataFolder&fields=files(id,name,createdTime)&orderBy=createdTime desc&pageSize=20');
        const data = await res.json();
        document.getElementById('drive-backup-list').innerHTML = (data.files || []).map(f => `
            <div class="flex justify-between items-center p-2 bg-gray-950 border border-gray-800 rounded-lg text-[11px]">
                <span class="text-gray-300">${f.name}</span>
                <button onclick="pullFromDrive('${f.id}')" class="px-2 py-1 rounded bg-gray-800 hover:bg-indigo-700 text-white text-[10px]">Restaurer</button>
            </div>`).join('')
            || '<div class="text-gray-500 italic text-[11px]">Aucune sauvegarde sur Drive.</div>';
    } catch (err) {
        document.getElementById('drive-backup-list').innerHTML = `<div class="text-rose-400 text-[11px]">${err.message}</div>`;
    }
}

async function pullFromDrive(fileId) {
    const passphrase = document.getElementById('drive-passphrase-input').value;
    if (!passphrase) { alert('Saisissez la phrase secrète utilisée lors de l\'envoi.'); return; }
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
            localStorage.setItem('patriMonial_cadranNames', JSON.stringify(cadranNames));
        }
        assets.forEach(normalizeAsset);
        cessions.forEach(normalizeCession);
        saveToStorage(); saveCessions(); saveArbitrages();
        refreshAllUI();
        alert('Données restaurées depuis Google Drive.');
    } catch (err) {
        alert('Échec de la restauration (mauvaise phrase secrète ou fichier corrompu ?) : ' + err.message);
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
        localStorage.setItem('patriMonial_cadranNames', JSON.stringify(cadranNames));
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
    localStorage.setItem('patriMonial_finnhubKey', finnhubApiKey);
    document.getElementById('finnhub-status').innerText = finnhubApiKey ? '✅ Clé enregistrée' : '⚠️ Aucune clé';
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
// AUCOFFRE — Estimation automatique par cours de l'or (Partie 4.3)
// =====================================================================
async function fetchGoldPriceEURPerGram() {
    try {
        const res = await fetch('https://xaus.com/api/v1/price?currency=EUR&unit=gram');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return data.price || null;
    } catch (err) { console.warn('XAUS Gold API failed:', err); return null; }
}

async function updateAuCoffreAssetsFromGoldPrice() {
    const goldPricePerGram = await fetchGoldPriceEURPerGram();
    if (!goldPricePerGram) return 0;
    let updated = 0;
    const auCoffreAssets = assets.filter(a => hasTag(a, 'Or & Métaux') && a.weightGrams && !a.manualValueOverride);
    auCoffreAssets.forEach(a => {
        const estimatedValue = a.qty * a.weightGrams * goldPricePerGram * (1 + (a.primePct || 0));
        if (Math.abs(estimatedValue - a.value) > 0.01) {
            a.value = estimatedValue;
            upsertTodayHistoryPoint(a, a.value, a.invested);
            updated++;
        }
    });
    if (updated > 0) { saveToStorage(); refreshAllUI(); }
    return updated;
}

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
