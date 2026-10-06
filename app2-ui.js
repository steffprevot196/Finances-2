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
    let totalInvested = 0, totalValue = 0, totalFrais = 0;
    assets.forEach(a => {
        totalInvested += a.invested || 0;
        totalValue    += a.value    || 0;
        totalFrais    += a.frais    || 0;
    });

    document.getElementById('stat-total-invested').innerText = formatEUR(totalInvested);
    document.getElementById('stat-total-frais').innerText    = formatEUR(totalFrais);
    document.getElementById('stat-total-value').innerText    = formatEUR(totalValue);

    const pnl = totalValue - totalInvested;
    const pnlEl = document.getElementById('stat-pnl');
    pnlEl.innerText = (pnl >= 0 ? '+' : '') + formatEUR(pnl);
    pnlEl.className = `text-2xl font-bold font-mono ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;

    const pnlPct = totalInvested > 0 ? (pnl / totalInvested * 100) : 0;
    const pnlPctEl = document.getElementById('stat-pnl-pct');
    pnlPctEl.innerText = (pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(2) + '%';
    pnlPctEl.className = `text-xs font-semibold mt-1 font-mono ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;

    document.getElementById('stat-asset-count').innerText = assets.length + (assets.length > 1 ? ' Actifs' : ' Actif');

    const gaveCount   = assets.filter(a => GAVE_QUADRANTS.includes(a.cadran)).length;
    const cryptoCount = assets.filter(a => hasTag(a, 'Crypto')).length;
    const horsCount   = assets.filter(a => a.cadran === 'HORS_GAVE' && !hasTag(a, 'Crypto')).length;

    document.getElementById('stat-gave-count').innerText      = gaveCount;
    document.getElementById('stat-hors-gave-count').innerText = horsCount;
    const cryptoCountEl = document.getElementById('stat-crypto-count');
    if (cryptoCountEl) cryptoCountEl.innerText = cryptoCount;
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
        `<span class="px-1.5 py-0.5 rounded border border-dashed text-[9px] whitespace-nowrap opacity-70 ${CADRAN_BADGE_COLORS[q]}" title="Cadran secondaire (informatif, hors calcul des 25%)">+ ${cadranLabel(q)}</span>`
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
        tr.className = 'clickable-row';
        tr.onclick = () => openAssetDetailModal(asset.id);
        tr.innerHTML = `
            <td class="p-3">
                <div class="font-bold text-white">${asset.name}</div>
                <div class="text-[10px] text-gray-500 font-mono">${assetSubtitleHTML(asset)}</div>
            </td>
            <td class="p-3"><div class="flex flex-wrap gap-1">${tagBadgesHTML(asset)}</div></td>
            <td class="p-3"><div class="flex flex-wrap gap-1">${cadranBadgesHTML(asset)}</div></td>
            <td class="p-3 text-right font-mono">${asset.qty}</td>
            <td class="p-3 text-right font-mono text-gray-400">${formatEUR(asset.frais || 0)}</td>
            <td class="p-3 text-right font-mono">${formatEUR(asset.invested)}</td>
            <td class="p-3 text-right font-mono font-bold text-white">${formatEUR(asset.value)}</td>
            <td class="p-3 text-right font-mono">
                <div class="font-bold ${pnlCls}">${isPos ? '+' : ''}${formatEUR(pnl)}</div>
                <div class="text-[10px] ${isPos ? 'text-emerald-400/70' : 'text-rose-400/70'}">${isPos ? '+' : ''}${pnlPct.toFixed(2)}%</div>
            </td>
            <td class="p-3 text-right font-mono">${riskCellHTML(asset)}</td>
            <td class="p-3 text-center whitespace-nowrap">
                <button title="Comparer" onclick="event.stopPropagation(); openAssetCompare(${asset.id})" class="p-1.5 text-gray-400 hover:text-indigo-400"><i class="fa-solid fa-code-compare"></i></button>
                <button onclick="event.stopPropagation(); openAssetDetailModal(${asset.id})" class="p-1.5 text-gray-400 hover:text-blue-400"><i class="fa-solid fa-eye"></i></button>
                <button onclick="event.stopPropagation(); openManualGoldUpdate(${asset.id})" class="p-1.5 text-gray-400 hover:text-amber-400" title="Mettre à jour manuellement la valeur AuCoffre"><i class="fa-solid fa-pen-to-square"></i></button>
                <button onclick="event.stopPropagation(); openEditAssetModal(${asset.id})" class="p-1.5 text-gray-400 hover:text-emerald-400"><i class="fa-solid fa-pen"></i></button>
                <button onclick="event.stopPropagation(); deleteAsset(${asset.id})" class="p-1.5 text-gray-400 hover:text-rose-400"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);

        // ---- Carte (mobile) ----
        const card = document.createElement('div');
        card.className = 'bg-gray-900/60 border border-gray-800 rounded-xl p-3 space-y-2';
        card.onclick = () => openAssetDetailModal(asset.id);
        card.innerHTML = `
            <div class="flex justify-between items-start gap-2">
                <div class="min-w-0">
                    <div class="font-bold text-white text-sm truncate">${asset.name}</div>
                    <div class="text-[10px] text-gray-500 font-mono">${assetSubtitleHTML(asset)}</div>
                </div>
                <div class="text-right flex-shrink-0">
                    <div class="font-mono font-bold text-white text-sm">${formatEUR(asset.value)}</div>
                    <div class="font-mono text-[11px] ${pnlCls}">${isPos ? '+' : ''}${formatEUR(pnl)} (${isPos ? '+' : ''}${pnlPct.toFixed(1)}%)</div>
                </div>
            </div>
            <div class="flex flex-wrap gap-1">${tagBadgesHTML(asset)} ${cadranBadgesHTML(asset)}</div>
            <div class="flex justify-between items-center text-[11px] text-gray-400">
                <span>Qté ${asset.qty} · Investi ${formatEUR(asset.invested)} · Frais ${formatEUR(asset.frais || 0)}</span>
            </div>
            <div class="flex justify-end gap-1 pt-1 border-t border-gray-800">
                <button onclick="event.stopPropagation(); openAssetCompare(${asset.id})" class="p-2 text-gray-400 hover:text-indigo-400"><i class="fa-solid fa-code-compare"></i></button>
                <button onclick="event.stopPropagation(); openEditAssetModal(${asset.id})" class="p-2 text-gray-400 hover:text-emerald-400"><i class="fa-solid fa-pen"></i></button>
                <button onclick="event.stopPropagation(); deleteAsset(${asset.id})" class="p-2 text-gray-400 hover:text-rose-400"><i class="fa-solid fa-trash"></i></button>
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
    const cryptos = assets.filter(a => a.category === 'Crypto');
    let total = 0;

    tbody.innerHTML = cryptos.map(a => {
        total += a.value || 0;
        const pnl = (a.value || 0) - (a.invested || 0);
        const isPos = pnl >= 0;
        return `<tr class="clickable-row" onclick="openAssetDetailModal(${a.id})">
            <td class="p-3"><div class="font-bold text-white">${a.name}</div><div class="text-[10px] text-gray-500 font-mono">${a.ticker}</div></td>
            <td class="p-3 text-right font-mono">${a.qty}</td>
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
        return `<tr class="clickable-row" onclick="openAssetDetailModal(${a.id})">
            <td class="p-3"><div class="font-bold text-white">${a.name}</div><div class="text-[10px] text-gray-500 font-mono">${a.ticker}</div></td>
            <td class="p-3"><span class="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-[10px]">${a.category}</span></td>
            <td class="p-3 text-right font-mono">${a.qty}</td>
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
            return `<button onclick="toggleGaveDetailFilter('${q}')" class="px-3 py-1.5 rounded-lg text-xs border font-medium ${active ? activeClasses[q] : 'bg-gray-900 text-gray-400 border-gray-800 hover:text-white'}">${cadranLabel(q)}</button>`;
        }).join('');

    const items = assets.filter(a => GAVE_QUADRANTS.includes(a.cadran) && gaveDetailFilter.has(a.cadran));
    const tbody = document.getElementById('table-gave-detail-body');

    tbody.innerHTML = items.length ? items.map(a => {
        const pnl = (a.value || 0) - (a.invested || 0);
        const isPos = pnl >= 0;
        return `<tr class="clickable-row" onclick="openAssetDetailModal(${a.id})">
            <td class="p-3"><div class="font-bold text-white">${a.name}</div><div class="text-[10px] text-gray-500 font-mono">${a.ticker}</div></td>
            <td class="p-3">${cadranBadgeHTML(a.cadran)}</td>
            <td class="p-3 text-right font-mono">${a.qty}</td>
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
    const cryptoAssets = assets.filter(a => a.category === 'Crypto');
    const horsAssets   = assets.filter(a => a.cadran === 'HORS_GAVE' && a.category !== 'Crypto');

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
            <td class="p-3 text-rose-300 font-bold">${a.source}</td>
            <td class="p-3 text-emerald-300 font-bold">${a.destination}</td>
            <td class="p-3 text-right text-white font-bold">${formatEUR(a.montant)}</td>
            <td class="p-3 text-gray-400 font-sans">${a.motif || '—'}</td>
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
            <div class="min-w-0"><div class="font-bold text-white truncate">${a.name}</div><div class="text-[10px] text-gray-500 font-mono">${a.ticker}</div></div>
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
        localStorage.setItem('patriMonial_cadranNames', JSON.stringify(cadranNames));
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