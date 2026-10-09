// =====================================================================
// app32-per.js — SIMULATEUR RETRAITE PER (Chantier §3)
// Dépend de : app1-core.js, app8-goals.js (projectDeterministic)
// Charge après app31-esg.js, avant tests.js
// =====================================================================
//
// Simule un Plan Épargne Retraite (PER) français :
//   • Phase d'accumulation (versements mensuels + rendement composé)
//   • Phase de sortie (capital / rente / mixte) avec fiscalité détaillée
//   • Comparaison PER vs CTO équivalent (même effort d'épargne net)
//
// FISCALITÉ FRANÇAISE APPLIQUÉE :
//   • Versements : déductibles du revenu imposable → économie immédiate
//     = versement × TMI (Tranche Marginale d'Imposition)
//   • Sortie en CAPITAL :
//       - Part versements : barème IR après abattement 10% + PS 17,2%
//       - Part plus-values : PFU 30% (12,8% IR + 17,2% PS)
//   • Sortie en RENTE :
//       - Conversion capital → rente via taux d'annuité (paramétrable)
//       - Même distinction versements / plus-values qu'en capital
//   • Sortie MIXTE : X% capital + (1-X)% rente
//
// Comparaison CTO : sans PER, l'utilisateur paie l'IR immédiatement sur
// son revenu, puis investit le NET dans un CTO. À la sortie, seules les
// plus-values sont taxées au PFU 30%.

// ---------------------------------------------------------------------
// CONFIGURATION PAR DÉFAUT
// ---------------------------------------------------------------------
const PER_STORAGE_KEY = 'patriMonial_perConfig';

const PER_DEFAULT_CONFIG = {
    currentAge: 35,
    retirementAge: 64,
    currentBalance: 0,          // Solde PER actuel
    monthlyContribution: 300,   // Versement mensuel brut
    expectedReturn: 0.05,       // Rendement annuel nominal
    tmiEntry: 0.30,             // TMI actuelle (phase épargne)
    tmiRetirement: 0.11,        // TMI estimée à la retraite
    exitMode: 'capital',        // 'capital' | 'rente' | 'mixte'
    mixedCapitalPct: 0.50,      // % capital si mode 'mixte'
    annuityRate: 0.04,          // Taux annuité viagère (~4% à 65 ans)
    notes: ''
};

let perConfig = { ...PER_DEFAULT_CONFIG };

function loadPerConfigFromStorage() {
    try {
        const raw = localStorage.getItem(PER_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                return { ...PER_DEFAULT_CONFIG, ...parsed };
            }
        }
    } catch (_) {}
    return { ...PER_DEFAULT_CONFIG };
}

function savePerConfigToStorage() {
    try { localStorage.setItem(PER_STORAGE_KEY, JSON.stringify(perConfig)); } catch (_) {}
}

// ---------------------------------------------------------------------
// CALCUL — PHASE D'ACCUMULATION
// ---------------------------------------------------------------------
// Simule la croissance du PER jusqu'à la retraite avec versements
// mensuels. Retourne :
//   { finalBalance, totalContributions, totalGains,
//     economyTax, yearsToRetirement, yearlyData }
function calculatePerAccumulation() {
    const years = Math.max(0, perConfig.retirementAge - perConfig.currentAge);
    const months = years * 12;
    const rMonthly = perConfig.expectedReturn / 12;
    const monthlyPMT = Math.max(0, perConfig.monthlyContribution);

    let balance = Math.max(0, perConfig.currentBalance);
    let totalContributions = balance;      // Le solde actuel compte comme déjà versé
    let economyTax = 0;

    // Économie d'impôt immédiate sur le solde actuel
    economyTax += totalContributions * perConfig.tmiEntry;

    const yearlyData = [{
        year: 0, age: perConfig.currentAge,
        balance, contributions: totalContributions
    }];

    for (let year = 1; year <= years; year++) {
        for (let m = 0; m < 12; m++) {
            balance = balance * (1 + rMonthly) + monthlyPMT;
            totalContributions += monthlyPMT;
            economyTax += monthlyPMT * perConfig.tmiEntry;
        }
        yearlyData.push({
            year,
            age: perConfig.currentAge + year,
            balance,
            contributions: totalContributions
        });
    }

    return {
        finalBalance: balance,
        totalContributions,
        totalGains: balance - totalContributions,
        economyTax,
        yearsToRetirement: years,
        monthlyPMT,
        yearlyData
    };
}

// ---------------------------------------------------------------------
// FISCALITÉ — SORTIE EN CAPITAL
// ---------------------------------------------------------------------
// Versements : barème IR après abattement 10% + PS 17,2%
// Plus-values : PFU 30%
function computePerCapitalExit(accumulation) {
    const versements  = accumulation.totalContributions;
    const plusValues  = Math.max(0, accumulation.totalGains);

    // Part versements : abattement 10% pour frais professionnels (proxy)
    const abattement  = versements * 0.10;
    const baseIR      = versements - abattement;
    const IR          = baseIR * perConfig.tmiRetirement;
    const PS          = versements * 0.172;   // PS sur la totalité des versements
    const taxVersements = IR + PS;

    // Part plus-values : PFU 30%
    const taxPlusValues = plusValues * 0.30;

    const totalTax = taxVersements + taxPlusValues;
    const netRecu = accumulation.finalBalance - totalTax;

    return {
        versements, plusValues,
        taxVersements, taxPlusValues,
        totalTax, netRecu,
        // Détail pour UI
        detail: {
            IR, PS, abattement, PFU: taxPlusValues
        }
    };
}

// ---------------------------------------------------------------------
// FISCALITÉ — SORTIE EN RENTE
// ---------------------------------------------------------------------
// Conversion capital → rente viagère via le taux d'annuité.
// Puis fiscalité annuelle sur la rente, avec la même distinction
// versements / plus-values (au prorata).
function computePerRenteExit(accumulation) {
    const capital  = accumulation.finalBalance;
    const versements = accumulation.totalContributions;
    const plusValues = Math.max(0, accumulation.totalGains);

    // Rente annuelle brute
    const renteAnnuelle = capital * perConfig.annuityRate;

    // Ratio versements / plus-values dans le capital
    const ratioVersements = capital > 0 ? versements / capital : 0;
    const ratioPV = capital > 0 ? plusValues / capital : 0;

    // Décomposition de la rente
    const renteVersements = renteAnnuelle * ratioVersements;
    const rentePV = renteAnnuelle * ratioPV;

    // Fiscalité annuelle
    const abattement = renteVersements * 0.10;
    const baseIR = renteVersements - abattement;
    const IR = baseIR * perConfig.tmiRetirement;
    const PS = renteAnnuelle * 0.172;   // PS sur la totalité
    const PFU = rentePV * 0.30;

    const taxAnnuelle = IR + PS + PFU;
    const renteNetteAnnuelle = renteAnnuelle - taxAnnuelle;

    return {
        renteAnnuelle,
        renteMensuelleBrute: renteAnnuelle / 12,
        renteNetteAnnuelle,
        renteMensuelleNette: renteNetteAnnuelle / 12,
        taxAnnuelle,
        detail: { IR, PS, PFU, abattement },
        ratioVersements, ratioPV
    };
}

// ---------------------------------------------------------------------
// FISCALITÉ — SORTIE MIXTE
// ---------------------------------------------------------------------
function computePerMixedExit(accumulation) {
    const pctCapital = Math.max(0, Math.min(1, perConfig.mixedCapitalPct));

    // On simule les deux modes sur la PARTIE du capital correspondante
    const accumulationCapital = {
        ...accumulation,
        finalBalance: accumulation.finalBalance * pctCapital,
        totalContributions: accumulation.totalContributions * pctCapital,
        totalGains: accumulation.totalGains * pctCapital
    };
    const accumulationRente = {
        ...accumulation,
        finalBalance: accumulation.finalBalance * (1 - pctCapital),
        totalContributions: accumulation.totalContributions * (1 - pctCapital),
        totalGains: accumulation.totalGains * (1 - pctCapital)
    };

    const capital = computePerCapitalExit(accumulationCapital);
    const rente   = computePerRenteExit(accumulationRente);

    return {
        pctCapital,
        pctRente: 1 - pctCapital,
        capital,
        rente,
        totalTaxInitiale: capital.totalTax,   // Impôt sur la part capital
        netCapitalInitial: capital.netRecu,
        renteNetteAnnuelle: rente.renteNetteAnnuelle
    };
}

// ---------------------------------------------------------------------
// COMPARAISON PER vs CTO
// ---------------------------------------------------------------------
// Hypothèse : sans PER, l'utilisateur paie l'IR immédiatement sur son
// revenu, puis investit le NET mensuel dans un CTO (fiscalité PFU 30%
// sur les plus-values à la sortie). Rendement identique.
function computeCtoComparison(accumulation) {
    const monthlyNet = perConfig.monthlyContribution * (1 - perConfig.tmiEntry);
    const rMonthly = perConfig.expectedReturn / 12;
    const months = accumulation.yearsToRetirement * 12;

    // Le solde PER actuel, s'il n'avait pas été placé en PER, serait
    // disponible net d'impôt (approximation)
    let balance = Math.max(0, perConfig.currentBalance) * (1 - perConfig.tmiEntry);
    let totalInvested = balance;

    for (let m = 0; m < months; m++) {
        balance = balance * (1 + rMonthly) + monthlyNet;
        totalInvested += monthlyNet;
    }

    const gains = Math.max(0, balance - totalInvested);
    const tax = gains * 0.30;         // PFU sur les plus-values
    const netRecu = balance - tax;

    return {
        finalBalance: balance,
        totalInvested,
        gains,
        tax,
        netRecu,
        monthlyNet
    };
}

// ---------------------------------------------------------------------
// SYNTHÈSE COMPLÈTE
// ---------------------------------------------------------------------
// Retourne un objet avec tous les scénarios + le verdict comparatif.
function computePerProjection() {
    const accumulation = calculatePerAccumulation();
    const capitalExit = computePerCapitalExit(accumulation);
    const renteExit   = computePerRenteExit(accumulation);
    const mixedExit   = computePerMixedExit(accumulation);
    const cto         = computeCtoComparison(accumulation);

    // Sélectionne le scénario selon le mode actif
    let selectedNet = 0;
    if (perConfig.exitMode === 'capital') selectedNet = capitalExit.netRecu;
    else if (perConfig.exitMode === 'rente') {
        // Pour comparer avec CTO, on capitalise la rente nette
        // (approximation : on utilise la rente nette × espérance de vie 20 ans)
        selectedNet = renteExit.renteNetteAnnuelle * 20;
    } else {
        selectedNet = mixedExit.netCapitalInitial + (mixedExit.renteNetteAnnuelle * 20 * mixedExit.pctRente);
    }

    // Verdict PER vs CTO
    // On compare sur la base du net reçu (PER) vs net reçu (CTO)
    // + économie d'impôt initiale du PER (qui est déjà incluse dans
    //   le fait qu'on a versé BRUT sur le PER mais NET sur le CTO)
    const perAdvantage = selectedNet - cto.netRecu;
    const perWins = perAdvantage > 0;

    return {
        accumulation,
        capitalExit,
        renteExit,
        mixedExit,
        cto,
        selectedNet,
        perAdvantage,
        perWins,
        yearsToRetirement: accumulation.yearsToRetirement,
        exitMode: perConfig.exitMode
    };
}

// ---------------------------------------------------------------------
// MONTE-CARLO
// ---------------------------------------------------------------------
// Simule 5000 trajectoires avec volatilité paramétrable (défaut 12 %).
// Retourne les percentiles du capital final.
function runPerMonteCarlo(numPaths = 5000) {
    const years = Math.max(0, perConfig.retirementAge - perConfig.currentAge);
    const months = years * 12;
    const meanMonthly = perConfig.expectedReturn / 12;
    const volMonthly = 0.12 / Math.sqrt(12);

    function gaussian() {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    const finals = new Array(numPaths);
    const monthlyPMT = perConfig.monthlyContribution;

    for (let i = 0; i < numPaths; i++) {
        let val = perConfig.currentBalance;
        for (let m = 0; m < months; m++) {
            const r = meanMonthly + volMonthly * gaussian();
            val = val * (1 + r) + monthlyPMT;
            if (val < 0) val = 0;
        }
        finals[i] = val;
    }

    finals.sort((a, b) => a - b);
    const pct = p => finals[Math.floor(numPaths * p)] || 0;

    return {
        p10: pct(0.10),
        p50: pct(0.50),
        p90: pct(0.90),
        mean: finals.reduce((s, v) => s + v, 0) / numPaths,
        numPaths
    };
}

// =====================================================================
// RENDU DU PANNEAU PER
// =====================================================================
let _perChartInstance = null;
let _perMcCache = null;

// Changement de mode de sortie
function setPerExitMode(mode) {
    if (!['capital', 'rente', 'mixte'].includes(mode)) return;
    perConfig.exitMode = mode;
    savePerConfigToStorage();
    renderPerPanel();
}

// Rendu principal
function renderPerPanel() {
    const panel = document.getElementById('per-panel');
    if (!panel) return;

    // Recharge la config au cas où elle aurait changé
    perConfig = { ...perConfig, ...loadPerConfigFromStorage() };

    // Calculs
    const proj = computePerProjection();

    // --- KPIs principaux ---
    const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
    const setHTML = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

    countUp(document.getElementById('per-kpi-final'), proj.accumulation.finalBalance, formatEUR);
    setText('per-kpi-years',
        `${proj.yearsToRetirement} ans · de ${perConfig.currentAge} à ${perConfig.retirementAge} ans`);

    countUp(document.getElementById('per-kpi-economy'), proj.accumulation.economyTax, formatEUR);
    setText('per-kpi-economy-detail',
        `TMI actuelle ${(perConfig.tmiEntry * 100).toFixed(0)} % × versements`);

    countUp(document.getElementById('per-kpi-net'), proj.selectedNet, formatEUR);
    setText('per-kpi-net-detail',
        `Mode ${perConfig.exitMode} · après fiscalité de sortie`);

    const advEl = document.getElementById('per-kpi-advantage');
    if (advEl) {
        const adv = proj.perAdvantage;
        advEl.className = `text-lg font-bold font-mono ${adv >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
        countUp(advEl, adv, fmtSignedEUR);
    }
    setText('per-kpi-advantage-detail',
        proj.perWins ? 'Le PER est avantageux dans ce scénario' : 'Le CTO équivalent serait préférable');

    // --- Boutons de mode ---
    document.querySelectorAll('.per-mode-btn').forEach(btn => {
        const isActive = btn.dataset.perMode === perConfig.exitMode;
        btn.classList.toggle('border-indigo-500', isActive);
        btn.classList.toggle('bg-indigo-950/40', isActive);
        btn.classList.toggle('border-gray-800', !isActive);
        btn.classList.toggle('bg-gray-950/40', !isActive);
    });

    // --- Détail fiscal selon mode ---
    _renderPerDetailBlock(proj);

    // --- Graphique trajectoire ---
    renderPerChart();

    // --- Monte-Carlo (avec cache) ---
    if (!_perMcCache) {
        _perMcCache = runPerMonteCarlo(5000);
    }
    setText('per-mc-p10', formatEUR(_perMcCache.p10));
    setText('per-mc-p50', formatEUR(_perMcCache.p50));
    setText('per-mc-p90', formatEUR(_perMcCache.p90));
    setText('per-mc-mean', formatEUR(_perMcCache.mean));
}

// Bloc détail fiscal (remplit en fonction du mode)
function _renderPerDetailBlock(proj) {
    const titleEl = document.getElementById('per-detail-title');
    const contentEl = document.getElementById('per-detail-content');
    if (!titleEl || !contentEl) return;

    const fmt = (v, sign = false) => {
        const s = formatEUR(Math.abs(v));
        if (!sign) return s;
        return (v >= 0 ? '+' : '−') + s;
    };

    if (perConfig.exitMode === 'capital') {
        titleEl.innerText = 'Détail fiscal — Sortie en capital (retrait unique)';
        const c = proj.capitalExit;
        contentEl.innerHTML = `
            <div class="flex justify-between"><span class="text-gray-400">Capital total</span><span class="text-white font-bold">${formatEUR(proj.accumulation.finalBalance)}</span></div>
            <div class="flex justify-between"><span class="text-gray-400">· Versements</span><span class="text-gray-300">${formatEUR(c.versements)}</span></div>
            <div class="flex justify-between"><span class="text-gray-400">· Plus-values</span><span class="text-emerald-400">${formatEUR(c.plusValues)}</span></div>
            <div class="flex justify-between pt-1.5 border-t border-gray-800 mt-1.5">
                <span class="text-gray-400">Impôt sur versements (barème TMI ${(perConfig.tmiRetirement * 100).toFixed(0)} % + PS 17,2 %)</span>
                <span class="text-rose-400">− ${formatEUR(c.taxVersements)}</span>
            </div>
            <div class="flex justify-between"><span class="text-gray-400">Impôt sur plus-values (PFU 30 %)</span><span class="text-rose-400">− ${formatEUR(c.taxPlusValues)}</span></div>
            <div class="flex justify-between pt-1.5 border-t border-gray-800 mt-1.5">
                <span class="text-white font-bold">Net reçu</span>
                <span class="text-emerald-400 font-bold">${formatEUR(c.netRecu)}</span>
            </div>
            <div class="text-[10px] text-gray-500 italic mt-1">Total fiscalité de sortie : ${formatEUR(c.totalTax)}</div>
        `;
    } else if (perConfig.exitMode === 'rente') {
        titleEl.innerText = 'Détail fiscal — Sortie en rente viagère';
        const r = proj.renteExit;
        contentEl.innerHTML = `
            <div class="flex justify-between"><span class="text-gray-400">Capital converti</span><span class="text-white font-bold">${formatEUR(proj.accumulation.finalBalance)}</span></div>
            <div class="flex justify-between"><span class="text-gray-400">Taux d'annuité</span><span class="text-gray-300">${(perConfig.annuityRate * 100).toFixed(2)} %</span></div>
            <div class="flex justify-between pt-1.5 border-t border-gray-800 mt-1.5">
                <span class="text-gray-400">Rente annuelle brute</span>
                <span class="text-white font-bold">${formatEUR(r.renteAnnuelle)}</span>
            </div>
            <div class="flex justify-between"><span class="text-gray-400">Soit mensuel brut</span><span class="text-gray-300">${formatEUR(r.renteMensuelleBrute)}</span></div>
            <div class="flex justify-between pt-1.5 border-t border-gray-800 mt-1.5">
                <span class="text-gray-400">Fiscalité annuelle (IR + PS + PFU)</span>
                <span class="text-rose-400">− ${formatEUR(r.taxAnnuelle)}</span>
            </div>
            <div class="flex justify-between">
                <span class="text-white font-bold">Rente nette annuelle</span>
                <span class="text-emerald-400 font-bold">${formatEUR(r.renteNetteAnnuelle)}</span>
            </div>
            <div class="flex justify-between">
                <span class="text-white font-bold">Rente nette mensuelle</span>
                <span class="text-emerald-400 font-bold">${formatEUR(r.renteMensuelleNette)}</span>
            </div>
            <div class="text-[10px] text-gray-500 italic mt-1">La rente est versée à vie. Le capital n'est pas récupérable par les héritiers (sauf option de réversion).</div>
        `;
    } else {
        titleEl.innerText = 'Détail fiscal — Sortie mixte';
        const m = proj.mixedExit;
        contentEl.innerHTML = `
            <div class="flex justify-between"><span class="text-gray-400">Répartition</span><span class="text-white font-bold">${(m.pctCapital * 100).toFixed(0)} % capital / ${(m.pctRente * 100).toFixed(0)} % rente</span></div>
            <div class="flex justify-between pt-1.5 border-t border-gray-800 mt-1.5">
                <span class="text-gray-400">Capital net immédiat (part capital)</span>
                <span class="text-emerald-400 font-bold">${formatEUR(m.netCapitalInitial)}</span>
            </div>
            <div class="flex justify-between"><span class="text-gray-400">Impôt sur la part capital</span><span class="text-rose-400">− ${formatEUR(m.capital.totalTax)}</span></div>
            <div class="flex justify-between pt-1.5 border-t border-gray-800 mt-1.5">
                <span class="text-gray-400">Rente nette annuelle (part rente)</span>
                <span class="text-emerald-400 font-bold">${formatEUR(m.renteNetteAnnuelle)}</span>
            </div>
            <div class="flex justify-between"><span class="text-gray-400">Soit mensuel net</span><span class="text-gray-300">${formatEUR(m.renteNetteAnnuelle / 12)}</span></div>
            <div class="text-[10px] text-gray-500 italic mt-1">Vous récupérez immédiatement le capital net, puis percevez une rente à vie sur le solde.</div>
        `;
    }
}

// Graphique trajectoire PER
function renderPerChart() {
    const canvas = document.getElementById('perTrajectoryChart');
    if (!canvas) return;

    const proj = computePerProjection();
    const data = proj.accumulation.yearlyData;

    const labels = data.map(d => `An ${d.year} (${d.age} ans)`);
    const balances = data.map(d => Math.round(d.balance * 100) / 100);
    const contributions = data.map(d => Math.round(d.contributions * 100) / 100);

    if (_perChartInstance) _perChartInstance.destroy();

    _perChartInstance = createChart('perTrajectoryChart', {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Capital total PER',
                    data: balances,
                    borderColor: '#818cf8',
                    backgroundColor: 'rgba(129,140,248,0.15)',
                    tension: 0.3,
                    fill: true,
                    pointRadius: 0,
                    borderWidth: 2
                },
                {
                    label: 'Cumul des versements',
                    data: contributions,
                    borderColor: '#6b7280',
                    backgroundColor: 'rgba(107,114,128,0.08)',
                    tension: 0.3,
                    fill: true,
                    pointRadius: 0,
                    borderWidth: 1.5,
                    borderDash: [5, 3]
                }
            ]
        },
        options: {
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: _chartLegendColor(), boxWidth: 12, font: { size: 11 } } },
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

// ---------------------------------------------------------------------
// MODAL DE CONFIGURATION
// ---------------------------------------------------------------------
function openPerConfigModal() {
    document.getElementById('per-input-current-age').value   = perConfig.currentAge;
    document.getElementById('per-input-retirement-age').value = perConfig.retirementAge;
    document.getElementById('per-input-balance').value        = perConfig.currentBalance;
    document.getElementById('per-input-monthly').value        = perConfig.monthlyContribution;
    document.getElementById('per-input-return').value         = (perConfig.expectedReturn * 100).toFixed(2);
    document.getElementById('per-input-annuity').value        = (perConfig.annuityRate * 100).toFixed(2);
    document.getElementById('per-input-tmi-entry').value      = String(perConfig.tmiEntry);
    document.getElementById('per-input-tmi-retirement').value = String(perConfig.tmiRetirement);
    document.getElementById('per-input-mixed').value          = Math.round(perConfig.mixedCapitalPct * 100);
    document.getElementById('per-mixed-label').innerText      = `${Math.round(perConfig.mixedCapitalPct * 100)} % capital / ${Math.round((1 - perConfig.mixedCapitalPct) * 100)} % rente`;

    document.getElementById('modal-per-config').classList.remove('hidden');
}

function handleSavePerConfig(e) {
    e.preventDefault();

    const currentAge = parseInt(document.getElementById('per-input-current-age').value, 10);
    const retirementAge = parseInt(document.getElementById('per-input-retirement-age').value, 10);
    const balance = parseFloat(document.getElementById('per-input-balance').value) || 0;
    const monthly = parseFloat(document.getElementById('per-input-monthly').value) || 0;
    const ret = parseFloat(document.getElementById('per-input-return').value) || 5;
    const annuity = parseFloat(document.getElementById('per-input-annuity').value) || 4;
    const tmiEntry = parseFloat(document.getElementById('per-input-tmi-entry').value) || 0;
    const tmiRet = parseFloat(document.getElementById('per-input-tmi-retirement').value) || 0;
    const mixed = parseFloat(document.getElementById('per-input-mixed').value) / 100 || 0.5;

    // Validations
    if (currentAge < 18 || currentAge > 80) { alert('Âge actuel invalide (18-80).'); return; }
    if (retirementAge <= currentAge) { alert('L\'âge de retraite doit être supérieur à l\'âge actuel.'); return; }
    if (retirementAge > 85) { alert('Âge de retraite trop élevé (max 85).'); return; }
    if (monthly < 0 || balance < 0) { alert('Les montants ne peuvent pas être négatifs.'); return; }

    perConfig.currentAge = currentAge;
    perConfig.retirementAge = retirementAge;
    perConfig.currentBalance = balance;
    perConfig.monthlyContribution = monthly;
    perConfig.expectedReturn = ret / 100;
    perConfig.annuityRate = annuity / 100;
    perConfig.tmiEntry = tmiEntry;
    perConfig.tmiRetirement = tmiRet;
    perConfig.mixedCapitalPct = mixed;

    savePerConfigToStorage();

    // Invalide le cache Monte-Carlo (paramètres changés)
    _perMcCache = null;

    closeModal('modal-per-config');
    renderPerPanel();

    if (typeof toastSuccess === 'function') {
        toastSuccess('Configuration PER enregistrée', 'Les projections ont été recalculées.');
    }
}

// ---------------------------------------------------------------------
// INITIALISATION
// ---------------------------------------------------------------------
function initPerModule() {
    perConfig = loadPerConfigFromStorage();
    console.info('[PER] Module chargé — simulateur retraite prêt.');
}

// Expose l'API globalement
window.perConfig = perConfig;
window.loadPerConfigFromStorage = loadPerConfigFromStorage;
window.savePerConfigToStorage = savePerConfigToStorage;
window.calculatePerAccumulation = calculatePerAccumulation;
window.computePerCapitalExit = computePerCapitalExit;
window.computePerRenteExit = computePerRenteExit;
window.computePerMixedExit = computePerMixedExit;
window.computeCtoComparison = computeCtoComparison;
window.computePerProjection = computePerProjection;
window.runPerMonteCarlo = runPerMonteCarlo;
window.setPerExitMode = setPerExitMode;
window.renderPerPanel = renderPerPanel;
window.renderPerChart = renderPerChart;
window.openPerConfigModal = openPerConfigModal;
window.handleSavePerConfig = handleSavePerConfig;