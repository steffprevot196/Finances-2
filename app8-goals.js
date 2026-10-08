// =====================================================================
// app8-goals.js — OBJECTIFS & PROJECTIONS DE PATRIMOINE (Chantier D)
// Dépend de : app1-core.js (formatEUR, assets, computeRiskMetricsFromAssets)
// Charge après app6-api.js et avant app7-init.js
// =====================================================================

// ---------------------------------------------------------------------
// ÉTAT ET STOCKAGE
// ---------------------------------------------------------------------
let goals = [];
let currentGoalDetailId = null;
let goalChartInstance = null;

const GOALS_STORAGE_KEY = 'patriMonial_goals';

function loadGoalsFromStorage() {
    try {
        const raw = localStorage.getItem(GOALS_STORAGE_KEY);
        if (raw) {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) return list;
        }
    } catch (_) {}
    return [];
}

function saveGoalsToStorage() {
    try { localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(goals)); } catch (_) {}
}

// ---------------------------------------------------------------------
// CALCULS FINANCIERS
// ---------------------------------------------------------------------
// Patrimoine actuel HORS positions papier (les simulations se basent sur
// le patrimoine réel).
function currentRealNetWorth() {
    return assets.filter(a => !isPaperAsset(a)).reduce((s, a) => s + (a.value || 0), 0);
}

// Nombre de mois entre aujourd'hui et une date cible
function monthsUntil(targetDateIso) {
    const now = new Date();
    const target = new Date(targetDateIso);
    const diff = (target.getFullYear() - now.getFullYear()) * 12
               + (target.getMonth() - now.getMonth());
    return Math.max(0, diff);
}

// Projection déterministe : valeur future du portefeuille en versant `monthly`
// chaque mois pendant `months`, avec un rendement annuel `annualReturnPct`.
// Formule : FV = PV*(1+r)^n + PMT * [((1+r)^n − 1) / r]
//   (r = taux mensuel, n = nombre de mois)
function projectDeterministic(pv, monthly, annualReturnPct, months) {
    if (months <= 0) return pv;
    const rMonthly = (annualReturnPct / 100) / 12;
    if (Math.abs(rMonthly) < 1e-9) {
        return pv + monthly * months;
    }
    const growth = Math.pow(1 + rMonthly, months);
    return pv * growth + monthly * ((growth - 1) / rMonthly);
}

// Simulation Monte-Carlo : simule des milliers de trajectoires aléatoires
// du patrimoine, avec la volatilité réelle du portefeuille. Retourne :
//   { paths: [...], successProb, p10, p50, p90, finalValues: [...] }
// Chaque trajectoire est un tableau de valeurs mensuelles (index 0 = aujourd'hui).
function runGoalMonteCarlo(goal, numPaths = 5000) {
    const months = monthsUntil(goal.targetDate);
    const pv = currentRealNetWorth();
    const monthly = Number(goal.monthly) || 0;

    // Récupère rendement + volatilité réels du portefeuille via l'API existante
    let meanAnnual = (Number(goal.annualReturn) || 5) / 100;
    let volAnnual  = 0.15; // défaut raisonnable
    try {
        const rm = computeRiskMetricsFromAssets(assets.filter(a => !isPaperAsset(a)));
        if (rm && Number.isFinite(rm.meanAnnualized)) meanAnnual = rm.meanAnnualized;
        if (rm && Number.isFinite(rm.volatility))     volAnnual  = rm.volatility;
    } catch (_) { /* fallback aux valeurs par défaut */ }

    const meanMonthly = meanAnnual / 12;
    const volMonthly  = volAnnual / Math.sqrt(12);

    // Box-Muller pour un tirage gaussien
    function gaussian() {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    const paths = [];
    let successCount = 0;
    const finalValues = new Array(numPaths);

    for (let i = 0; i < numPaths; i++) {
        const path = [pv];
        let val = pv;
        for (let m = 1; m <= months; m++) {
            const r = meanMonthly + volMonthly * gaussian();
            val = val * (1 + r) + monthly;
            if (val < 0) val = 0;
            path.push(val);
        }
        paths.push(path);
        finalValues[i] = val;
        if (val >= goal.targetAmount) successCount++;
    }

    finalValues.sort((a, b) => a - b);
    const p10 = finalValues[Math.floor(numPaths * 0.10)];
    const p50 = finalValues[Math.floor(numPaths * 0.50)];
    const p90 = finalValues[Math.floor(numPaths * 0.90)];

    // Percentiles par mois (pour la bande du graphique)
    const monthlyP10 = new Array(months + 1).fill(0);
    const monthlyP50 = new Array(months + 1).fill(0);
    const monthlyP90 = new Array(months + 1).fill(0);
    for (let m = 0; m <= months; m++) {
        const vals = paths.map(p => p[m]).sort((a, b) => a - b);
        monthlyP10[m] = vals[Math.floor(numPaths * 0.10)];
        monthlyP50[m] = vals[Math.floor(numPaths * 0.50)];
        monthlyP90[m] = vals[Math.floor(numPaths * 0.90)];
    }

    return {
        successProb: successCount / numPaths,
        p10, p50, p90,
        monthlyP10, monthlyP50, monthlyP90,
        months,
        meanAnnual,
        volAnnual,
        pv,
        monthly
    };
}

// ---------------------------------------------------------------------
// CRUD OBJECTIFS
// ---------------------------------------------------------------------
function openAddGoalModal() {
    document.getElementById('goal-edit-id').value = '';
    document.getElementById('modal-add-goal-title').innerHTML =
        '<i class="fa-solid fa-bullseye text-cyan-400"></i> Nouvel objectif';
    document.getElementById('goal-name').value = '';
    document.getElementById('goal-target').value = '';
    // Date par défaut : dans 5 ans
    const d = new Date();
    d.setFullYear(d.getFullYear() + 5);
    document.getElementById('goal-date').value = d.toISOString().slice(0, 10);
    document.getElementById('goal-monthly').value = 0;
    document.getElementById('goal-return').value = 5;
    document.getElementById('goal-notes').value = '';
    document.getElementById('modal-add-goal').classList.remove('hidden');
}

function editGoal(id) {
    const g = goals.find(x => x.id === id);
    if (!g) return;
    document.getElementById('goal-edit-id').value = g.id;
    document.getElementById('modal-add-goal-title').innerHTML =
        '<i class="fa-solid fa-pen text-cyan-400"></i> Modifier l\'objectif';
    document.getElementById('goal-name').value = g.name;
    document.getElementById('goal-target').value = g.targetAmount;
    document.getElementById('goal-date').value = g.targetDate;
    document.getElementById('goal-monthly').value = g.monthly || 0;
    document.getElementById('goal-return').value = g.annualReturn || 5;
    document.getElementById('goal-notes').value = g.notes || '';
    document.getElementById('modal-add-goal').classList.remove('hidden');
}

function handleAddGoal(e) {
    e.preventDefault();
    const editId = document.getElementById('goal-edit-id').value;
    const goal = {
        id: editId ? parseFloat(editId) : Date.now() + Math.floor(Math.random() * 1000),
        name:         document.getElementById('goal-name').value.trim(),
        targetAmount: parseFloat(document.getElementById('goal-target').value) || 0,
        targetDate:   document.getElementById('goal-date').value,
        monthly:      parseFloat(document.getElementById('goal-monthly').value) || 0,
        annualReturn: parseFloat(document.getElementById('goal-return').value) || 5,
        notes:        document.getElementById('goal-notes').value.trim()
    };
    if (!goal.name || goal.targetAmount <= 0 || !goal.targetDate) {
        alert('Veuillez renseigner au minimum : nom, montant cible et date cible.');
        return;
    }
    if (editId) {
        const idx = goals.findIndex(g => g.id === parseFloat(editId));
        if (idx > -1) goals[idx] = goal;
    } else {
        goals.push(goal);
    }
    saveGoalsToStorage();
    closeModal('modal-add-goal');
    renderGoalsTab();
    e.target.reset();
}

function deleteGoal(id) {
    const g = goals.find(x => x.id === id);
    if (!g) return;
    if (!confirm(`Supprimer l'objectif "${g.name}" ?`)) return;
    pushUndo('Suppression d\'un objectif');
    goals = goals.filter(x => x.id !== id);
    saveGoalsToStorage();
    if (currentGoalDetailId === id) {
        currentGoalDetailId = null;
        document.getElementById('goal-detail-wrap').classList.add('hidden');
    }
    renderGoalsTab();
}

// ---------------------------------------------------------------------
// RENDU — Carte d'objectif
// ---------------------------------------------------------------------
function renderGoalCard(g) {
    const pv = currentRealNetWorth();
    const progressPct = g.targetAmount > 0 ? Math.min(100, (pv / g.targetAmount) * 100) : 0;
    const remaining = Math.max(0, g.targetAmount - pv);
    const months = monthsUntil(g.targetDate);
    const isReached = pv >= g.targetAmount;
    const targetDateFR = new Date(g.targetDate).toLocaleDateString('fr-FR');

    // Projection déterministe au rythme d'épargne actuel
    const projectedValue = projectDeterministic(pv, g.monthly, g.annualReturn, months);
    const willReach = projectedValue >= g.targetAmount;
    const shortfall = Math.max(0, g.targetAmount - projectedValue);

    // % du chemin parcouru au rythme actuel (approximation linéaire pour la barre)
    const projectedPct = g.targetAmount > 0 ? Math.min(100, (projectedValue / g.targetAmount) * 100) : 0;

    // Couleur selon avancement
    const barColor = isReached ? '#06b6d4' : (progressPct >= 75 ? '#10b981' : progressPct >= 40 ? '#f59e0b' : '#ef4444');

    return `
        <div class="bg-gray-900/60 border border-gray-800 rounded-xl p-4 flex flex-col gap-3" data-goal-id="${g.id}">
            <!-- En-tête -->
            <div class="flex justify-between items-start gap-2">
                <div class="min-w-0">
                    <div class="font-bold text-white text-sm truncate" title="${escapeHTML(g.name)}">${escapeHTML(g.name)}</div>
                    <div class="text-[10px] text-gray-500 font-mono">
                        Cible : ${formatEUR(g.targetAmount)} · ${targetDateFR}
                    </div>
                </div>
                ${isReached
                    ? '<span class="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-700/50 text-[9px] font-bold whitespace-nowrap"><i class="fa-solid fa-circle-check text-[8px] mr-1"></i>Atteint</span>'
                    : (willReach
                        ? '<span class="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/50 text-[9px] font-bold whitespace-nowrap"><i class="fa-solid fa-check text-[8px] mr-1"></i>Sur la bonne voie</span>'
                        : '<span class="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-700/50 text-[9px] font-bold whitespace-nowrap"><i class="fa-solid fa-triangle-exclamation text-[8px] mr-1"></i>À renforcer</span>')
                }
            </div>

            <!-- Barre de progression (patrimoine actuel vs cible) -->
            <div>
                <div class="flex justify-between text-[10px] mb-1">
                    <span class="text-gray-500">Progression actuelle</span>
                    <span class="font-mono text-gray-300">${formatEUR(pv)} / ${formatEUR(g.targetAmount)} (${progressPct.toFixed(1)} %)</span>
                </div>
                <div class="w-full bg-gray-800 h-2.5 rounded-full overflow-hidden">
                    <div class="h-full transition-all duration-500" style="width:${progressPct}%; background:${barColor};"></div>
                </div>
                ${!isReached ? `<div class="text-[10px] text-gray-500 mt-1">Restant : <span class="font-mono text-gray-300">${formatEUR(remaining)}</span> · ${months} mois restants</div>` : ''}
            </div>

            <!-- Projection au rythme actuel -->
            ${!isReached ? `
            <div class="grid grid-cols-2 gap-2 text-[11px]">
                <div class="bg-gray-950 border border-gray-800 rounded-lg p-2">
                    <div class="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Projection à échéance</div>
                    <div class="font-mono font-bold ${willReach ? 'text-emerald-400' : 'text-amber-400'}">${formatEUR(projectedValue)}</div>
                    <div class="text-[9px] text-gray-500">épargne ${formatEUR(g.monthly)}/mois, ${g.annualReturn} %/an</div>
                </div>
                <div class="bg-gray-950 border border-gray-800 rounded-lg p-2">
                    <div class="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">${willReach ? 'Marge' : 'Manque à combler'}</div>
                    <div class="font-mono font-bold ${willReach ? 'text-emerald-400' : 'text-rose-400'}">${willReach ? '+' : '−'}${formatEUR(Math.abs(shortfall))}</div>
                    <div class="text-[9px] text-gray-500">${willReach ? 'au-dessus de la cible' : 'vs cible à échéance'}</div>
                </div>
            </div>
            ` : ''}

            <!-- Actions -->
            <div class="flex justify-end gap-1 pt-2 border-t border-gray-800 flex-wrap">
                <button onclick="toggleGoalDetail(${g.id})" class="px-2 py-1 rounded bg-gray-800 hover:bg-cyan-900/60 text-gray-300 hover:text-cyan-300 text-[10px] transition" title="Voir le détail et la simulation Monte-Carlo">
                    <i class="fa-solid fa-chart-line text-[9px]"></i> Simuler
                </button>
                <button onclick="editGoal(${g.id})" class="px-2 py-1 rounded bg-gray-800 hover:bg-indigo-900/60 text-gray-300 hover:text-indigo-300 text-[10px] transition" title="Modifier">
                    <i class="fa-solid fa-pen text-[9px]"></i>
                </button>
                <button onclick="deleteGoal(${g.id})" class="px-2 py-1 rounded bg-gray-800 hover:bg-rose-900/60 text-gray-300 hover:text-rose-300 text-[10px] transition" title="Supprimer">
                    <i class="fa-solid fa-trash text-[9px]"></i>
                </button>
            </div>
        </div>
    `;
}

// ---------------------------------------------------------------------
// RENDU — Vue globale
// ---------------------------------------------------------------------
function renderGoalsTab() {
    // Recharge depuis le storage (le portefeuille peut avoir changé)
    goals = loadGoalsFromStorage();

    // KPIs globaux
    const pv = currentRealNetWorth();
    const reached = goals.filter(g => pv >= g.targetAmount).length;
    const avgMonthly = goals.length > 0
        ? goals.reduce((s, g) => s + (Number(g.monthly) || 0), 0) / goals.length
        : 0;

    // Probabilité de succès moyenne (Monte-Carlo sur tous les objectifs, échantillon réduit pour la perf)
    let avgSuccess = null;
    if (goals.length > 0) {
        const probs = goals.map(g => runGoalMonteCarlo(g, 1000).successProb);
        avgSuccess = probs.reduce((a, b) => a + b, 0) / probs.length;
    }

    const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
    setText('goal-stat-count', goals.length);
    setText('goal-stat-atteints', reached + ' atteint(s)');
    setText('goal-stat-current', formatEUR(pv));
    setText('goal-stat-monthly', formatEUR(avgMonthly));
    setText('goal-stat-success', avgSuccess === null ? '—' : (avgSuccess * 100).toFixed(0) + ' %');

    // Grille de cartes
    const grid = document.getElementById('goals-grid');
    if (!goals.length) {
        grid.innerHTML = `<div class="col-span-full bg-gray-900/60 border border-dashed border-gray-700 rounded-xl p-8 text-center text-sm text-gray-500">
            <i class="fa-solid fa-bullseye text-3xl text-cyan-500/40 mb-2 block"></i>
            Aucun objectif défini pour le moment.<br>
            <button onclick="openAddGoalModal()" class="mt-3 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-medium transition">
                <i class="fa-solid fa-plus text-[10px]"></i> Créer un premier objectif
            </button>
        </div>`;
        document.getElementById('goal-detail-wrap').classList.add('hidden');
        return;
    }

    grid.innerHTML = goals.map(renderGoalCard).join('');

    // Si un détail était ouvert, on le re-rend
    if (currentGoalDetailId && goals.some(g => g.id === currentGoalDetailId)) {
        renderGoalDetail(currentGoalDetailId);
    } else {
        document.getElementById('goal-detail-wrap').classList.add('hidden');
    }
}

// ---------------------------------------------------------------------
// RENDU — Détail d'un objectif (Monte-Carlo + graphique)
// ---------------------------------------------------------------------
function toggleGoalDetail(id) {
    if (currentGoalDetailId === id) {
        currentGoalDetailId = null;
        document.getElementById('goal-detail-wrap').classList.add('hidden');
        if (goalChartInstance) { goalChartInstance.destroy(); goalChartInstance = null; }
        return;
    }
    currentGoalDetailId = id;
    renderGoalDetail(id);
}

function renderGoalDetail(id) {
    const g = goals.find(x => x.id === id);
    if (!g) return;

    const wrap = document.getElementById('goal-detail-wrap');
    wrap.classList.remove('hidden');

    // Monte-Carlo
    const mc = runGoalMonteCarlo(g, 5000);

    // Projection déterministe pour comparaison
    const pv = currentRealNetWorth();
    const projDet = projectDeterministic(pv, g.monthly, g.annualReturn, mc.months);

    const successPct = mc.successProb * 100;
    const successColor = successPct >= 80 ? 'text-emerald-400' : successPct >= 50 ? 'text-amber-400' : 'text-rose-400';
    const successBarColor = successPct >= 80 ? '#10b981' : successPct >= 50 ? '#f59e0b' : '#ef4444';

    wrap.innerHTML = `
        <div class="bg-gray-900/60 border border-gray-800 rounded-xl p-5 space-y-4">
            <div class="flex justify-between items-start gap-3">
                <div class="min-w-0">
                    <div class="text-[10px] text-gray-500 uppercase tracking-wider">Simulation détaillée</div>
                    <div class="font-bold text-white text-base truncate">${escapeHTML(g.name)}</div>
                    <div class="text-[11px] text-gray-500 font-mono">Cible ${formatEUR(g.targetAmount)} au ${new Date(g.targetDate).toLocaleDateString('fr-FR')}</div>
                </div>
                <button onclick="toggleGoalDetail(${g.id})" class="w-8 h-8 rounded-lg bg-gray-800 text-gray-400 hover:text-white flex-shrink-0"><i class="fa-solid fa-xmark"></i></button>
            </div>

            <!-- Bandeau probabilité -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div class="bg-gray-950 border border-gray-800 rounded-xl p-3">
                    <div class="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Probabilité de succès (Monte-Carlo)</div>
                    <div class="text-2xl font-bold font-mono ${successColor}">${successPct.toFixed(1)} %</div>
                    <div class="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden mt-2">
                        <div class="h-full transition-all" style="width:${successPct}%; background:${successBarColor};"></div>
                    </div>
                    <div class="text-[10px] text-gray-500 mt-1">5 000 tirages · vol. ${(mc.volAnnual * 100).toFixed(1)} % · rend. ${(mc.meanAnnual * 100).toFixed(1)} %</div>
                </div>
                <div class="bg-gray-950 border border-gray-800 rounded-xl p-3">
                    <div class="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Projection déterministe</div>
                    <div class="text-2xl font-bold font-mono ${projDet >= g.targetAmount ? 'text-emerald-400' : 'text-amber-400'}">${formatEUR(projDet)}</div>
                    <div class="text-[10px] text-gray-500 mt-1">${formatEUR(g.monthly)}/mois · ${g.annualReturn} %/an</div>
                </div>
                <div class="bg-gray-950 border border-gray-800 rounded-xl p-3">
                    <div class="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Scénarios Monte-Carlo à échéance</div>
                    <div class="text-[11px] font-mono space-y-0.5 mt-1">
                        <div class="flex justify-between"><span class="text-rose-400">P10 (pessimiste)</span><span class="text-gray-300">${formatEUR(mc.p10)}</span></div>
                        <div class="flex justify-between"><span class="text-amber-400">P50 (médian)</span><span class="text-gray-300">${formatEUR(mc.p50)}</span></div>
                        <div class="flex justify-between"><span class="text-emerald-400">P90 (optimiste)</span><span class="text-gray-300">${formatEUR(mc.p90)}</span></div>
                    </div>
                </div>
            </div>

            <!-- Graphique de projection -->
            <div>
                <div class="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Trajectoire projetée (P10 / P50 / P90 + cible)</div>
                <div class="bg-gray-950 border border-gray-800 rounded-xl p-3 h-72">
                    <canvas id="goalProjectionChart"></canvas>
                </div>
            </div>

            <!-- Recommandations -->
            <div class="bg-cyan-950/20 border border-cyan-800/40 rounded-xl p-3 text-[11px] text-gray-300 leading-relaxed">
                ${(() => {
                    if (successPct >= 80) {
                        return `<i class="fa-solid fa-circle-check text-emerald-400 mr-1"></i> <b>Vous êtes sur la bonne voie.</b> Avec un rendement moyen de ${(mc.meanAnnual * 100).toFixed(1)} % et une volatilité de ${(mc.volAnnual * 100).toFixed(1)} %, ${successPct.toFixed(0)} % des scénarios simulés atteignent la cible. Continuez votre épargne actuelle.`;
                    } else if (successPct >= 50) {
                        return `<i class="fa-solid fa-triangle-exclamation text-amber-400 mr-1"></i> <b>Attention, incertitude élevée.</b> Seuls ${successPct.toFixed(0)} % des scénarios atteignent la cible. Envisagez d'augmenter l'épargne mensuelle, d'allonger l'horizon ou de réduire le montant cible.`;
                    } else {
                        return `<i class="fa-solid fa-circle-exclamation text-rose-400 mr-1"></i> <b>Objectif ambitieux.</b> ${successPct.toFixed(0)} % des scénarios atteignent la cible. Une augmentation significative de l'épargne est probablement nécessaire — ou un ajustement du montant cible à la baisse.`;
                    }
                })()}
            </div>
        </div>
    `;

    // Graphique Chart.js
    if (goalChartInstance) { goalChartInstance.destroy(); goalChartInstance = null; }
    const canvas = document.getElementById('goalProjectionChart');
    if (!canvas) return;

    // Construit les labels (mois 0 à N)
    const labels = Array.from({ length: mc.months + 1 }, (_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() + i);
        return d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
    });
    const targetLine = new Array(mc.months + 1).fill(g.targetAmount);

    goalChartInstance = createChart('goalProjectionChart', {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'P90 (optimiste)',
                    data: mc.monthlyP90,
                    borderColor: 'rgba(16,185,129,0.6)',
                    backgroundColor: 'rgba(16,185,129,0.08)',
                    tension: 0.3, fill: '+1', pointRadius: 0
                },
                {
                    label: 'P10 (pessimiste)',
                    data: mc.monthlyP10,
                    borderColor: 'rgba(244,63,94,0.6)',
                    backgroundColor: 'rgba(244,63,94,0.08)',
                    tension: 0.3, fill: false, pointRadius: 0
                },
                {
                    label: 'Médiane (P50)',
                    data: mc.monthlyP50,
                    borderColor: '#06b6d4',
                    backgroundColor: 'transparent',
                    tension: 0.3, fill: false, pointRadius: 0, borderWidth: 2
                },
                {
                    label: 'Cible',
                    data: targetLine,
                    borderColor: '#f59e0b',
                    backgroundColor: 'transparent',
                    borderDash: [6, 4], tension: 0, fill: false, pointRadius: 0, borderWidth: 1.5
                }
            ]
        },
        options: {
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: _chartLegendColor(), boxWidth: 12, font: { size: 10 } } } },
            scales: {
                x: { ticks: { color: _chartTickColor(), maxTicksLimit: 8, font: { size: 9 } }, grid: { color: _chartGridColor() } },
                y: { grace: '10%', ticks: { color: _chartTickColor(), font: { size: 9 } }, grid: { color: _chartGridColor() } }
            }
        }
    });
}