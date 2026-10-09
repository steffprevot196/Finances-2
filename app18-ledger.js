// =====================================================================
// app18-ledger.js — HISTORIQUE UNIFIÉ (LEDGER CHRONOLOGIQUE)
// (Chantier 1.10)
// Dépend de : app1-core.js (assets, cessions, arbitrages, parseFlexDate)
//             app17-tax-optimizer.js (getAssetTaxNature)
// Charge après app17-tax-optimizer.js, avant app7-init.js
// =====================================================================
//
// Rôle : fusionner en une SEULE liste chronologique les 6 sources
// d'événements dispersées dans l'application :
//   • buys[]      → Achats (lots successifs)
//   • cessions[]  → Ventes réalisées
//   • dividends[] → Dividendes / Coupons
//   • splits[]    → Splits / Reverse splits
//   • arbitrages[]→ Arbitrages internes (transferts entre cadrans)
//   • frais       → Frais d'acquisition (extraits des lots)
//
// Cette vue est en LECTURE SEULE : elle agrège les données existantes,
// sans jamais les modifier. Elle permet à l'utilisateur (ou à son
// comptable) de voir la timeline complète de son portefeuille et
// d'exporter un CSV pour la déclaration fiscale ou la tenue de comptes.
//
// Aucune duplication : chaque événement conserve sa source et son id
// d'origine, ce qui permet de tracer ou de naviguer vers l'entité parente.

// ---------------------------------------------------------------------
// TYPES D'ÉVÉNEMENTS
// ---------------------------------------------------------------------
const LEDGER_EVENT_TYPES = {
    ACHAT: {
        label: 'Achat',
        icon: 'fa-cart-shopping',
        color: 'text-emerald-400',
        bg: 'bg-emerald-950/30',
        bd: 'border-emerald-800/50'
    },
    VENTE: {
        label: 'Vente',
        icon: 'fa-hand-holding-dollar',
        color: 'text-rose-400',
        bg: 'bg-rose-950/30',
        bd: 'border-rose-800/50'
    },
    DIVIDENDE: {
        label: 'Dividende',
        icon: 'fa-sack-dollar',
        color: 'text-emerald-400',
        bg: 'bg-emerald-950/30',
        bd: 'border-emerald-800/50'
    },
    COUPON: {
        label: 'Coupon',
        icon: 'fa-landmark',
        color: 'text-teal-400',
        bg: 'bg-teal-950/30',
        bd: 'border-teal-800/50'
    },
    INTERET: {
        label: 'Intérêt',
        icon: 'fa-percent',
        color: 'text-blue-400',
        bg: 'bg-blue-950/30',
        bd: 'border-blue-800/50'
    },
    SPLIT: {
        label: 'Split',
        icon: 'fa-scissors',
        color: 'text-cyan-400',
        bg: 'bg-cyan-950/30',
        bd: 'border-cyan-800/50'
    },
    REVERSE_SPLIT: {
        label: 'Reverse split',
        icon: 'fa-scissors',
        color: 'text-rose-400',
        bg: 'bg-rose-950/30',
        bd: 'border-rose-800/50'
    },
    ARBITRAGE: {
        label: 'Arbitrage',
        icon: 'fa-right-left',
        color: 'text-indigo-400',
        bg: 'bg-indigo-950/30',
        bd: 'border-indigo-800/50'
    },
    FRAIS: {
        label: 'Frais',
        icon: 'fa-receipt',
        color: 'text-amber-400',
        bg: 'bg-amber-950/30',
        bd: 'border-amber-800/50'
    }
};

// ---------------------------------------------------------------------
// CONSTRUCTION DU LEDGER
// ---------------------------------------------------------------------
// Retourne un tableau d'événements triés par date DÉCROISSANTE (le plus
// récent en haut). Chaque événement :
//   { id, kind, date (Date), dateISO, assetId?, assetName?, assetTicker?,
//     amount (€), qty?, unitPrice?, ref?, notes?, source, raw? }
//
// • `amount` : impact cash (négatif = sortie, positif = entrée)
// • `qty`    : variation de quantité (signée)
function buildLedger(options = {}) {
    const includeCessions = options.includeCessions !== false;
    const includeDividends = options.includeDividends !== false;
    const includeSplits = options.includeSplits !== false;
    const includeArbitrages = options.includeArbitrages !== false;
    const includeBuys = options.includeBuys !== false;
    const onlyReal = options.onlyReal !== false;   // exclut le paper trading par défaut

    const events = [];

    // Filtre de base sur les actifs
    const visibleAssets = onlyReal
        ? assets.filter(a => !isPaperAsset(a))
        : assets.slice();

    // --- 1) Achats (depuis buys[]) ---
    if (includeBuys) {
        visibleAssets.forEach(a => {
            (a.buys || []).forEach(b => {
                const d = parseFlexDate(b.date);
                if (!d) return;
                const qty = Number(b.qty) || 0;
                const price = Number(b.price) || 0;
                const frais = Number(b.frais) || 0;
                const total = Number(b.total) || (qty * price + frais);

                // Événement ACHAT
                events.push({
                    id: 'buy_' + a.id + '_' + (b.date || '') + '_' + qty,
                    kind: 'ACHAT',
                    date: d,
                    dateISO: d.toISOString().slice(0, 10),
                    assetId: a.id,
                    assetName: a.name,
                    assetTicker: a.ticker,
                    amount: -total,
                    qty: qty,
                    unitPrice: price,
                    ref: b.reference || '',
                    notes: b.type || '',
                    source: 'buys'
                });

                // Événement FRAIS séparé si > 0
                if (frais > 0) {
                    events.push({
                        id: 'frais_' + a.id + '_' + (b.date || '') + '_' + frais,
                        kind: 'FRAIS',
                        date: d,
                        dateISO: d.toISOString().slice(0, 10),
                        assetId: a.id,
                        assetName: a.name,
                        assetTicker: a.ticker,
                        amount: -frais,
                        qty: 0,
                        unitPrice: 0,
                        ref: b.reference || '',
                        notes: 'Frais d\'acquisition',
                        source: 'buys'
                    });
                }
            });
        });
    }

    // --- 2) Ventes (depuis cessions[]) ---
    if (includeCessions) {
        cessions.forEach(c => {
            const d = parseFlexDate(c.dateVente);
            if (!d) return;
            // Exclut les cessions papier si onlyReal
            if (onlyReal && c.fromPaper) {
                const stillPaper = assets.some(a => a.id === c.fromPaper && isPaperAsset(a));
                if (stillPaper) return;
            }

            const prixVente = Number(c.prixVente) || 0;
            const prixAchat = Number(c.prixAchat) || 0;
            const frais = Number(c.frais) || 0;
            const pnl = prixVente - prixAchat - frais;

            events.push({
                id: 'cession_' + c.id,
                kind: 'VENTE',
                date: d,
                dateISO: d.toISOString().slice(0, 10),
                assetName: c.name,
                assetTicker: '',
                amount: prixVente - frais,
                qty: 0,
                unitPrice: 0,
                ref: c.subType ? `${c.type}/${c.subType}` : c.type,
                notes: `P&L : ${(pnl >= 0 ? '+' : '') + formatEUR(pnl)}`,
                source: 'cessions',
                raw: c
            });
        });
    }

    // --- 3) Dividendes / coupons (depuis dividends[]) ---
    if (includeDividends) {
        visibleAssets.forEach(a => {
            (a.dividends || []).forEach(div => {
                const d = parseFlexDate(div.date);
                if (!d) return;
                const amount = Number(div.amount) || 0;
                const withheld = Number(div.taxWithheld) || 0;
                const net = amount - withheld;

                events.push({
                    id: 'div_' + a.id + '_' + div.id,
                    kind: div.kind || 'DIVIDENDE',
                    date: d,
                    dateISO: d.toISOString().slice(0, 10),
                    assetId: a.id,
                    assetName: a.name,
                    assetTicker: a.ticker,
                    amount: net,
                    qty: 0,
                    unitPrice: 0,
                    ref: div.source || '',
                    notes: withheld > 0
                        ? `Brut ${formatEUR(amount)} − retenue ${formatEUR(withheld)}`
                        : '',
                    source: 'dividends',
                    raw: div
                });
            });
        });
    }

    // --- 4) Splits / Reverse splits (depuis splits[]) ---
    if (includeSplits) {
        visibleAssets.forEach(a => {
            (a.splits || []).forEach(sp => {
                const d = parseFlexDate(sp.date);
                if (!d) return;
                const ratio = Number(sp.ratio) || 1;
                const isSplit = ratio >= 1;
                const label = isSplit
                    ? `${ratio}:1`
                    : `1:${(1 / ratio).toFixed((1 / ratio) >= 10 ? 0 : 2).replace(/\.?0+$/, '')}`;

                events.push({
                    id: 'split_' + a.id + '_' + sp.id,
                    kind: isSplit ? 'SPLIT' : 'REVERSE_SPLIT',
                    date: d,
                    dateISO: d.toISOString().slice(0, 10),
                    assetId: a.id,
                    assetName: a.name,
                    assetTicker: a.ticker,
                    amount: 0,
                    qty: 0,
                    unitPrice: 0,
                    ref: label,
                    notes: sp.note || '',
                    source: 'splits'
                });
            });
        });
    }

    // --- 5) Arbitrages (depuis arbitrages[]) ---
    if (includeArbitrages) {
        arbitrages.forEach(arb => {
            const d = parseFlexDate(arb.date);
            if (!d) return;
            events.push({
                id: 'arb_' + arb.id,
                kind: 'ARBITRAGE',
                date: d,
                dateISO: d.toISOString().slice(0, 10),
                assetName: `${arb.source} → ${arb.destination}`,
                assetTicker: '',
                amount: Number(arb.montant) || 0,
                qty: 0,
                unitPrice: 0,
                ref: '',
                notes: arb.motif || '',
                source: 'arbitrages'
            });
        });
    }

    // Tri décroissant : le plus récent en haut
    events.sort((a, b) => b.date - a.date);
    return events;
}

// ---------------------------------------------------------------------
// STATISTIQUES RAPIDES
// ---------------------------------------------------------------------
// Renvoie { count, firstDate, lastDate, totalIn, totalOut, byKind }.
function computeLedgerStats(events) {
    if (!events || !events.length) {
        return { count: 0, firstDate: null, lastDate: null, totalIn: 0, totalOut: 0, byKind: {} };
    }
    let totalIn = 0, totalOut = 0;
    const byKind = {};

    events.forEach(e => {
        if (e.amount > 0) totalIn += e.amount;
        else if (e.amount < 0) totalOut += Math.abs(e.amount);
        byKind[e.kind] = (byKind[e.kind] || 0) + 1;
    });

    return {
        count: events.length,
        firstDate: events[events.length - 1].date,
        lastDate: events[0].date,
        totalIn,
        totalOut,
        byKind
    };
}

// ---------------------------------------------------------------------
// FILTRAGE
// ---------------------------------------------------------------------
// Renvoie une liste filtrée selon :
//   • kind      : 'ALL' ou un code de LEDGER_EVENT_TYPES
//   • year      : null (toutes années) ou une année (ex : 2025)
//   • query     : recherche libre (nom, ticker, note, ref)
//   • pool      : 'ALL' | 'TITRES' | 'CRYPTO' | 'AUTRE' (filtre fiscal)
function filterLedger(events, options = {}) {
    const { kind = 'ALL', year = null, query = '', pool = 'ALL' } = options;
    const q = (query || '').toLowerCase().trim();

    return events.filter(e => {
        if (kind !== 'ALL' && e.kind !== kind) return false;
        if (year && e.date.getFullYear() !== year) return false;
        if (pool !== 'ALL') {
            // Détermine le pool fiscal de l'événement
            let evPool = 'AUTRE';
            if (e.assetId) {
                const a = assets.find(x => x.id === e.assetId);
                if (a && typeof getAssetTaxNature === 'function') {
                    evPool = getAssetTaxNature(a) || 'AUTRE';
                }
            } else if (e.kind === 'VENTE' && e.raw && e.raw.type === 'CRYPTO') {
                evPool = 'CRYPTO';
            } else if (e.kind === 'VENTE' && e.raw && e.raw.type === 'ACTION_ETF') {
                evPool = 'TITRES';
            }
            if (evPool !== pool) return false;
        }
        if (q) {
            const haystack = [
                e.assetName || '',
                e.assetTicker || '',
                e.notes || '',
                e.ref || '',
                e.kind
            ].join(' ').toLowerCase();
            if (!haystack.includes(q)) return false;
        }
        return true;
    });
}

// ---------------------------------------------------------------------
// EXPORT CSV
// ---------------------------------------------------------------------
// Format : séparateur ';' (Excel FR), décimales ',', BOM UTF-8 pour Excel.
// Renvoie une string CSV prête à télécharger.
function ledgerToCSV(events) {
    const csvCell = (s) => {
        let str = String(s == null ? '' : s);
        if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
        return /[";\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const fmtNum = (v, d = 2) => Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '';

    const rows = [];
    rows.push([
        'Date', 'Type', 'Actif', 'Ticker', 'Quantité', 'Prix unitaire (€)',
        'Flux (€)', 'Référence', 'Notes', 'Source'
    ].join(';'));

    events.forEach(e => {
        const typeLabel = (LEDGER_EVENT_TYPES[e.kind] || {}).label || e.kind;
        rows.push([
            csvCell(e.date.toLocaleDateString('fr-FR')),
            csvCell(typeLabel),
            csvCell(e.assetName || ''),
            csvCell(e.assetTicker || ''),
            e.qty ? fmtNum(e.qty, 8) : '',
            e.unitPrice ? fmtNum(e.unitPrice, 4) : '',
            fmtNum(e.amount, 2),
            csvCell(e.ref || ''),
            csvCell(e.notes || ''),
            csvCell(e.source || '')
        ].join(';'));
    });

    return '\uFEFF' + rows.join('\r\n');
}

function downloadLedgerCSV(events) {
    const csv = ledgerToCSV(events);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `patrimonial_ledger_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// =====================================================================
// ÉTAT UI
// =====================================================================
let ledgerKindFilter = 'ALL';
let ledgerCurrentEvents = [];   // liste filtrée courante (pour l'export)

// =====================================================================
// RENDU PRINCIPAL
// =====================================================================
function renderLedgerTab() {
    // Chantier §3 — si la vue timeline est active, on délègue le rendu à
    // app30-timeline.js, qui consomme les mêmes filtres (recherche, année,
    // pool, kind). Cela évite de dupliquer la logique de filtrage.
    if (typeof _timelineViewActive !== 'undefined' && _timelineViewActive &&
        typeof renderTimelineView === 'function') {
        renderTimelineView();
        return;
    }

    // 1) Construit le ledger complet (déjà trié par date desc)
    const allEvents = buildLedger();

    // 2) Récupère les valeurs des filtres
    const searchEl = document.getElementById('ledger-search');
    const yearEl = document.getElementById('ledger-year');
    const poolEl = document.getElementById('ledger-pool');

    const query = searchEl ? searchEl.value : '';
    const year = yearEl && yearEl.value ? parseInt(yearEl.value) : null;
    const pool = poolEl ? poolEl.value : 'ALL';

    // 3) Peuple le sélecteur d'années (une seule fois, si vide)
    if (yearEl && yearEl.options.length <= 1 && allEvents.length) {
        const yearsSet = new Set(allEvents.map(e => e.date.getFullYear()));
        const currentVal = yearEl.value;
        yearEl.innerHTML = '<option value="">Toutes les années</option>' +
            [...yearsSet].sort((a, b) => b - a)
                .map(y => `<option value="${y}">Année ${y}</option>`).join('');
        yearEl.value = currentVal;
    }

    // 4) Applique les filtres
    const filtered = filterLedger(allEvents, {
        kind: ledgerKindFilter,
        year,
        query,
        pool
    });
    ledgerCurrentEvents = filtered;

    // 5) Statistiques (sur le ledger COMPLET, pas filtré — pour donner la vue globale)
    const stats = computeLedgerStats(allEvents);

    const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
    setText('ledger-stat-count', stats.count);

    const periodEl = document.getElementById('ledger-stat-period');
    if (periodEl) {
        if (stats.firstDate && stats.lastDate) {
            const fmt = d => d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
            periodEl.innerText = `du ${fmt(stats.firstDate)} au ${fmt(stats.lastDate)}`;
        } else {
            periodEl.innerText = '—';
        }
    }

    countUp(document.getElementById('ledger-stat-in'),  stats.totalIn,  formatEUR);
    countUp(document.getElementById('ledger-stat-out'), stats.totalOut, formatEUR);

    const netEl = document.getElementById('ledger-stat-net');
    if (netEl) {
        const net = stats.totalIn - stats.totalOut;
        countUp(netEl, net, fmtSignedEUR);
        netEl.className = `text-lg font-bold font-mono ${net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }
    setText('ledger-stat-net-detail', `entrées − sorties`);

    // 6) Bandeau des filtres actifs
    document.querySelectorAll('.ledger-kind-btn').forEach(btn => {
        const isActive = btn.dataset.kind === ledgerKindFilter;
        btn.classList.toggle('bg-gray-800', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('border-gray-700', isActive);
        btn.classList.toggle('font-medium', isActive);
        btn.classList.toggle('bg-gray-900', !isActive);
        btn.classList.toggle('text-gray-400', !isActive);
        btn.classList.toggle('border-gray-800', !isActive);
    });

    setText('ledger-filtered-count', `${filtered.length} événement(s) affiché(s)`);

    // 7) Tableau
    const tbody = document.getElementById('table-ledger-body');
    const empty = document.getElementById('ledger-empty');
    if (!tbody) return;

    if (!filtered.length) {
        tbody.innerHTML = '';
        if (empty) empty.classList.remove('hidden');
        return;
    }
    if (empty) empty.classList.add('hidden');

    tbody.innerHTML = filtered.map(e => {
        const meta = LEDGER_EVENT_TYPES[e.kind] || LEDGER_EVENT_TYPES.ACHAT;
        const dateTxt = e.date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const amountCls = e.amount > 0 ? 'text-emerald-400' : (e.amount < 0 ? 'text-rose-400' : 'text-gray-500');
        const amountTxt = e.amount !== 0
            ? (e.amount > 0 ? '+' : '') + formatEUR(e.amount)
            : '—';

        const qtyTxt = e.qty ? fmtQty(e.qty) : '—';
        const priceTxt = e.unitPrice ? formatUnitPrice(e.unitPrice) : '—';

        // Sous-titre actif : ticker si présent
        const assetTicker = e.assetTicker
            ? `<span class="text-[10px] text-gray-500 ml-1">${escapeHTML(e.assetTicker)}</span>`
            : '';

        return `<tr class="hover:bg-gray-800/40 transition">
            <td class="p-3 whitespace-nowrap text-gray-400">${dateTxt}</td>
            <td class="p-3 whitespace-nowrap">
                <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-bold ${meta.bg} ${meta.color} ${meta.bd}">
                    <i class="fa-solid ${meta.icon} text-[9px]"></i> ${meta.label}
                </span>
            </td>
            <td class="p-3 max-w-[260px]">
                <div class="truncate text-white font-bold text-[11px]" title="${escapeHTML(e.assetName || '')}">
                    ${escapeHTML(e.assetName || '—')}${assetTicker}
                </div>
            </td>
            <td class="p-3 text-right text-gray-400">${qtyTxt}</td>
            <td class="p-3 text-right text-gray-400">${priceTxt}</td>
            <td class="p-3 text-right font-bold ${amountCls}">${amountTxt}</td>
            <td class="p-3 text-gray-500 truncate max-w-[140px]" title="${escapeHTML(e.ref || '')}">${escapeHTML(e.ref) || '—'}</td>
            <td class="p-3 text-gray-500 text-[10px] truncate max-w-[220px]" title="${escapeHTML(e.notes || '')}">${escapeHTML(e.notes) || '—'}</td>
        </tr>`;
    }).join('');
}

// Change le filtre de type et relance le rendu
function filterLedgerByKind(kind) {
    ledgerKindFilter = kind;
    renderLedgerTab();
}

// Exporte le ledger FILTRÉ courant en CSV
function downloadCurrentLedgerCSV() {
    const events = ledgerCurrentEvents.length ? ledgerCurrentEvents : buildLedger();
    if (!events.length) {
        alert('Aucun événement à exporter.');
        return;
    }
    downloadLedgerCSV(events);
}

// =====================================================================
// INITIALISATION
// =====================================================================
function initLedgerModule() {
    // Aucun chargement asynchrone nécessaire : le ledger est reconstruit
    // à la volée à partir des données déjà en mémoire.
    // Le sélecteur d'années est peuplé au premier rendu de l'onglet.
}