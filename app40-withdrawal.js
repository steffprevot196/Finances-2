// =====================================================================
// app40-withdrawal.js — SIMULATEUR DE SORTIE PROGRESSIVE (Chantier §11)
// Dépend de : app1-core.js (assets, formatEUR, isPaperAsset)
//             app19-fire.js (fireConfig, computeFireTarget)
// Charge après app39-thesis.js, avant tests.js
// =====================================================================
//
// Répond à la question : « Puis-je retirer X €/mois à la retraite et
// tenir sur N années ? »
//
// MÉTHODE Monte-Carlo :
//   1. Capital de départ = patrimoine réel actuel
//   2. Retrait mensuel ajusté à l'inflation chaque année (retraits réels constants)
//   3. Rendement stochastique basé sur la volatilité réelle du portefeuille
//   4. 5 000 trajectoires sur 30 ans (paramétrable)
//
// RÉSULTATS :
//   • Probabilité de survie du capital (X % des trajectoires tiennent)
//   • Percentiles de capital à la fin de l'horizon
//   • Âge d'épuisement médian si insuffisant
//   • Taux de retrait initial implicite (sanity check vs règle des 4 %)
//
// STOCKAGE : patriMonial_withdrawalConfig
// =====================================================================

const WITHDRAWAL_STORAGE_KEY = 'patriMonial_withdrawalConfig';

const WITHDRAWAL_DEFAULT_CONFIG = {
    monthlyAmount: 2500,        // Retrait mensuel souhaité (€ constants)
    years: 30,                  // Horizon de retraite (années)
    expectedReturn: 0.05,       // Rendement nominal attendu (annuel)
    inflationRate: 0.02,        // Inflation annuelle
    volOverride: 0              // 0 = utilise la vol. réelle du portefeuille
};

let withdrawalConfig = { ...WITHDRAWAL_DEFAULT_CONFIG };
let _withdrawalMcResult = null;
let _withdrawalChartInstance = null;

// ---------------------------------------------------------------------
// STOCKAGE
// ---------------------------------------------------------------------
function loadWithdrawalConfigFromStorage() {
    try {
        const raw = localStorage.getItem(WITHDRAWAL_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                return { ...WITHDRAWAL_DEFAULT_CONFIG, ...parsed };
            }
        }
    } catch (_) {}
    return { ...WITHDRAWAL_DEFAULT_CONFIG };
}

function saveWithdrawalConfigToStorage() {
    try {
        localStorage.setItem(WITHDRAWAL_STORAGE_KEY, JSON.stringify(withdrawalConfig));
    } catch (_) {}
}

// ---------------------------------------------------------------------
// VOLATILITÉ RÉELLE DU PORTEFEUILLE
// ---------------------------------------------------------------------
// Réutilise computeRiskMetricsFromAssets si disponible, sinon fallback 15 %.
function _getWithdrawalVolAnnual() {
    if (Number.isFinite(withdrawalConfig.volOverride) && withdrawalConfig.volOverride > 0) {
        return withdrawalConfig.volOverride;
    }
    try {
        const realAssets = assets.filter(a => !isPaperAsset(a));
        if (realAssets.length >= 2 && typeof computeRiskMetricsFromAssets === 'function') {
            const m = computeRiskMetricsFromAssets(realAssets);
            if (m && Number.isFinite(m.volatility) && m.volatility > 0) {
                return m.volatility;
            }
        }
    } catch (_) {}
    return 0.15;
}

// ---------------------------------------------------------------------
// MONTE-CARLO DE RETRAITS
// ---------------------------------------------------------------------
// Simule numPaths trajectoires. Chaque trajectoire :
//   • part du patrimoine réel actuel
//   • subit une croissance stochastique mensuelle
//   • est amputée du retrait réel mensuel (constant en euros d'aujourd'hui)
// Retourne {
//   successProb,                      // % de trajectoires où le capital survit à horizon
//   medianFinal, p10Final, p90Final,  // capital final (survivants)
//   medianDepletionYear,              // si insuffisant (année médiane d'épuisement)
//   initialCapital, monthlyAmount, years,
//   volAnnual, realAnnualReturn,
//   capitalAtTargetDate               // référence : capital requis par FIRE (règle X%)
// }
function runWithdrawalMonteCarlo(numPaths = 5000) {
    const realAssets = assets.filter(a => !isPaperAsset(a));
    const current = realAssets.reduce((s, a) => s + (a.value || 0), 0);

    if (current <= 0) {
        return {
            successProb: 0,
            medianFinal: 0, p10Final: 0, p90Final: 0,
            medianDepletionYear: 0,
            initialCapital: 0,
            monthlyAmount: 0,
            years: 0,
            volAnnual: 0,
            realAnnualReturn: 0,
            numPaths
        };
    }

    const monthlyAmount = Math.max(0, Number(withdrawalConfig.monthlyAmount) || 0);
    const years = Math.max(1, Math.min(60, Number(withdrawalConfig.years) || 30));
    const months = years * 12;

    const annualReturn = Number(withdrawalConfig.expectedReturn) || 0.05;
    const inflation = Number(withdrawalConfig.inflationRate) || 0.02;

    // Rendement réel (Fisher exact) ; les retraits sont en euros constants,
    // donc on raisonne tout en termes réels.
    const realAnnualReturn = (1 + annualReturn) / (1 + inflation) - 1;
    const meanMonthly = realAnnualReturn / 12;

    const volAnnual = _getWithdrawalVolAnnual();
    const volMonthly = volAnnual / Math.sqrt(12);

    // Box-Muller
    function gaussian() {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    let successCount = 0;
    const finalValues = [];
    const depletionMonths = [];

    for (let i = 0; i < numPaths; i++) {
        let val = current;
        let depletedAt = null;

        for (let m = 0; m < months; m++) {
            const r = meanMonthly + volMonthly * gaussian();
            val = val * (1 + r) - monthlyAmount;
            if (val <= 0) {
                val = 0;
                depletedAt = m + 1;
                break;
            }
        }

        if (depletedAt === null) {
            successCount++;
            finalValues.push(val);
        } else {
            depletionMonths.push(depletedAt);
        }
    }

    finalValues.sort((a, b) => a - b);
    depletionMonths.sort((a, b) => a - b);

    const pctile = (arr, p) => arr.length ? arr[Math.floor(arr.length * p)] : 0;

    return {
        successProb: successCount / numPaths,
        medianFinal: pctile(finalValues, 0.50),
        p10Final: pctile(finalValues, 0.10),
        p90Final: pctile(finalValues, 0.90),
        medianDepletionYear: depletionMonths.length
            ? Math.round(depletionMonths[Math.floor(depletionMonths.length / 2)] / 12 * 10) / 10
            : null,
        initialCapital: current,
        monthlyAmount,
        years,
        volAnnual,
        realAnnualReturn,
        numPaths,
        failureCount: numPaths - successCount
    };
}

// Wrapper synchrone historique — conservé pour usage direct (tests,
// contexte non-async). Le rendu du panneau utilise désormais la version
// async ci-dessous (Chantier #13).
function getWithdrawalResult(force = false) {
    if (force || !_withdrawalMcResult) {
        _withdrawalMcResult = runWithdrawalMonteCarlo(5000);
    }
    return _withdrawalMcResult;
}

function invalidateWithdrawalCache() {
    _withdrawalMcResult = null;
}

// ---------------------------------------------------------------------
// VERSION ASYNCHRONE — Worker (Chantier #13)
// ---------------------------------------------------------------------
// Token incrémental : invalide les rendus async obsolètes quand un
// nouveau rendu démarre avant que le précédent ne se termine.
let _withdrawalCalcToken = 0;

// Version async : calcule les paramètres mensuels (Fisher + vol) en
// amont, délègue la boucle stochastique au Worker si disponible, puis
// enrichit le résultat avec les métadonnées non-stochastiques.
//
// Si le Worker n'est pas disponible (file://, vieux navigateur), le
// wrapper `runMCWithdrawalAsync` retombe automatiquement sur le calcul
// synchrone — l'appelant ne voit aucune différence.
async function getWithdrawalResultAsync(force = false) {
    // Cache chaud : retour immédiat
    if (!force && _withdrawalMcResult) return _withdrawalMcResult;

    // --- 1) Paramètres 100 % synchrones ---
    const realAssets = assets.filter(a => !isPaperAsset(a));
    const current = realAssets.reduce((s, a) => s + (a.value || 0), 0);
    if (current <= 0) return null;

    const monthlyAmount = Math.max(0, Number(withdrawalConfig.monthlyAmount) || 0);
    const years = Math.max(1, Math.min(60, Number(withdrawalConfig.years) || 30));
    const months = years * 12;

    const annualReturn = Number(withdrawalConfig.expectedReturn) || 0.05;
    const inflation = Number(withdrawalConfig.inflationRate) || 0.02;
    const realAnnualReturn = (1 + annualReturn) / (1 + inflation) - 1;
    const meanMonthly = realAnnualReturn / 12;

    const volAnnual = _getWithdrawalVolAnnual();
    const volMonthly = volAnnual / Math.sqrt(12);

    // --- 2) Appel Worker (ou fallback sync transparent) ---
    let result;
    if (typeof runMCWithdrawalAsync === 'function') {
        result = await runMCWithdrawalAsync({
            current,
            monthlyAmount,
            months,
            meanMonthly,
            volMonthly,
            numPaths: 5000
        });
    } else {
        // Aucun wrapper chargé (cas très improbable) → fallback total
        result = runWithdrawalMonteCarlo(5000);
    }

    // --- 3) Enrichit avec les métadonnées ---
    const enriched = {
        ...result,
        initialCapital: current,
        monthlyAmount,
        years,
        volAnnual,
        realAnnualReturn,
        numPaths: 5000
    };

    _withdrawalMcResult = enriched;
    return enriched;
}

// ---------------------------------------------------------------------
// RENDU — Panneau (async-aware, Chantier #13)
// ---------------------------------------------------------------------
// La fonction reste SYNCHRONE de la signature (refreshAllUI l'appelle
// sans await). À l'intérieur :
//   1. KPIs synchrones rendus immédiatement (capital, taux, vol…)
//   2. Monte-Carlo lancé en async (Worker ou fallback sync)
//   3. KPIs stochastiques rafraîchis dès que le résultat arrive
//
// Un token incrémental invalide les rendus obsolètes en cas de
// re-render rapide (changement d'onglet, save config…).
function renderWithdrawalPanel() {
    const panel = document.getElementById('withdrawal-panel');
    if (!panel) return;

    // Recharge la config
    withdrawalConfig = loadWithdrawalConfigFromStorage();

    // Token de garde anti-race
    const token = ++_withdrawalCalcToken;

    // ----------------------------------------------------------------
    // PHASE 1 — KPIs synchrones (rendu immédiat, aucune dépendance MC)
    // ----------------------------------------------------------------
    const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };

    const realAssets = assets.filter(a => !isPaperAsset(a));
    const currentCapital = realAssets.reduce((s, a) => s + (a.value || 0), 0);

    countUp(document.getElementById('withdrawal-stat-capital'), currentCapital, formatEUR);

    const monthlyAmount = Math.max(0, Number(withdrawalConfig.monthlyAmount) || 0);
    setText('withdrawal-stat-monthly', formatEUR(monthlyAmount) + ' / mois');

    const impliedRate = currentCapital > 0 ? (monthlyAmount * 12 / currentCapital * 100) : 0;
    const rateEl = document.getElementById('withdrawal-stat-rate');
    if (rateEl) {
        rateEl.innerText = impliedRate.toFixed(2) + ' % / an';
        rateEl.className = `text-lg font-bold font-mono ${
            impliedRate <= 4 ? 'text-emerald-400' :
            impliedRate <= 5 ? 'text-amber-400' :
            'text-rose-400'
        }`;
    }

    // Méthodologie (vol + rendement réel — calculs instantanés)
    const volAnnual = _getWithdrawalVolAnnual();
    const annualReturn = Number(withdrawalConfig.expectedReturn) || 0.05;
    const inflation = Number(withdrawalConfig.inflationRate) || 0.02;
    const realAnnualReturn = (1 + annualReturn) / (1 + inflation) - 1;
    setText('withdrawal-stat-vol', (volAnnual * 100).toFixed(1) + ' %');
    setText('withdrawal-stat-real', (realAnnualReturn * 100).toFixed(2) + ' %');

    // ----------------------------------------------------------------
    // PHASE 2 — KPIs stochastiques (cache immédiat ou async)
    // ----------------------------------------------------------------
    if (_withdrawalMcResult) {
        // Cache chaud → rendu immédiat
        _renderWithdrawalMcKpis(_withdrawalMcResult);
    } else {
        // Affiche un état "calcul en cours" (dernier état connu : 0)
        _showWithdrawalLoadingState();

        // Calcul async puis mise à jour
        getWithdrawalResultAsync().then(r => {
            if (token !== _withdrawalCalcToken) return;  // un nouveau rendu a pris la main
            if (!r) {
                _showWithdrawalEmptyState();
                return;
            }
            _renderWithdrawalMcKpis(r);
        }).catch(err => {
            console.warn('[Withdrawal] Erreur Monte-Carlo async :', err);
            _showWithdrawalEmptyState('Erreur de calcul — voir console.');
        });
    }
}

// Rendu des KPIs dépendants du Monte-Carlo.
function _renderWithdrawalMcKpis(r) {
    const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };

    // Probabilité de succès
    const successEl = document.getElementById('withdrawal-stat-success');
    if (successEl) {
        const pct = r.successProb * 100;
        countUp(successEl, pct, v => v.toFixed(1) + ' %');
        successEl.className = `text-2xl font-bold font-mono ${
            pct >= 85 ? 'text-emerald-400' :
            pct >= 60 ? 'text-amber-400' :
            'text-rose-400'
        }`;
    }

    // Barre de progression
    const bar = document.getElementById('withdrawal-stat-success-bar');
    if (bar) {
        const pct = r.successProb * 100;
        bar.style.width = pct + '%';
        bar.style.background = pct >= 85 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';
    }

    // Percentiles
    setText('withdrawal-stat-p10', formatEUR(r.p10Final));
    setText('withdrawal-stat-median', formatEUR(r.medianFinal));
    setText('withdrawal-stat-p90', formatEUR(r.p90Final));

    // Diagnostic
    const diagEl = document.getElementById('withdrawal-diagnostic');
    if (diagEl) {
        const pct = r.successProb * 100;
        let msg = '';
        let cls = '';
        if (pct >= 90) {
            msg = `Retrait très sûr : ${pct.toFixed(0)} % des trajectoires tiennent sur ${r.years} ans.`;
            cls = 'text-emerald-300';
        } else if (pct >= 70) {
            msg = `Retrait raisonnable : ${pct.toFixed(0)} % de succès. Envisagez une marge de sécurité ou un retrait variable.`;
            cls = 'text-amber-300';
        } else if (pct >= 40) {
            msg = `Retrait risqué : ${pct.toFixed(0)} % seulement. Réduisez le montant ou l'horizon.`;
            cls = 'text-orange-300';
        } else {
            const depletion = r.medianDepletionYear ? ` Capital épuisé vers l'année ${r.medianDepletionYear}.` : '';
            msg = `Retrait insoutenable : ${pct.toFixed(0)} % de succès.${depletion}`;
            cls = 'text-rose-300';
        }
        diagEl.className = `text-[11px] leading-relaxed ${cls}`;
        diagEl.innerText = msg;
    }

    // Bandeau d'alerte d'épuisement
    const depEl = document.getElementById('withdrawal-depletion-alert');
    if (depEl) {
        if (r.medianDepletionYear !== null && r.successProb < 0.5) {
            depEl.classList.remove('hidden');
            depEl.innerHTML = `
                <i class="fa-solid fa-triangle-exclamation mr-1"></i>
                <b>Capital épuisé en médiane à l'année ${r.medianDepletionYear}</b> sur ${r.years} ans.
                <span class="text-gray-400">Sur ${r.numPaths} scénarios, ${r.failureCount} n'ont pas tenu.</span>
            `;
        } else {
            depEl.classList.add('hidden');
        }
    }
}

// État visuel pendant un calcul (résultat non encore disponible).
function _showWithdrawalLoadingState() {
    const successEl = document.getElementById('withdrawal-stat-success');
    if (successEl) {
        successEl.innerText = '⏳ …';
        successEl.className = 'text-2xl font-bold font-mono text-violet-400';
    }
    const diagEl = document.getElementById('withdrawal-diagnostic');
    if (diagEl) {
        diagEl.className = 'text-[11px] leading-relaxed text-violet-300';
        diagEl.innerText = 'Simulation Monte-Carlo en cours (5000 trajectoires)…';
    }
    const depEl = document.getElementById('withdrawal-depletion-alert');
    if (depEl) depEl.classList.add('hidden');
}

// État visuel quand la simulation ne peut pas être lancée.
function _showWithdrawalEmptyState(reason) {
    const successEl = document.getElementById('withdrawal-stat-success');
    if (successEl) {
        successEl.innerText = '— %';
        successEl.className = 'text-2xl font-bold font-mono text-gray-500';
    }
    const diagEl = document.getElementById('withdrawal-diagnostic');
    if (diagEl) {
        diagEl.className = 'text-[11px] leading-relaxed text-gray-500 italic';
        diagEl.innerText = reason || 'Ajoutez des actifs pour lancer la simulation.';
    }
    ['withdrawal-stat-p10', 'withdrawal-stat-median', 'withdrawal-stat-p90'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = '—';
    });
    const depEl = document.getElementById('withdrawal-depletion-alert');
    if (depEl) depEl.classList.add('hidden');
}

// ---------------------------------------------------------------------
// MODAL DE CONFIGURATION
// ---------------------------------------------------------------------
function openWithdrawalConfigModal() {
    withdrawalConfig = loadWithdrawalConfigFromStorage();
    document.getElementById('wd-input-monthly').value    = withdrawalConfig.monthlyAmount;
    document.getElementById('wd-input-years').value      = withdrawalConfig.years;
    document.getElementById('wd-input-return').value     = (withdrawalConfig.expectedReturn * 100).toFixed(2);
    document.getElementById('wd-input-inflation').value  = (withdrawalConfig.inflationRate * 100).toFixed(2);
    document.getElementById('wd-input-vol').value        = withdrawalConfig.volOverride > 0
        ? (withdrawalConfig.volOverride * 100).toFixed(1)
        : '';

    updateWithdrawalPreview();
    document.getElementById('modal-withdrawal-config').classList.remove('hidden');
}

function updateWithdrawalPreview() {
    const monthly = parseFloat(document.getElementById('wd-input-monthly').value) || 0;
    const years = parseInt(document.getElementById('wd-input-years').value, 10) || 30;

    // Aperçu : capital requis naïf (sans rendement)
    const naiveTotal = monthly * 12 * years;
    const el = document.getElementById('wd-preview-total');
    if (el) el.innerText = formatEUR(naiveTotal);

    const detailEl = document.getElementById('wd-preview-detail');
    if (detailEl) {
        detailEl.innerText = `Retraits nominaux bruts sur ${years} ans (sans prise en compte du rendement ni de l'inflation)`;
    }
}

function handleSaveWithdrawalConfig(e) {
    e.preventDefault();
    const monthly = parseFloat(document.getElementById('wd-input-monthly').value) || 0;
    const years = parseInt(document.getElementById('wd-input-years').value, 10) || 30;
    const ret = parseFloat(document.getElementById('wd-input-return').value) || 5;
    const infl = parseFloat(document.getElementById('wd-input-inflation').value) || 2;
    const volRaw = parseFloat(document.getElementById('wd-input-vol').value);
    const vol = Number.isFinite(volRaw) && volRaw > 0 ? volRaw / 100 : 0;

    if (monthly < 0) { alert('Le retrait mensuel doit être positif.'); return; }
    if (years < 1 || years > 60) { alert('L\'horizon doit être entre 1 et 60 ans.'); return; }
    if (vol !== 0 && (vol < 0.01 || vol > 1)) { alert('La volatilité doit être entre 1 % et 100 %.'); return; }

    withdrawalConfig.monthlyAmount = monthly;
    withdrawalConfig.years = years;
    withdrawalConfig.expectedReturn = ret / 100;
    withdrawalConfig.inflationRate = infl / 100;
    withdrawalConfig.volOverride = vol;

    saveWithdrawalConfigToStorage();
    invalidateWithdrawalCache();

    closeModal('modal-withdrawal-config');
    renderWithdrawalPanel();

    if (typeof toastSuccess === 'function') {
        toastSuccess('Configuration enregistrée', 'La simulation a été recalculée.');
    }
}

// ---------------------------------------------------------------------
// INITIALISATION
// ---------------------------------------------------------------------
function initWithdrawalModule() {
    withdrawalConfig = loadWithdrawalConfigFromStorage();
    console.info('[Withdrawal] Module chargé — simulateur de sortie prêt.');
}

// Expose l'API globalement
window.loadWithdrawalConfigFromStorage  = loadWithdrawalConfigFromStorage;
window.saveWithdrawalConfigToStorage    = saveWithdrawalConfigToStorage;
window.runWithdrawalMonteCarlo          = runWithdrawalMonteCarlo;
window.getWithdrawalResult              = getWithdrawalResult;
window.invalidateWithdrawalCache        = invalidateWithdrawalCache;
window.renderWithdrawalPanel            = renderWithdrawalPanel;
window.openWithdrawalConfigModal        = openWithdrawalConfigModal;
window.updateWithdrawalPreview          = updateWithdrawalPreview;
window.handleSaveWithdrawalConfig       = handleSaveWithdrawalConfig;
window.initWithdrawalModule             = initWithdrawalModule;