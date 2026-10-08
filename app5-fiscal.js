// =====================================================================
// app5-fiscal.js — FISCALITÉ DES CESSIONS & MÉTRIQUES DE RISQUE
// Dépend de : app1-core.js (constantes, formatEUR, parseFlexDate)
// =====================================================================

// ---------------------------------------------------------------------
// Durée de détention en années (décimale)
// ---------------------------------------------------------------------
function computeHoldingYears(dateAchatStr, dateVenteStr) {
    if (!dateAchatStr || !dateVenteStr) return 0;
    const d1 = new Date(dateAchatStr), d2 = new Date(dateVenteStr);
    if (isNaN(d1) || isNaN(d2)) return 0;
    return Math.max(0, (d2 - d1) / (1000 * 3600 * 24 * 365.25));
}

// ---------------------------------------------------------------------
// Fiscalité spécifique des enveloppes PEA / AV / PER
// (distincte du régime CTO)
//
// Simplifications assumées :
//  - PEA : exonération d'IR au-delà de 5 ans (PS 17,2% restent dus) ;
//    avant 5 ans, un retrait clôture en général le PEA (traité comme CTO).
//  - AV / PER : au-delà de 8 ans, abattement annuel 4 600 € (célibataire)
//    puis 7,5% + PS ; avant 8 ans, traité comme un CTO (PFU 30%).
//    Le PER dépend du mode de sortie : approximation AV par défaut.
// ---------------------------------------------------------------------
function computeEnvelopeCessionLine(c, pvBrute, years) {
    if (!c.envelope || c.envelope === 'CTO') return null;

    const envYears = computeHoldingYears(c.envelopeOpenedAt, c.dateVente);
    const gain = Math.max(0, pvBrute);
    const short = envelopeShort(c.envelope);

    if (c.envelope === 'PEA' || c.envelope === 'PEA_PME') {
        const threshold = ENVELOPPES[c.envelope].exoAfterYears;
        if (c.envelopeOpenedAt && envYears >= threshold) {
            return {
                pvBrute, years, base: gain,
                taxLine: gain * 0.172,
                abattementLabel: `Exonéré d'IR (${short} > ${threshold} ans), PS dus`,
                detentionTag: `${short} — ${envYears.toFixed(1)} ans`
            };
        }
        return {
            pvBrute, years, base: gain,
            taxLine: gain * 0.30,
            abattementLabel: `${short} < ${threshold} ans : traité comme un CTO (PFU)`,
            detentionTag: `${short} — ${c.envelopeOpenedAt ? envYears.toFixed(1) + ' ans' : 'date inconnue'}`
        };
    }

    // AV ou PER — l'abattement annuel réel (mutualisé) est appliqué au niveau
    // agrégé dans calculateAnneeN1 ; ici on ne calcule que la part 7,5%/12,8% + PS
    // "brute", avant abattement, pour rester correct même si computeCessionLine
    // est appelé isolément (affichage ligne par ligne).
    const label = c.envelope === 'PER' ? 'PER' : 'Assurance-Vie';
    if (c.envelopeOpenedAt && envYears >= 8) {
        const ABATTEMENT_ANNUEL = 4600;
        const abatt = Math.min(gain, ABATTEMENT_ANNUEL);
        const base = Math.max(0, gain - abatt);
        const tax = base * 0.075 + gain * 0.172;
        return {
            pvBrute, years, base,
            taxLine: tax,
            abattementLabel: `-${formatEUR(abatt)} (abattement mutualisé)`,
            detentionTag: `${label} — ${envYears.toFixed(1)} ans`
        };
    }
    return {
        pvBrute, years, base: gain,
        taxLine: gain * 0.30,
        abattementLabel: `${label} < 8 ans : PFU 30%`,
        detentionTag: `${label} — ${c.envelopeOpenedAt ? envYears.toFixed(1) + ' ans' : 'date inconnue'}`
    };
}

// ---------------------------------------------------------------------
// Calcul fiscal d'UNE ligne de cession
// (à titre indicatif : la vraie base imposable "Titres/Crypto" est nettée
//  entre toutes les lignes, voir calculateAnneeN1)
// ---------------------------------------------------------------------
function computeCessionLine(c) {
    const pvBrute = (c.prixVente || 0) - (c.prixAchat || 0) - (c.frais || 0);
    const years = computeHoldingYears(c.dateAchat, c.dateVente);

    // --- Métaux / Jetons ---
    if (METAL_TYPES.includes(c.type)) {
        if (c.type === 'JETON') {
            if ((c.prixVente || 0) <= 5000) {
                return { pvBrute, years, base: 0, taxLine: 0, abattementLabel: 'Exonéré (≤ 5 000 €)', detentionTag: 'Jeton — Art.150 VJ' };
            }
            const tfop = c.prixVente * 0.065;
            return { pvBrute, years, base: c.prixVente, taxLine: tfop, abattementLabel: 'Taxe forfaitaire (pas d\'abattement)', detentionTag: 'Jeton — TFOP 6,5%' };
        }
        const tfmp = c.prixVente * 0.115;
        const abattYears = years >= 22 ? 1 : (years > 2 ? (years - 2) * 0.05 : 0);
        const netPV = Math.max(0, pvBrute) * (1 - abattYears);
        const tpv = netPV * 0.362;
        const tag = c.type === 'COURS_LEGAL' ? 'Cours Légal' : 'Lingot';
        if (tfmp <= tpv) {
            return { pvBrute, years, base: c.prixVente, taxLine: tfmp, abattementLabel: '— (TFMP sur prix de vente)', detentionTag: `${tag} — TFMP 11,5%` };
        }
        return {
            pvBrute, years, base: netPV, taxLine: tpv,
            abattementLabel: abattYears > 0 ? `-${(abattYears * 100).toFixed(0)}% (${years.toFixed(1)} ans)` : '—',
            detentionTag: `${tag} — TPV 36,2%`
        };
    }

    // --- Crypto (Art. 150 VH bis) : jamais d'abattement, pas d'enveloppe dédiée ---
    if (c.type !== 'ACTION_ETF') {
        const baseLine = Math.max(0, pvBrute);
        let taxLine = 0;
        if (pvBrute > 0) {
            taxLine = taxRegimeMode === 'PFU'
                ? baseLine * 0.30
                : (baseLine * taxTMI) + (baseLine * 0.172) - (baseLine * 0.068 * taxTMI);
        }
        return { pvBrute, years, base: baseLine, taxLine, abattementLabel: '—', detentionTag: 'Art. 150 VH bis' };
    }

    // --- Matrice Enveloppe × Type (Action / ETF / Obligation) ---
    const env = c.envelope || 'CTO';
    const sub = c.subType || 'ACTION';
    // Abattement durée (avant 2018) : uniquement actions (jamais ETF ni obligations)
    const hasAbattementDuree = sub === 'ACTION';
    let abattement = 0;
    if (hasAbattementDuree && c.avant2018 && years > 2) abattement = years >= 8 ? 0.65 : 0.50;
    const baseBareme = Math.max(0, pvBrute) * (1 - abattement);
    const coupons = Math.max(0, c.coupons || 0);

    if (env !== 'CTO') {
        const envLine = computeEnvelopeCessionLine(c, pvBrute, years);
        if (envLine) return envLine;
    }

    const baseLine = taxRegimeMode === 'BAREME' ? baseBareme : Math.max(0, pvBrute);
    let taxLine = 0;
    if (pvBrute > 0) {
        taxLine = taxRegimeMode === 'PFU'
            ? baseLine * 0.30
            : (baseBareme * taxTMI) + (Math.max(0, pvBrute) * 0.172) - (Math.max(0, pvBrute) * 0.068 * taxTMI);
    }
    if (coupons > 0) {
        taxLine += taxRegimeMode === 'PFU'
            ? coupons * 0.30
            : (coupons * taxTMI) + (coupons * 0.172) - (coupons * 0.068 * taxTMI);
    }

    const detentionTag = abattement > 0
        ? 'Avant 2018'
        : (sub === 'OBLIGATION' ? 'Obligation — PFU seul' : (sub === 'ETF' ? 'ETF — PFU seul' : 'PFU seul'));
    const abattementLabel = abattement > 0
        ? `-${formatEUR(Math.max(0, pvBrute) * abattement)} (${(abattement * 100).toFixed(0)}%)`
        : '—';
    return { pvBrute, years, base: baseLine + coupons, taxLine, abattementLabel, detentionTag };
}
// =====================================================================
// CALCUL FISCAL STRUCTURÉ (sans DOM) — B14
// =====================================================================
// Retourne toutes les valeurs nécessaires au rendu de l'onglet Fiscalité
// ET aux KPI du bandeau supérieur (via lastTaxBreakdown). Aucune lecture
// ou écriture DOM : c'est une fonction pure, testable isolément.
// =====================================================================
let lastTaxBreakdown = null;

function computeTaxBreakdown() {
    // Pool PFU/Barème (CTO) : uniquement titres SANS enveloppe fiscale dédiée.
    const securities = cessions.filter(c =>
        (c.type === 'ACTION_ETF' && (!c.envelope || c.envelope === 'CTO')) || c.type === 'CRYPTO'
    );
    const metals = cessions.filter(c => METAL_TYPES.includes(c.type));
    const enveloppeCessions = cessions.filter(c =>
        c.type === 'ACTION_ETF' && c.envelope && c.envelope !== 'CTO'
    );

    const pvList = securities.map(c => (c.prixVente || 0) - (c.prixAchat || 0) - (c.frais || 0));
    const plusValuesBrutes  = pvList.filter(v => v > 0).reduce((a, b) => a + b, 0);
    const moinsValuesBrutes = pvList.filter(v => v < 0).reduce((a, b) => a + b, 0);
    const totalCoupons      = securities.reduce((s, c) => s + Math.max(0, c.coupons || 0), 0);
    const totalBrutVentes   = securities.reduce((s, c) => s + (c.prixVente || 0), 0);
    const netForPFU         = Math.max(0, plusValuesBrutes + moinsValuesBrutes + totalCoupons);

    const pfuIR    = netForPFU * 0.128;
    const pfuPS    = netForPFU * 0.172;
    const pfuTotal = pfuIR + pfuPS;

    let baseAbatedTotal = totalCoupons;
    securities.forEach(c => {
        const pv = (c.prixVente || 0) - (c.prixAchat || 0) - (c.frais || 0);
        if (pv <= 0) return;
        const years = computeHoldingYears(c.dateAchat, c.dateVente);
        let abatt = 0;
        if ((c.subType || 'ACTION') === 'ACTION' && c.avant2018 && years > 2) {
            abatt = years >= 8 ? 0.65 : 0.50;
        }
        baseAbatedTotal += pv * (1 - abatt);
    });
    const baseIRBareme  = Math.max(0, baseAbatedTotal + moinsValuesBrutes);
    const baremeIR      = baseIRBareme * taxTMI;
    const baremePS      = netForPFU * 0.172;
    const csgDeductible = netForPFU * 0.068 * taxTMI;
    const baremeTotal   = Math.max(0, baremeIR + baremePS - csgDeductible);

    const selectedTotal = taxRegimeMode === 'PFU' ? pfuTotal : baremeTotal;

    let metalsTaxTotal = 0;
    metals.forEach(c => { metalsTaxTotal += computeCessionLine(c).taxLine; });

    let enveloppesTaxTotal = 0;
    const pooled = {};
    enveloppeCessions.forEach(c => {
        const env = c.envelope;
        if (env === 'PEA' || env === 'PEA_PME') {
            enveloppesTaxTotal += computeCessionLine(c).taxLine;
            return;
        }
        const envYears = computeHoldingYears(c.envelopeOpenedAt, c.dateVente);
        if (!c.envelopeOpenedAt || envYears < 8) {
            enveloppesTaxTotal += computeCessionLine(c).taxLine;
            return;
        }
        const year = c.dateVente ? new Date(c.dateVente).getFullYear() : new Date().getFullYear();
        const key = env + '-' + year;
        if (!pooled[key]) pooled[key] = { gain: 0 };
        pooled[key].gain += Math.max(0, (c.prixVente || 0) - (c.prixAchat || 0) - (c.frais || 0));
    });
    Object.values(pooled).forEach(p => {
        const abattement = Math.min(p.gain, 4600);
        const base = Math.max(0, p.gain - abattement);
        enveloppesTaxTotal += base * 0.075 + p.gain * 0.172;
    });

    const peaAssets   = assets.filter(a => a.envelope === 'PEA' || a.envelope === 'PEA_PME');
    const peaInvested = peaAssets.reduce((s, a) => s + (a.invested || 0), 0);
    const peaPlafond  = peaAssets.some(a => a.envelope === 'PEA_PME')
        ? ENVELOPPES.PEA_PME.plafond : ENVELOPPES.PEA.plafond;

    return {
        securitiesCount: securities.length,
        totalBrutVentes, plusValuesBrutes, moinsValuesBrutes, totalCoupons,
        netForPFU, pfuIR, pfuPS, pfuTotal, baremeIR, baremePS, csgDeductible, baremeTotal,
        selectedTotal, metalsTaxTotal, enveloppesTaxTotal,
        peaInvested, peaPlafond, peaAssetsCount: peaAssets.length,
        totalImpot: selectedTotal + metalsTaxTotal + enveloppesTaxTotal
    };
}

// ---------------------------------------------------------------------
// Calcul agrégé : nette PV et MV entre elles (Titres+Crypto) puis applique
// UNE SEULE FOIS le régime choisi sur le solde net (Art. 200 A CGI).
// Les Métaux/Jetons restent hors de ce calcul.
// Ce renderer lit désormais l'objet structuré renvoyé par computeTaxBreakdown
// (B14 : plus aucune donnée fiscale n'est lue depuis le DOM).
// ---------------------------------------------------------------------
function calculateAnneeN1() {
    const t = computeTaxBreakdown();
    lastTaxBreakdown = t;

    // --- Bloc KPI cessions ---
    document.getElementById('cession-stat-total-brut').innerText = formatEUR(t.totalBrutVentes);
    document.getElementById('cession-stat-count').innerText      = `${t.securitiesCount} opération(s)`;
    document.getElementById('cession-stat-pv-brutes').innerText  = '+' + formatEUR(t.plusValuesBrutes + t.totalCoupons);
    document.getElementById('cession-stat-mv-brutes').innerText  = formatEUR(t.moinsValuesBrutes);
    document.getElementById('cession-stat-solde-net').innerText  = formatEUR(t.netForPFU);

    // --- Décomposition PFU / Barème ---
    document.getElementById('decomp-pfu-ir').innerText    = formatEUR(t.pfuIR);
    document.getElementById('decomp-pfu-ps').innerText    = formatEUR(t.pfuPS);
    document.getElementById('decomp-pfu-total').innerText = formatEUR(t.pfuTotal);
    document.getElementById('decomp-tmi-label').innerText = `(TMI ${(taxTMI * 100).toFixed(0)}%)`;
    document.getElementById('decomp-bareme-ir').innerText    = formatEUR(t.baremeIR);
    document.getElementById('decomp-bareme-ps').innerText    = formatEUR(t.baremePS);
    document.getElementById('decomp-bareme-csg').innerText   = '-' + formatEUR(t.csgDeductible);
    document.getElementById('decomp-bareme-total').innerText = formatEUR(t.baremeTotal);

    document.getElementById('cession-stat-impot-estime').innerText = formatEUR(t.selectedTotal);
    document.getElementById('cession-stat-regime-badge').innerText =
        taxRegimeMode === 'PFU'
            ? 'PFU / Flat Tax (30%)'
            : `Barème Progressif (TMI ${(taxTMI * 100).toFixed(0)}%)`;

    // --- Comparaison des régimes ---
    const badge = document.getElementById('decomp-optimal-badge');
    const adviceText = document.getElementById('decomp-advice-text');
    if (t.securitiesCount === 0) {
        badge.innerText = '—';
        adviceText.innerText = 'Ajoutez des cessions pour comparer les régimes.';
    } else {
        const optimalIsBareme = t.baremeTotal < t.pfuTotal - 0.01;
        const diff = Math.abs(t.pfuTotal - t.baremeTotal);
        badge.innerText = optimalIsBareme ? 'Option Optimale : Barème' : 'Option Optimale : PFU (Flat Tax)';
        adviceText.innerText = diff < 1
            ? 'Les deux régimes sont quasiment équivalents pour votre situation actuelle.'
            : (optimalIsBareme
                ? `Le Barème Progressif est l'option la plus économique pour vous. Vous économisez ${formatEUR(diff)} par rapport au PFU.`
                : `Le PFU (Flat Tax) est l'option la plus économique pour vous. Vous économisez ${formatEUR(diff)} par rapport au Barème Progressif.`);
    }

    document.getElementById('regime-option-pfu').className =
        `flex items-start gap-3 p-3 rounded-xl border cursor-pointer mb-2 transition ${taxRegimeMode === 'PFU' ? 'border-indigo-500 bg-indigo-950/20' : 'border-gray-800'}`;
    document.getElementById('regime-option-bareme').className =
        `flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${taxRegimeMode === 'BAREME' ? 'border-indigo-500 bg-indigo-950/20' : 'border-gray-800'}`;

    // --- Régimes séparés : métaux et enveloppes ---
    document.getElementById('decomp-metaux-total').innerText     = formatEUR(t.metalsTaxTotal);
    document.getElementById('decomp-enveloppes-total').innerText = formatEUR(t.enveloppesTaxTotal);

    // --- Suivi du plafond PEA ---
    const peaPlafondEl = document.getElementById('pea-plafond-tracker');
    if (peaPlafondEl) {
        if (t.peaAssetsCount === 0) {
            peaPlafondEl.classList.add('hidden');
        } else {
            const pct = Math.min(100, (t.peaInvested / t.peaPlafond) * 100);
            peaPlafondEl.classList.remove('hidden');
            document.getElementById('pea-plafond-text').innerText =
                `${formatEUR(t.peaInvested)} / ${formatEUR(t.peaPlafond)} (${pct.toFixed(0)}%)`;
            const bar = document.getElementById('pea-plafond-bar');
            bar.style.width = pct + '%';
            bar.className = 'h-full transition-all duration-500 ' +
                (pct >= 100 ? 'bg-rose-500' : pct >= 85 ? 'bg-amber-500' : 'bg-emerald-500');
        }
    }

    return t;
}

// ---------------------------------------------------------------------
// Table du registre des cessions
// ---------------------------------------------------------------------
function renderCessionsTable(filter = cessionFilter) {
    cessionFilter = filter;

    document.querySelectorAll('#cession-filter-group .cession-filter-btn').forEach(btn => {
        const isActive = btn.dataset.type === filter;
        btn.classList.toggle('bg-gray-800', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('border-gray-700', isActive);
        btn.classList.toggle('font-medium', isActive);
        btn.classList.toggle('bg-gray-900', !isActive);
        btn.classList.toggle('text-gray-400', !isActive);
        btn.classList.toggle('border-gray-800', !isActive);
    });

    const typeGroups = { MOBILIER: ['ACTION_ETF'], CRYPTO: ['CRYPTO'], METAUX: METAL_TYPES };
    const filtered = filter === 'ALL'
        ? cessions
        : cessions.filter(c => (typeGroups[filter] || []).includes(c.type));
    const sorted = [...filtered].sort((a, b) => new Date(b.dateVente) - new Date(a.dateVente));

    const typeIcons = {
        ACTION_ETF: '<i class="fa-solid fa-chart-line text-emerald-400"></i>',
        CRYPTO: '<i class="fa-brands fa-bitcoin text-purple-400"></i>',
        JETON: '<i class="fa-solid fa-shield text-emerald-400"></i>',
        COURS_LEGAL: '<i class="fa-solid fa-coins text-amber-400"></i>',
        METAUX_PRECIEUX: '<i class="fa-solid fa-vault text-blue-400"></i>'
    };
    const typeCatLabels = {
        ACTION_ETF: 'Valeur Mobilière', CRYPTO: 'Actif Numérique',
        JETON: 'Jeton / Médaille', COURS_LEGAL: 'Pièce Cours Légal',
        METAUX_PRECIEUX: 'Lingot / Métal Précieux'
    };

    const tbody = document.getElementById('table-cessions-body');
    tbody.innerHTML = sorted.length ? sorted.map(c => {
        const line = computeCessionLine(c);
        const isPos = line.pvBrute >= 0;
        const dateFR = c.dateVente ? new Date(c.dateVente).toLocaleDateString('fr-FR') : '—';
        return `<tr>
            <td class="p-3 whitespace-nowrap">${dateFR}</td>
            <td class="p-3">
                <div class="font-bold text-white flex items-center gap-1.5">${typeIcons[c.type] || ''} ${escapeHTML(c.name)}</div>
                <div class="text-[10px] text-gray-500 font-mono">${typeCatLabels[c.type] || ''}</div>
            </td>
            <td class="p-3 text-right font-mono">${formatEUR(c.prixVente)}</td>
            <td class="p-3 text-right font-mono">${formatEUR(c.prixAchat)}</td>
            <td class="p-3 whitespace-nowrap">
                <span class="text-gray-300">${Math.floor(line.years)} ans</span>
                <span class="ml-1 px-1.5 py-0.5 rounded bg-gray-800 text-[9px] text-gray-400 border border-gray-700">${escapeHTML(line.detentionTag)}</span>
            </td>
            <td class="p-3 text-right font-mono font-bold ${isPos ? 'text-emerald-400' : 'text-rose-400'}">${isPos ? '+' : ''}${formatEUR(line.pvBrute)}</td>
            <td class="p-3 text-[11px] text-gray-400">${escapeHTML(line.abattementLabel)}</td>
            <td class="p-3 text-right font-mono">${formatEUR(line.base)}</td>
            <td class="p-3 text-right font-mono text-amber-300">${formatEUR(line.taxLine)}</td>
            <td class="p-3 text-center whitespace-nowrap">
                <button onclick="editCession(${c.id})" class="p-1.5 text-gray-400 hover:text-indigo-400"><i class="fa-solid fa-pen"></i></button>
                <button onclick="deleteCession(${c.id})" class="p-1.5 text-gray-400 hover:text-rose-400"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('') : '<tr><td colspan="10" class="p-4 text-center text-gray-500 text-xs">Aucune cession enregistrée pour ce filtre.</td></tr>';
}

function filterCessions(type) {
    renderCessionsTable(type);
}

function setTaxRegime(mode) {
    taxRegimeMode = mode;
    document.getElementById('tax-regime-pfu').checked    = mode === 'PFU';
    document.getElementById('tax-regime-bareme').checked = mode === 'BAREME';
    saveTaxSettings();
    calculateAnneeN1();
    renderCessionsTable(cessionFilter);
}

function setTaxTMI(val) {
    taxTMI = parseFloat(val) || 0;
    saveTaxSettings();
    calculateAnneeN1();
    renderCessionsTable(cessionFilter);
}

// =====================================================================
// MÉTRIQUES DE RISQUE
// =====================================================================
// Volatilité et Sharpe sont calculés directement sur l'historique des valeurs
// (ou les cours réels si disponibles). Bêta et Alpha restent des ESTIMATIONS
// (proxy) faute de série de cours appariée avec un benchmark externe.
//
// Rendements annuels nets du MSCI World en EUR (données publiques indicatives,
// pas de flux live : Yahoo Finance et fournisseurs d'indices équivalents ne
// sont pas accessibles depuis un navigateur sans backend). On calcule la
// moyenne et la volatilité RÉELLES de cette série plutôt qu'une hypothèse fixe.
// ---------------------------------------------------------------------
function benchmarkStatsFromHistory() {
    const rs = Object.values(MSCI_WORLD_ANNUAL_RETURNS_EUR);
    const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
    const variance = rs.reduce((a, r) => a + Math.pow(r - mean, 2), 0) / rs.length;
    return { mean, vol: Math.sqrt(variance) };
}

// Construit, jour par jour, un rendement de PORTEFEUILLE pondéré à partir des
// vrais cours (Crypto/Devises) des actifs de assetList. Retourne null si la
// couverture est trop faible pour être représentative (on préfère alors la
// méthode par valorisation, jamais un chiffre à moitié réel sans le signaler).
function buildWeightedRealReturns(assetList) {
    const totalValue = assetList.reduce((s, a) => s + (a.value || 0), 0);
    if (totalValue <= 0) return null;

    const covered = assetList.filter(a =>
        realSeriesCache[a.ticker.toUpperCase()] && realSeriesCache[a.ticker.toUpperCase()].length >= 30
    );
    const coveredValue = covered.reduce((s, a) => s + (a.value || 0), 0);
    const coverageRatio = coveredValue / totalValue;
    if (covered.length === 0 || coverageRatio < 0.5) {
        return { returns: null, coverageRatio };
    }

    // Index chaque série par jour civil pour aligner les actifs entre eux
    const byDate = {}; // 'YYYY-MM-DD' -> { assetId: price }
    covered.forEach(a => {
        const series = realSeriesCache[a.ticker.toUpperCase()];
        series.forEach(pt => {
            const day = new Date(pt.date).toISOString().slice(0, 10);
            if (!byDate[day]) byDate[day] = {};
            byDate[day][a.id] = pt.price;
        });
    });
    const days = Object.keys(byDate).sort();
    if (days.length < 31) return { returns: null, coverageRatio };

    const lastPrice = {};
    const portfolioSeries = days.map(day => {
        covered.forEach(a => { if (byDate[day][a.id] !== undefined) lastPrice[a.id] = byDate[day][a.id]; });
        let total = 0;
        covered.forEach(a => { if (lastPrice[a.id] !== undefined) total += lastPrice[a.id] * (a.qty || 0); });
        return total;
    });

    const returns = [];
    for (let i = 1; i < portfolioSeries.length; i++) {
        if (portfolioSeries[i - 1] > 0) returns.push((portfolioSeries[i] - portfolioSeries[i - 1]) / portfolioSeries[i - 1]);
    }
    return { returns, coverageRatio, periodsPerYear: 365 };
}

// Fonction pure : calcule tous les ratios de risque à partir d'une liste
// d'actifs (portefeuille entier ou un simple segment). Ne touche pas au DOM.
function computeRiskMetricsFromAssets(assetList) {
    const tl = buildPortfolioTimeline(assetList);
    const totalValue = assetList.reduce((s, a) => s + (a.value || 0), 0);

    // --- Priorité 1 : rendements réels pondérés si couverture suffisante ---
    let returns, periodsPerYear, usedRealReturns = false, coverageRatio = 0;
    const real = buildWeightedRealReturns(assetList);
    if (real && real.returns && real.returns.length >= 30) {
        returns = real.returns;
        periodsPerYear = real.periodsPerYear;
        usedRealReturns = true;
        coverageRatio = real.coverageRatio;
    } else {
        // --- Repli : historique de valorisation du portefeuille ---
        const values = tl.valueSeries;
        const dates  = tl.rawDates;
        if (values.length < 3) return null;
        const spanDays = (dates[dates.length - 1] - dates[0]) / (1000 * 3600 * 24);
        // Annualiser un historique de quelques jours produit des chiffres absurdes
        if (spanDays < 30) return null;

        returns = [];
        for (let i = 1; i < values.length; i++) {
            if (values[i - 1] > 0) returns.push((values[i] - values[i - 1]) / values[i - 1]);
        }
        if (returns.length < 2) return null;
        periodsPerYear = spanDays > 0 ? (returns.length / (spanDays / 365.25)) : 12;
        coverageRatio = real ? real.coverageRatio : 0;
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, r) => a + Math.pow(r - mean, 2), 0) / returns.length;
    const stdev = Math.sqrt(variance);

    const volAnnualized  = stdev * Math.sqrt(periodsPerYear);
    const meanAnnualized = mean * periodsPerYear;

    const riskFree = 0.02;                 // taux sans risque supposé
    const benchStats = benchmarkStatsFromHistory();
    const benchReturn = benchStats.mean;   // moyenne RÉELLE du MSCI World (2014-2024)
    const benchVol    = benchStats.vol;    // volatilité RÉELLE du MSCI World
    const assumedCorrelation = 0.7;        // hypothèse (faute de série appariée)

    const sharpe = volAnnualized > 0 ? (meanAnnualized - riskFree) / volAnnualized : 0;
    const beta   = (volAnnualized / benchVol) * assumedCorrelation;
    const alpha  = meanAnnualized - (riskFree + beta * (benchReturn - riskFree));

    // Décomposition du risque : R² = corrélation² = part de variance expliquée
    // par les mouvements du marché (systématique). Le reste est spécifique.
    const systematicRiskPct = Math.pow(assumedCorrelation, 2);
    const specificRiskPct   = 1 - systematicRiskPct;

    // Sortino : ne pénalise que la volatilité baissière
    const periodRiskFree = riskFree / periodsPerYear;
    const downsideSq = returns.map(r => Math.pow(Math.min(0, r - periodRiskFree), 2));
    const downsideDev = Math.sqrt(downsideSq.reduce((a, b) => a + b, 0) / returns.length);
    const downsideDevAnnualized = downsideDev * Math.sqrt(periodsPerYear);
    const sortino = downsideDevAnnualized > 0 ? (meanAnnualized - riskFree) / downsideDevAnnualized : 0;

    // Max Drawdown : reflète la VALEUR TOTALE (même si les rendements réels
    // pondérés ne couvrent qu'une partie du portefeuille)
    const fullValues = tl.valueSeries.length >= 2 ? tl.valueSeries : [totalValue];
    let peak = fullValues[0], maxDrawdown = 0;
    fullValues.forEach(v => {
        peak = Math.max(peak, v);
        if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - v) / peak);
    });

    const trackingError = Math.sqrt(Math.max(0,
        volAnnualized ** 2 + benchVol ** 2 - 2 * assumedCorrelation * volAnnualized * benchVol
    ));
    const informationRatio = trackingError > 0 ? (meanAnnualized - benchReturn) / trackingError : 0;
    const treynor = beta > 0 ? (meanAnnualized - riskFree) / beta : 0;

    const monthlyVol  = volAnnualized / Math.sqrt(12);
    const monthlyMean = meanAnnualized / 12;
    const var95Pct    = Math.max(0, 1.645 * monthlyVol - monthlyMean);
    const var95Amount = totalValue * var95Pct;

    return {
        volatility: volAnnualized,
        sharpe, beta, alpha, sortino, maxdrawdown: maxDrawdown,
        trackingerror: trackingError, informationratio: informationRatio, treynor,
        var95Pct, var95Amount, meanAnnualized, riskFree, benchReturn, benchVol,
        assumedCorrelation, totalValue,
        usedRealReturns, coverageRatio,
        systematicRiskPct, specificRiskPct
    };
}

// Remplit les cellules DOM du bandeau "Analyse de Risque" + mémorise le
// résultat dans lastRiskMetrics (utilisé par openRiskMetricModal)
function calculateRiskMetrics() {
    const ids = ['volatility', 'sharpe', 'beta', 'alpha', 'sortino', 'maxdrawdown',
                 'trackingerror', 'informationratio', 'treynor', 'var95'];
    const els = {};
    ids.forEach(id => { els[id] = document.getElementById('risk-stat-' + id); });

    const m = computeRiskMetricsFromAssets(assets);
    if (!m) {
        ids.forEach(id => { els[id].innerText = 'N/A'; });
        document.getElementById('risk-bar-systematic').style.width = '0%';
        document.getElementById('risk-bar-systematic').innerText = '';
        document.getElementById('risk-bar-specific').style.width = '100%';
        document.getElementById('risk-bar-specific').innerText = 'N/A';
        lastRiskMetrics = {};
        return;
    }

    els.volatility.innerText      = (m.volatility * 100).toFixed(1) + '%';
    els.sharpe.innerText          = m.sharpe.toFixed(2);
    els.beta.innerText            = m.beta.toFixed(2) + '*';
    els.alpha.innerText           = (m.alpha >= 0 ? '+' : '') + (m.alpha * 100).toFixed(2) + '%*';
    els.sortino.innerText         = m.sortino.toFixed(2);
    els.maxdrawdown.innerText     = '-' + (m.maxdrawdown * 100).toFixed(1) + '%';
    els.trackingerror.innerText   = (m.trackingerror * 100).toFixed(1) + '%*';
    els.informationratio.innerText = m.informationratio.toFixed(2) + '*';
    els.treynor.innerText         = (m.treynor >= 0 ? '+' : '') + (m.treynor * 100).toFixed(2) + '%*';
    els.var95.innerText           = '-' + (m.var95Pct * 100).toFixed(1) + '%';

    const sysPct = Math.round(m.systematicRiskPct * 100);
    document.getElementById('risk-bar-systematic').style.width = sysPct + '%';
    document.getElementById('risk-bar-systematic').innerText   = sysPct + '%';
    document.getElementById('risk-bar-specific').style.width   = (100 - sysPct) + '%';
    document.getElementById('risk-bar-specific').innerText     = (100 - sysPct) + '%';

    const sourceEl = document.getElementById('risk-data-source');
    if (sourceEl) {
        sourceEl.innerHTML = m.usedRealReturns
            ? `<i class="fa-solid fa-circle-check text-emerald-400"></i> Volatilité/Sharpe/Sortino calculés sur des <b>cours réels</b> (CoinGecko/Frankfurter, couverture ${(m.coverageRatio * 100).toFixed(0)}% de la valeur du portefeuille)`
            : `<i class="fa-solid fa-circle-info text-gray-500"></i> Volatilité/Sharpe/Sortino estimés depuis l'historique de valorisation du portefeuille (pas de cours réels suffisants — cliquez "Historique de prix")`;
    }

    lastRiskMetrics = m;
}