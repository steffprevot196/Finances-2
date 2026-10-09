// =====================================================================
// app29-benchmark-compare.js — COMPARATEUR PORTEFEUILLE vs CW8 (Chantier §3)
// Dépend de : app1-core.js, app6-api.js (benchmarkSeriesCache)
// Charge après app28-csp-audit.js, avant tests.js
// =====================================================================
//
// Répond à la question : « et si j'avais tout mis sur CW8 (MSCI World) ? »
//
// MÉTHODE (buy-and-hold équivalent) :
//   1. On parcourt tous les flux d'achat (`buys[]`) du portefeuille réel.
//   2. Pour chaque flux daté + montant, on simule l'achat équivalent de
//      CW8.PA au cours de CE jour (via la série benchmark déjà téléchargée
//      par le Chantier 1.6).
//   3. On reconstruit une trajectoire jour par jour de ce portefeuille
//      « CW8-only » en valorisant la quantité cumulée de parts CW8 au
//      cours du jour (forward-fill).
//   4. On compare avec la trajectoire réelle du portefeuille :
//        • sur-performance en € et en %
//        • sur-performance annualisée (CAGR différentiel)
//        • graphique superposé
//
// PRÉ-REQUIS :
//   • Le benchmark CW8.PA doit avoir été téléchargé (via le bouton
//     « Télécharger le benchmark » de la carte Analyse de Risque, ou
//     automatiquement au boot par le Chantier 1.6).
//   • Le portefeuille doit avoir au moins 2 achats datés sur ≥ 30 jours.

// ---------------------------------------------------------------------
// ÉTAT
// ---------------------------------------------------------------------
let _cw8ComparisonCache = null;
let _cw8CacheKey = '';   // invalide si les données changent

// Clé de cache : nombre de buys + valeur totale + id du portefeuille
function _computeCw8CacheKey() {
    let buysCount = 0;
    assets.forEach(a => { buysCount += (a.buys || []).length; });
    const totalValue = assets.reduce((s, a) => s + (a.value || 0), 0);
    return `${currentPortfolioId}|${buysCount}|${totalValue.toFixed(2)}`;
}

// ---------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------

// Retourne le cours CW8 le plus proche d'une date cible, ou null.
// Utilise la série benchmark en cache (app6-api.js).
function _cw8PriceAt(targetDate) {
    if (!Array.isArray(benchmarkSeriesCache) || !benchmarkSeriesCache.length) return null;
    const t = targetDate.getTime();
    let best = null, bestDelta = Infinity;
    for (const p of benchmarkSeriesCache) {
        if (p.date > t) break;
        const delta = t - p.date;
        if (delta < bestDelta) { bestDelta = delta; best = p; }
    }
    // Tolérance : 7 jours
    if (best && bestDelta <= 7 * 864e5) return best.price;
    return null;
}

// Récupère les points benchmark triés par date, avec forward-fill sur une
// plage [startTs, endTs]. Retourne [{ date, price }].
function _cw8SeriesInRange(startTs, endTs) {
    if (!Array.isArray(benchmarkSeriesCache) || !benchmarkSeriesCache.length) return [];
    const out = [];
    for (const p of benchmarkSeriesCache) {
        if (p.date >= startTs && p.date <= endTs) out.push(p);
    }
    return out;
}

// ---------------------------------------------------------------------
// CALCUL PRINCIPAL
// ---------------------------------------------------------------------
// Retourne null si les prérequis ne sont pas remplis.
// Sinon :
//   {
//     points: [{ date, realValue, cw8Value }],
//     totalInvested,
//     realValue, realReturnPct,
//     cw8Value,  cw8ReturnPct,
//     deltaEUR,  deltaPct,
//     startDate, endDate,
//     yearsSpan,
//     realCagr,  cw8Cagr,  cagrDelta,
//     buysCount,
//     cw8Symbol
//   }
function computeCw8Comparison() {
    // --- Vérifs de prérequis ---
    if (!Array.isArray(benchmarkSeriesCache) || benchmarkSeriesCache.length < 30) {
        return null;
    }
    const realAssets = assets.filter(a => !isPaperAsset(a));
    if (!realAssets.length) return null;

    // --- 1) Extraction de tous les flux d'achat ---
    // Chaque flux : { date: Date, amount: number }
    const flows = [];
    realAssets.forEach(a => {
        (a.buys || []).forEach(b => {
            const d = parseFlexDate(b.date);
            if (!d) return;
            const qty = Number(b.qty) || 0;
            const price = Number(b.price) || 0;
            const frais = Number(b.frais) || 0;
            const amount = qty * price + frais;
            if (amount > 0) flows.push({ date: d, amount });
        });
    });

    // Aucun buy : fallback sur invested au purchaseDate
    if (!flows.length) {
        realAssets.forEach(a => {
            if ((a.invested || 0) <= 0) return;
            const d = a.purchaseDate ? parseFlexDate(a.purchaseDate) : null;
            if (d) flows.push({ date: d, amount: a.invested });
        });
    }

    if (flows.length < 2) return null;
    flows.sort((a, b) => a.date - b.date);

    const firstBuyDate = flows[0].date;
    const today = new Date();
    const daysSpan = Math.round((today - firstBuyDate) / 864e5);
    if (daysSpan < 30) return null;

    // --- 2) Simulation CW8 : quantité de parts cumulée ---
    // Pour chaque flux, on calcule parts = amount / cours CW8 au jour du flux.
    let cumulatedCw8Shares = 0;
    let cumulatedInvested = 0;
    const cw8Buys = flows.map(f => {
        const price = _cw8PriceAt(f.date);
        const shares = price && price > 0 ? f.amount / price : 0;
        cumulatedCw8Shares += shares;
        cumulatedInvested += f.amount;
        return { date: f.date, amount: f.amount, price, shares };
    });

    const totalInvested = cumulatedInvested;
    if (totalInvested <= 0) return null;

    // --- 3) Reconstruction des deux séries jour par jour ---
    // On utilise la timeline du portefeuille réel (buildPortfolioTimeline)
    // et on calcule en parallèle la valeur CW8 au même moment.
    const realTimeline = buildPortfolioTimeline(realAssets);
    if (!realTimeline.rawDates.length) return null;

    const points = [];

    // Fonction utilitaire : quantité CW8 cumulée à une date donnée
    const sharesAtDate = (dateTs) => {
        let shares = 0;
        for (const b of cw8Buys) {
            if (b.date.getTime() <= dateTs && b.shares > 0) shares += b.shares;
        }
        return shares;
    };

    // Forward-fill : dernier cours CW8 connu avant chaque point
    let lastCw8Price = null;
    let cw8Idx = 0;
    const sortedCw8 = benchmarkSeriesCache.slice().sort((a, b) => a.date - b.date);

    realTimeline.rawDates.forEach((ts, i) => {
        // Avance dans la série CW8 jusqu'à dépasser ts
        while (cw8Idx < sortedCw8.length && sortedCw8[cw8Idx].date <= ts) {
            lastCw8Price = sortedCw8[cw8Idx].price;
            cw8Idx++;
        }
        const shares = sharesAtDate(ts);
        const cw8Value = (lastCw8Price && shares > 0) ? lastCw8Price * shares : 0;

        points.push({
            date: new Date(ts),
            realValue: realTimeline.valueSeries[i],
            cw8Value
        });
    });

    // Ajoute le point final "aujourd'hui" pour être certain
    const lastTs = today.getTime();
    if (points.length === 0 || points[points.length - 1].date.getTime() < lastTs - 864e5) {
        let lastPrice = null;
        for (const p of sortedCw8) { if (p.date <= lastTs) lastPrice = p.price; else break; }
        const shares = sharesAtDate(lastTs);
        const cw8Value = lastPrice ? lastPrice * shares : 0;
        const realTotal = realAssets.reduce((s, a) => s + (a.value || 0), 0);
        points.push({ date: new Date(lastTs), realValue: realTotal, cw8Value });
    }

    // --- 4) Valeurs finales ---
    const last = points[points.length - 1];
    const realValue = last.realValue;
    const cw8Value = last.cw8Value;

    // Si CW8 n'a jamais pu être calculé (série trop courte ou dates HS), abandon
    if (cw8Value <= 0) return null;

    const realReturnPct = totalInvested > 0 ? ((realValue - totalInvested) / totalInvested) * 100 : 0;
    const cw8ReturnPct  = totalInvested > 0 ? ((cw8Value  - totalInvested) / totalInvested) * 100 : 0;
    const deltaEUR = realValue - cw8Value;
    const deltaPct = realReturnPct - cw8ReturnPct;

    // --- 5) CAGR annualisé ---
    const yearsSpan = daysSpan / 365.25;
    const cagr = (finalVal) => {
        if (totalInvested <= 0 || yearsSpan <= 0.01) return 0;
        const ratio = finalVal / totalInvested;
        if (ratio <= 0) return -1;
        return Math.pow(ratio, 1 / yearsSpan) - 1;
    };
    const realCagr = cagr(realValue);
    const cw8Cagr  = cagr(cw8Value);
    const cagrDelta = realCagr - cw8Cagr;

    return {
        points,
        totalInvested,
        realValue,   realReturnPct,
        cw8Value,    cw8ReturnPct,
        deltaEUR,    deltaPct,
        startDate:   firstBuyDate,
        endDate:     today,
        yearsSpan,
        realCagr, cw8Cagr, cagrDelta,
        buysCount:   flows.length,
        cw8Symbol:   (typeof benchmarkMetaCache !== 'undefined' && benchmarkMetaCache && benchmarkMetaCache.symbol)
                        ? benchmarkMetaCache.symbol : 'CW8.PA'
    };
}

// Wrapper avec cache : ne recalcule que si les données ont changé
function getCw8Comparison() {
    const key = _computeCw8CacheKey();
    if (_cw8ComparisonCache && _cw8CacheKey === key) {
        return _cw8ComparisonCache;
    }
    const result = computeCw8Comparison();
    _cw8ComparisonCache = result;
    _cw8CacheKey = key;
    return result;
}

// Invalide le cache (utile après une modification du portefeuille)
function invalidateCw8ComparisonCache() {
    _cw8ComparisonCache = null;
    _cw8CacheKey = '';
}

// =====================================================================
// RENDU DU COMPARATEUR (Chantier §3)
// =====================================================================
let _cw8ChartInstance = null;

// Calcule la raison précise de l'état vide
function _cw8EmptyReason() {
    if (!Array.isArray(benchmarkSeriesCache) || benchmarkSeriesCache.length === 0) {
        return 'Le benchmark CW8.PA n\'est pas encore téléchargé. Cliquez sur le bouton ci-dessous pour le récupérer.';
    }
    if (benchmarkSeriesCache.length < 30) {
        return `Le benchmark CW8 ne contient que ${benchmarkSeriesCache.length} point(s) — 30 minimum requis. Relancez le téléchargement.`;
    }
    const realAssets = assets.filter(a => !isPaperAsset(a));
    if (!realAssets.length) {
        return 'Votre portefeuille est vide — ajoutez des actifs pour activer la comparaison.';
    }

    // Compter les flux datés
    let flowsCount = 0;
    let firstDate = null;
    realAssets.forEach(a => {
        (a.buys || []).forEach(b => {
            const d = parseFlexDate(b.date);
            if (!d) return;
            const qty = Number(b.qty) || 0;
            const price = Number(b.price) || 0;
            const frais = Number(b.frais) || 0;
            if (qty * price + frais > 0) {
                flowsCount++;
                if (!firstDate || d < firstDate) firstDate = d;
            }
        });
    });

    if (flowsCount === 0) {
        return 'Aucun flux d\'achat daté n\'est enregistré. Les achats doivent être saisis avec une date pour permettre la comparaison.';
    }
    if (flowsCount < 2) {
        return `Un seul flux d'achat détecté — au moins 2 sont nécessaires pour comparer des trajectoires.`;
    }
    if (firstDate) {
        const daysSpan = Math.round((Date.now() - firstDate.getTime()) / 864e5);
        if (daysSpan < 30) {
            return `Le premier achat date de ${daysSpan} jour(s) — au moins 30 jours requis pour une comparaison significative.`;
        }
    }
    return 'Données insuffisantes pour la comparaison.';
}

// Rendu principal — appelé à chaque renderCw8Comparison
function renderCw8Comparison() {
    const card      = document.getElementById('cw8-compare-card');
    if (!card) return;

    const emptyEl   = document.getElementById('cw8-empty-state');
    const reasonEl  = document.getElementById('cw8-empty-reason');
    const contentEl = document.getElementById('cw8-content');

    // Met à jour le libellé du symbole benchmark
    const symbol = (typeof benchmarkMetaCache !== 'undefined' && benchmarkMetaCache && benchmarkMetaCache.symbol)
        ? benchmarkMetaCache.symbol : 'CW8.PA';
    const symLabel = document.getElementById('cw8-symbol-label');
    const symLabelInline = document.getElementById('cw8-symbol-label-inline');
    if (symLabel) symLabel.innerText = symbol;
    if (symLabelInline) symLabelInline.innerText = symbol;

    // Récupère les données (avec cache)
    const data = (typeof getCw8Comparison === 'function') ? getCw8Comparison() : null;

    if (!data) {
        // État vide
        if (emptyEl) emptyEl.classList.remove('hidden');
        if (contentEl) contentEl.classList.add('hidden');
        if (reasonEl) reasonEl.innerText = _cw8EmptyReason();
        // Détruit le graphique si présent
        if (_cw8ChartInstance) { _cw8ChartInstance.destroy(); _cw8ChartInstance = null; }
        return;
    }

    // Contenu principal
    if (emptyEl) emptyEl.classList.add('hidden');
    if (contentEl) contentEl.classList.remove('hidden');

    // --- Verdict ---
    const deltaEUR = data.deltaEUR;
    const realWins = deltaEUR >= 0;
    const bannerEl = document.getElementById('cw8-verdict-banner');
    const iconEl   = document.getElementById('cw8-verdict-icon');
    const titleEl  = document.getElementById('cw8-verdict-title');
    const subEl    = document.getElementById('cw8-verdict-subtitle');
    const deltaEl  = document.getElementById('cw8-verdict-delta');
    const deltaPctEl = document.getElementById('cw8-verdict-delta-pct');

    if (bannerEl) {
        bannerEl.className = 'rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 ' +
            (realWins
                ? 'bg-gradient-to-br from-emerald-950/60 to-teal-950/40 border border-emerald-800/50'
                : 'bg-gradient-to-br from-amber-950/60 to-rose-950/40 border border-amber-800/50');
    }
    if (iconEl) {
        iconEl.className = 'flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-xl ' +
            (realWins
                ? 'bg-emerald-950 border border-emerald-700/60 text-emerald-300'
                : 'bg-amber-950 border border-amber-700/60 text-amber-300');
        iconEl.innerHTML = realWins
            ? '<i class="fa-solid fa-trophy"></i>'
            : '<i class="fa-solid fa-triangle-exclamation"></i>';
    }
    if (titleEl) {
        titleEl.innerText = realWins
            ? 'Votre sélection a battu le MSCI World'
            : 'Vous auriez mieux fait de tout mettre sur CW8';
    }
    if (subEl) {
        const diffPctAbs = Math.abs(data.deltaPct).toFixed(2);
        subEl.innerText = realWins
            ? `Sur ${data.yearsSpan.toFixed(1)} ans, votre portefeuille a surperformé l'indice de ${diffPctAbs} % (CAGR : ${(data.realCagr * 100).toFixed(2)} % vs ${(data.cw8Cagr * 100).toFixed(2)} %).`
            : `Sur ${data.yearsSpan.toFixed(1)} ans, un investissement 100 % CW8 aurait produit ${diffPctAbs} % de plus (CAGR : ${(data.cw8Cagr * 100).toFixed(2)} % vs ${(data.realCagr * 100).toFixed(2)} %).`;
    }
    if (deltaEl) {
        deltaEl.className = 'text-2xl font-bold font-mono ' + (realWins ? 'text-emerald-300' : 'text-rose-300');
        deltaEl.innerText = (deltaEUR >= 0 ? '+' : '') + formatEUR(deltaEUR);
    }
    if (deltaPctEl) {
        deltaPctEl.className = 'text-[11px] font-mono ' + (realWins ? 'text-emerald-400' : 'text-rose-400');
        deltaPctEl.innerText = (data.deltaPct >= 0 ? '+' : '') + data.deltaPct.toFixed(2) + ' %';
    }

    // --- KPIs ---
    const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };

    setText('cw8-kpi-real-value', formatEUR(data.realValue));
    setText('cw8-kpi-real-return', (data.realReturnPct >= 0 ? '+' : '') + data.realReturnPct.toFixed(2) + ' %');
    setText('cw8-kpi-real-cagr', 'CAGR ' + (data.realCagr * 100).toFixed(2) + ' % / an');

    setText('cw8-kpi-cw8-value', formatEUR(data.cw8Value));
    setText('cw8-kpi-cw8-return', (data.cw8ReturnPct >= 0 ? '+' : '') + data.cw8ReturnPct.toFixed(2) + ' %');
    setText('cw8-kpi-cw8-cagr', 'CAGR ' + (data.cw8Cagr * 100).toFixed(2) + ' % / an');

    setText('cw8-kpi-invested', formatEUR(data.totalInvested));
    setText('cw8-kpi-flows', `${data.buysCount} flux d'achat`);

    const fmt = d => d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
    setText('cw8-kpi-period', `${fmt(data.startDate)} → ${fmt(data.endDate)}`);
    setText('cw8-kpi-span', data.yearsSpan.toFixed(2) + ' an(s)');

    // --- Graphique ---
    _renderCw8Chart(data);
}

// Graphique superposé Chart.js
function _renderCw8Chart(data) {
    const canvas = document.getElementById('cw8CompareChart');
    if (!canvas) return;

    // Filtre les points où CW8 n'est pas encore calculable (early exit)
    const validPoints = data.points.filter(p => p.cw8Value > 0 || p.realValue > 0);
    if (validPoints.length < 2) {
        if (_cw8ChartInstance) { _cw8ChartInstance.destroy(); _cw8ChartInstance = null; }
        return;
    }

    const labels = validPoints.map(p =>
        p.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })
    );
    const realSeries = validPoints.map(p => Math.round(p.realValue * 100) / 100);
    const cw8Series  = validPoints.map(p => Math.round(p.cw8Value * 100) / 100);

    if (_cw8ChartInstance) _cw8ChartInstance.destroy();

    _cw8ChartInstance = createChart('cw8CompareChart', {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Votre portefeuille',
                    data: realSeries,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16,185,129,0.10)',
                    tension: 0.3,
                    fill: true,
                    pointRadius: 0,
                    borderWidth: 2
                },
                {
                    label: `100 % ${data.cw8Symbol}`,
                    data: cw8Series,
                    borderColor: '#d946ef',
                    backgroundColor: 'rgba(217,70,239,0.08)',
                    tension: 0.3,
                    fill: true,
                    pointRadius: 0,
                    borderWidth: 2,
                    borderDash: [5, 3]
                }
            ]
        },
        options: {
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    labels: {
                        color: _chartLegendColor(),
                        boxWidth: 12,
                        font: { size: 11 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label} : ${formatEUR(ctx.parsed.y)}`
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: _chartTickColor(), maxTicksLimit: 8, font: { size: 10 }, maxRotation: 0 },
                    grid: { color: _chartGridColor() }
                },
                y: {
                    grace: '10%',
                    ticks: {
                        color: _chartTickColor(),
                        font: { size: 10 },
                        callback: (v) => v >= 1000 ? (v / 1000).toFixed(0) + ' k€' : v + ' €'
                    },
                    grid: { color: _chartGridColor() }
                }
            }
        }
    });
}

// Force un recalcul (invalide le cache) + re-rendu
function refreshCw8Comparison() {
    if (typeof invalidateCw8ComparisonCache === 'function') {
        invalidateCw8ComparisonCache();
    }
    renderCw8Comparison();
    if (typeof toastInfo === 'function') {
        toastInfo('Comparateur CW8 recalculé', 'Les trajectoires ont été mises à jour.');
    }
}

// ---------------------------------------------------------------------
// INITIALISATION
// ---------------------------------------------------------------------
function initBenchmarkCompareModule() {
    // Le rendu est déclenché par renderCw8Comparison() (appelé depuis
    // refreshAllUI et via un hook sur refreshBenchmarkSeries).
    console.info('[BenchmarkCompare] Module chargé — comparateur CW8 prêt.');
}

// Expose l'API globalement
window.computeCw8Comparison = computeCw8Comparison;
window.getCw8Comparison = getCw8Comparison;
window.invalidateCw8ComparisonCache = invalidateCw8ComparisonCache;
window.renderCw8Comparison = renderCw8Comparison;
window.refreshCw8Comparison = refreshCw8Comparison;