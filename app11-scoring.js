// =====================================================================
// app11-scoring.js — NOTATION / SCORING DES ACTIFS (Chantier H)
// Dépend de : app1-core.js, app5-fiscal.js (computeRiskMetricsFromAssets),
//             app10-tir.js (getAssetTIR, computeTIR)
// Charge après app10-tir.js, avant app7-init.js
// =====================================================================

// ---------------------------------------------------------------------
// BARÈMES ET CACHE
// ---------------------------------------------------------------------
const SCORE_MAX = {
    TIR:            30,
    SHARPE:         20,
    FRAIS:          15,
    ALPHA:          15,
    ANCIENNETE:     10,
    CONCENTRATION:  10
};

// Rendements réels annualisés du MSCI World — mémoïsé (invariant du runtime)
const _benchmarkAnnualMeanCache = (() => {
    const rs = Object.values(MSCI_WORLD_ANNUAL_RETURNS_EUR);
    return rs.reduce((a, b) => a + b, 0) / rs.length;
})();
function _benchmarkAnnualMean() {
    return _benchmarkAnnualMeanCache;
}

const _scoreCache = new Map();

function _scoreCacheKey(asset) {
    return asset.id + '|' + (asset.value || 0) + '|' + (asset.qty || 0) + '|' + ((asset.buys || []).length);
}

function invalidateScoringCache() {
    _scoreCache.clear();
}

// ---------------------------------------------------------------------
// CALCUL DU SCORE
// ---------------------------------------------------------------------
function computeAssetScore(asset) {
    if (!asset) return null;
    const key = _scoreCacheKey(asset);
    if (_scoreCache.has(key)) return _scoreCache.get(key);

    const details = {
        tir:           { pts: 0, max: SCORE_MAX.TIR,           label: 'TRI annualisé',          info: '—' },
        sharpe:        { pts: 0, max: SCORE_MAX.SHARPE,        label: 'Sharpe estimé',          info: '—' },
        frais:         { pts: 0, max: SCORE_MAX.FRAIS,         label: 'Frais relatifs',         info: '—' },
        alpha:         { pts: 0, max: SCORE_MAX.ALPHA,         label: 'Alpha vs MSCI World',    info: '—' },
        anciennete:    { pts: 0, max: SCORE_MAX.ANCIENNETE,    label: 'Ancienneté de la position', info: '—' },
        concentration: { pts: 0, max: SCORE_MAX.CONCENTRATION, label: 'Bonus concentration',    info: '—' }
    };

    // === 1) TRI annualisé (30 pts) =====================================
    // Compare le TRI au benchmark (rendement moyen du MSCI World).
    // Un TRI = benchmark donne 60 % des points ; TRI double du benchmark = 100 %.
    const benchMean = _benchmarkAnnualMean();
    let tir = null;
    try { tir = (typeof getAssetTIR === 'function') ? getAssetTIR(asset) : null; } catch (_) {}
    if (tir !== null && Number.isFinite(tir)) {
        const ratio = tir / benchMean;
        // Clip entre 0 et 1.4 : au-delà du benchmark ×1.4 → score max
        const clipped = Math.max(0, Math.min(1.4, ratio));
        details.tir.pts  = (clipped / 1.4) * SCORE_MAX.TIR;
        details.tir.info = (tir >= 0 ? '+' : '') + (tir * 100).toFixed(1) + ' % (bench. ' + (benchMean * 100).toFixed(1) + ' %)';
    } else {
        // Pas de TRI calculable : 25 % des points par défaut (neutre)
        details.tir.pts  = SCORE_MAX.TIR * 0.25;
        details.tir.info = 'historique insuffisant';
    }

    // === 2) Sharpe de l'actif (20 pts) =================================
    // Réutilise computeRiskMetricsFromAssets([asset]). Sharpe 1.5 → score max.
    let sharpe = null, volAnnual = null;
    try {
        const rm = computeRiskMetricsFromAssets([asset]);
        if (rm && Number.isFinite(rm.sharpe)) {
            sharpe = rm.sharpe;
            volAnnual = rm.volatility;
        }
    } catch (_) {}
    if (sharpe !== null) {
        const clipped = Math.max(0, Math.min(1.5, sharpe));
        details.sharpe.pts  = (clipped / 1.5) * SCORE_MAX.SHARPE;
        details.sharpe.info = sharpe.toFixed(2) + (volAnnual !== null ? ' · vol. ' + (volAnnual * 100).toFixed(0) + ' %' : '');
    } else {
        details.sharpe.pts  = SCORE_MAX.SHARPE * 0.25;
        details.sharpe.info = 'historique insuffisant';
    }

    // === 3) Frais relatifs (15 pts) ====================================
    // Ratio frais / investi. 0 % → 100 %, 2 % → 0 %.
    const invested = asset.invested || 0;
    const frais    = asset.frais    || 0;
    if (invested > 0) {
        const ratio = frais / invested;
        const score = Math.max(0, 1 - (ratio / 0.02));
        details.frais.pts  = score * SCORE_MAX.FRAIS;
        details.frais.info = (ratio * 100).toFixed(2) + ' % du capital investi';
    } else {
        details.frais.pts  = SCORE_MAX.FRAIS * 0.5;
        details.frais.info = '—';
    }

    // === 4) Alpha vs MSCI World (15 pts) ===============================
    // Compare le TRI au benchmark : +5 pts par point d'alpha positif, 0 si négatif.
    if (tir !== null && Number.isFinite(tir)) {
        const alpha = tir - benchMean;
        // alpha 0 → 50 % des points (neutre, on a fait comme le marché)
        // alpha +5 % → 100 % des points ; alpha -5 % → 0 %
        const norm = Math.max(0, Math.min(1, 0.5 + (alpha / 0.10)));
        details.alpha.pts  = norm * SCORE_MAX.ALPHA;
        details.alpha.info = (alpha >= 0 ? '+' : '') + (alpha * 100).toFixed(1) + ' pts vs benchmark';
    } else {
        details.alpha.pts  = SCORE_MAX.ALPHA * 0.25;
        details.alpha.info = 'non calculable';
    }

    // === 5) Ancienneté (10 pts) ========================================
    // Récompense la fidélité : 0 ans = 0 pt, 5 ans = 100 % des points.
    let oldestDate = null;
    (asset.lots || []).forEach(l => {
        if ((l.qtyRemaining || 0) <= 0) return;
        const d = parseFlexDate(l.date);
        if (d && (!oldestDate || d < oldestDate)) oldestDate = d;
    });
    if (!oldestDate && asset.purchaseDate) {
        const d = parseFlexDate(asset.purchaseDate);
        if (d) oldestDate = d;
    }
    if (oldestDate) {
        const years = (Date.now() - oldestDate.getTime()) / (365.25 * 864e5);
        details.anciennete.pts  = Math.min(1, years / 5) * SCORE_MAX.ANCIENNETE;
        details.anciennete.info = years.toFixed(1) + ' an(s)';
    } else {
        details.anciennete.pts  = 0;
        details.anciennete.info = 'date inconnue';
    }

    // === 6) Concentration (10 pts) =====================================
    // Pénalise les actifs qui pèsent plus de 25 % du portefeuille.
    // Poids ≤ 10 % → 100 % des points ; 25 % → 0 %.
    const realAssets = assets.filter(a => !isPaperAsset(a));
    const total = realAssets.reduce((s, a) => s + (a.value || 0), 0);
    if (total > 0) {
        const weight = (asset.value || 0) / total;
        const norm = weight <= 0.10 ? 1
                   : weight >= 0.25 ? 0
                   : (0.25 - weight) / 0.15;
        details.concentration.pts  = norm * SCORE_MAX.CONCENTRATION;
        details.concentration.info = (weight * 100).toFixed(1) + ' % du portefeuille';
    } else {
        details.concentration.pts  = SCORE_MAX.CONCENTRATION * 0.5;
        details.concentration.info = '—';
    }

    // Score total
    const totalScore = Math.round(Object.values(details).reduce((s, d) => s + d.pts, 0));

    const result = { total: totalScore, details, assetId: asset.id };
    _scoreCache.set(key, result);
    return result;
}

// ---------------------------------------------------------------------
// FORMATAGE VISUEL
// ---------------------------------------------------------------------
// Convertit un score 0-100 en 5 étoiles (pleines, demi, vides).
function scoreToStars(score) {
    const stars = Math.round((score / 100) * 10) / 2; // 0, 0.5, 1, 1.5, ... 5
    let html = '';
    for (let i = 1; i <= 5; i++) {
        if (stars >= i)         html += '<i class="fa-solid fa-star"></i>';
        else if (stars >= i - 0.5) html += '<i class="fa-solid fa-star-half-stroke"></i>';
        else                    html += '<i class="fa-regular fa-star"></i>';
    }
    return html;
}

function scoreColorClass(score) {
    if (score >= 75) return 'text-amber-400';
    if (score >= 50) return 'text-emerald-400';
    if (score >= 25) return 'text-amber-300';
    return 'text-rose-400';
}

// Cellule HTML pour la colonne Score dans l'inventaire
function scoreCellHTML(asset) {
    const r = computeAssetScore(asset);
    if (!r) return '<span class="text-gray-600">—</span>';
    const cls = scoreColorClass(r.total);
    const stars = scoreToStars(r.total);
    return `<div class="inline-flex flex-col items-center gap-0.5 cursor-pointer" onclick="event.stopPropagation(); openScoringDetailModal(${asset.id})" title="Score ${r.total}/100 — cliquez pour voir la décomposition">
        <span class="${cls} text-[10px] tracking-tight">${stars}</span>
        <span class="text-[10px] font-mono ${cls}">${r.total}/100</span>
    </div>`;
}

// ---------------------------------------------------------------------
// MODAL DÉTAIL — décomposition d'un score
// ---------------------------------------------------------------------
function openScoringDetailModal(assetId) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;
    const r = computeAssetScore(asset);
    if (!r) return;

    document.getElementById('scoring-modal-title').innerHTML =
        `<i class="fa-solid fa-star text-amber-400"></i> Score : ${escapeHTML(asset.name)}`;

    const cls = scoreColorClass(r.total);
    const stars = scoreToStars(r.total);

    document.getElementById('scoring-modal-body').innerHTML = `
        <div class="bg-gray-950 border border-gray-800 rounded-xl p-4 text-center">
            <div class="${cls} text-2xl tracking-tight mb-1">${stars}</div>
            <div class="text-3xl font-bold font-mono ${cls}">${r.total} <span class="text-gray-500 text-base">/ 100</span></div>
            <div class="text-[10px] text-gray-500 mt-1">${escapeHTML(asset.name)} · ${escapeHTML(asset.ticker)}</div>
        </div>

        <div class="space-y-2">
            ${Object.values(r.details).map(d => {
                const pct = (d.pts / d.max) * 100;
                const barCls = pct >= 75 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-rose-500';
                return `<div class="bg-gray-950 border border-gray-800 rounded-lg p-2.5">
                    <div class="flex justify-between items-baseline gap-2 mb-1">
                        <span class="text-[11px] font-bold text-white">${d.label}</span>
                        <span class="text-[10px] font-mono text-gray-400">${d.pts.toFixed(1)} / ${d.max} pts</span>
                    </div>
                    <div class="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden mb-1">
                        <div class="${barCls} h-full transition-all" style="width:${Math.max(0, Math.min(100, pct))}%"></div>
                    </div>
                    <div class="text-[10px] text-gray-500 font-mono">${escapeHTML(d.info)}</div>
                </div>`;
            }).join('')}
        </div>

        <div class="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-[10px] text-gray-500 leading-relaxed">
            <i class="fa-solid fa-circle-info mr-1"></i>
            Le score est recalculé automatiquement à chaque rafraîchissement de l'app. Un critère sans données suffisantes reçoit 25 % de ses points (neutre).
        </div>
    `;
    document.getElementById('modal-scoring-detail').classList.remove('hidden');
}

function openScoringMethodModal() {
    document.getElementById('modal-scoring-method').classList.remove('hidden');
}

// ---------------------------------------------------------------------
// LEADERBOARD — Top 5 / Flop 5
// ---------------------------------------------------------------------
function renderScoringLeaderboard() {
    const topEl = document.getElementById('scoring-top5');
    const flopEl = document.getElementById('scoring-flop5');
    if (!topEl || !flopEl) return;

    const realAssets = assets.filter(a => !isPaperAsset(a));
    if (!realAssets.length) {
        topEl.innerHTML = '<div class="text-gray-500 italic text-xs text-center py-4">Aucun actif réel à noter.</div>';
        flopEl.innerHTML = '';
        return;
    }

    // Score de chaque actif
    const scored = realAssets.map(a => ({ asset: a, score: computeAssetScore(a) }))
                             .filter(x => x.score);

    // Tri décroissant
    scored.sort((a, b) => b.score.total - a.score.total);

    const top5  = scored.slice(0, 5);
    const flop5 = scored.slice(-5).reverse();  // les 5 derniers, du plus mauvais au moins mauvais

    const rowHTML = (x) => {
        const a = x.asset;
        const cls = scoreColorClass(x.score.total);
        const stars = scoreToStars(x.score.total);
        const pnl = (a.value || 0) - (a.invested || 0);
        const pnlCls = pnl >= 0 ? 'text-emerald-400' : 'text-rose-400';
        return `<div class="clickable-row flex items-center gap-2 p-2 bg-gray-950 border border-gray-800 rounded-lg cursor-pointer hover:border-gray-700 transition" onclick="openScoringDetailModal(${a.id})">
            ${assetClassIconHTML(a)}
            <div class="min-w-0 flex-1">
                <div class="font-bold text-white text-[11px] truncate">${escapeHTML(a.name)}</div>
                <div class="text-[9px] text-gray-500 font-mono truncate">${escapeHTML(a.ticker)} · ${formatEUR(a.value)} · <span class="${pnlCls}">${pnl >= 0 ? '+' : ''}${formatEUR(pnl)}</span></div>
            </div>
            <div class="text-right flex-shrink-0">
                <div class="${cls} text-[10px]">${stars}</div>
                <div class="${cls} font-mono font-bold text-xs">${x.score.total}</div>
            </div>
        </div>`;
    };

    topEl.innerHTML = top5.length
        ? top5.map(rowHTML).join('')
        : '<div class="text-gray-500 italic text-xs text-center py-4">—</div>';

    flopEl.innerHTML = flop5.length
        ? flop5.map(rowHTML).join('')
        : '<div class="text-gray-500 italic text-xs text-center py-4">—</div>';
}

// ---------------------------------------------------------------------
// RAFRAÎCHISSEMENT GLOBAL
// ---------------------------------------------------------------------
function refreshScoring() {
    invalidateScoringCache();
    renderScoringLeaderboard();
    // Le tableau d'inventaire est re-rendu par renderInventoryTable() qui
    // appelle scoreCellHTML() → invalidation automatique par cache.
}