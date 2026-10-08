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
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(PRICE_DB_STORE)) {
                req.result.createObjectStore(PRICE_DB_STORE);
            }
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
    localStorage.setItem('patriMonial_twelveDataKey', twelveDataApiKey);
    const el = document.getElementById('twelve-status');
    if (el) el.innerText = twelveDataApiKey ? '✅ Clé enregistrée' : '⚠️ Aucune clé';
}

// ---------------------------------------------------------------------
// Yahoo Finance via proxy CORS public (allorigins.win) — fallback
// ---------------------------------------------------------------------
const YAHOO_PROXY = 'https://api.allorigins.win/raw?url=';

function yahooChartUrl(symbol, range) {
    return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
}

// Prix de marché actuel (quote simple)
async function fetchYahooQuote(symbol) {
    try {
        const res = await fetch(YAHOO_PROXY + encodeURIComponent(yahooChartUrl(symbol, '1d')));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const meta = data?.chart?.result?.[0]?.meta;
        return meta?.regularMarketPrice ?? null;
    } catch (err) {
        console.warn(`Yahoo quote failed for ${symbol}:`, err);
        return null;
    }
}

// Historique de prix (1 an par défaut) sous le même format que les autres sources
async function fetchYahooHistory(symbol, days = 365) {
    const range = days <= 30 ? '1mo' : days <= 90 ? '3mo' : days <= 180 ? '6mo' : days <= 365 ? '1y' : '2y';
    const res = await fetch(YAHOO_PROXY + encodeURIComponent(yahooChartUrl(symbol, range)));
    if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
    const data = await res.json();
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

// Bouton "Historique de prix" : télécharge l'historique réel (1 an) pour
// toutes les cryptos et devises reconnues du portefeuille.
async function refreshRealPriceHistory() {
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
        alert('Aucun actif éligible trouvé (Crypto, Devises, ou Actions/ETF avec ticker).');
    } else {
        alert(`Historique de prix réel mis à jour pour ${done} actif(s).` +
            (failed.length ? `\nÉchecs : ${failed.join(', ')}` : '') +
            '\n\nLe calcul de risque utilisera désormais les vrais cours pour ces actifs.');
    }

    // B5 : recharge le cache mémoire des volatilités réelles puis redessine.
    // primeRealVolCache() appelle lui-même renderInventoryTable() et
    // calculateRiskMetrics() en fin de traitement — le skeleton est alors
    // écrasé par le rendu réel de renderInventoryTable().
    await primeRealVolCache();
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
        if (typeof renderInventoryTable === 'function') renderInventoryTable();
        if (typeof calculateRiskMetrics === 'function') calculateRiskMetrics();
    });
}

// ---------------------------------------------------------------------
// Actualisation live (crypto + devises) puis mise à jour manuelle groupée
// ---------------------------------------------------------------------
async function fetchLivePrices() {
    const btn  = document.getElementById('btn-live-prices');
    const icon = document.getElementById('icon-refresh-prices');
    if (icon) icon.classList.add('fa-spin');
    if (btn)  btn.disabled = true;

    // Skeleton immédiat sur les 2 tables principales pendant les fetch
    const invBackup = showSkeletonFor('#table-inventory-body', 6, 13);
    const cryptoBackup = showSkeletonFor('#table-crypto-body', 3, 7);

    const cryptoMap = CRYPTO_COINGECKO_IDS;
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

    // --- Actions / ETF : cascade Twelve Data → Finnhub → Yahoo ---
    // Twelve Data est la source principale (CORS natif, pas de proxy instable).
    // Finnhub couvre uniquement les US. Yahoo reste en fallback ultime.
    const updatedStockIds = new Set();
    const stockAssets = assets.filter(a => (hasTag(a, 'Action') || hasTag(a, 'ETF')) && !hasTag(a, 'Crypto'));
    if (stockAssets.length) {
        let stockUpdated = 0;

        // Bandeau de progression — affiché uniquement si Twelve Data est configuré
        // (c'est le seul cas où la boucle dure vraiment longtemps : 8 s / actif).
        const showToast = twelveDataApiKey && stockAssets.length > 1;
        if (showToast) {
            showProgressToast(
                'Actualisation des ETF / Actions…',
                `0 / ${stockAssets.length} · démarrage`,
                0
            );
        }

        let processed = 0;
        for (const a of stockAssets) {
            processed++;
            const symbol = a.yahooTicker || a.ticker;
            if (!symbol) continue;
            let price = null;
            const sources = [];

            if (showToast) {
                updateProgressToast(
                    `${processed} / ${stockAssets.length} · ${symbol}`,
                    (processed - 1) / stockAssets.length * 100
                );
            }

            // 1) Twelve Data (source principale, toutes places)
            if (twelveDataApiKey) {
                try {
                    price = await fetchTwelveDataQuote(symbol);
                    if (price) sources.push('Twelve Data');
                    // 8 requêtes/min en gratuit → 7,5 s minimum entre appels.
                    // On saute la pause après le DERNIER actif (aucun appel après).
                    if (processed < stockAssets.length) {
                        // Fait avancer la barre pendant l'attente, en interpolant
                        // vers la prochaine position (feedback visuel).
                        if (showToast) {
                            updateProgressToast(
                                `${processed} / ${stockAssets.length} · pause API (8 s)…`,
                                processed / stockAssets.length * 100
                            );
                        }
                        await new Promise(r => setTimeout(r, 8000));
                    }
                } catch (err) {
                    sources.push(`Twelve Data: ${err.message}`);
                }
            }

            // 2) Finnhub (US uniquement, rapide)
            if (!price && finnhubApiKey) {
                try {
                    const p = await fetchFinnhubQuote(symbol);
                    if (p) { price = p; sources.push('Finnhub'); }
                } catch (err) { sources.push(`Finnhub: ${err.message}`); }
            }

            // 3) Yahoo via proxy (fallback ultime, instable)
            if (!price) {
                try {
                    const p = await fetchYahooQuote(symbol);
                    if (p) { price = p; sources.push('Yahoo'); }
                } catch (err) { sources.push(`Yahoo: ${err.message}`); }
            }

            if (price) {
                a.value = a.qty * price;
                upsertTodayHistoryPoint(a, a.value, a.invested);
                stockUpdated++;
                updatedStockIds.add(a.id);
            } else {
                sourceErrors.push(`${a.name} (${symbol}) : ${sources.join(' | ')}`);
            }
        }
        if (stockUpdated > 0) updated += stockUpdated;
    }

    // --- Pièces AuCoffre : estimation via cours de l'or ---
    try {
        const auCoffreUpdated = await updateAuCoffreAssetsFromGoldPrice();
        if (auCoffreUpdated > 0) updated += auCoffreUpdated;
    } catch (err) { console.warn('AuCoffre update failed:', err); }

    // --- Sauvegarde + rendu unique en fin de parcours ---
    if (updated > 0) {
        saveToStorage();
        refreshAllUI();
    }

    // --- Restauration de l'UI AVANT les alertes ---
    if (icon) icon.classList.remove('fa-spin');
    if (btn)  btn.disabled = false;

    // Ferme le bandeau une fois tout terminé (léger délai pour laisser
    // voir la barre à 100 % avant qu'il disparaisse).
    hideProgressToast(400);

    // --- Alertes : APRÈS tous les fetch, une seule fois ---
    if (sourceErrors.length > 0) {
        const failedFetch = sourceErrors.some(e => /failed to fetch/i.test(e));
        alert(`Problème lors de l'actualisation automatique :\n${sourceErrors.join('\n')}` +
            (failedFetch
                ? `\n\nSi le message contient "Failed to fetch", un bloqueur de publicité ou les Boucliers Brave/uBlock bloquent probablement api.coingecko.com / api.frankfurter.dev / finnhub.io sur ce site. Essayez de désactiver temporairement les Boucliers pour cette page, ou vérifiez votre connexion internet.`
                : ''));
    } else if (updated > 0) {
        alert(`Cours actualisés automatiquement pour ${updated} actif(s) (crypto, devises, actions/ETF, or).`);
    }

    // --- Restauration explicite du contenu (si refreshAllUI() n'a pas déjà
    // repeuplé le tableau — cas où updated === 0). ---
    if (document.querySelector('#table-inventory-body')?.querySelector('.skeleton-row')) {
        restoreSkeletonFor('#table-inventory-body', invBackup);
    }
    if (document.querySelector('#table-crypto-body')?.querySelector('.skeleton-row')) {
        restoreSkeletonFor('#table-crypto-body', cryptoBackup);
    }

    // --- Mise à jour manuelle groupée pour tout le reste ---
    // Les actifs déjà mis à jour automatiquement (crypto, devises, actions/ETF) sont exclus.
    const autoUpdatedIds = new Set(
        assets
            .filter(a =>
                (hasTag(a, 'Crypto') && cryptoMap[a.ticker.toUpperCase()]) ||
                (hasTag(a, 'Devises/Liquidités') && currencyTickers.includes(a.ticker.toUpperCase()))
            )
            .map(a => a.id)
    );
    updatedStockIds.forEach(id => autoUpdatedIds.add(id));

    const manualAssets = assets.filter(a => !autoUpdatedIds.has(a.id));
    if (manualAssets.length) openManualRefreshModal(manualAssets);
}

// ---------------------------------------------------------------------
// Mise à jour manuelle groupée (pour les actifs sans cours automatique)
// ---------------------------------------------------------------------
function openManualRefreshModal(manualAssets) {
    document.getElementById('manual-refresh-body').innerHTML = manualAssets.map(a => {
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

    const { key } = await getOrCreateMasterKey(passphrase);
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
    // Si aucune phrase n'est saisie mais qu'une clé est mémorisée, on utilise
    // une chaîne sentinelle qui sera ignorée par getOrCreateMasterKey.
    if (!passphrase && hasKey) passphrase = '__cached__';

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

// Récupère la clé mémorisée (si elle correspond à la phrase fournie),
// sinon la dérive et la mémorise. Retourne { key, isNew }.
async function getOrCreateMasterKey(passphrase) {
    const stored = await keyDBGet('driveMasterKey');
    if (stored && stored.key) {
        try {
            const probe = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: new Uint8Array(stored.witnessIv) },
                stored.key,
                new Uint8Array(stored.witness)
            );
            if (new TextDecoder().decode(probe) === KEY_WITNESS) {
                return { key: stored.key, isNew: false };
            }
        } catch { /* phrase différente → nouvelle dérivation */ }
    }
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
    if (!passphrase && hasKey) passphrase = '__cached__';
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
