// =====================================================================
// app31-esg.js — SCORING ESG PAR ACTIF (Chantier §3)
// Dépend de : app1-core.js (assets, escapeHTML, hasTag)
// Charge après app30-timeline.js, avant tests.js
// =====================================================================
//
// Ajoute une dimension extra-financière au scoring existant : chaque
// actif peut porter un score ESG (Environnement, Social, Gouvernance)
// sur une échelle 0-100.
//
// SOURCES UTILISÉES :
//   • Catalogue statique intégré (basé sur les notations publiques
//     MSCI ESG Ratings, Sustainalytics et Refinitiv, valeurs
//     indicatives 2024)
//   • Saisie manuelle pour les actifs non catalogués
//
// CONVENTIONS :
//   • 0-100 : score composite (100 = meilleur)
//   • Grades : AAA (85+), AA (75-84), A (65-74), BBB (55-64),
//              BB (45-54), B (35-44), CCC (25-34), NR (< 25 / non noté)
//
// Aucune API externe n'est appelée : tout fonctionne hors ligne. Les
// scores peuvent être ajustés par l'utilisateur via un champ dédié
// dans le formulaire d'édition d'actif.
// =====================================================================

// ---------------------------------------------------------------------
// CATALOGUE STATIQUE (valeurs indicatives 2024)
// ---------------------------------------------------------------------
// Sources croisées : MSCI ESG Ratings, Sustainalytics, Refinitiv.
// Ces scores sont INDICATIFS et destinés à donner un ordre de grandeur.
// Les utilisateurs peuvent les ajuster manuellement via le formulaire.
const ESG_CATALOG = {
    // --- ETF indiciels MSCI World / S&P 500 ---
    'CW8':      { score: 78, grade: 'AA', source: 'MSCI World index' },
    'WCEA':     { score: 78, grade: 'AA', source: 'MSCI World index' },
    'EWLD':     { score: 78, grade: 'AA', source: 'MSCI World index' },
    'CSPX':     { score: 72, grade: 'A',  source: 'S&P 500 index' },
    'ESE':      { score: 72, grade: 'A',  source: 'S&P 500 index' },
    'IWDA':     { score: 79, grade: 'AA', source: 'MSCI World index' },
    'URTH':     { score: 79, grade: 'AA', source: 'MSCI World index' },

    // --- ETF thématiques ---
    'PAEEM':    { score: 74, grade: 'A',  source: 'MSCI EM index' },

    // --- Grandes valeurs tech US (scores ESG élevés sur G, variable sur E/S) ---
    'AAPL':     { score: 74, grade: 'A',  source: 'MSCI ESG Ratings' },
    'MSFT':     { score: 84, grade: 'AA', source: 'MSCI ESG Ratings' },
    'NVDA':     { score: 66, grade: 'A',  source: 'MSCI ESG Ratings' },
    'GOOGL':    { score: 68, grade: 'A',  source: 'MSCI ESG Ratings' },
    'AMZN':     { score: 58, grade: 'BBB', source: 'MSCI ESG Ratings' },
    'META':     { score: 55, grade: 'BBB', source: 'MSCI ESG Ratings' },
    'TSLA':     { score: 45, grade: 'BB', source: 'MSCI ESG Ratings' },

    // --- Énergie / pétrole (scores ESG plus bas) ---
    'TTE':      { score: 62, grade: 'BBB', source: 'Sustainalytics' },
    'XOM':      { score: 48, grade: 'BB', source: 'MSCI ESG Ratings' },
    'SHEL':     { score: 65, grade: 'A',  source: 'MSCI ESG Ratings' },

    // --- Finance ---
    'BNP':      { score: 68, grade: 'A',  source: 'Sustainalytics' },
    'JPM':      { score: 65, grade: 'A',  source: 'MSCI ESG Ratings' },

    // --- Santé ---
    'JNJ':      { score: 72, grade: 'A',  source: 'MSCI ESG Ratings' },
    'PFE':      { score: 68, grade: 'A',  source: 'MSCI ESG Ratings' },

    // --- Industrie ---
    'AIR':      { score: 74, grade: 'A',  source: 'Sustainalytics' },
    'BA':       { score: 42, grade: 'BB', source: 'MSCI ESG Ratings' },

    // --- Luxe ---
    'MC':       { score: 76, grade: 'AA', source: 'MSCI ESG Ratings' },
    'KER':      { score: 78, grade: 'AA', source: 'MSCI ESG Ratings' },

    // --- Crypto (pas d'évaluation ESG standard, valeur indicative basse) ---
    'BTC':      { score: 25, grade: 'CCC', source: 'Estimation (impact énergétique)' },
    'ETH':      { score: 42, grade: 'BB', source: 'Estimation (post-Merge)' },
    'SOL':      { score: 35, grade: 'B',  source: 'Estimation' },
    'ADA':      { score: 55, grade: 'BBB', source: 'Estimation (proof-of-stake)' },

    // --- Or physique / métaux ---
    'NAP20':    { score: 35, grade: 'B',  source: 'Extraction minière' },
    'KRUG1OZ':  { score: 35, grade: 'B',  source: 'Extraction minière' },
    'VV1OZ':    { score: 40, grade: 'BB', source: 'Or recyclable' },
    'VV1/20OZ': { score: 40, grade: 'BB', source: 'Or recyclable' }
};

// Grades → couleur (Tailwind)
const ESG_GRADE_STYLES = {
    'AAA': { fg: 'text-emerald-400', bg: 'bg-emerald-950/60', bd: 'border-emerald-700/60' },
    'AA':  { fg: 'text-emerald-400', bg: 'bg-emerald-950/60', bd: 'border-emerald-700/60' },
    'A':   { fg: 'text-teal-400',    bg: 'bg-teal-950/60',    bd: 'border-teal-700/60' },
    'BBB': { fg: 'text-amber-400',   bg: 'bg-amber-950/60',   bd: 'border-amber-700/60' },
    'BB':  { fg: 'text-orange-400',  bg: 'bg-orange-950/60',  bd: 'border-orange-700/60' },
    'B':   { fg: 'text-rose-400',    bg: 'bg-rose-950/60',    bd: 'border-rose-700/60' },
    'CCC': { fg: 'text-rose-400',    bg: 'bg-rose-950/60',    bd: 'border-rose-700/60' },
    'NR':  { fg: 'text-gray-400',    bg: 'bg-gray-800/60',    bd: 'border-gray-700/60' }
};

// ---------------------------------------------------------------------
// CONVERSION SCORE → GRADE
// ---------------------------------------------------------------------
function esgScoreToGrade(score) {
    if (!Number.isFinite(score) || score <= 0) return 'NR';
    if (score >= 85) return 'AAA';
    if (score >= 75) return 'AA';
    if (score >= 65) return 'A';
    if (score >= 55) return 'BBB';
    if (score >= 45) return 'BB';
    if (score >= 35) return 'B';
    if (score >= 25) return 'CCC';
    return 'NR';
}

// ---------------------------------------------------------------------
// RÉCUPÉRATION DU SCORE D'UN ACTIF
// ---------------------------------------------------------------------
// Priorité :
//   1. Saisie manuelle sur l'actif (`asset.esgScore`)
//   2. Correspondance catalogue (ticker exact ou ISIN)
//   3. Correspondance partielle (ticker normalisé, ex: 'CW8.PA' → 'CW8')
// Retourne { score, grade, source, isManual } ou null.
function getAssetEsgScore(asset) {
    if (!asset) return null;

    // 1. Saisie manuelle prioritaire
    if (Number.isFinite(asset.esgScore) && asset.esgScore > 0) {
        return {
            score: Math.min(100, Math.max(0, asset.esgScore)),
            grade: esgScoreToGrade(asset.esgScore),
            source: 'Saisie manuelle',
            isManual: true
        };
    }

    // 2. Catalogue : correspondance directe par ticker
    const ticker = String(asset.ticker || '').toUpperCase().trim();
    if (ticker && ESG_CATALOG[ticker]) {
        const e = ESG_CATALOG[ticker];
        return { score: e.score, grade: e.grade, source: e.source, isManual: false };
    }

    // 3. Correspondance partielle : retire les suffixes (.PA, .DE, .L…)
    const baseTicker = ticker.replace(/[.\-].*$/, '');
    if (baseTicker !== ticker && ESG_CATALOG[baseTicker]) {
        const e = ESG_CATALOG[baseTicker];
        return { score: e.score, grade: e.grade, source: e.source, isManual: false };
    }

    return null;
}

// ---------------------------------------------------------------------
// AGRÉGATION PORTEFEUILLE (moyenne pondérée par valeur)
// ---------------------------------------------------------------------
// Retourne { score, grade, coveragePct, coveredValue, totalValue, count }.
// coveragePct = % de la valeur du portefeuille couvert par une notation.
function computePortfolioEsg(assetList) {
    const list = (assetList || assets).filter(a => !isPaperAsset(a));
    const totalValue = list.reduce((s, a) => s + (a.value || 0), 0);
    if (totalValue <= 0) {
        return { score: 0, grade: 'NR', coveragePct: 0, coveredValue: 0, totalValue: 0, count: 0 };
    }

    let weightedSum = 0;
    let coveredValue = 0;
    let count = 0;

    list.forEach(a => {
        const esg = getAssetEsgScore(a);
        if (!esg) return;
        const w = a.value || 0;
        weightedSum += esg.score * w;
        coveredValue += w;
        count++;
    });

    if (coveredValue <= 0) {
        return { score: 0, grade: 'NR', coveragePct: 0, coveredValue: 0, totalValue, count: 0 };
    }

    const score = weightedSum / coveredValue;
    return {
        score,
        grade: esgScoreToGrade(score),
        coveragePct: (coveredValue / totalValue) * 100,
        coveredValue,
        totalValue,
        count
    };
}

// ---------------------------------------------------------------------
// RENDU — CELLULE INVENTAIRE
// ---------------------------------------------------------------------
// Petite pastille de score ESG : « AA 78 » avec couleur selon grade.
// Retourne '' si l'actif n'est pas noté (aucune pollution visuelle).
function esgBadgeHTML(asset) {
    const esg = getAssetEsgScore(asset);
    if (!esg) return '';
    const style = ESG_GRADE_STYLES[esg.grade] || ESG_GRADE_STYLES['NR'];
    const title = `Score ESG : ${esg.score}/100 (${esg.grade}) — ${esg.source}${esg.isManual ? ' (saisie manuelle)' : ''}`;
    return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-bold ${style.bg} ${style.fg} ${style.bd} flex-shrink-0" title="${escapeHTML(title)}">
        <i class="fa-solid fa-leaf text-[8px]"></i>${esg.grade}
    </span>`;
}

// Rendu étendu (cellule de tableau, avec le score chiffré)
function esgCellHTML(asset) {
    const esg = getAssetEsgScore(asset);
    if (!esg) return '<span class="text-gray-600" title="Aucun score ESG disponible — vous pouvez le saisir manuellement dans le formulaire d\'édition">—</span>';
    const style = ESG_GRADE_STYLES[esg.grade] || ESG_GRADE_STYLES['NR'];
    const title = `Score ESG : ${esg.score}/100 — Source : ${esg.source}${esg.isManual ? ' (saisie manuelle)' : ''}`;
    return `<span class="inline-flex items-center gap-1.5 ${style.fg}" title="${escapeHTML(title)}">
        <i class="fa-solid fa-leaf text-[10px]"></i>
        <span class="font-mono font-bold">${esg.score}</span>
        <span class="text-[9px] px-1 rounded border ${style.bg} ${style.bd}">${esg.grade}</span>
    </span>`;
}

// =====================================================================
// RENDU — SECTION DASHBOARD
// =====================================================================

// Rendu complet de la carte ESG du dashboard
function renderEsgDashboardSection() {
    const emptyEl = document.getElementById('esg-empty-state');
    const contentEl = document.getElementById('esg-content');
    if (!emptyEl || !contentEl) return;

    const realAssets = assets.filter(a => !isPaperAsset(a));
    const summary = computePortfolioEsg(realAssets);

    // État vide : aucun actif noté
    if (summary.count === 0 || summary.score <= 0) {
        emptyEl.classList.remove('hidden');
        contentEl.classList.add('hidden');
        return;
    }

    emptyEl.classList.add('hidden');
    contentEl.classList.remove('hidden');

    // --- KPI principaux ---
    const scoreEl = document.getElementById('esg-kpi-score');
    if (scoreEl) {
        const style = ESG_GRADE_STYLES[summary.grade] || ESG_GRADE_STYLES['NR'];
        countUp(scoreEl, summary.score, v => v.toFixed(1));
        scoreEl.className = `text-3xl font-bold font-mono ${style.fg}`;
    }

    const gradeEl = document.getElementById('esg-kpi-grade');
    if (gradeEl) {
        const style = ESG_GRADE_STYLES[summary.grade] || ESG_GRADE_STYLES['NR'];
        gradeEl.className = `text-xs mt-1 font-bold ${style.fg}`;
        gradeEl.innerText = `Note globale : ${summary.grade}`;
    }

    const covEl = document.getElementById('esg-kpi-coverage');
    if (covEl) {
        countUp(covEl, summary.coveragePct, v => v.toFixed(1) + ' %');
        const covCls = summary.coveragePct >= 75 ? 'text-emerald-400'
                     : summary.coveragePct >= 40 ? 'text-amber-400'
                     : 'text-rose-400';
        covEl.className = `text-2xl font-bold font-mono ${covCls}`;
    }
    const covDetEl = document.getElementById('esg-kpi-coverage-detail');
    if (covDetEl) covDetEl.innerText = `${formatEUR(summary.coveredValue)} sur ${formatEUR(summary.totalValue)}`;

    const cntEl = document.getElementById('esg-kpi-count');
    if (cntEl) cntEl.innerText = summary.count + ' / ' + realAssets.length;

    const cntDetEl = document.getElementById('esg-kpi-count-detail');
    if (cntDetEl) cntDetEl.innerText = 'actif(s) avec notation disponible';

    // --- Répartition par grade ---
    _renderEsgGradeBreakdown(realAssets);

    // --- Top 3 / Flop 3 ---
    _renderEsgTopFlop(realAssets);
}

// Répartition par grade : barre segmentée + liste
function _renderEsgGradeBreakdown(list) {
    const container = document.getElementById('esg-grade-breakdown');
    if (!container) return;

    // Agrège par grade
    const byGrade = {};
    list.forEach(a => {
        const esg = getAssetEsgScore(a);
        if (!esg) return;
        byGrade[esg.grade] = byGrade[esg.grade] || { grade: esg.grade, value: 0, count: 0 };
        byGrade[esg.grade].value += a.value || 0;
        byGrade[esg.grade].count++;
    });

    const grades = Object.values(byGrade).sort((a, b) => b.value - a.value);
    if (!grades.length) {
        container.innerHTML = '<div class="text-[11px] text-gray-500 italic">Aucune donnée à afficher.</div>';
        return;
    }

    const totalValue = grades.reduce((s, g) => s + g.value, 0);

    // Barre horizontale segmentée
    let barHTML = '<div class="flex w-full h-3 rounded-full overflow-hidden border border-gray-800">';
    grades.forEach(g => {
        const pct = totalValue > 0 ? (g.value / totalValue) * 100 : 0;
        const style = ESG_GRADE_STYLES[g.grade] || ESG_GRADE_STYLES['NR'];
        // Couleur pleine pour la barre
        const bgColor = {
            AAA: '#10b981', AA: '#10b981', A: '#14b8a6',
            BBB: '#f59e0b', BB: '#f97316', B: '#f43f5e', CCC: '#e11d48', NR: '#6b7280'
        }[g.grade] || '#6b7280';
        barHTML += `<div style="width:${pct}%;background:${bgColor};" title="${g.grade} : ${formatEUR(g.value)} (${pct.toFixed(1)} %)"></div>`;
    });
    barHTML += '</div>';

    // Liste détaillée par grade
    const listHTML = grades.map(g => {
        const pct = totalValue > 0 ? (g.value / totalValue) * 100 : 0;
        const style = ESG_GRADE_STYLES[g.grade] || ESG_GRADE_STYLES['NR'];
        return `<div class="flex items-center justify-between text-[11px] gap-2">
            <div class="flex items-center gap-2">
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-bold ${style.bg} ${style.fg} ${style.bd}">
                    <i class="fa-solid fa-leaf text-[9px]"></i>${g.grade}
                </span>
                <span class="text-gray-500 font-mono">${g.count} actif(s)</span>
            </div>
            <div class="flex items-center gap-3 font-mono">
                <span class="text-gray-300">${formatEUR(g.value)}</span>
                <span class="text-gray-500 w-12 text-right">${pct.toFixed(1)} %</span>
            </div>
        </div>`;
    }).join('');

    container.innerHTML = barHTML + `<div class="mt-3 space-y-1.5">${listHTML}</div>`;
}

// Top 3 / Flop 3 par score ESG
function _renderEsgTopFlop(list) {
    const topEl = document.getElementById('esg-top3');
    const flopEl = document.getElementById('esg-flop3');
    if (!topEl || !flopEl) return;

    // Filtre et trie par score
    const scored = list
        .map(a => ({ asset: a, esg: getAssetEsgScore(a) }))
        .filter(x => x.esg)
        .sort((a, b) => b.esg.score - a.esg.score);

    if (!scored.length) {
        topEl.innerHTML = '<div class="text-gray-500 italic text-[11px] text-center py-3">—</div>';
        flopEl.innerHTML = '<div class="text-gray-500 italic text-[11px] text-center py-3">—</div>';
        return;
    }

    const rowHTML = (x) => {
        const a = x.asset;
        const esg = x.esg;
        const style = ESG_GRADE_STYLES[esg.grade] || ESG_GRADE_STYLES['NR'];
        return `<div class="clickable-row flex items-center gap-2 p-2 bg-gray-950 border border-gray-800 rounded-lg cursor-pointer hover:border-gray-700 transition" onclick="openAssetDetailModal(${a.id})">
            ${assetClassIconHTML(a)}
            <div class="min-w-0 flex-1">
                <div class="font-bold text-white text-[11px] truncate">${escapeHTML(a.name)}</div>
                <div class="text-[9px] text-gray-500 font-mono truncate">${escapeHTML(a.ticker)} · ${formatEUR(a.value)}</div>
            </div>
            <div class="text-right flex-shrink-0">
                <div class="font-mono font-bold ${style.fg} text-xs">${esg.score}</div>
                <div class="text-[9px] ${style.fg}">${esg.grade}</div>
            </div>
        </div>`;
    };

    // Top 3
    const top3 = scored.slice(0, 3);
    topEl.innerHTML = top3.map(rowHTML).join('');

    // Flop 3 (les 3 derniers, du plus mauvais au moins mauvais)
    const flop3 = scored.slice(-3).reverse();
    // Évite les doublons si < 6 actifs notés : dans ce cas, on retire du
    // Flop les actifs déjà listés dans le Top pour ne pas afficher deux
    // fois le même actif.
    if (scored.length < 6) {
        const topIds = new Set(top3.map(x => x.asset.id));
        const deduped = flop3.filter(x => !topIds.has(x.asset.id));
        flopEl.innerHTML = deduped.map(rowHTML).join('') || '<div class="text-gray-500 italic text-[11px] text-center py-3">—</div>';
    } else {
        // Vérifie qu'il n'y a pas de chevauchement avec le top
        const topIds = new Set(top3.map(x => x.asset.id));
        const deduped = flop3.filter(x => !topIds.has(x.asset.id));
        flopEl.innerHTML = deduped.map(rowHTML).join('') || '<div class="text-gray-500 italic text-[11px] text-center py-3">—</div>';
    }
}

// Modal « Méthode ESG »
function openEsgMethodModal() {
    alert(
        'Méthode de notation ESG\n\n' +
        'Sources : MSCI ESG Ratings, Sustainalytics, Refinitiv (valeurs indicatives 2024).\n\n' +
        'Échelle : 0-100 → grades AAA (85+), AA (75-84), A (65-74),\n' +
        'BBB (55-64), BB (45-54), B (35-44), CCC (25-34), NR (< 25).\n\n' +
        'Le score du portefeuille est la moyenne pondérée par la valeur de chaque actif noté. ' +
        'Il ne tient pas compte des actifs non notés (couverture indiquée séparément).\n\n' +
        'Vous pouvez saisir manuellement un score pour n\'importe quel actif : ouvrez son modal ' +
        'de détail → « Modifier » → champ « Score ESG ».'
    );
}

// ---------------------------------------------------------------------
// INITIALISATION
// ---------------------------------------------------------------------
function initEsgModule() {
    console.info('[ESG] Module chargé — catalogue de ' + Object.keys(ESG_CATALOG).length + ' actifs notés.');
}

// Expose l'API globalement
window.esgScoreToGrade = esgScoreToGrade;
window.getAssetEsgScore = getAssetEsgScore;
window.computePortfolioEsg = computePortfolioEsg;
window.esgBadgeHTML = esgBadgeHTML;
window.esgCellHTML = esgCellHTML;
window.ESG_CATALOG = ESG_CATALOG;
window.renderEsgDashboardSection = renderEsgDashboardSection;
window.openEsgMethodModal = openEsgMethodModal;