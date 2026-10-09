// =====================================================================
// app10-tir.js — TRI (Taux de Rendement Interne) / Cash-flow tracking
// Dépend de : app1-core.js (assets, formatEUR, parseFlexDate)
// Charge après app6-api.js, avant app7-init.js
// =====================================================================

// ---------------------------------------------------------------------
// CACHE — évite de recalculer le TRI à chaque rendu.
// Clé : asset.id + valeur + qty + nb de buys. Toute variation invalide.
// ---------------------------------------------------------------------
const _tirCache = new Map();

function _tirCacheKey(asset) {
    return asset.id + '|' + (asset.value || 0) + '|' + (asset.qty || 0)
         + '|' + ((asset.buys || []).length)
         + '|' + ((asset.dividends || []).length);
}

function invalidateTIRCache() {
    _tirCache.clear();
}

// ---------------------------------------------------------------------
// ALGORITHME TRI — Bisection sur l'équation NPV(r) = 0
// ---------------------------------------------------------------------
// cashflows = [{ date: Date, amount: number }]
//   • amount < 0 : versement (investissement)
//   • amount > 0 : retrait ou valeur terminale
// Retourne le taux annualisé en décimal (0.08 = 8 %) ou null si non calculable.
function computeTIR(cashflows) {
    if (!Array.isArray(cashflows) || cashflows.length < 2) return null;

    // Trie et vérifie qu'il y a bien des flux entrants ET sortants
    const flows = [...cashflows].sort((a, b) => a.date - b.date);
    const hasNeg = flows.some(cf => cf.amount < 0);
    const hasPos = flows.some(cf => cf.amount > 0);
    if (!hasNeg || !hasPos) return null;

    // Si tous les flux sont sur moins de 30 jours, le TRI n'a pas de sens
    const span = flows[flows.length - 1].date - flows[0].date;
    if (span < 30 * 864e5) return null;

    const t0 = flows[0].date.getTime();
    const years = d => (d.getTime() - t0) / (365.25 * 864e5);

    // NPV(r) = Σ amount_i / (1 + r)^years_i
    const npv = r => {
        if (r <= -1) return Infinity;
        let s = 0;
        for (const cf of flows) {
            const y = years(cf.date);
            s += cf.amount / Math.pow(1 + r, y);
        }
        return s;
    };

    // Encadrement initial : -99 % à +1000 %
    let lo = -0.99, hi = 10.0;
    let fLo = npv(lo);
    let fHi = npv(hi);

    // Si pas de changement de signe (cas pathologique), on resserre
    let attempts = 0;
    while (fLo * fHi > 0 && attempts < 6) {
        hi *= 2;
        fHi = npv(hi);
        attempts++;
    }
    if (fLo * fHi > 0) return null;

    // Bisection : 100 itérations suffisent largement (converge à ~1e-30)
    for (let i = 0; i < 100; i++) {
        const mid = (lo + hi) / 2;
        const fMid = npv(mid);
        if (Math.abs(fMid) < 1e-6) return mid;
        if (fLo * fMid < 0) { hi = mid; fHi = fMid; }
        else { lo = mid; fLo = fMid; }
        if (Math.abs(hi - lo) < 1e-9) break;
    }
    return (lo + hi) / 2;
}

// ---------------------------------------------------------------------
// EXTRACTION DES FLUX PAR ACTIF
// ---------------------------------------------------------------------
// Utilise la liste `buys` (achats successifs) comme sorties de cash, et
// la valeur actuelle comme entrée terminale fictive (ce qu'on obtiendrait
// si on vendait tout au cours actuel). Les ventes partielles passées ne
// sont pas déduites (on suppose buy-and-hold sur les lots restants).
function getAssetCashflows(asset, includeTerminal = true) {
    const flows = [];
    (asset.buys || []).forEach(b => {
        const d = parseFlexDate(b.date);
        if (!d) return;
        const qty   = Number(b.qty)   || 0;
        const price = Number(b.price) || 0;
        const frais = Number(b.frais) || 0;
        const amt = qty * price + frais;
        if (amt > 0) flows.push({ date: d, amount: -amt });
    });

    // Si aucun buys mais un invested existant, on suppose un seul flux au purchaseDate
    if (flows.length === 0 && (asset.invested || 0) > 0) {
        const d = asset.purchaseDate ? parseFlexDate(asset.purchaseDate) : null;
        if (d) flows.push({ date: d, amount: -(asset.invested || 0) });
    }

    // --- Chantier 1.1 : dividendes & coupons = flux POSITIFS (avant la valeur terminale) ---
    // On déduit la retenue à la source (taxWithheld) car elle n'a pas été
    // encaissée par l'investisseur (elle est prélevée à la source dans
    // de nombreux pays : US, CH, etc.).
    (asset.dividends || []).forEach(div => {
        const d = parseFlexDate(div.date);
        if (!d) return;
        const netAmount = (Number(div.amount) || 0) - (Number(div.taxWithheld) || 0);
        if (netAmount > 0) flows.push({ date: d, amount: netAmount });
    });

    if (includeTerminal && (asset.value || 0) > 0) {
        flows.push({ date: new Date(), amount: asset.value });
    }
    return flows;
}

// ---------------------------------------------------------------------
// TRI PAR ACTIF (avec cache)
// ---------------------------------------------------------------------
function getAssetTIR(asset) {
    if (!asset) return null;
    const key = _tirCacheKey(asset);
    if (_tirCache.has(key)) return _tirCache.get(key);

    let tir = null;
    try {
        const flows = getAssetCashflows(asset, true);
        tir = computeTIR(flows);
    } catch (err) {
        console.warn('TRI failed for asset', asset.name, err);
        tir = null;
    }
    _tirCache.set(key, tir);
    return tir;
}

// ---------------------------------------------------------------------
// TRI PAR SEGMENT (portefeuille, cadran, scénario, catégorie…)
// ---------------------------------------------------------------------
function getSegmentTIR(assetList) {
    if (!Array.isArray(assetList) || !assetList.length) return null;
    const flows = [];
    assetList.forEach(a => {
        (a.buys || []).forEach(b => {
            const d = parseFlexDate(b.date);
            if (!d) return;
            const qty   = Number(b.qty)   || 0;
            const price = Number(b.price) || 0;
            const frais = Number(b.frais) || 0;
            const amt = qty * price + frais;
            if (amt > 0) flows.push({ date: d, amount: -amt });
        });
        if (flows.length === 0 && (a.invested || 0) > 0) {
            const d = a.purchaseDate ? parseFlexDate(a.purchaseDate) : null;
            if (d) flows.push({ date: d, amount: -(a.invested || 0) });
        }
        if ((a.value || 0) > 0) flows.push({ date: new Date(), amount: a.value });
    });
    return computeTIR(flows);
}

function getGlobalTIR() {
    return getSegmentTIR(assets.filter(a => !isPaperAsset(a)));
}

// ---------------------------------------------------------------------
// FORMATAGE
// ---------------------------------------------------------------------
function formatTIR(tir) {
    if (tir === null || !Number.isFinite(tir)) return '—';
    return (tir >= 0 ? '+' : '') + (tir * 100).toFixed(1) + ' %';
}

function tirColorClass(tir) {
    if (tir === null || !Number.isFinite(tir)) return 'text-gray-500';
    if (tir >= 0.08) return 'text-emerald-400';
    if (tir >= 0.03) return 'text-amber-400';
    if (tir >= 0)    return 'text-gray-300';
    return 'text-rose-400';
}

// ---------------------------------------------------------------------
// RENDU — Colonne TRI dans une ligne d'actif
// ---------------------------------------------------------------------
function tirCellHTML(asset) {
    const tir = getAssetTIR(asset);
    if (tir === null) return '<span class="text-gray-600" title="Historique de versements insuffisant (au moins 2 flux sur 30 jours requis)">—</span>';
    const cls = tirColorClass(tir);
    const txt = formatTIR(tir);
    return `<span class="${cls}" title="Taux de Rendement Interne annualisé — intègre le moment de chaque versement.">${txt}</span>`;
}

// ---------------------------------------------------------------------
// RENDU — KPI global (bandeau Performance)
// ---------------------------------------------------------------------
function renderGlobalTIRKPI() {
    const el = document.getElementById('stat-tir-global');
    if (!el) return;
    const real = assets.filter(a => !isPaperAsset(a));
    // Compte les actifs éligibles (au moins 2 flux sur 30 jours)
    let eligible = 0;
    real.forEach(a => { if (getAssetTIR(a) !== null) eligible++; });

    const tir = getGlobalTIR();
    if (tir === null || eligible === 0) {
        el.innerText = '—';
        el.className = 'text-2xl font-bold font-mono text-gray-500';
        const d = document.getElementById('stat-tir-detail');
        if (d) d.innerText = 'historique insuffisant';
        return;
    }
    el.innerText = formatTIR(tir);
    el.className = 'text-2xl font-bold font-mono ' + tirColorClass(tir);
    const detail = document.getElementById('stat-tir-detail');
    if (detail) detail.innerText = `${eligible} actif(s) éligible(s)`;
}

// ---------------------------------------------------------------------
// API publique — recalcul complet (appelée après refreshAllUI)
// ---------------------------------------------------------------------
function refreshTIR() {
    invalidateTIRCache();
    renderGlobalTIRKPI();
}

// =====================================================================
// DIVIDENDES — Helpers de calcul (Chantier 1.1)
// =====================================================================

// Somme des dividendes nets perçus sur les N derniers mois.
// Retourne { net, gross, withheld, count, entries }.
function getAssetDividendsSinceMonths(asset, months = 12) {
    const cutoff = Date.now() - months * 30.44 * 864e5;
    let net = 0, gross = 0, withheld = 0;
    const entries = [];
    (asset.dividends || []).forEach(d => {
        const dt = parseFlexDate(d.date);
        if (!dt || dt.getTime() < cutoff) return;
        const g = Number(d.amount) || 0;
        const w = Number(d.taxWithheld) || 0;
        const n = g - w;
        if (n <= 0) return;
        net += n;
        gross += g;
        withheld += w;
        entries.push({ ...d, _date: dt, _net: n });
    });
    return { net, gross, withheld, count: entries.length, entries };
}

// Rendement annuel (%) d'un actif : (dividendes 12 mois nets) / valeur actuelle.
// Retourne null si non applicable (pas de dividendes, pas de valeur exploitable).
function getAssetDividendYield(asset) {
    if (!asset) return null;
    const list = asset.dividends || [];
    if (list.length === 0) return null;
    const value = asset.value || 0;
    if (value <= 0) return null;
    const d12 = getAssetDividendsSinceMonths(asset, 12);
    return (d12.net / value) * 100;
}

// Rendement global du portefeuille : sommes(nets 12m) / sommes(valeurs).
function getPortfolioDividendYield(assetList) {
    const list = (assetList || assets).filter(a => !isPaperAsset(a));
    const totalValue = list.reduce((s, a) => s + (a.value || 0), 0);
    if (totalValue <= 0) return 0;
    const totalNet = list.reduce((s, a) => s + getAssetDividendsSinceMonths(a, 12).net, 0);
    return (totalNet / totalValue) * 100;
}

// Cellule HTML "Rendement" pour une ligne d'inventaire / une carte mobile.
// Retourne "—" si l'actif n'a aucun dividende enregistré.
function dividendYieldCellHTML(asset) {
    const list = asset.dividends || [];
    if (list.length === 0) return '<span class="text-gray-600" title="Aucun dividende/coupon enregistré">—</span>';
    const y = getAssetDividendYield(asset);
    if (y === null) return '<span class="text-gray-600">—</span>';
    const cls = y >= 3 ? 'text-emerald-400' : y >= 1 ? 'text-amber-400' : 'text-gray-300';
    return `<span class="${cls}" title="${list.length} versement(s) enregistré(s)">${y.toFixed(2)}%</span>`;
}

// =====================================================================
// KPI BANDEAU — Revenus passifs (Chantier 1.1)
// =====================================================================
// Calcule et affiche les 4 KPI de la nouvelle section :
//   - Revenus 12 mois glissants (net)
//   - Rendement moyen du portefeuille
//   - Revenus bruts + retenue à la source
//   - Fiscalité estimée (PFU 30% par défaut, exonération PEA si applicable)
function renderDividendsKPIs() {
    const realAssets = assets.filter(a => !isPaperAsset(a));

    // Agrégation
    let totalNet = 0, totalGross = 0, totalWithheld = 0, totalCount = 0;
    let taxEstimate = 0;

    realAssets.forEach(a => {
        const d12 = getAssetDividendsSinceMonths(a, 12);
        if (d12.count === 0) return;
        totalNet      += d12.net;
        totalGross    += d12.gross;
        totalWithheld += d12.withheld;
        totalCount    += d12.count;

        // Estimation fiscale : PEA exonéré d'IR (PS 17,2% restent dus),
        // AV/PER non traités ici (trop dépendants du mode de sortie),
        // CTO/Crypto = PFU 30% par défaut ou barème selon taxRegimeMode.
        const env = a.envelope || 'CTO';
        if (env === 'PEA' || env === 'PEA_PME') {
            taxEstimate += d12.net * 0.172;
        } else if (taxRegimeMode === 'PFU') {
            taxEstimate += d12.net * 0.30;
        } else {
            // Barème : approximation TMI + PS - CSG déductible
            taxEstimate += d12.net * (taxTMI + 0.172 - 0.068 * taxTMI);
        }
    });

    const yieldPct = getPortfolioDividendYield(realAssets);

    // Rendu
    const el12m = document.getElementById('stat-dividends-12m');
    if (el12m) countUp(el12m, totalNet, formatEUR);

    const elCount = document.getElementById('stat-dividends-count');
    if (elCount) elCount.innerText = `${totalCount} versement(s) sur 12 mois`;

    const elYield = document.getElementById('stat-dividends-yield');
    if (elYield) {
        countUp(elYield, yieldPct, v => v.toFixed(2) + ' %');
        elYield.className = `text-2xl font-bold font-mono ${yieldPct >= 3 ? 'text-emerald-400' : yieldPct >= 1 ? 'text-amber-400' : 'text-white'}`;
    }

    const elGross = document.getElementById('stat-dividends-gross');
    if (elGross) countUp(elGross, totalGross, formatEUR);

    const elW = document.getElementById('stat-dividends-withheld');
    if (elW) elW.innerText = formatEUR(totalWithheld);

    const elTax = document.getElementById('stat-dividends-tax');
    if (elTax) countUp(elTax, taxEstimate, formatEUR);
}