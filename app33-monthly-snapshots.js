// =====================================================================
// app33-monthly-snapshots.js — RAPPORT DE PERFORMANCE MENSUEL (Chantier §4)
// Dépend de : app1-core.js, app5-fiscal.js, app11-scoring.js
// Charge après app32-per.js, avant tests.js
// =====================================================================
//
// À chaque début de mois, archive automatiquement les métriques clés du
// portefeuille : valeur totale, capital investi, P&L, top/flop 3, allocation
// par cadran. Permet de suivre la progression sur le long terme (MoM / YoY)
// et de visualiser la performance mensuelle sous forme de bar chart.
//
// STOCKAGE :
//   • localStorage : patriMonial_monthlySnapshots (liste, max 60 éléments)
//   • Format : [{ month, capturedAt, totalValue, totalInvested, pnl, pnlPct,
//                 top3, flop3, byCadran }]
//
// Le snapshot du mois courant est mis à jour à chaque refreshAllUI()
// (throttlé à 1× toutes les 30 min pour éviter le spam d'écritures).
// L'archive finale d'un mois est figée automatiquement au premier passage
// du mois suivant.
// =====================================================================

const MONTHLY_SNAPSHOTS_KEY = 'patriMonial_monthlySnapshots';
const MONTHLY_SNAPSHOTS_MAX = 60;              // 5 ans d'historique
const MONTHLY_REFRESH_THROTTLE_MS = 30 * 60 * 1000;   // 30 min

let _monthlyChartInstance = null;
let _lastMonthlyRefreshAt = 0;

// ---------------------------------------------------------------------
// STOCKAGE
// ---------------------------------------------------------------------
function loadMonthlySnapshots() {
    try {
        const raw = localStorage.getItem(MONTHLY_SNAPSHOTS_KEY);
        if (raw) {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) return list;
        }
    } catch (_) {}
    return [];
}

function saveMonthlySnapshots(list) {
    try {
        localStorage.setItem(MONTHLY_SNAPSHOTS_KEY, JSON.stringify(list));
    } catch (err) {
        console.warn('[MonthlySnapshots] Sauvegarde impossible :', err);
    }
}

// Renvoie la clé du mois courant au format 'YYYY-MM'
function _currentMonthKey() {
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

// Formate une clé 'YYYY-MM' en libellé humain (« Oct 2025 »)
function _monthLabel(monthKey) {
    const [year, month] = monthKey.split('-').map(Number);
    const mois = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin',
                  'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    return mois[month - 1] + ' ' + year;
}

// ---------------------------------------------------------------------
// CAPTURE D'UN SNAPSHOT
// ---------------------------------------------------------------------
// Calcule tous les agrégats du portefeuille réel et construit l'objet
// snapshot prêt à être persisté.
function _buildMonthlySnapshot() {
    const realAssets = assets.filter(a => !isPaperAsset(a));

    const totalValue    = realAssets.reduce((s, a) => s + (a.value    || 0), 0);
    const totalInvested = realAssets.reduce((s, a) => s + (a.invested || 0), 0);
    const pnl           = totalValue - totalInvested;
    const pnlPct        = totalInvested > 0 ? (pnl / totalInvested * 100) : 0;

    // Top 3 / Flop 3 par P&L €
    const sorted = realAssets
        .map(a => ({
            id: a.id,
            name: a.name,
            ticker: a.ticker,
            pnl: (a.value || 0) - (a.invested || 0),
            pnlPct: a.invested > 0 ? ((a.value || 0) - (a.invested || 0)) / a.invested * 100 : 0
        }))
        .sort((a, b) => b.pnl - a.pnl);

    const top3  = sorted.slice(0, 3);
    const flop3 = sorted.slice(-3).reverse();

    // Allocation par cadran (4 Cadrans de Gave)
    const byCadran = {};
    GAVE_QUADRANTS.forEach(q => {
        byCadran[q] = realAssets
            .filter(a => a.cadran === q)
            .reduce((s, a) => s + (a.value || 0), 0);
    });

    return {
        month:         _currentMonthKey(),
        capturedAt:    Date.now(),
        totalValue,
        totalInvested,
        pnl,
        pnlPct,
        positionsCount: realAssets.length,
        top3,
        flop3,
        byCadran
    };
}

// Enregistre (ou remplace) le snapshot du mois courant.
function captureMonthlySnapshot() {
    const snapshot = _buildMonthlySnapshot();
    let list = loadMonthlySnapshots();

    // Remplace l'entrée du mois courant si elle existe déjà
    const idx = list.findIndex(s => s.month === snapshot.month);
    if (idx > -1) {
        list[idx] = snapshot;
    } else {
        list.push(snapshot);
    }

    // Garde les MONTHLY_SNAPSHOTS_MAX derniers (tri chronologique)
    list.sort((a, b) => a.month.localeCompare(b.month));
    if (list.length > MONTHLY_SNAPSHOTS_MAX) {
        list = list.slice(-MONTHLY_SNAPSHOTS_MAX);
    }

    saveMonthlySnapshots(list);
    return snapshot;
}

// ---------------------------------------------------------------------
// CHECK AU BOOT + THROTTLE REFRESH
// ---------------------------------------------------------------------
// Appelée au démarrage : crée le snapshot du mois courant s'il n'existe
// pas encore.
function checkMonthlySnapshot() {
    const list = loadMonthlySnapshots();
    const current = _currentMonthKey();
    if (!list.some(s => s.month === current)) {
        console.info('[MonthlySnapshots] Création du snapshot pour', current);
        captureMonthlySnapshot();
    }
    _lastMonthlyRefreshAt = Date.now();
}

// Appelée par refreshAllUI() : met à jour le snapshot du mois courant
// (throttlé à 1× / 30 min pour éviter le spam d'écritures localStorage).
function maybeUpdateMonthlySnapshot() {
    const now = Date.now();
    if (now - _lastMonthlyRefreshAt < MONTHLY_REFRESH_THROTTLE_MS) return;
    _lastMonthlyRefreshAt = now;
    captureMonthlySnapshot();
}

// ---------------------------------------------------------------------
// CALCUL MoM / YoY
// ---------------------------------------------------------------------
// Enrichit chaque snapshot avec les variations vs M-1 (MoM) et M-12 (YoY).
// Renvoie un tableau trié du plus récent au plus ancien.
function _enrichSnapshotsWithVariations() {
    const list = loadMonthlySnapshots().sort((a, b) => a.month.localeCompare(b.month));

    return list.map((s, i) => {
        const prev = i > 0 ? list[i - 1] : null;
        const year = i >= 12 ? list[i - 12] : null;

        const mom = prev && prev.totalValue > 0 ? {
            deltaEUR: s.totalValue - prev.totalValue,
            deltaPct: ((s.totalValue - prev.totalValue) / prev.totalValue) * 100
        } : null;

        const yoy = year && year.totalValue > 0 ? {
            deltaEUR: s.totalValue - year.totalValue,
            deltaPct: ((s.totalValue - year.totalValue) / year.totalValue) * 100
        } : null;

        return { ...s, mom, yoy };
    }).reverse();   // Plus récent en tête
}

// ---------------------------------------------------------------------
// RENDU — Tableau historique
// ---------------------------------------------------------------------
function renderMonthlyHistoryTable() {
    const wrap = document.getElementById('monthly-history-table-wrap');
    if (!wrap) return;

    const list = _enrichSnapshotsWithVariations();

    if (!list.length) {
        wrap.innerHTML = '<div class="text-center text-gray-500 italic text-xs py-4">Aucun historique — le premier snapshot sera créé ce mois-ci.</div>';
        return;
    }

    // Limite l'affichage aux 12 derniers mois
    const recent = list.slice(0, 12);

    wrap.innerHTML = `
        <div class="overflow-x-auto rounded-xl border border-gray-800">
            <table class="w-full text-left text-xs">
                <thead class="bg-gray-950 text-gray-400 uppercase font-medium">
                    <tr>
                        <th class="p-2.5">Mois</th>
                        <th class="p-2.5 text-right">Valeur</th>
                        <th class="p-2.5 text-right">Investi</th>
                        <th class="p-2.5 text-right">P&amp;L</th>
                        <th class="p-2.5 text-right">%</th>
                        <th class="p-2.5 text-right" title="Variation vs mois précédent">MoM</th>
                        <th class="p-2.5 text-right" title="Variation vs même mois l'an dernier">YoY</th>
                    </tr>
                </thead>
                <tbody class="font-mono">
                    ${recent.map(s => {
                        const pnlCls = s.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400';
                        const momCls = s.mom ? (s.mom.deltaEUR >= 0 ? 'text-emerald-400' : 'text-rose-400') : 'text-gray-600';
                        const yoyCls = s.yoy ? (s.yoy.deltaEUR >= 0 ? 'text-emerald-400' : 'text-rose-400') : 'text-gray-600';
                        const momTxt = s.mom
                            ? (s.mom.deltaEUR >= 0 ? '+' : '') + formatEUR(s.mom.deltaEUR) +
                              ' (' + (s.mom.deltaPct >= 0 ? '+' : '') + s.mom.deltaPct.toFixed(2) + ' %)'
                            : '—';
                        const yoyTxt = s.yoy
                            ? (s.yoy.deltaEUR >= 0 ? '+' : '') + formatEUR(s.yoy.deltaEUR) +
                              ' (' + (s.yoy.deltaPct >= 0 ? '+' : '') + s.yoy.deltaPct.toFixed(2) + ' %)'
                            : '—';
                        return `<tr class="border-b border-gray-800/60 hover:bg-gray-800/40 transition">
                            <td class="p-2.5 text-gray-300 font-sans">${_monthLabel(s.month)}</td>
                            <td class="p-2.5 text-right text-white font-bold">${formatEUR(s.totalValue)}</td>
                            <td class="p-2.5 text-right text-gray-400">${formatEUR(s.totalInvested)}</td>
                            <td class="p-2.5 text-right ${pnlCls} font-bold">${s.pnl >= 0 ? '+' : ''}${formatEUR(s.pnl)}</td>
                            <td class="p-2.5 text-right ${pnlCls} text-[10px]">${s.pnlPct >= 0 ? '+' : ''}${s.pnlPct.toFixed(2)} %</td>
                            <td class="p-2.5 text-right ${momCls} text-[10px]">${momTxt}</td>
                            <td class="p-2.5 text-right ${yoyCls} text-[10px]">${yoyTxt}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// ---------------------------------------------------------------------
// RENDU — Bar chart "Performance mensuelle"
// ---------------------------------------------------------------------
function renderMonthlyPerformanceChart() {
    const canvas = document.getElementById('monthlyPerformanceChart');
    if (!canvas) return;

    const list = _enrichSnapshotsWithVariations().slice(0, 12).reverse();

    if (list.length < 2) {
        if (_monthlyChartInstance) { _monthlyChartInstance.destroy(); _monthlyChartInstance = null; }
        // Affiche un état vide dans le conteneur parent
        const wrap = canvas.parentElement;
        if (wrap && !wrap.querySelector('.monthly-empty-state')) {
            const empty = document.createElement('div');
            empty.className = 'monthly-empty-state flex items-center justify-center h-full text-gray-500 italic text-xs';
            empty.innerText = 'Historique insuffisant (2 mois minimum requis).';
            wrap.appendChild(empty);
        }
        return;
    }

    // Retire l'éventuel état vide
    const wrap = canvas.parentElement;
    if (wrap) {
        const empty = wrap.querySelector('.monthly-empty-state');
        if (empty) empty.remove();
    }

    const labels = list.map(s => _monthLabel(s.month));
    const values = list.map(s => s.mom ? Math.round(s.mom.deltaEUR * 100) / 100 : 0);
    const colors = values.map(v => v >= 0 ? 'rgba(16, 185, 129, 0.75)' : 'rgba(244, 63, 94, 0.75)');

    if (_monthlyChartInstance) _monthlyChartInstance.destroy();
    _monthlyChartInstance = createChart('monthlyPerformanceChart', {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Variation MoM (€)',
                data: values,
                backgroundColor: colors,
                borderColor: 'transparent',
                borderRadius: 4
            }]
        },
        options: {
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const s = list[ctx.dataIndex];
                            const v = ctx.parsed.y;
                            const pct = s.mom ? s.mom.deltaPct : 0;
                            return (v >= 0 ? '+' : '') + formatEUR(v) +
                                   ' (' + (pct >= 0 ? '+' : '') + pct.toFixed(2) + ' %)';
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: _chartTickColor(), font: { size: 10 }, maxRotation: 0, autoSkip: true },
                    grid: { color: _chartGridColor() }
                },
                y: {
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

// ---------------------------------------------------------------------
// RENDU GLOBAL
// ---------------------------------------------------------------------
function renderMonthlySnapshotsSection() {
    renderMonthlyHistoryTable();
    renderMonthlyPerformanceChart();
}

// ---------------------------------------------------------------------
// INITIALISATION
// ---------------------------------------------------------------------
function initMonthlySnapshotsModule() {
    checkMonthlySnapshot();
    console.info('[MonthlySnapshots] Module chargé — ' + loadMonthlySnapshots().length + ' snapshot(s) en mémoire.');
}

// Hook sur refreshAllUI : met à jour le snapshot courant (throttlé)
(function _hookRefreshAllUIForMonthly() {
    // ⚠ Au moment de l'évaluation (chargement du script), refreshAllUI est
    // défini (app6-api.js chargé en amont). On wrap.
    const orig = window.refreshAllUI;
    if (typeof orig !== 'function') return;
    if (orig._monthlyHooked) return;
    const wrapped = function (...args) {
        const r = orig.apply(this, args);
        try { maybeUpdateMonthlySnapshot(); } catch (_) {}
        return r;
    };
    wrapped._monthlyHooked = true;
    wrapped._originalFn = orig;
    window.refreshAllUI = wrapped;
})();

// Expose l'API globalement
window.loadMonthlySnapshots         = loadMonthlySnapshots;
window.captureMonthlySnapshot       = captureMonthlySnapshot;
window.checkMonthlySnapshot         = checkMonthlySnapshot;
window.renderMonthlySnapshotsSection = renderMonthlySnapshotsSection;
window.initMonthlySnapshotsModule   = initMonthlySnapshotsModule;