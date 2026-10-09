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
            plugins: { legend: { labels: { color: _chartLegendColor() } } },
            scales: {
                x: { ticks: { color: _chartTickColor() }, grid: { color: _chartGridColor() } },
                y: { grace: '10%', ticks: { color: _chartTickColor() }, grid: { color: _chartGridColor() } },
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
    if (dashboardAllocChartInstance)   { dashboardAllocChartInstance.destroy(); dashboardAllocChartInstance = null; }
    if (dashboardHistoryChartInstance) { dashboardHistoryChartInstance.destroy(); dashboardHistoryChartInstance = null; }

    // 1) Répartition : donut ou treemap selon le mode courant
    updateDashboardAllocToggleUI();
    if (dashboardAllocView === 'treemap') {
        // Léger différé : laisse le navigateur reflow après le changement de col-span
        setTimeout(() => renderDashboardTreemap(), 30);
    } else {
        renderDashboardDonut();
    }

    // 2) Trajectoire patrimoniale (toujours rendue)
    document.getElementById('dashboard-range-container').innerHTML =
        rangeSelectHTML('dashboard-range-select', dashboardRangeFilter, getAvailableYears(), 'setDashboardRange');

    const tl = filterTimelineByRange(buildPortfolioTimeline(), dashboardRangeFilter);
    dashboardHistoryChartInstance = createChart(
        'dashboardHistoryChart',
        buildHistoryChartConfig(tl, '#10b981', 'rgba(16,185,129,0.15)')
    );

    // 3) Heatmap calendaire (indépendante du mode donut/treemap)
    renderCalendarHeatmap();
}

function renderDashboardDonut() {
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

    if (dashboardAllocChartInstance) dashboardAllocChartInstance.destroy();
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
            plugins: { legend: { position: 'bottom', labels: { color: _chartLegendColor(), boxWidth: 10, font: { size: 10 } } } },
            cutout: '65%',
            maintainAspectRatio: false
        }
    });
}

// ---------------------------------------------------------------------
// Bascule Donut ⇄ Treemap (persistée en localStorage)
// ---------------------------------------------------------------------
function setDashboardAllocView(view) {
    if (view !== 'donut' && view !== 'treemap') return;
    if (dashboardAllocView === view) return;
    dashboardAllocView = view;
    localStorage.setItem('patriMonial_allocView', view);

    if (dashboardAllocChartInstance) { dashboardAllocChartInstance.destroy(); dashboardAllocChartInstance = null; }

    updateDashboardAllocToggleUI();
    if (view === 'treemap') {
        setTimeout(() => renderDashboardTreemap(), 30);
    } else {
        renderDashboardDonut();
    }
}

function updateDashboardAllocToggleUI() {
    const card    = document.getElementById('dashboard-alloc-card');
    const traj    = document.getElementById('dashboard-trajectory-card');
    const donut   = document.getElementById('dashboard-alloc-donut-view');
    const treemap = document.getElementById('dashboard-alloc-treemap-view');
    const legend  = document.getElementById('dashboard-treemap-legend');
    const btnD    = document.getElementById('dashboard-alloc-btn-donut');
    const btnT    = document.getElementById('dashboard-alloc-btn-treemap');
    if (!card) return;

    const isTreemap = dashboardAllocView === 'treemap';

    card.classList.toggle('lg:col-span-1', !isTreemap);
    card.classList.toggle('lg:col-span-3', isTreemap);
    if (traj)    traj.classList.toggle('hidden', isTreemap);
    if (donut)   donut.classList.toggle('hidden', isTreemap);
    if (treemap) treemap.classList.toggle('hidden', !isTreemap);
    if (legend)  legend.classList.toggle('hidden', !isTreemap);
    if (legend)  legend.classList.toggle('flex',   isTreemap);

    const active   = 'bg-emerald-950 text-emerald-300';
    const inactive = 'text-gray-400 hover:text-white';
    if (btnD) btnD.className = 'px-2 py-1 rounded flex items-center gap-1 transition ' + (!isTreemap ? active : inactive);
    if (btnT) btnT.className = 'px-2 py-1 rounded flex items-center gap-1 transition ' + ( isTreemap ? active : inactive);
}

// ---------------------------------------------------------------------
// TREEMAP — algorithme squarified + rendu SVG
// ---------------------------------------------------------------------
// Convertit un % de performance en couleur : rouge (perte ≥ -50 %) →
// gris neutre (0 %) → vert (gain ≥ +50 %). Interpolation linéaire RGB.
function pnlToColor(pnlPct) {
    const t = Math.max(-1, Math.min(1, (pnlPct || 0) / 50));
    if (t >= 0) {
        const r = Math.round(75 + t * (16  - 75));  // slate-600 → emerald-500
        const g = Math.round(85 + t * (185 - 85));
        const b = Math.round(99 + t * (129 - 99));
        return `rgb(${r},${g},${b})`;
    }
    const u = -t;
    const r = Math.round(75 + u * (239 - 75));      // slate-600 → red-500
    const g = Math.round(85 + u * (68  - 85));
    const b = Math.round(99 + u * (68  - 99));
    return `rgb(${r},${g},${b})`;
}

// Algorithme squarified treemap : place les rectangles de façon à minimiser
// le ratio d'aspect (le plus carré possible). Retourne un tableau de
// { item, x, y, w, h } exprimés dans le repère demandé.
function layoutTreemap(items, width, height) {
    const result = [];
    if (!items.length || width <= 0 || height <= 0) return result;

    const total = items.reduce((s, it) => s + (it.value || 0), 0);
    if (total <= 0) return result;

    const area = width * height;
    const nodes = items
        .filter(it => (it.value || 0) > 0)
        .map(it => ({ item: it, area: (it.value / total) * area }))
        .sort((a, b) => b.area - a.area);

    const worstRatio = (row, rowSum, container, horizontal) => {
        let worst = 1;
        for (const c of row) {
            let w_, h_;
            if (horizontal) {
                w_ = c.area * container.w / rowSum;
                h_ = rowSum / container.w;
            } else {
                w_ = rowSum / container.h;
                h_ = c.area * container.h / rowSum;
            }
            const r = Math.max(w_ / h_, h_ / w_);
            if (r > worst) worst = r;
        }
        return worst;
    };

    const recurse = (children, container) => {
        if (!children.length || container.w <= 0 || container.h <= 0) return;
        if (children.length === 1) {
            result.push({ item: children[0].item, x: container.x, y: container.y, w: container.w, h: container.h });
            return;
        }

        const totalArea = children.reduce((s, n) => s + n.area, 0);
        const horizontal = container.w >= container.h;

        let row = [];
        let rowSum = 0;
        let bestWorst = Infinity;
        let i = 0;
        while (i < children.length) {
            const candidate = row.concat([children[i]]);
            const candidateSum = rowSum + children[i].area;
            const worst = worstRatio(candidate, candidateSum, container, horizontal);
            if (row.length === 0 || worst <= bestWorst) {
                row = candidate;
                rowSum = candidateSum;
                bestWorst = worst;
                i++;
            } else {
                break;
            }
        }

        const rowFraction = rowSum / totalArea;

        if (horizontal) {
            const rowWidth = container.w * rowFraction;
            let cy = container.y;
            for (const c of row) {
                const cH = (c.area / rowSum) * container.h;
                result.push({ item: c.item, x: container.x, y: cy, w: rowWidth, h: cH });
                cy += cH;
            }
            recurse(children.slice(row.length), {
                x: container.x + rowWidth, y: container.y,
                w: container.w - rowWidth, h: container.h
            });
        } else {
            const rowHeight = container.h * rowFraction;
            let cx = container.x;
            for (const c of row) {
                const cW = (c.area / rowSum) * container.w;
                result.push({ item: c.item, x: cx, y: container.y, w: cW, h: rowHeight });
                cx += cW;
            }
            recurse(children.slice(row.length), {
                x: container.x, y: container.y + rowHeight,
                w: container.w, h: container.h - rowHeight
            });
        }
    };

    recurse(nodes, { x: 0, y: 0, w: width, h: height });
    return result;
}

// Rendu SVG complet du treemap des actifs
function renderDashboardTreemap() {
    const svg = document.getElementById('dashboardTreemapSvg');
    if (!svg) return;
    const parent = svg.parentElement;
    if (!parent) return;

    const W = Math.max(200, parent.clientWidth  || 800);
    const H = Math.max(160, parent.clientHeight || 320);

    const items = assets
        .filter(a => (a.value || 0) > 0)
        .map(a => {
            const pnl = (a.value || 0) - (a.invested || 0);
            const pnlPct = (a.invested > 0) ? (pnl / a.invested) * 100 : 0;
            return { id: a.id, name: a.name, ticker: a.ticker, value: a.value, pnlPct };
        });

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');

    if (!items.length) {
        svg.innerHTML = `<text x="${W/2}" y="${H/2}" text-anchor="middle" dominant-baseline="middle" fill="#6b7280" font-family="Inter, system-ui, sans-serif" font-size="12">Aucun actif à afficher</text>`;
        return;
    }

    const layout = layoutTreemap(items, W, H);
    const grandTotal = items.reduce((s, i) => s + i.value, 0);

    let html = '';
    for (const node of layout) {
        const { item, x, y, w, h } = node;
        if (w < 1 || h < 1) continue;

        const color  = pnlToColor(item.pnlPct);
        const weight = grandTotal > 0 ? (item.value / grandTotal) * 100 : 0;
        const isPos  = item.pnlPct >= 0;

        // item.name peut contenir <, >, & (issus d'une saisie libre ou d'un
        // import CSV/JSON). Le <title> SVG est interprété comme du XML
        // strict : on doit échapper le nom pour éviter un SVG cassé ou une
        // injection XML.
        const tooltip = `${escapeHTML(item.name)}&#10;${formatEUR(item.value)} · ${weight.toFixed(1)} % du portefeuille&#10;P&L : ${isPos ? '+' : ''}${item.pnlPct.toFixed(2)} %`;

        // Rectangle cliquable avec effet hover
        html += `<g class="cursor-pointer" onclick="openAssetDetailModal(${item.id})">
            <title>${tooltip}</title>
            <rect x="${x + 0.5}" y="${y + 0.5}" width="${Math.max(0, w - 1)}" height="${Math.max(0, h - 1)}"
                  fill="${color}" stroke="#0b0f19" stroke-width="1" rx="3"
                  style="transition: filter 0.15s;"
                  onmouseover="this.style.filter='brightness(1.25)'"
                  onmouseout="this.style.filter=''"/>
        </g>`;

        // Labels : affichés seulement si la case est suffisamment grande
        if (w >= 44 && h >= 22) {
            const lines = [];
            const ticker = (item.ticker || '').slice(0, 12);
            lines.push(ticker.length > 8 ? ticker.slice(0, 8) : ticker);
            if (h >= 38) lines.push((isPos ? '+' : '') + item.pnlPct.toFixed(1) + ' %');
            if (h >= 54 && w >= 70) lines.push(formatEUR(item.value));

            const lh = 11;
            const startY = y + h / 2 - (lines.length - 1) * lh / 2;

            html += `<text x="${x + w / 2}" y="${startY}" text-anchor="middle" dominant-baseline="middle"
                          fill="#ffffff" stroke="#000000" stroke-width="0.3" paint-order="stroke"
                          font-family="Inter, system-ui, sans-serif" font-size="10" font-weight="600"
                          pointer-events="none" style="text-shadow: 0 1px 2px rgba(0,0,0,0.8);">`;
            lines.forEach((ln, i) => {
                html += `<tspan x="${x + w / 2}" dy="${i === 0 ? 0 : lh}">${escapeHTML(ln)}</tspan>`;
            });
            html += `</text>`;
        }
    }
    svg.innerHTML = html;
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
            plugins: { legend: { position: 'bottom', labels: { color: _chartLegendColor(), boxWidth: 10, font: { size: 10 } } } },
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
            <td class="p-2.5">
                <div class="flex items-center gap-1.5 min-w-0">
                    ${assetClassIconHTML(a)}
                    <div class="min-w-0 flex-1">
                        <div class="font-bold text-white truncate">${escapeHTML(a.name)}</div>
                        <div class="text-[10px] text-gray-500">${escapeHTML(a.ticker)}</div>
                    </div>
                </div>
            </td>
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

    // Sous-titre enrichi avec la devise si ≠ EUR (Chantier 1.2)
    const subtitleParts = [asset.ticker, asset.category];
    if (asset.currency && asset.currency !== 'EUR') {
        subtitleParts.push(asset.currency);
    }
    document.getElementById('modal-asset-subtitle').innerText = subtitleParts.join(' • ');
    document.getElementById('modal-asset-cadran-select-wrap').innerHTML = cadranSelectHTML(asset.id, asset.cadran || 'HORS_GAVE');

    renderAssetDetailChart(id);
    renderFxEffectPanel(asset);         // Chantier 1.2 — encart effet de change
    renderAssetLotsTable(asset);
    renderAssetSplitsTable(asset);      // Chantier 1.3 — historique des splits
    renderAssetDividendsTable(asset);   // Chantier 1.1
    document.getElementById('modal-asset-detail').classList.remove('hidden');
}

// =====================================================================
// ENCART « EFFET DE CHANGE » — modal de détail actif (Chantier 1.2)
// ---------------------------------------------------------------------
// Affiche, pour les actifs cotés dans une devise ≠ EUR :
//   • Valeur native actuelle (≈ 500,00 $)
//   • Valeur native d'achat (reconstituée via fxRateAtPurchase)
//   • Effet de change depuis l'achat (en %)
//   • P&L en devise native vs P&L en EUR (isole la performance intrinsèque)
//
// L'encart est injecté dynamiquement APRÈS le canvas du graphique, et
// retiré/silencieusement ignoré pour les actifs en EUR.
// =====================================================================
function renderFxEffectPanel(asset) {
    // Retire un éventuel encart précédent (changement d'actif dans le modal)
    const old = document.getElementById('asset-fx-panel');
    if (old) old.remove();

    // Pas de devise ≠ EUR → rien à afficher
    if (!asset || !asset.currency || asset.currency === 'EUR') return;

    const native = getAssetNativeValue(asset);
    if (!native) return;

    // Valeur d'achat native : on reconstitue à partir du taux FIGÉ à l'achat
    // (fxRateAtPurchase). Si absent, on ne peut pas calculer l'effet de change.
    const fxAtPurchase = Number(asset.fxRateAtPurchase) || 0;
    let nativePurchaseValue = null;
    let fxEffectPct = null;
    let nativePnl = null;
    let nativePnlPct = null;

    if (fxAtPurchase > 0) {
        nativePurchaseValue = (asset.invested || 0) / fxAtPurchase;
        if (nativePurchaseValue > 0) {
            fxEffectPct = ((native.rate - fxAtPurchase) / fxAtPurchase) * 100;
        }
        // P&L en devise native : valeur native − coût d'achat natif
        if (nativePurchaseValue !== null) {
            nativePnl = native.nativeValue - nativePurchaseValue;
            nativePnlPct = nativePurchaseValue > 0 ? (nativePnl / nativePurchaseValue) * 100 : 0;
        }
    }

    // P&L EUR réel de l'actif
    const eurPnl = (asset.value || 0) - (asset.invested || 0);
    const eurPnlPct = asset.invested > 0 ? (eurPnl / asset.invested) * 100 : 0;

    // Détermine la couleur de l'effet de change
    const fxCls = fxEffectPct === null ? 'text-gray-400' : fxEffectPct >= 0 ? 'text-emerald-400' : 'text-rose-400';
    const fxSign = fxEffectPct !== null && fxEffectPct >= 0 ? '+' : '';

    const natCls = nativePnl === null ? 'text-gray-400' : nativePnl >= 0 ? 'text-emerald-400' : 'text-rose-400';
    const eurCls = eurPnl >= 0 ? 'text-emerald-400' : 'text-rose-400';

    const fxDateTxt = asset.fxRateDate
        ? new Date(asset.fxRateDate).toLocaleDateString('fr-FR')
        : '—';

    const html = `
        <div id="asset-fx-panel" class="bg-blue-950/20 border border-blue-800/40 rounded-xl p-4 space-y-3">
            <div class="flex justify-between items-start gap-3">
                <div>
                    <div class="text-[11px] font-bold text-blue-300 uppercase tracking-wide flex items-center gap-2">
                        <i class="fa-solid fa-arrow-right-arrow-left"></i>
                        Effet de change — devise ${escapeHTML(asset.currency)}
                    </div>
                    <div class="text-[10px] text-gray-500 mt-0.5">
                        Taux figé à l'achat le ${fxDateTxt} : 1 ${escapeHTML(asset.currency)} ≈ ${fxAtPurchase > 0 ? fxAtPurchase.toFixed(4) : '—'} € · Taux courant : 1 ${escapeHTML(asset.currency)} ≈ ${native.rate.toFixed(4)} €
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div class="bg-gray-950/60 border border-gray-800 rounded-lg p-2">
                    <div class="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Valeur native actuelle</div>
                    <div class="font-mono font-bold text-white">${escapeHTML(formatNative(native.nativeValue, asset.currency))}</div>
                    <div class="text-[9px] text-gray-500 font-mono">${escapeHTML(formatNative(native.nativeUnitValue, asset.currency))} / unité</div>
                </div>
                <div class="bg-gray-950/60 border border-gray-800 rounded-lg p-2">
                    <div class="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Coût d'achat natif</div>
                    <div class="font-mono font-bold text-white">${nativePurchaseValue !== null ? escapeHTML(formatNative(nativePurchaseValue, asset.currency)) : '—'}</div>
                    <div class="text-[9px] text-gray-500">reconstitué via taux figé</div>
                </div>
                <div class="bg-gray-950/60 border border-gray-800 rounded-lg p-2">
                    <div class="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Effet de change</div>
                    <div class="font-mono font-bold ${fxCls}">${fxEffectPct === null ? '—' : fxSign + fxEffectPct.toFixed(2) + ' %'}</div>
                    <div class="text-[9px] text-gray-500">${fxEffectPct === null ? 'taux d\'achat manquant' : (fxEffectPct >= 0 ? 'devise favorable' : 'devise défavorable')}</div>
                </div>
                <div class="bg-gray-950/60 border border-gray-800 rounded-lg p-2">
                    <div class="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">P&amp;L en devise native</div>
                    <div class="font-mono font-bold ${natCls}">${nativePnl === null ? '—' : (nativePnl >= 0 ? '+' : '') + escapeHTML(formatNative(nativePnl, asset.currency))}</div>
                    <div class="text-[9px] ${natCls} font-mono">${nativePnlPct === null ? '' : (nativePnlPct >= 0 ? '+' : '') + nativePnlPct.toFixed(2) + ' %'}</div>
                </div>
            </div>

            <div class="text-[10px] text-gray-400 leading-relaxed bg-gray-950/40 border border-gray-800 rounded-lg p-2">
                <i class="fa-solid fa-circle-info mr-1 text-blue-400"></i>
                <b>Lecture :</b> votre P&amp;L total en EUR est de
                <span class="${eurCls} font-mono font-bold">${eurPnl >= 0 ? '+' : ''}${formatEUR(eurPnl)} (${eurPnlPct >= 0 ? '+' : ''}${eurPnlPct.toFixed(2)} %)</span>.
                ${fxEffectPct !== null
                    ? `L'effet de change contribue pour <span class="${fxCls} font-mono font-bold">${fxSign}${fxEffectPct.toFixed(2)} %</span> de ce résultat — le reste provient de la performance intrinsèque de l'actif en devise native.`
                    : `Renseignez le taux de change à l'achat (édition de l'actif) pour décomposer l'effet de change.`}
            </div>
        </div>
    `;

    // Insertion APRÈS le bloc du graphique (canvas + sa div parente)
    const chartCanvas = document.getElementById('assetHistoryChart');
    if (chartCanvas) {
        const chartWrap = chartCanvas.closest('.h-64') || chartCanvas.parentElement;
        if (chartWrap && chartWrap.parentElement) {
            chartWrap.insertAdjacentHTML('afterend', html);
            return;
        }
    }
    // Fallback : insertion après le sous-titre
    const subtitle = document.getElementById('modal-asset-subtitle');
    if (subtitle && subtitle.parentElement) {
        subtitle.parentElement.insertAdjacentHTML('afterend', html);
    }
}

// Affiche le tableau des lots dans le modal de détail de l'actif.
// Colonnes enrichies :
//   - Prix lot    : prix d'achat unitaire (frais inclus) du lot
//   - PRU cumulé  : PRU moyen pondéré jusqu'à ce lot inclus
//                   → permet de voir si ce lot a fait monter ou baisser votre PRU
//   - Val. actuelle : valeur unitaire de marché actuelle (identique sur chaque ligne)
//   - P&L latent  : (valeur actuelle − prix lot) × qty restante
//                   → réponse directe à "ce lot est-il en PV ou en MV ?"
// =====================================================================
// TABLEAU DES LOTS — enrichissement, tri, filtre, badges, export CSV
// =====================================================================

// Prépare les données enrichies d'un actif pour l'affichage et l'export.
// Retourne { lots, currentUnitValue, bestLotId, worstLotId }.
function _enrichLotsForAsset(asset) {
    const allLots = (asset.lots || []).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    const totalQtyRemaining = allLots.reduce((s, l) => s + (l.qtyRemaining || 0), 0);
    const currentUnitValue  = totalQtyRemaining > 0 ? (asset.value / totalQtyRemaining) : 0;

    let cumQty = 0, cumCost = 0;
    const lots = allLots.map((l, idx) => {
        const lotUnitCost = (l.price || 0) + ((l.frais || 0) / (l.qty || 1));
        cumQty  += (l.qty || 0);
        cumCost += (l.qty || 0) * (l.price || 0) + (l.frais || 0);
        const cumPRU = cumQty > 0 ? cumCost / cumQty : 0;

        // PRU cumulé AVANT ce lot (pour afficher la flèche ↑/↓)
        const previousPRU = (idx > 0 && cumQty > (l.qty || 0))
            ? (cumCost - ((l.qty || 0) * (l.price || 0) + (l.frais || 0))) / (cumQty - (l.qty || 0))
            : null;

        const remaining  = l.qtyRemaining || 0;
        const isSold     = remaining <= 0;
        const pnlPerUnit = (currentUnitValue > 0 && !isSold) ? (currentUnitValue - lotUnitCost) : 0;
        const pnlTotal   = pnlPerUnit * remaining;
        const pnlPct     = lotUnitCost > 0 ? (pnlPerUnit / lotUnitCost) * 100 : 0;

        return {
            ...l,
            _lotUnitCost: lotUnitCost,
            _cumPRU: cumPRU,
            _previousPRU: previousPRU,
            _remaining: remaining,
            _isSold: isSold,
            _pnlTotal: pnlTotal,
            _pnlPct: pnlPct
        };
    });

    // Identification meilleur / pire lot (uniquement parmi les lots actifs, et
    // seulement si on a au moins 2 lots à comparer).
    const activeLots = lots.filter(l => !l._isSold && currentUnitValue > 0);
    let bestLotId = null, worstLotId = null;
    if (activeLots.length >= 2) {
        const sortedByPnl = [...activeLots].sort((a, b) => b._pnlPct - a._pnlPct);
        bestLotId  = sortedByPnl[0].id;
        worstLotId = sortedByPnl[sortedByPnl.length - 1].id;
    }

    return { lots, currentUnitValue, bestLotId, worstLotId };
}

// Trie un tableau de lots enrichis selon la clé et la direction courantes
function _sortLotsArray(lots, key, dir) {
    const mult = dir === 'asc' ? 1 : -1;
    const getVal = (l) => {
        switch (key) {
            case 'date':         return l.date ? new Date(l.date).getTime() : 0;
            case 'qty':          return l.qty || 0;
            case 'qtyRemaining': return l._remaining;
            case 'price':        return l._lotUnitCost;
            case 'cumPRU':       return l._cumPRU;
            case 'pnl':          return l._pnlTotal;
            case 'frais':        return l.frais || 0;
            default:             return 0;
        }
    };
    return [...lots].sort((a, b) => (getVal(a) - getVal(b)) * mult);
}

// Met à jour les icônes de tri dans l'en-tête
function updateLotSortIndicators() {
    const keys = ['date', 'qty', 'qtyRemaining', 'price', 'cumPRU', 'pnl', 'frais'];
    keys.forEach(k => {
        const icon = document.getElementById('lots-sort-icon-' + k);
        if (!icon) return;
        icon.className = 'fa-solid text-[9px]';
        if (lotSortKey === k) {
            icon.classList.add(lotSortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down', 'text-amber-400');
        } else {
            icon.classList.add('fa-sort', 'opacity-30');
        }
    });
}

// Appelé au clic sur une colonne triable
function sortLots(key) {
    if (lotSortKey === key) {
        lotSortDir = lotSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        lotSortKey = key;
        // Par défaut : asc sur la date (chronologique), desc sur les autres
        // (le plus gros / récent / rentable d'abord)
        lotSortDir = key === 'date' ? 'asc' : 'desc';
    }
    if (currentAssetDetailId) {
        const asset = assets.find(a => a.id === currentAssetDetailId);
        if (asset) renderAssetLotsTable(asset);
    }
}

// Appelé au toggle du filtre "Afficher les lots vendus"
function toggleLotsSoldVisibility(show) {
    lotShowSold = !!show;
    if (currentAssetDetailId) {
        const asset = assets.find(a => a.id === currentAssetDetailId);
        if (asset) renderAssetLotsTable(asset);
    }
}

// Affiche le tableau des lots dans le modal de détail de l'actif
function renderAssetLotsTable(asset) {
    const tbody = document.getElementById('modal-asset-lots-body');
    if (!tbody) return;

    // Synchronise la checkbox du filtre avec l'état global (utile à la 1ʳᵉ ouverture)
    const soldToggle = document.getElementById('lots-show-sold-toggle');
    if (soldToggle) soldToggle.checked = lotShowSold;

    const enriched = _enrichLotsForAsset(asset);

    if (!enriched.lots.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="p-3 text-center text-gray-500 text-xs">Aucun lot enregistré.</td></tr>';
        updateLotSortIndicators();
        return;
    }

    // Filtre les lots vendus si demandé
    let visible = lotShowSold
        ? enriched.lots
        : enriched.lots.filter(l => !l._isSold);

    if (!visible.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="p-3 text-center text-gray-500 text-xs">Tous les lots sont vendus (cochez « Afficher les lots vendus » pour les voir).</td></tr>';
        updateLotSortIndicators();
        return;
    }

    // Tri selon l'état courant
    visible = _sortLotsArray(visible, lotSortKey, lotSortDir);

    // Rendu des lignes
    let totalPnl = 0, totalPnlBase = 0;

    const rowsHTML = visible.map(l => {
        const isPos = l._pnlTotal >= 0;
        const sold  = l._isSold;
        const noMarket = enriched.currentUnitValue <= 0;

        // Accumulateurs P&L total (sur les lots actifs visibles uniquement)
        if (!sold && !noMarket) {
            totalPnl += l._pnlTotal;
            totalPnlBase += l._lotUnitCost * l._remaining;
        }

        // Flèche ↑/↓ sur le PRU cumulé
        const pruArrow = l._previousPRU === null
            ? ''
            : (l._cumPRU > l._previousPRU + 1e-9
                ? ' <i class="fa-solid fa-arrow-up text-[8px] text-rose-400/70" title="Ce lot a fait monter votre PRU"></i>'
                : l._cumPRU < l._previousPRU - 1e-9
                    ? ' <i class="fa-solid fa-arrow-down text-[8px] text-emerald-400/70" title="Ce lot a fait baisser votre PRU"></i>'
                    : '');

        // Badge 👑 meilleur lot / 📉 pire lot
        const badge = l.id === enriched.bestLotId
            ? ' <i class="fa-solid fa-crown text-[10px] text-amber-400" title="Meilleur lot (P&L % le plus élevé)"></i>'
            : l.id === enriched.worstLotId
                ? ' <i class="fa-solid fa-arrow-trend-down text-[10px] text-rose-400" title="Lot le moins performant"></i>'
                : '';

        return `<tr class="${sold ? 'opacity-40' : ''}">
            <td class="p-2.5 whitespace-nowrap">${l.date ? new Date(l.date).toLocaleDateString('fr-FR') : '—'}${badge}</td>
            <td class="p-2.5 text-gray-400 truncate max-w-[110px]" title="${escapeHTML(l.reference || '')}">${escapeHTML(l.reference) || '—'}</td>
            <td class="p-2.5 text-right">${l.qty}</td>
            <td class="p-2.5 text-right ${l._remaining > 0 ? 'text-emerald-400 font-bold' : 'text-gray-500'}">${l._remaining}</td>
            <td class="p-2.5 text-right text-gray-400">${formatUnitPrice(l._lotUnitCost)}</td>
            <td class="p-2.5 text-right text-blue-300">${formatUnitPrice(l._cumPRU)}${pruArrow}</td>
            <td class="p-2.5 text-right text-gray-300">${noMarket ? '—' : formatUnitPrice(enriched.currentUnitValue)}</td>
            <td class="p-2.5 text-right ${sold || noMarket ? 'text-gray-500' : (isPos ? 'text-emerald-400' : 'text-rose-400')}">
                ${sold || noMarket
                    ? '—'
                    : `<div class="font-bold">${isPos ? '+' : ''}${formatEUR(l._pnlTotal)}</div>
                       <div class="text-[10px] ${isPos ? 'text-emerald-400/70' : 'text-rose-400/70'}">${isPos ? '+' : ''}${l._pnlPct.toFixed(2)}%</div>`}
            </td>
            <td class="p-2.5 text-right text-gray-500">${formatEUR(l.frais || 0)}</td>
            <td class="p-2.5 text-center whitespace-nowrap">
                <button type="button" aria-label="Modifier ce lot" title="Modifier ce lot" onclick="event.stopPropagation(); openEditLotModal(${asset.id}, ${l.id})" class="inline-flex items-center justify-center w-7 h-7 rounded-md bg-gray-800/60 text-gray-300 hover:bg-emerald-900/60 hover:text-emerald-300 transition"><i class="fa-solid fa-pen"></i></button>
                <button type="button" aria-label="Supprimer ce lot" title="Supprimer ce lot" onclick="event.stopPropagation(); deleteLot(${asset.id}, ${l.id})" class="inline-flex items-center justify-center w-7 h-7 rounded-md bg-gray-800/60 text-gray-300 hover:bg-rose-900/60 hover:text-rose-300 transition"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');

    // Ligne de synthèse P&L global (lots actifs uniquement)
    const totalPnlClass = totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400';
    const totalPnlPct   = totalPnlBase > 0 ? (totalPnl / totalPnlBase * 100) : 0;
    const summaryRow = totalPnlBase > 0
        ? `<tr class="bg-gray-950/80 border-t-2 border-gray-700 font-bold">
               <td colspan="7" class="p-2.5 text-right text-gray-400">Total P&amp;L latent sur les lots actifs :</td>
               <td class="p-2.5 text-right ${totalPnlClass}">
                   <div>${totalPnl >= 0 ? '+' : ''}${formatEUR(totalPnl)}</div>
                   <div class="text-[10px] ${totalPnl >= 0 ? 'text-emerald-400/70' : 'text-rose-400/70'}">${totalPnl >= 0 ? '+' : ''}${totalPnlPct.toFixed(2)}%</div>
               </td>
               <td colspan="2" class="p-2.5"></td>
           </tr>`
        : '';

    tbody.innerHTML = rowsHTML + summaryRow;
    updateLotSortIndicators();
}

// =====================================================================
// TABLEAU DES DIVIDENDES / COUPONS — tri, cumul glissant 12m (Chantier 1.1)
// =====================================================================

let dividendSortKey = 'date';   // 'date' | 'amount' | 'net' | 'kind'
let dividendSortDir = 'desc';   // par défaut : le plus récent en haut

function _sortDividendsArray(list, key, dir) {
    const mult = dir === 'asc' ? 1 : -1;
    const getVal = (d) => {
        switch (key) {
            case 'date':   return d._date ? d._date.getTime() : 0;
            case 'amount': return d.amount || 0;
            case 'net':    return d._net || 0;
            case 'kind':   return d.kind || '';
            default:       return 0;
        }
    };
    return [...list].sort((a, b) => {
        const va = getVal(a), vb = getVal(b);
        if (typeof va === 'string') return va.localeCompare(vb) * mult;
        return (va - vb) * mult;
    });
}

function updateDividendSortIndicators() {
    const keys = ['date'];
    keys.forEach(k => {
        const icon = document.getElementById('dividends-sort-icon-' + k);
        if (!icon) return;
        icon.className = 'fa-solid text-[9px]';
        if (dividendSortKey === k) {
            icon.classList.add(dividendSortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down', 'text-emerald-400');
        } else {
            icon.classList.add('fa-sort', 'opacity-30');
        }
    });
}

function sortDividends(key) {
    if (dividendSortKey === key) {
        dividendSortDir = dividendSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        dividendSortKey = key;
        dividendSortDir = key === 'date' ? 'desc' : 'desc';
    }
    if (currentAssetDetailId) {
        const asset = assets.find(a => a.id === currentAssetDetailId);
        if (asset) renderAssetDividendsTable(asset);
    }
}

// Enrichit chaque dividende avec _date (objet Date) et _net (brut - retenue)
// ainsi que le cumul glissant sur 12 mois (rolling sum, du plus ancien au plus récent).
function _enrichDividendsForAsset(asset) {
    const list = (asset.dividends || []).map(d => {
        const dt = parseFlexDate(d.date);
        const net = (Number(d.amount) || 0) - (Number(d.taxWithheld) || 0);
        return { ...d, _date: dt, _net: net };
    }).filter(d => d._date);

    // Tri chronologique croissant pour calculer le cumul glissant
    const chrono = [...list].sort((a, b) => a._date - b._date);
    const rolling12m = {};
    for (let i = 0; i < chrono.length; i++) {
        const cutoff = new Date(chrono[i]._date);
        cutoff.setFullYear(cutoff.getFullYear() - 1);
        let sum = 0;
        for (let j = i; j >= 0; j--) {
            if (chrono[j]._date >= cutoff && chrono[j]._date <= chrono[i]._date) {
                sum += chrono[j]._net;
            } else break;
        }
        rolling12m[chrono[i].id] = sum;
    }
    list.forEach(d => { d._rolling12m = rolling12m[d.id] || 0; });

    return list;
}

// Rendu principal — appelé à l'ouverture du modal et après chaque CRUD
function renderAssetDividendsTable(asset) {
    const tbody = document.getElementById('modal-asset-dividends-body');
    if (!tbody) return;

    const empty = document.getElementById('asset-dividends-empty');
    const badge = document.getElementById('asset-dividends-count-badge');
    const summary = document.getElementById('asset-dividends-summary');

    const enriched = _enrichDividendsForAsset(asset);

    // Badge + résumé
    if (badge) {
        if (enriched.length > 0) {
            badge.classList.remove('hidden');
            badge.innerText = enriched.length;
        } else {
            badge.classList.add('hidden');
        }
    }
    if (summary) {
        if (enriched.length === 0) {
            summary.innerText = '—';
            summary.className = 'text-gray-500 font-mono';
        } else {
            const d12 = getAssetDividendsSinceMonths(asset, 12);
            const y = getAssetDividendYield(asset);
            const yTxt = y !== null ? ` · rendement ${y.toFixed(2)} %` : '';
            const yCls = y !== null && y >= 3 ? 'text-emerald-400' : y !== null && y >= 1 ? 'text-amber-400' : 'text-gray-400';
            summary.innerHTML = `<span class="${yCls}">12m : +${formatEUR(d12.net)}${yTxt}</span>`;
        }
    }

    // Tableau
    if (!enriched.length) {
        tbody.innerHTML = '';
        if (empty) empty.classList.remove('hidden');
        updateDividendSortIndicators();
        return;
    }
    if (empty) empty.classList.add('hidden');

    const sorted = _sortDividendsArray(enriched, dividendSortKey, dividendSortDir);

    const kindLabels = {
        DIVIDENDE: { txt: 'Dividende', icon: 'fa-chart-line', cls: 'text-emerald-400' },
        COUPON:    { txt: 'Coupon',    icon: 'fa-landmark',    cls: 'text-teal-400' },
        INTERET:   { txt: 'Intérêt',   icon: 'fa-percent',     cls: 'text-blue-400' }
    };

    tbody.innerHTML = sorted.map(d => {
        const k = kindLabels[d.kind] || kindLabels.DIVIDENDE;
        const netCls = d._net >= 0 ? 'text-emerald-400' : 'text-rose-400';
        const curBadge = d.currency && d.currency !== 'EUR'
            ? ` <span class="text-[9px] text-gray-500">${escapeHTML(d.currency)}</span>`
            : '';
        return `<tr>
            <td class="p-2.5 whitespace-nowrap">${d._date.toLocaleDateString('fr-FR')}</td>
            <td class="p-2.5"><span class="${k.cls} text-[11px]"><i class="fa-solid ${k.icon} text-[10px] mr-1"></i>${k.txt}</span></td>
            <td class="p-2.5 text-gray-400 truncate max-w-[180px]" title="${escapeHTML(d.source || '')}">${escapeHTML(d.source) || '—'}</td>
            <td class="p-2.5 text-right">${formatEUR(d.amount)}${curBadge}</td>
            <td class="p-2.5 text-right text-gray-500">${d.taxWithheld > 0 ? '−' + formatEUR(d.taxWithheld) : '—'}</td>
            <td class="p-2.5 text-right font-bold ${netCls}">+${formatEUR(d._net)}</td>
            <td class="p-2.5 text-right text-gray-400">${d._rolling12m > 0 ? formatEUR(d._rolling12m) : '—'}</td>
            <td class="p-2.5 text-center whitespace-nowrap">
                <button type="button" aria-label="Modifier" title="Modifier" onclick="event.stopPropagation(); openAddDividendModal(${asset.id}, ${d.id})" class="inline-flex items-center justify-center w-7 h-7 rounded-md bg-gray-800/60 text-gray-300 hover:bg-emerald-900/60 hover:text-emerald-300 transition"><i class="fa-solid fa-pen"></i></button>
                <button type="button" aria-label="Supprimer" title="Supprimer" onclick="event.stopPropagation(); deleteDividend(${asset.id}, ${d.id})" class="inline-flex items-center justify-center w-7 h-7 rounded-md bg-gray-800/60 text-gray-300 hover:bg-rose-900/60 hover:text-rose-300 transition"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');

    updateDividendSortIndicators();
}

// =====================================================================
// TABLEAU DES SPLITS & REVERSE SPLITS (Chantier 1.3)
// =====================================================================
function renderAssetSplitsTable(asset) {
    const tbody = document.getElementById('modal-asset-splits-body');
    if (!tbody) return;

    const empty = document.getElementById('asset-splits-empty');
    const badge = document.getElementById('asset-splits-count-badge');
    const summary = document.getElementById('asset-splits-summary');

    const list = (asset.splits || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));

    // Badge compteur
    if (badge) {
        if (list.length > 0) {
            badge.classList.remove('hidden');
            badge.innerText = list.length;
        } else {
            badge.classList.add('hidden');
        }
    }

    // Résumé : facteur cumulé (multiplication de tous les ratios)
    if (summary) {
        if (list.length === 0) {
            summary.innerText = '—';
            summary.className = 'text-gray-500 font-mono';
        } else {
            const cumul = list.reduce((acc, s) => acc * (Number(s.ratio) || 1), 1);
            const label = cumul >= 1
                ? `facteur cumulé ×${cumul.toFixed(cumul >= 10 ? 0 : 4).replace(/\.?0+$/, '')}`
                : `facteur cumulé ÷${(1 / cumul).toFixed(2)}`;
            summary.innerHTML = `<span class="text-cyan-400">${list.length} opération${list.length > 1 ? 's' : ''} · ${label}</span>`;
        }
    }

    if (!list.length) {
        tbody.innerHTML = '';
        if (empty) empty.classList.remove('hidden');
        return;
    }
    if (empty) empty.classList.add('hidden');

    tbody.innerHTML = list.map(s => {
        const dt = parseFlexDate(s.date);
        const dtTxt = dt ? dt.toLocaleDateString('fr-FR') : '—';
        const isSplit = s.ratio >= 1;
        const opLabel = isSplit ? 'Split' : 'Reverse split';
        const opIcon = isSplit ? 'fa-arrow-up-wide-short' : 'fa-arrow-down-short-wide';
        const opCls = isSplit ? 'text-cyan-400' : 'text-rose-400';
        const ratioTxt = isSplit
            ? `${(s.ratio).toFixed(s.ratio >= 10 ? 0 : 4).replace(/\.?0+$/, '')}:1`
            : `1:${(1 / s.ratio).toFixed((1 / s.ratio) >= 10 ? 0 : 2).replace(/\.?0+$/, '')}`;

        return `<tr>
            <td class="p-2.5 whitespace-nowrap">${dtTxt}</td>
            <td class="p-2.5"><span class="${opCls} text-[11px]"><i class="fa-solid ${opIcon} text-[10px] mr-1"></i>${opLabel}</span></td>
            <td class="p-2.5 text-right font-bold text-white">${ratioTxt}</td>
            <td class="p-2.5 text-gray-400 truncate max-w-[220px]" title="${escapeHTML(s.note || '')}">${escapeHTML(s.note) || '—'}</td>
            <td class="p-2.5 text-center whitespace-nowrap">
                <button type="button" aria-label="Supprimer cette entrée d'historique" title="Supprimer l'entrée d'historique (ne défait PAS le split)" onclick="event.stopPropagation(); deleteSplit(${asset.id}, ${s.id})" class="inline-flex items-center justify-center w-7 h-7 rounded-md bg-gray-800/60 text-gray-300 hover:bg-rose-900/60 hover:text-rose-300 transition"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');
}

// =====================================================================
// EXPORT CSV DU TABLEAU DES LOTS
// Format : séparateur ';' (Excel FR), décimales ',', BOM UTF-8 pour les accents.
// =====================================================================
function exportLotsCSV(assetId) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;

    const enriched = _enrichLotsForAsset(asset);
    if (!enriched.lots.length) {
        alert('Aucun lot à exporter.');
        return;
    }

    const fmtNum  = (v, d = 2) => Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '';
    const csvCell = (s) => {
        let str = String(s == null ? '' : s);
        if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
        return /[";\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const rows = [];

    // Ligne de titre
    rows.push([
        csvCell('Détail des lots'),
        csvCell(asset.name),
        csvCell('Ticker: ' + (asset.ticker || '')),
        csvCell('Exporté le ' + new Date().toLocaleString('fr-FR'))
    ].join(';'));

    // En-tête
    rows.push([
        'Date', 'Référence', 'Qté achetée', 'Qté restante',
        'Prix lot', 'PRU cumulé', 'Valeur actuelle', 'P&L latent (€)', 'P&L (%)', 'Frais (€)'
    ].join(';'));

    // Lignes
    let totalPnl = 0, totalPnlBase = 0;
    // On exporte toujours dans l'ordre chronologique (indépendant du tri visuel)
    enriched.lots.forEach(l => {
        const hasMarket = enriched.currentUnitValue > 0 && !l._isSold;
        rows.push([
            csvCell(l.date ? new Date(l.date).toLocaleDateString('fr-FR') : ''),
            csvCell(l.reference || ''),
            fmtNum(l.qty, 8),
            fmtNum(l._remaining, 8),
            fmtNum(l._lotUnitCost, 4),
            fmtNum(l._cumPRU, 4),
            fmtNum(enriched.currentUnitValue, 4),
            hasMarket ? fmtNum(l._pnlTotal, 2) : '',
            hasMarket ? fmtNum(l._pnlPct, 2) : '',
            fmtNum(l.frais || 0, 2)
        ].join(';'));

        if (hasMarket) {
            totalPnl += l._pnlTotal;
            totalPnlBase += l._lotUnitCost * l._remaining;
        }
    });

    // Ligne de synthèse
    const totalPnlPct = totalPnlBase > 0 ? (totalPnl / totalPnlBase * 100) : 0;
    rows.push([
        csvCell('Total P&L latent'), '', '', '', '', '', '',
        fmtNum(totalPnl, 2),
        fmtNum(totalPnlPct, 2),
        ''
    ].join(';'));

    // Génère et télécharge le fichier
    const csv  = '\uFEFF' + rows.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    const safeTicker = (asset.ticker || 'actif').replace(/[^A-Z0-9_-]/gi, '_');
    a.download = `lots_${safeTicker}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------
// Édition / suppression d'un lot individuel (depuis le modal de détail actif)
// ---------------------------------------------------------------------
function openEditLotModal(assetId, lotId) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;
    const lot = (asset.lots || []).find(l => l.id === lotId);
    if (!lot) return;

    document.getElementById('lot-edit-asset-id').value       = assetId;
    document.getElementById('lot-edit-lot-id').value         = lotId;
    document.getElementById('lot-edit-date').value           = lot.date || '';
    document.getElementById('lot-edit-qty').value            = lot.qty;
    document.getElementById('lot-edit-qty-remaining').value  = lot.qtyRemaining;
    document.getElementById('lot-edit-price').value          = lot.price;
    document.getElementById('lot-edit-frais').value          = lot.frais || 0;
    document.getElementById('lot-edit-reference').value      = lot.reference || '';

    document.getElementById('modal-edit-lot').classList.remove('hidden');
}

function handleEditLot(e) {
    e.preventDefault();
    const assetId = parseFloat(document.getElementById('lot-edit-asset-id').value);
    const lotId   = parseFloat(document.getElementById('lot-edit-lot-id').value);
    const asset   = assets.find(a => a.id === assetId);
    if (!asset) return;
    const lot = (asset.lots || []).find(l => l.id === lotId);
    if (!lot) return;

    const newQty        = parseFloat(document.getElementById('lot-edit-qty').value) || 0;
    const newQtyRemain  = parseFloat(document.getElementById('lot-edit-qty-remaining').value) || 0;

    if (newQtyRemain > newQty + 1e-9) {
        alert('La quantité restante ne peut pas dépasser la quantité achetée.');
        return;
    }

    lot.date         = document.getElementById('lot-edit-date').value;
    lot.qty          = newQty;
    lot.qtyRemaining = newQtyRemain;
    lot.price        = parseFloat(document.getElementById('lot-edit-price').value) || 0;
    lot.frais        = parseFloat(document.getElementById('lot-edit-frais').value) || 0;
    lot.reference    = document.getElementById('lot-edit-reference').value.trim();

    syncAssetFromLots(asset);
    saveToStorage();
    closeModal('modal-edit-lot');
    refreshAllUI();
    openAssetDetailModal(assetId); // rouvre le détail avec les données à jour
}

function deleteLot(assetId, lotId) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;
    const lot = (asset.lots || []).find(l => l.id === lotId);
    if (!lot) return;

    const recap =
        `Date : ${lot.date ? new Date(lot.date).toLocaleDateString('fr-FR') : '—'}\n` +
        `Quantité achetée : ${lot.qty}\n` +
        `Quantité restante : ${lot.qtyRemaining}\n` +
        `Prix unitaire : ${formatEUR(lot.price)}` +
        (lot.reference ? `\nRéférence : ${lot.reference}` : '');

    if (!confirm(`Supprimer ce lot ?\n\n${recap}\n\nCette action est irréversible.`)) return;

    asset.lots = (asset.lots || []).filter(l => l.id !== lotId);

    if (asset.lots.length === 0) {
        if (confirm(`Cet actif n'a plus aucun lot.\nSupprimer tout l'actif "${asset.name}" du portefeuille ?`)) {
            assets = assets.filter(a => a.id !== assetId);
            saveToStorage();
            closeModal('modal-asset-detail');
            refreshAllUI();
            return;
        }
        // L'utilisateur garde l'actif → on lui laisse un lot vide pour éviter
        // un état incohérent (qty = 0).
    }

    syncAssetFromLots(asset);
    saveToStorage();
    refreshAllUI();
    openAssetDetailModal(assetId);
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
        const optsHTML = groups.map(g =>
            `<option value="${escapeHTML(g.code)}">${escapeHTML(g.label)}</option>`
        ).join('');
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
                <div class="text-[10px] text-gray-500 uppercase">Segment ${escapeHTML(side)}</div>
                <div class="font-bold text-white text-sm">${escapeHTML(groupLabel)}</div>
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
            ${segAssets.map(a => `<div class="flex justify-between items-center text-[10px] py-0.5 gap-1.5">
                ${assetClassIconHTML(a)}
                <span class="text-gray-400 truncate flex-1">${escapeHTML(a.name)}</span>
                <span class="font-mono text-gray-300 whitespace-nowrap">${formatEUR(a.value)}</span>
            </div>`).join('')}
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


// =====================================================================
// HEATMAP CALENDAIRE — 53 semaines × 7 jours (type GitHub contributions)
// ---------------------------------------------------------------------
// 1. On reconstitue une série QUOTIDIENNE de la valeur totale du
//    portefeuille en "forward-fill" : pour chaque jour de l'année, on
//    somme la dernière valeur connue de chaque actif à cette date.
// 2. On calcule la variation jour/jour en %.
// 3. On dessine un SVG : chaque case = 1 jour, couleur = variation.
// =====================================================================
function _buildDailyPortfolioSeries(days = 365) {
    const today = new Date(); today.setHours(23, 59, 59, 999);
    const start = new Date(today);
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);
    // Reculer au lundi précédent pour aligner sur la grille 7×N
    const dow = (start.getDay() + 6) % 7; // 0=lundi
    start.setDate(start.getDate() - dow);

    // Agrège tous les points d'historique de tous les actifs
    const allPoints = [];
    assets.forEach(a => {
        (a.history || []).forEach(h => {
            const d = parseFlexDate(h.date);
            if (d && Number.isFinite(h.value)) allPoints.push({ date: d, id: a.id, value: h.value });
        });
    });
    // Ajoute l'état actuel comme point "aujourd'hui", uniquement si aucun
    // point daté d'aujourd'hui n'existe déjà dans l'historique (évite le doublon).
    const todayStr = today.toDateString();
    assets.forEach(a => {
        const hasToday = (a.history || []).some(h => {
            const d = parseFlexDate(h.date);
            return d && d.toDateString() === todayStr;
        });
        if (!hasToday) {
            allPoints.push({ date: new Date(today), id: a.id, value: a.value || 0 });
        }
    });
    allPoints.sort((a, b) => a.date - b.date);

    const lastValues = {};
    let previousTotal = null;
    const dayData = [];
    const cursor = new Date(start);
    while (cursor <= today) {
        const endOfDay = new Date(cursor); endOfDay.setHours(23, 59, 59, 999);
        // Applique tous les points dont la date est <= fin du jour courant
        for (const p of allPoints) {
            if (p.date <= endOfDay) lastValues[p.id] = p.value;
        }
        const total = Object.values(lastValues).reduce((s, v) => s + v, 0);
        const variation = (previousTotal !== null && previousTotal > 0)
            ? ((total - previousTotal) / previousTotal) * 100
            : null;   // null = pas de variation calculable (J1)
        dayData.push({ date: new Date(cursor), total, variation });
        previousTotal = total;
        cursor.setDate(cursor.getDate() + 1);
    }
    return dayData;
}

// Échelle de couleur continue : gris → vert/rouge. ±3 % = saturation max.
function _heatmapColor(pct) {
    if (pct === null || !Number.isFinite(pct) || Math.abs(pct) < 0.05) return '#1f2937'; // gray-800
    const abs = Math.min(1, Math.abs(pct) / 3);
    if (pct > 0) {
        const r = Math.round(31 + abs * (16  - 31));
        const g = Math.round(41 + abs * (185 - 41));
        const b = Math.round(55 + abs * (129 - 55));
        return `rgb(${r},${g},${b})`;
    }
    const r = Math.round(31 + abs * (239 - 31));
    const g = Math.round(41 + abs * (68  - 41));
    const b = Math.round(55 + abs * (68  - 55));
    return `rgb(${r},${g},${b})`;
}

function renderCalendarHeatmap() {
    const svg = document.getElementById('calendarHeatmapSvg');
    if (!svg) return;

    const dayData = _buildDailyPortfolioSeries(365);
    const numDays = dayData.length;

    // Dimensions : cellule 12 px + 2 px d'écart
    const cell = 12, gap = 2, step = cell + gap;
    const offsetX = 30, offsetY = 22;
    const numWeeks = Math.ceil(numDays / 7);
    const W = offsetX + numWeeks * step + 4;
    const H = offsetY + 7 * step + 4;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // ---- KPIs ----
    const withVariation = dayData.filter(d => d.variation !== null && Number.isFinite(d.variation));
    const upDays   = withVariation.filter(d => d.variation >  0).length;
    const downDays = withVariation.filter(d => d.variation <  0).length;
    const best  = withVariation.reduce((a, b) => (b.variation > a.variation ? b : a), withVariation[0] || { variation: 0 });
    const worst = withVariation.reduce((a, b) => (b.variation < a.variation ? b : a), withVariation[0] || { variation: 0 });

    const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
    setText('heatmap-stat-days', withVariation.length);
    setText('heatmap-stat-up',   upDays + (upDays ? ' (' + (upDays / (upDays + downDays) * 100).toFixed(0) + '%)' : ''));
    setText('heatmap-stat-down', downDays);
    setText('heatmap-stat-best',  (best.variation >= 0 ? '+' : '') + best.variation.toFixed(2) + ' %');
    setText('heatmap-stat-worst', (worst.variation >= 0 ? '+' : '') + worst.variation.toFixed(2) + ' %');
    setText('heatmap-stat-best-date',  best.date  ? best.date.toLocaleDateString('fr-FR')  : '—');
    setText('heatmap-stat-worst-date', worst.date ? worst.date.toLocaleDateString('fr-FR') : '—');

    // ---- Grille SVG ----
    const dayLabels  = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    let html = '';

    // Libellés de jours (uniquement Lun, Mer, Ven — lignes 0, 2, 4)
    [0, 2, 4].forEach(i => {
        html += `<text x="${offsetX - 4}" y="${offsetY + i * step + 9}" text-anchor="end" fill="#6b7280" font-size="9" font-family="Inter, system-ui, sans-serif">${dayLabels[i]}</text>`;
    });

    // Libellés de mois (uniquement au 1ᵉʳ de chaque mois)
    let lastMonth = -1;
    dayData.forEach((d, idx) => {
        const m = d.date.getMonth();
        if (m !== lastMonth) {
            const weekIdx = Math.floor(idx / 7);
            const x = offsetX + weekIdx * step;
            // N'affiche le libellé que si la 1ʳᵉ semaine du mois n'est pas collée à une étiquette précédente
            if (idx === 0 || (idx % 7) <= 3) {
                html += `<text x="${x}" y="${offsetY - 6}" fill="#9ca3af" font-size="9" font-family="Inter, system-ui, sans-serif">${monthNames[m]}</text>`;
            }
            lastMonth = m;
        }
    });

    // Cellules jour par jour
    dayData.forEach((d, idx) => {
        const weekIdx = Math.floor(idx / 7);
        const dayIdx  = idx % 7;
        const x = offsetX + weekIdx * step;
        const y = offsetY + dayIdx * step;
        const color = _heatmapColor(d.variation);

        let tip;
        if (d.variation === null || d.total <= 0) {
            tip = `${d.date.toLocaleDateString('fr-FR')} · aucune donnée`;
        } else {
            const sign = d.variation >= 0 ? '+' : '';
            tip = `${d.date.toLocaleDateString('fr-FR')} · ${formatEUR(d.total)} · ${sign}${d.variation.toFixed(2)} %`;
        }
        html += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" fill="${color}" stroke="#0b0f19" stroke-width="0.5">
            <title>${escapeHTML(tip)}</title>
        </rect>`;
    });

    svg.innerHTML = html;
}