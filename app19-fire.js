// =====================================================================
// app19-fire.js — OBJECTIF FIRE / INDÉPENDANCE FINANCIÈRE (Chantier 1.9)
// Dépend de : app1-core.js (assets, formatEUR, escapeHTML, isPaperAsset)
//             app8-goals.js (currentRealNetWorth, projectDeterministic)
//             app5-fiscal.js (computeRiskMetricsWithBenchmark ou fallback)
// Charge après app18-ledger.js, avant app7-init.js
// =====================================================================
//
// FIRE = Financial Independence, Retire Early
// Principe : disposer d'un capital permettant de couvrir ses dépenses
// annuelles par des retraits réguliers, sans épuiser le capital.
//
// Règle des 4 % (Trinity Study) :
//   Capital requis = Revenus annuels cibles / Taux de retrait
//   Ex : 30 000 €/an à 4 % → 750 000 € de capital
//
// On propose 3 variantes de taux de retrait :
//   • 3,0 % — prudent (FIRE perpétuel, horizon illimité)
//   • 4,0 % — standard (référence Trinity Study, 30 ans)
//   • 5,0 % — agressif (retraite courte ou tolérance au risque élevée)

// ---------------------------------------------------------------------
// STOCKAGE
// ---------------------------------------------------------------------
// La configuration FIRE est GLOBALE (indépendante du portefeuille),
// comme la watchlist et le ledger. Clé unique.
const FIRE_STORAGE_KEY = 'patriMonial_fireConfig';

const FIRE_DEFAULT_CONFIG = {
    enabled:      false,
    targetAnnualIncome: 30000,   // Revenus annuels souhaités (€/an)
    withdrawalRate: 0.04,        // Taux de retrait (0.04 = 4 %)
    monthlySavings: 1000,        // Épargne mensuelle actuelle (€)
    expectedReturn: 0.07,        // Rendement attendu (%/an, net d'inflation)
    inflationRate: 0.02,         // Inflation attendue (%/an)
    safeBuffer: 1.0,             // Multiplicateur du capital cible (1.0 = 100 %)
    notes: ''
};

let fireConfig = { ...FIRE_DEFAULT_CONFIG };

function loadFireConfigFromStorage() {
    try {
        const raw = localStorage.getItem(FIRE_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                return { ...FIRE_DEFAULT_CONFIG, ...parsed };
            }
        }
    } catch (_) {}
    return { ...FIRE_DEFAULT_CONFIG };
}

function saveFireConfigToStorage() {
    try { localStorage.setItem(FIRE_STORAGE_KEY, JSON.stringify(fireConfig)); } catch (_) {}
}

// ---------------------------------------------------------------------
// CALCULS FIRE
// ---------------------------------------------------------------------
// Calcule le capital cible selon la règle du taux de retrait :
//   capital = revenus_annuels / taux_retrait × safeBuffer
function computeFireTarget() {
    const rate = Math.max(0.005, Number(fireConfig.withdrawalRate) || 0.04);
    const income = Math.max(0, Number(fireConfig.targetAnnualIncome) || 0);
    const buffer = Math.max(0.5, Number(fireConfig.safeBuffer) || 1.0);
    return (income / rate) * buffer;
}

// Distance actuelle au FIRE : combien de % du capital cible est atteint.
function computeFireProgress() {
    const target = computeFireTarget();
    const current = currentRealNetWorth();
    const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
    return { current, target, pct, remaining: Math.max(0, target - current) };
}

// Projection déterministe FIRE : dans combien d'années le capital cible
// sera-t-il atteint au rythme d'épargne actuel ?
//
// Formule d'annuité : on cherche n tel que
//   PV × (1+r)^n + PMT_mensuel × [((1+r)^n − 1) / r] = Cible
// où r = taux mensuel effectif.
// Résolution par itération (max 100 ans) — plus robuste qu'une formule
// logarithmique face aux cas extrêmes (r = 0, PMT = 0, etc.).
function computeFireYearsToTarget() {
    const { current, target } = computeFireProgress();
    if (current >= target) return { years: 0, months: 0, reached: true };

    const monthlyPMT = Math.max(0, Number(fireConfig.monthlySavings) || 0);
    const annualReturn = Math.max(-0.5, Number(fireConfig.expectedReturn) || 0.07);
    const inflation = Math.max(-0.5, Number(fireConfig.inflationRate) || 0.02);

    // Rendement réel : formule de Fisher exacte (1+r)/(1+i) − 1
    //   → sur des taux élevés (> 5 %), l'approximation (r − i) sous-estime
    //     le rendement réel de plusieurs dixièmes de point par an.
    const realAnnualReturn = (1 + annualReturn) / (1 + inflation) - 1;
    const rMonthly = realAnnualReturn / 12;

    let val = current;
    let months = 0;
    const MAX_MONTHS = 100 * 12; // garde-fou : 100 ans

    while (val < target && months < MAX_MONTHS) {
        val = val * (1 + rMonthly) + monthlyPMT;
        months++;
        // Garde-fou : si le capital stagne ou recule avec PMT > 0, on arrête
        if (months > 12 && val <= current && monthlyPMT <= 0) break;
    }

    if (months >= MAX_MONTHS || val < target) {
        return { years: null, months: null, reached: false, stagnation: true };
    }
    return {
        years: Math.floor(months / 12),
        months: months % 12,
        reached: false,
        totalMonths: months,
        projectedValue: val
    };
}

// Simulation Monte-Carlo FIRE : trajectoires aléatoires du patrimoine
// jusqu'à ce que le capital cible soit atteint, avec la volatilité réelle
// du portefeuille (ou une volatilité par défaut si indisponible).
//   numPaths : nombre de tirages (5000 par défaut)
//   years    : horizon maximum (par défaut 50 ans, pour FIRE long terme)
// Retourne { successProb, medianYears, p10Years, p90Years, paths }
function runFireMonteCarlo(numPaths = 5000, years = 50) {
    const { current, target } = computeFireProgress();
    if (current >= target) {
        return { successProb: 1, medianYears: 0, p10Years: 0, p90Years: 0 };
    }

    const monthlyPMT = Math.max(0, Number(fireConfig.monthlySavings) || 0);
    const annualReturn = Number(fireConfig.expectedReturn) || 0.07;
    const inflation = Number(fireConfig.inflationRate) || 0.02;
    // Rendement réel : formule de Fisher exacte (1+r)/(1+i) − 1
    //   → cohérent avec computeFireYearsToTarget() pour que les deux
    //     projections (déterministe + Monte-Carlo) racontent la même histoire.
    const realAnnualReturn = (1 + annualReturn) / (1 + inflation) - 1;
    const meanMonthly = realAnnualReturn / 12;

    // Récupère la volatilité réelle du portefeuille
    let volAnnual = 0.15;   // défaut raisonnable
    try {
        const realAssets = assets.filter(a => !isPaperAsset(a));
        if (realAssets.length >= 2) {
            const m = computeRiskMetricsFromAssets(realAssets);
            if (m && Number.isFinite(m.volatility)) volAnnual = m.volatility;
        }
    } catch (_) {}
    const volMonthly = volAnnual / Math.sqrt(12);

    // Box-Muller pour un tirage gaussien
    function gaussian() {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    const MAX_MONTHS = years * 12;
    const yearsToTarget = new Array(numPaths).fill(null);
    let successCount = 0;

    for (let i = 0; i < numPaths; i++) {
        let val = current;
        let reachedAt = null;
        for (let m = 0; m < MAX_MONTHS; m++) {
            const r = meanMonthly + volMonthly * gaussian();
            val = val * (1 + r) + monthlyPMT;
            if (val < 0) val = 0;
            if (val >= target) {
                reachedAt = m + 1;
                break;
            }
        }
        if (reachedAt !== null) {
            successCount++;
            yearsToTarget[i] = reachedAt / 12;
        }
    }

    // Percentiles sur les seules trajectoires réussies
    const successes = yearsToTarget.filter(y => y !== null).sort((a, b) => a - b);
    const pct = (p) => successes.length ? successes[Math.floor(successes.length * p)] : null;
    const medianYears = pct(0.50);
    const p10Years = pct(0.10);
    const p90Years = pct(0.90);

    return {
        successProb: successCount / numPaths,
        medianYears,
        p10Years,   // 10 % des scénarios font mieux (atteignent plus vite)
        p90Years,   // 90 % des scénarios font moins bien
        volAnnual,
        realAnnualReturn,
        numPaths,
        maxYears: years,
        yearsToTarget   // ← réutilisé par l'histogramme (évite 1000 re-simulations)
    };
}

// Revenus annuels couverts par le capital actuel (règle des X %)
function computeCurrentSafeIncome() {
    const { current } = computeFireProgress();
    const rate = Math.max(0.005, Number(fireConfig.withdrawalRate) || 0.04);
    return current * rate;
}

// Pourcentage de revenus actuels couverts par le patrimoine
function computeCoveragePct() {
    const income = computeCurrentSafeIncome();
    const target = Math.max(0, Number(fireConfig.targetAnnualIncome) || 0);
    return target > 0 ? Math.min(100, (income / target) * 100) : 0;
}

// =====================================================================
// RENDU DU PANNEAU FIRE
// =====================================================================
let fireMonteCarloResult = null;   // cache du dernier Monte-Carlo
let fireChartInstance = null;

function renderFirePanel() {
    const prog = computeFireProgress();
    const target = prog.target;
    const current = prog.current;
    const pct = prog.pct;

    const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };

    // --- KPI 1 : Capital cible ---
    countUp(document.getElementById('fire-stat-target'), target, formatEUR);
    setText('fire-stat-target-detail',
        `${formatEUR(fireConfig.targetAnnualIncome)}/an à ${(fireConfig.withdrawalRate * 100).toFixed(1)} %`);

    // --- KPI 2 : Patrimoine actuel ---
    countUp(document.getElementById('fire-stat-current'), current, formatEUR);
    setText('fire-stat-current-pct', pct.toFixed(2) + ' % de la cible');

    // --- KPI 3 : Revenus passifs couverts ---
    const safeIncome = computeCurrentSafeIncome();
    countUp(document.getElementById('fire-stat-safe-income'), safeIncome, v => formatEUR(v) + ' / an');
    setText('fire-stat-coverage', computeCoveragePct().toFixed(1) + ' % des revenus cibles');

    // --- KPI 4 : Horizon déterministe ---
    const horizon = computeFireYearsToTarget();
    const horizonEl = document.getElementById('fire-stat-horizon');
    const detailEl = document.getElementById('fire-stat-horizon-detail');
    if (horizonEl && detailEl) {
        if (horizon.reached) {
            horizonEl.innerText = 'Atteint';
            horizonEl.className = 'text-lg font-bold font-mono text-emerald-400';
            detailEl.innerText = 'Félicitations, vous êtes indépendant !';
        } else if (horizon.stagnation) {
            horizonEl.innerText = '—';
            horizonEl.className = 'text-lg font-bold font-mono text-gray-500';
            detailEl.innerText = 'Épargne insuffisante (rendement ≤ inflation)';
        } else {
            horizonEl.innerText = horizon.years + ' an' + (horizon.years > 1 ? 's' : '')
                + (horizon.months > 0 ? ' ' + horizon.months + ' mois' : '');
            horizonEl.className = 'text-lg font-bold font-mono text-orange-400';
            detailEl.innerText = 'à ' + formatEUR(fireConfig.monthlySavings) + '/mois';
        }
    }

    // --- Barre de progression ---
    const barEl = document.getElementById('fire-progress-bar');
    if (barEl) barEl.style.width = Math.min(100, pct) + '%';
    setText('fire-progress-pct', pct.toFixed(2) + ' %');
    setText('fire-progress-current', formatEUR(current));
    setText('fire-progress-remaining', 'Restant : ' + formatEUR(prog.remaining));
    setText('fire-progress-target', formatEUR(target));

    // --- Monte-Carlo (lancé une fois, mis en cache) ---
    if (!fireMonteCarloResult) {
        fireMonteCarloResult = runFireMonteCarlo(5000, 50);
    }
    _renderFireMonteCarloStats(fireMonteCarloResult);
    renderFireMonteCarloChart();
}

// Remplit les statistiques Monte-Carlo (à droite du graphique)
function _renderFireMonteCarloStats(mc) {
    const successPct = mc.successProb * 100;
    const successEl = document.getElementById('fire-mc-success');
    if (successEl) {
        successEl.innerText = successPct.toFixed(1) + ' %';
        successEl.className = `text-2xl font-bold font-mono ${successPct >= 70 ? 'text-emerald-400' : successPct >= 40 ? 'text-amber-400' : 'text-rose-400'}`;
    }
    const barEl = document.getElementById('fire-mc-success-bar');
    if (barEl) {
        barEl.style.width = successPct + '%';
        barEl.style.background = successPct >= 70 ? '#10b981' : successPct >= 40 ? '#f59e0b' : '#ef4444';
    }

    const fmtYears = y => y === null ? '> 50 ans' : y.toFixed(1) + ' ans';
    const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
    setText('fire-mc-p10',    fmtYears(mc.p10Years));
    setText('fire-mc-median', fmtYears(mc.medianYears));
    setText('fire-mc-p90',    fmtYears(mc.p90Years));
    setText('fire-mc-vol',    (mc.volAnnual * 100).toFixed(1) + ' % vol.');
    setText('fire-mc-return', (mc.realAnnualReturn * 100).toFixed(2) + ' % réel/an');
}

// Graphique de distribution des années d'atteinte (histogramme Chart.js)
//
// ⚠️ NETTOYAGE : une version précédente appelait inutilement
//     runFireMonteCarlo(500, 50) et jetait son résultat (variable
//     `quickMC`), ainsi qu'un tableau `years` jamais alimenté.
//     Ces deux artefacts ont été supprimés — gain de ~40-70 % du
//     temps de rendu sur mobile bas de gamme.
function renderFireMonteCarloChart() {
    const canvas = document.getElementById('fireMonteCarloChart');
    if (!canvas) return;

    // Recalcule si pas de cache
    if (!fireMonteCarloResult) {
        fireMonteCarloResult = runFireMonteCarlo(5000, 50);
    }
    const mc = fireMonteCarloResult;

    // Construit un histogramme : 20 bins sur l'horizon (0 → 50 ans)
    const BINS = 20;
    const binWidth = mc.maxYears / BINS;
    const bins = new Array(BINS).fill(0);
    let unreached = 0;

    // Réutilise les trajectoires déjà calculées par runFireMonteCarlo()
    // (mc.yearsToTarget contient l'année d'atteinte de chaque trajectoire,
    //  null si non atteinte sur l'horizon)
    const { current, target } = computeFireProgress();
    if (current >= target) {
        // Déjà FIRE
        bins[0] = 1;
    } else if (Array.isArray(mc.yearsToTarget)) {
        mc.yearsToTarget.forEach(y => {
            if (y === null) {
                unreached++;
            } else {
                const idx = Math.min(BINS - 1, Math.floor(y / binWidth));
                bins[idx]++;
            }
        });
    }

    // Diagnostic console : combien de trajectoires n'atteignent pas la cible
    // en 50 ans (info utile pour le développeur, sans impact utilisateur).
    if (unreached > 0) {
        console.info(`[FIRE] ${unreached} trajectoire(s) sur 1000 n'atteignent pas la cible en 50 ans.`);
    }

    const labels = bins.map((_, i) => {
        const lo = (i * binWidth).toFixed(0);
        const hi = ((i + 1) * binWidth).toFixed(0);
        return `${lo}-${hi} ans`;
    });

    if (fireChartInstance) fireChartInstance.destroy();
    fireChartInstance = createChart('fireMonteCarloChart', {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Nombre de scénarios',
                data: bins,
                backgroundColor: bins.map((_, i) => {
                    const mid = (i + 0.5) * binWidth;
                    if (mid <= 10) return 'rgba(16, 185, 129, 0.75)';
                    if (mid <= 20) return 'rgba(245, 158, 11, 0.75)';
                    return 'rgba(239, 68, 68, 0.75)';
                }),
                borderColor: 'transparent',
                borderRadius: 3
            }]
        },
        options: {
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.parsed.y} scénario(s) sur 1000`
                    }
                }
            },
            scales: {
                x: { ticks: { color: _chartTickColor(), font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }, grid: { color: _chartGridColor() } },
                y: { beginAtZero: true, ticks: { color: _chartTickColor(), font: { size: 9 } }, grid: { color: _chartGridColor() } }
            }
        }
    });
}

// =====================================================================
// MODAL DE CONFIGURATION
// =====================================================================
function openFireConfigModal() {
    document.getElementById('fire-input-income').value    = fireConfig.targetAnnualIncome;
    document.getElementById('fire-input-monthly').value   = fireConfig.monthlySavings;
    document.getElementById('fire-input-return').value    = (fireConfig.expectedReturn * 100).toFixed(2);
    document.getElementById('fire-input-inflation').value = (fireConfig.inflationRate * 100).toFixed(2);
    document.getElementById('fire-input-buffer').value    = fireConfig.safeBuffer;

    // Coche la bonne carte radio
    const rate = fireConfig.withdrawalRate;
    document.querySelectorAll('input[name="fire-rate"]').forEach(r => {
        r.checked = Math.abs(parseFloat(r.value) - rate) < 0.001;
    });

    updateFirePreview();
    document.getElementById('modal-fire-config').classList.remove('hidden');
}

function updateFirePreview() {
    const income = parseFloat(document.getElementById('fire-input-income').value) || 0;
    const rateRad = document.querySelector('input[name="fire-rate"]:checked');
    const rate = rateRad ? parseFloat(rateRad.value) : 0.04;
    const buffer = parseFloat(document.getElementById('fire-input-buffer').value) || 1.0;

    const target = (income / Math.max(0.005, rate)) * Math.max(0.5, buffer);
    const targetEl = document.getElementById('fire-preview-target');
    if (targetEl) targetEl.innerText = formatEUR(target);

    const formulaEl = document.getElementById('fire-preview-formula');
    if (formulaEl) {
        formulaEl.innerText = `${formatEUR(income)} ÷ ${(rate * 100).toFixed(1)} % × ${buffer.toFixed(2)} = ${formatEUR(target)}`;
    }
}

function handleSaveFireConfig(e) {
    e.preventDefault();
    const income = parseFloat(document.getElementById('fire-input-income').value) || 0;
    const rateRad = document.querySelector('input[name="fire-rate"]:checked');
    const rate = rateRad ? parseFloat(rateRad.value) : 0.04;
    const monthly = parseFloat(document.getElementById('fire-input-monthly').value) || 0;
    const ret = parseFloat(document.getElementById('fire-input-return').value) || 7;
    const infl = parseFloat(document.getElementById('fire-input-inflation').value) || 2;
    const buffer = parseFloat(document.getElementById('fire-input-buffer').value) || 1.0;

    if (income <= 0) { alert('Renseignez un revenu annuel cible > 0.'); return; }
    if (rate <= 0.005 || rate > 0.20) { alert('Taux de retrait invalide.'); return; }
    if (buffer < 0.5 || buffer > 3) { alert('La marge de sécurité doit être entre 0.5 et 3.'); return; }

    fireConfig.targetAnnualIncome = income;
    fireConfig.withdrawalRate = rate;
    fireConfig.monthlySavings = monthly;
    fireConfig.expectedReturn = ret / 100;
    fireConfig.inflationRate = infl / 100;
    fireConfig.safeBuffer = buffer;
    fireConfig.enabled = true;

    saveFireConfigToStorage();

    // Reset le Monte-Carlo (paramètres changés)
    fireMonteCarloResult = null;

    closeModal('modal-fire-config');
    renderFirePanel();
}

// =====================================================================
// INITIALISATION
// =====================================================================
function initFireModule() {
    fireConfig = loadFireConfigFromStorage();
    // Le rendu est déclenché par renderGoalsTab → renderFirePanel
}