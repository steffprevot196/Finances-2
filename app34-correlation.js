// =====================================================================
// app34-correlation.js — MATRICE DE CORRÉLATION DES ACTIFS (Chantier §5)
// Dépend de : app1-core.js, app6-api.js (realSeriesCache)
// Charge après app33-monthly-snapshots.js, avant tests.js
// =====================================================================
//
// Calcule la corrélation de Pearson entre chaque paire d'actifs à partir
// de l'historique réel des cours (realSeriesCache, peuplé par le Chantier 1.6
// via CoinGecko / Frankfurter / Twelve Data / Yahoo).
//
// OBJECTIF :
//   Détecter les concentrations cachées. Exemple : un portefeuille avec
//   AAPL, MSFT, NVDA, GOOGL a 4 lignes distinctes mais une seule position
//   économique (tech US) — leur corrélation mutuelle dépasse souvent 0.85.
//
// AFFICHAGE :
//   • Heatmap SVG (carrée N×N, N = nombre d'actifs corrélables)
//   • Palette divergente : rouge (corr. forte, danger) → gris (0) → bleu (corr. négative)
//   • Signal "⚠ Concentration cachée" si ≥ 3 actifs avec corr > 0.85
//   • Clic sur cellule → détail de la paire
//
// PRÉ-REQUIS :
//   Au moins 2 actifs avec des séries réelles de ≥ 30 points communs
//   (cliquez « Historique de prix » si la heatmap est vide).

const CORRELATION_MIN_POINTS = 30;         // 30 jours communs minimum
const CORRELATION_CLUSTER_THRESHOLD = 0.85; // Seuil pour signaler une corrélation forte
const CORRELATION_CLUSTER_MIN_SIZE = 3;    // Nombre d'actifs corrélés pour déclencher le signal

let _correlationMatrix = null;   // cache
let _correlationCacheKey = '';

// ---------------------------------------------------------------------
// CLÉ DE CACHE
// ---------------------------------------------------------------------
function _computeCorrelationCacheKey() {
    // Invalide si le nombre d'actifs ou leur composition change
    const tickers = assets
        .filter(a => !isPaperAsset(a))
        .map(a => (a.ticker || '').toUpperCase())
        .sort()
        .join(',');
    // Invalide aussi si les séries brutes changent significativement
    let seriesLenSum = 0;
    Object.keys(realSeriesCache || {}).forEach(k => {
        seriesLenSum += (realSeriesCache[k] || []).length;
    });
    return currentPortfolioId + '|' + tickers + '|' + seriesLenSum;
}

// ---------------------------------------------------------------------
// EXTRACTION DES SÉRIES DE RENDEMENTS JOURNALIERS
// ---------------------------------------------------------------------
// Pour chaque actif, on construit une MAP { 'YYYY-MM-DD': rendement } à
// partir de realSeriesCache (séries de prix quotidiens).
function _buildReturnsByAsset() {
    const realAssets = assets.filter(a => !isPaperAsset(a));
    const out = [];

    realAssets.forEach(a => {
        const tickerKey = (a.ticker || '').toUpperCase();
        const series = realSeriesCache[tickerKey];
        if (!Array.isArray(series) || series.length < CORRELATION_MIN_POINTS) return;

        // Tri par date croissante (sécurite : on ne fait pas confiance à l'ordre)
        const sorted = series.slice().sort((x, y) => x.date - y.date);

        // Calcule les rendements journaliers indexés par jour civil
        const returnsByDay = {};
        for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1].price;
            const cur = sorted[i].price;
            if (!Number.isFinite(prev) || !Number.isFinite(cur) || prev <= 0) continue;
            const day = new Date(sorted[i].date).toISOString().slice(0, 10);
            returnsByDay[day] = (cur - prev) / prev;
        }

        if (Object.keys(returnsByDay).length >= CORRELATION_MIN_POINTS) {
            out.push({
                id: a.id,
                ticker: tickerKey,
                name: a.name,
                returnsByDay
            });
        }
    });

    return out;
}

// ---------------------------------------------------------------------
// CALCUL DE LA CORRÉLATION DE PEARSON
// ---------------------------------------------------------------------
// Corr(X, Y) = Cov(X, Y) / (σ_X × σ_Y)
// Aligne les jours communs entre les deux séries.
// Retourne { r, n } ou null si insuffisant.
function _pearsonCorrelation(assetA, assetB) {
    // 1) Jours communs
    const days = Object.keys(assetA.returnsByDay)
        .filter(d => assetB.returnsByDay[d] !== undefined);

    if (days.length < CORRELATION_MIN_POINTS) return null;

    // 2) Rendements alignés
    const xs = days.map(d => assetA.returnsByDay[d]);
    const ys = days.map(d => assetB.returnsByDay[d]);
    const n = xs.length;

    // 3) Moyennes
    const meanX = xs.reduce((s, v) => s + v, 0) / n;
    const meanY = ys.reduce((s, v) => s + v, 0) / n;

    // 4) Covariance et variances (échantillon, / n)
    let cov = 0, varX = 0, varY = 0;
    for (let i = 0; i < n; i++) {
        const dx = xs[i] - meanX;
        const dy = ys[i] - meanY;
        cov  += dx * dy;
        varX += dx * dx;
        varY += dy * dy;
    }
    cov  /= n;
    varX /= n;
    varY /= n;

    const stdevX = Math.sqrt(varX);
    const stdevY = Math.sqrt(varY);
    if (stdevX === 0 || stdevY === 0) return null;

    return { r: cov / (stdevX * stdevY), n };
}

// ---------------------------------------------------------------------
// MATRICE COMPLÈTE
// ---------------------------------------------------------------------
// Retourne {
//   assets: [{ id, ticker, name }],
//   matrix: [[r_ij]],           // matrice symétrique N×N (diagonale = 1)
//   pairs: [{ i, j, r, n }],    // liste des paires corrélables
//   clusters: [{ size, ids, tickers, avgR }],   // groupes corrélés > 0.85
//   coverage: { correlated, total }
// }
function computeCorrelationMatrix() {
    const assetsWithReturns = _buildReturnsByAsset();

    if (assetsWithReturns.length < 2) {
        return {
            assets: assetsWithReturns.map(a => ({ id: a.id, ticker: a.ticker, name: a.name })),
            matrix: [],
            pairs: [],
            clusters: [],
            coverage: { correlated: assetsWithReturns.length, total: assets.filter(a => !isPaperAsset(a)).length }
        };
    }

    // Trie par ticker alphabétique pour un affichage stable
    assetsWithReturns.sort((a, b) => a.ticker.localeCompare(b.ticker));

    const N = assetsWithReturns.length;
    const matrix = Array.from({ length: N }, () => new Array(N).fill(0));
    const pairs = [];

    // Diagonale = 1
    for (let i = 0; i < N; i++) matrix[i][i] = 1;

    // Remplit la matrice (triangle supérieur + symétrie)
    for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
            const res = _pearsonCorrelation(assetsWithReturns[i], assetsWithReturns[j]);
            if (res === null) {
                matrix[i][j] = matrix[j][i] = NaN;   // Non calculable
                continue;
            }
            matrix[i][j] = matrix[j][i] = res.r;
            pairs.push({ i, j, r: res.r, n: res.n });
        }
    }

    // Détection des clusters (union-find simplifié)
    // On regroupe les actifs qui ont tous une corrélation > seuil entre eux.
    const clusters = _detectCorrelationClusters(matrix, assetsWithReturns);

    return {
        assets: assetsWithReturns.map(a => ({ id: a.id, ticker: a.ticker, name: a.name })),
        matrix,
        pairs,
        clusters,
        coverage: {
            correlated: N,
            total: assets.filter(a => !isPaperAsset(a)).length
        }
    };
}

// Détecte les groupes d'actifs mutuellement corrélés > seuil.
// Utilise un union-find sur les paires fortes, puis valide que chaque
// groupe a bien TOUS ses membres corrélés entre eux > seuil (clique).
function _detectCorrelationClusters(matrix, assetList) {
    const N = matrix.length;
    const threshold = CORRELATION_CLUSTER_THRESHOLD;

    // 1) Union-Find : regroupement initial par arêtes fortes
    const parent = Array.from({ length: N }, (_, i) => i);
    function find(x) {
        while (parent[x] !== x) {
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        return x;
    }
    function union(a, b) {
        const ra = find(a), rb = find(b);
        if (ra !== rb) parent[ra] = rb;
    }

    for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
            if (Number.isFinite(matrix[i][j]) && matrix[i][j] >= threshold) {
                union(i, j);
            }
        }
    }

    // 2) Regroupe les indices par racine
    const groupsMap = {};
    for (let i = 0; i < N; i++) {
        const r = find(i);
        if (!groupsMap[r]) groupsMap[r] = [];
        groupsMap[r].push(i);
    }

    // 3) Filtre et validation : garde uniquement les cliques réelles
    const clusters = [];
    Object.values(groupsMap).forEach(indices => {
        if (indices.length < CORRELATION_CLUSTER_MIN_SIZE) return;

        // Vérifie que tous les membres sont corrélés > seuil entre eux
        let isClique = true;
        for (let a = 0; a < indices.length && isClique; a++) {
            for (let b = a + 1; b < indices.length; b++) {
                const r = matrix[indices[a]][indices[b]];
                if (!Number.isFinite(r) || r < threshold) { isClique = false; break; }
            }
        }
        if (!isClique) return;

        // Calcule la corrélation moyenne intra-cluster
        let sumR = 0, countR = 0;
        for (let a = 0; a < indices.length; a++) {
            for (let b = a + 1; b < indices.length; b++) {
                sumR += matrix[indices[a]][indices[b]];
                countR++;
            }
        }

        clusters.push({
            size: indices.length,
            ids: indices.map(i => assetList[i].id),
            tickers: indices.map(i => assetList[i].ticker),
            names: indices.map(i => assetList[i].name),
            avgR: countR > 0 ? sumR / countR : 0
        });
    });

    // Trie par taille décroissante, puis par corrélation moyenne
    clusters.sort((a, b) => b.size - a.size || b.avgR - a.avgR);
    return clusters;
}

// Wrapper avec cache
function getCorrelationMatrix() {
    const key = _computeCorrelationCacheKey();
    if (_correlationMatrix && _correlationCacheKey === key) return _correlationMatrix;
    _correlationMatrix = computeCorrelationMatrix();
    _correlationCacheKey = key;
    return _correlationMatrix;
}

function invalidateCorrelationCache() {
    _correlationMatrix = null;
    _correlationCacheKey = '';
}

// ---------------------------------------------------------------------
// PALETTE DIVERGENTE — rouge (corr. positive forte) → gris (0) → bleu (négatif)
// ---------------------------------------------------------------------
function _correlationColor(r) {
    if (!Number.isFinite(r)) return '#1f2937';       // gris-800 : non calculable
    const abs = Math.min(1, Math.abs(r));
    if (Math.abs(r) < 0.05) return '#374151';        // gris-700 : neutre

    if (r > 0) {
        // Rouge : plus r est proche de 1, plus c'est rouge vif
        const rr = Math.round(75 + abs * (239 - 75));
        const gg = Math.round(85 + abs * (68  - 85));
        const bb = Math.round(99 + abs * (68  - 99));
        return `rgb(${rr},${gg},${bb})`;
    }
    // Bleu : plus r est proche de -1, plus c'est bleu
    const rr = Math.round(75 + abs * (59  - 75));
    const gg = Math.round(85 + abs * (130 - 85));
    const bb = Math.round(99 + abs * (246 - 99));
    return `rgb(${rr},${gg},${bb})`;
}

// Contraste du texte selon le fond
function _correlationTextColor(r) {
    if (!Number.isFinite(r)) return '#6b7280';
    if (Math.abs(r) < 0.05) return '#9ca3af';
    return '#ffffff';
}

// ---------------------------------------------------------------------
// RENDU SVG — Heatmap de corrélation
// ---------------------------------------------------------------------
function renderCorrelationHeatmap() {
    const svg = document.getElementById('correlationHeatmapSvg');
    if (!svg) return;

    const data = getCorrelationMatrix();
    const N = data.assets.length;

    // État vide : moins de 2 actifs corrélables
    if (N < 2) {
        svg.innerHTML = '';
        const wrap = svg.parentElement;
        if (wrap && !wrap.querySelector('.correlation-empty-state')) {
            const empty = document.createElement('div');
            empty.className = 'correlation-empty-state flex flex-col items-center justify-center h-full text-gray-500 text-xs gap-2 py-8';
            empty.innerHTML = `
                <i class="fa-solid fa-circle-info text-2xl text-gray-600"></i>
                <div>Pas assez d'historique réel pour calculer les corrélations.</div>
                <div class="text-[10px] italic">Au moins 2 actifs avec 30 jours de cours communs sont requis.</div>
                <button onclick="refreshRealPriceHistory()" class="mt-2 px-3 py-1.5 rounded-lg bg-teal-950/60 text-teal-300 border border-teal-700/50 hover:bg-teal-900/80 text-[11px] font-medium transition inline-flex items-center gap-1.5">
                    <i class="fa-solid fa-chart-line text-[10px]"></i> Télécharger l'historique
                </button>
            `;
            wrap.appendChild(empty);
        }
        return;
    }

    // Retire un éventuel état vide précédent
    const wrap = svg.parentElement;
    if (wrap) {
        const empty = wrap.querySelector('.correlation-empty-state');
        if (empty) empty.remove();
    }

    // --- Dimensions ---
    const cell = 28;
    const gap = 1;
    const labelMarginLeft = 70;
    const labelMarginTop = 60;
    const W = labelMarginLeft + N * (cell + gap) + 4;
    const H = labelMarginTop + N * (cell + gap) + 4;

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.style.width = W + 'px';
    svg.style.height = H + 'px';

    let html = '';

    // --- Labels Y (à gauche, horizontaux, alignés à droite) ---
    data.assets.forEach((a, i) => {
        const y = labelMarginTop + i * (cell + gap) + cell / 2;
        html += `<text x="${labelMarginLeft - 6}" y="${y}" text-anchor="end" dominant-baseline="middle"
                      fill="#9ca3af" font-size="10" font-family="'JetBrains Mono', monospace">
            ${escapeHTML(a.ticker)}
        </text>`;
    });

    // --- Labels X (en haut, rotation -45°) ---
    data.assets.forEach((a, i) => {
        const x = labelMarginLeft + i * (cell + gap) + cell / 2;
        const y = labelMarginTop - 6;
        html += `<text x="${x}" y="${y}" text-anchor="start" dominant-baseline="middle"
                      fill="#9ca3af" font-size="10" font-family="'JetBrains Mono', monospace"
                      transform="rotate(-45 ${x} ${y})">
            ${escapeHTML(a.ticker)}
        </text>`;
    });

    // --- Cellules ---
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            const r = data.matrix[i][j];
            const x = labelMarginLeft + j * (cell + gap);
            const y = labelMarginTop + i * (cell + gap);
            const color = _correlationColor(r);
            const textColor = _correlationTextColor(r);
            const rLabel = Number.isFinite(r) ? r.toFixed(2) : '—';

            const aName = data.assets[i].name || data.assets[i].ticker;
            const bName = data.assets[j].name || data.assets[j].ticker;
            const titleTxt = i === j
                ? `${aName} — auto-corrélation`
                : `${aName} vs ${bName} — r = ${Number.isFinite(r) ? r.toFixed(3) : 'N/A'}`;

            const isDiagonal = i === j;
            html += `<g class="${isDiagonal ? '' : 'cursor-pointer'}">
                <title>${escapeHTML(titleTxt)}</title>
                <rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2"
                      fill="${color}"
                      stroke="#0b0f19" stroke-width="0.5"
                      ${!isDiagonal ? `onclick="openCorrelationPairDetail(${i}, ${j})"` : ''}
                      style="${!isDiagonal ? 'transition: filter 0.15s;' : ''}"
                      ${!isDiagonal ? 'onmouseover="this.style.filter=\'brightness(1.4)\'" onmouseout="this.style.filter=\'\'"' : ''}/>
                ${cell >= 26 ? `<text x="${x + cell/2}" y="${y + cell/2}" text-anchor="middle" dominant-baseline="middle"
                                      fill="${textColor}" font-size="9" font-family="'JetBrains Mono', monospace"
                                      font-weight="600" pointer-events="none">
                    ${rLabel}
                </text>` : ''}
            </g>`;
        }
    }

    svg.innerHTML = html;
}

// ---------------------------------------------------------------------
// RENDU — Alerte "concentration cachée"
// ---------------------------------------------------------------------
function renderCorrelationClustersAlert() {
    const wrap = document.getElementById('correlation-clusters-alert');
    if (!wrap) return;

    const data = getCorrelationMatrix();

    if (!data.clusters.length) {
        wrap.innerHTML = `
            <div class="flex items-center gap-2 text-emerald-400 bg-emerald-950/20 border border-emerald-800/40 rounded-lg p-3 text-[11px]">
                <i class="fa-solid fa-circle-check"></i>
                <span><b>Aucune concentration cachée détectée</b> — aucun groupe de ${CORRELATION_CLUSTER_MIN_SIZE}+ actifs mutuellement corrélés > ${(CORRELATION_CLUSTER_THRESHOLD * 100).toFixed(0)} %.</span>
            </div>`;
        return;
    }

    wrap.innerHTML = data.clusters.map(c => `
        <div class="bg-amber-950/20 border border-amber-800/40 rounded-lg p-3 mb-2 last:mb-0">
            <div class="flex items-start gap-2">
                <i class="fa-solid fa-triangle-exclamation text-amber-400 mt-0.5"></i>
                <div class="flex-1 min-w-0">
                    <div class="text-[11px] font-bold text-amber-200">
                        Concentration cachée : ${c.size} actifs corrélés à ${(c.avgR * 100).toFixed(0)} % en moyenne
                    </div>
                    <div class="flex flex-wrap gap-1 mt-1.5">
                        ${c.tickers.map((t, idx) =>
                            `<span class="px-1.5 py-0.5 rounded bg-gray-900 border border-gray-700 text-[10px] font-mono text-gray-300"
                                   title="${escapeHTML(c.names[idx])}">${escapeHTML(t)}</span>`
                        ).join('')}
                    </div>
                    <div class="text-[10px] text-gray-400 mt-1.5 leading-relaxed">
                        Ces actifs ont tendance à évoluer ensemble. Une diversification apparente masque en réalité une <b>position économique unique</b> — envisagez d'ajouter des actifs décorrélés (autre secteur, autre zone, autre classe).
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// ---------------------------------------------------------------------
// MODAL — Détail d'une paire
// ---------------------------------------------------------------------
let _correlationPairsCache = null;   // pour retrouver la paire (i, j)

function openCorrelationPairDetail(i, j) {
    const data = getCorrelationMatrix();
    if (!data || !data.assets[i] || !data.assets[j]) return;

    const a = data.assets[i];
    const b = data.assets[j];
    const r = data.matrix[i][j];
    const pair = data.pairs.find(p => (p.i === i && p.j === j) || (p.i === j && p.j === i));
    const n = pair ? pair.n : 0;

    // Interprétation textuelle
    const absR = Math.abs(r);
    let niveau, colorCls;
    if (!Number.isFinite(r)) {
        niveau = 'Corrélation non calculable (données insuffisantes)';
        colorCls = 'text-gray-400';
    } else if (absR < 0.2) {
        niveau = 'Corrélation négligeable — les deux actifs évoluent indépendamment';
        colorCls = 'text-emerald-400';
    } else if (absR < 0.5) {
        niveau = r > 0 ? 'Corrélation faible positive' : 'Corrélation faible négative';
        colorCls = r > 0 ? 'text-emerald-400' : 'text-blue-400';
    } else if (absR < 0.85) {
        niveau = r > 0 ? 'Corrélation modérée positive' : 'Corrélation modérée négative';
        colorCls = r > 0 ? 'text-amber-400' : 'text-blue-400';
    } else {
        niveau = r > 0 ? 'Corrélation forte — risque de concentration cachée' : 'Corrélation forte négative — rôle de couverture';
        colorCls = r > 0 ? 'text-rose-400' : 'text-blue-400';
    }

    const titleEl = document.getElementById('correlation-modal-title');
    const bodyEl  = document.getElementById('correlation-modal-body');
    if (!titleEl || !bodyEl) return;

    titleEl.innerHTML = `<i class="fa-solid fa-code-compare text-purple-400"></i> Corrélation : ${escapeHTML(a.ticker)} ↔ ${escapeHTML(b.ticker)}`;

    bodyEl.innerHTML = `
        <div class="bg-gray-950 border border-gray-800 rounded-xl p-4 text-center">
            <div class="text-4xl font-bold font-mono ${colorCls}">${Number.isFinite(r) ? r.toFixed(3) : 'N/A'}</div>
            <div class="text-[10px] text-gray-500 mt-1">Coefficient de Pearson (sur ${n} jours communs)</div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="bg-gray-950 border border-gray-800 rounded-lg p-3">
                <div class="font-mono font-bold text-white text-sm">${escapeHTML(a.ticker)}</div>
                <div class="text-[10px] text-gray-500 mt-0.5">${escapeHTML(a.name)}</div>
            </div>
            <div class="bg-gray-950 border border-gray-800 rounded-lg p-3">
                <div class="font-mono font-bold text-white text-sm">${escapeHTML(b.ticker)}</div>
                <div class="text-[10px] text-gray-500 mt-0.5">${escapeHTML(b.name)}</div>
            </div>
        </div>

        <div class="bg-gray-950 border border-gray-800 rounded-lg p-3 text-[11px] leading-relaxed">
            <div class="font-bold text-white mb-1">Interprétation</div>
            <div class="${colorCls}">${escapeHTML(niveau)}</div>
        </div>

        <div class="bg-blue-950/20 border border-blue-800/40 rounded-lg p-3 text-[10px] text-blue-100 leading-relaxed">
            <i class="fa-solid fa-circle-info text-blue-400 mr-1"></i>
            <b>Rappel :</b> la corrélation est calculée sur les rendements journaliers alignés.
            Un r ≥ +0,85 indique que les deux actifs montent et descendent au même rythme — les détenir tous les deux n'apporte pas de diversification réelle.
            Un r ≤ −0,5 indique un rôle de couverture (l'un monte quand l'autre baisse).
        </div>
    `;

    document.getElementById('modal-correlation-pair').classList.remove('hidden');
}

// ---------------------------------------------------------------------
// RENDU GLOBAL
// ---------------------------------------------------------------------
function renderCorrelationSection() {
    renderCorrelationHeatmap();
    renderCorrelationClustersAlert();

    // KPI de couverture
    const data = getCorrelationMatrix();
    const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };

    setText('correlation-stat-count', data.coverage.correlated);
    setText('correlation-stat-total', data.coverage.total);
    setText('correlation-stat-clusters', data.clusters.length);

    // KPI : corrélation moyenne globale
    const pairs = data.pairs.filter(p => Number.isFinite(p.r));
    const avgR = pairs.length > 0 ? pairs.reduce((s, p) => s + p.r, 0) / pairs.length : 0;
    const avgEl = document.getElementById('correlation-stat-avg');
    if (avgEl) {
        avgEl.innerText = (avgR * 100).toFixed(1) + ' %';
        avgEl.className = `text-lg font-bold font-mono ${
            avgR > 0.7 ? 'text-rose-400' :
            avgR > 0.4 ? 'text-amber-400' :
            'text-emerald-400'
        }`;
    }
}

// ---------------------------------------------------------------------
// INITIALISATION
// ---------------------------------------------------------------------
function initCorrelationModule() {
    console.info('[Correlation] Module chargé — matrice disponible dès que realSeriesCache est peuplé.');
}

// Expose l'API globalement
window.computeCorrelationMatrix       = computeCorrelationMatrix;
window.getCorrelationMatrix           = getCorrelationMatrix;
window.invalidateCorrelationCache     = invalidateCorrelationCache;
window.renderCorrelationSection       = renderCorrelationSection;
window.openCorrelationPairDetail      = openCorrelationPairDetail;
window.initCorrelationModule          = initCorrelationModule;