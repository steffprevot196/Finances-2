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
        compareChartHistoryInstance.A, compareChartHistoryInstance.B
    ].forEach(c => { if (c) c.destroy(); });

    dashboardAllocChartInstance = dashboardHistoryChartInstance = null;
    gaveChartInstance = assetHistoryChartInstance = quadrantHistoryChartInstance = null;
    compareChartAllocInstance = { A: null, B: null };
    compareChartHistoryInstance = { A: null, B: null };
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

// Badge 📝 « Papier » pour les positions simulées
function paperBadgeHTML(asset) {
    if (!isPaperAsset(asset)) return '';
    return ` <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-bold bg-purple-950 text-purple-300 border-purple-700/60" title="Position fictive (Paper Trading) — non incluse dans la fiscalité tant qu'elle n'est pas promue en réel"><i class="fa-solid fa-flask text-[8px]"></i>Papier</span>`;
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
            <td class="p-3">
                <div class="flex items-center gap-1.5 min-w-0">
                    ${assetClassIconHTML(asset)}
                    <div class="min-w-0 flex-1">
                        <div class="font-bold text-white truncate">${escapeHTML(asset.name)}${concentrationBadgeHTML(asset)}${paperBadgeHTML(asset)}</div>
                        <div class="text-[10px] text-gray-500 font-mono">${assetSubtitleHTML(asset)}</div>
                    </div>
                </div>
            </td>
            <td class="p-3"><div class="flex flex-wrap gap-1">${tagBadgesHTML(asset)}</div></td>
            <td class="p-3"><div class="flex flex-wrap gap-1">${cadranBadgesHTML(asset)}</div></td>
            <td class="p-3 text-right font-mono">${fmtQty(asset.qty)}</td>
            <td class="p-3 text-right font-mono text-gray-400">${asset.qty > 0 ? formatUnitPrice(pruUnitaire) : '—'}</td>
            <td class="p-3 text-right font-mono text-gray-300">${asset.qty > 0 ? formatUnitPrice(valeurUnitaire) : '—'}</td>
            <td class="p-3 text-right font-mono text-gray-400">${formatEUR(asset.frais || 0)}</td>
            <td class="p-3 text-right font-mono">${formatEUR(asset.invested)}</td>
            <td class="p-3 text-right font-mono font-bold text-white">${formatEUR(asset.value)}</td>
            <td class="p-3 text-right">${sparklineHTML(asset)}</td>
            <td class="p-3 text-right font-mono">
                <div class="font-bold ${pnlCls}">${isPos ? '+' : ''}${formatEUR(pnl)}</div>
                <div class="text-[10px] ${isPos ? 'text-emerald-400/70' : 'text-rose-400/70'}">${isPos ? '+' : ''}${pnlPct.toFixed(2)}%</div>
            </td>
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
        { label: 'Synchronisation Google Drive',  hint: 'Sauvegardes chiffrées AES-256',          icon: 'fa-cloud-arrow-up',      category: 'Données',    run: () => openDriveSyncModal() },
        { label: 'Charger les données démo',      hint: "Remet le portefeuille d'exemple",        icon: 'fa-rotate-left',         category: 'Action',     run: () => resetData() },
        { label: 'Vider tout',                    hint: 'Effacer actifs, cessions et arbitrages', icon: 'fa-trash-can',           category: 'Action',     run: () => clearAllData() },
        { label: (tintRowsEnabled ? 'Désactiver' : 'Activer') + ' le teintage des lignes', hint: 'Vert = gain · Rouge = perte', icon: 'fa-palette', category: 'Action', run: () => { toggleTintRows(); } },
        { label: (lightMode ? 'Passer en mode sombre' : 'Passer en mode clair'), hint: 'Basculer le thème de l\'interface', icon: lightMode ? 'fa-moon' : 'fa-sun', category: 'Action', run: () => { toggleLightMode(); } },
        { label: (paperMode ? 'Désactiver' : 'Activer') + ' le Paper Trading', hint: 'Créer des positions fictives pour tester des stratégies', icon: 'fa-flask', category: 'Action', run: () => { togglePaperMode(); } },
        { label: (paperIncludeInStats ? 'Exclure' : 'Inclure') + ' les positions papier des stats', hint: 'Impact sur les KPI et le calcul fiscal global', icon: 'fa-filter', category: 'Action', run: () => { setPaperIncludeInStats(!paperIncludeInStats); } },
        { label: 'Purger les positions papier', hint: 'Supprimer toutes les positions fictives', icon: 'fa-trash-can', category: 'Action', run: () => { deleteAllPaperAssets(); } },
        { label: "Vue d'ensemble",                hint: 'Onglet 1',                               icon: 'fa-gauge-high',          category: 'Navigation', run: () => switchTab('tab-dashboard') },
        { label: 'Inventaire des placements',     hint: 'Onglet 2',                               icon: 'fa-list-check',          category: 'Navigation', run: () => switchTab('tab-inventaire') },
        { label: '4 Cadrans de Gave',             hint: 'Onglet 3',                               icon: 'fa-compass',             category: 'Navigation', run: () => switchTab('tab-gave') },
        { label: 'Cryptomonnaies',                hint: 'Onglet 4',                               icon: 'fa-bitcoin',             category: 'Navigation', run: () => switchTab('tab-crypto') },
        { label: 'Hors-Cadran & Divers',          hint: 'Onglet 5',                               icon: 'fa-building-columns',    category: 'Navigation', run: () => switchTab('tab-hors-gave') },
        { label: 'Évaluation 3 Piliers',          hint: 'Onglet 6',                               icon: 'fa-scale-balanced',      category: 'Navigation', run: () => switchTab('tab-piliers') },
        { label: 'Fiscalité & Cessions',          hint: 'Onglet 7',                               icon: 'fa-receipt',             category: 'Navigation', run: () => switchTab('tab-annee-n1') },
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