// =====================================================================
// app3-charts.js — GRAPHIQUES (Chart.js), modaux cadran/actif
// Dépend de : app1-core.js, app2-ui.js
// =====================================================================

// ---------------------------------------------------------------------
// Configuration commune des graphiques d'évolution (Investi + Valeur + %)
// ---------------------------------------------------------------------
function buildHistoryChartConfig(tl, valueColor, valueBg) {
    const percentSeries = tl.investedSeries.map((inv, i) =>
        inv > 0 ? Math.round(((tl.valueSeries[i] - inv) / inv) * 1000) / 10 : 0
    );
    return {
        type: 'line',
        data: {
            labels: tl.labels,
            datasets: [
                { label: 'Investi', data: tl.investedSeries, borderColor: '#6b7280', backgroundColor: 'rgba(107,114,128,0.1)', tension: 0.3, fill: true, yAxisID: 'y' },
                { label: 'Valeur', data: tl.valueSeries, borderColor: valueColor, backgroundColor: valueBg, tension: 0.3, fill: true, yAxisID: 'y' },
                { label: 'Performance %', data: percentSeries, borderColor: '#f59e0b', backgroundColor: 'transparent', borderDash: [4, 4], tension: 0.3, fill: false, pointRadius: 2, yAxisID: 'yPercent' }
            ]
        },
        options: {
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#9ca3af' } } },
            scales: {
                x: { ticks: { color: '#6b7280' }, grid: { color: '#1f2937' } },
                y: { grace: '10%', ticks: { color: '#6b7280' }, grid: { color: '#1f2937' } },
                yPercent: {
                    position: 'right', grace: '10%',
                    ticks: { color: '#f59e0b', callback: v => v + '%' },
                    grid: { drawOnChartArea: false }
                }
            }
        }
    };
}

// ---------------------------------------------------------------------
// Onglet Vue d'ensemble (Dashboard)
// ---------------------------------------------------------------------
function initDashboardCharts() {
    if (dashboardAllocChartInstance)   dashboardAllocChartInstance.destroy();
    if (dashboardHistoryChartInstance) dashboardHistoryChartInstance.destroy();

    const catColors = {
        'Or & Métaux': '#f59e0b',
        'Devises/Liquidités': '#3b82f6',
        'Actions/ETF': '#10b981',
        'Obligations': '#14b8a6',
        'Crypto': '#8b5cf6',
        'Matières Premières': '#ef4444',
        'Autre': '#6b7280'
    };
    const catTotals = {};
    assets.forEach(a => { catTotals[a.category] = (catTotals[a.category] || 0) + (a.value || 0); });
    const labels = Object.keys(catTotals);
    const data   = Object.values(catTotals);

    dashboardAllocChartInstance = createChart('dashboardAllocChart', {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: labels.map(l => catColors[l] || '#6b7280'),
                borderColor: '#111827',
                borderWidth: 2
            }]
        },
        options: {
            plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af', boxWidth: 10, font: { size: 10 } } } },
            cutout: '65%',
            maintainAspectRatio: false
        }
    });

    document.getElementById('dashboard-range-container').innerHTML =
        rangeSelectHTML('dashboard-range-select', dashboardRangeFilter, getAvailableYears(), 'setDashboardRange');

    const tl = filterTimelineByRange(buildPortfolioTimeline(), dashboardRangeFilter);
    dashboardHistoryChartInstance = createChart(
        'dashboardHistoryChart',
        buildHistoryChartConfig(tl, '#10b981', 'rgba(16,185,129,0.15)')
    );
}

function setDashboardRange(val) {
    dashboardRangeFilter = val;
    initDashboardCharts();
}

// ---------------------------------------------------------------------
// Onglet 4 Cadrans — Donut
// ---------------------------------------------------------------------
function initGaveDonutChart() {
    if (gaveChartInstance) gaveChartInstance.destroy();
    const colorMap = { OR: '#f59e0b', MONNAIES: '#3b82f6', ASIE: '#10b981', PETROLE: '#f43f5e' };
    const totals = GAVE_QUADRANTS.map(q =>
        assets.filter(a => a.cadran === q).reduce((s, a) => s + (a.value || 0), 0)
    );

    gaveChartInstance = createChart('gaveChart', {
        type: 'doughnut',
        data: {
            labels: ['OR', 'MONNAIES', 'ASIE', 'PÉTROLE'],
            datasets: [{
                data: totals,
                backgroundColor: GAVE_QUADRANTS.map(q => colorMap[q]),
                borderColor: '#111827',
                borderWidth: 2
            }]
        },
        options: {
            plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af', boxWidth: 10, font: { size: 10 } } } },
            cutout: '60%',
            maintainAspectRatio: false
        }
    });
}

// ---------------------------------------------------------------------
// Modal détail d'un cadran
// ---------------------------------------------------------------------
function openQuadrantModal(q) {
    currentQuadrantCode = q;
    quadrantRangeFilter = 'ALL';
    const borderColors = {
        OR: 'border-l-amber-500',
        MONNAIES: 'border-l-blue-500',
        ASIE: 'border-l-emerald-500',
        PETROLE: 'border-l-rose-500'
    };
    document.getElementById('modal-quadrant-header-border').className =
        `p-4 border-b border-gray-800 border-l-4 ${borderColors[q] || ''} flex justify-between items-start bg-gray-950`;
    document.getElementById('modal-quadrant-title').innerText = `Cadran ${CADRAN_NUM[q]} : ${cadranLabel(q)}`;
    renderQuadrantModalContent(q);
    document.getElementById('modal-quadrant').classList.remove('hidden');
}

function renderQuadrantModalContent(q) {
    const items = assets.filter(a => a.cadran === q);
    const totalValue    = items.reduce((s, a) => s + (a.value || 0), 0);
    const totalInvested = items.reduce((s, a) => s + (a.invested || 0), 0);
    const pnl    = totalValue - totalInvested;
    const pnlPct = totalInvested > 0 ? (pnl / totalInvested * 100) : 0;
    const totalPatrimoine = assets.reduce((s, a) => s + (a.value || 0), 0);
    const weightPct = totalPatrimoine > 0 ? (totalValue / totalPatrimoine * 100) : 0;
    const isPos = pnl >= 0;

    document.getElementById('quadrant-kpi-value').innerText    = formatEUR(totalValue);
    document.getElementById('quadrant-kpi-invested').innerText = formatEUR(totalInvested);
    document.getElementById('quadrant-kpi-weight').innerText   = `${weightPct.toFixed(1)}% / 25.0%`;

    const pnlEl = document.getElementById('quadrant-kpi-pnl');
    pnlEl.className = `text-lg font-bold font-mono ${isPos ? 'text-emerald-400' : 'text-rose-400'}`;
    pnlEl.innerText = `${isPos ? '+' : ''}${formatEUR(pnl)}`;

    const pnlPctEl = document.getElementById('quadrant-kpi-pnl-pct');
    pnlPctEl.className = `text-[10px] ${isPos ? 'text-emerald-400' : 'text-rose-400'}`;
    pnlPctEl.innerText = `${isPos ? '+' : ''}${pnlPct.toFixed(2)}%`;

    renderQuadrantChart(q);

    const tbody = document.getElementById('modal-quadrant-body');
    tbody.innerHTML = items.length ? items.map(a => {
        const lpnl = (a.value || 0) - (a.invested || 0);
        const lIsPos = lpnl >= 0;
        const part = totalValue > 0 ? (a.value || 0) / totalValue * 100 : 0;
        return `<tr>
            <td class="p-2.5"><div class="font-bold text-white">${a.name}</div><div class="text-[10px] text-gray-500">${a.ticker}</div></td>
            <td class="p-2.5 text-right">${formatEUR(a.invested)}</td>
            <td class="p-2.5 text-right text-white font-bold">${formatEUR(a.value)}</td>
            <td class="p-2.5 text-right ${lIsPos ? 'text-emerald-400' : 'text-rose-400'}">${lIsPos ? '+' : ''}${formatEUR(lpnl)} (${lIsPos ? '+' : ''}${(a.invested > 0 ? lpnl / a.invested * 100 : 0).toFixed(1)}%)</td>
            <td class="p-2.5 text-right text-amber-300">${part.toFixed(1)}%</td>
            <td class="p-2.5 text-right">${cadranSelectHTML(a.id, a.cadran)}</td>
        </tr>`;
    }).join('') : `<tr><td colspan="6" class="p-4 text-center text-gray-500 text-xs">Aucun actif dans ce cadran pour le moment.</td></tr>`;
}

function renderQuadrantChart(q) {
    const items = assets.filter(a => a.cadran === q);
    document.getElementById('quadrant-range-container').innerHTML =
        rangeSelectHTML('quadrant-range-select', quadrantRangeFilter, getAvailableYears(items), 'setQuadrantRange');

    if (quadrantHistoryChartInstance) quadrantHistoryChartInstance.destroy();
    const tl = filterTimelineByRange(buildPortfolioTimeline(items), quadrantRangeFilter);
    quadrantHistoryChartInstance = createChart(
        'quadrantHistoryChart',
        buildHistoryChartConfig(tl, '#f43f5e', 'rgba(244,63,94,0.12)')
    );
}

function setQuadrantRange(val) {
    quadrantRangeFilter = val;
    renderQuadrantChart(currentQuadrantCode);
}

// ---------------------------------------------------------------------
// Modal détail d'un actif
// ---------------------------------------------------------------------
function openAssetDetailModal(id) {
    const asset = assets.find(a => a.id === id);
    if (!asset) return;

    currentAssetDetailId = id;
    assetDetailRangeFilter = 'ALL';

    document.getElementById('modal-asset-icon').innerText     = (asset.ticker || '--').slice(0, 4);
    document.getElementById('modal-asset-title').innerText    = asset.name;
    document.getElementById('modal-asset-subtitle').innerText = `${asset.ticker} • ${asset.category}`;
    document.getElementById('modal-asset-cadran-select-wrap').innerHTML = cadranSelectHTML(asset.id, asset.cadran || 'HORS_GAVE');

    renderAssetDetailChart(id);
    document.getElementById('modal-asset-detail').classList.remove('hidden');
}

function renderAssetDetailChart(id) {
    const asset = assets.find(a => a.id === id);
    if (!asset) return;

    document.getElementById('asset-detail-range-container').innerHTML =
        rangeSelectHTML('asset-detail-range-select', assetDetailRangeFilter, getAvailableYears([asset]), 'setAssetDetailRange');

    if (assetHistoryChartInstance) assetHistoryChartInstance.destroy();
    const tl = filterTimelineByRange(buildPortfolioTimeline([asset]), assetDetailRangeFilter);
    assetHistoryChartInstance = createChart(
        'assetHistoryChart',
        buildHistoryChartConfig(tl, '#10b981', 'rgba(16,185,129,0.15)')
    );
}

function setAssetDetailRange(val) {
    assetDetailRangeFilter = val;
    renderAssetDetailChart(currentAssetDetailId);
}

// =====================================================================
// COMPARATEUR DE SEGMENTS
// Un actif peut appartenir à plusieurs segments à la fois
// (ex: un ETF Or est à la fois dans "ETF", dans le Cadran OR et
// dans "4 Cadrans de Gave").
// =====================================================================

function getSegmentGroups() {
    return [
        { code: 'ACTIONS',        label: 'Actions' },
        { code: 'ETF',            label: 'ETF' },
        { code: 'OBLIGATIONS',    label: 'Obligations' },
        { code: 'CADRAN_OR',      label: cadranLabel('OR') },
        { code: 'CADRAN_MONNAIES',label: cadranLabel('MONNAIES') },
        { code: 'CADRAN_PETROLE', label: cadranLabel('PETROLE') },
        { code: 'CADRAN_ASIE',    label: cadranLabel('ASIE') },
        { code: 'GAVE_ALL',       label: '4 Cadrans de Gave (tous)' },
        { code: 'HORS_GAVE',      label: 'Hors-Cadran & Divers' },
        { code: 'CRYPTO',         label: 'Cryptomonnaies' }
    ].concat(assets.map(a => ({ code: 'ASSET_' + a.id, label: '📄 ' + a.name })));
}

function assetsForSegment(code) {
    if (code.startsWith('ASSET_')) {
        const id = parseFloat(code.slice(6));
        const a = assets.find(x => x.id === id);
        return a ? [a] : [];
    }
    switch (code) {
        case 'ACTIONS':         return assets.filter(a => hasTag(a, 'Action'));
        case 'ETF':             return assets.filter(a => hasTag(a, 'ETF'));
        case 'OBLIGATIONS':     return assets.filter(a => hasTag(a, 'Obligation'));
        case 'CADRAN_OR':       return assets.filter(a => a.cadran === 'OR');
        case 'CADRAN_MONNAIES': return assets.filter(a => a.cadran === 'MONNAIES');
        case 'CADRAN_PETROLE':  return assets.filter(a => a.cadran === 'PETROLE');
        case 'CADRAN_ASIE':     return assets.filter(a => a.cadran === 'ASIE');
        case 'GAVE_ALL':        return assets.filter(a => GAVE_QUADRANTS.includes(a.cadran));
        case 'HORS_GAVE':       return assets.filter(a => a.cadran === 'HORS_GAVE');
        case 'CRYPTO':          return assets.filter(a => hasTag(a, 'Crypto'));
        default: return [];
    }
}

// Ouvre le comparateur directement sur un actif précis (bouton "Comparer" de l'inventaire).
// Segment A = l'actif cliqué ; Segment B reste au choix de l'utilisateur.
function openAssetCompare(assetId) {
    switchTab('tab-dashboard');
    if (!compareActive) toggleCompareMode();
    document.getElementById('compare-select-a').value = 'ASSET_' + assetId;
    setCompareSegment('A', 'ASSET_' + assetId);
    const section = document.getElementById('compare-section');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function toggleCompareMode() {
    compareActive = !compareActive;
    const btn = document.getElementById('compare-toggle-btn');
    document.getElementById('compare-controls').classList.toggle('hidden', !compareActive);
    document.getElementById('compare-panels').classList.toggle('hidden', !compareActive);
    btn.innerHTML = compareActive
        ? '<i class="fa-solid fa-xmark"></i> Fermer la comparaison'
        : '<i class="fa-solid fa-code-compare"></i> Activer la comparaison';

    if (compareActive) {
        const groups = getSegmentGroups();
        const optsHTML = groups.map(g => `<option value="${g.code}">${g.label}</option>`).join('');
        const selA = document.getElementById('compare-select-a');
        const selB = document.getElementById('compare-select-b');
        selA.innerHTML = `<option value="">-- Choisir --</option>${optsHTML}`;
        selB.innerHTML = `<option value="">-- Choisir --</option>${optsHTML}`;
        selA.value = compareSegmentA;
        selB.value = compareSegmentB;
        if (compareSegmentA) renderComparePanel('A');
        if (compareSegmentB) renderComparePanel('B');
    }
}

function setCompareSegment(side, code) {
    if (side === 'A') { compareSegmentA = code; compareRangeA = 'ALL'; }
    else              { compareSegmentB = code; compareRangeB = 'ALL'; }
    renderComparePanel(side);
}

function setCompareRange(side, val) {
    if (side === 'A') compareRangeA = val; else compareRangeB = val;
    renderComparePanel(side);
}

// Wrappers dédiés car rangeSelectHTML appelle la fonction par son nom global
function setCompareRangeA(val) { setCompareRange('A', val); }
function setCompareRangeB(val) { setCompareRange('B', val); }

function renderComparePanel(side) {
    const code = side === 'A' ? compareSegmentA : compareSegmentB;
    const panel = document.getElementById('compare-panel-' + side);
    const panelsWrap = document.getElementById('compare-panels');

    if (!code) {
        panel.innerHTML = '<div class="text-gray-500 italic text-xs text-center py-8">Choisissez un segment ci-dessus.</div>';
        panelsWrap.classList.remove('hidden');
        return;
    }
    panelsWrap.classList.remove('hidden');

    const groupLabel = (getSegmentGroups().find(g => g.code === code) || {}).label || code;
    const segAssets = assetsForSegment(code);
    const totalValue    = segAssets.reduce((s, a) => s + (a.value || 0), 0);
    const totalInvested = segAssets.reduce((s, a) => s + (a.invested || 0), 0);
    const pnl    = totalValue - totalInvested;
    const isPos  = pnl >= 0;
    const pnlPct = totalInvested > 0 ? (pnl / totalInvested * 100) : 0;
    const range  = side === 'A' ? compareRangeA : compareRangeB;
    const allocCanvasId   = 'compareAllocChart' + side;
    const historyCanvasId = 'compareHistoryChart' + side;
    const rangeContainerId = 'compare-range-' + side;

    panel.innerHTML = `
        <div class="flex justify-between items-start">
            <div>
                <div class="text-[10px] text-gray-500 uppercase">Segment ${side}</div>
                <div class="font-bold text-white text-sm">${groupLabel}</div>
                <div class="text-[10px] text-gray-500">${segAssets.length} actif(s)</div>
            </div>
            <div class="text-right">
                <div class="text-lg font-bold font-mono text-white">${formatEUR(totalValue)}</div>
                <div class="text-[10px] font-mono ${isPos ? 'text-emerald-400' : 'text-rose-400'}">${isPos ? '+' : ''}${formatEUR(pnl)} (${isPos ? '+' : ''}${pnlPct.toFixed(1)}%)</div>
            </div>
        </div>
        ${segAssets.length === 0 ? '<div class="text-gray-500 italic text-xs text-center py-6">Aucun actif dans ce segment.</div>' : `
        <div class="grid grid-cols-2 gap-3">
            <div class="h-32"><canvas id="${allocCanvasId}"></canvas></div>
            <div class="text-[11px] space-y-1 self-center">
                <div class="flex justify-between"><span class="text-gray-500">Investi</span><span class="font-mono text-gray-300">${formatEUR(totalInvested)}</span></div>
                <div class="flex justify-between"><span class="text-gray-500">Frais</span><span class="font-mono text-gray-300">${formatEUR(segAssets.reduce((s, a) => s + (a.frais || 0), 0))}</span></div>
            </div>
        </div>
        <div>
            <div class="flex justify-between items-center mb-1">
                <span class="text-[10px] text-gray-500 uppercase">Évolution</span>
                <div id="${rangeContainerId}"></div>
            </div>
            <div class="h-36"><canvas id="${historyCanvasId}"></canvas></div>
        </div>
        <div id="compare-risk-${side}" class="grid grid-cols-3 gap-2 text-center"></div>
        <div class="max-h-32 overflow-y-auto space-y-1 border-t border-gray-800 pt-2">
            ${segAssets.map(a => `<div class="flex justify-between text-[10px] py-0.5"><span class="text-gray-400 truncate">${a.name}</span><span class="font-mono text-gray-300 whitespace-nowrap ml-2">${formatEUR(a.value)}</span></div>`).join('')}
        </div>
        `}
    `;

    if (segAssets.length === 0) return;

    // Donut de répartition par catégorie au sein du segment
    const catColors = {
        'Or & Métaux': '#f59e0b',
        'Devises/Liquidités': '#3b82f6',
        'Actions/ETF': '#10b981',
        'Obligations': '#14b8a6',
        'Crypto': '#8b5cf6',
        'Matières Premières': '#ef4444',
        'Autre': '#6b7280'
    };
    const catTotals = {};
    segAssets.forEach(a => { catTotals[a.category] = (catTotals[a.category] || 0) + (a.value || 0); });

    if (compareChartAllocInstance[side]) compareChartAllocInstance[side].destroy();
    compareChartAllocInstance[side] = createChart(allocCanvasId, {
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
        options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '65%' }
    });

    // Graphique d'évolution du segment, avec son propre sélecteur de période
    document.getElementById(rangeContainerId).innerHTML = rangeSelectHTML(
        rangeContainerId + '-select',
        range,
        getAvailableYears(segAssets),
        side === 'A' ? 'setCompareRangeA' : 'setCompareRangeB'
    );

    if (compareChartHistoryInstance[side]) compareChartHistoryInstance[side].destroy();
    const tl = filterTimelineByRange(buildPortfolioTimeline(segAssets), range);
    compareChartHistoryInstance[side] = createChart(
        historyCanvasId,
        buildHistoryChartConfig(
            tl,
            side === 'A' ? '#818cf8' : '#f472b6',
            side === 'A' ? 'rgba(129,140,248,0.15)' : 'rgba(244,114,182,0.15)'
        )
    );

    // Mini indicateurs de risque du segment
    const rm = computeRiskMetricsFromAssets(segAssets);
    const riskEl = document.getElementById('compare-risk-' + side);
    if (!rm) {
        riskEl.innerHTML = '<div class="col-span-3 text-[10px] text-gray-600 italic">Historique insuffisant pour les ratios de risque.</div>';
    } else {
        riskEl.innerHTML = `
            <div><div class="text-[9px] text-gray-500 uppercase">Volatilité</div><div class="text-xs font-bold font-mono text-amber-400">${(rm.volatility * 100).toFixed(1)}%</div></div>
            <div><div class="text-[9px] text-gray-500 uppercase">Sharpe</div><div class="text-xs font-bold font-mono text-emerald-400">${rm.sharpe.toFixed(2)}</div></div>
            <div><div class="text-[9px] text-gray-500 uppercase">Max DD</div><div class="text-xs font-bold font-mono text-rose-400">-${(rm.maxdrawdown * 100).toFixed(1)}%</div></div>
        `;
    }
}

// =====================================================================
// MODAL D'EXPLICATION D'UN RATIO DE RISQUE
// Contenu pédagogique : définition, formule, interprétation personnalisée
// =====================================================================

const RISK_METRIC_INFO = {
    volatility: {
        title: 'Volatilité Estimée', icon: 'fa-solid fa-chart-line', color: 'text-amber-400',
        definition: "La volatilité mesure l'ampleur des variations de la valeur de votre portefeuille dans le temps (écart-type des rendements, annualisé). Plus elle est élevée, plus les hauts et les bas sont marqués.",
        formula: 'σ_annuel = écart-type(rendements périodiques) × √(nb de périodes par an)',
        interpret: (m) => {
            const v = m.volatility * 100;
            const niveau = v < 10 ? "faible (profil prudent)" : v < 20 ? "modérée (profil équilibré)" : v < 35 ? "élevée (profil dynamique)" : "très élevée (profil très offensif ou concentré)";
            return `Votre volatilité annualisée est de ${v.toFixed(1)}%, ce qui correspond à un niveau ${niveau}. Une volatilité élevée n'est ni bonne ni mauvaise en soi : c'est le prix à payer pour viser un rendement supérieur, à condition que votre horizon de placement et votre tolérance psychologique aux baisses temporaires le permettent.`;
        }
    },
    sharpe: {
        title: 'Ratio de Sharpe', icon: 'fa-solid fa-scale-balanced', color: 'text-emerald-400',
        definition: "Le ratio de Sharpe mesure le rendement excédentaire (au-dessus du taux sans risque) obtenu par unité de risque total pris (volatilité). Il pénalise à la fois les variations à la hausse et à la baisse.",
        formula: 'Sharpe = (Rendement annualisé − Taux sans risque) / Volatilité annualisée',
        interpret: (m) => {
            const s = m.sharpe;
            const niveau = s < 0 ? "négatif : le portefeuille a sous-performé le taux sans risque compte tenu du risque pris" : s < 0.5 ? "faible" : s < 1 ? "correct" : s < 2 ? "bon" : "excellent";
            return `Votre Sharpe est de ${s.toFixed(2)}, un niveau ${niveau}. En règle générale, un Sharpe supérieur à 1 est considéré comme bon, et supérieur à 2 comme très bon. Il ne pénalise pas seulement les baisses : une forte hausse ponctuelle peut aussi le faire baisser, d'où l'intérêt de le compléter avec le ratio de Sortino ci-dessous.`;
        }
    },
    beta: {
        title: 'Bêta Portefeuille', icon: 'fa-solid fa-diagram-project', color: 'text-blue-400',
        definition: "Le Bêta mesure la sensibilité de votre portefeuille aux mouvements globaux du marché actions (benchmark). Un Bêta de 1 signifie une sensibilité égale au marché ; supérieur à 1, plus sensible (amplifie les mouvements) ; inférieur à 1, moins sensible.",
        formula: 'β = (σ_portefeuille / σ_benchmark) × corrélation(portefeuille, benchmark)',
        interpret: (m) => {
            const b = m.beta;
            const niveau = b < 0.7 ? "défensif (moins sensible que le marché)" : b < 1.3 ? "proche du marché" : "offensif (amplifie les mouvements du marché)";
            return `Avec un Bêta estimé à ${b.toFixed(2)}, votre portefeuille a un profil ${niveau}. * Ce chiffre est une estimation : faute de cours de marché réellement importés pour chaque actif, une corrélation de ${(m.assumedCorrelation * 100).toFixed(0)}% avec un indice actions hypothétique est supposée. Il reste indicatif.`;
        }
    },
    alpha: {
        title: 'Alpha de Jensen', icon: 'fa-solid fa-star', color: 'text-white',
        definition: "L'Alpha mesure la performance générée au-delà de ce que le modèle CAPM prédirait compte tenu du risque de marché pris (Bêta). Un Alpha positif suggère une surperformance ajustée du risque systématique.",
        formula: 'α = Rendement annualisé − [Taux sans risque + β × (Rendement benchmark − Taux sans risque)]',
        interpret: (m) => {
            const a = m.alpha * 100;
            const txt = a >= 0 ? `une surperformance ajustée du risque de +${a.toFixed(2)}%` : `une sous-performance ajustée du risque de ${a.toFixed(2)}%`;
            return `Votre Alpha estimé traduit ${txt} par rapport à ce qu'un portefeuille exposé au même risque de marché (même Bêta) aurait dû produire. * Comme pour le Bêta, ce chiffre dépend de l'hypothèse de corrélation au marché et doit être lu avec prudence.`;
        }
    },
    sortino: {
        title: 'Ratio de Sortino', icon: 'fa-solid fa-arrow-trend-down', color: 'text-emerald-400',
        definition: "Alternative au Sharpe, le ratio de Sortino ne pénalise que la volatilité \"baissière\" (les rendements inférieurs au taux sans risque), pas la volatilité haussière. Pour un portefeuille dynamique, les fortes hausses sont une bonne nouvelle : le Sortino en tient compte.",
        formula: 'Sortino = (Rendement annualisé − Taux sans risque) / Écart-type des rendements négatifs uniquement',
        interpret: (m) => {
            const s = m.sortino, sh = m.sharpe;
            const comp = s > sh ? "supérieur à votre Sharpe, ce qui confirme qu'une bonne partie de votre volatilité est \"positive\" (des hausses fortes plutôt que des baisses)" : "proche de votre Sharpe, ce qui suggère que votre volatilité est répartie de façon assez symétrique entre hausses et baisses";
            return `Votre Sortino est de ${s.toFixed(2)}, ${comp}. C'est souvent l'indicateur le plus pertinent pour juger un portefeuille dynamique, car il reflète mieux le "vrai" risque : celui de perdre de l'argent.`;
        }
    },
    maxdrawdown: {
        title: 'Maximum Drawdown', icon: 'fa-solid fa-arrow-down-long', color: 'text-rose-400',
        definition: "Le Maximum Drawdown est la plus forte baisse enregistrée entre un sommet (pic de valeur) et le creux suivant, avant qu'un nouveau sommet ne soit atteint. C'est une mesure directe de la pire chute traversée par votre portefeuille sur la période observée.",
        formula: 'Max Drawdown = max[(Pic − Creux) / Pic] sur toute la période',
        interpret: (m) => {
            const dd = m.maxdrawdown * 100;
            const niveau = dd < 10 ? "contenue" : dd < 25 ? "notable" : dd < 40 ? "sévère" : "très sévère";
            return `La pire chute enregistrée sur votre historique est de -${dd.toFixed(1)}%, une baisse ${niveau}. C'est un bon test de votre tolérance psychologique : demandez-vous si vous auriez gardé votre stratégie (ou paniqué et vendu) si votre portefeuille perdait à nouveau ${dd.toFixed(0)}% de sa valeur.`;
        }
    },
    trackingerror: {
        title: 'Tracking Error', icon: 'fa-solid fa-route', color: 'text-amber-400',
        definition: "La Tracking Error mesure l'écart-type de la différence de performance entre votre portefeuille et son benchmark. Une Tracking Error élevée signifie que votre portefeuille s'écarte fortement et durablement de l'indice de référence (dans un sens comme dans l'autre).",
        formula: 'TE = √[σ_portefeuille² + σ_benchmark² − 2 × corrélation × σ_portefeuille × σ_benchmark]',
        interpret: (m) => {
            const te = m.trackingerror * 100;
            const niveau = te < 5 ? "faible : votre portefeuille suit d'assez près le benchmark" : te < 15 ? "modérée" : "élevée : votre allocation s'écarte fortement d'une gestion indicielle classique";
            return `Votre Tracking Error estimée est de ${te.toFixed(1)}%, un niveau ${niveau}. * Cette estimation dérive de la corrélation supposée avec le benchmark, faute de cours réellement importés pour le comparer ligne à ligne.`;
        }
    },
    informationratio: {
        title: "Ratio d'Information", icon: 'fa-solid fa-magnifying-glass-chart', color: 'text-blue-400',
        definition: "Le Ratio d'Information rapporte votre surperformance (ou sous-performance) par rapport au benchmark à la Tracking Error. Il indique si l'écart de performance provient de paris maîtrisés et réguliers, ou de mouvements erratiques et risqués.",
        formula: 'IR = (Rendement annualisé − Rendement benchmark) / Tracking Error',
        interpret: (m) => {
            const ir = m.informationratio;
            const niveau = ir < 0 ? "négatif : la performance est en retrait par rapport au risque d'écart pris" : ir < 0.4 ? "faible" : ir < 0.7 ? "correct" : "bon";
            return `Votre Ratio d'Information est de ${ir.toFixed(2)}, un niveau ${niveau}. Un ratio positif et élevé suggère que votre écart au benchmark (votre Alpha) est le fruit d'une gestion cohérente plutôt que du hasard ou de paris erratiques. * Estimation basée sur les mêmes hypothèses que le Bêta.`;
        }
    },
    treynor: {
        title: 'Ratio de Treynor', icon: 'fa-solid fa-crosshairs', color: 'text-emerald-400',
        definition: "Similaire au Sharpe, le ratio de Treynor rapporte la performance excédentaire non pas à la volatilité totale, mais au Bêta (le risque systématique, non-diversifiable). Il répond à la question : le rendement compense-t-il bien votre exposition au marché ?",
        formula: 'Treynor = (Rendement annualisé − Taux sans risque) / Bêta',
        interpret: (m) => {
            const t = m.treynor * 100;
            return `Votre ratio de Treynor est de ${t >= 0 ? '+' : ''}${t.toFixed(2)}%. Il se compare surtout à celui d'autres portefeuilles ou du marché lui-même (rendement du marché moins taux sans risque, ici ${((m.benchReturn - m.riskFree) * 100).toFixed(1)}%) : un Treynor supérieur à ce chiffre indique que vous êtes mieux rémunéré que le marché pour le risque systématique pris. * Basé sur le Bêta estimé.`;
        }
    },
    var95: {
        title: 'Value at Risk (95%, 1 mois)', icon: 'fa-solid fa-triangle-exclamation', color: 'text-rose-400',
        definition: "La VaR estime la perte maximale que votre portefeuille pourrait subir sur un horizon donné (ici 1 mois), avec un niveau de confiance de 95% dans des conditions de marché normales. Concrètement : il y a statistiquement 5% de chances de perdre davantage que ce montant sur le mois.",
        formula: 'VaR 95% (1 mois) = 1,645 × σ_mensuelle − rendement moyen mensuel (loi normale)',
        interpret: (m) => {
            const pct = m.var95Pct * 100;
            return `Dans des conditions de marché normales, il y a 5% de chances que votre portefeuille perde plus de ${pct.toFixed(1)}% (soit environ ${formatEUR(m.var95Amount)}) au cours du mois à venir. Ce chiffre est une estimation statistique paramétrique : les crises de marché réelles produisent souvent des pertes plus importantes que ne le prédit une loi normale ("risque de queue épaisse").`;
        }
    },
    decomposition: {
        title: 'Décomposition du Risque : Systématique vs Spécifique', icon: 'fa-solid fa-chart-pie', color: 'text-blue-400',
        definition: "Le risque total de votre portefeuille se décompose en deux parts : le risque systématique (lié aux mouvements généraux du marché, qu'aucune diversification ne peut éliminer) et le risque spécifique (propre aux actifs que vous détenez — une mauvaise nouvelle sur un titre précis, un secteur, une zone géographique — réductible en diversifiant davantage).",
        formula: 'Risque systématique (%) = corrélation² (= R²) · Risque spécifique (%) = 1 − corrélation²',
        interpret: (m) => {
            const sys  = (m.systematicRiskPct * 100).toFixed(0);
            const spec = (m.specificRiskPct * 100).toFixed(0);
            return `Environ ${sys}% de la variance de votre portefeuille serait expliquée par les mouvements généraux du marché, et ${spec}% par des facteurs propres à vos actifs (concentration sectorielle, géographique, ou sur un nombre restreint de lignes). Un risque spécifique élevé indique qu'une diversification plus large pourrait réduire le risque total sans sacrifier le rendement attendu. * Basé sur la corrélation supposée (0,7) avec le marché, faute de série de cours réellement appariée.`;
        }
    }
};

function openRiskMetricModal(key) {
    const info = RISK_METRIC_INFO[key];
    if (!info || !lastRiskMetrics || Object.keys(lastRiskMetrics).length === 0) {
        alert('Historique insuffisant pour calculer ce ratio (au moins 3 points de valorisation sont nécessaires).');
        return;
    }
    document.getElementById('risk-modal-title').innerHTML =
        `<i class="${info.icon} ${info.color}"></i> ${info.title}`;

    const statEl = document.getElementById('risk-stat-' + key);
    document.getElementById('risk-modal-value').innerHTML = statEl
        ? `<span class="${info.color}">${statEl.innerText}</span>`
        : `<span class="text-blue-400">${(lastRiskMetrics.systematicRiskPct * 100).toFixed(0)}%</span> <span class="text-gray-500 text-base">/</span> <span class="text-amber-400">${(lastRiskMetrics.specificRiskPct * 100).toFixed(0)}%</span>`;

    document.getElementById('risk-modal-definition').innerText      = info.definition;
    document.getElementById('risk-modal-formula').innerText         = info.formula;
    document.getElementById('risk-modal-interpretation').innerText = info.interpret(lastRiskMetrics);

    document.getElementById('modal-risk-metric').classList.remove('hidden');
}