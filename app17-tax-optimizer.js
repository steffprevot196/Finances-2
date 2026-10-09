// =====================================================================
// app17-tax-optimizer.js — OPTIMISEUR FISCAL / RÉCOLTE DE MOINS-VALUES
// (Chantier 1.8)
// Dépend de : app1-core.js, app3-charts.js (_enrichLotsForAsset),
//             app5-fiscal.js (computeCessionLine, computeTaxBreakdown)
// Charge après app16-watchlist.js, avant app7-init.js
// =====================================================================

// ---------------------------------------------------------------------
// RÈGLES FISCALES FRANÇAISES (rappel)
// ---------------------------------------------------------------------
// • Les moins-values (MV) sur valeurs mobilières ne compensent QUE les
//   plus-values (PV) de MÊME NATURE, dans la même année.
//   → PV titres ↔ MV titres   (jamais avec crypto)
//   → PV crypto ↔ MV crypto   (jamais avec titres)
// • Les MV non utilisées sont reportables 10 ans sur les PV futures de
//   même nature (imputation FIFO sur les 10 années suivantes).
// • Les dividendes/coupons/coupons NE SONT PAS compensables par des MV.
// • Les enveloppes PEA/AV/PER sont fiscalement indépendantes : elles ne
//   participent pas à ce pool.
// • Les métaux précieux et jetons ont des régimes dédiés (TFMP, TFOP) qui
//   n'autorisent PAS la compensation PV/MV entre eux ou avec d'autres.
// =====================================================================

const TAX_NATURE_LABELS = {
    TITRES: {
        label: 'Valeurs mobilières (CTO)',
        short: 'Titres',
        icon:  'fa-chart-line',
        color: 'text-emerald-400',
        hint:  'Actions, ETF et obligations en CTO — PV et MV compensables entre elles.'
    },
    CRYPTO: {
        label: 'Actifs numériques',
        short: 'Crypto',
        icon:  'fa-bitcoin',
        color: 'text-purple-400',
        hint:  'Cryptomonnaies — pool fiscal isolé (Art. 150 VH bis).'
    }
};

// Nature fiscale d'un actif : TITRES, CRYPTO, ou null si non concerné
// (métaux, SCPI, immobilier, enveloppes PEA/AV/PER, etc.).
function getAssetTaxNature(asset) {
    if (!asset) return null;
    // Enveloppes exonérantes : hors pool CTO
    if (asset.envelope && asset.envelope !== 'CTO') return null;

    const security = isSecurityAsset(asset);
    if (!security && METAL_TYPES.includes(asset.taxCategory)) return null; // métaux = régime dédié
    if (hasTag(asset, 'Crypto') && !security) return 'CRYPTO';
    if (security) return 'TITRES';
    return null;
}

// Taux marginal d'imposition effectif pour un pool donné.
// Reproduit la logique de computeCessionLine : PFU ou Barème selon le régime.
function getEffectiveTaxRate() {
    if (taxRegimeMode === 'PFU') return 0.30;
    // Barème : TMI + PS (17,2 %) − CSG déductible (6,8 % × TMI)
    return taxTMI + 0.172 - 0.068 * taxTMI;
}

// ---------------------------------------------------------------------
// ÉTAT PAR POOL FISCAL
// ---------------------------------------------------------------------
// Pour chaque pool (TITRES, CRYPTO), calcule :
//   • PV réalisées et MV réalisées dans l'année en cours
//   • Solde net imposable
//   • Impôt estimé sur ce solde
//   • Lots en MV latente (candidats à la récolte) filtrés par seuil
//   • Économie d'impôt simulée si on récolte tout ou partie
function computeTaxOptimizerState(thresholdPct) {
    const seuil = Number.isFinite(thresholdPct) ? thresholdPct : 10;
    const year = new Date().getFullYear();
    const rate = getEffectiveTaxRate();

    // 1) Agrégation des cessions réalisées dans l'année, par pool
    const realizedByPool = { TITRES: { pv: 0, mv: 0, count: 0 }, CRYPTO: { pv: 0, mv: 0, count: 0 } };
    cessions.forEach(c => {
        if (!c.dateVente) return;
        const y = new Date(c.dateVente).getFullYear();
        if (y !== year) return;

        // Classifie la cession
        let pool = null;
        if (c.type === 'ACTION_ETF' && (!c.envelope || c.envelope === 'CTO')) pool = 'TITRES';
        else if (c.type === 'CRYPTO') pool = 'CRYPTO';
        if (!pool) return; // métaux, PEA, AV exclus

        const pv = (c.prixVente || 0) - (c.prixAchat || 0) - (c.frais || 0);
        if (pv >= 0) realizedByPool[pool].pv += pv;
        else         realizedByPool[pool].mv += pv;
        realizedByPool[pool].count++;
    });

    // 2) Candidats par pool : lots en MV latente ≥ seuil
    const candidatesByPool = { TITRES: [], CRYPTO: [] };
    const realAssets = assets.filter(a => !isPaperAsset(a));

    realAssets.forEach(asset => {
        const pool = getAssetTaxNature(asset);
        if (!pool) return;

        const enriched = (typeof _enrichLotsForAsset === 'function')
            ? _enrichLotsForAsset(asset) : null;
        if (!enriched) return;

        enriched.lots.forEach(lot => {
            if (lot._isSold) return;
            if (lot._remaining <= 0) return;
            // P&L latent en % sur ce lot
            if (lot._pnlPct > -seuil) return; // ignore les lots pas assez perdants

            // Estimation fiscale : revente immédiate de ce lot à sa valeur actuelle
            const saleAmount = lot._lotUnitCost * lot._remaining + lot._pnlTotal; // valeur de marché
            const costAmount = lot._lotUnitCost * lot._remaining;
            const pvLatente  = lot._pnlTotal; // négatif
            // Économie = |MV| × taux marginal (récupérée en compensation de PV futures/réalisées)
            const taxSaving = Math.abs(pvLatente) * rate;

            candidatesByPool[pool].push({
                assetId:      asset.id,
                assetName:    asset.name,
                assetTicker:  asset.ticker,
                lotId:        lot.id,
                lotDate:      lot.date,
                lotReference: lot.reference || '',
                qty:          lot._remaining,
                pruUnit:      lot._lotUnitCost,
                currentUnit:  enriched.currentUnitValue,
                value:        saleAmount,
                cost:         costAmount,
                pnl:          pvLatente,
                pnlPct:       lot._pnlPct,
                taxSaving,
                pool
            });
        });
    });

    // Trie les candidats par économie décroissante
    candidatesByPool.TITRES.sort((a, b) => b.taxSaving - a.taxSaving);
    candidatesByPool.CRYPTO.sort((a, b) => b.taxSaving - a.taxSaving);

    // 3) Synthèse par pool
    const summary = {};
    ['TITRES', 'CRYPTO'].forEach(pool => {
        const r = realizedByPool[pool];
        const net = r.pv + r.mv;                          // solde net (signé)
        const taxable = Math.max(0, net);                 // base imposable actuelle
        const currentTax = taxable * rate;                // impôt déjà dû
        const mvLatenteTotal = candidatesByPool[pool].reduce((s, c) => s + Math.abs(c.pnl), 0);
        const potentialSaving = Math.min(mvLatenteTotal, taxable) * rate;
        const remainingTaxAfter = Math.max(0, taxable - mvLatenteTotal) * rate;
        const mvReportable = Math.max(0, mvLatenteTotal - taxable); // MV reportables sur les 10 ans

        summary[pool] = {
            pool,
            label: TAX_NATURE_LABELS[pool].label,
            pvRealized: r.pv,
            mvRealized: r.mv,
            net,
            taxable,
            currentTax,
            cessionsCount: r.count,
            candidates: candidatesByPool[pool],
            candidatesCount: candidatesByPool[pool].length,
            mvLatenteTotal,
            potentialSaving,
            remainingTaxAfter,
            mvReportable,
            rate
        };
    });

    return {
        year,
        rate,
        thresholdPct: seuil,
        TITRES: summary.TITRES,
        CRYPTO: summary.CRYPTO,
        totalPotentialSaving: summary.TITRES.potentialSaving + summary.CRYPTO.potentialSaving
    };
}

// ---------------------------------------------------------------------
// SIMULATION PONCTUELLE
// ---------------------------------------------------------------------
// Simule la récolte d'une SÉLECTION de candidats (par ids de lot).
// Retourne { mvRecoltee, taxSaving, remainingTax }.
function simulateHarvest(selectedKeys, thresholdPct) {
    const state = computeTaxOptimizerState(thresholdPct);
    const selected = new Set(selectedKeys);

    const result = {};
    ['TITRES', 'CRYPTO'].forEach(pool => {
        const poolState = state[pool];
        let mvSelected = 0;
        poolState.candidates.forEach(c => {
            if (selected.has(`${c.assetId}_${c.lotId}`)) {
                mvSelected += Math.abs(c.pnl);
            }
        });
        const usable = Math.min(mvSelected, poolState.taxable);
        const saving = usable * poolState.rate;
        const remaining = Math.max(0, poolState.taxable - mvSelected) * poolState.rate;
        result[pool] = { mvSelected, usable, saving, remaining };
    });
    result.totalSaving = result.TITRES.saving + result.CRYPTO.saving;
    return result;
}

// =====================================================================
// ÉTAT UI (sélection de candidats par pool)
// =====================================================================
let taxOptimizerSelected = new Set();     // clés `${assetId}_${lotId}`
let taxOptimizerThreshold = 10;

// =====================================================================
// RENDU
// =====================================================================

// Rendu principal — appelé par renderTabAnneeN1 / refreshAllUI
function renderTaxOptimizer() {
    // Récupère le seuil depuis l'input
    const input = document.getElementById('tax-optimizer-threshold');
    if (input) taxOptimizerThreshold = parseFloat(input.value) || 10;

    const state = computeTaxOptimizerState(taxOptimizerThreshold);

    // Nettoyage des sélections obsolètes (lots qui ne sont plus candidats)
    const validKeys = new Set();
    ['TITRES', 'CRYPTO'].forEach(pool => {
        state[pool].candidates.forEach(c => validKeys.add(`${c.assetId}_${c.lotId}`));
    });
    [...taxOptimizerSelected].forEach(k => { if (!validKeys.has(k)) taxOptimizerSelected.delete(k); });

    // Simulation globale de la sélection courante
    const sim = simulateHarvest([...taxOptimizerSelected], taxOptimizerThreshold);

    // --- Bandeau global ---
    const totalEl = document.getElementById('tax-optimizer-saving-total');
    if (totalEl) countUp(totalEl, sim.totalSaving, formatEUR);

    const detailEl = document.getElementById('tax-optimizer-saving-detail');
    if (detailEl) {
        const totalPotential = state.totalPotentialSaving;
        if (totalPotential === 0) {
            detailEl.innerHTML = `<span class="text-gray-500">Aucune moins-value latente ≥ ${taxOptimizerThreshold} % détectée.</span>`;
        } else if (taxOptimizerSelected.size === 0) {
            detailEl.innerHTML = `Économie maximale possible : <b class="text-emerald-300">${formatEUR(totalPotential)}</b> (récolte complète). Cochez des lots ci-dessous pour affiner.`;
        } else {
            detailEl.innerHTML = `Sélection : <b>${taxOptimizerSelected.size}</b> lot(s) · sur un maximum de ${formatEUR(totalPotential)}`;
        }
    }

    const rateEl = document.getElementById('tax-optimizer-rate');
    if (rateEl) rateEl.innerText = (state.rate * 100).toFixed(2) + ' %';

    const yearEl = document.getElementById('tax-optimizer-year');
    if (yearEl) yearEl.innerText = `Exercice ${state.year}`;

    // --- Pools ---
    _renderTaxOptimizerPool('TITRES', state.TITRES, sim.TITRES);
    _renderTaxOptimizerPool('CRYPTO', state.CRYPTO, sim.CRYPTO);
}

// Rendu d'un pool (carte Titres ou Crypto)
function _renderTaxOptimizerPool(poolKey, poolState, simResult) {
    const container = document.getElementById('tax-optimizer-pool-' + poolKey);
    if (!container) return;

    const meta = TAX_NATURE_LABELS[poolKey];
    const hasRealized = poolState.cessionsCount > 0;
    const hasCandidates = poolState.candidatesCount > 0;

    // --- Bloc synthèse ---
    const netCls = poolState.net >= 0 ? 'text-emerald-400' : 'text-rose-400';

    let html = `
        <div class="flex items-center gap-2 pb-2 border-b border-gray-800">
            <i class="fa-solid ${meta.icon} ${meta.color}"></i>
            <div class="font-bold text-white text-sm">${escapeHTML(meta.label)}</div>
        </div>

        <div class="grid grid-cols-2 gap-2 text-[11px]">
            <div class="bg-gray-900/60 border border-gray-800 rounded-lg p-2">
                <div class="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">PV réalisées ${poolState.pvRealized > 0 ? '' : '(année)'}</div>
                <div class="font-mono font-bold text-emerald-400">${formatEUR(poolState.pvRealized)}</div>
            </div>
            <div class="bg-gray-900/60 border border-gray-800 rounded-lg p-2">
                <div class="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">MV réalisées</div>
                <div class="font-mono font-bold text-rose-400">${formatEUR(poolState.mvRealized)}</div>
            </div>
            <div class="bg-gray-900/60 border border-gray-800 rounded-lg p-2">
                <div class="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Solde net</div>
                <div class="font-mono font-bold ${netCls}">${formatEUR(poolState.net)}</div>
            </div>
            <div class="bg-gray-900/60 border border-gray-800 rounded-lg p-2">
                <div class="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Impôt dû sur ce pool</div>
                <div class="font-mono font-bold text-amber-400">${formatEUR(poolState.currentTax)}</div>
            </div>
        </div>
    `;

    // --- Aucun réalisé + aucun candidat ---
    if (!hasRealized && !hasCandidates) {
        html += `<div class="text-center text-gray-500 italic text-[11px] py-3 border-t border-gray-800 mt-1">
            Aucune cession ni lot en moins-value ≥ ${taxOptimizerThreshold} % dans ce pool.
        </div>`;
        container.innerHTML = html;
        return;
    }

    // --- Pas de PV à compenser ---
    if (poolState.taxable <= 0) {
        html += `<div class="text-emerald-300 text-[11px] py-2 border-t border-gray-800 mt-1 flex items-start gap-2">
            <i class="fa-solid fa-circle-check mt-0.5"></i>
            <span>Aucune plus-value nette imposable dans ce pool cette année. Récolter une moins-value créerait un <b>report</b> de 10 ans (utile pour l'an prochain).</span>
        </div>`;
    } else if (hasCandidates) {
        html += `<div class="bg-amber-950/20 border border-amber-800/40 rounded-lg p-2.5 text-[11px] text-amber-200">
            <i class="fa-solid fa-bullseye mr-1"></i>
            <b>${poolState.candidatesCount} lot(s)</b> en moins-value ≥ ${taxOptimizerThreshold} % — potentiel de compensation :
            <b class="font-mono">${formatEUR(poolState.potentialSaving)}</b> d'impôt.
        </div>`;
    }

    // --- Tableau des candidats ---
    if (hasCandidates) {
        html += `<div class="space-y-2 max-h-80 overflow-y-auto">
            <div class="flex justify-between items-center text-[10px] text-gray-500 uppercase tracking-wider px-1">
                <span>Lot candidat</span>
                <button type="button" onclick="toggleAllTaxOptimizerLots('${poolKey}')" class="text-[10px] text-indigo-400 hover:text-indigo-300 normal-case">
                    <i class="fa-solid fa-check-double text-[9px]"></i> Tout sélectionner / désélectionner
                </button>
            </div>`;

        poolState.candidates.forEach(c => {
            const key = `${c.assetId}_${c.lotId}`;
            const checked = taxOptimizerSelected.has(key);
            const checkedAttr = checked ? 'checked' : '';
            const rowCls = checked ? 'border-emerald-700/60 bg-emerald-950/20' : 'border-gray-800';

            html += `
                <label class="flex items-start gap-2.5 p-2.5 bg-gray-900/40 border ${rowCls} rounded-lg cursor-pointer hover:border-emerald-700 transition" data-pool="${poolKey}" data-key="${key}">
                    <input type="checkbox" ${checkedAttr} onchange="toggleTaxOptimizerLot('${key}', this.checked)" class="mt-0.5 accent-emerald-500">
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-baseline gap-2 mb-0.5">
                            <div class="font-bold text-white text-[11px] truncate" title="${escapeHTML(c.assetName)}">${escapeHTML(c.assetName)}</div>
                            <div class="font-mono text-[11px] text-rose-400 font-bold whitespace-nowrap">${c.pnlPct.toFixed(2)} %</div>
                        </div>
                        <div class="text-[10px] text-gray-500 font-mono">
                            ${c.qty.toFixed(2)} u. · PRU ${formatUnitPrice(c.pruUnit)} · Val. ${formatUnitPrice(c.currentUnit)}
                            ${c.lotReference ? ` · Réf. ${escapeHTML(c.lotReference)}` : ''}
                        </div>
                        <div class="flex justify-between items-baseline gap-2 mt-1 pt-1 border-t border-gray-800/60">
                            <div class="text-[10px] text-gray-400">
                                MV latente : <span class="font-mono text-rose-400">${formatEUR(c.pnl)}</span>
                            </div>
                            <div class="text-[10px] text-emerald-400 font-bold">
                                <i class="fa-solid fa-leaf text-[9px] mr-0.5"></i> Économie : <span class="font-mono">${formatEUR(c.taxSaving)}</span>
                            </div>
                        </div>
                    </div>
                    <button type="button" onclick="event.preventDefault(); event.stopPropagation(); openSellSimulator(${c.assetId})" class="flex-shrink-0 px-2 py-1 rounded bg-gray-800 hover:bg-purple-900/60 text-gray-400 hover:text-purple-300 text-[10px] transition self-start" title="Ouvrir le simulateur de vente pour cet actif">
                        <i class="fa-solid fa-flask text-[9px]"></i>
                    </button>
                </label>`;
        });

        html += `</div>`;

        // --- Ligne de simulation courante ---
        if (taxOptimizerSelected.size > 0) {
            const usableTxt = simResult.usable < simResult.mvSelected
                ? ` (limitée à ${formatEUR(simResult.usable)} — plafonnée par la PV du pool)`
                : '';
            html += `
                <div class="bg-emerald-950/30 border border-emerald-800/50 rounded-lg p-3 text-[11px] mt-2">
                    <div class="flex justify-between items-baseline mb-1">
                        <span class="text-emerald-300 font-bold">Simulation sélection</span>
                        <span class="text-emerald-400 font-mono font-bold">${formatEUR(simResult.saving)}</span>
                    </div>
                    <div class="text-[10px] text-gray-400 leading-relaxed">
                        MV récoltée : <span class="font-mono text-rose-400">${formatEUR(simResult.mvSelected)}</span>${usableTxt}<br>
                        Impôt restant après récolte : <span class="font-mono text-amber-300">${formatEUR(simResult.remaining)}</span>
                    </div>
                </div>`;
        }

        // --- Report fiscal ---
        if (poolState.mvReportable > 0) {
            html += `
                <div class="text-[10px] text-gray-400 border-t border-gray-800 pt-2 mt-1 flex items-start gap-2">
                    <i class="fa-solid fa-clock-rotate-left text-amber-400 mt-0.5"></i>
                    <span><b>Report fiscal :</b> ${formatEUR(poolState.mvReportable)} de MV excédentaire reportable 10 ans sur les PV futures de même nature.</span>
                </div>`;
        }
    }

    container.innerHTML = html;
}

// =====================================================================
// INTERACTIONS
// =====================================================================

// Coche / décoche un lot candidat → relance le rendu
function toggleTaxOptimizerLot(key, checked) {
    if (checked) taxOptimizerSelected.add(key);
    else          taxOptimizerSelected.delete(key);
    renderTaxOptimizer();
}

// Coche ou décoche TOUS les lots d'un pool
function toggleAllTaxOptimizerLots(poolKey) {
    const state = computeTaxOptimizerState(taxOptimizerThreshold);
    const poolState = state[poolKey];
    const keys = poolState.candidates.map(c => `${c.assetId}_${c.lotId}`);
    const allSelected = keys.every(k => taxOptimizerSelected.has(k));

    if (allSelected) {
        keys.forEach(k => taxOptimizerSelected.delete(k));
    } else {
        keys.forEach(k => taxOptimizerSelected.add(k));
    }
    renderTaxOptimizer();
}

// Change le seuil → recalcul + rendu
function onTaxOptimizerThresholdChange(val) {
    const v = parseFloat(val);
    taxOptimizerThreshold = Number.isFinite(v) && v > 0 ? v : 10;
    // Réinitialise la sélection (les candidats changent)
    taxOptimizerSelected.clear();
    renderTaxOptimizer();
}

// =====================================================================
// INIT
// =====================================================================
function initTaxOptimizerModule() {
    // Pas de fetch nécessaire, tout est calculé à la volée.
    // Le rendu est déclenché par refreshAllUI quand l'onglet est actif.
    // On s'assure simplement que le seuil est initialisé depuis l'input.
    const input = document.getElementById('tax-optimizer-threshold');
    if (input) taxOptimizerThreshold = parseFloat(input.value) || 10;
}