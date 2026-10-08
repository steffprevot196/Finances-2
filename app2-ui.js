// =====================================================================
// app2-ui.js — RENDU UI (tables, KPI, badges, filtres)
// Dépend de : app1-core.js
// =====================================================================

// ---------------------------------------------------------------------
// Chart.js helpers (destruction propre avant redessin)
// ---------------------------------------------------------------------
function createChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();
    return new Chart(canvas.getContext('2d'), config);
}

// Couleurs Chart.js adaptatives selon le thème courant
function _chartGridColor() {
    return document.body.classList.contains('light') ? '#e5e7eb' : '#1f2937';
}
function _chartTickColor() {
    return document.body.classList.contains('light') ? '#4b5563' : '#6b7280';
}
function _chartLegendColor() {
    return document.body.classList.contains('light') ? '#374151' : '#9ca3af';
}

function destroyAllCharts() {
    [
        dashboardAllocChartInstance, dashboardHistoryChartInstance,
        gaveChartInstance, assetHistoryChartInstance, quadrantHistoryChartInstance,
        compareChartAllocInstance.A, compareChartAllocInstance.B,
        compareChartHistoryInstance.A, compareChartHistoryInstance.B,
        paperCompareChartAllocInstance.A, paperCompareChartAllocInstance.B,
        paperCompareChartHistoryInstance,
        (typeof goalChartInstance !== 'undefined' ? goalChartInstance : null)
    ].forEach(c => { if (c) c.destroy(); });

    dashboardAllocChartInstance = dashboardHistoryChartInstance = null;
    gaveChartInstance = assetHistoryChartInstance = quadrantHistoryChartInstance = null;
    compareChartAllocInstance = { A: null, B: null };
    compareChartHistoryInstance = { A: null, B: null };
    paperCompareChartAllocInstance = { A: null, B: null };
    paperCompareChartHistoryInstance = null;
    if (typeof goalChartInstance !== 'undefined') goalChartInstance = null;
}

// ---------------------------------------------------------------------
// Navigation par onglets
// ---------------------------------------------------------------------
function switchTab(tabId) {
    destroyAllCharts();
    activeTab = tabId;
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.remove('hidden');
    document.getElementById('btn-' + tabId).classList.add('active');
    // Rendu spécifique : l'onglet Stratégies reconstruit ses cartes à la volée
    if (tabId === 'tab-strategies' && typeof renderStrategiesTab === 'function') {
        renderStrategiesTab();
    }
    refreshAllUI();
}

// ---------------------------------------------------------------------
// KPI bandeau (Total investi / Valeur / P&L / Composition)
// ---------------------------------------------------------------------
function calculateOverallStats() {
    // --- 1) Positions détenues (latent) ---
    // Stats filtrées par la préférence Paper Trading
    const _statsAssets = statsAssets();
    let totalInvested = 0, totalValue = 0, totalFrais = 0;
    _statsAssets.forEach(a => {
        totalInvested += a.invested || 0;
        totalValue    += a.value    || 0;
        totalFrais    += a.frais    || 0;
    });

    countUp(document.getElementById('stat-total-invested'), totalInvested, formatEUR);
    countUp(document.getElementById('stat-total-frais'),    totalFrais,    formatEUR);
    countUp(document.getElementById('stat-total-value'),    totalValue,    formatEUR);

    const latentPnl = totalValue - totalInvested;
    const latentPnlEl = document.getElementById('stat-pnl');
    countUp(latentPnlEl, latentPnl, fmtSignedEUR);
    latentPnlEl.className = `text-2xl font-bold font-mono ${latentPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;

    const latentPct = totalInvested > 0 ? (latentPnl / totalInvested * 100) : 0;
    const latentPctEl = document.getElementById('stat-pnl-pct');
    countUp(latentPctEl, latentPct, fmtSignedPct);
    latentPctEl.className = `text-xs font-semibold mt-1 font-mono ${latentPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;

    // --- Gain / Perte hors frais : on ajoute les frais au P&L (les frais sont un coût d'entrée,
    //     pas une contre-performance du marché). Permet de juger la performance de la sélection
    //     d'actifs, indépendamment du coût des transactions. ---
    const investedNetDeFrais = totalInvested - totalFrais;
    const pnlHorsFrais = latentPnl + totalFrais;
    const pnlHorsFraisPct = investedNetDeFrais > 0 ? (pnlHorsFrais / investedNetDeFrais * 100) : 0;

    const pnlHfEl = document.getElementById('stat-pnl-hf');
    if (pnlHfEl) {
        countUp(pnlHfEl, pnlHorsFrais, fmtSignedEUR);
        pnlHfEl.className = `text-2xl font-bold font-mono ${pnlHorsFrais >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }
    const pnlHfPctEl = document.getElementById('stat-pnl-hf-pct');
    if (pnlHfPctEl) {
        countUp(pnlHfPctEl, pnlHorsFraisPct, fmtSignedPct);
        pnlHfPctEl.className = `text-xs font-semibold mt-1 font-mono ${pnlHorsFrais >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }
    const pnlHfDetailEl = document.getElementById('stat-pnl-hf-detail');
    if (pnlHfDetailEl) pnlHfDetailEl.innerText = `frais neutralisés : ${formatEUR(totalFrais)}`;

    document.getElementById('stat-asset-count').innerText = assets.length + (assets.length > 1 ? ' Actifs' : ' Actif');

    const gaveCount   = assets.filter(a => GAVE_QUADRANTS.includes(a.cadran)).length;
    const cryptoCount = assets.filter(a => hasTag(a, 'Crypto')).length;
    const horsCount   = assets.filter(a => a.cadran === 'HORS_GAVE' && !hasTag(a, 'Crypto')).length;

    document.getElementById('stat-gave-count').innerText      = gaveCount;
    document.getElementById('stat-hors-gave-count').innerText = horsCount;
    const cryptoCountEl = document.getElementById('stat-crypto-count');
    if (cryptoCountEl) cryptoCountEl.innerText = cryptoCount;

    // --- 2) Performance réalisée (cessions) — filtrées par statsCessions() ---
    const _statsCessions = statsCessions();
    let realizedGross = 0;         // Σ prix de vente
    let realizedCost  = 0;         // Σ prix d'achat (PRU)
    let realizedPnl   = 0;         // Σ (prix vente - prix achat - frais)
    _statsCessions.forEach(c => {
        const vente = c.prixVente || 0;
        const achat = c.prixAchat || 0;
        const frais = c.frais || 0;
        realizedGross += vente;
        realizedCost  += achat;
        realizedPnl   += (vente - achat - frais);
    });

    const realizedGrossEl = document.getElementById('stat-realized-gross');
    if (realizedGrossEl) countUp(realizedGrossEl, realizedGross, formatEUR);

    const realizedCountEl = document.getElementById('stat-realized-count');
    if (realizedCountEl) realizedCountEl.innerText = `${_statsCessions.length} opération(s)`;

    const realizedPnlEl = document.getElementById('stat-realized-pnl');
    if (realizedPnlEl) {
        countUp(realizedPnlEl, realizedPnl, fmtSignedEUR);
        realizedPnlEl.className = `text-2xl font-bold font-mono ${realizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }

    const realizedPct = realizedCost > 0 ? (realizedPnl / realizedCost * 100) : 0;
    const realizedPctEl = document.getElementById('stat-realized-pnl-pct');
    if (realizedPctEl) {
        countUp(realizedPctEl, realizedPct, fmtSignedPct);
        realizedPctEl.className = `text-xs mt-1 font-mono ${realizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }

    // --- 3) Impôt estimé (via l'objet structuré retourné par calculateAnneeN1) ---
    // B14 : plus de lecture DOM fragile. On utilise lastTaxBreakdown (mis à jour
    // par calculateAnneeN1) ou, en secours, on le recalcule à la volée.
    let impotEstime = 0;
    if (typeof computeTaxBreakdown === 'function') {
        const tax = (typeof lastTaxBreakdown !== 'undefined' && lastTaxBreakdown)
            ? lastTaxBreakdown
            : computeTaxBreakdown();
        impotEstime = tax.totalImpot || 0;
    }

    const totalTaxEl = document.getElementById('stat-total-tax');
    if (totalTaxEl) countUp(totalTaxEl, impotEstime, formatEUR);

    const realizedNet = realizedPnl - impotEstime;
    const realizedNetEl = document.getElementById('stat-realized-net');
    if (realizedNetEl) {
        countUp(realizedNetEl, realizedNet, fmtSignedEUR);
        realizedNetEl.className = `font-mono ${realizedNet >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }

    // --- 4) P&L total = latent + réalisé ---
    const totalPnl = latentPnl + realizedPnl;
    const totalBase = totalInvested + realizedCost;
    const totalPct = totalBase > 0 ? (totalPnl / totalBase * 100) : 0;

    const totalPnlEl = document.getElementById('stat-total-pnl');
    if (totalPnlEl) countUp(totalPnlEl, totalPnl, fmtSignedEUR);

    const totalPnlPctEl = document.getElementById('stat-total-pnl-pct');
    if (totalPnlPctEl) countUp(totalPnlPctEl, totalPct, fmtSignedPct);
}


// ---------------------------------------------------------------------
// Icônes de classe d'actif — pastille colorée devant le nom
// ---------------------------------------------------------------------
// Ordre de priorité : tags les plus spécifiques d'abord. Cela permet
// à un "ETF Or" d'avoir l'icône Or (plus parlante) plutôt que l'icône ETF.
function getAssetClassKey(asset) {
    if (hasTag(asset, 'Crypto'))             return 'Crypto';
    if (hasTag(asset, 'Or & Métaux'))        return 'Or & Métaux';
    if (hasTag(asset, 'Devises/Liquidités')) return 'Devises/Liquidités';
    if (hasTag(asset, 'Obligation'))         return 'Obligation';
    if (hasTag(asset, 'Matières Premières')) return 'Matières Premières';
    if (hasTag(asset, 'ETF'))                return 'ETF';
    if (hasTag(asset, 'Action'))             return 'Action';
    if (hasTag(asset, 'SCPI'))               return 'SCPI';
    if (hasTag(asset, 'Immobilier'))         return 'Immobilier';
    if (hasTag(asset, 'Private Equity'))     return 'Private Equity';
    if (hasTag(asset, 'Art / Collection'))   return 'Art / Collection';
    return 'Autre';
}

const ASSET_CLASS_ICONS = {
    'Or & Métaux':        { icon: 'fa-coins',           bg: 'bg-amber-950/70',   fg: 'text-amber-400',   bd: 'border-amber-800/60' },
    'Crypto':             { icon: 'fa-bitcoin',         bg: 'bg-purple-950/70',  fg: 'text-purple-400',  bd: 'border-purple-800/60' },
    'Devises/Liquidités': { icon: 'fa-money-bill-wave', bg: 'bg-blue-950/70',    fg: 'text-blue-400',    bd: 'border-blue-800/60' },
    'ETF':                { icon: 'fa-layer-group',     bg: 'bg-indigo-950/70',  fg: 'text-indigo-400',  bd: 'border-indigo-800/60' },
    'Action':             { icon: 'fa-chart-line',      bg: 'bg-emerald-950/70', fg: 'text-emerald-400', bd: 'border-emerald-800/60' },
    'Obligation':         { icon: 'fa-landmark',        bg: 'bg-teal-950/70',    fg: 'text-teal-400',    bd: 'border-teal-800/60' },
    'Matières Premières': { icon: 'fa-gas-pump',        bg: 'bg-rose-950/70',    fg: 'text-rose-400',    bd: 'border-rose-800/60' },
    'SCPI':               { icon: 'fa-building',        bg: 'bg-cyan-950/70',    fg: 'text-cyan-400',    bd: 'border-cyan-800/60' },
    'Immobilier':         { icon: 'fa-house',           bg: 'bg-cyan-950/70',    fg: 'text-cyan-400',    bd: 'border-cyan-800/60' },
    'Private Equity':     { icon: 'fa-briefcase',       bg: 'bg-indigo-950/70',  fg: 'text-indigo-400',  bd: 'border-indigo-800/60' },
    'Art / Collection':   { icon: 'fa-palette',         bg: 'bg-pink-950/70',    fg: 'text-pink-400',    bd: 'border-pink-800/60' },
    'Autre':              { icon: 'fa-cube',            bg: 'bg-gray-800/70',    fg: 'text-gray-400',    bd: 'border-gray-700/60' }
};

// Renvoie une pastille HTML (20×20) avec l'icône de classe de l'actif.
function assetClassIconHTML(asset) {
    const key = getAssetClassKey(asset);
    const cfg = ASSET_CLASS_ICONS[key] || ASSET_CLASS_ICONS['Autre'];
    return `<span class="inline-flex items-center justify-center w-5 h-5 rounded-md border ${cfg.bg} ${cfg.fg} ${cfg.bd} text-[10px] flex-shrink-0" title="${escapeHTML(key)}"><i class="fa-solid ${cfg.icon}"></i></span>`;
}

// ---------------------------------------------------------------------
// Badges de tags et cadrans (utilisés dans toutes les tables)
// ---------------------------------------------------------------------
function tagBadgesHTML(asset) {
    const cls = {
        'ETF': 'bg-indigo-950 text-indigo-300 border-indigo-800/50',
        'Action': 'bg-gray-800 text-gray-300 border-gray-700',
        'Obligation': 'bg-teal-950 text-teal-300 border-teal-800/50',
        'Crypto': 'bg-purple-950 text-purple-300 border-purple-800/50',
        'Or & Métaux': 'bg-amber-950 text-amber-300 border-amber-800/50',
        'Devises/Liquidités': 'bg-blue-950 text-blue-300 border-blue-800/50',
        'Matières Premières': 'bg-rose-950 text-rose-300 border-rose-800/50'
    };
    return (asset.categories || []).map(t =>
        `<span class="px-1.5 py-0.5 rounded border text-[9px] font-bold ${cls[t] || 'bg-gray-800 text-gray-400 border-gray-700'}">${t}</span>`
    ).join(' ');
}

function cadranBadgesHTML(asset) {
    const sec = ((asset.cadrans && asset.cadrans.secondary) || []).map(q =>
        `<span class="px-1.5 py-0.5 rounded border border-dashed text-[9px] whitespace-nowrap opacity-70 ${CADRAN_BADGE_COLORS[q]}" title="Cadran secondaire (informatif, hors calcul des 25%)">+ ${escapeHTML(cadranLabel(q))}</span>`
    ).join(' ');
    return cadranBadgeHTML(asset.cadran || 'HORS_GAVE') + (sec ? ' ' + sec : '');
}

function assetSubtitleHTML(asset) {
    const parts = [asset.ticker];
    if (asset.envelope) parts.push(envelopeShort(asset.envelope));
    if (asset.valuationMode === 'MANUAL') parts.push('valo. manuelle');
    if (asset.manualUpdateDate) parts.push(`MAJ ${new Date(asset.manualUpdateDate).toLocaleDateString('fr-FR')}`);
    return parts.join(' • ');
}

// Badge ⚠ orange si le poids de l'actif dépasse le seuil de concentration.
// Retourne '' si en-dessous du seuil (aucun impact sur la mise en page).
function concentrationBadgeHTML(asset) {
    const totalValue = statsAssets().reduce((s, a) => s + (a.value || 0), 0);
    if (totalValue <= 0) return '';
    const weight = (asset.value || 0) / totalValue;
    if (weight <= concentrationThreshold) return '';
    const pct = (weight * 100).toFixed(1);
    const seuil = (concentrationThreshold * 100).toFixed(0);
    return ` <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-bold bg-amber-950 text-amber-300 border-amber-700/60" title="Sur-concentration : ${pct}% du portefeuille (seuil ${seuil}%)"><i class="fa-solid fa-triangle-exclamation text-[8px]"></i>${pct}%</span>`;
}

// Badge 📝 « Papier » pour les positions simulées.
// Sa couleur reflète le scénario de rattachement (paperScenarioId).
function paperBadgeHTML(asset) {
    if (!isPaperAsset(asset)) return '';
    const scen = (typeof paperScenarios !== 'undefined')
        ? paperScenarios.find(s => s.id === asset.paperScenarioId)
        : null;
    const color = scen ? scen.color : '#a855f7';
    const name  = scen ? scen.name  : 'Papier';
    return ` <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-bold"
                  style="background:${color}1a;border-color:${color}80;color:${color};"
                  title="Position fictive — scénario : ${escapeHTML(name)}. Non incluse dans la fiscalité tant qu'elle n'est pas promue en réel.">
              <i class="fa-solid fa-flask text-[8px]"></i>${escapeHTML(name)}
            </span>`;
}

// ---------------------------------------------------------------------
// SPARKLINE 30 JOURS — SVG inline ultra-léger (pas de Chart.js)
// ---------------------------------------------------------------------
// Source des données, par ordre de priorité :
//   1. realSeriesCache[ticker]  → cours réels (CoinGecko, Frankfurter, Twelve Data)
//   2. asset.history            → historique de valorisation interne (repli)
// Retourne un <div> contenant une polyline SVG + le % de variation coloré.
// Un cache par asset évite de recalculer le SVG à chaque re-render.
const _sparklineCache = new Map();

function _invalidateSparklineCache(assetId) {
    _sparklineCache.delete(assetId);
}

function sparklineHTML(asset, days = 30) {
    const cacheKey = asset.id + '|' + days + '|' + (asset.value || 0) + '|' + (asset.history?.length || 0);
    if (_sparklineCache.has(cacheKey)) return _sparklineCache.get(cacheKey);

    // --- 1) Extraction des données ---
    const tickerKey = (asset.ticker || '').toUpperCase();
    const cutoff = Date.now() - days * 864e5;
    let series = [];

    if (realSeriesCache[tickerKey] && realSeriesCache[tickerKey].length >= 2) {
        const pts = realSeriesCache[tickerKey]
            .filter(p => p.date >= cutoff)
            .map(p => p.price);
        if (pts.length >= 2) series = pts;
    }
    if (series.length < 2 && Array.isArray(asset.history) && asset.history.length >= 2) {
        const pts = asset.history
            .map(h => ({ d: parseFlexDate(h.date), v: h.value }))
            .filter(p => p.d && Number.isFinite(p.v))
            .sort((a, b) => a.d - b.d);
        const recent = pts.filter(p => p.d.getTime() >= cutoff).map(p => p.v);
        series = recent.length >= 2 ? recent : pts.map(p => p.v);
    }

    let html;
    if (series.length < 2) {
        html = '<span class="text-gray-600 text-[10px]">—</span>';
    } else {
        const first = series[0];
        const last  = series[series.length - 1];
        const trendUp = last >= first;
        const color = trendUp ? '#10b981' : '#f43f5e';
        const pct   = first > 0 ? ((last - first) / first * 100) : 0;

        // Normalisation dans une boîte 80×24 (marge de 1 px haut/bas pour l'anti-aliasing)
        const W = 80, H = 24;
        const min = Math.min(...series);
        const max = Math.max(...series);
        const range = (max - min) || 1;
        const stepX = W / (series.length - 1);
        const points = series.map((v, i) => {
            const x = i * stepX;
            const y = H - ((v - min) / range) * (H - 2) - 1;
            return x.toFixed(1) + ',' + y.toFixed(1);
        }).join(' ');

        const titleAttr = `Tendance ${days}j : ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
        html = `<div class="inline-flex items-center gap-1.5 justify-end" title="${titleAttr}">
            <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="flex-shrink-0">
                <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
            </svg>
            <span class="text-[10px] font-mono ${trendUp ? 'text-emerald-400' : 'text-rose-400'}">${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%</span>
        </div>`;
    }

    _sparklineCache.set(cacheKey, html);
    return html;
}

// Cellule "Risque" de la colonne inventaire — utilise realVolCache (app6) et
// computeRiskMetricsFromAssets (app5), évalués au moment du rendu.
function riskCellHTML(asset) {
    const real = realVolCache[asset.ticker.toUpperCase()];
    if (real !== undefined && real !== null) {
        return `<span class="text-emerald-400" title="Volatilité annualisée calculée sur l'historique réel des cours (CoinGecko/Frankfurter)">${(real * 100).toFixed(1)}% <i class="fa-solid fa-circle-check text-[9px]"></i></span>`;
    }
    const m = computeRiskMetricsFromAssets([asset]);
    if (m) return `<span class="text-gray-400" title="Estimation basée sur l'historique de valorisation de cet actif dans votre portefeuille (pas un cours de marché réel)">~${(m.volatility * 100).toFixed(1)}%</span>`;
    return '<span class="text-gray-600">—</span>';
}

// ---------------------------------------------------------------------
// Toggle UI du teintage performance
// ---------------------------------------------------------------------
function toggleTintRows() {
    setTintRowsEnabled(!tintRowsEnabled);
    updateTintToggleUI();
}

function updateTintToggleUI() {
    const btn  = document.getElementById('tint-toggle-btn');
    const icon = document.getElementById('tint-toggle-icon');
    if (!btn) return;
    if (tintRowsEnabled) {
        btn.className = 'px-2 py-1 rounded-lg bg-emerald-950/60 border border-emerald-700/50 text-xs text-emerald-300 hover:bg-emerald-900/70 transition flex items-center gap-1.5';
        if (icon) icon.className = 'fa-solid fa-palette text-[11px]';
    } else {
        btn.className = 'px-2 py-1 rounded-lg bg-gray-900 border border-gray-800 text-xs text-gray-400 hover:text-white transition flex items-center gap-1.5';
        if (icon) icon.className = 'fa-solid fa-palette text-[11px] opacity-40';
    }
}

// ---------------------------------------------------------------------
// Table principale de l'inventaire + vue carte mobile
// ---------------------------------------------------------------------
function renderInventoryTable(filterCat = inventoryFilter, searchQuery) {
    if (searchQuery === undefined) {
        const el = document.getElementById('inventory-search');
        searchQuery = el ? el.value : '';
    }
    const tbody = document.getElementById('table-inventory-body');
    const cards = document.getElementById('inventory-cards');
    tbody.innerHTML = '';
    cards.innerHTML = '';
    const q = (searchQuery || '').toLowerCase();

    const filtered = assets.filter(a => {
        let matchCat = filterCat === 'ALL';
        if (!matchCat && filterCat === 'IMMO') {
            matchCat = ['SCPI', 'Immobilier', 'Private Equity', 'Art / Collection', 'Autre'].some(t => hasTag(a, t));
        } else if (!matchCat && filterCat === 'CADRAN_ALL4') {
            matchCat = GAVE_QUADRANTS.includes(a.cadran);
        } else if (!matchCat && filterCat.startsWith('CADRAN_')) {
            matchCat = a.cadran === filterCat.slice(7);
        } else if (!matchCat) {
            matchCat = hasTag(a, filterCat);
        }
        const matchSearch = a.name.toLowerCase().includes(q) || a.ticker.toLowerCase().includes(q);
        return matchCat && matchSearch;
    });

    filtered.forEach(asset => {
        const pnl    = asset.value - asset.invested;
        const isPos  = pnl >= 0;
        const pnlPct = asset.invested > 0 ? (pnl / asset.invested * 100) : 0;
        const pnlCls = isPos ? 'text-emerald-400' : 'text-rose-400';

                // ---- Ligne tableau (desktop) ----
        const tr = document.createElement('tr');
        tr.className = 'clickable-row ' + rowTintClass(asset);
        tr.onclick = () => openAssetDetailModal(asset.id);

        // Prix unitaires : PRU moyen (fiscal FR) et valeur de marché actuelle
        const pruUnitaire   = computePRUFromLots(asset);
        const valeurUnitaire = asset.qty > 0 ? (asset.value / asset.qty) : 0;

        tr.innerHTML = `
            <td class="p-3" style="max-width:220px;">
                <div class="flex items-center gap-1.5 min-w-0">
                    ${assetClassIconHTML(asset)}
                    <div class="min-w-0 flex-1">
                        <div class="font-bold text-white truncate" title="${escapeHTML(asset.name)}">${escapeHTML(asset.name)}${concentrationBadgeHTML(asset)}${paperBadgeHTML(asset)}</div>
                        <div class="text-[10px] text-gray-500 font-mono truncate">${assetSubtitleHTML(asset)}</div>
                    </div>
                </div>
            </td>
            <td class="p-3 text-center" style="max-width:130px;"><div class="flex flex-wrap gap-1 justify-center">${tagBadgesHTML(asset)}</div></td>
            <td class="p-3 text-center" style="max-width:130px;"><div class="flex flex-wrap gap-1 justify-center">${cadranBadgesHTML(asset)}</div></td>
            <td class="p-3 text-right font-mono">${fmtQty(asset.qty)}</td>
            <td class="p-3 text-right font-mono text-gray-400">${asset.qty > 0 ? formatUnitPrice(pruUnitaire) : '—'}</td>
            <td class="p-3 text-right font-mono text-gray-300">${asset.qty > 0 ? formatUnitPrice(valeurUnitaire) : '—'}</td>
            <td class="p-3 text-right font-mono text-gray-400">${formatEUR(asset.frais || 0)}</td>
            <td class="p-3 text-right font-mono">${formatEUR(asset.invested)}</td>
            <td class="p-3 text-right font-mono font-bold text-white">${formatEUR(asset.value)}</td>
            <td class="p-3 text-right font-mono">
                <div class="font-bold ${pnlCls}">${isPos ? '+' : ''}${formatEUR(pnl)}</div>
                <div class="text-[10px] ${isPos ? 'text-emerald-400/70' : 'text-rose-400/70'}">${isPos ? '+' : ''}${pnlPct.toFixed(2)}%</div>
            </td>
            <td class="p-3 text-right">${sparklineHTML(asset)}</td>
            <td class="p-3 text-right font-mono">${tirCellHTML(asset)}</td>
            <td class="p-3 text-center">${scoreCellHTML(asset)}</td>
            <td class="p-3 text-right font-mono">${riskCellHTML(asset)}</td>
            <td class="p-3 text-center whitespace-nowrap">
                <div class="inline-flex items-center gap-1">
                    <button type="button" aria-label="Comparer cet actif" title="Comparer" onclick="event.stopPropagation(); openAssetCompare(${asset.id})" class="inline-flex items-center justify-center w-8 h-8 rounded-md bg-gray-800/60 text-gray-300 hover:bg-indigo-900/60 hover:text-indigo-300 transition"><i class="fa-solid fa-code-compare"></i></button>
                    <button type="button" aria-label="Voir le détail" title="Voir le détail" onclick="event.stopPropagation(); openAssetDetailModal(${asset.id})" class="inline-flex items-center justify-center w-8 h-8 rounded-md bg-gray-800/60 text-gray-300 hover:bg-blue-900/60 hover:text-blue-300 transition"><i class="fa-solid fa-eye"></i></button>
                    <button type="button" aria-label="Dupliquer cet actif" title="Dupliquer (créer une variante : 1/10, 1/20…)" onclick="event.stopPropagation(); duplicateAsset(${asset.id})" class="inline-flex items-center justify-center w-8 h-8 rounded-md bg-gray-800/60 text-gray-300 hover:bg-teal-900/60 hover:text-teal-300 transition"><i class="fa-solid fa-copy"></i></button>
                    <button type="button" aria-label="Simuler une vente de cet actif" title="Simuler une vente (impact fiscal sans rien modifier)" onclick="event.stopPropagation(); openSellSimulator(${asset.id})" class="inline-flex items-center justify-center w-8 h-8 rounded-md bg-gray-800/60 text-gray-300 hover:bg-purple-900/60 hover:text-purple-300 transition"><i class="fa-solid fa-flask"></i></button>
                    ${isPaperAsset(asset) ? `<button type="button" aria-label="Promouvoir en position réelle" title="Promouvoir en position réelle" onclick="event.stopPropagation(); promotePaperAsset(${asset.id})" class="inline-flex items-center justify-center w-8 h-8 rounded-md bg-purple-900/50 text-purple-200 hover:bg-emerald-900/60 hover:text-emerald-300 transition"><i class="fa-solid fa-arrow-up-right-dots"></i></button>` : ''}
                    ${hasTag(asset, 'Or & Métaux') ? `<button type="button" aria-label="Mettre à jour manuellement la valeur" title="Mettre à jour manuellement la valeur AuCoffre" onclick="event.stopPropagation(); openManualGoldUpdate(${asset.id})" class="inline-flex items-center justify-center w-8 h-8 rounded-md bg-gray-800/60 text-gray-300 hover:bg-amber-900/60 hover:text-amber-300 transition"><i class="fa-solid fa-pen-to-square"></i></button>` : ''}
                    <button type="button" aria-label="Modifier cet actif" title="Modifier" onclick="event.stopPropagation(); openEditAssetModal(${asset.id})" class="inline-flex items-center justify-center w-8 h-8 rounded-md bg-gray-800/60 text-gray-300 hover:bg-emerald-900/60 hover:text-emerald-300 transition"><i class="fa-solid fa-pen"></i></button>
                    <button type="button" aria-label="Supprimer cet actif" title="Supprimer" onclick="event.stopPropagation(); deleteAsset(${asset.id})" class="inline-flex items-center justify-center w-8 h-8 rounded-md bg-gray-800/60 text-gray-300 hover:bg-rose-900/60 hover:text-rose-300 transition"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);

        // ---- Carte (mobile) ----
        const card = document.createElement('div');
        card.className = 'bg-gray-900/60 border border-gray-800 rounded-xl p-3 space-y-2 ' + cardTintClass(asset);
        card.onclick = () => openAssetDetailModal(asset.id);
        card.innerHTML = `
            <div class="flex justify-between items-start gap-2">
                <div class="flex items-start gap-1.5 min-w-0 flex-1">
                    ${assetClassIconHTML(asset)}
                    <div class="min-w-0 flex-1">
                        <div class="font-bold text-white text-sm truncate">${escapeHTML(asset.name)}${concentrationBadgeHTML(asset)}${paperBadgeHTML(asset)}</div>
                        <div class="text-[10px] text-gray-500 font-mono">${assetSubtitleHTML(asset)}</div>
                    </div>
                </div>
                <div class="text-right flex-shrink-0">
                    <div class="font-mono font-bold text-white text-sm">${formatEUR(asset.value)}</div>
                    <div class="font-mono text-[11px] ${pnlCls}">${isPos ? '+' : ''}${formatEUR(pnl)} (${isPos ? '+' : ''}${pnlPct.toFixed(1)}%)</div>
                    <div class="mt-1">${sparklineHTML(asset)}</div>
                </div>
            </div>
            <div class="flex flex-wrap gap-1">${tagBadgesHTML(asset)} ${cadranBadgesHTML(asset)}</div>
            <div class="flex flex-col gap-0.5 text-[11px] text-gray-400">
                <span>Qté ${fmtQty(asset.qty)} · Investi ${formatEUR(asset.invested)} · Frais ${formatEUR(asset.frais || 0)}</span>
                ${asset.qty > 0 ? `<span class="text-gray-500">PRU : <span class="font-mono text-gray-300">${formatUnitPrice(computePRUFromLots(asset))}</span> · Val. unitaire : <span class="font-mono text-gray-300">${formatUnitPrice(asset.value / asset.qty)}</span></span>` : ''}
                <span class="text-gray-500">TRI estimé : ${tirCellHTML(asset)}</span>
                <span class="text-gray-500 flex items-center gap-1.5">Score : ${scoreCellHTML(asset)}</span>
            </div>
            <div class="flex justify-end gap-1 pt-1 border-t border-gray-800">
                <button onclick="event.stopPropagation(); openAssetCompare(${asset.id})" class="p-2 text-gray-400 hover:text-indigo-400" title="Comparer"><i class="fa-solid fa-code-compare"></i></button>
                <button onclick="event.stopPropagation(); openSellSimulator(${asset.id})" class="p-2 text-gray-400 hover:text-purple-400" title="Simuler une vente"><i class="fa-solid fa-flask"></i></button>
                <button onclick="event.stopPropagation(); duplicateAsset(${asset.id})" class="p-2 text-gray-400 hover:text-teal-400" title="Dupliquer"><i class="fa-solid fa-copy"></i></button>
                <button onclick="event.stopPropagation(); openEditAssetModal(${asset.id})" class="p-2 text-gray-400 hover:text-emerald-400" title="Modifier"><i class="fa-solid fa-pen"></i></button>
                <button onclick="event.stopPropagation(); deleteAsset(${asset.id})" class="p-2 text-gray-400 hover:text-rose-400" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
            </div>`;
        cards.appendChild(card);
    });

    if (!filtered.length) {
        cards.innerHTML = '<div class="text-center text-gray-500 text-xs py-6">Aucun actif.</div>';
    }
}

// ---------------------------------------------------------------------
// Filtres et recherche de l'inventaire
// ---------------------------------------------------------------------
function filterCategory(c) {
    inventoryFilter = c;
    document.querySelectorAll('#inventory-filter-group .filter-btn').forEach(btn => {
        const isActive = btn.dataset.cat === c;
        btn.classList.toggle('bg-gray-800', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('border-gray-700', isActive);
        btn.classList.toggle('font-medium', isActive);
        btn.classList.toggle('bg-gray-900', !isActive);
        btn.classList.toggle('text-gray-400', !isActive);
        btn.classList.toggle('border-gray-800', !isActive);
    });
    renderInventoryTable(c);
}

function searchInventory() {
    renderInventoryTable('ALL', document.getElementById('inventory-search').value);
}

// ---------------------------------------------------------------------
// Onglet Crypto
// ---------------------------------------------------------------------
function renderCryptoTable() {
    const tbody = document.getElementById('table-crypto-body');
    const cryptos = assets.filter(a => hasTag(a, 'Crypto'));
    let total = 0;

    tbody.innerHTML = cryptos.map(a => {
        total += a.value || 0;
        const pnl = (a.value || 0) - (a.invested || 0);
        const isPos = pnl >= 0;
        return `<tr class="clickable-row ${rowTintClass(a)}" onclick="openAssetDetailModal(${a.id})">
            <td class="p-3">
                <div class="flex items-center gap-1.5 min-w-0">
                    ${assetClassIconHTML(a)}
                    <div class="min-w-0 flex-1">
                        <div class="font-bold text-white truncate">${escapeHTML(a.name)}${concentrationBadgeHTML(a)}${paperBadgeHTML(a)}</div>
                        <div class="text-[10px] text-gray-500 font-mono">${escapeHTML(a.ticker)}</div>
                    </div>
                </div>
            </td>
            <td class="p-3 text-right font-mono">${fmtQty(a.qty)}</td>
            <td class="p-3 text-right font-mono text-gray-400">${formatEUR(a.frais || 0)}</td>
            <td class="p-3 text-right font-mono">${formatEUR(a.invested)}</td>
            <td class="p-3 text-right font-mono font-bold text-white">${formatEUR(a.value)}</td>
            <td class="p-3 text-right font-mono font-bold ${isPos ? 'text-emerald-400' : 'text-rose-400'}">${isPos ? '+' : ''}${formatEUR(pnl)}</td>
            <td class="p-3 text-center">
                <button onclick="event.stopPropagation(); openEditAssetModal(${a.id})" class="p-1.5 text-gray-400 hover:text-emerald-400"><i class="fa-solid fa-pen"></i></button>
                <button onclick="event.stopPropagation(); deleteAsset(${a.id})" class="p-1.5 text-gray-400 hover:text-rose-400"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('') || '<tr><td colspan="7" class="p-4 text-center text-gray-500 text-xs">Aucun actif crypto enregistré.</td></tr>';

    document.getElementById('crypto-total-val').innerText = formatEUR(total);
}

// ---------------------------------------------------------------------
// Onglet Hors-Cadran & Divers
// ---------------------------------------------------------------------
function filterHorsGave(cat) {
    horsGaveFilter = cat;
    document.querySelectorAll('#hors-filter-group .filter-btn').forEach(btn => {
        const isActive = btn.dataset.cat === cat;
        btn.classList.toggle('bg-gray-800', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('border-gray-700', isActive);
        btn.classList.toggle('font-medium', isActive);
        btn.classList.toggle('bg-gray-900', !isActive);
        btn.classList.toggle('text-gray-400', !isActive);
        btn.classList.toggle('border-gray-800', !isActive);
    });
    renderHorsGaveTable();
}

function renderHorsGaveTable(filterCat = horsGaveFilter) {
    const tbody = document.getElementById('table-hors-gave-body');
    const items = assets.filter(a =>
        a.cadran === 'HORS_GAVE' &&
        !hasTag(a, 'Crypto') &&
        (filterCat === 'ALL' || hasTag(a, filterCat))
    );
    let total = 0;

    tbody.innerHTML = items.map(a => {
        total += a.value || 0;
        const pnl = (a.value || 0) - (a.invested || 0);
        const isPos = pnl >= 0;
        return `<tr class="clickable-row ${rowTintClass(a)}" onclick="openAssetDetailModal(${a.id})">
            <td class="p-3">
                <div class="flex items-center gap-1.5 min-w-0">
                    ${assetClassIconHTML(a)}
                    <div class="min-w-0 flex-1">
                        <div class="font-bold text-white truncate">${escapeHTML(a.name)}${concentrationBadgeHTML(a)}${paperBadgeHTML(a)}</div>
                        <div class="text-[10px] text-gray-500 font-mono">${escapeHTML(a.ticker)}</div>
                    </div>
                </div>
            </td>
            <td class="p-3"><span class="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-[10px]">${escapeHTML(a.category)}</span></td>
            <td class="p-3 text-right font-mono">${fmtQty(a.qty)}</td>
            <td class="p-3 text-right font-mono text-gray-400">${formatEUR(a.frais || 0)}</td>
            <td class="p-3 text-right font-mono font-bold text-white">${formatEUR(a.value)}</td>
            <td class="p-3 text-right font-mono font-bold ${isPos ? 'text-emerald-400' : 'text-rose-400'}">${isPos ? '+' : ''}${formatEUR(pnl)}</td>
            <td class="p-3 text-center">
                <button onclick="event.stopPropagation(); openEditAssetModal(${a.id})" class="p-1.5 text-gray-400 hover:text-emerald-400"><i class="fa-solid fa-pen"></i></button>
                <button onclick="event.stopPropagation(); deleteAsset(${a.id})" class="p-1.5 text-gray-400 hover:text-rose-400"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('') || '<tr><td colspan="7" class="p-4 text-center text-gray-500 text-xs">Aucun actif hors-cadran.</td></tr>';

    document.getElementById('hors-total-val').innerText = formatEUR(total);
}

// ---------------------------------------------------------------------
// Onglet 4 Cadrans de Gave
// ---------------------------------------------------------------------
function updateGaveSection() {
    const totalsByQ = {};
    GAVE_QUADRANTS.forEach(q => {
        totalsByQ[q] = assets.filter(a => a.cadran === q).reduce((s, a) => s + (a.value || 0), 0);
    });
    const gaveTotal = Object.values(totalsByQ).reduce((a, b) => a + b, 0);
    document.getElementById('gave-total-val').innerText = formatEUR(gaveTotal);

    GAVE_QUADRANTS.forEach(q => {
        const val = totalsByQ[q];
        const pct = gaveTotal > 0 ? (val / gaveTotal * 100) : 0;
        document.getElementById('val-' + q).innerText = formatEUR(val);
        document.getElementById('pct-' + q).innerText = pct.toFixed(1) + '% / 25%';
        document.getElementById('bar-' + q).style.width = Math.min(pct, 100) + '%';

        // TRI estimé du cadran (Chantier G)
        const tirEl = document.getElementById('tir-' + q);
        if (tirEl && typeof getSegmentTIR === 'function') {
            const list = assets.filter(a => a.cadran === q && !isPaperAsset(a));
            const tir = getSegmentTIR(list);
            if (tir === null) {
                tirEl.innerText = '—';
                tirEl.className = 'font-mono font-bold text-gray-600';
            } else {
                tirEl.innerText = formatTIR(tir);
                tirEl.className = 'font-mono font-bold ' + tirColorClass(tir);
            }
        }

        const alertEl = document.getElementById('alert-' + q);
        if (gaveTotal <= 0) {
            alertEl.classList.add('hidden');
        } else if (pct >= 35) {
            alertEl.className = 'flex text-[10px] font-medium items-center gap-1 text-amber-400';
            alertEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Sur-pondéré (cible 25%)';
        } else if (pct <= 15) {
            alertEl.className = 'flex text-[10px] font-medium items-center gap-1 text-blue-400';
            alertEl.innerHTML = '<i class="fa-solid fa-circle-arrow-down"></i> Sous-pondéré (cible 25%)';
        } else {
            alertEl.className = 'flex text-[10px] font-medium items-center gap-1 text-emerald-400';
            alertEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> Allocation équilibrée';
        }
    });

    updateCadranTitles();
    renderGaveDetailTable();
}

function toggleGaveDetailFilter(code) {
    if (code === 'ALL') {
        gaveDetailFilter = new Set(GAVE_QUADRANTS);
    } else if (gaveDetailFilter.has(code)) {
        gaveDetailFilter.delete(code);
    } else {
        gaveDetailFilter.add(code);
    }
    renderGaveDetailTable();
}

function renderGaveDetailTable() {
    const allSelected = GAVE_QUADRANTS.every(q => gaveDetailFilter.has(q));
    const activeClasses = {
        OR: 'bg-amber-950 text-amber-300 border-amber-800',
        MONNAIES: 'bg-blue-950 text-blue-300 border-blue-800',
        ASIE: 'bg-emerald-950 text-emerald-300 border-emerald-800',
        PETROLE: 'bg-rose-950 text-rose-300 border-rose-800'
    };

    const group = document.getElementById('gave-detail-filter-group');
    group.innerHTML = `<button onclick="toggleGaveDetailFilter('ALL')" class="px-3 py-1.5 rounded-lg text-xs border font-medium ${allSelected ? 'bg-gray-800 text-white border-gray-700' : 'bg-gray-900 text-gray-400 border-gray-800 hover:text-white'}">Tous</button>` +
        GAVE_QUADRANTS.map(q => {
            const active = gaveDetailFilter.has(q);
            return `<button onclick="toggleGaveDetailFilter('${q}')" class="px-3 py-1.5 rounded-lg text-xs border font-medium ${active ? activeClasses[q] : 'bg-gray-900 text-gray-400 border-gray-800 hover:text-white'}">${escapeHTML(cadranLabel(q))}</button>`;
        }).join('');

    const items = assets.filter(a => GAVE_QUADRANTS.includes(a.cadran) && gaveDetailFilter.has(a.cadran));
    const tbody = document.getElementById('table-gave-detail-body');

    tbody.innerHTML = items.length ? items.map(a => {
        const pnl = (a.value || 0) - (a.invested || 0);
        const isPos = pnl >= 0;
        return `<tr class="clickable-row ${rowTintClass(a)}" onclick="openAssetDetailModal(${a.id})">
            <td class="p-3">
                <div class="flex items-center gap-1.5 min-w-0">
                    ${assetClassIconHTML(a)}
                    <div class="min-w-0 flex-1">
                        <div class="font-bold text-white truncate">${escapeHTML(a.name)}${concentrationBadgeHTML(a)}${paperBadgeHTML(a)}</div>
                        <div class="text-[10px] text-gray-500 font-mono">${escapeHTML(a.ticker)}</div>
                    </div>
                </div>
            </td>
            <td class="p-3">${cadranBadgeHTML(a.cadran)}</td>
            <td class="p-3 text-right font-mono">${fmtQty(a.qty)}</td>
            <td class="p-3 text-right font-mono text-gray-400">${formatEUR(a.frais || 0)}</td>
            <td class="p-3 text-right font-mono">${formatEUR(a.invested)}</td>
            <td class="p-3 text-right font-mono font-bold text-white">${formatEUR(a.value)}</td>
            <td class="p-3 text-right font-mono ${isPos ? 'text-emerald-400' : 'text-rose-400'}">${isPos ? '+' : ''}${formatEUR(pnl)}</td>
            <td class="p-3 text-center whitespace-nowrap">
                <button onclick="event.stopPropagation(); openEditAssetModal(${a.id})" class="p-1.5 text-gray-400 hover:text-emerald-400"><i class="fa-solid fa-pen"></i></button>
                <button onclick="event.stopPropagation(); deleteAsset(${a.id})" class="p-1.5 text-gray-400 hover:text-rose-400"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('') : '<tr><td colspan="8" class="p-4 text-center text-gray-500 text-xs">Aucun placement pour ce filtre.</td></tr>';
}

// ---------------------------------------------------------------------
// Onglet 3 Piliers
// ---------------------------------------------------------------------
function updatePiliersSection() {
    const gaveAssets   = assets.filter(a => GAVE_QUADRANTS.includes(a.cadran));
    const cryptoAssets = assets.filter(a => hasTag(a, 'Crypto'));
    const horsAssets   = assets.filter(a => a.cadran === 'HORS_GAVE' && !hasTag(a, 'Crypto'));

    const piliers = {
        gave:   { value: gaveAssets.reduce((s,a)=>s+(a.value||0),0),   invested: gaveAssets.reduce((s,a)=>s+(a.invested||0),0),   frais: gaveAssets.reduce((s,a)=>s+(a.frais||0),0) },
        crypto: { value: cryptoAssets.reduce((s,a)=>s+(a.value||0),0), invested: cryptoAssets.reduce((s,a)=>s+(a.invested||0),0), frais: cryptoAssets.reduce((s,a)=>s+(a.frais||0),0) },
        hors:   { value: horsAssets.reduce((s,a)=>s+(a.value||0),0),   invested: horsAssets.reduce((s,a)=>s+(a.invested||0),0),   frais: horsAssets.reduce((s,a)=>s+(a.frais||0),0) }
    };

    const totalPatrimoine = piliers.gave.value + piliers.crypto.value + piliers.hors.value;
    const maxVal = Math.max(piliers.gave.value, piliers.crypto.value, piliers.hors.value, 1);

    document.getElementById('piliers-total-patrimoine').innerText = formatEUR(totalPatrimoine);

    ['gave', 'crypto', 'hors'].forEach(key => {
        const p = piliers[key];
        const pnl = p.value - p.invested;
        const isPos = pnl >= 0;
        const pct = totalPatrimoine > 0 ? (p.value / totalPatrimoine * 100) : 0;

        document.getElementById('pilier-val-' + key).innerText      = formatEUR(p.value);
        document.getElementById('pilier-invested-' + key).innerText = formatEUR(p.invested);
        document.getElementById('pilier-frais-' + key).innerText    = formatEUR(p.frais);
        document.getElementById('pilier-pct-' + key).innerText      = pct.toFixed(1) + '%';
        document.getElementById('pilier-bar-' + key).style.width    = Math.min(100, (p.value / maxVal) * 100) + '%';

        const pnlEl = document.getElementById('pilier-pnl-' + key);
        pnlEl.className = `font-mono font-bold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`;
        pnlEl.innerText = `${isPos ? '+' : ''}${formatEUR(pnl)}`;
    });
}

// ---------------------------------------------------------------------
// Historique des arbitrages (CRUD)
// ---------------------------------------------------------------------
function renderArbitragesTable() {
    const tbody = document.getElementById('table-arbitrages-body');
    const sorted = [...arbitrages].sort((a, b) => new Date(b.date) - new Date(a.date));
    tbody.innerHTML = sorted.length ? sorted.map(a => `
        <tr>
            <td class="p-3 whitespace-nowrap">${a.date ? new Date(a.date).toLocaleDateString('fr-FR') : '—'}</td>
            <td class="p-3 text-rose-300 font-bold">${escapeHTML(a.source)}</td>
            <td class="p-3 text-emerald-300 font-bold">${escapeHTML(a.destination)}</td>
            <td class="p-3 text-right text-white font-bold">${formatEUR(a.montant)}</td>
            <td class="p-3 text-gray-400 font-sans">${escapeHTML(a.motif) || '—'}</td>
            <td class="p-3 text-center whitespace-nowrap">
                <button onclick="editArbitrage(${a.id})" class="p-1.5 text-gray-400 hover:text-indigo-400"><i class="fa-solid fa-pen"></i></button>
                <button onclick="deleteArbitrage(${a.id})" class="p-1.5 text-gray-400 hover:text-rose-400"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`).join('') : '<tr><td colspan="6" class="p-4 text-center text-gray-500 text-xs">Aucun arbitrage consigné pour le moment.</td></tr>';
}

function openAddArbitrageModal() {
    document.getElementById('arb-edit-id').value = '';
    document.getElementById('arb-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('arb-source').value = '';
    document.getElementById('arb-destination').value = '';
    document.getElementById('arb-montant').value = '';
    document.getElementById('arb-motif').value = '';
    document.getElementById('modal-add-arbitrage').classList.remove('hidden');
}

function editArbitrage(id) {
    const a = arbitrages.find(x => x.id === id);
    if (!a) return;
    document.getElementById('arb-edit-id').value = a.id;
    document.getElementById('arb-date').value = a.date || '';
    document.getElementById('arb-source').value = a.source;
    document.getElementById('arb-destination').value = a.destination;
    document.getElementById('arb-montant').value = a.montant;
    document.getElementById('arb-motif').value = a.motif || '';
    document.getElementById('modal-add-arbitrage').classList.remove('hidden');
}

function handleAddArbitrage(e) {
    e.preventDefault();
    const editId = document.getElementById('arb-edit-id').value;
    const arb = {
        id: editId ? parseFloat(editId) : Date.now(),
        date: document.getElementById('arb-date').value,
        source: document.getElementById('arb-source').value,
        destination: document.getElementById('arb-destination').value,
        montant: parseFloat(document.getElementById('arb-montant').value) || 0,
        motif: document.getElementById('arb-motif').value
    };
    if (editId) {
        const idx = arbitrages.findIndex(a => a.id === parseFloat(editId));
        if (idx > -1) arbitrages[idx] = arb;
    } else {
        arbitrages.push(arb);
    }
    saveArbitrages();
    closeModal('modal-add-arbitrage');
    renderArbitragesTable();
    e.target.reset();
}

function deleteArbitrage(id) {
    if (confirm('Supprimer cet arbitrage ?')) {
        arbitrages = arbitrages.filter(a => a.id !== id);
        saveArbitrages();
        renderArbitragesTable();
    }
}

// ---------------------------------------------------------------------
// Reclassement Action / ETF (migration v1 -> v2)
// ---------------------------------------------------------------------
function pendingReclassAssets() {
    return assets.filter(a => a.needsReclass);
}

function updateReclassBanner() {
    const n = pendingReclassAssets().length;
    const el = document.getElementById('reclass-banner');
    if (!el) return;
    el.classList.toggle('hidden', n === 0);
    document.getElementById('reclass-banner-count').innerText = n;
}

function maybeShowReclassModal() {
    updateReclassBanner();
    if (pendingReclassAssets().length) openReclassModal();
}

function openReclassModal() {
    const list = pendingReclassAssets();
    if (!list.length) return;
    document.getElementById('modal-reclass-body').innerHTML = list.map(a => `
        <div class="flex items-center justify-between gap-3 p-2.5 bg-gray-950 border border-gray-800 rounded-lg">
            <div class="min-w-0"><div class="font-bold text-white truncate">${escapeHTML(a.name)}</div><div class="text-[10px] text-gray-500 font-mono">${escapeHTML(a.ticker)}</div></div>
            <div class="flex gap-3 flex-shrink-0 text-gray-300">
                <label class="flex items-center gap-1"><input type="radio" name="reclass-${a.id}" value="Action" ${a.reclassSuggestion !== 'ETF' ? 'checked' : ''} class="accent-emerald-500"> Action</label>
                <label class="flex items-center gap-1"><input type="radio" name="reclass-${a.id}" value="ETF" ${a.reclassSuggestion === 'ETF' ? 'checked' : ''} class="accent-indigo-500"> ETF</label>
            </div>
        </div>`).join('');
    document.getElementById('modal-reclass').classList.remove('hidden');
}

function applyReclass() {
    pendingReclassAssets().forEach(a => {
        const checked = document.querySelector(`input[name="reclass-${a.id}"]:checked`);
        const choice = checked ? checked.value : (a.reclassSuggestion || 'Action');
        a.categories = [choice].concat((a.categories || []).filter(t => t !== 'Action' && t !== 'ETF'));
        delete a.needsReclass; delete a.reclassSuggestion;
    });
    saveToStorage();
    closeModal('modal-reclass');
    refreshAllUI();
    updateReclassBanner();
}

// ---------------------------------------------------------------------
// Réaffectation rapide d'un cadran depuis un modal
// ---------------------------------------------------------------------
function reassignAssetCadran(assetId, newCadran) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;
    asset.cadrans = asset.cadrans || { primary: newCadran, secondary: [] };
    asset.cadrans.primary = newCadran;
    asset.cadran = newCadran;
    saveToStorage();
    refreshAllUI();
    if (currentQuadrantCode) renderQuadrantModalContent(currentQuadrantCode);
    if (currentAssetDetailId === assetId && !document.getElementById('modal-asset-detail').classList.contains('hidden')) {
        document.getElementById('modal-asset-cadran-select-wrap').innerHTML = cadranSelectHTML(asset.id, asset.cadran);
    }
}

// ---------------------------------------------------------------------
// Renommage des cadrans
// ---------------------------------------------------------------------
function startRenameCadran(code, evt) {
    if (evt) evt.stopPropagation();
    const targets = [document.getElementById('cadran-title-' + code)];
    if (currentQuadrantCode === code) targets.push(document.getElementById('modal-quadrant-title'));

    targets.forEach(el => {
        if (!el || el.querySelector('input')) return;
        el.innerHTML = '';

        const prefix = document.createElement('span');
        prefix.className = 'text-gray-400 font-normal';
        prefix.innerText = `Cadran ${CADRAN_NUM[code]} : `;

        const input = document.createElement('input');
        input.type = 'text';
        input.value = cadranNames[code];
        input.maxLength = 40;
        input.className = 'bg-gray-950 border border-indigo-500 rounded px-1.5 py-0.5 text-white text-sm w-32 focus:outline-none';
        input.onclick = (e) => e.stopPropagation();
        input.onkeydown = (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            else if (e.key === 'Escape') { e.preventDefault(); updateCadranTitles(); }
        };
        input.onblur = () => commitRenameCadran(code, input.value);

        el.appendChild(prefix);
        el.appendChild(input);
        input.focus();
        input.select();
    });
}

function commitRenameCadran(code, newName) {
    const trimmed = (newName || '').trim();
    if (trimmed) {
        cadranNames[code] = trimmed;
        localStorage.setItem(pfKey('patriMonial_cadranNames'), JSON.stringify(cadranNames));
    }
    updateCadranTitles();
    refreshAllUI();
    if (currentQuadrantCode === code) renderQuadrantModalContent(code);
}

function updateCadranTitles() {
    GAVE_QUADRANTS.forEach(q => {
        const el = document.getElementById('cadran-title-' + q);
        if (el) el.innerText = `Cadran ${CADRAN_NUM[q]} : ${cadranLabel(q)}`;
        const opt = document.querySelector(`#add-cadran option[value="${q}"]`);
        if (opt) opt.text = `Cadran ${CADRAN_NUM[q]} : ${cadranLabel(q)}`;
        const filterBtn = document.getElementById('inv-filter-CADRAN_' + q);
        if (filterBtn) filterBtn.innerText = 'Cadran ' + cadranLabel(q);
    });
}

// ---------------------------------------------------------------------
// Actions globales (vider, reset démo)
// ---------------------------------------------------------------------
function clearAllData() {
    if (confirm('Vider tout (actifs, cessions ET arbitrages enregistrés) ?')) {
        assets = []; cessions = []; arbitrages = [];
        saveToStorage(); saveCessions(); saveArbitrages();
        refreshAllUI();
    }
}

function resetData() {
    assets    = JSON.parse(JSON.stringify(defaultAssets));
    cessions  = JSON.parse(JSON.stringify(defaultCessions));
    arbitrages = JSON.parse(JSON.stringify(defaultArbitrages));
    saveToStorage(); saveCessions(); saveArbitrages();
    refreshAllUI();
}

// Fermeture de modal (utilitaire générique, appelé partout)
function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

// =====================================================================
// STATS AVANCÉES PAR ONGLET (Lot D)
// =====================================================================
function computeAdvancedStats() {
    const totalValue = assets.reduce((s, a) => s + (a.value || 0), 0);

    // --- 1) INVENTAIRE ---
    const invCount = assets.length;
    const invEl = document.getElementById('inv-stat-count');
    if (invEl) invEl.innerText = invCount;

    // Plus grosse position
    let topAsset = null, topVal = 0;
    assets.forEach(a => {
        if ((a.value || 0) > topVal) { topVal = a.value; topAsset = a; }
    });
    const topPctEl = document.getElementById('inv-stat-top-pct');
    const topNameEl = document.getElementById('inv-stat-top-name');
    if (topPctEl) topPctEl.innerText = (topAsset && totalValue > 0)
        ? (topVal / totalValue * 100).toFixed(1) + '%'
        : '—';
    if (topNameEl) topNameEl.innerText = topAsset ? topAsset.name : '—';

    // Concentration HHI (indice de Herfindahl-Hirschman)
    // HHI = Σ (poids_i)² × 10000. Plus le HHI est élevé, plus le portefeuille est concentré.
    let hhi = 0;
    if (totalValue > 0) {
        assets.forEach(a => {
            const w = (a.value || 0) / totalValue;
            hhi += w * w;
        });
        hhi *= 10000;
    }
    const hhiEl = document.getElementById('inv-stat-hhi');
    const hhiLabelEl = document.getElementById('inv-stat-hhi-label');
    if (hhiEl) hhiEl.innerText = totalValue > 0 ? Math.round(hhi) : '—';
    if (hhiLabelEl) {
        let label = '—';
        if (hhi > 0 && hhi < 1500)       label = 'Diversifié';
        else if (hhi >= 1500 && hhi < 2500) label = 'Modérément concentré';
        else if (hhi >= 2500)            label = 'Très concentré';
        hhiLabelEl.innerText = label;
    }

    // Position la plus ancienne : on cherche d'abord dans les lots restants,
    // puis dans les buys, et on retient le MIN global sur TOUS les actifs.
    let oldestAsset = null, oldestDate = null;
    assets.forEach(a => {
        let localOldest = null;
        (a.lots || []).forEach(l => {
            if ((l.qtyRemaining || 0) <= 0) return;
            const d = parseFlexDate(l.date);
            if (d && (!localOldest || d < localOldest)) localOldest = d;
        });
        // Fallback sur buys[0] uniquement si AUCUN lot exploitable pour CET actif
        if (!localOldest && a.buys && a.buys[0]) {
            const d = parseFlexDate(a.buys[0].date);
            if (d) localOldest = d;
        }
        if (localOldest && (!oldestDate || localOldest < oldestDate)) {
            oldestDate = localOldest;
            oldestAsset = a;
        }
    });
    const oldestYearsEl = document.getElementById('inv-stat-oldest-years');
    const oldestNameEl  = document.getElementById('inv-stat-oldest-name');
    if (oldestYearsEl) {
        if (oldestDate) {
            const years = (Date.now() - oldestDate.getTime()) / (1000 * 3600 * 24 * 365.25);
            oldestYearsEl.innerText = years.toFixed(1) + ' ans';
        } else {
            oldestYearsEl.innerText = '—';
        }
    }
    if (oldestNameEl) oldestNameEl.innerText = oldestAsset ? oldestAsset.name : '—';

    // --- 2) CRYPTO ---
    const cryptos = assets.filter(a => hasTag(a, 'Crypto'));
    const cryptoVal = cryptos.reduce((s, a) => s + (a.value || 0), 0);
    const cryptoInvested = cryptos.reduce((s, a) => s + (a.invested || 0), 0);

    const cryptoCntEl = document.getElementById('crypto-stat-count');
    if (cryptoCntEl) cryptoCntEl.innerText = cryptos.length;

    const cryptoInvEl = document.getElementById('crypto-stat-invested');
    if (cryptoInvEl) cryptoInvEl.innerText = formatEUR(cryptoInvested);

    const cryptoPnlEl = document.getElementById('crypto-stat-pnl');
    const cryptoFrais = cryptos.reduce((s, a) => s + (a.frais || 0), 0);
    if (cryptoPnlEl) {
        const pnl = cryptoVal - cryptoInvested;
        countUp(cryptoPnlEl, pnl, fmtSignedEUR);
        cryptoPnlEl.className = `text-lg font-bold font-mono ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }

    // KPI hors frais Crypto
    const cryptoPnlHfEl = document.getElementById('crypto-stat-pnl-hf');
    if (cryptoPnlHfEl) {
        const pnlHf = (cryptoVal - cryptoInvested) + cryptoFrais;
        countUp(cryptoPnlHfEl, pnlHf, fmtSignedEUR);
        cryptoPnlHfEl.className = `text-lg font-bold font-mono ${pnlHf >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
        const dEl = document.getElementById('crypto-stat-pnl-hf-detail');
        if (dEl) dEl.innerText = `frais : ${formatEUR(cryptoFrais)}`;
    }

    let topCrypto = null, topCryptoVal = 0;
    cryptos.forEach(a => { if ((a.value || 0) > topCryptoVal) { topCryptoVal = a.value; topCrypto = a; } });
    const cryptoTopPctEl = document.getElementById('crypto-stat-top-pct');
    const cryptoTopNameEl = document.getElementById('crypto-stat-top-name');
    if (cryptoTopPctEl) cryptoTopPctEl.innerText = (topCrypto && cryptoVal > 0)
        ? (topCryptoVal / cryptoVal * 100).toFixed(1) + '%'
        : '—';
    if (cryptoTopNameEl) cryptoTopNameEl.innerText = topCrypto ? topCrypto.name : '—';

    // --- 3) HORS-CADRAN ---
    const hors = assets.filter(a => a.cadran === 'HORS_GAVE' && !hasTag(a, 'Crypto'));
    const horsVal = hors.reduce((s, a) => s + (a.value || 0), 0);
    const horsInvested = hors.reduce((s, a) => s + (a.invested || 0), 0);

    const horsCntEl = document.getElementById('hors-stat-count');
    if (horsCntEl) horsCntEl.innerText = hors.length;

    const horsInvEl = document.getElementById('hors-stat-invested');
    if (horsInvEl) horsInvEl.innerText = formatEUR(horsInvested);

    const horsPnlEl = document.getElementById('hors-stat-pnl');
    const horsFrais = hors.reduce((s, a) => s + (a.frais || 0), 0);
    if (horsPnlEl) {
        const pnl = horsVal - horsInvested;
        countUp(horsPnlEl, pnl, fmtSignedEUR);
        horsPnlEl.className = `text-lg font-bold font-mono ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }

    // KPI hors frais Hors-Cadran
    const horsPnlHfEl = document.getElementById('hors-stat-pnl-hf');
    if (horsPnlHfEl) {
        const pnlHf = (horsVal - horsInvested) + horsFrais;
        countUp(horsPnlHfEl, pnlHf, fmtSignedEUR);
        horsPnlHfEl.className = `text-lg font-bold font-mono ${pnlHf >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
        const dEl = document.getElementById('hors-stat-pnl-hf-detail');
        if (dEl) dEl.innerText = `frais : ${formatEUR(horsFrais)}`;
    }

    const cash = hors.filter(a => hasTag(a, 'Devises/Liquidités')).reduce((s, a) => s + (a.value || 0), 0);
    const horsCashEl = document.getElementById('hors-stat-cash');
    if (horsCashEl) horsCashEl.innerText = formatEUR(cash);

    // --- 4) PILIERS ---
    const gaveAssets = assets.filter(a => GAVE_QUADRANTS.includes(a.cadran));
    const gaveTotal = gaveAssets.reduce((s, a) => s + (a.value || 0), 0);
    const totalPatrimoine = totalValue;

    // Équilibre des 4 Cadrans : écart max à la cible 25%
    let maxDeviation = 0;
    if (gaveTotal > 0) {
        GAVE_QUADRANTS.forEach(q => {
            const qVal = assets.filter(a => a.cadran === q).reduce((s, a) => s + (a.value || 0), 0);
            const pct = qVal / gaveTotal * 100;
            maxDeviation = Math.max(maxDeviation, Math.abs(pct - 25));
        });
    }
    const equilibreEl = document.getElementById('piliers-stat-equilibre');
    if (equilibreEl) {
        if (gaveTotal <= 0) equilibreEl.innerHTML = '<span class="text-gray-500">—</span>';
        else {
            const color = maxDeviation < 5 ? 'text-emerald-400' : maxDeviation < 15 ? 'text-amber-400' : 'text-rose-400';
            equilibreEl.innerHTML = `<span class="${color}">±${maxDeviation.toFixed(1)}%</span>`;
        }
    }

    const pctCryptoEl = document.getElementById('piliers-stat-pct-crypto');
    if (pctCryptoEl) {
        const pct = totalPatrimoine > 0 ? (cryptoVal / totalPatrimoine * 100) : 0;
        pctCryptoEl.innerText = pct.toFixed(1) + '%';
    }

    const totalInvestedAll = assets.reduce((s, a) => s + (a.invested || 0), 0);
    const totalFraisAll = assets.reduce((s, a) => s + (a.frais || 0), 0);
    const fraisEl = document.getElementById('piliers-stat-frais');
    if (fraisEl) fraisEl.innerText = formatEUR(totalFraisAll);
    const fraisPctEl = document.getElementById('piliers-stat-frais-pct');
    if (fraisPctEl) fraisPctEl.innerText = (totalInvestedAll > 0 ? (totalFraisAll / totalInvestedAll * 100) : 0).toFixed(2) + '% du capital';

    // --- 5) FISCALITÉ ---
    // PRU moyen pondéré global sur positions détenues
    let totalQtyCost = 0;
    let totalQty = 0;
    assets.forEach(a => {
        const pru = computePRUFromLots(a);
        totalQtyCost += pru * (a.qty || 0);
        totalQty += a.qty || 0;
    });
    const pruGlobalEl = document.getElementById('fiscal-stat-pru');
    if (pruGlobalEl) pruGlobalEl.innerText = totalQty > 0 ? formatEUR(totalQtyCost / totalQty) + ' / unité' : '—';

    const fraisCessionEl = document.getElementById('fiscal-stat-frais-cession');
    if (fraisCessionEl) fraisCessionEl.innerText = formatEUR(cessions.reduce((s, c) => s + (c.frais || 0), 0));

    // Taux d'imposition effectif — B14 : via l'objet structuré, plus de lecture DOM
    let impotTotal = 0;
    if (typeof computeTaxBreakdown === 'function') {
        const tax = (typeof lastTaxBreakdown !== 'undefined' && lastTaxBreakdown)
            ? lastTaxBreakdown
            : computeTaxBreakdown();
        impotTotal = tax.totalImpot || 0;
    }

    let pnlRealise = 0, costRealise = 0;
    cessions.forEach(c => {
        pnlRealise += (c.prixVente || 0) - (c.prixAchat || 0) - (c.frais || 0);
        costRealise += (c.prixAchat || 0);
    });
    const effectiveRate = pnlRealise > 0 ? (impotTotal / pnlRealise * 100) : 0;
    const effRateEl = document.getElementById('fiscal-stat-effective-rate');
    if (effRateEl) effRateEl.innerText = effectiveRate.toFixed(1) + '%';
}


// =====================================================================
// PALETTE DE COMMANDES (Ctrl+K / Cmd+K) — navigation clavier rapide
// Recherche floue sur le libellé + indice + catégorie de chaque commande.
// Inclut des sous-commandes dynamiques par actif ("Ouvrir : BTC"…).
// =====================================================================
let _cmdPaletteSelectedIndex = 0;
let _cmdPaletteResults = [];

function getCommandList() {
    const cmds = [
        { label: 'Ajouter un actif',              hint: "Ouvrir le formulaire d'ajout",           icon: 'fa-plus',                category: 'Action',     run: () => openAddAssetModal() },
        { label: 'Vendre un actif',               hint: 'Enregistrer une vente réalisée',         icon: 'fa-hand-holding-dollar', category: 'Action',     run: () => openSellAssetModal() },
        { label: 'Ajouter une cession',           hint: 'Saisir une cession (fiscalité)',         icon: 'fa-file-invoice-dollar', category: 'Fiscalité',  run: () => openAddCessionModal() },
        { label: 'Consigner un arbitrage',        hint: 'Historique des réallocations',           icon: 'fa-right-left',          category: 'Fiscalité',  run: () => openAddArbitrageModal() },
        { label: 'Récapitulatif fiscal',          hint: 'Résumé fiscal 2025 imprimable',          icon: 'fa-file-invoice',        category: 'Fiscalité',  run: () => openRecapModal() },
        { label: 'Actualiser les cours',          hint: 'Crypto + devises + actions/ETF',         icon: 'fa-arrows-rotate',       category: 'Données',    run: () => fetchLivePrices() },
        { label: 'Historique de prix (1 an)',     hint: 'Télécharger les cours réels',            icon: 'fa-chart-line',          category: 'Données',    run: () => refreshRealPriceHistory() },
        { label: 'Importer un CSV / Excel',       hint: 'AuCoffre, Trade Republic, Boursorama…',  icon: 'fa-file-csv',            category: 'Données',    run: () => openCsvImportModal() },
        { label: 'Importer un JSON PatriMonial',  hint: 'Restaurer une sauvegarde JSON',          icon: 'fa-file-import',         category: 'Données',    run: () => document.getElementById('input-import-json').click() },
        { label: 'Exporter en JSON',              hint: 'Télécharger la sauvegarde complète',     icon: 'fa-download',            category: 'Données',    run: () => exportData() },
        { label: 'Rapport mensuel (PDF A4)',      hint: 'Synthèse, allocation, portefeuille, fiscalité', icon: 'fa-file-pdf', category: 'Données',    run: () => exportMonthlyReportPDF() },
        { label: 'Exporter en Excel (.xlsx)',     hint: '5 feuilles : synthèse, actifs, lots, cessions, arbitrages', icon: 'fa-file-excel', category: 'Données', run: () => exportToExcel() },
        { label: 'Exporter en Excel (.xlsx)',     hint: '5 feuilles : synthèse, actifs, lots, cessions, arbitrages', icon: 'fa-file-excel', category: 'Données', run: () => exportToExcel() },
        { label: 'Synchronisation Google Drive',  hint: 'Sauvegardes chiffrées AES-256',          icon: 'fa-cloud-arrow-up',      category: 'Données',    run: () => openDriveSyncModal() },
        { label: 'Explication du TRI',            hint: 'Pourquoi ce ratio est plus juste que le P&L', icon: 'fa-percent',        category: 'Fiscalité',  run: () => alert('Le TRI (Taux de Rendement Interne) annualise votre performance en tenant compte du moment où chaque euro a été investi.\n\nUn actif acheté hier en +5 % a un TRI supérieur à un actif acheté il y a 10 ans en +30 % — parce que le premier a "travaillé" beaucoup moins longtemps pour le même résultat.\n\nLe TRI est donc le meilleur indicateur pour juger un DCA ou des versements échelonnés.') },
        { label: 'Méthode de notation des actifs', hint: 'Comment le score 0-100 est calculé',     icon: 'fa-trophy',              category: 'Fiscalité',  run: () => openScoringMethodModal() },
        { label: 'Leaderboard Top & Flop',        hint: 'Voir les meilleurs et pires actifs',     icon: 'fa-ranking-star',        category: 'Navigation', run: () => { switchTab('tab-dashboard'); setTimeout(() => { const el = document.getElementById('scoring-top5'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 100); } },
        { label: 'Suggestions intelligentes',     hint: 'Conseils contextuels sur le portefeuille', icon: 'fa-brain',             category: 'Navigation', run: () => { switchTab('tab-dashboard'); setTimeout(() => { const el = document.getElementById('suggestions-grid'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 100); } },
        { label: 'Charger les données démo',      hint: "Remet le portefeuille d'exemple",        icon: 'fa-rotate-left',         category: 'Action',     run: () => resetData() },
        { label: 'Vider tout',                    hint: 'Effacer actifs, cessions et arbitrages', icon: 'fa-trash-can',           category: 'Action',     run: () => clearAllData() },
        { label: (tintRowsEnabled ? 'Désactiver' : 'Activer') + ' le teintage des lignes', hint: 'Vert = gain · Rouge = perte', icon: 'fa-palette', category: 'Action', run: () => { toggleTintRows(); } },
        { label: (lightMode ? 'Passer en mode sombre' : 'Passer en mode clair'), hint: 'Basculer le thème de l\'interface', icon: lightMode ? 'fa-moon' : 'fa-sun', category: 'Action', run: () => { toggleLightMode(); } },
        { label: (paperMode ? 'Désactiver' : 'Activer') + ' le Paper Trading', hint: 'Créer des positions fictives pour tester des stratégies', icon: 'fa-flask', category: 'Action', run: () => { togglePaperMode(); } },
        { label: (paperIncludeInStats ? 'Exclure' : 'Inclure') + ' les positions papier des stats', hint: 'Impact sur les KPI et le calcul fiscal global', icon: 'fa-filter', category: 'Action', run: () => { setPaperIncludeInStats(!paperIncludeInStats); } },
        { label: 'Nouveau scénario Paper', hint: 'Créer un scénario de test isolé (couleur dédiée)', icon: 'fa-flask', category: 'Action', run: () => { createPaperScenarioUI(); } },
        { label: 'Purger les positions papier', hint: 'Supprimer toutes les positions fictives (tous scénarios)', icon: 'fa-trash-can', category: 'Action', run: () => { deleteAllPaperAssets(); } },
        { label: 'Purger le scénario Paper courant', hint: 'Supprimer uniquement les positions du scénario actif', icon: 'fa-filter-circle-xmark', category: 'Action', run: () => { deleteAllPaperAssets(currentPaperScenarioId); } },
        { label: "Vue d'ensemble",                hint: 'Onglet 1',                               icon: 'fa-gauge-high',          category: 'Navigation', run: () => switchTab('tab-dashboard') },
        { label: 'Inventaire des placements',     hint: 'Onglet 2',                               icon: 'fa-list-check',          category: 'Navigation', run: () => switchTab('tab-inventaire') },
        { label: '4 Cadrans de Gave',             hint: 'Onglet 3',                               icon: 'fa-compass',             category: 'Navigation', run: () => switchTab('tab-gave') },
        { label: 'Cryptomonnaies',                hint: 'Onglet 4',                               icon: 'fa-bitcoin',             category: 'Navigation', run: () => switchTab('tab-crypto') },
        { label: 'Hors-Cadran & Divers',          hint: 'Onglet 5',                               icon: 'fa-building-columns',    category: 'Navigation', run: () => switchTab('tab-hors-gave') },
        { label: 'Évaluation 3 Piliers',          hint: 'Onglet 6',                               icon: 'fa-scale-balanced',      category: 'Navigation', run: () => switchTab('tab-piliers') },
        { label: 'Fiscalité & Cessions',          hint: 'Onglet 7',                               icon: 'fa-receipt',             category: 'Navigation', run: () => switchTab('tab-annee-n1') },
        { label: 'Stratégies Paper Trading',      hint: 'Onglet 8 — dashboard des scénarios',    icon: 'fa-flask',               category: 'Navigation', run: () => switchTab('tab-strategies') },
        { label: 'Objectifs & Projections',        hint: 'Onglet 9 — Monte-Carlo patrimoine',      icon: 'fa-bullseye',            category: 'Navigation', run: () => switchTab('tab-objectifs') },
        { label: 'Nouvel objectif patrimonial',    hint: 'Définir un objectif chiffré',            icon: 'fa-plus',                category: 'Action',     run: () => openAddGoalModal() },
        { label: 'Comparateur de segments',       hint: 'Activer / fermer la comparaison',        icon: 'fa-code-compare',        category: 'Navigation', run: () => { switchTab('tab-dashboard'); toggleCompareMode(); } },
        { label: 'Simulateur de vente',           hint: "« Et si je vendais X ? » (ouvre le 1ᵉʳ actif)", icon: 'fa-flask',          category: 'Fiscalité',  run: () => { if (assets.length) openSellSimulator(assets[0].id); else alert('Aucun actif à simuler.'); } }
    ];
    // Sous-commandes dynamiques : un couple Ouvrir/Modifier pour chaque actif
    assets.forEach(a => {
        cmds.push({
            label: 'Ouvrir : ' + a.name,
            hint: (a.ticker || '') + ' · ' + formatEUR(a.value || 0),
            icon: 'fa-eye', category: 'Actifs',
            run: () => openAssetDetailModal(a.id)
        });
        cmds.push({
            label: 'Modifier : ' + a.name,
            hint: a.ticker || '',
            icon: 'fa-pen', category: 'Actifs',
            run: () => openEditAssetModal(a.id)
        });
    });
    return cmds;
}

// Score de correspondance floue : 0 = pas de match, plus le score est haut,
// plus la correspondance est pertinente. Bonus si le match est en début de mot.
function _fuzzyScore(query, target) {
    if (!query) return 1;
    const q = query.toLowerCase();
    const t = String(target || '').toLowerCase();
    const idx = t.indexOf(q);
    if (idx !== -1) {
        const boundary = idx === 0 || /[\s:.,()\/-]/.test(t[idx - 1]);
        return 1000 - idx + (boundary ? 200 : 0);
    }
    // Match « sous-séquence » : les caractères de q apparaissent dans l'ordre
    let ti = 0, score = 0, streak = 0;
    for (const ch of q) {
        const f = t.indexOf(ch, ti);
        if (f === -1) return 0;
        streak = (f === ti) ? streak + 1 : 0;
        score += 10 + streak;
        ti = f + 1;
    }
    return score;
}

function renderCommandPaletteResults(query) {
    const container = document.getElementById('cmd-palette-results');
    if (!container) return;

    const q = (query || '').trim();
    const all = getCommandList();

    // Pondère : libellé > hint > catégorie
    _cmdPaletteResults = all.map(c => {
        const s = Math.max(
            _fuzzyScore(q, c.label) * 1.5,
            _fuzzyScore(q, c.hint || ''),
            _fuzzyScore(q, c.category) * 0.5
        );
        return { cmd: c, score: s };
    }).filter(r => !q || r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
      .map(r => r.cmd);

    if (_cmdPaletteSelectedIndex >= _cmdPaletteResults.length) _cmdPaletteSelectedIndex = 0;

    if (!_cmdPaletteResults.length) {
        container.innerHTML = '<div class="p-4 text-xs text-gray-500 italic text-center">Aucune commande ne correspond à votre recherche.</div>';
        return;
    }

    let lastCat = null;
    container.innerHTML = _cmdPaletteResults.map((c, i) => {
        const header = c.category !== lastCat
            ? `<div class="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider font-bold text-gray-500">${escapeHTML(c.category)}</div>`
            : '';
        lastCat = c.category;
        const sel = i === _cmdPaletteSelectedIndex;
        return header + `
            <div data-cmd-index="${i}" onclick="runCommandPaletteItem(${i})" onmouseenter="hoverCommandPaletteItem(${i})"
                 class="flex items-center gap-3 px-3 py-2 cursor-pointer border-l-2 ${sel ? 'bg-teal-950/60 border-teal-400' : 'border-transparent hover:bg-gray-800/60'}">
                <i class="fa-solid ${c.icon} w-4 text-center ${sel ? 'text-teal-400' : 'text-gray-500'}"></i>
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-medium ${sel ? 'text-white' : 'text-gray-300'} truncate">${escapeHTML(c.label)}</div>
                    ${c.hint ? `<div class="text-[10px] text-gray-500 truncate">${escapeHTML(c.hint)}</div>` : ''}
                </div>
            </div>`;
    }).join('');

    const el = container.querySelector(`[data-cmd-index="${_cmdPaletteSelectedIndex}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
}

function hoverCommandPaletteItem(i) {
    if (_cmdPaletteSelectedIndex === i) return;
    _cmdPaletteSelectedIndex = i;
    renderCommandPaletteResults(document.getElementById('cmd-palette-input')?.value || '');
}

function runCommandPaletteItem(i) {
    const cmd = _cmdPaletteResults[i];
    if (!cmd) return;
    closeCommandPalette();
    // Léger délai pour laisser la palette se refermer avant d'ouvrir le modal suivant
    setTimeout(() => {
        try { cmd.run(); }
        catch (err) { console.error(err); alert('Erreur : ' + err.message); }
    }, 60);
}

function handleCommandPaletteKey(e) {
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        _cmdPaletteSelectedIndex = Math.min(_cmdPaletteSelectedIndex + 1, _cmdPaletteResults.length - 1);
        renderCommandPaletteResults(e.target.value);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        _cmdPaletteSelectedIndex = Math.max(_cmdPaletteSelectedIndex - 1, 0);
        renderCommandPaletteResults(e.target.value);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        runCommandPaletteItem(_cmdPaletteSelectedIndex);
    } else if (e.key === 'Escape') {
        e.preventDefault();
        closeCommandPalette();
    }
}

function openCommandPalette() {
    const modal = document.getElementById('modal-command-palette');
    const input = document.getElementById('cmd-palette-input');
    if (!modal || !input) return;
    input.value = '';
    _cmdPaletteSelectedIndex = 0;
    renderCommandPaletteResults('');
    modal.classList.remove('hidden');
    setTimeout(() => input.focus(), 30);
}

function closeCommandPalette() {
    const modal = document.getElementById('modal-command-palette');
    if (modal) modal.classList.add('hidden');
}



// =====================================================================
// INTERFACE MULTI-PORTEFEUILLE
// =====================================================================
function computePortfolioTotal(portfolioId) {
    if (portfolioId === currentPortfolioId) {
        return assets.reduce((s, a) => s + (a.value || 0), 0);
    }
    const key = portfolioId === PORTFOLIO_DEFAULT
        ? 'patriMonial_assets'
        : 'patriMonial_assets__' + portfolioId;
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return 0;
        const list = JSON.parse(raw);
        if (!Array.isArray(list)) return 0;
        return list.reduce((s, a) => s + (a.value || 0), 0);
    } catch (_) { return 0; }
}

function computeGlobalPatrimoine() {
    return portfolios.reduce((s, p) => s + computePortfolioTotal(p.id), 0);
}

function renderPortfolioMenu() {
    const totalEl = document.getElementById('portfolio-global-total');
    if (totalEl) totalEl.innerText = formatEUR(computeGlobalPatrimoine());

    const list = document.getElementById('portfolio-list');
    if (!list) return;
    list.innerHTML = portfolios.map(p => {
        const isCurrent = p.id === currentPortfolioId;
        const val = computePortfolioTotal(p.id);
        return `<div class="flex items-center justify-between border-b border-gray-800/60 last:border-b-0 ${isCurrent ? 'bg-indigo-950/30' : ''}">
            <button onclick="switchPortfolio('${p.id}')" class="flex-1 text-left min-w-0 flex items-center gap-2 p-2.5 hover:bg-gray-800/50 transition">
                <i class="fa-solid ${isCurrent ? 'fa-circle-check text-indigo-400' : 'fa-circle text-gray-700'} text-[10px] flex-shrink-0"></i>
                <span class="min-w-0 flex-1">
                    <span class="block text-xs font-medium ${isCurrent ? 'text-white' : 'text-gray-300'} truncate">${escapeHTML(p.name)}</span>
                    <span class="block text-[10px] text-gray-500 font-mono">${formatEUR(val)}</span>
                </span>
            </button>
            <div class="flex gap-0.5 flex-shrink-0 pr-1.5">
                <button onclick="event.stopPropagation(); renamePortfolio('${p.id}')" class="p-1.5 text-gray-500 hover:text-indigo-400 transition" title="Renommer"><i class="fa-solid fa-pen text-[10px]"></i></button>
                ${portfolios.length > 1 ? `<button onclick="event.stopPropagation(); deletePortfolio('${p.id}')" class="p-1.5 text-gray-500 hover:text-rose-400 transition" title="Supprimer"><i class="fa-solid fa-trash text-[10px]"></i></button>` : ''}
            </div>
        </div>`;
    }).join('');
}

function togglePortfolioMenu(evt) {
    if (evt) evt.stopPropagation();
    const menu = document.getElementById('portfolio-menu');
    if (!menu) return;
    if (menu.classList.contains('hidden')) {
        renderPortfolioMenu();
        menu.classList.remove('hidden');
    } else {
        menu.classList.add('hidden');
    }
}

function closePortfolioMenu() {
    const menu = document.getElementById('portfolio-menu');
    if (menu) menu.classList.add('hidden');
}

function updatePortfolioLabel() {
    const el = document.getElementById('current-portfolio-label');
    if (!el) return;
    const p = currentPortfolio();
    el.innerText = p ? p.name : 'Portefeuille';
}

function switchPortfolio(id) {
    if (id === currentPortfolioId) { closePortfolioMenu(); return; }
    if (!portfolios.some(p => p.id === id)) return;

    // Persiste l'état courant avant bascule
    saveToStorage();
    saveCessions();
    saveArbitrages();
    localStorage.setItem(pfKey('patriMonial_cadranNames'), JSON.stringify(cadranNames));

    currentPortfolioId = id;
    persistCurrentPortfolio();

    // Charge les données du nouveau portefeuille
    assets      = readPortfolioAssets()     || JSON.parse(JSON.stringify(defaultAssets));
    cessions    = readPortfolioCessions()   || [];
    arbitrages  = readPortfolioArbitrages() || [];
    cadranNames = Object.assign({}, CADRAN_DEFAULT_NAMES, readPortfolioCadranNames() || {});

    // Migration/normalisation
    assets.forEach(a => migrateAssetToV2(a));
    cessions.forEach(normalizeCession);

    // Vide la pile d'undo (les snapshots référencent l'ancien portefeuille)
    undoStack = [];

    closePortfolioMenu();
    updatePortfolioLabel();
    refreshAllUI();
}

function addPortfolio() {
    const name = prompt('Nom du nouveau portefeuille :', 'Nouveau portefeuille');
    if (!name || !name.trim()) return;
    const id = 'p_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    portfolios.push({ id, name: name.trim() });
    savePortfolioRegistry();

    // Initialise les clés vides du nouveau portefeuille
    localStorage.setItem('patriMonial_assets__' + id, JSON.stringify([]));
    localStorage.setItem('patriMonial_cessions__' + id, JSON.stringify([]));
    localStorage.setItem('patriMonial_arbitrages__' + id, JSON.stringify([]));
    localStorage.setItem('patriMonial_cadranNames__' + id, JSON.stringify({}));
    localStorage.setItem('patriMonial_dataVersion__' + id, String(DATA_VERSION));

    switchPortfolio(id);
    alert(`Portefeuille "${name.trim()}" créé et activé.`);
}

function renamePortfolio(id) {
    const p = portfolios.find(x => x.id === id);
    if (!p) return;
    const name = prompt('Nouveau nom :', p.name);
    if (!name || !name.trim() || name.trim() === p.name) return;
    p.name = name.trim();
    savePortfolioRegistry();
    renderPortfolioMenu();
    updatePortfolioLabel();
}

function deletePortfolio(id) {
    if (portfolios.length <= 1) {
        alert('Impossible de supprimer le dernier portefeuille.');
        return;
    }
    const p = portfolios.find(x => x.id === id);
    if (!p) return;
    if (!confirm(`Supprimer le portefeuille "${p.name}" et TOUTES ses données\n(actifs, cessions, arbitrages, sauvegardes locales) ?\n\nCette action est irréversible.`)) return;

    // Purge des clés localStorage du portefeuille
    [
        'patriMonial_assets', 'patriMonial_cessions', 'patriMonial_arbitrages',
        'patriMonial_cadranNames', 'patriMonial_localBackups',
        'patriMonial_lastAutoBackup', 'patriMonial_dataVersion'
    ].forEach(base => localStorage.removeItem(base + '__' + id));

    portfolios = portfolios.filter(x => x.id !== id);
    savePortfolioRegistry();

    if (id === currentPortfolioId) {
        switchPortfolio(portfolios[0].id);
    } else {
        renderPortfolioMenu();
    }
    updatePortfolioLabel();
}

// =====================================================================
// DASHBOARD STRATÉGIES PAPER — onglet dédié (Paper Trading v2 — Étape B)
// =====================================================================
// Affiche une carte par scénario, avec : KPIs, sparkline 60j, top 3 positions,
// actions (voir, dupliquer, archiver, renommer, supprimer).
// =====================================================================
function _strategiesShortName(name, max = 32) {
    const s = String(name || '');
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// Rendu d'une carte de scénario (HTML)
function renderStrategyCardHTML(scenario) {
    const list = assets.filter(a => isPaperAsset(a) && a.paperScenarioId === scenario.id);
    const isCurrent = scenario.id === currentPaperScenarioId;

    const totalInvested = list.reduce((s, a) => s + (a.invested || 0), 0);
    const totalValue    = list.reduce((s, a) => s + (a.value    || 0), 0);
    const pnl           = totalValue - totalInvested;
    const pnlPct        = totalInvested > 0 ? (pnl / totalInvested * 100) : 0;
    const isPos         = pnl >= 0;

    // Sharpe estimé (si assez d'historique) — réutilise computeRiskMetricsFromAssets
    let sharpeTxt = '—';
    let sharpeColor = 'text-gray-500';
    if (list.length >= 2) {
        try {
            const rm = computeRiskMetricsFromAssets(list);
            if (rm && Number.isFinite(rm.sharpe)) {
                sharpeTxt = rm.sharpe.toFixed(2);
                sharpeColor = rm.sharpe >= 1 ? 'text-emerald-400' : rm.sharpe >= 0 ? 'text-amber-400' : 'text-rose-400';
            }
        } catch (_) { /* ignore */ }
    }

    // Sparkline 60 jours
    const series = buildPaperScenarioSeries(scenario.id, 60);
    let sparkSvg = '';
    let sparkPctTxt = '—';
    let sparkPctColor = 'text-gray-500';
    if (series.length >= 2) {
        const first = series[0].value;
        const last  = series[series.length - 1].value;
        const sparkUp = last >= first;
        const color = sparkUp ? '#a855f7' : '#f43f5e';
        const pct = first > 0 ? ((last - first) / first * 100) : 0;
        sparkPctTxt = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
        sparkPctColor = sparkUp ? 'text-emerald-400' : 'text-rose-400';

        const W = 160, H = 32;
        const min = Math.min(...series.map(p => p.value));
        const max = Math.max(...series.map(p => p.value));
        const range = (max - min) || 1;
        const stepX = W / (series.length - 1);
        const points = series.map((p, i) => {
            const x = i * stepX;
            const y = H - ((p.value - min) / range) * (H - 4) - 2;
            return x.toFixed(1) + ',' + y.toFixed(1);
        }).join(' ');
        sparkSvg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="w-full block">
            <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
        </svg>`;
    } else {
        sparkSvg = '<div class="h-8 flex items-center justify-center text-[10px] text-gray-600 italic">Historique insuffisant</div>';
    }

    // Top 3 positions par valeur
    const top3 = [...list].sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 3);
    const top3HTML = top3.length
        ? top3.map(a => `<div class="flex justify-between items-center text-[10px] gap-1.5 py-0.5">
                ${assetClassIconHTML(a)}
                <span class="text-gray-400 truncate flex-1">${escapeHTML(_strategiesShortName(a.name, 26))}</span>
                <span class="font-mono text-gray-300 whitespace-nowrap">${formatEUR(a.value)}</span>
            </div>`).join('')
        : '<div class="text-[10px] text-gray-600 italic">Aucune position dans ce scénario.</div>';

    const archivedBadge = scenario.archived
        ? '<span class="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700 text-[9px] font-bold"><i class="fa-solid fa-box-archive text-[8px]"></i>Archivé</span>'
        : '';
    const currentBadge = isCurrent
        ? '<span class="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-700/50 text-[9px] font-bold"><i class="fa-solid fa-circle-check text-[8px]"></i>Actif</span>'
        : '';

    return `
        <div class="bg-gray-900/60 border border-gray-800 rounded-xl p-4 flex flex-col gap-3 ${scenario.archived ? 'opacity-60' : ''}" style="border-top: 3px solid ${scenario.color};">
            <!-- En-tête -->
            <div class="flex justify-between items-start gap-2">
                <div class="min-w-0 flex-1">
                    <div class="flex items-center flex-wrap gap-1">
                        <span class="w-3 h-3 rounded-full flex-shrink-0" style="background:${scenario.color};"></span>
                        <span class="font-bold text-white text-sm truncate" title="${escapeHTML(scenario.name)}">${escapeHTML(scenario.name)}</span>
                        ${currentBadge}${archivedBadge}
                    </div>
                    <div class="text-[10px] text-gray-500 font-mono mt-0.5">
                        ${list.length} position(s) · créé le ${new Date(scenario.createdAt).toLocaleDateString('fr-FR')}
                    </div>
                </div>
            </div>

            <!-- KPIs -->
            <div class="grid grid-cols-2 gap-2 text-[11px]">
                <div class="bg-gray-950 border border-gray-800 rounded-lg p-2">
                    <div class="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Capital investi</div>
                    <div class="font-mono font-bold text-white">${formatEUR(totalInvested)}</div>
                </div>
                <div class="bg-gray-950 border border-gray-800 rounded-lg p-2">
                    <div class="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Valeur actuelle</div>
                    <div class="font-mono font-bold text-white">${formatEUR(totalValue)}</div>
                </div>
                <div class="bg-gray-950 border border-gray-800 rounded-lg p-2">
                    <div class="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">P&amp;L</div>
                    <div class="font-mono font-bold ${isPos ? 'text-emerald-400' : 'text-rose-400'}">
                        ${isPos ? '+' : ''}${formatEUR(pnl)}
                        <span class="text-[10px] opacity-80">(${isPos ? '+' : ''}${pnlPct.toFixed(1)}%)</span>
                    </div>
                </div>
                <div class="bg-gray-950 border border-gray-800 rounded-lg p-2">
                    <div class="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Sharpe estimé</div>
                    <div class="font-mono font-bold ${sharpeColor}">${sharpeTxt}</div>
                </div>
            </div>

            <!-- Sparkline 60j -->
            <div>
                <div class="flex justify-between items-center mb-1">
                    <span class="text-[9px] text-gray-500 uppercase tracking-wider">Tendance 60 jours</span>
                    <span class="text-[10px] font-mono ${sparkPctColor}">${sparkPctTxt}</span>
                </div>
                <div class="bg-gray-950 border border-gray-800 rounded-lg p-1.5">
                    ${sparkSvg}
                </div>
            </div>

            <!-- Top 3 positions -->
            <div class="border-t border-gray-800 pt-2">
                <div class="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Top positions</div>
                ${top3HTML}
            </div>

            <!-- Actions -->
            <div class="flex justify-end gap-1 pt-2 border-t border-gray-800 flex-wrap">
                <button onclick="setCurrentPaperScenario('${scenario.id}'); switchTab('tab-inventaire');" class="px-2 py-1 rounded bg-gray-800 hover:bg-purple-900/60 text-gray-300 hover:text-purple-300 text-[10px] transition" title="Voir les positions dans l'inventaire">
                    <i class="fa-solid fa-eye text-[9px]"></i> Voir
                </button>
                <button onclick="renamePaperScenarioUI('${scenario.id}')" class="px-2 py-1 rounded bg-gray-800 hover:bg-indigo-900/60 text-gray-300 hover:text-indigo-300 text-[10px] transition" title="Renommer">
                    <i class="fa-solid fa-pen text-[9px]"></i>
                </button>
                <button onclick="duplicatePaperScenario('${scenario.id}')" class="px-2 py-1 rounded bg-gray-800 hover:bg-teal-900/60 text-gray-300 hover:text-teal-300 text-[10px] transition" title="Dupliquer (positions + paramètres)">
                    <i class="fa-solid fa-copy text-[9px]"></i>
                </button>
                <button onclick="toggleArchivePaperScenario('${scenario.id}')" class="px-2 py-1 rounded bg-gray-800 hover:bg-amber-900/60 text-gray-300 hover:text-amber-300 text-[10px] transition" title="${scenario.archived ? 'Désarchiver' : 'Archiver'}">
                    <i class="fa-solid fa-${scenario.archived ? 'box-open' : 'box-archive'} text-[9px]"></i>
                </button>
                <button onclick="deleteAllPaperAssets('${scenario.id}')" class="px-2 py-1 rounded bg-gray-800 hover:bg-amber-900/60 text-gray-300 hover:text-amber-300 text-[10px] transition" title="Purger les positions (garde le scénario vide)">
                    <i class="fa-solid fa-broom text-[9px]"></i>
                </button>
                <button onclick="deletePaperScenario('${scenario.id}')" class="px-2 py-1 rounded bg-gray-800 hover:bg-rose-900/60 text-gray-300 hover:text-rose-300 text-[10px] transition" title="Supprimer le scénario et ses positions">
                    <i class="fa-solid fa-trash text-[9px]"></i>
                </button>
            </div>
        </div>
    `;
}

// Rendu global de l'onglet Stratégies
function renderStrategiesTab() {
    const grid = document.getElementById('strategies-grid');
    if (!grid) return;

    const showArchived = !!document.getElementById('strategies-show-archived')?.checked;

    const active = activePaperScenarios();
    const archived = archivedPaperScenarios();
    const list = showArchived ? [...active, ...archived] : active;

    // --- KPIs globaux ---
    const allAssets = assets.filter(isPaperAsset);
    const totInv = allAssets.reduce((s, a) => s + (a.invested || 0), 0);
    const totVal = allAssets.reduce((s, a) => s + (a.value    || 0), 0);
    const totPnl = totVal - totInv;
    const totPct = totInv > 0 ? (totPnl / totInv * 100) : 0;

    const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
    setText('strat-stat-count', active.length);
    setText('strat-stat-archived-count', archived.length + ' archivé(s)');
    setText('strat-stat-invested', formatEUR(totInv));
    setText('strat-stat-value',    formatEUR(totVal));

    const pnlEl = document.getElementById('strat-stat-pnl');
    if (pnlEl) {
        pnlEl.innerText = (totPnl >= 0 ? '+' : '') + formatEUR(totPnl);
        pnlEl.className = `text-lg font-bold font-mono ${totPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }
    const pnlPctEl = document.getElementById('strat-stat-pnl-pct');
    if (pnlPctEl) {
        pnlPctEl.innerText = (totPct >= 0 ? '+' : '') + totPct.toFixed(2) + '%';
        pnlPctEl.className = `text-[10px] font-mono ${totPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }

    // --- Grille de cartes ---
    if (!list.length) {
        grid.innerHTML = `<div class="col-span-full bg-gray-900/60 border border-dashed border-gray-700 rounded-xl p-8 text-center text-sm text-gray-500">
            <i class="fa-solid fa-flask text-3xl text-purple-500/40 mb-2 block"></i>
            Aucun scénario Paper Trading ${showArchived ? '' : 'actif'} pour le moment.<br>
            <button onclick="createPaperScenarioUI()" class="mt-3 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-medium transition">
                <i class="fa-solid fa-plus text-[10px]"></i> Créer un premier scénario
            </button>
        </div>`;
        return;
    }
    grid.innerHTML = list.map(renderStrategyCardHTML).join('');

    // Comparateur de scénarios (Étape C)
    if (typeof renderPaperCompareSection === 'function') renderPaperCompareSection();
}

// =====================================================================
// PAPER TRADING v2 — COMPARATEUR DE SCÉNARIOS (Étape C)
// =====================================================================

// Peuple le sélecteur avec la liste des scénarios actifs (+ archivés si case cochée)
function populatePaperCompareSelects() {
    const selA = document.getElementById('paper-compare-select-a');
    const selB = document.getElementById('paper-compare-select-b');
    if (!selA || !selB) return;

    const showArchived = !!document.getElementById('strategies-show-archived')?.checked;
    const pool = showArchived ? paperScenarios : activePaperScenarios();

    // Filtrer pour ne garder que les scénarios non vides (au moins 1 position)
    const valid = pool.filter(s => assets.some(a => isPaperAsset(a) && a.paperScenarioId === s.id));

    const optsHTML = valid.length
        ? valid.map(s => `<option value="${s.id}">${escapeHTML(s.name)} (${assets.filter(a => isPaperAsset(a) && a.paperScenarioId === s.id).length} pos.)</option>`).join('')
        : '<option value="">— Aucun scénario éligible —</option>';

    // Préserve la sélection courante si le scénario existe encore
    const prevA = paperCompareState.A;
    const prevB = paperCompareState.B;

    selA.innerHTML = '<option value="">-- Choisir un scénario --</option>' + optsHTML;
    selB.innerHTML = '<option value="">-- Choisir un scénario --</option>' + optsHTML;

    if (prevA && valid.some(s => s.id === prevA)) selA.value = prevA;
    else paperCompareState.A = valid.length ? valid[0].id : null;

    if (prevB && valid.some(s => s.id === prevB)) selB.value = prevB;
    else paperCompareState.B = valid.length >= 2 ? valid[1].id : (valid.length ? valid[0].id : null);

    // Re-synchronise les selects après réassignation
    if (paperCompareState.A) selA.value = paperCompareState.A;
    if (paperCompareState.B) selB.value = paperCompareState.B;
}

// Rendu d'un panneau de scénario (A ou B) — KPI + donut + top positions
function renderPaperComparePanel(side) {
    const panel = document.getElementById('paper-compare-panel-' + side);
    if (!panel) return;

    const scenarioId = side === 'A' ? paperCompareState.A : paperCompareState.B;

    // Cas 1 : aucun scénario sélectionné
    if (!scenarioId) {
        panel.innerHTML = `<div class="text-gray-500 italic text-xs text-center py-8">Choisissez un scénario pour le côté ${side}.</div>`;
        return;
    }

    const sum = summarizePaperScenario(scenarioId);
    if (!sum) {
        panel.innerHTML = '<div class="text-gray-500 italic text-xs text-center py-8">Scénario introuvable.</div>';
        return;
    }
    if (sum.positions === 0) {
        panel.innerHTML = `<div class="text-gray-500 italic text-xs text-center py-8">
            Le scénario <b>${escapeHTML(sum.scenario.name)}</b> ne contient aucune position.
        </div>`;
        return;
    }

    const s = sum.scenario;
    const pnlCls = sum.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400';
    const sideColor = s.color;

    // Répartition par catégorie (donut)
    const catTotals = {};
    sum.list.forEach(a => {
        const cat = a.category || 'Autre';
        catTotals[cat] = (catTotals[cat] || 0) + (a.value || 0);
    });
    const catColors = {
        'Or & Métaux': '#f59e0b', 'Devises/Liquidités': '#3b82f6', 'Actions/ETF': '#10b981',
        'Obligations': '#14b8a6', 'Crypto': '#8b5cf6', 'Matières Premières': '#ef4444', 'Autre': '#6b7280'
    };

    const canvasId = 'paperCompareAllocChart' + side;

    // Top 3 positions
    const top3 = [...sum.list].sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 3);
    const top3HTML = top3.map(a => {
        const w = sum.value > 0 ? (a.value / sum.value * 100) : 0;
        return `<div class="flex justify-between items-center text-[10px] gap-1.5 py-0.5">
            ${assetClassIconHTML(a)}
            <span class="text-gray-400 truncate flex-1">${escapeHTML(a.name)}</span>
            <span class="font-mono text-gray-500">${w.toFixed(1)}%</span>
            <span class="font-mono text-gray-300 whitespace-nowrap">${formatEUR(a.value)}</span>
        </div>`;
    }).join('');

    panel.innerHTML = `
        <div class="flex justify-between items-start gap-2">
            <div class="min-w-0">
                <div class="text-[10px] text-gray-500 uppercase">Scénario ${side}</div>
                <div class="flex items-center gap-1.5 min-w-0">
                    <span class="w-3 h-3 rounded-full flex-shrink-0" style="background:${sideColor};"></span>
                    <span class="font-bold text-white text-sm truncate" title="${escapeHTML(s.name)}">${escapeHTML(s.name)}</span>
                </div>
                <div class="text-[10px] text-gray-500 font-mono">${sum.positions} position(s)</div>
            </div>
            <div class="text-right flex-shrink-0">
                <div class="text-lg font-bold font-mono text-white">${formatEUR(sum.value)}</div>
                <div class="text-[10px] font-mono ${pnlCls}">${sum.pnl >= 0 ? '+' : ''}${formatEUR(sum.pnl)} (${sum.pnlPct >= 0 ? '+' : ''}${sum.pnlPct.toFixed(1)}%)</div>
            </div>
        </div>
        <div class="grid grid-cols-2 gap-2 mt-2">
            <div class="bg-gray-900/60 border border-gray-800 rounded-lg p-2">
                <div class="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Investi</div>
                <div class="font-mono text-xs font-bold text-white">${formatEUR(sum.invested)}</div>
            </div>
            <div class="bg-gray-900/60 border border-gray-800 rounded-lg p-2">
                <div class="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Sharpe</div>
                <div class="font-mono text-xs font-bold ${sum.sharpe === null ? 'text-gray-500' : (sum.sharpe >= 1 ? 'text-emerald-400' : sum.sharpe >= 0 ? 'text-amber-400' : 'text-rose-400')}">
                    ${sum.sharpe === null ? '—' : sum.sharpe.toFixed(2)}
                </div>
            </div>
        </div>
        <div class="h-32 w-full">
            <canvas id="${canvasId}"></canvas>
        </div>
        <div class="border-t border-gray-800 pt-2">
            <div class="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Top 3 positions</div>
            ${top3HTML}
        </div>
    `;

    // Donut
    if (paperCompareChartAllocInstance[side]) {
        paperCompareChartAllocInstance[side].destroy();
        paperCompareChartAllocInstance[side] = null;
    }
    paperCompareChartAllocInstance[side] = createChart(canvasId, {
        type: 'doughnut',
        data: {
            labels: Object.keys(catTotals),
            datasets: [{
                data: Object.values(catTotals),
                backgroundColor: Object.keys(catTotals).map(c => catColors[c] || '#6b7280'),
                borderColor: '#030712',
                borderWidth: 2
            }]
        },
        options: {
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: _chartLegendColor(), boxWidth: 8, font: { size: 9 } } }
            },
            cutout: '62%'
        }
    });
}

// Graphique superposé (A vs B) sur 12 derniers mois
function renderPaperCompareHistoryChart() {
    const wrap = document.getElementById('paper-compare-history-wrap');
    if (!wrap) return;
    const wrapCanvas = document.getElementById('paperCompareHistoryChart');
    if (!wrapCanvas) return;

    if (!paperCompareState.A || !paperCompareState.B) {
        wrap.classList.add('hidden');
        if (paperCompareChartHistoryInstance) {
            paperCompareChartHistoryInstance.destroy();
            paperCompareChartHistoryInstance = null;
        }
        return;
    }

    const seriesA = buildPaperScenarioSeries(paperCompareState.A, 365);
    const seriesB = buildPaperScenarioSeries(paperCompareState.B, 365);

    if (seriesA.length < 2 || seriesB.length < 2) {
        wrap.classList.add('hidden');
        return;
    }
    wrap.classList.remove('hidden');

    // Alignement sur les mêmes dates (on utilise les dates du plus long en référence)
    const allDates = [...new Set([...seriesA.map(p => p.date), ...seriesB.map(p => p.date)])].sort((a, b) => a - b);

    // Forward-fill
    const valA = [], valB = [];
    let la = null, lb = null;
    let ia = 0, ib = 0;
    for (const t of allDates) {
        while (ia < seriesA.length && seriesA[ia].date <= t) { la = seriesA[ia].value; ia++; }
        while (ib < seriesB.length && seriesB[ib].date <= t) { lb = seriesB[ib].value; ib++; }
        valA.push(la);
        valB.push(lb);
    }

    const labels = allDates.map(t => new Date(t).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }));

    if (paperCompareChartHistoryInstance) paperCompareChartHistoryInstance.destroy();
    paperCompareChartHistoryInstance = createChart('paperCompareHistoryChart', {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Scénario A',
                    data: valA,
                    borderColor: '#a855f7',
                    backgroundColor: 'rgba(168,85,247,0.12)',
                    tension: 0.3, fill: true, pointRadius: 0
                },
                {
                    label: 'Scénario B',
                    data: valB,
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6,182,212,0.10)',
                    tension: 0.3, fill: true, pointRadius: 0
                }
            ]
        },
        options: {
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: _chartTickColor(), maxTicksLimit: 8, font: { size: 9 } }, grid: { color: _chartGridColor() } },
                y: { grace: '10%', ticks: { color: _chartTickColor(), font: { size: 9 } }, grid: { color: _chartGridColor() } }
            }
        }
    });
}

// Table de delta (A vs B) avec indicateur de gagnant
function renderPaperCompareDeltaTable() {
    const wrap = document.getElementById('paper-compare-delta-wrap');
    if (!wrap) return;

    if (!paperCompareState.A || !paperCompareState.B) {
        wrap.classList.add('hidden');
        return;
    }

    const sumA = summarizePaperScenario(paperCompareState.A);
    const sumB = summarizePaperScenario(paperCompareState.B);
    if (!sumA || !sumB) { wrap.classList.add('hidden'); return; }

    // Ne compare que si les deux scénarios ont au moins une position
    if (sumA.positions === 0 && sumB.positions === 0) { wrap.classList.add('hidden'); return; }

    wrap.classList.remove('hidden');

    // Helpers de rendu de ligne
    const row = (label, valA, valB, formatA, formatB, delta) => {
        const winA = delta.cls === 'text-emerald-400' ? 'style="box-shadow:inset 3px 0 0 #a855f7;"' : '';
        const winB = delta.cls === 'text-rose-400'   ? 'style="box-shadow:inset 3px 0 0 #06b6d4;"' : '';
        return `
            <tr class="border-b border-gray-800/60">
                <td class="p-2.5 text-gray-400 text-[11px]">${label}</td>
                <td class="p-2.5 text-right font-mono text-white text-[11px]">${valA}</td>
                <td class="p-2.5 text-right font-mono text-white text-[11px]">${valB}</td>
                <td class="p-2.5 text-right font-mono text-[11px] font-bold ${delta.cls}">${delta.txt}</td>
            </tr>`;
    };

    // Métriques principales
    const dInvested = paperDelta(sumA.invested,  sumB.invested,  'eur');
    const dValue    = paperDelta(sumA.value,     sumB.value,     'eur');
    const dPnl      = paperDelta(sumA.pnl,       sumB.pnl,       'eur');
    const dPnlPct   = paperDelta(sumA.pnlPct,    sumB.pnlPct,    'pct');
    const dSharpe   = paperDelta(sumA.sharpe,    sumB.sharpe,    'ratio');
    const dVol      = paperDelta(sumA.vol,       sumB.vol,       'pct', true);   // vol : plus bas = mieux
    const dMaxDD    = paperDelta(sumA.maxDD,     sumB.maxDD,     'pct', true);   // DD : plus bas = mieux
    const dPos      = paperDelta(sumA.positions, sumB.positions, 'count');

    // Nombre de métriques "gagnées" par chaque scénario
    const deltaList = [dInvested, dValue, dPnl, dPnlPct, dSharpe, dVol, dMaxDD];
    const winsA = deltaList.filter(d => d.cls === 'text-emerald-400').length;
    const winsB = deltaList.filter(d => d.cls === 'text-rose-400').length;
    const winner = winsA > winsB ? 'A' : (winsB > winsA ? 'B' : 'TIE');

    const verdictHTML = winner === 'TIE'
        ? `<div class="text-amber-300"><i class="fa-solid fa-scale-balanced mr-1"></i> Match nul : ${winsA} vs ${winsB}</div>`
        : (winner === 'A'
            ? `<div class="text-purple-300"><i class="fa-solid fa-trophy mr-1"></i> Scénario A l'emporte (${winsA} vs ${winsB} métriques gagnées)</div>`
            : `<div class="text-cyan-300"><i class="fa-solid fa-trophy mr-1"></i> Scénario B l'emporte (${winsB} vs ${winsA} métriques gagnées)</div>`);

    const naPct = v => v === null ? '—' : (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + ' %';
    const naSharpe = v => v === null ? '—' : v.toFixed(2);
    const naEUR = v => formatEUR(v);
    const naCount = v => v + ' pos.';

    wrap.innerHTML = `
        <div class="p-3 rounded-xl mb-3 bg-gray-950 border border-gray-800 flex justify-between items-center">
            <div class="text-xs font-bold text-white flex items-center gap-2">
                <i class="fa-solid fa-gavel text-purple-400"></i> Verdict
            </div>
            <div class="text-xs font-mono font-bold">${verdictHTML}</div>
        </div>
        <div class="overflow-x-auto rounded-xl border border-gray-800">
            <table class="w-full text-left text-xs">
                <thead class="bg-gray-950 text-gray-400 uppercase font-medium">
                    <tr>
                        <th class="p-2.5">Métrique</th>
                        <th class="p-2.5 text-right">Scénario A</th>
                        <th class="p-2.5 text-right">Scénario B</th>
                        <th class="p-2.5 text-right">Δ (A − B)</th>
                    </tr>
                </thead>
                <tbody>
                    ${row('Positions',          naCount(sumA.positions), naCount(sumB.positions), '', '', dPos)}
                    ${row('Capital investi',    naEUR(sumA.invested),    naEUR(sumB.invested),    '', '', dInvested)}
                    ${row('Valeur actuelle',    naEUR(sumA.value),       naEUR(sumB.value),       '', '', dValue)}
                    ${row('P&amp;L brut',       (sumA.pnl >= 0 ? '+' : '') + naEUR(sumA.pnl),
                                                (sumB.pnl >= 0 ? '+' : '') + naEUR(sumB.pnl), '', '', dPnl)}
                    ${row('P&amp;L en %',       (sumA.pnlPct >= 0 ? '+' : '') + sumA.pnlPct.toFixed(2) + ' %',
                                                (sumB.pnlPct >= 0 ? '+' : '') + sumB.pnlPct.toFixed(2) + ' %', '', '', dPnlPct)}
                    ${row('Volatilité annualisée', naPct(sumA.vol),       naPct(sumB.vol),        '', '', dVol)}
                    ${row('Sharpe estimé',      naSharpe(sumA.sharpe),    naSharpe(sumB.sharpe),  '', '', dSharpe)}
                    ${row('Max drawdown',       naPct(sumA.maxDD),        naPct(sumB.maxDD),      '', '', dMaxDD)}
                </tbody>
            </table>
        </div>
        <p class="text-[10px] text-gray-500 mt-2 leading-relaxed">
            <i class="fa-solid fa-circle-info mr-1"></i>
            Les métriques de risque (volatilité, Sharpe, max drawdown) sont calculées à partir de l'historique réel des positions de chaque scénario. Un scénario avec moins de 2 positions ou un historique trop court affichera <b>—</b>. Les cellules <span class="text-emerald-400 font-bold">vertes</span> indiquent un avantage pour A ; les <span class="text-rose-400 font-bold">roses</span> un avantage pour B.
        </p>
    `;
}

// Point d'entrée global du comparateur (appelé par renderStrategiesTab)
function renderPaperCompareSection() {
    populatePaperCompareSelects();
    renderPaperComparePanel('A');
    renderPaperComparePanel('B');
    renderPaperCompareHistoryChart();
    renderPaperCompareDeltaTable();
}

function setPaperCompareScenario(side, scenarioId) {
    if (side !== 'A' && side !== 'B') return;
    paperCompareState[side] = scenarioId || null;
    renderPaperComparePanel(side);
    renderPaperCompareHistoryChart();
    renderPaperCompareDeltaTable();
}

// =====================================================================
// REBALANCING ASSISTÉ — 4 Cadrans de Gave (Chantier E)
// ---------------------------------------------------------------------
// Deux modes :
//   • "vente"    : équilibrage complet (vendre sur-pondérés, acheter sous-pondérés)
//   • "sans vente" : diriger l'épargne future vers les cadrans sous-pondérés
// Retourne { total, target, gaps[], sells[], buys[], mode }.
// =====================================================================
function computeRebalanceSuggestions() {
    const noSell = !!document.getElementById('rebalance-nosell')?.checked;
    const savingsAmount = parseFloat(document.getElementById('rebalance-savings')?.value) || 0;

    // Agrégats actuels par cadran
    const totals = {};
    GAVE_QUADRANTS.forEach(q => {
        totals[q] = assets
            .filter(a => a.cadran === q && !isPaperAsset(a))
            .reduce((s, a) => s + (a.value || 0), 0);
    });
    const total = Object.values(totals).reduce((a, b) => a + b, 0);
    const target = total / 4;

    // Écarts (positif = sur-pondéré, à vendre ; négatif = sous-pondéré, à acheter)
    const gaps = GAVE_QUADRANTS.map(q => ({
        cadran: q,
        label: cadranLabel(q),
        value: totals[q],
        pct: total > 0 ? (totals[q] / total * 100) : 0,
        targetValue: target,
        gap: totals[q] - target,
        gapPct: total > 0 ? ((totals[q] - target) / total * 100) : 0
    }));

    const sells = [];
    const buys = [];

    if (noSell) {
        // Répartir l'épargne vers les cadrans en déficit, proportionnellement au déficit
        const deficits = GAVE_QUADRANTS.map(q => Math.max(0, target - totals[q]));
        const totalDeficit = deficits.reduce((a, b) => a + b, 0);
        if (totalDeficit > 0 && savingsAmount > 0) {
            GAVE_QUADRANTS.forEach((q, i) => {
                if (deficits[i] > 0) {
                    const amount = savingsAmount * (deficits[i] / totalDeficit);
                    if (amount > 1) buys.push({ cadran: q, amount, label: cadranLabel(q) });
                }
            });
        }
    } else {
        // Équilibrage complet : vendre sur-pondérés, acheter sous-pondérés
        GAVE_QUADRANTS.forEach(q => {
            const diff = totals[q] - target;
            if (diff > 1)  sells.push({ cadran: q, amount: diff, label: cadranLabel(q) });
            if (diff < -1) buys.push({  cadran: q, amount: -diff, label: cadranLabel(q) });
        });
    }

    return { total, target, gaps, sells, buys, mode: noSell ? 'nosell' : 'sell', savingsAmount };
}

// Choisit le meilleur candidat de vente dans un cadran : on prend la position
// avec la plus grosse valeur (donc la plus capable d'absorber la vente sans
// être entièrement liquidée).
function pickBestSellCandidate(cadran) {
    const list = assets.filter(a => a.cadran === cadran && !isPaperAsset(a) && (a.value || 0) > 0);
    if (!list.length) return null;
    return list.slice().sort((a, b) => (b.value || 0) - (a.value || 0))[0];
}

// Estime la fiscalité d'une vente simulée sur un actif donné.
function estimateRebalanceSaleTax(asset, amountEUR) {
    if (!asset || amountEUR <= 0) return null;
    const unitValue = asset.qty > 0 ? (asset.value / asset.qty) : 0;
    if (unitValue <= 0) return null;

    const qty = amountEUR / unitValue;
    const pru = computePRUFromLots(asset) || (asset.qty > 0 ? asset.invested / asset.qty : 0);
    const totalCost = pru * qty;

    const security = isSecurityAsset(asset);
    const cessionType = (!security && METAL_TYPES.includes(asset.taxCategory))
        ? asset.taxCategory
        : (hasTag(asset, 'Crypto') && !security ? 'CRYPTO' : 'ACTION_ETF');
    const subType = hasTag(asset, 'Obligation') ? 'OBLIGATION'
                  : hasTag(asset, 'ETF')        ? 'ETF'
                  : 'ACTION';

    const firstLot = (asset.lots || []).slice().sort((a, b) => new Date(a.date) - new Date(b.date))[0];
    const dateAchatISO = firstLot ? firstLot.date : (asset.purchaseDate || '');

    const fakeCession = normalizeCession({
        id: -1, type: cessionType, subType,
        name: asset.name,
        dateVente: new Date().toISOString().slice(0, 10),
        dateAchat: dateAchatISO,
        prixVente: amountEUR,
        prixAchat: totalCost,
        frais: 0, avant2018: false,
        envelope: security ? (asset.envelope || 'CTO') : '',
        envelopeOpenedAt: asset.envelopeOpenedAt || '',
        zone: asset.zone || 'UE',
        coupons: 0
    });

    const line = computeCessionLine(fakeCession);
    return {
        qty,
        amountEUR,
        totalCost,
        pnl: amountEUR - totalCost,
        tax: line.taxLine,
        net: amountEUR - line.taxLine,
        regime: line.detentionTag,
        asset
    };
}

// ----------------------------------------------------------------
// Rendu du modal
// ----------------------------------------------------------------
function openRebalanceModal() {
    document.getElementById('rebalance-nosell').checked = false;
    document.getElementById('rebalance-savings').value = 1000;
    renderRebalanceModal();
    document.getElementById('modal-rebalance').classList.remove('hidden');
}

function renderRebalanceModal() {
    const noSell = !!document.getElementById('rebalance-nosell')?.checked;
    const savingsWrap = document.getElementById('rebalance-savings-wrap');
    if (savingsWrap) savingsWrap.classList.toggle('hidden', !noSell);

    const data = computeRebalanceSuggestions();

    // --- Tableau des écarts ---
    const gapsEl = document.getElementById('rebalance-gaps-table');
    if (!data.total) {
        gapsEl.innerHTML = '<div class="text-center text-gray-500 italic text-xs py-4">Aucun actif dans les 4 Cadrans de Gave.</div>';
        document.getElementById('rebalance-ops').innerHTML = '';
        return;
    }

    const colorByQ = { OR: '#f59e0b', MONNAIES: '#3b82f6', ASIE: '#10b981', PETROLE: '#f43f5e' };
    gapsEl.innerHTML = `<div class="overflow-x-auto rounded-xl border border-gray-800">
        <table class="w-full text-left text-xs">
            <thead class="bg-gray-950 text-gray-400 uppercase font-medium">
                <tr>
                    <th class="p-2.5">Cadran</th>
                    <th class="p-2.5 text-right">Valeur actuelle</th>
                    <th class="p-2.5 text-right">% actuel</th>
                    <th class="p-2.5 text-right">Cible (25 %)</th>
                    <th class="p-2.5 text-right">Écart</th>
                </tr>
            </thead>
            <tbody>
                ${data.gaps.map(g => {
                    const abs = Math.abs(g.gap);
                    const sign = g.gap > 0 ? '+' : (g.gap < 0 ? '−' : '');
                    const gapCls = g.gap > 1 ? 'text-amber-400' : g.gap < -1 ? 'text-emerald-400' : 'text-gray-500';
                    const badge = g.gap > 1
                        ? '<span class="ml-1 text-[9px] text-amber-400">(vendre)</span>'
                        : g.gap < -1
                            ? '<span class="ml-1 text-[9px] text-emerald-400">(acheter)</span>'
                            : '';
                    return `<tr class="border-b border-gray-800/60">
                        <td class="p-2.5">
                            <span class="inline-flex items-center gap-1.5">
                                <span class="inline-block w-2.5 h-2.5 rounded-full" style="background:${colorByQ[g.cadran]};"></span>
                                <span class="text-white font-medium">${escapeHTML(g.label)}</span>
                            </span>
                        </td>
                        <td class="p-2.5 text-right font-mono text-white">${formatEUR(g.value)}</td>
                        <td class="p-2.5 text-right font-mono text-gray-400">${g.pct.toFixed(1)} %</td>
                        <td class="p-2.5 text-right font-mono text-gray-500">${formatEUR(g.targetValue)}</td>
                        <td class="p-2.5 text-right font-mono font-bold ${gapCls}">${sign}${formatEUR(abs)}${badge}</td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
    </div>`;

    // --- Opérations suggérées ---
    const opsEl = document.getElementById('rebalance-ops');
    const titleEl = document.getElementById('rebalance-ops-title');

    if (data.sells.length === 0 && data.buys.length === 0) {
        titleEl.innerText = 'Opérations suggérées';
        opsEl.innerHTML = noSell
            ? '<div class="text-center text-gray-500 italic text-xs py-4">Saisissez un montant d\'épargne supérieur à 0 € pour obtenir des suggestions.</div>'
            : '<div class="text-emerald-400 text-center text-xs py-4"><i class="fa-solid fa-circle-check mr-1"></i> Votre allocation est déjà équilibrée (aucun écart significatif).</div>';
        return;
    }

    titleEl.innerText = noSell
        ? `Où placer ${formatEUR(data.savingsAmount)} d'épargne`
        : `Opérations suggérées (${data.sells.length} vente${data.sells.length > 1 ? 's' : ''} + ${data.buys.length} achat${data.buys.length > 1 ? 's' : ''})`;

    // Construit les cartes d'opération
    const cards = [];

    // Ventes
    if (!noSell) {
        data.sells.forEach(sell => {
            const asset = pickBestSellCandidate(sell.cadran);
            if (!asset) {
                cards.push(`<div class="p-3 bg-rose-950/30 border border-rose-800/50 rounded-xl text-[11px] text-rose-300">
                    <b>VENDRE</b> ${formatEUR(sell.amount)} dans <b>${escapeHTML(sell.label)}</b> — aucune position disponible dans ce cadran.
                </div>`);
                return;
            }
            const est = estimateRebalanceSaleTax(asset, sell.amount);
            const pnlCls = est.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400';
            const detailId = 'rebalance-ops-sell-' + sell.cadran;
            cards.push(`<div class="p-3 bg-rose-950/20 border border-rose-800/40 rounded-xl space-y-2" data-op='${JSON.stringify({ kind: 'sell', cadran: sell.cadran, assetId: asset.id, amount: sell.amount, label: sell.label }).replace(/'/g, "&#39;")}'>
                <div class="flex items-start justify-between gap-2">
                    <div class="flex items-start gap-2 min-w-0">
                        ${assetClassIconHTML(asset)}
                        <div class="min-w-0">
                            <div class="font-bold text-white text-xs flex items-center gap-1.5">
                                <span class="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9px] font-bold">VENDRE</span>
                                ${escapeHTML(asset.name)}
                            </div>
                            <div class="text-[10px] text-gray-400 font-mono">≈ ${fmtQty(est.qty)} unité(s) · ${formatEUR(sell.amount)} dans le cadran ${escapeHTML(sell.label)}</div>
                        </div>
                    </div>
                    <button onclick="convertRebalanceToArbitrage(this)" class="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-medium flex items-center gap-1 flex-shrink-0">
                        <i class="fa-solid fa-plus text-[9px]"></i> Arbitrage
                    </button>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono">
                    <div class="bg-gray-950/60 rounded-lg p-1.5">
                        <div class="text-gray-500 text-[9px]">Prix de revient</div>
                        <div class="text-gray-300">${formatEUR(est.totalCost)}</div>
                    </div>
                    <div class="bg-gray-950/60 rounded-lg p-1.5">
                        <div class="text-gray-500 text-[9px]">PV / MV</div>
                        <div class="${pnlCls}">${est.pnl >= 0 ? '+' : ''}${formatEUR(est.pnl)}</div>
                    </div>
                    <div class="bg-gray-950/60 rounded-lg p-1.5">
                        <div class="text-gray-500 text-[9px]">Impôt estimé</div>
                        <div class="text-amber-300">${formatEUR(est.tax)}</div>
                    </div>
                    <div class="bg-gray-950/60 rounded-lg p-1.5">
                        <div class="text-gray-500 text-[9px]">Net encaissé</div>
                        <div class="text-emerald-300 font-bold">${formatEUR(est.net)}</div>
                    </div>
                </div>
                <div class="text-[10px] text-gray-500">Régime appliqué : <span class="text-gray-400">${escapeHTML(est.regime || '—')}</span></div>
            </div>`);
        });
    }

    // Achats
    data.buys.forEach(buy => {
        cards.push(`<div class="p-3 bg-emerald-950/20 border border-emerald-800/40 rounded-xl space-y-2" data-op='${JSON.stringify({ kind: 'buy', cadran: buy.cadran, amount: buy.amount, label: buy.label }).replace(/'/g, "&#39;")}'>
            <div class="flex items-start justify-between gap-2">
                <div class="flex items-start gap-2 min-w-0">
                    <span class="inline-flex items-center justify-center w-5 h-5 rounded-md border bg-emerald-950/70 text-emerald-400 border-emerald-800/60 text-[10px] flex-shrink-0"><i class="fa-solid fa-cart-shopping"></i></span>
                    <div class="min-w-0">
                        <div class="font-bold text-white text-xs flex items-center gap-1.5">
                            <span class="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-bold">ACHETER</span>
                            Cadran ${escapeHTML(buy.label)}
                        </div>
                        <div class="text-[10px] text-gray-400 font-mono">${formatEUR(buy.amount)} à réinvestir dans ce cadran</div>
                    </div>
                </div>
                <button onclick="convertRebalanceToArbitrage(this)" class="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-medium flex items-center gap-1 flex-shrink-0">
                    <i class="fa-solid fa-plus text-[9px]"></i> Arbitrage
                </button>
            </div>
            <div class="text-[10px] text-gray-500 italic">
                Suggestion : placez ce montant dans un actif du cadran ${escapeHTML(buy.label)} (nouvel achat ou renforcement d'une position existante).
            </div>
        </div>`);
    });

    opsEl.innerHTML = `<div class="space-y-2">${cards.join('')}</div>`;
}

// ----------------------------------------------------------------
// Conversion d'une opération en arbitrage
// ----------------------------------------------------------------
// Lit le data-op JSON stocké sur le bouton parent et préremplit le modal d'arbitrage.
function convertRebalanceToArbitrage(btn) {
    const wrap = btn.closest('[data-op]');
    if (!wrap) return;
    let op;
    try { op = JSON.parse(wrap.dataset.op); } catch (_) { return; }

    openAddArbitrageModal();
    document.getElementById('arb-date').value = new Date().toISOString().slice(0, 10);

    if (op.kind === 'sell') {
        document.getElementById('arb-source').value = `Cadran ${op.label} — ${op.assetId ? (assets.find(a => a.id === op.assetId)?.name || '') : ''}`;
        document.getElementById('arb-destination').value = 'Rééquilibrage 4 Cadrans';
        document.getElementById('arb-montant').value = op.amount.toFixed(2);
        document.getElementById('arb-motif').value = `Rebalancing assisté — vente ${formatEUR(op.amount)} dans le cadran ${op.label} (sur-pondéré).`;
    } else {
        document.getElementById('arb-source').value = 'Rééquilibrage 4 Cadrans';
        document.getElementById('arb-destination').value = `Cadran ${op.label}`;
        document.getElementById('arb-montant').value = op.amount.toFixed(2);
        document.getElementById('arb-motif').value = `Rebalancing assisté — réinvestir ${formatEUR(op.amount)} dans le cadran ${op.label} (sous-pondéré).`;
    }
    closeModal('modal-rebalance');
}

// Convertit TOUTES les opérations courantes en une seule fois (les enregistre
// directement dans le registre d'arbitrages, sans passer par le modal).
function convertRebalanceAll() {
    const data = computeRebalanceSuggestions();
    const totalOps = data.sells.length + data.buys.length;
    if (!totalOps) {
        alert('Aucune opération à convertir.');
        return;
    }
    if (!confirm(`Créer ${totalOps} arbitrage(s) dans le registre ?\n\n` +
        `• ${data.sells.length} vente(s)\n• ${data.buys.length} achat(s)\n\n` +
        `Les positions ne seront PAS modifiées — vous devez toujours saisir les ventes/achats réellement effectués dans le registre des cessions et l'inventaire.`)
    ) return;

    pushUndo('Rebalancing — enregistrement des arbitrages');

    const today = new Date().toISOString().slice(0, 10);
    let created = 0;

    data.sells.forEach(sell => {
        const best = pickBestSellCandidate(sell.cadran);
        arbitrages.push({
            id: Date.now() + Math.floor(Math.random() * 100000),
            date: today,
            source: `Cadran ${sell.label}${best ? ' — ' + best.name : ''}`,
            destination: 'Rééquilibrage 4 Cadrans',
            montant: sell.amount,
            motif: `Rebalancing assisté — vente dans cadran sur-pondéré ${sell.label}.`
        });
        created++;
    });
    data.buys.forEach(buy => {
        arbitrages.push({
            id: Date.now() + Math.floor(Math.random() * 100000),
            date: today,
            source: 'Rééquilibrage 4 Cadrans',
            destination: `Cadran ${buy.label}`,
            montant: buy.amount,
            motif: `Rebalancing assisté — achat dans cadran sous-pondéré ${buy.label}.`
        });
        created++;
    });

    saveArbitrages();
    closeModal('modal-rebalance');
    refreshAllUI();
    alert(`${created} arbitrage(s) enregistré(s) dans le registre.`);
}