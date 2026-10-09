// =====================================================================
// app42-dead-lines.js — DÉTECTION DES "PETITES LIGNES MORTES" (Chantier #10)
// Dépend de : app1-core.js (assets, formatEUR, escapeHTML, isPaperAsset)
//             app2-ui.js (assetClassIconHTML, rowTintClass)
//             app3-charts.js (_enrichLotsForAsset)
//             app10-tir.js (getAssetDividendsSinceMonths)
//             app11-scoring.js (computeAssetScore)
//             app14-suggestions.js (pattern visuel)
//             app22-toasts.js (toasts)
//             app36-waterfall.js (pattern modal dynamique)
//             app39-thesis.js (hasThesis, getThesisAgeDays)
// Charge après app41-pwa.js, avant tests.js
// =====================================================================
//
// Détecte les positions qui cumulent plusieurs signaux faibles sans
// avoir aucun signal fort positif qui justifierait leur présence :
//   • Poids < 0,5 % du portefeuille
//   • Performance plate (P&L entre -10 % et +10 %) sur > 1 an
//   • Frais relatifs élevés (> 3 % du capital)
//   • Score d'actif bas (< 25/100)
//   • Absence de thèse d'investissement
//
// Renvoie un score 0-100 par actif ("score de ligne morte") :
//   • 70-100 : 🔴 Ligne morte confirmée — candidat à la purge
//   • 40-69  : 🟠 Ligne dormante — à surveiller ou renforcer
//   • < 40   : non listée
//
// ACTIONS DISPONIBLES :
//   • Purger    → ouvre le simulateur de vente (aucune modification directe)
//   • Renforcer → ouvre le formulaire d'ajout pré-rempli sur le même actif
//   • Marquer comme revue → flag persistant sur l'asset (12 mois)
//   • Voir le détail → modal explicatif du score ligne par ligne
//
// STOCKAGE :
//   asset.deadLineReviewedAt : timestamp (ms). Si présent et < 12 mois,
//   la ligne reste détectée mais n'est plus listée dans la section.

const DEAD_LINE_REVIEW_COOLDOWN_MS = 365 * 24 * 3600 * 1000;   // 12 mois
const DEAD_LINE_DEFAULT_THRESHOLD = 40;                         // seuil de signalement
const DEAD_LINE_CRITICAL_THRESHOLD = 70;                        // ligne morte confirmée

// Pondérations des 6 signaux. La somme est normalisée à 1 par construction.
const DEAD_LINE_WEIGHTS = {
    lowWeight:       0.25,
    flatPerformance: 0.25,
    inactivityAge:   0.15,
    feeRatio:        0.10,
    lowAssetScore:   0.15,
    noThesis:        0.10
};

// =====================================================================
// 1) CALCUL DES 6 SIGNAUX
// =====================================================================
// Chaque signal renvoie { points: 0-100, reason: string }.
// Les fonctions sont PURES : elles ne dépendent que des arguments.

// Signal 1 — Poids faible dans le portefeuille
//   < 0,5 %  → 100 points
//   0,5-1 %  → dégressif 100 → 60
//   1-2 %    → dégressif 60 → 0
//   ≥ 2 %    → 0
function _dlSignalLowWeight(asset, totalValue) {
    if (totalValue <= 0) return { points: 0, reason: '—' };
    const weight = (asset.value || 0) / totalValue;
    const pct = weight * 100;

    if (pct < 0.5) return { points: 100, reason: `${pct.toFixed(2)} % du portefeuille` };
    if (pct < 1)   return { points: 100 - ((pct - 0.5) / 0.5) * 40, reason: `${pct.toFixed(2)} % du portefeuille` };
    if (pct < 2)   return { points: 60 - ((pct - 1) / 1) * 60, reason: `${pct.toFixed(2)} % du portefeuille` };
    return { points: 0, reason: `${pct.toFixed(2)} % du portefeuille` };
}

// Signal 2 — Performance plate (ni gain ni perte significatifs)
//   Nécessite une ancienneté > 1 an (sinon une ligne jeune est normale)
//   |P&L %| < 10 %  → 100 points
//   10-30 %         → dégressif 100 → 0
//   > 30 %          → 0
function _dlSignalFlatPerformance(asset) {
    const invested = asset.invested || 0;
    if (invested <= 0) return { points: 0, reason: '—' };

    // Ancienneté : on prend le lot le plus ancien encore détenu
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
    if (!oldestDate) return { points: 0, reason: 'ancienneté inconnue' };

    const years = (Date.now() - oldestDate.getTime()) / (365.25 * 864e5);
    if (years < 1) return { points: 0, reason: `détenue depuis ${years.toFixed(1)} an(s)` };

    const pnlPct = ((asset.value || 0) - invested) / invested * 100;
    const abs = Math.abs(pnlPct);

    let pts;
    if (abs < 10)      pts = 100;
    else if (abs < 30) pts = 100 - ((abs - 10) / 20) * 100;
    else               pts = 0;

    const sign = pnlPct >= 0 ? '+' : '';
    return { points: pts, reason: `${sign}${pnlPct.toFixed(2)} % sur ${years.toFixed(1)} an(s)` };
}

// Signal 3 — Ancienneté inactive
//   Pénalise une position ancienne sans performance significative.
//   Nécessite P&L% < 20 % (au-delà, c'est un succès, pas une mort).
//   0-2 ans    → 0
//   2-5 ans    → linéaire 0 → 100
//   > 5 ans    → 100
function _dlSignalInactivityAge(asset) {
    const invested = asset.invested || 0;
    if (invested <= 0) return { points: 0, reason: '—' };

    const pnlPct = ((asset.value || 0) - invested) / invested * 100;
    if (pnlPct >= 20) return { points: 0, reason: `perf +${pnlPct.toFixed(1)} % (> 20 %)` };

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
    if (!oldestDate) return { points: 0, reason: '—' };

    const years = (Date.now() - oldestDate.getTime()) / (365.25 * 864e5);
    let pts;
    if (years < 2)      pts = 0;
    else if (years < 5) pts = ((years - 2) / 3) * 100;
    else                pts = 100;

    return { points: pts, reason: `${years.toFixed(1)} an(s) de détention` };
}

// Signal 4 — Frais relatifs élevés
//   frais / invested :
//     < 1 %  → 0
//     1-3 %  → 0 → 60
//     3-5 %  → 60 → 100
//     > 5 %  → 100
function _dlSignalFeeRatio(asset) {
    const invested = asset.invested || 0;
    const frais = asset.frais || 0;
    if (invested <= 0) return { points: 0, reason: '—' };

    const ratio = (frais / invested) * 100;
    let pts;
    if (ratio < 1)      pts = 0;
    else if (ratio < 3) pts = ((ratio - 1) / 2) * 60;
    else if (ratio < 5) pts = 60 + ((ratio - 3) / 2) * 40;
    else                pts = 100;

    return { points: pts, reason: `${ratio.toFixed(2)} % de frais sur le capital` };
}

// Signal 5 — Score d'actif faible (issu du leaderboard, app11-scoring.js)
//   score < 25 → 100 points
//   25-50      → dégressif 100 → 0
//   ≥ 50       → 0
function _dlSignalLowAssetScore(asset) {
    let score = null;
    try {
        const r = (typeof computeAssetScore === 'function') ? computeAssetScore(asset) : null;
        if (r && Number.isFinite(r.total)) score = r.total;
    } catch (_) {}
    if (score === null) return { points: 0, reason: 'score indisponible' };

    let pts;
    if (score < 25)      pts = 100;
    else if (score < 50) pts = 100 - ((score - 25) / 25) * 100;
    else                 pts = 0;

    return { points: pts, reason: `score ${score}/100` };
}

// Signal 6 — Thèse absente (garde-fou émotionnel)
//   Pénalise les petites lignes (< 1 %) sans thèse documentée.
//   < 1 % ET !hasThesis → 100
//   < 2 % ET !hasThesis → 60
//   sinon                → 0
function _dlSignalNoThesis(asset, totalValue) {
    const has = (typeof hasThesis === 'function') ? hasThesis(asset) : false;
    if (has) return { points: 0, reason: 'thèse documentée' };

    if (totalValue <= 0) return { points: 0, reason: 'pas de thèse' };
    const weight = (asset.value || 0) / totalValue;
    const pct = weight * 100;

    if (pct < 1) return { points: 100, reason: `pas de thèse (poids ${pct.toFixed(2)} %)` };
    if (pct < 2) return { points: 60,  reason: `pas de thèse (poids ${pct.toFixed(2)} %)` };
    return { points: 0, reason: 'pas de thèse' };
}

// =====================================================================
// 2) SCORE GLOBAL D'UNE LIGNE
// =====================================================================
// Fonction PURE (hors dépendance à `assets` global pour le total).
// Retourne { score, details, isReviewed, reviewedAt, isCritical }.
function computeDeadLineScore(asset, totalValue) {
    if (!asset) return null;

    // Calcule le total si non fourni (pour usage isolé dans tests.js)
    if (!Number.isFinite(totalValue)) {
        const realAssets = assets.filter(a => !isPaperAsset(a));
        totalValue = realAssets.reduce((s, a) => s + (a.value || 0), 0);
    }

    const signals = {
        lowWeight:       _dlSignalLowWeight(asset, totalValue),
        flatPerformance: _dlSignalFlatPerformance(asset),
        inactivityAge:   _dlSignalInactivityAge(asset),
        feeRatio:        _dlSignalFeeRatio(asset),
        lowAssetScore:   _dlSignalLowAssetScore(asset),
        noThesis:        _dlSignalNoThesis(asset, totalValue)
    };

    // Score pondéré
    let weightedSum = 0;
    let totalWeight = 0;
    Object.entries(DEAD_LINE_WEIGHTS).forEach(([key, w]) => {
        weightedSum += (signals[key].points || 0) * w;
        totalWeight += w;
    });
    const score = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

    // Flag "revue récente"
    const reviewedAt = asset.deadLineReviewedAt || null;
    const isReviewed = !!(reviewedAt && (Date.now() - reviewedAt) < DEAD_LINE_REVIEW_COOLDOWN_MS);

    return {
        score,
        details: signals,
        isReviewed,
        reviewedAt,
        isCritical: score >= DEAD_LINE_CRITICAL_THRESHOLD
    };
}

// =====================================================================
// 3) DÉTECTION GLOBALE
// =====================================================================
// Parcourt tous les actifs réels et retourne ceux dont le score dépasse
// le seuil, triés par score décroissant. Les lignes marquées "revues"
// récemment sont exclues par défaut (option includeReviewed).
//
// Retourne :
//   {
//     lines: [ { asset, score, details, isCritical, isReviewed } ],
//     totalValue,
//     threshold,
//     counts: { critical, dormant, total },
//     potentialCapital: somme des valeurs des lignes mortes
//   }
function detectDeadLines(options = {}) {
    const threshold = Number.isFinite(options.threshold) ? options.threshold : DEAD_LINE_DEFAULT_THRESHOLD;
    const includeReviewed = !!options.includeReviewed;

    const realAssets = assets.filter(a => !isPaperAsset(a));
    const totalValue = realAssets.reduce((s, a) => s + (a.value || 0), 0);

    const lines = [];
    realAssets.forEach(a => {
        const r = computeDeadLineScore(a, totalValue);
        if (!r) return;
        if (r.score < threshold) return;
        if (!includeReviewed && r.isReviewed) return;
        lines.push({ asset: a, ...r });
    });

    lines.sort((a, b) => b.score - a.score);

    const critical = lines.filter(l => l.isCritical).length;
    const dormant = lines.length - critical;
    const potentialCapital = lines.reduce((s, l) => s + (l.asset.value || 0), 0);

    return {
        lines,
        totalValue,
        threshold,
        counts: { critical, dormant, total: lines.length },
        potentialCapital
    };
}

// =====================================================================
// 4) ACTIONS UTILISATEUR
// =====================================================================
// Marque une ligne comme "revue" (exclue de la détection pendant 12 mois).
function markDeadLineReviewed(assetId) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return false;
    asset.deadLineReviewedAt = Date.now();
    saveToStorage();
    return true;
}

// Annule le marquage "revue" (à utiliser si l'utilisateur change d'avis).
function unmarkDeadLineReviewed(assetId) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return false;
    delete asset.deadLineReviewedAt;
    saveToStorage();
    return true;
}

// =====================================================================
// 5) RENDU — SECTION DASHBOARD
// =====================================================================
function renderDeadLinesSection() {
    const wrap = document.getElementById('dead-lines-wrap');
    if (!wrap) return;

    const data = detectDeadLines();
    const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };

    // KPI bandeau
    setText('deadlines-stat-total', data.counts.total);
    setText('deadlines-stat-critical', data.counts.critical);
    setText('deadlines-stat-capital', formatEUR(data.potentialCapital));
    setText('deadlines-stat-threshold', data.threshold + ' / 100');

    // État vide
    if (!data.lines.length) {
        wrap.innerHTML = `
            <div class="flex items-center gap-2 text-emerald-400 bg-emerald-950/20 border border-emerald-800/40 rounded-lg p-3 text-[11px]">
                <i class="fa-solid fa-circle-check"></i>
                <span><b>Aucune ligne morte détectée</b> — toutes vos positions ont un poids, une performance ou un rôle justifiés.</span>
            </div>`;
        return;
    }

    // Liste des lignes (max 8 affichées, le reste derrière un bouton)
    const MAX_VISIBLE = 8;
    const visible = data.lines.slice(0, MAX_VISIBLE);
    const hidden = data.lines.length - MAX_VISIBLE;

    wrap.innerHTML = `
        <div class="text-[11px] text-gray-400 mb-2 flex items-center justify-between gap-2">
            <span><i class="fa-solid fa-triangle-exclamation text-amber-400 mr-1"></i>
            <b>${data.counts.total} ligne(s)</b> au score ≥ ${data.threshold}
            ${data.counts.critical > 0 ? `· <span class="text-rose-400">${data.counts.critical} critique(s)</span>` : ''}</span>
            <button type="button" onclick="openDeadLinesMethodModal()" class="text-[10px] text-indigo-400 hover:text-indigo-300 normal-case">
                <i class="fa-solid fa-circle-question text-[9px]"></i> Méthode
            </button>
        </div>
        <div class="space-y-1.5">
            ${visible.map(line => _deadLineRowHTML(line)).join('')}
        </div>
        ${hidden > 0 ? `
            <div class="text-center text-[10px] text-gray-500 italic mt-2">
                … et ${hidden} autre(s) ligne(s) au score plus faible.
            </div>` : ''}
    `;
}

// Une ligne de la liste
function _deadLineRowHTML(line) {
    const a = line.asset;
    const pnl = (a.value || 0) - (a.invested || 0);
    const pnlPct = a.invested > 0 ? (pnl / a.invested * 100) : 0;
    const pnlCls = pnl >= 0 ? 'text-emerald-400' : 'text-rose-400';

    // Couleur selon criticité
    const colorCls = line.isCritical
        ? { bg: 'bg-rose-950/20',    bd: 'border-rose-800/50',    fg: 'text-rose-300',    accent: 'bg-rose-500' }
        : { bg: 'bg-amber-950/20',   bd: 'border-amber-800/50',   fg: 'text-amber-300',   accent: 'bg-amber-500' };

    const scoreBadge = line.isCritical
        ? `<span class="px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800/50 text-[9px] font-bold whitespace-nowrap">${line.score}</span>`
        : `<span class="px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/50 text-[9px] font-bold whitespace-nowrap">${line.score}</span>`;

    // Raison principale (le signal le plus fort)
    const topSignal = Object.entries(line.details)
        .map(([k, v]) => ({ key: k, ...v }))
        .sort((x, y) => y.points - x.points)[0];

    const signalLabels = {
        lowWeight: 'Poids faible',
        flatPerformance: 'Performance plate',
        inactivityAge: 'Ancienneté inactive',
        feeRatio: 'Frais élevés',
        lowAssetScore: 'Score d\'actif bas',
        noThesis: 'Thèse absente'
    };
    const topLabel = signalLabels[topSignal.key] || topSignal.key;

    return `
        <div class="relative ${colorCls.bg} ${colorCls.bd} border rounded-lg p-2.5 flex items-center gap-3 hover:border-opacity-80 transition group">
            <div class="absolute left-0 top-0 bottom-0 w-1 ${colorCls.accent} rounded-l-lg"></div>
            <div class="flex-shrink-0 ml-1">${assetClassIconHTML(a)}</div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-bold text-white text-[11px] truncate">${escapeHTML(a.name)}</span>
                    ${scoreBadge}
                    <span class="text-[9px] ${colorCls.fg}">${topLabel}</span>
                </div>
                <div class="text-[10px] text-gray-500 font-mono mt-0.5 truncate">
                    ${formatEUR(a.value)} · <span class="${pnlCls}">${pnl >= 0 ? '+' : ''}${pnlPct.toFixed(1)} %</span>
                    · ${topSignal.reason}
                </div>
            </div>
            <div class="flex items-center gap-1 flex-shrink-0">
                <button type="button" onclick="openDeadLineDetail(${a.id})" class="px-2 py-1 rounded bg-gray-800/60 hover:bg-indigo-900/60 text-gray-300 hover:text-indigo-300 text-[10px] transition" title="Voir le détail du score">
                    <i class="fa-solid fa-magnifying-glass text-[9px]"></i>
                </button>
                <button type="button" onclick="openDeadLineActions(${a.id})" class="px-2 py-1 rounded bg-gray-800/60 hover:bg-amber-900/60 text-gray-300 hover:text-amber-300 text-[10px] transition" title="Actions : purger / renforcer / revoir">
                    <i class="fa-solid fa-bolt text-[9px]"></i>
                </button>
            </div>
        </div>
    `;
}

// =====================================================================
// 6) MODAL — DÉTAIL DU SCORE
// =====================================================================
function openDeadLineDetail(assetId) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;

    const realAssets = assets.filter(a => !isPaperAsset(a));
    const totalValue = realAssets.reduce((s, a) => s + (a.value || 0), 0);
    const r = computeDeadLineScore(asset, totalValue);
    if (!r) return;

    // Construit le modal dynamiquement (pattern waterfall)
    let modal = document.getElementById('modal-dead-line-detail');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-dead-line-detail';
        modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60] hidden';
        document.body.appendChild(modal);
    }

    const labels = {
        lowWeight:       { label: 'Poids dans le portefeuille', icon: 'fa-weight-scale',     weight: '25 %' },
        flatPerformance: { label: 'Performance plate',          icon: 'fa-equals',          weight: '25 %' },
        inactivityAge:   { label: 'Ancienneté inactive',        icon: 'fa-clock-rotate-left', weight: '15 %' },
        feeRatio:        { label: 'Frais relatifs',             icon: 'fa-receipt',         weight: '10 %' },
        lowAssetScore:   { label: 'Score d\'actif (leaderboard)', icon: 'fa-star',          weight: '15 %' },
        noThesis:        { label: 'Thèse d\'investissement absente', icon: 'fa-scroll',     weight: '10 %' }
    };

    const signalRows = Object.entries(r.details).map(([key, s]) => {
        const meta = labels[key] || { label: key, icon: 'fa-circle', weight: '—' };
        const pct = Math.max(0, Math.min(100, s.points));
        const barCls = pct >= 70 ? 'bg-rose-500' : pct >= 40 ? 'bg-amber-500' : 'bg-emerald-500';
        return `
            <div class="bg-gray-950 border border-gray-800 rounded-lg p-2.5">
                <div class="flex justify-between items-baseline gap-2 mb-1">
                    <span class="text-[11px] font-bold text-white flex items-center gap-1.5">
                        <i class="fa-solid ${meta.icon} text-gray-500 text-[10px]"></i>
                        ${escapeHTML(meta.label)}
                    </span>
                    <span class="text-[10px] font-mono text-gray-400">${s.points.toFixed(0)} / 100 <span class="text-gray-600">(×${meta.weight})</span></span>
                </div>
                <div class="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden mb-1">
                    <div class="${barCls} h-full transition-all" style="width:${pct}%"></div>
                </div>
                <div class="text-[10px] text-gray-500 font-mono">${escapeHTML(s.reason)}</div>
            </div>`;
    }).join('');

    const scoreColor = r.isCritical ? 'text-rose-400' : 'text-amber-400';
    const verdictTxt = r.isCritical
        ? '🔴 Ligne morte confirmée — candidat à la purge'
        : '🟠 Ligne dormante — à surveiller ou renforcer';

    modal.innerHTML = `
        <div class="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div class="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-950">
                <h3 class="font-bold text-white text-sm flex items-center gap-2">
                    <i class="fa-solid fa-triangle-exclamation text-amber-400"></i>
                    Score de ligne morte — ${escapeHTML(asset.name)}
                </h3>
                <button onclick="closeModal('modal-dead-line-detail')" class="text-gray-400 hover:text-white"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="p-5 space-y-3 overflow-y-auto text-xs">
                <div class="bg-gray-950 border border-gray-800 rounded-xl p-4 text-center">
                    <div class="text-3xl font-bold font-mono ${scoreColor}">${r.score} <span class="text-gray-500 text-base">/ 100</span></div>
                    <div class="text-[11px] ${scoreColor} mt-1">${verdictTxt}</div>
                    <div class="text-[10px] text-gray-500 mt-1">${escapeHTML(asset.ticker || '')} · ${formatEUR(asset.value)}</div>
                </div>

                <div class="space-y-2">
                    ${signalRows}
                </div>

                <div class="bg-blue-950/20 border border-blue-800/40 rounded-lg p-2.5 text-[10px] text-blue-100 leading-relaxed">
                    <i class="fa-solid fa-circle-info text-blue-400 mr-1"></i>
                    <b>Lecture :</b> le score est la moyenne pondérée des 6 signaux ci-dessus. Un score ≥ ${DEAD_LINE_CRITICAL_THRESHOLD} indique que la ligne cumule plusieurs facteurs de « mort lente » — sa présence n'est probablement plus justifiée. Un score 40-69 indique une ligne dormante qu'il vaut mieux renforcer ou documenter.
                </div>

                <div class="flex justify-end gap-2 pt-2 border-t border-gray-800">
                    <button onclick="closeModal('modal-dead-line-detail'); openDeadLineActions(${assetId});" class="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-medium">
                        <i class="fa-solid fa-bolt text-[10px] mr-1"></i> Voir les actions
                    </button>
                </div>
            </div>
        </div>
    `;
    modal.classList.remove('hidden');
}

// =====================================================================
// 7) MODAL — ACTIONS
// =====================================================================
function openDeadLineActions(assetId) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;

    const realAssets = assets.filter(a => !isPaperAsset(a));
    const totalValue = realAssets.reduce((s, a) => s + (a.value || 0), 0);
    const r = computeDeadLineScore(asset, totalValue);
    if (!r) return;

    let modal = document.getElementById('modal-dead-line-actions');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-dead-line-actions';
        modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60] hidden';
        document.body.appendChild(modal);
    }

    const reviewedBanner = r.isReviewed
        ? `<div class="bg-emerald-950/30 border border-emerald-800/40 rounded-lg p-2.5 text-[10px] text-emerald-200">
               <i class="fa-solid fa-check-circle mr-1"></i> Cette ligne a été marquée comme revue le ${new Date(r.reviewedAt).toLocaleDateString('fr-FR')}.
           </div>`
        : '';

    modal.innerHTML = `
        <div class="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div class="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-950">
                <h3 class="font-bold text-white text-sm flex items-center gap-2">
                    <i class="fa-solid fa-bolt text-amber-400"></i>
                    Actions — ${escapeHTML(asset.name)}
                </h3>
                <button onclick="closeModal('modal-dead-line-actions')" class="text-gray-400 hover:text-white"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="p-4 space-y-3 text-xs overflow-y-auto">
                ${reviewedBanner}

                <div class="grid grid-cols-3 gap-2 text-[10px] font-mono">
                    <div class="bg-gray-950 border border-gray-800 rounded-lg p-2">
                        <div class="text-gray-500 text-[9px] uppercase mb-0.5">Valeur</div>
                        <div class="text-white font-bold">${formatEUR(asset.value)}</div>
                    </div>
                    <div class="bg-gray-950 border border-gray-800 rounded-lg p-2">
                        <div class="text-gray-500 text-[9px] uppercase mb-0.5">Poids</div>
                        <div class="text-white font-bold">${totalValue > 0 ? ((asset.value / totalValue) * 100).toFixed(2) : '—'} %</div>
                    </div>
                    <div class="bg-gray-950 border border-gray-800 rounded-lg p-2">
                        <div class="text-gray-500 text-[9px] uppercase mb-0.5">Score</div>
                        <div class="${r.isCritical ? 'text-rose-400' : 'text-amber-400'} font-bold">${r.score}/100</div>
                    </div>
                </div>

                <div class="space-y-2 pt-1">
                    <button onclick="closeModal('modal-dead-line-actions'); openSellSimulator(${assetId});" class="w-full p-3 rounded-lg bg-rose-950/30 border border-rose-800/40 hover:bg-rose-900/50 text-left transition">
                        <div class="flex items-center gap-3">
                            <span class="flex-shrink-0 w-8 h-8 rounded-lg bg-rose-950 border border-rose-800/60 flex items-center justify-center text-rose-300">
                                <i class="fa-solid fa-trash text-[11px]"></i>
                            </span>
                            <div>
                                <div class="font-bold text-white text-[12px]">Purger la position</div>
                                <div class="text-[10px] text-gray-400 mt-0.5">Ouvre le simulateur de vente (impact fiscal immédiat, aucun ordre réel).</div>
                            </div>
                        </div>
                    </button>

                    <button onclick="closeModal('modal-dead-line-actions'); _dlReinforce(${assetId});" class="w-full p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/40 hover:bg-emerald-900/50 text-left transition">
                        <div class="flex items-center gap-3">
                            <span class="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-800/60 flex items-center justify-center text-emerald-300">
                                <i class="fa-solid fa-plus text-[11px]"></i>
                            </span>
                            <div>
                                <div class="font-bold text-white text-[12px]">Renforcer la ligne</div>
                                <div class="text-[10px] text-gray-400 mt-0.5">Ouvre le formulaire d'ajout pré-rempli sur le même actif (fusion de lot).</div>
                            </div>
                        </div>
                    </button>

                    ${r.isReviewed
                        ? `<button onclick="closeModal('modal-dead-line-actions'); _dlUnmarkReviewed(${assetId});" class="w-full p-3 rounded-lg bg-gray-950 border border-gray-800 hover:bg-gray-900 text-left transition">
                               <div class="flex items-center gap-3">
                                   <span class="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-300">
                                       <i class="fa-solid fa-rotate-left text-[11px]"></i>
                                   </span>
                                   <div>
                                       <div class="font-bold text-white text-[12px]">Annuler le marquage « revue »</div>
                                       <div class="text-[10px] text-gray-400 mt-0.5">La ligne sera de nouveau détectée dans la section.</div>
                                   </div>
                               </div>
                           </button>`
                        : `<button onclick="closeModal('modal-dead-line-actions'); _dlMarkReviewed(${assetId});" class="w-full p-3 rounded-lg bg-gray-950 border border-gray-800 hover:bg-gray-900 text-left transition">
                               <div class="flex items-center gap-3">
                                   <span class="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-300">
                                       <i class="fa-solid fa-check text-[11px]"></i>
                                   </span>
                                   <div>
                                       <div class="font-bold text-white text-[12px]">Marquer comme revue</div>
                                       <div class="text-[10px] text-gray-400 mt-0.5">La ligne sera ignorée pendant 12 mois — utilisez cette option si vous gardez la position par choix.</div>
                                   </div>
                               </div>
                           </button>`}
                </div>
            </div>
        </div>
    `;
    modal.classList.remove('hidden');
}

// ---------------------------------------------------------------------
// Callbacks des actions
// ---------------------------------------------------------------------
function _dlMarkReviewed(assetId) {
    if (markDeadLineReviewed(assetId)) {
        renderDeadLinesSection();
        if (typeof toastSuccess === 'function') {
            toastSuccess('Ligne marquée comme revue', 'Elle ne sera plus détectée avant 12 mois.');
        }
    }
}

function _dlUnmarkReviewed(assetId) {
    if (unmarkDeadLineReviewed(assetId)) {
        renderDeadLinesSection();
        if (typeof toastInfo === 'function') {
            toastInfo('Marquage annulé', 'La ligne sera de nouveau évaluée.');
        }
    }
}

function _dlReinforce(assetId) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;

    // Ouvre le formulaire d'ajout sur le même actif — pattern similaire
    // à la promotion watchlist, mais on pré-remplit directement les
    // catégories / cadran / enveloppe pour faciliter la fusion de lot.
    if (typeof openAddAssetModal !== 'function') return;
    openAddAssetModal();

    document.getElementById('add-name').value = asset.name;
    document.getElementById('add-ticker').value = asset.ticker;

    // Tags et cadran
    if (typeof setFormTags === 'function') setFormTags(asset.categories || ['Autre']);
    const cadranSel = document.getElementById('add-cadran');
    if (cadranSel && asset.cadran) {
        const opt = cadranSel.querySelector(`option[value="${asset.cadran}"]`);
        if (opt) cadranSel.value = asset.cadran;
    }

    // Enveloppe (pré-remplissage best-effort)
    if (asset.envelope && typeof updateAssetFormSections === 'function') {
        setTimeout(() => {
            const envSel = document.getElementById('add-envelope');
            if (envSel) envSel.value = asset.envelope;
        }, 30);
    }

    // Bandeau contextuel
    _injectReinforceBanner(asset);
}

function _injectReinforceBanner(asset) {
    const old = document.getElementById('reinforce-banner');
    if (old) old.remove();

    const form = document.querySelector('#modal-add-asset form');
    if (!form) return;

    const banner = document.createElement('div');
    banner.id = 'reinforce-banner';
    banner.className = 'bg-emerald-950/40 border border-emerald-800/60 rounded-xl p-3 flex items-start gap-3';
    banner.innerHTML = `
        <div class="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-700/60 flex items-center justify-center text-emerald-300">
            <i class="fa-solid fa-plus"></i>
        </div>
        <div class="flex-1 min-w-0">
            <div class="text-[11px] font-bold text-emerald-200">Renforcement de ligne</div>
            <div class="text-[11px] text-gray-300 mt-0.5 leading-relaxed">
                Le nouvel achat sera <b>fusionné</b> avec la position <b>${escapeHTML(asset.name)}</b> existante
                (même ISIN/ticker) — un seul lot supplémentaire sera créé, pas une nouvelle ligne.
            </div>
        </div>
        <button type="button" onclick="document.getElementById('reinforce-banner').remove();" class="flex-shrink-0 w-6 h-6 rounded-md bg-emerald-900/60 text-emerald-200 hover:bg-emerald-800 hover:text-white flex items-center justify-center transition" title="Retirer le bandeau">
            <i class="fa-solid fa-xmark text-[10px]"></i>
        </button>
    `;
    form.insertBefore(banner, form.firstChild);
}

// ---------------------------------------------------------------------
// Modal méthode
// ---------------------------------------------------------------------
function openDeadLinesMethodModal() {
    if (typeof toastInfo !== 'function') return;
    alert(
        'Méthode de détection des lignes mortes\n\n' +
        'Chaque position reçoit un score 0-100, moyenne pondérée de 6 signaux :\n\n' +
        '• Poids dans le portefeuille (25 %) — < 0,5 % = signal fort\n' +
        '• Performance plate (25 %) — |P&L| < 10 % sur > 1 an\n' +
        '• Ancienneté inactive (15 %) — > 2 ans sans performance\n' +
        '• Frais relatifs (10 %) — > 3 % du capital investi\n' +
        '• Score d\'actif (15 %) — leaderboard < 25/100\n' +
        '• Thèse absente (10 %) — pas de documentation ET < 1 % de poids\n\n' +
        'Seuils :\n' +
        '• 70-100 : ligne morte confirmée (rouge)\n' +
        '• 40-69  : ligne dormante (orange)\n\n' +
        'Une ligne marquée « revue » est exclue de la détection pendant 12 mois.'
    );
}

// =====================================================================
// 8) INITIALISATION
// =====================================================================
function initDeadLinesModule() {
    console.info('[DeadLines] Module chargé — détection des lignes mortes prête.');
}

// Expose l'API globalement
window.computeDeadLineScore     = computeDeadLineScore;
window.detectDeadLines          = detectDeadLines;
window.markDeadLineReviewed     = markDeadLineReviewed;
window.unmarkDeadLineReviewed   = unmarkDeadLineReviewed;
window.renderDeadLinesSection   = renderDeadLinesSection;
window.openDeadLineDetail       = openDeadLineDetail;
window.openDeadLineActions      = openDeadLineActions;
window.openDeadLinesMethodModal = openDeadLinesMethodModal;
window.initDeadLinesModule      = initDeadLinesModule;
window._dlMarkReviewed          = _dlMarkReviewed;
window._dlUnmarkReviewed        = _dlUnmarkReviewed;
window._dlReinforce             = _dlReinforce;