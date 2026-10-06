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
    // --- 1) Positions détenues (latent) ---
    let totalInvested = 0, totalValue = 0, totalFrais = 0;
    assets.forEach(a => {
        totalInvested += a.invested || 0;
        totalValue    += a.value    || 0;
        totalFrais    += a.frais    || 0;
    });

    document.getElementById('stat-total-invested').innerText = formatEUR(totalInvested);
    document.getElementById('stat-total-frais').innerText    = formatEUR(totalFrais);
    document.getElementById('stat-total-value').innerText    = formatEUR(totalValue);

    const latentPnl = totalValue - totalInvested;
    const latentPnlEl = document.getElementById('stat-pnl');
    latentPnlEl.innerText = (latentPnl >= 0 ? '+' : '') + formatEUR(latentPnl);
    latentPnlEl.className = `text-2xl font-bold font-mono ${latentPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;

    const latentPct = totalInvested > 0 ? (latentPnl / totalInvested * 100) : 0;
    const latentPctEl = document.getElementById('stat-pnl-pct');
    latentPctEl.innerText = (latentPct >= 0 ? '+' : '') + latentPct.toFixed(2) + '%';
    latentPctEl.className = `text-xs font-semibold mt-1 font-mono ${latentPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;

    document.getElementById('stat-asset-count').innerText = assets.length + (assets.length > 1 ? ' Actifs' : ' Actif');

    const gaveCount   = assets.filter(a => GAVE_QUADRANTS.includes(a.cadran)).length;
    const cryptoCount = assets.filter(a => hasTag(a, 'Crypto')).length;
    const horsCount   = assets.filter(a => a.cadran === 'HORS_GAVE' && !hasTag(a, 'Crypto')).length;

    document.getElementById('stat-gave-count').innerText      = gaveCount;
    document.getElementById('stat-hors-gave-count').innerText = horsCount;
    const cryptoCountEl = document.getElementById('stat-crypto-count');
    if (cryptoCountEl) cryptoCountEl.innerText = cryptoCount;

    // --- 2) Performance réalisée (cessions) ---
    let realizedGross = 0;         // Σ prix de vente
    let realizedCost  = 0;         // Σ prix d'achat (PRU)
    let realizedPnl   = 0;         // Σ (prix vente - prix achat - frais)
    cessions.forEach(c => {
        const vente = c.prixVente || 0;
        const achat = c.prixAchat || 0;
        const frais = c.frais || 0;
        realizedGross += vente;
        realizedCost  += achat;
        realizedPnl   += (vente - achat - frais);
    });

    const realizedGrossEl = document.getElementById('stat-realized-gross');
    if (realizedGrossEl) realizedGrossEl.innerText = formatEUR(realizedGross);

    const realizedCountEl = document.getElementById('stat-realized-count');
    if (realizedCountEl) realizedCountEl.innerText = `${cessions.length} opération(s)`;

    const realizedPnlEl = document.getElementById('stat-realized-pnl');
    if (realizedPnlEl) {
        realizedPnlEl.innerText = (realizedPnl >= 0 ? '+' : '') + formatEUR(realizedPnl);
        realizedPnlEl.className = `text-2xl font-bold font-mono ${realizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }

    const realizedPct = realizedCost > 0 ? (realizedPnl / realizedCost * 100) : 0;
    const realizedPctEl = document.getElementById('stat-realized-pnl-pct');
    if (realizedPctEl) {
        realizedPctEl.innerText = (realizedPct >= 0 ? '+' : '') + realizedPct.toFixed(2) + '%';
        realizedPctEl.className = `text-xs mt-1 font-mono ${realizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }

    // --- 3) Impôt estimé (lecture DOM, calculé par calculateAnneeN1) ---
    let impotEstime = 0;
    const impotEl = document.getElementById('cession-stat-impot-estime');
    if (impotEl) {
        const txt = impotEl.innerText.replace(/[^\d,.-]/g, '').replace(',', '.');
        impotEstime = parseFloat(txt) || 0;
    }

    // Ajouter la fiscalité métaux et enveloppes pour un total honnête
    const metauxEl = document.getElementById('decomp-metaux-total');
    const envEl    = document.getElementById('decomp-enveloppes-total');
    if (metauxEl) {
        const t = metauxEl.innerText.replace(/[^\d,.-]/g, '').replace(',', '.');
        impotEstime += parseFloat(t) || 0;
    }
    if (envEl) {
        const t = envEl.innerText.replace(/[^\d,.-]/g, '').replace(',', '.');
        impotEstime += parseFloat(t) || 0;
    }

    const totalTaxEl = document.getElementById('stat-total-tax');
    if (totalTaxEl) totalTaxEl.innerText = formatEUR(impotEstime);

    const realizedNet = realizedPnl - impotEstime;
    const realizedNetEl = document.getElementById('stat-realized-net');
    if (realizedNetEl) {
        realizedNetEl.innerText = (realizedNet >= 0 ? '+' : '') + formatEUR(realizedNet);
        realizedNetEl.className = `font-mono ${realizedNet >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }

    // --- 4) P&L total = latent + réalisé ---
    const totalPnl = latentPnl + realizedPnl;
    const totalBase = totalInvested + realizedCost;
    const totalPct = totalBase > 0 ? (totalPnl / totalBase * 100) : 0;

    const totalPnlEl = document.getElementById('stat-total-pnl');
    if (totalPnlEl) totalPnlEl.innerText = (totalPnl >= 0 ? '+' : '') + formatEUR(totalPnl);

    const totalPnlPctEl = document.getElementById('stat-total-pnl-pct');
    if (totalPnlPctEl) totalPnlPctEl.innerText = (totalPct >= 0 ? '+' : '') + totalPct.toFixed(2) + '%';
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
                ${hasTag(asset, 'Or & Métaux') ? `<button onclick="event.stopPropagation(); openManualGoldUpdate(${asset.id})" class="p-1.5 text-gray-400 hover:text-amber-400" title="Mettre à jour manuellement la valeur AuCoffre"><i class="fa-solid fa-pen-to-square"></i></button>` : ''}
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
    if (topPctEl && topAsset) topPctEl.innerText = (totalValue > 0 ? (topVal / totalValue * 100) : 0).toFixed(1) + '%';
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
    if (hhiEl) hhiEl.innerText = Math.round(hhi);
    if (hhiLabelEl) {
        let label = '—';
        if (hhi > 0 && hhi < 1500) label = 'Diversifié';
        else if (hhi < 2500) label = 'Modérément concentré';
        else if (hhi > 0) label = 'Très concentré';
        hhiLabelEl.innerText = label;
    }

    // Position la plus ancienne
    let oldestAsset = null, oldestDate = null;
    assets.forEach(a => {
        (a.lots || []).forEach(l => {
            if ((l.qtyRemaining || 0) > 0) {
                const d = parseFlexDate(l.date);
                if (d && (!oldestDate || d < oldestDate)) {
                    oldestDate = d;
                    oldestAsset = a;
                }
            }
        });
        // Fallback sur buys[0] si pas de lots
        if (!oldestDate && a.buys && a.buys[0]) {
            const d = parseFlexDate(a.buys[0].date);
            if (d && (!oldestDate || d < oldestDate)) { oldestDate = d; oldestAsset = a; }
        }
    });
    const oldestYearsEl = document.getElementById('inv-stat-oldest-years');
    const oldestNameEl  = document.getElementById('inv-stat-oldest-name');
    if (oldestYearsEl && oldestDate) {
        const years = (Date.now() - oldestDate.getTime()) / (1000 * 3600 * 24 * 365.25);
        oldestYearsEl.innerText = years.toFixed(1) + ' ans';
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
    if (cryptoPnlEl) {
        const pnl = cryptoVal - cryptoInvested;
        cryptoPnlEl.innerText = (pnl >= 0 ? '+' : '') + formatEUR(pnl);
        cryptoPnlEl.className = `text-lg font-bold font-mono ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }

    let topCrypto = null, topCryptoVal = 0;
    cryptos.forEach(a => { if ((a.value || 0) > topCryptoVal) { topCryptoVal = a.value; topCrypto = a; } });
    const cryptoTopPctEl = document.getElementById('crypto-stat-top-pct');
    const cryptoTopNameEl = document.getElementById('crypto-stat-top-name');
    if (cryptoTopPctEl && topCrypto) cryptoTopPctEl.innerText = (cryptoVal > 0 ? (topCryptoVal / cryptoVal * 100) : 0).toFixed(1) + '%';
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
    if (horsPnlEl) {
        const pnl = horsVal - horsInvested;
        horsPnlEl.innerText = (pnl >= 0 ? '+' : '') + formatEUR(pnl);
        horsPnlEl.className = `text-lg font-bold font-mono ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
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

    // Taux d'imposition effectif
    let impotTotal = 0;
    const impotEl2 = document.getElementById('cession-stat-impot-estime');
    if (impotEl2) {
        const t = impotEl2.innerText.replace(/[^\d,.-]/g, '').replace(',', '.');
        impotTotal += parseFloat(t) || 0;
    }
    const metauxEl2 = document.getElementById('decomp-metaux-total');
    const envEl2 = document.getElementById('decomp-enveloppes-total');
    if (metauxEl2) { const t = metauxEl2.innerText.replace(/[^\d,.-]/g, '').replace(',', '.'); impotTotal += parseFloat(t) || 0; }
    if (envEl2)    { const t = envEl2.innerText.replace(/[^\d,.-]/g, '').replace(',', '.');  impotTotal += parseFloat(t) || 0; }

    let pnlRealise = 0, costRealise = 0;
    cessions.forEach(c => {
        pnlRealise += (c.prixVente || 0) - (c.prixAchat || 0) - (c.frais || 0);
        costRealise += (c.prixAchat || 0);
    });
    const effectiveRate = pnlRealise > 0 ? (impotTotal / pnlRealise * 100) : 0;
    const effRateEl = document.getElementById('fiscal-stat-effective-rate');
    if (effRateEl) effRateEl.innerText = effectiveRate.toFixed(1) + '%';
}