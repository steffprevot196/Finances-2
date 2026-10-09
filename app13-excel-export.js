// =====================================================================
// app13-excel-export.js — EXPORT EXCEL MULTI-FEUILLES (.xlsx)
// Dépend de : app1-core.js, app5-fiscal.js, app10-tir.js, app11-scoring.js
// Charge après app12-reports.js, avant app7-init.js
// Utilise SheetJS (XLSX), déjà chargé dans index.html.
// =====================================================================

// ---------------------------------------------------------------------
// HELPERS DE CONSTRUCTION DE FEUILLES
// ---------------------------------------------------------------------
// Ajoute une feuille à un classeur en appliquant des largeurs de colonnes
// et un style d'en-tête (gras, fond gris clair) si les options le permettent.
function _xlsxAddSheet(workbook, sheetName, aoa, colWidths) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    if (Array.isArray(colWidths)) {
        ws['!cols'] = colWidths.map(w => ({ wch: w }));
    }
    // Note : SheetJS Community ne supporte NI les styles ni le gel de volets.
    // La propriété `!freeze` n'est pas reconnue et serait silencieusement ignorée.
    // Rien à faire ici tant qu'on reste sur la version community.
    XLSX.utils.book_append_sheet(workbook, ws, sheetName);
    return ws;
}

// Formate une date ISO en JJ/MM/AAAA, ou renvoie '' si invalide.
function _xlsxFormatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString('fr-FR');
}

// Arrondi à 2 décimales en nombre (pas en chaîne) pour qu'Excel puisse faire des calculs
function _xlsxNum(v, decimals = 2) {
    if (!Number.isFinite(v)) return 0;
    const m = Math.pow(10, decimals);
    return Math.round(v * m) / m;
}

// ---------------------------------------------------------------------
// FEUILLE 1 — SYNTHÈSE
// ---------------------------------------------------------------------
function _xlsxBuildSyntheseSheet() {
    const list = assets.filter(a => !isPaperAsset(a));
    const totalValue    = list.reduce((s, a) => s + (a.value    || 0), 0);
    const totalInvested = list.reduce((s, a) => s + (a.invested || 0), 0);
    const totalFrais    = list.reduce((s, a) => s + (a.frais    || 0), 0);
    const totalPnl      = totalValue - totalInvested;
    const totalPnlPct   = totalInvested > 0 ? (totalPnl / totalInvested * 100) : 0;

    let tirGlobal = null;
    try {
        tirGlobal = (typeof getGlobalTIR === 'function') ? getGlobalTIR() : null;
    } catch (_) {}

    // Allocation par cadran
    const gaveTotals = {};
    GAVE_QUADRANTS.forEach(q => {
        gaveTotals[q] = list.filter(a => a.cadran === q).reduce((s, a) => s + (a.value || 0), 0);
    });
    const gaveTotal = Object.values(gaveTotals).reduce((a, b) => a + b, 0);

    // Allocation par catégorie
    const catTotals = {};
    list.forEach(a => {
        const cat = a.category || 'Autre';
        catTotals[cat] = (catTotals[cat] || 0) + (a.value || 0);
    });

    const aoa = [];

    // Bloc 1 : méta
    aoa.push(['PatriMonial — Export Excel']);
    aoa.push([]);
    aoa.push(['Portefeuille', currentPortfolio() ? currentPortfolio().name : 'Portefeuille principal']);
    aoa.push(['Date d\'export', new Date().toLocaleString('fr-FR')]);
    aoa.push(['Nombre de lignes actives', list.length]);
    aoa.push([]);

    // Bloc 2 : KPIs
    aoa.push(['INDICATEURS CLÉS']);
    aoa.push(['Capital investi', _xlsxNum(totalInvested)]);
    aoa.push(['Valeur de marché', _xlsxNum(totalValue)]);
    aoa.push(['Frais cumulés', _xlsxNum(totalFrais)]);
    aoa.push(['Gain / Perte (€)', _xlsxNum(totalPnl)]);
    aoa.push(['Gain / Perte (%)', _xlsxNum(totalPnlPct)]);
    aoa.push(['TRI global annualisé', tirGlobal === null ? '—' : _xlsxNum(tirGlobal * 100)]);
    aoa.push([]);

    // Bloc 3 : Allocation par cadran
    aoa.push(['ALLOCATION 4 CADRANS DE GAVE']);
    aoa.push(['Cadran', 'Valeur (€)', 'Poids (%)', 'Cible 25 % (€)', 'Écart (€)', 'Statut']);
    GAVE_QUADRANTS.forEach(q => {
        const val  = gaveTotals[q];
        const pct  = gaveTotal > 0 ? (val / gaveTotal * 100) : 0;
        const cible = gaveTotal / 4;
        const gap  = val - cible;
        const statut = Math.abs(gap) < 1 ? '—' : (gap > 0 ? 'Sur-pondéré' : 'Sous-pondéré');
        aoa.push([cadranLabel(q), _xlsxNum(val), _xlsxNum(pct), _xlsxNum(cible), _xlsxNum(gap), statut]);
    });
    aoa.push(['Total', _xlsxNum(gaveTotal), 100, _xlsxNum(gaveTotal), 0, '']);
    aoa.push([]);

    // Bloc 4 : Allocation par catégorie
    aoa.push(['ALLOCATION PAR CATÉGORIE']);
    aoa.push(['Catégorie', 'Valeur (€)', 'Poids (%)']);
    Object.entries(catTotals)
        .sort((a, b) => b[1] - a[1])
        .forEach(([cat, val]) => {
            aoa.push([cat, _xlsxNum(val), _xlsxNum(totalValue > 0 ? (val / totalValue * 100) : 0)]);
        });
    aoa.push(['Total', _xlsxNum(totalValue), 100]);

    return {
        aoa,
        colWidths: [40, 18, 14, 18, 18, 16]
    };
}

// ---------------------------------------------------------------------
// FEUILLE 2 — ACTIFS
// ---------------------------------------------------------------------
function _xlsxBuildActifsSheet() {
    const list = assets.filter(a => !isPaperAsset(a));
    const aoa = [];

    aoa.push([
        'Nom', 'Ticker', 'ISIN', 'Yahoo Ticker',
        'Catégories', 'Catégorie principale', 'Cadran', 'Cadrans secondaires',
        'Enveloppe', 'Courtier',
        'Quantité', 'PRU unitaire (€)', 'Valeur unitaire (€)',
        'Frais totaux (€)', 'Total investi (€)', 'Valeur actuelle (€)',
        'P&L (€)', 'P&L (%)', 'TRI estimé (%)', 'Score (/100)',
        'Nb lots', 'Valorisation', 'Zone'
    ]);

    list.forEach(a => {
        const pru   = (typeof computePRUFromLots === 'function') ? computePRUFromLots(a) : 0;
        const unit  = a.qty > 0 ? (a.value / a.qty) : 0;
        const pnl   = (a.value || 0) - (a.invested || 0);
        const pnlPct = a.invested > 0 ? (pnl / a.invested * 100) : 0;

        let tirPct = null;
        try {
            const tir = (typeof getAssetTIR === 'function') ? getAssetTIR(a) : null;
            if (tir !== null && Number.isFinite(tir)) tirPct = tir * 100;
        } catch (_) {}

        let score = null;
        try {
            const sc = (typeof computeAssetScore === 'function') ? computeAssetScore(a) : null;
            if (sc) score = sc.total;
        } catch (_) {}

        aoa.push([
            a.name || '',
            a.ticker || '',
            a.isin || '',
            a.yahooTicker || '',
            (a.categories || []).join(', '),
            a.category || '',
            cadranLabel(a.cadran || 'HORS_GAVE'),
            (a.cadrans && Array.isArray(a.cadrans.secondary) ? a.cadrans.secondary : []).map(cadranLabel).join(', '),
            a.envelope ? (ENVELOPPES[a.envelope]?.short || a.envelope) : '',
            a.broker || '',
            _xlsxNum(a.qty, 8),
            _xlsxNum(pru, 4),
            _xlsxNum(unit, 4),
            _xlsxNum(a.frais || 0),
            _xlsxNum(a.invested || 0),
            _xlsxNum(a.value || 0),
            _xlsxNum(pnl),
            _xlsxNum(pnlPct),
            tirPct === null ? '—' : _xlsxNum(tirPct, 2),
            score === null ? '—' : score,
            (a.lots || []).length,
            a.valuationMode || 'QUOTE',
            a.zone || 'UE'
        ]);
    });

    return {
        aoa,
        colWidths: [36, 12, 14, 14, 28, 18, 22, 20, 12, 16,
                    14, 14, 14, 14, 16, 16, 14, 10, 12, 10, 8, 12, 8]
    };
}

// ---------------------------------------------------------------------
// FEUILLE 3 — LOTS
// ---------------------------------------------------------------------
function _xlsxBuildLotsSheet() {
    const list = assets.filter(a => !isPaperAsset(a));
    const aoa = [];

    aoa.push([
        'Actif', 'Ticker', 'Date d\'achat', 'Référence',
        'Qté achetée', 'Qté restante', 'Prix unitaire (€)', 'Frais lot (€)',
        'Coût unitaire total (€)', 'PRU cumulé (€)',
        'Valeur actuelle unitaire (€)', 'P&L latent (€)', 'P&L (%)',
        'Lot vendu'
    ]);

    list.forEach(a => {
        if (!Array.isArray(a.lots) || !a.lots.length) return;
        const totalQty = a.lots.reduce((s, l) => s + (l.qtyRemaining || 0), 0);
        const currentUnit = totalQty > 0 ? (a.value / totalQty) : 0;

        const sorted = [...a.lots].sort((x, y) => new Date(x.date) - new Date(y.date));
        let cumQty = 0, cumCost = 0;

        sorted.forEach(l => {
            const lotUnit = (l.price || 0) + ((l.frais || 0) / (l.qty || 1));
            cumQty  += (l.qty || 0);
            cumCost += (l.qty || 0) * (l.price || 0) + (l.frais || 0);
            const cumPRU = cumQty > 0 ? cumCost / cumQty : 0;

            const remaining = l.qtyRemaining || 0;
            const isSold = remaining <= 0;
            const pnlPerUnit = (!isSold && currentUnit > 0) ? (currentUnit - lotUnit) : 0;
            const pnlTotal = pnlPerUnit * remaining;
            const pnlPct = lotUnit > 0 ? (pnlPerUnit / lotUnit * 100) : 0;

            aoa.push([
                a.name || '',
                a.ticker || '',
                l.date || '',
                l.reference || '',
                _xlsxNum(l.qty || 0, 8),
                _xlsxNum(remaining, 8),
                _xlsxNum(l.price || 0, 4),
                _xlsxNum(l.frais || 0),
                _xlsxNum(lotUnit, 4),
                _xlsxNum(cumPRU, 4),
                _xlsxNum(currentUnit, 4),
                isSold ? '—' : _xlsxNum(pnlTotal),
                isSold ? '—' : _xlsxNum(pnlPct),
                isSold ? 'Oui' : 'Non'
            ]);
        });
    });

    if (aoa.length === 1) {
        aoa.push(['Aucun lot enregistré']);
    }

    return {
        aoa,
        colWidths: [30, 12, 12, 18, 14, 14, 14, 12, 16, 14, 16, 14, 10, 10]
    };
}

// ---------------------------------------------------------------------
// FEUILLE 4 — CESSIONS
// ---------------------------------------------------------------------
function _xlsxBuildCessionsSheet() {
    const aoa = [];

    aoa.push([
        'Date vente', 'Date achat', 'Type', 'Sous-type', 'Libellé',
        'Enveloppe', 'Zone',
        'Prix de vente (€)', 'Prix d\'achat (PRU) (€)', 'Frais (€)',
        'Plus/moins-value brute (€)', 'Durée détention (ans)',
        'Régime / détention', 'Abattement / franchise',
        'Base imposable (€)', 'Impôt estimé ligne (€)'
    ]);

    const sorted = [...cessions].sort((a, b) => new Date(b.dateVente) - new Date(a.dateVente));

    sorted.forEach(c => {
        let line;
        try {
            line = (typeof computeCessionLine === 'function')
                ? computeCessionLine(c)
                : { pvBrute: 0, years: 0, base: 0, taxLine: 0, abattementLabel: '—', detentionTag: '—' };
        } catch (_) {
            line = { pvBrute: 0, years: 0, base: 0, taxLine: 0, abattementLabel: '—', detentionTag: '—' };
        }

        const typeLabel = {
            ACTION_ETF: 'Valeur mobilière',
            CRYPTO: 'Cryptomonnaie',
            JETON: 'Jeton / Médaille',
            COURS_LEGAL: 'Pièce cours légal',
            METAUX_PRECIEUX: 'Lingot / Métal précieux'
        }[c.type] || c.type;

        aoa.push([
            _xlsxFormatDate(c.dateVente),
            _xlsxFormatDate(c.dateAchat),
            typeLabel,
            c.subType || '',
            c.name || '',
            c.envelope ? (ENVELOPPES[c.envelope]?.short || c.envelope) : '',
            c.zone || 'UE',
            _xlsxNum(c.prixVente || 0),
            _xlsxNum(c.prixAchat || 0),
            _xlsxNum(c.frais || 0),
            _xlsxNum(line.pvBrute || 0),
            _xlsxNum(line.years || 0, 2),
            line.detentionTag || '',
            line.abattementLabel || '',
            _xlsxNum(line.base || 0),
            _xlsxNum(line.taxLine || 0)
        ]);
    });

    if (aoa.length === 1) {
        aoa.push(['Aucune cession enregistrée']);
    }

    return {
        aoa,
        colWidths: [12, 12, 18, 12, 30, 12, 8,
                    14, 18, 12, 20, 14, 24, 28, 16, 16]
    };
}

// ---------------------------------------------------------------------
// FEUILLE 5 — ARBITRAGES
// ---------------------------------------------------------------------
function _xlsxBuildArbitragesSheet() {
    const aoa = [];

    aoa.push(['Date', 'Source (vente)', 'Destination (achat)', 'Montant (€)', 'Motif / Stratégie']);

    const sorted = [...arbitrages].sort((a, b) => new Date(b.date) - new Date(a.date));
    sorted.forEach(arb => {
        aoa.push([
            _xlsxFormatDate(arb.date),
            arb.source || '',
            arb.destination || '',
            _xlsxNum(arb.montant || 0),
            arb.motif || ''
        ]);
    });

    if (aoa.length === 1) {
        aoa.push(['Aucun arbitrage enregistré']);
    }

    return {
        aoa,
        colWidths: [12, 32, 32, 14, 48]
    };
}

// ---------------------------------------------------------------------
// POINT D'ENTRÉE
// ---------------------------------------------------------------------
function exportToExcel() {
    // Vérification : SheetJS doit être chargé
    if (typeof XLSX === 'undefined') {
        alert('SheetJS (XLSX) n\'est pas chargé. Vérifiez votre connexion internet et rechargez la page.');
        return;
    }

    // Feedback visuel sur le bouton
    const btn = document.getElementById('btn-export-excel');
    const originalHTML = btn ? btn.innerHTML : null;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Export…';
    }

    // Différé léger pour laisser le navigateur rafraîchir le bouton avant le
    // traitement synchrone (qui peut prendre 100-500 ms sur un gros portefeuille).
    setTimeout(() => {
        try {
            const wb = XLSX.utils.book_new();

            // Feuilles
            const s1 = _xlsxBuildSyntheseSheet();
            _xlsxAddSheet(wb, 'Synthèse', s1.aoa, s1.colWidths);

            const s2 = _xlsxBuildActifsSheet();
            _xlsxAddSheet(wb, 'Actifs', s2.aoa, s2.colWidths);

            const s3 = _xlsxBuildLotsSheet();
            _xlsxAddSheet(wb, 'Lots', s3.aoa, s3.colWidths);

            const s4 = _xlsxBuildCessionsSheet();
            _xlsxAddSheet(wb, 'Cessions', s4.aoa, s4.colWidths);

            const s5 = _xlsxBuildArbitragesSheet();
            _xlsxAddSheet(wb, 'Arbitrages', s5.aoa, s5.colWidths);

            // Nom du fichier
            const portfolioSlug = (currentPortfolio() ? currentPortfolio().name : 'portefeuille')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
            const dateStr = new Date().toISOString().slice(0, 10);
            const filename = `patrimonial_${portfolioSlug || 'export'}_${dateStr}.xlsx`;

            // Déclenche le téléchargement
            XLSX.writeFile(wb, filename);

            // Message de confirmation (léger)
            console.info(`Export Excel réussi : ${filename}`);
        } catch (err) {
            console.error('Export Excel échoué :', err);
            alert('Erreur lors de l\'export Excel : ' + err.message);
        } finally {
            // Restauration du bouton
            if (btn) {
                btn.disabled = false;
                if (originalHTML !== null) btn.innerHTML = originalHTML;
            }
        }
    }, 50);
}