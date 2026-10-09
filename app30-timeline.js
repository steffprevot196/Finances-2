// =====================================================================
// app30-timeline.js — VUE TIMELINE VISUELLE (Chantier §3)
// Dépend de : app18-ledger.js (buildLedger, filterLedger, LEDGER_EVENT_TYPES)
//             app22-toasts.js (toasts)
//             app20-chart-export.js (pour export PNG éventuel)
// Charge après app29-benchmark-compare.js, avant tests.js
// =====================================================================
//
// Affiche le ledger sous forme de timeline verticale type « git log » :
//   • Ligne verticale continue à gauche
//   • Pastille colorée par type d'événement (icône du type)
//   • Bloc à droite avec date + libellé + détails
//   • Groupement par jour / mois / année (toggle)
//   • Filtres rapides réutilisant ceux de l'onglet Historique
//
// Aucune duplication de données : la timeline consomme le ledger via
// buildLedger() + filterLedger() — les mêmes fonctions que la vue tableau.
// Les changements de filtre (recherche, année, pool fiscal, type) sont
// donc synchrones entre les deux vues.

// ---------------------------------------------------------------------
// ÉTAT
// ---------------------------------------------------------------------
let _timelineViewActive = false;      // false = tableau, true = timeline
let _timelineGroupBy = 'month';       // 'day' | 'month' | 'year'
let _timelineLastEvents = [];         // cache des derniers événements filtrés

// ---------------------------------------------------------------------
// HELPERS DE GROUPEMENT
// ---------------------------------------------------------------------
// Retourne { key, label } pour grouper un événement selon le mode.
//   key   : clé unique de regroupement (pour détecter les changements)
//   label : libellé humain (« Mars 2024 », « 15 mars 2024 », « 2024 »)
function _timelineGroup(date, groupBy) {
    const d = date;
    const y = d.getFullYear();
    const m = d.getMonth();       // 0-11
    const day = d.getDate();

    const moisFR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

    if (groupBy === 'day') {
        return {
            key: `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`,
            label: `${day} ${moisFR[m].toLowerCase()} ${y}`
        };
    }
    if (groupBy === 'year') {
        return { key: String(y), label: String(y) };
    }
    // 'month' par défaut
    return {
        key: `${y}-${String(m+1).padStart(2,'0')}`,
        label: `${moisFR[m]} ${y}`
    };
}

// ---------------------------------------------------------------------
// RENDU — BLOC D'UN ÉVÉNEMENT
// ---------------------------------------------------------------------
// Chaque événement produit un bloc HTML avec :
//   • Pastille à gauche (pastille + icône du type)
//   • Bloc central : libellé, détails, montant
function _timelineEventHTML(e, isLast) {
    const meta = (typeof LEDGER_EVENT_TYPES !== 'undefined' && LEDGER_EVENT_TYPES[e.kind])
        ? LEDGER_EVENT_TYPES[e.kind]
        : { label: e.kind, icon: 'fa-circle', color: 'text-gray-400', bg: 'bg-gray-800', bd: 'border-gray-700' };

    const dateStr = e.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = e.date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    // Montant formaté (avec signe et couleur)
    const amountCls = e.amount > 0 ? 'text-emerald-400' : (e.amount < 0 ? 'text-rose-400' : 'text-gray-500');
    const amountTxt = e.amount !== 0
        ? (e.amount > 0 ? '+' : '') + formatEUR(e.amount)
        : '';

    // Titre principal : nom de l'actif ou source/destination
    const primaryTxt = e.assetName || '—';
    const tickerTxt = e.assetTicker ? `<span class="text-[10px] text-gray-500 font-mono ml-1">${escapeHTML(e.assetTicker)}</span>` : '';

    // Détails secondaires (quantité, prix unitaire, référence, notes)
    const details = [];
    if (e.qty && e.qty !== 0)        details.push(`${fmtQty(e.qty)} unité(s)`);
    if (e.unitPrice && e.unitPrice > 0) details.push(`@ ${formatUnitPrice(e.unitPrice)}`);
    if (e.ref)                       details.push(escapeHTML(e.ref));
    const detailsHTML = details.length
        ? `<div class="text-[10px] text-gray-500 font-mono mt-0.5">${details.join(' · ')}</div>`
        : '';

    const notesHTML = e.notes
        ? `<div class="text-[10px] text-gray-400 italic mt-1 truncate" title="${escapeHTML(e.notes)}">${escapeHTML(e.notes)}</div>`
        : '';

    return `
        <div class="relative flex items-start gap-3 pb-4 group">
            <!-- Pastille + ligne verticale -->
            <div class="flex flex-col items-center flex-shrink-0 relative">
                <div class="w-9 h-9 rounded-full ${meta.bg} border-2 ${meta.bd} flex items-center justify-center ${meta.color} z-10 bg-gray-950 shadow-lg">
                    <i class="fa-solid ${meta.icon} text-[11px]"></i>
                </div>
                ${!isLast ? '<div class="absolute top-9 bottom-0 w-0.5 bg-gray-800" style="left: 50%; transform: translateX(-50%);"></div>' : ''}
            </div>

            <!-- Contenu -->
            <div class="flex-1 min-w-0 bg-gray-950/60 border border-gray-800 rounded-lg p-3 hover:border-gray-700 transition">
                <div class="flex justify-between items-start gap-2 flex-wrap">
                    <div class="flex items-center gap-1.5 flex-wrap min-w-0">
                        <span class="px-1.5 py-0.5 rounded border text-[9px] font-bold ${meta.bg} ${meta.color} ${meta.bd}">
                            ${escapeHTML(meta.label)}
                        </span>
                        <span class="text-[11px] text-gray-400 font-mono">${dateStr}</span>
                        <span class="text-[10px] text-gray-600 font-mono">${timeStr}</span>
                    </div>
                    ${amountTxt ? `<div class="text-sm font-bold font-mono ${amountCls} whitespace-nowrap">${amountTxt}</div>` : ''}
                </div>
                <div class="mt-1.5 min-w-0">
                    <div class="font-bold text-white text-[12px] truncate" title="${escapeHTML(primaryTxt)}">${escapeHTML(primaryTxt)}${tickerTxt}</div>
                    ${detailsHTML}
                    ${notesHTML}
                </div>
            </div>
        </div>
    `;
}

// ---------------------------------------------------------------------
// RENDU — BLOC D'UN GROUPE (jour/mois/année)
// ---------------------------------------------------------------------
function _timelineGroupHeaderHTML(label, count) {
    return `
        <div class="flex items-center gap-2 mt-2 mb-3 sticky top-0 z-20 bg-gray-900/95 backdrop-blur-sm py-1.5 -mx-2 px-2 rounded-md">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span class="text-[12px] font-bold text-white uppercase tracking-wider">${escapeHTML(label)}</span>
            <span class="text-[10px] text-gray-500 font-mono">${count} événement(s)</span>
            <div class="flex-1 h-px bg-gray-800"></div>
        </div>
    `;
}

// ---------------------------------------------------------------------
// RENDU PRINCIPAL
// ---------------------------------------------------------------------
function renderTimelineView() {
    const container = document.getElementById('timeline-container');
    if (!container) return;

    // Récupère les filtres depuis l'onglet Historique (réutilise l'état UI)
    const searchEl = document.getElementById('ledger-search');
    const yearEl = document.getElementById('ledger-year');
    const poolEl = document.getElementById('ledger-pool');
    const query = searchEl ? searchEl.value : '';
    const year = yearEl && yearEl.value ? parseInt(yearEl.value) : null;
    const pool = poolEl ? poolEl.value : 'ALL';
    const kind = (typeof ledgerKindFilter !== 'undefined') ? ledgerKindFilter : 'ALL';

    // Construit le ledger (déjà trié par date décroissante)
    const allEvents = (typeof buildLedger === 'function') ? buildLedger() : [];

    // Applique les filtres
    const filtered = (typeof filterLedger === 'function')
        ? filterLedger(allEvents, { kind, year, query, pool })
        : allEvents;

    _timelineLastEvents = filtered;

    // Cas vide
    if (!filtered.length) {
        container.innerHTML = `
            <div class="p-8 text-center text-gray-500 text-xs italic">
                <i class="fa-solid fa-inbox text-3xl text-gray-700 mb-2 block"></i>
                Aucun événement ne correspond aux filtres sélectionnés.
            </div>
        `;
        return;
    }

    // Groupe les événements
    const groups = [];
    let currentGroup = null;

    filtered.forEach(e => {
        const g = _timelineGroup(e.date, _timelineGroupBy);
        if (!currentGroup || currentGroup.key !== g.key) {
            currentGroup = { key: g.key, label: g.label, events: [] };
            groups.push(currentGroup);
        }
        currentGroup.events.push(e);
    });

    // Compteur total
    const summary = `
        <div class="flex items-center justify-between mb-4 pb-3 border-b border-gray-800">
            <div class="text-[11px] text-gray-500">
                <i class="fa-solid fa-stream text-emerald-400 mr-1.5"></i>
                <b class="text-white">${filtered.length}</b> événement(s) affiché(s) sur
                <b class="text-gray-300">${allEvents.length}</b> au total
            </div>
            <div class="flex items-center gap-1.5">
                <span class="text-[10px] text-gray-500 uppercase tracking-wider">Grouper par :</span>
                <div class="flex rounded-lg bg-gray-950 border border-gray-800 p-0.5 text-[10px]">
                    <button onclick="setTimelineGroupBy('day')"   class="timeline-group-btn px-2 py-1 rounded transition ${_timelineGroupBy === 'day' ? 'bg-emerald-950 text-emerald-300' : 'text-gray-400 hover:text-white'}">Jour</button>
                    <button onclick="setTimelineGroupBy('month')" class="timeline-group-btn px-2 py-1 rounded transition ${_timelineGroupBy === 'month' ? 'bg-emerald-950 text-emerald-300' : 'text-gray-400 hover:text-white'}">Mois</button>
                    <button onclick="setTimelineGroupBy('year')"  class="timeline-group-btn px-2 py-1 rounded transition ${_timelineGroupBy === 'year' ? 'bg-emerald-950 text-emerald-300' : 'text-gray-400 hover:text-white'}">Année</button>
                </div>
            </div>
        </div>
    `;

    // Construit les blocs
    let blocksHTML = '';
    groups.forEach((grp, gi) => {
        blocksHTML += _timelineGroupHeaderHTML(grp.label, grp.events.length);
        grp.events.forEach((e, ei) => {
            const isLast = (gi === groups.length - 1) && (ei === grp.events.length - 1);
            blocksHTML += _timelineEventHTML(e, isLast);
        });
    });

    container.innerHTML = summary + blocksHTML;
}

// Change le mode de groupement
function setTimelineGroupBy(mode) {
    if (mode !== 'day' && mode !== 'month' && mode !== 'year') return;
    _timelineGroupBy = mode;
    renderTimelineView();
}

// ---------------------------------------------------------------------
// TOGGLE VUE TABLEAU / TIMELINE
// ---------------------------------------------------------------------
function setLedgerView(view) {
    const tableView = document.getElementById('ledger-view-table');
    const timelineView = document.getElementById('ledger-view-timeline');
    const btnTable = document.getElementById('ledger-view-btn-table');
    const btnTimeline = document.getElementById('ledger-view-btn-timeline');
    if (!tableView || !timelineView) return;

    if (view === 'timeline') {
        _timelineViewActive = true;
        tableView.classList.add('hidden');
        timelineView.classList.remove('hidden');
        renderTimelineView();
    } else {
        _timelineViewActive = false;
        tableView.classList.remove('hidden');
        timelineView.classList.add('hidden');
    }

    // Met à jour l'apparence des boutons
    const activeCls = 'bg-emerald-950 text-emerald-300';
    const inactiveCls = 'text-gray-400 hover:text-white';
    if (btnTable && btnTimeline) {
        btnTable.className = `px-2.5 py-1 rounded transition ${view === 'timeline' ? inactiveCls : activeCls}`;
        btnTimeline.className = `px-2.5 py-1 rounded transition ${view === 'timeline' ? activeCls : inactiveCls}`;
    }
}

// ---------------------------------------------------------------------
// HOOK : resynchronise la timeline quand les filtres du tableau changent
// ---------------------------------------------------------------------
// Les inputs de filtre déclenchent renderLedgerTab() dans app18-ledger.js.
// On ajoute un listener pour re-rendre la timeline si elle est active.
function _attachTimelineFilterSync() {
    ['ledger-search', 'ledger-year', 'ledger-pool'].forEach(id => {
        const el = document.getElementById(id);
        if (!el || el._timelineHooked) return;
        const evt = (id === 'ledger-search') ? 'input' : 'change';
        el.addEventListener(evt, () => {
            if (_timelineViewActive) {
                // Différé léger : laisse le tableau se mettre à jour d'abord
                setTimeout(renderTimelineView, 30);
            }
        });
        el._timelineHooked = true;
    });
}

// Hook sur filterLedgerByKind (app18-ledger.js) : quand on clique sur un
// bouton de filtre par type, resynchronise la timeline.
(function _hookFilterLedgerByKind() {
    const orig = window.filterLedgerByKind;
    if (typeof orig !== 'function') return;
    if (orig._timelineHooked) return;
    const wrapped = function (...args) {
        const r = orig.apply(this, args);
        if (_timelineViewActive) setTimeout(renderTimelineView, 30);
        return r;
    };
    wrapped._timelineHooked = true;
    wrapped._originalFn = orig;
    window.filterLedgerByKind = wrapped;
})();

// ---------------------------------------------------------------------
// INITIALISATION
// ---------------------------------------------------------------------
function initTimelineModule() {
    _attachTimelineFilterSync();
    console.info('[Timeline] Module chargé — vue timeline disponible dans l\'onglet Historique.');
}

// Expose l'API globalement
window.renderTimelineView = renderTimelineView;
window.setTimelineGroupBy = setTimelineGroupBy;
window.setLedgerView = setLedgerView;