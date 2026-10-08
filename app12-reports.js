// =====================================================================
// app12-reports.js — RAPPORTS PÉRIODIQUES PDF A4 (Chantier I)
// Dépend de : app1-core.js, app5-fiscal.js, app10-tir.js, app11-scoring.js
// Charge après app11-scoring.js, avant app7-init.js
// =====================================================================

// ---------------------------------------------------------------------
// EN-TÊTE / PIED DE PAGE COMMUNS
// ---------------------------------------------------------------------
function _reportHeaderHTML(title, subtitle) {
    const portfolioName = (typeof currentPortfolio === 'function' && currentPortfolio())
        ? currentPortfolio().name : 'Portefeuille';
    const nowFR = new Date().toLocaleString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
    return `<div class="pdf-header">
        <div style="display:flex;align-items:center;gap:12px;">
            <div class="pdf-logo">📊</div>
            <div>
                <h1>PatriMonial — ${escapeHTML(title)}</h1>
                <div style="font-size:11px;color:#4b5563;">${escapeHTML(subtitle || '')}</div>
            </div>
        </div>
        <div class="pdf-meta">
            <b>${escapeHTML(portfolioName)}</b><br>
            Édité le ${nowFR}
        </div>
    </div>`;
}

function _reportFooterHTML(pageNum, totalPages) {
    return `<div class="pdf-footer">
        <div style="display:flex;justify-content:space-between;align-items:center;">
            <span><b>PatriMonial</b> — Rapport généré automatiquement · Document indicatif, ne remplace pas un conseil professionnel.</span>
            <span>Page ${pageNum} / ${totalPages}</span>
        </div>
    </div>`;
}

// ---------------------------------------------------------------------
// HELPERS D'AGRÉGATION
// ---------------------------------------------------------------------
// Renvoie un objet { value, invested, pnl, pnlPct, count } pour une liste d'actifs
function _aggregateAssets(list) {
    const value    = list.reduce((s, a) => s + (a.value    || 0), 0);
    const invested = list.reduce((s, a) => s + (a.invested || 0), 0);
    const pnl      = value - invested;
    const pnlPct   = invested > 0 ? (pnl / invested * 100) : 0;
    return { value, invested, pnl, pnlPct, count: list.length };
}

// Retourne la liste des actifs réels (hors papier)
function _reportRealAssets() {
    return assets.filter(a => !isPaperAsset(a));
}

// ---------------------------------------------------------------------
// PAGE 1 — SYNTHÈSE
// ---------------------------------------------------------------------
function _buildReportPage1() {
    const list = _reportRealAssets();
    const agg  = _aggregateAssets(list);

    const totalFrais = list.reduce((s, a) => s + (a.frais || 0), 0);
    const tirGlobal  = (typeof getGlobalTIR === 'function') ? getGlobalTIR() : null;
    const tirTxt     = tirGlobal === null ? '—'
                    : (tirGlobal >= 0 ? '+' : '') + (tirGlobal * 100).toFixed(1) + ' %';

    // Meilleurs / pires contributeurs par P&L €
    const sorted = [...list].sort((a, b) =>
        ((b.value || 0) - (b.invested || 0)) - ((a.value || 0) - (a.invested || 0))
    );
    const topContributors = sorted.slice(0, 5);
    const flopContributors = sorted.slice(-5).reverse();

    const rowContrib = (a) => {
        const pnl = (a.value || 0) - (a.invested || 0);
        const pct = a.invested > 0 ? (pnl / a.invested * 100) : 0;
        const c   = pnl >= 0 ? '#047857' : '#be123c';
        return `<tr>
            <td>${escapeHTML(a.name)} <span style="font-size:9.5px;color:#6b7280;">(${escapeHTML(a.ticker || '')})</span></td>
            <td class="pdf-num">${formatEUR(a.value)}</td>
            <td class="pdf-num" style="color:${c};font-weight:600;">${pnl >= 0 ? '+' : ''}${formatEUR(pnl)}</td>
            <td class="pdf-num" style="color:${c};font-size:9.5px;">${pnl >= 0 ? '+' : ''}${pct.toFixed(2)} %</td>
        </tr>`;
    };

    // Top 5 positions par valeur
    const top5 = [...list].sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 5);
    const rowTop5 = (a) => {
        const weight = agg.value > 0 ? (a.value / agg.value * 100) : 0;
        const pnl = (a.value || 0) - (a.invested || 0);
        const c   = pnl >= 0 ? '#047857' : '#be123c';
        return `<tr>
            <td>${escapeHTML(a.name)}</td>
            <td>${escapeHTML(a.category || '')}</td>
            <td class="pdf-num">${formatEUR(a.value)}</td>
            <td class="pdf-num">${weight.toFixed(1)} %</td>
            <td class="pdf-num" style="color:${c};">${pnl >= 0 ? '+' : ''}${formatEUR(pnl)}</td>
        </tr>`;
    };

    return `<div class="pdf-page">
        ${_reportHeaderHTML('Rapport Mensuel', 'Synthèse générale du portefeuille')}

        <h2>1 · Indicateurs clés</h2>
        <div class="pdf-kpi-grid">
            <div class="pdf-kpi"><div class="label">Patrimoine total</div><div class="value">${formatEUR(agg.value)}</div></div>
            <div class="pdf-kpi"><div class="label">Capital investi</div><div class="value">${formatEUR(agg.invested)}</div></div>
            <div class="pdf-kpi ${agg.pnl >= 0 ? 'positive' : 'negative'}">
                <div class="label">Gain / Perte</div>
                <div class="value">${agg.pnl >= 0 ? '+' : ''}${formatEUR(agg.pnl)}</div>
            </div>
            <div class="pdf-kpi accent"><div class="label">TRI global annualisé</div><div class="value">${tirTxt}</div></div>
        </div>
        <div class="pdf-kpi-grid" style="margin-top:0;">
            <div class="pdf-kpi"><div class="label">Nombre de lignes</div><div class="value">${list.length}</div></div>
            <div class="pdf-kpi"><div class="label">Frais cumulés</div><div class="value">${formatEUR(totalFrais)}</div></div>
            <div class="pdf-kpi ${agg.pnlPct >= 0 ? 'positive' : 'negative'}">
                <div class="label">Performance globale</div>
                <div class="value">${agg.pnlPct >= 0 ? '+' : ''}${agg.pnlPct.toFixed(2)} %</div>
            </div>
            <div class="pdf-kpi"><div class="label">Frais / capital</div>
                <div class="value">${agg.invested > 0 ? (totalFrais / agg.invested * 100).toFixed(2) : '0.00'} %</div>
            </div>
        </div>

        <h2>2 · Top 5 positions par valeur</h2>
        <table>
            <thead><tr>
                <th>Actif</th><th>Catégorie</th>
                <th style="text-align:right;">Valeur</th>
                <th style="text-align:right;">Poids</th>
                <th style="text-align:right;">P&amp;L</th>
            </tr></thead>
            <tbody>
                ${top5.length ? top5.map(rowTop5).join('') : '<tr><td colspan="5" style="text-align:center;font-style:italic;color:#9ca3af;">Aucun actif.</td></tr>'}
            </tbody>
        </table>

        <h2>3 · Meilleurs et pires contributeurs</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
            <div>
                <div style="font-size:10px;color:#047857;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">▲ Meilleurs contributeurs</div>
                <table>
                    <thead><tr><th>Actif</th><th style="text-align:right;">Valeur</th><th style="text-align:right;">P&amp;L</th><th style="text-align:right;">%</th></tr></thead>
                    <tbody>${topContributors.length ? topContributors.map(rowContrib).join('') : '<tr><td colspan="4" style="text-align:center;color:#9ca3af;font-style:italic;">—</td></tr>'}</tbody>
                </table>
            </div>
            <div>
                <div style="font-size:10px;color:#be123c;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">▼ Pires contributeurs</div>
                <table>
                    <thead><tr><th>Actif</th><th style="text-align:right;">Valeur</th><th style="text-align:right;">P&amp;L</th><th style="text-align:right;">%</th></tr></thead>
                    <tbody>${flopContributors.length ? flopContributors.map(rowContrib).join('') : '<tr><td colspan="4" style="text-align:center;color:#9ca3af;font-style:italic;">—</td></tr>'}</tbody>
                </table>
            </div>
        </div>

        ${_reportFooterHTML(1, 4)}
    </div>`;
}

// ---------------------------------------------------------------------
// PAGE 2 — ALLOCATION
// ---------------------------------------------------------------------
function _buildReportPage2() {
    const list = _reportRealAssets();
    const agg  = _aggregateAssets(list);

    // Répartition par catégorie
    const byCat = {};
    list.forEach(a => {
        const cat = a.category || 'Autre';
        if (!byCat[cat]) byCat[cat] = { value: 0, invested: 0, count: 0 };
        byCat[cat].value    += a.value || 0;
        byCat[cat].invested += a.invested || 0;
        byCat[cat].count    += 1;
    });
    const catsSorted = Object.entries(byCat).sort((a, b) => b[1].value - a[1].value);

    const rowCat = ([cat, v]) => {
        const weight = agg.value > 0 ? (v.value / agg.value * 100) : 0;
        const pnl    = v.value - v.invested;
        const c      = pnl >= 0 ? '#047857' : '#be123c';
        return `<tr>
            <td><b>${escapeHTML(cat)}</b></td>
            <td class="pdf-num">${v.count}</td>
            <td class="pdf-num">${formatEUR(v.invested)}</td>
            <td class="pdf-num">${formatEUR(v.value)}</td>
            <td class="pdf-num">${weight.toFixed(1)} %</td>
            <td class="pdf-num" style="color:${c};">${pnl >= 0 ? '+' : ''}${formatEUR(pnl)}</td>
        </tr>`;
    };

    // Allocations Gave
    const gaveTotals = {};
    GAVE_QUADRANTS.forEach(q => {
        gaveTotals[q] = list
            .filter(a => a.cadran === q)
            .reduce((s, a) => s + (a.value || 0), 0);
    });
    const gaveTotal = Object.values(gaveTotals).reduce((a, b) => a + b, 0);
    const cible     = gaveTotal / 4;

    const rowGave = (q) => {
        const val = gaveTotals[q];
        const pct = gaveTotal > 0 ? (val / gaveTotal * 100) : 0;
        const gap = val - cible;
        const gapCls = Math.abs(gap) < 1 ? '#6b7280' : (gap > 0 ? '#b45309' : '#047857');
        const badge = Math.abs(gap) < 1 ? '—' : (gap > 0 ? 'Sur-pondéré' : 'Sous-pondéré');
        return `<tr>
            <td><b>${escapeHTML(cadranLabel(q))}</b></td>
            <td class="pdf-num">${formatEUR(val)}</td>
            <td class="pdf-num">${pct.toFixed(1)} %</td>
            <td class="pdf-num">${formatEUR(cible)}</td>
            <td class="pdf-num" style="color:${gapCls};font-weight:600;">${gap >= 0 ? '+' : ''}${formatEUR(gap)}</td>
            <td style="font-size:9.5px;color:${gapCls};">${badge}</td>
        </tr>`;
    };

    return `<div class="pdf-page">
        ${_reportHeaderHTML('Rapport Mensuel', 'Répartition de l\'allocation')}

        <h2>4 · Répartition par catégorie d'actif</h2>
        <table>
            <thead><tr>
                <th>Catégorie</th>
                <th style="text-align:right;">Nb</th>
                <th style="text-align:right;">Investi</th>
                <th style="text-align:right;">Valeur</th>
                <th style="text-align:right;">Poids</th>
                <th style="text-align:right;">P&amp;L</th>
            </tr></thead>
            <tbody>
                ${catsSorted.length ? catsSorted.map(rowCat).join('') : '<tr><td colspan="6" style="text-align:center;font-style:italic;color:#9ca3af;">Aucun actif.</td></tr>'}
                <tr class="pdf-total-row">
                    <td>Total</td>
                    <td class="pdf-num">${list.length}</td>
                    <td class="pdf-num">${formatEUR(agg.invested)}</td>
                    <td class="pdf-num">${formatEUR(agg.value)}</td>
                    <td class="pdf-num">100.0 %</td>
                    <td class="pdf-num" style="color:${agg.pnl >= 0 ? '#047857' : '#be123c'};">${agg.pnl >= 0 ? '+' : ''}${formatEUR(agg.pnl)}</td>
                </tr>
            </tbody>
        </table>

        <h2>5 · Allocation 4 Cadrans de Gave (cible 25 %)</h2>
        <table>
            <thead><tr>
                <th>Cadran</th>
                <th style="text-align:right;">Valeur</th>
                <th style="text-align:right;">% actuel</th>
                <th style="text-align:right;">Cible (25 %)</th>
                <th style="text-align:right;">Écart €</th>
                <th>Statut</th>
            </tr></thead>
            <tbody>
                ${GAVE_QUADRANTS.map(rowGave).join('')}
                <tr class="pdf-total-row">
                    <td>Total Gave</td>
                    <td class="pdf-num">${formatEUR(gaveTotal)}</td>
                    <td class="pdf-num">100.0 %</td>
                    <td class="pdf-num">${formatEUR(gaveTotal)}</td>
                    <td class="pdf-num">—</td>
                    <td>—</td>
                </tr>
            </tbody>
        </table>

        <h2>6 · Détail des positions par cadran</h2>
        ${GAVE_QUADRANTS.map(q => {
            const items = list.filter(a => a.cadran === q);
            if (!items.length) return '';
            const sub = _aggregateAssets(items);
            return `<div class="pdf-section" style="margin-bottom:10px;">
                <div style="font-size:11px;font-weight:700;color:#0f172a;border-left:4px solid #0f766e;padding-left:6px;margin-bottom:4px;">
                    ${escapeHTML(cadranLabel(q))} — ${items.length} ligne(s) · ${formatEUR(sub.value)} · ${sub.pnlPct >= 0 ? '+' : ''}${sub.pnlPct.toFixed(2)} %
                </div>
                <table>
                    <thead><tr><th>Actif</th><th style="text-align:right;">Qté</th><th style="text-align:right;">PRU</th><th style="text-align:right;">Valeur unitaire</th><th style="text-align:right;">Valeur</th><th style="text-align:right;">P&amp;L</th></tr></thead>
                    <tbody>
                        ${items.map(a => {
                            const pru   = computePRUFromLots(a);
                            const unit  = a.qty > 0 ? (a.value / a.qty) : 0;
                            const pnl   = (a.value || 0) - (a.invested || 0);
                            const c     = pnl >= 0 ? '#047857' : '#be123c';
                            return `<tr>
                                <td>${escapeHTML(a.name)}</td>
                                <td class="pdf-num">${fmtQty(a.qty)}</td>
                                <td class="pdf-num">${formatUnitPrice(pru)}</td>
                                <td class="pdf-num">${formatUnitPrice(unit)}</td>
                                <td class="pdf-num">${formatEUR(a.value)}</td>
                                <td class="pdf-num" style="color:${c};">${pnl >= 0 ? '+' : ''}${formatEUR(pnl)}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`;
        }).join('')}

        ${_reportFooterHTML(2, 4)}
    </div>`;
}

// ---------------------------------------------------------------------
// PAGE 3 — PORTEFEUILLE DÉTAILLÉ
// ---------------------------------------------------------------------
function _buildReportPage3() {
    const list = _reportRealAssets().slice().sort((a, b) => (b.value || 0) - (a.value || 0));

    const rowAsset = (a) => {
        const pru   = (typeof computePRUFromLots === 'function') ? computePRUFromLots(a) : 0;
        const pnl   = (a.value || 0) - (a.invested || 0);
        const pnlPct = a.invested > 0 ? (pnl / a.invested * 100) : 0;
        const c     = pnl >= 0 ? '#047857' : '#be123c';

        let tirTxt = '—';
        try {
            const tir = (typeof getAssetTIR === 'function') ? getAssetTIR(a) : null;
            if (tir !== null && Number.isFinite(tir)) tirTxt = (tir >= 0 ? '+' : '') + (tir * 100).toFixed(1) + ' %';
        } catch (_) {}

        let scoreTxt = '—';
        try {
            const sc = (typeof computeAssetScore === 'function') ? computeAssetScore(a) : null;
            if (sc) scoreTxt = sc.total + '/100';
        } catch (_) {}

        return `<tr>
            <td><b>${escapeHTML(a.name)}</b><div style="font-size:9px;color:#6b7280;">${escapeHTML(a.ticker || '')}</div></td>
            <td style="font-size:9.5px;">${escapeHTML(a.category || '')}</td>
            <td style="font-size:9.5px;">${escapeHTML((a.categories || []).join(', '))}</td>
            <td class="pdf-num">${fmtQty(a.qty)}</td>
            <td class="pdf-num">${formatUnitPrice(pru)}</td>
            <td class="pdf-num">${formatEUR(a.invested)}</td>
            <td class="pdf-num">${formatEUR(a.value)}</td>
            <td class="pdf-num" style="color:${c};">${pnl >= 0 ? '+' : ''}${formatEUR(pnl)}</td>
            <td class="pdf-num" style="color:${c};font-size:9.5px;">${pnl >= 0 ? '+' : ''}${pnlPct.toFixed(2)} %</td>
            <td class="pdf-num" style="font-size:9.5px;">${tirTxt}</td>
            <td class="pdf-num" style="font-size:9.5px;">${scoreTxt}</td>
        </tr>`;
    };

    const agg = _aggregateAssets(list);

    return `<div class="pdf-page">
        ${_reportHeaderHTML('Rapport Mensuel', 'Portefeuille détaillé')}

        <h2>7 · Inventaire complet des actifs (${list.length} lignes)</h2>
        <table>
            <thead><tr>
                <th>Actif</th>
                <th>Catégorie</th>
                <th>Tags</th>
                <th style="text-align:right;">Qté</th>
                <th style="text-align:right;">PRU</th>
                <th style="text-align:right;">Investi</th>
                <th style="text-align:right;">Valeur</th>
                <th style="text-align:right;">P&amp;L €</th>
                <th style="text-align:right;">P&amp;L %</th>
                <th style="text-align:right;">TRI</th>
                <th style="text-align:right;">Score</th>
            </tr></thead>
            <tbody>
                ${list.length ? list.map(rowAsset).join('') : '<tr><td colspan="11" style="text-align:center;font-style:italic;color:#9ca3af;">Aucun actif.</td></tr>'}
                <tr class="pdf-total-row">
                    <td colspan="5">Total portefeuille</td>
                    <td class="pdf-num">${formatEUR(agg.invested)}</td>
                    <td class="pdf-num">${formatEUR(agg.value)}</td>
                    <td class="pdf-num" style="color:${agg.pnl >= 0 ? '#047857' : '#be123c'};">${agg.pnl >= 0 ? '+' : ''}${formatEUR(agg.pnl)}</td>
                    <td class="pdf-num" style="color:${agg.pnl >= 0 ? '#047857' : '#be123c'};">${agg.pnlPct >= 0 ? '+' : ''}${agg.pnlPct.toFixed(2)} %</td>
                    <td colspan="2"></td>
                </tr>
            </tbody>
        </table>

        <div style="font-size:9px;color:#6b7280;margin-top:8px;line-height:1.5;">
            <b>Légende :</b> PRU = Prix de Revient Unitaire (méthode fiscale française, frais inclus). TRI = Taux de Rendement Interne annualisé, tient compte du moment de chaque versement. Score = note 0-100 sur 6 critères pondérés (TRI, Sharpe, frais, alpha, ancienneté, concentration).
        </div>

        ${_reportFooterHTML(3, 4)}
    </div>`;
}

// ---------------------------------------------------------------------
// PAGE 4 — FISCALITÉ & SUIVI
// ---------------------------------------------------------------------
function _buildReportPage4() {
    // Fiscalité
    let tax = null;
    try {
        tax = (typeof computeTaxBreakdown === 'function')
            ? (lastTaxBreakdown || computeTaxBreakdown())
            : null;
    } catch (_) {}

    const regimeLabel = taxRegimeMode === 'PFU'
        ? 'PFU — Flat Tax (30 %)'
        : `Barème Progressif (TMI ${(taxTMI * 100).toFixed(0)} %)`;

    // 5 derniers arbitrages
    const lastArbs = [...arbitrages]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);

    // Objectifs (si présents)
    let goals = [];
    try {
        goals = (typeof loadGoalsFromStorage === 'function') ? loadGoalsFromStorage() : [];
    } catch (_) {}
    const patrimoine = _aggregateAssets(_reportRealAssets()).value;

    // Alertes actives
    let activeAlerts = 0;
    try {
        const all = (typeof loadAlertsFromStorage === 'function') ? loadAlertsFromStorage() : [];
        activeAlerts = all.filter(a => a.active !== false).length;
    } catch (_) {}

    return `<div class="pdf-page">
        ${_reportHeaderHTML('Rapport Mensuel', 'Fiscalité estimée et suivi')}

        <h2>8 · Fiscalité estimée — Exercice en cours</h2>
        <div class="pdf-kpi-grid">
            <div class="pdf-kpi accent"><div class="label">Impôt total estimé</div>
                <div class="value">${tax ? formatEUR(tax.totalImpot) : '—'}</div>
            </div>
            <div class="pdf-kpi"><div class="label">Impôt CTO / Crypto</div>
                <div class="value">${tax ? formatEUR(tax.selectedTotal) : '—'}</div>
            </div>
            <div class="pdf-kpi"><div class="label">Impôt Métaux / Jetons</div>
                <div class="value">${tax ? formatEUR(tax.metalsTaxTotal) : '—'}</div>
            </div>
            <div class="pdf-kpi"><div class="label">Impôt PEA / AV / PER</div>
                <div class="value">${tax ? formatEUR(tax.enveloppesTaxTotal) : '—'}</div>
            </div>
        </div>
        <div style="font-size:10px;color:#4b5563;margin-bottom:12px;">
            Régime retenu : <b>${regimeLabel}</b> · Nombre de cessions enregistrées : <b>${cessions.length}</b>.
        </div>

        <h2>9 · Derniers arbitrages enregistrés</h2>
        <table>
            <thead><tr>
                <th>Date</th>
                <th>Source</th>
                <th>Destination</th>
                <th style="text-align:right;">Montant</th>
                <th>Motif</th>
            </tr></thead>
            <tbody>
                ${lastArbs.length ? lastArbs.map(a => `<tr>
                    <td>${a.date ? new Date(a.date).toLocaleDateString('fr-FR') : '—'}</td>
                    <td>${escapeHTML(a.source)}</td>
                    <td>${escapeHTML(a.destination)}</td>
                    <td class="pdf-num">${formatEUR(a.montant)}</td>
                    <td style="font-size:9.5px;color:#4b5563;">${escapeHTML(a.motif || '')}</td>
                </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;font-style:italic;color:#9ca3af;">Aucun arbitrage enregistré.</td></tr>'}
            </tbody>
        </table>

        <h2>10 · Objectifs patrimoniaux en cours</h2>
        <table>
            <thead><tr>
                <th>Objectif</th>
                <th style="text-align:right;">Cible</th>
                <th>Échéance</th>
                <th style="text-align:right;">Progression</th>
                <th style="text-align:right;">Épargne mensuelle</th>
                <th>Statut</th>
            </tr></thead>
            <tbody>
                ${goals.length ? goals.map(g => {
                    const pct = g.targetAmount > 0 ? Math.min(100, (patrimoine / g.targetAmount) * 100) : 0;
                    const reached = patrimoine >= g.targetAmount;
                    const c = reached ? '#047857' : (pct >= 50 ? '#b45309' : '#be123c');
                    return `<tr>
                        <td><b>${escapeHTML(g.name)}</b></td>
                        <td class="pdf-num">${formatEUR(g.targetAmount)}</td>
                        <td>${g.targetDate ? new Date(g.targetDate).toLocaleDateString('fr-FR') : '—'}</td>
                        <td class="pdf-num" style="color:${c};font-weight:600;">${pct.toFixed(1)} %</td>
                        <td class="pdf-num">${formatEUR(g.monthly || 0)}</td>
                        <td style="font-size:9.5px;color:${c};">${reached ? 'Atteint' : (pct >= 75 ? 'Bonne voie' : 'À renforcer')}</td>
                    </tr>`;
                }).join('') : '<tr><td colspan="6" style="text-align:center;font-style:italic;color:#9ca3af;">Aucun objectif défini.</td></tr>'}
            </tbody>
        </table>

        <h2>11 · Alertes configurées</h2>
        <div style="font-size:11px;color:#1f2937;">
            <b>${activeAlerts}</b> alerte(s) active(s) sur ${(typeof loadAlertsFromStorage === 'function' ? loadAlertsFromStorage().length : 0)} au total.
        </div>

        <div class="pdf-footer" style="margin-top:26px;">
            <div style="text-align:center;font-size:9px;color:#6b7280;">
                <b>Avertissement</b> — Ce document est une estimation indicative produite automatiquement à partir des données saisies dans PatriMonial.
                Il ne remplace pas les cases précises de votre déclaration de revenus (2042, 2086, 2074…) ni l'avis d'un professionnel de la fiscalité.
            </div>
        </div>

        ${_reportFooterHTML(4, 4)}
    </div>`;
}

// ---------------------------------------------------------------------
// ASSEMBLAGE + EXPORT
// ---------------------------------------------------------------------
function buildMonthlyReportHTML() {
    return [
        _buildReportPage1(),
        _buildReportPage2(),
        _buildReportPage3(),
        _buildReportPage4()
    ].join('');
}

// Utilise le même conteneur d'impression que le récap fiscal
// (#print-fiscal-recap) → réutilise tout le CSS @media print existant.
function exportMonthlyReportPDF() {
    const container = document.getElementById('print-fiscal-recap');
    if (!container) {
        alert('Conteneur d\'impression introuvable.');
        return;
    }

    const realAssets = _reportRealAssets();
    if (!realAssets.length) {
        if (!confirm('Votre portefeuille est vide. Générer quand même un rapport (pages essentiellement vides) ?')) return;
    }

    // Génère le HTML et l'injecte
    container.innerHTML = buildMonthlyReportHTML();

    // Laisse le navigateur appliquer les styles avant l'impression
    setTimeout(() => window.print(), 200);
}

// Commande utilitaire de prévisualisation HTML (facultatif, ouvre dans un nouvel onglet)
function previewMonthlyReportHTML() {
    const html = buildMonthlyReportHTML();
    const w = window.open('', '_blank');
    if (!w) { alert('Pop-up bloquée.'); return; }
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Rapport PatriMonial</title><link rel="stylesheet" href="style.css"></head><body style="background:#fff;padding:20px;">${html}</body></html>`);
    w.document.close();
}