// =====================================================================
// app36-waterfall.js — WATERFALL DU P&L (Chantier §7)
// Dépend de : app1-core.js (Chart.js déjà chargé globalement)
// Charge après app35-dca.js, avant tests.js
// =====================================================================
//
// Affiche un diagramme en cascade (« waterfall ») qui décompose le P&L
// latent total du portefeuille par actif :
//
//   ┌─ Base 0 €
//   ├─ +1 200 € (BTC)     ← barre verte
//   ├─ +  800 € (OR)      ← barre verte
//   ├─ +  500 € (CW8)     ← barre verte
//   ├─ −  200 € (TTE)     ← barre rouge
//   ├─ −  100 € (AAPL)    ← barre rouge
//   └─ Total +2 200 €     ← barre pleine (bleue ou grise)
//
// Technique Chart.js :
//   Chaque barre a `data: [[start, end]]` (floating bar) pour « flotter »
//   entre le cumul précédent et le cumul après ajout.
//   La dernière barre (Total) part de 0 et va jusqu'au P&L total.
//
// Filtres intégrés :
//   • Affiche les 6 premiers contributeurs + le reste regroupé « Autres »
//   • Tri par valeur absolue décroissante (les impacts les plus visibles)
//   • Clic sur une barre → ouvre le détail de l'actif (via Chart onClick)

const WATERFALL_TOP_N = 6;   // Nombre d'actifs affichés individuellement

let _waterfallChartInstance = null;
let _waterfallCurrentData = null;   // cache pour le onclick

// ---------------------------------------------------------------------
// CALCUL DES DONNÉES
// ---------------------------------------------------------------------
// Retourne {
//   items: [
//     { kind: 'delta', label, ticker, assetId, delta, start, end, isPos },
//     ...
//     { kind: 'other', label: 'Autres (N)', delta, start, end, isPos },
//     { kind: 'total', label: 'Total', delta: totalPnl, start: 0, end: totalPnl, isPos }
//   ],
//   totalPnl, positionsCount, includedCount
// }
function computeWaterfallData() {
    const realAssets = assets.filter(a => !isPaperAsset(a));

    // 1) Calcule le delta P&L de chaque actif
    const deltas = realAssets.map(a => ({
        assetId: a.id,
        name: a.name,
        ticker: a.ticker || '—',
        delta: (a.value || 0) - (a.invested || 0)
    }));

    if (!deltas.length) {
        return { items: [], totalPnl: 0, positionsCount: 0, includedCount: 0 };
    }

    // 2) Trie par |delta| décroissant (plus gros impacts d'abord)
    deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    const totalPnl = deltas.reduce((s, d) => s + d.delta, 0);

    // 3) Sépare top N et « Autres »
    const top = deltas.slice(0, WATERFALL_TOP_N);
    const rest = deltas.slice(WATERFALL_TOP_N);

    // 4) Construit les items du waterfall avec cumul
    const items = [];
    let cumul = 0;

    top.forEach(d => {
        const start = cumul;
        cumul += d.delta;
        items.push({
            kind: 'delta',
            label: d.ticker,
            name: d.name,
            assetId: d.assetId,
            delta: d.delta,
            start,
            end: cumul,
            isPos: d.delta >= 0
        });
    });

    // Regroupe le reste (si > 0)
    if (rest.length > 0) {
        const otherDelta = rest.reduce((s, d) => s + d.delta, 0);
        const start = cumul;
        cumul += otherDelta;
        items.push({
            kind: 'other',
            label: `Autres (${rest.length})`,
            name: 'Autres actifs',
            assetId: null,
            delta: otherDelta,
            start,
            end: cumul,
            isPos: otherDelta >= 0,
            childCount: rest.length
        });
    }

    // Barre finale (Total)
    items.push({
        kind: 'total',
        label: 'Total',
        name: 'P&L total',
        assetId: null,
        delta: totalPnl,
        start: 0,
        end: totalPnl,
        isPos: totalPnl >= 0
    });

    return {
        items,
        totalPnl,
        positionsCount: realAssets.length,
        includedCount: top.length + (rest.length ? 1 : 0) + 1
    };
}

// ---------------------------------------------------------------------
// RENDU — Chart.js bar chart à barres flottantes
// ---------------------------------------------------------------------
function renderWaterfallChart() {
    const canvas = document.getElementById('waterfallChart');
    if (!canvas) return;

    const data = computeWaterfallData();
    _waterfallCurrentData = data;

    // État vide
    const emptyEl = document.getElementById('waterfall-empty');
    if (emptyEl) emptyEl.classList.toggle('hidden', data.items.length > 0);

    // KPI récapitulatif
    _renderWaterfallKpis(data);

    if (!data.items.length) {
        if (_waterfallChartInstance) {
            _waterfallChartInstance.destroy();
            _waterfallChartInstance = null;
        }
        return;
    }

    // --- Labels et datasets ---
    const labels = data.items.map(it => it.label);

    // Chart.js floating bar : [start, end] sur l'axe Y
    const floatingData = data.items.map(it => [it.start, it.end]);

    // Couleur de chaque barre
    const colors = data.items.map(it => {
        if (it.kind === 'total') return it.isPos ? 'rgba(59, 130, 246, 0.75)' : 'rgba(239, 68, 68, 0.85)';
        if (it.kind === 'other') return it.isPos ? 'rgba(16, 185, 129, 0.55)' : 'rgba(244, 63, 94, 0.55)';
        return it.isPos ? 'rgba(16, 185, 129, 0.80)' : 'rgba(244, 63, 94, 0.80)';
    });

    // Bordures : plus foncées pour la barre Total
    const borderColors = data.items.map(it => {
        if (it.kind === 'total') return it.isPos ? '#3b82f6' : '#ef4444';
        return 'transparent';
    });

    const borderWidths = data.items.map(it => it.kind === 'total' ? 2 : 0);

    if (_waterfallChartInstance) _waterfallChartInstance.destroy();
    _waterfallChartInstance = createChart('waterfallChart', {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'P&L cumulé (€)',
                data: floatingData,
                backgroundColor: colors,
                borderColor: borderColors,
                borderWidth: borderWidths,
                borderRadius: 4
            }]
        },
        options: {
            maintainAspectRatio: false,
            onClick: (evt, elements) => {
                if (!elements || !elements.length) return;
                const idx = elements[0].index;
                const it = _waterfallCurrentData.items[idx];
                if (!it) return;

                // Clic sur une barre d'actif → détail de l'actif
                if (it.kind === 'delta' && it.assetId !== null) {
                    openAssetDetailModal(it.assetId);
                    return;
                }
                // Clic sur la barre "Autres" → ouvre un récap détaillé des autres
                if (it.kind === 'other') {
                    _openWaterfallOthersModal();
                    return;
                }
                // Clic sur "Total" → ouvre un récap complet des contributions
                if (it.kind === 'total') {
                    _openWaterfallTotalModal();
                    return;
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (ctx) => {
                            const it = _waterfallCurrentData.items[ctx[0].dataIndex];
                            if (!it) return '';
                            return it.kind === 'total'
                                ? 'P&L total'
                                : (it.name || it.label);
                        },
                        label: (ctx) => {
                            const it = _waterfallCurrentData.items[ctx.dataIndex];
                            if (!it) return '';
                            const sign = it.delta >= 0 ? '+' : '';
                            const deltaTxt = `${sign}${formatEUR(it.delta)}`;
                            if (it.kind === 'total') {
                                return `Total : ${deltaTxt}`;
                            }
                            return [
                                `Contribution : ${deltaTxt}`,
                                `Cumul après : ${formatEUR(it.end)}`
                            ];
                        },
                        footer: (ctx) => {
                            const it = _waterfallCurrentData.items[ctx[0].dataIndex];
                            if (!it) return '';
                            if (it.kind === 'delta') return 'Cliquez pour voir le détail';
                            if (it.kind === 'other') return `${it.childCount} actif(s) regroupés`;
                            return '';
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: _chartTickColor(),
                        font: { size: 10 },
                        maxRotation: 0,
                        autoSkip: false
                    },
                    grid: { display: false }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: _chartTickColor(),
                        font: { size: 10 },
                        callback: (v) => {
                            if (Math.abs(v) >= 1000) return (v / 1000).toFixed(0) + ' k€';
                            return v + ' €';
                        }
                    },
                    grid: { color: _chartGridColor() }
                }
            }
        }
    });
}

// ---------------------------------------------------------------------
// KPI récapitulatif
// ---------------------------------------------------------------------
function _renderWaterfallKpis(data) {
    const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };

    // Total P&L
    const totalEl = document.getElementById('waterfall-stat-total');
    if (totalEl) {
        totalEl.innerText = (data.totalPnl >= 0 ? '+' : '') + formatEUR(data.totalPnl);
        totalEl.className = `text-lg font-bold font-mono ${data.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }

    // Nombre de contributeurs positifs / négatifs
    const positiveCount = data.items.filter(it => it.kind === 'delta' && it.isPos).length;
    const negativeCount = data.items.filter(it => it.kind === 'delta' && !it.isPos).length;
    setText('waterfall-stat-positive', positiveCount);
    setText('waterfall-stat-negative', negativeCount);

    // Nombre de positions totales
    setText('waterfall-stat-count', data.positionsCount + ' actif(s)');

    // Meilleur contributeur
    const bestDelta = data.items
        .filter(it => it.kind === 'delta')
        .reduce((best, it) => (!best || it.delta > best.delta) ? it : best, null);
    const bestEl = document.getElementById('waterfall-stat-best');
    if (bestEl && bestDelta) {
        bestEl.innerText = (bestDelta.delta >= 0 ? '+' : '') + formatEUR(bestDelta.delta);
        bestEl.className = `font-mono font-bold ${bestDelta.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
        const detail = document.getElementById('waterfall-stat-best-label');
        if (detail) detail.innerText = bestDelta.label;
    }

    // Pire contributeur
    const worstDelta = data.items
        .filter(it => it.kind === 'delta')
        .reduce((worst, it) => (!worst || it.delta < worst.delta) ? it : worst, null);
    const worstEl = document.getElementById('waterfall-stat-worst');
    if (worstEl && worstDelta) {
        worstEl.innerText = (worstDelta.delta >= 0 ? '+' : '') + formatEUR(worstDelta.delta);
        worstEl.className = `font-mono font-bold ${worstDelta.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
        const detail = document.getElementById('waterfall-stat-worst-label');
        if (detail) detail.innerText = worstDelta.label;
    }
}

// ---------------------------------------------------------------------
// RENDU GLOBAL
// ---------------------------------------------------------------------
function renderWaterfallSection() {
    renderWaterfallChart();
}

// ---------------------------------------------------------------------
// MODAL — Récap des "Autres" contributeurs
// ---------------------------------------------------------------------
function _openWaterfallOthersModal() {
    const realAssets = assets.filter(a => !isPaperAsset(a));
    const deltas = realAssets
        .map(a => ({
            assetId: a.id,
            name: a.name,
            ticker: a.ticker || '—',
            delta: (a.value || 0) - (a.invested || 0)
        }))
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    // Reproduit la logique de computeWaterfallData pour identifier "Autres"
    const others = deltas.slice(WATERFALL_TOP_N);
    if (!others.length) return;

    // Crée un modal à la volée (pas de HTML statique nécessaire)
    let modal = document.getElementById('modal-waterfall-others');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-waterfall-others';
        modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60] hidden';
        document.body.appendChild(modal);
    }

    const totalOthers = others.reduce((s, d) => s + d.delta, 0);
    const totalCls = totalOthers >= 0 ? 'text-emerald-400' : 'text-rose-400';

    modal.innerHTML = `
        <div class="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div class="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-950">
                <h3 class="font-bold text-white text-sm flex items-center gap-2">
                    <i class="fa-solid fa-chart-column text-cyan-400"></i> Contributeurs regroupés (${others.length})
                </h3>
                <button onclick="closeModal('modal-waterfall-others')" class="text-gray-400 hover:text-white"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="p-4 overflow-y-auto text-xs">
                <div class="bg-gray-950 border border-gray-800 rounded-lg p-3 mb-3 flex justify-between items-center">
                    <span class="text-gray-400 font-bold">Total regroupé :</span>
                    <span class="font-mono font-bold text-lg ${totalCls}">${totalOthers >= 0 ? '+' : ''}${formatEUR(totalOthers)}</span>
                </div>
                <div class="space-y-1.5">
                    ${others.map(d => `
                        <div class="flex items-center justify-between gap-2 bg-gray-950 border border-gray-800 rounded-lg p-2 cursor-pointer hover:border-gray-700 transition" onclick="closeModal('modal-waterfall-others'); openAssetDetailModal(${d.assetId});">
                            <div class="min-w-0 flex-1">
                                <div class="font-bold text-white text-[11px] truncate">${escapeHTML(d.name)}</div>
                                <div class="text-[10px] text-gray-500 font-mono">${escapeHTML(d.ticker)}</div>
                            </div>
                            <div class="font-mono font-bold text-[11px] ${d.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
                                ${d.delta >= 0 ? '+' : ''}${formatEUR(d.delta)}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    modal.classList.remove('hidden');
}

// ---------------------------------------------------------------------
// MODAL — Récap complet des contributions
// ---------------------------------------------------------------------
function _openWaterfallTotalModal() {
    const realAssets = assets.filter(a => !isPaperAsset(a));
    const deltas = realAssets
        .map(a => ({
            assetId: a.id,
            name: a.name,
            ticker: a.ticker || '—',
            delta: (a.value || 0) - (a.invested || 0)
        }))
        .sort((a, b) => b.delta - a.delta);   // Tri par valeur décroissante (positifs d'abord)

    if (!deltas.length) return;

    const totalPnl = deltas.reduce((s, d) => s + d.delta, 0);
    const totalCls = totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400';
    const positives = deltas.filter(d => d.delta >= 0);
    const negatives = deltas.filter(d => d.delta < 0);

    let modal = document.getElementById('modal-waterfall-total');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-waterfall-total';
        modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60] hidden';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div class="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-950">
                <h3 class="font-bold text-white text-sm flex items-center gap-2">
                    <i class="fa-solid fa-list-check text-cyan-400"></i> Décomposition complète du P&L
                </h3>
                <button onclick="closeModal('modal-waterfall-total')" class="text-gray-400 hover:text-white"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="p-4 overflow-y-auto text-xs space-y-4">
                <div class="bg-gradient-to-br from-cyan-950/40 to-blue-950/30 border border-cyan-800/50 rounded-xl p-4 flex justify-between items-center">
                    <span class="text-sm font-bold text-cyan-200">P&L Total :</span>
                    <span class="font-mono font-bold text-2xl ${totalCls}">${totalPnl >= 0 ? '+' : ''}${formatEUR(totalPnl)}</span>
                </div>

                ${positives.length ? `
                <div>
                    <div class="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <i class="fa-solid fa-arrow-up text-[10px]"></i> Contributeurs positifs (${positives.length})
                    </div>
                    <div class="space-y-1">
                        ${positives.map(d => `
                            <div class="flex items-center justify-between gap-2 bg-gray-950 border border-emerald-900/30 rounded-lg p-2 cursor-pointer hover:border-emerald-700/60 transition" onclick="closeModal('modal-waterfall-total'); openAssetDetailModal(${d.assetId});">
                                <div class="min-w-0 flex-1">
                                    <div class="font-bold text-white text-[11px] truncate">${escapeHTML(d.name)}</div>
                                    <div class="text-[10px] text-gray-500 font-mono">${escapeHTML(d.ticker)}</div>
                                </div>
                                <div class="font-mono font-bold text-[11px] text-emerald-400">+${formatEUR(d.delta)}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}

                ${negatives.length ? `
                <div>
                    <div class="text-[11px] font-bold text-rose-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <i class="fa-solid fa-arrow-down text-[10px]"></i> Contributeurs négatifs (${negatives.length})
                    </div>
                    <div class="space-y-1">
                        ${negatives.map(d => `
                            <div class="flex items-center justify-between gap-2 bg-gray-950 border border-rose-900/30 rounded-lg p-2 cursor-pointer hover:border-rose-700/60 transition" onclick="closeModal('modal-waterfall-total'); openAssetDetailModal(${d.assetId});">
                                <div class="min-w-0 flex-1">
                                    <div class="font-bold text-white text-[11px] truncate">${escapeHTML(d.name)}</div>
                                    <div class="text-[10px] text-gray-500 font-mono">${escapeHTML(d.ticker)}</div>
                                </div>
                                <div class="font-mono font-bold text-[11px] text-rose-400">${formatEUR(d.delta)}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
            </div>
        </div>
    `;
    modal.classList.remove('hidden');
}

// ---------------------------------------------------------------------
// INITIALISATION
// ---------------------------------------------------------------------
function initWaterfallModule() {
    console.info('[Waterfall] Module chargé — décomposition du P&L prête.');
}

// Expose l'API globalement
window.computeWaterfallData        = computeWaterfallData;
window.renderWaterfallSection      = renderWaterfallSection;
window.initWaterfallModule         = initWaterfallModule;
window._openWaterfallOthersModal   = _openWaterfallOthersModal;
window._openWaterfallTotalModal    = _openWaterfallTotalModal;