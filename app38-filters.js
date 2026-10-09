// =====================================================================
// app38-filters.js — FILTRES SAUVEGARDÉS + RECHERCHE GLOBALE Ctrl+P
// (Chantier §9)
// Dépend de : app1-core.js (assets, ASSET_TAGS, ENVELOPPES)
// Charge après app37-slide-panel.js, avant tests.js
// =====================================================================
//
// DEUX FONCTIONNALITÉS :
//
//   1. FILTRES SAUVEGARDÉS
//      L'utilisateur peut sauvegarder un jeu de critères (catégorie,
//      recherche texte, plage de valeurs, tags, enveloppes…) sous un nom
//      (« Mes ETF > 1000 € », « Crypto actives », « Positions PEA »…) et
//      le rappeler d'un clic.
//
//   2. RECHERCHE GLOBALE Ctrl+P
//      Palette ultra-rapide (plus légère que Ctrl+K) qui ne cherche que
//      parmi les actifs. Priorité : ticker exact > début de ticker >
//      début de nom > contient.
//
// STOCKAGE :
//   patriMonial_savedFilters : [{ id, name, criteria, createdAt, applyCount }]
// =====================================================================

const SAVED_FILTERS_KEY = 'patriMonial_savedFilters';
const SAVED_FILTERS_MAX = 30;
const QUICK_SEARCH_MAX_RESULTS = 50;

let _savedFiltersCache = null;
let _quickSearchSelectedIndex = 0;
let _quickSearchResults = [];

// ---------------------------------------------------------------------
// STOCKAGE
// ---------------------------------------------------------------------
function loadSavedFilters() {
    if (_savedFiltersCache) return _savedFiltersCache;
    try {
        const raw = localStorage.getItem(SAVED_FILTERS_KEY);
        if (raw) {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) {
                _savedFiltersCache = list.filter(f => f && f.id && f.name);
                return _savedFiltersCache;
            }
        }
    } catch (_) {}
    _savedFiltersCache = [];
    return _savedFiltersCache;
}

function saveSavedFilters(list) {
    _savedFiltersCache = list;
    try {
        localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(list));
    } catch (err) {
        console.warn('[SavedFilters] Sauvegarde impossible :', err);
    }
}

// ---------------------------------------------------------------------
// CAPTURE DU FILTRE COURANT
// ---------------------------------------------------------------------
// Lit l'état actuel de l'UI (champ recherche, filtres actifs) et le
// transforme en objet `criteria` réutilisable.
function captureCurrentFilterCriteria() {
    const searchEl = document.getElementById('inventory-search');
    const thresholdEl = document.getElementById('inventory-threshold-input');

    return {
        search: searchEl ? (searchEl.value || '') : '',
        category: (typeof inventoryFilter !== 'undefined') ? inventoryFilter : 'ALL',
        horsCategory: (typeof horsGaveFilter !== 'undefined') ? horsGaveFilter : 'ALL',
        tags: [],             // Extension future : filtre multi-tag
        minValue: 0,          // Extension future : plage de valeurs
        maxValue: 0,
        envelope: '',         // Extension future : filtre par enveloppe
        sortKey: '',          // Extension future : tri sauvegardé
        threshold: thresholdEl ? (parseFloat(thresholdEl.value) || 25) : 25
    };
}

// ---------------------------------------------------------------------
// APPLICATION D'UN FILTRE SAUVEGARDÉ
// ---------------------------------------------------------------------
function applySavedFilter(filterId) {
    const filters = loadSavedFilters();
    const f = filters.find(x => x.id === filterId);
    if (!f) return false;

    const c = f.criteria || {};

    // 1) Restaure la recherche
    const searchEl = document.getElementById('inventory-search');
    if (searchEl && typeof c.search === 'string') {
        searchEl.value = c.search;
    }

    // 2) Restaure le filtre catégorie (via filterCategory qui met à jour l'UI)
    if (c.category && typeof filterCategory === 'function') {
        filterCategory(c.category);
    }

    // 3) Restaure le seuil de concentration
    const thresholdEl = document.getElementById('inventory-threshold-input');
    if (thresholdEl && Number.isFinite(c.threshold) && c.threshold > 0) {
        thresholdEl.value = c.threshold;
        if (typeof saveConcentrationThreshold === 'function') {
            saveConcentrationThreshold(c.threshold);
        }
    }

    // 4) Re-render
    if (typeof renderInventoryTable === 'function') {
        renderInventoryTable();
    }

    // 5) Incrémente le compteur d'utilisation
    f.applyCount = (f.applyCount || 0) + 1;
    f.lastAppliedAt = Date.now();
    saveSavedFilters(filters);

    // 6) Switch sur l'onglet Inventaire
    if (typeof switchTab === 'function') {
        switchTab('tab-inventaire');
    }

    if (typeof toastInfo === 'function') {
        toastInfo(`Filtre « ${f.name} » appliqué`, `${f.applyCount}ᵉ utilisation`);
    }

    return true;
}

// ---------------------------------------------------------------------
// CRUD FILTRES
// ---------------------------------------------------------------------
function createSavedFilter(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;

    const filters = loadSavedFilters();
    if (filters.length >= SAVED_FILTERS_MAX) {
        alert(`Limite atteinte (${SAVED_FILTERS_MAX} filtres). Supprimez-en avant d'en créer de nouveaux.`);
        return null;
    }

    const id = 'flt_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const newFilter = {
        id,
        name: trimmed,
        criteria: captureCurrentFilterCriteria(),
        createdAt: Date.now(),
        applyCount: 0
    };
    filters.push(newFilter);
    saveSavedFilters(filters);
    return id;
}

function deleteSavedFilter(filterId) {
    const filters = loadSavedFilters();
    const f = filters.find(x => x.id === filterId);
    if (!f) return;
    if (!confirm(`Supprimer le filtre « ${f.name} » ?`)) return;
    saveSavedFilters(filters.filter(x => x.id !== filterId));
    renderSavedFiltersMenu();
    if (typeof toastInfo === 'function') {
        toastInfo('Filtre supprimé', f.name);
    }
}

function renameSavedFilter(filterId, newName) {
    const filters = loadSavedFilters();
    const f = filters.find(x => x.id === filterId);
    if (!f) return;
    const trimmed = (newName || '').trim();
    if (!trimmed || trimmed === f.name) return;
    f.name = trimmed;
    saveSavedFilters(filters);
    renderSavedFiltersMenu();
}

function overwriteSavedFilter(filterId) {
    const filters = loadSavedFilters();
    const f = filters.find(x => x.id === filterId);
    if (!f) return;
    f.criteria = captureCurrentFilterCriteria();
    f.updatedAt = Date.now();
    saveSavedFilters(filters);
    renderSavedFiltersMenu();
    if (typeof toastSuccess === 'function') {
        toastSuccess('Filtre mis à jour', f.name);
    }
}

// ---------------------------------------------------------------------
// UI — Bouton "Filtres sauvegardés" + menu déroulant
// ---------------------------------------------------------------------
function renderSavedFiltersMenu() {
    const menu = document.getElementById('saved-filters-menu-list');
    if (!menu) return;

    const filters = loadSavedFilters();
    if (!filters.length) {
        menu.innerHTML = `<div class="p-3 text-[11px] text-gray-500 italic text-center">Aucun filtre sauvegardé.</div>`;
        return;
    }

    // Tri par dernière utilisation (les plus utilisés en haut)
    const sorted = [...filters].sort((a, b) => {
        const lastA = a.lastAppliedAt || 0;
        const lastB = b.lastAppliedAt || 0;
        if (lastA !== lastB) return lastB - lastA;
        return (b.applyCount || 0) - (a.applyCount || 0);
    });

    menu.innerHTML = sorted.map(f => {
        const count = f.applyCount || 0;
        return `
            <div class="flex items-center justify-between border-b border-gray-800/60 last:border-b-0 hover:bg-gray-800/40 transition group">
                <button onclick="applySavedFilter('${f.id}'); closeSavedFiltersMenu();"
                        class="flex-1 text-left min-w-0 flex items-center gap-2 p-2.5">
                    <i class="fa-solid fa-filter text-teal-400 text-[10px] flex-shrink-0"></i>
                    <span class="min-w-0 flex-1">
                        <span class="block text-xs font-medium text-gray-200 truncate">${escapeHTML(f.name)}</span>
                        <span class="block text-[10px] text-gray-500 font-mono">
                            ${count} utilisation${count > 1 ? 's' : ''}
                            ${f.criteria && f.criteria.category && f.criteria.category !== 'ALL' ? ' · ' + escapeHTML(f.criteria.category) : ''}
                            ${f.criteria && f.criteria.search ? ' · « ' + escapeHTML(f.criteria.search) + ' »' : ''}
                        </span>
                    </span>
                </button>
                <div class="flex gap-0.5 flex-shrink-0 pr-1.5 opacity-0 group-hover:opacity-100 transition">
                    <button onclick="event.stopPropagation(); renameSavedFilterUI('${f.id}')"
                            class="p-1.5 text-gray-500 hover:text-indigo-400 transition" title="Renommer">
                        <i class="fa-solid fa-pen text-[10px]"></i>
                    </button>
                    <button onclick="event.stopPropagation(); overwriteSavedFilter('${f.id}')"
                            class="p-1.5 text-gray-500 hover:text-teal-400 transition" title="Écraser par les filtres actuels">
                        <i class="fa-solid fa-floppy-disk text-[10px]"></i>
                    </button>
                    <button onclick="event.stopPropagation(); deleteSavedFilter('${f.id}')"
                            class="p-1.5 text-gray-500 hover:text-rose-400 transition" title="Supprimer">
                        <i class="fa-solid fa-trash text-[10px]"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renameSavedFilterUI(filterId) {
    const filters = loadSavedFilters();
    const f = filters.find(x => x.id === filterId);
    if (!f) return;
    const name = prompt('Nouveau nom du filtre :', f.name);
    if (!name || !name.trim() || name.trim() === f.name) return;
    renameSavedFilter(filterId, name);
}

function toggleSavedFiltersMenu(evt) {
    if (evt) evt.stopPropagation();
    const menu = document.getElementById('saved-filters-menu');
    if (!menu) return;
    if (menu.classList.contains('hidden')) {
        renderSavedFiltersMenu();
        menu.classList.remove('hidden');
    } else {
        menu.classList.add('hidden');
    }
}

function closeSavedFiltersMenu() {
    const menu = document.getElementById('saved-filters-menu');
    if (menu) menu.classList.add('hidden');
}

// Prompt pour créer un filtre à partir de l'état courant
function promptCreateSavedFilter() {
    const current = captureCurrentFilterCriteria();
    const summary = [];
    if (current.category && current.category !== 'ALL') summary.push('catégorie = ' + current.category);
    if (current.search) summary.push('recherche = « ' + current.search + ' »');
    if (current.threshold) summary.push('seuil = ' + current.threshold + ' %');

    const preview = summary.length ? summary.join('\n• ') : 'aucun filtre actif';

    const name = prompt(
        `Nom du filtre à sauvegarder ?\n\nCritères capturés :\n• ${preview}\n`,
        'Mon filtre'
    );
    if (!name || !name.trim()) return;

    const id = createSavedFilter(name);
    if (id) {
        renderSavedFiltersMenu();
        // Invalide la palette de commandes pour qu'elle reflète le nouveau filtre
        if (typeof _cmdPaletteResults !== 'undefined') {
            // Réinitialise la sélection pour ne pas pointer sur un index obsolète
            if (typeof _cmdPaletteSelectedIndex !== 'undefined') {
                _cmdPaletteSelectedIndex = 0;
            }
        }
        if (typeof toastSuccess === 'function') {
            toastSuccess('Filtre sauvegardé', name + ' — accessible via Ctrl+K ou le menu Filtres.');
        }
    }
}

// ---------------------------------------------------------------------
// RECHERCHE GLOBALE Ctrl+P (palette rapide actifs uniquement)
// ---------------------------------------------------------------------
// Score de pertinence : plus haut = plus pertinent.
//   1000+ : ticker exact
//   800+  : ticker commence par la query
//   600+  : nom commence par la query
//   400+  : nom contient la query
//   200+  : ticker contient la query
//   0     : pas de match
function _quickSearchScore(query, asset) {
    if (!query) return 1;
    const q = query.toLowerCase();
    const name = (asset.name || '').toLowerCase();
    const ticker = (asset.ticker || '').toLowerCase();

    if (ticker === q) return 1000;
    if (ticker.startsWith(q)) return 800 + (100 - ticker.length);
    if (name.startsWith(q)) return 600 + (100 - name.length);
    if (name.includes(q)) return 400;
    if (ticker.includes(q)) return 200;
    return 0;
}

function _buildQuickSearchResults(query) {
    const realAssets = assets;   // Inclut le paper trading, l'utilisateur peut chercher n'importe quoi
    if (!query) {
        // Pas de query : affiche les 10 actifs les plus valorisés
        return realAssets
            .slice()
            .sort((a, b) => (b.value || 0) - (a.value || 0))
            .slice(0, QUICK_SEARCH_MAX_RESULTS)
            .map(a => ({ asset: a, score: 1 }));
    }

    return realAssets
        .map(a => ({ asset: a, score: _quickSearchScore(query, a) }))
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, QUICK_SEARCH_MAX_RESULTS);
}

function renderQuickSearchResults(query) {
    const container = document.getElementById('quick-search-results');
    if (!container) return;

    _quickSearchResults = _buildQuickSearchResults(query);
    if (_quickSearchSelectedIndex >= _quickSearchResults.length) {
        _quickSearchSelectedIndex = 0;
    }

    if (!_quickSearchResults.length) {
        container.innerHTML = `<div class="p-4 text-xs text-gray-500 italic text-center">Aucun actif ne correspond à « ${escapeHTML(query)} ».</div>`;
        return;
    }

    container.innerHTML = _quickSearchResults.map((r, i) => {
        const a = r.asset;
        const pnl = (a.value || 0) - (a.invested || 0);
        const isPos = pnl >= 0;
        const isSel = i === _quickSearchSelectedIndex;
        return `
            <div data-qs-index="${i}" onclick="runQuickSearchItem(${i})" onmouseenter="hoverQuickSearchItem(${i})"
                 class="flex items-center gap-3 px-3 py-2 cursor-pointer border-l-2 transition
                        ${isSel ? 'bg-teal-950/60 border-teal-400' : 'border-transparent hover:bg-gray-800/60'}">
                <div class="flex-shrink-0">
                    ${typeof assetClassIconHTML === 'function' ? assetClassIconHTML(a) : ''}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold ${isSel ? 'text-white' : 'text-gray-200'} truncate">
                        ${escapeHTML(a.name)}
                    </div>
                    <div class="text-[10px] text-gray-500 font-mono truncate">
                        ${escapeHTML(a.ticker || '—')}
                        ${a.category ? ' · ' + escapeHTML(a.category) : ''}
                        ${a.isPaper ? ' · <span class="text-purple-400">papier</span>' : ''}
                    </div>
                </div>
                <div class="text-right flex-shrink-0">
                    <div class="font-mono font-bold text-white text-[11px]">${formatEUR(a.value)}</div>
                    <div class="font-mono text-[10px] ${isPos ? 'text-emerald-400' : 'text-rose-400'}">
                        ${isPos ? '+' : ''}${formatEUR(pnl)}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Scroll l'élément sélectionné dans le viewport
    const selEl = container.querySelector(`[data-qs-index="${_quickSearchSelectedIndex}"]`);
    if (selEl) selEl.scrollIntoView({ block: 'nearest' });
}

function hoverQuickSearchItem(i) {
    if (_quickSearchSelectedIndex === i) return;
    _quickSearchSelectedIndex = i;
    const input = document.getElementById('quick-search-input');
    renderQuickSearchResults(input ? input.value : '');
}

function runQuickSearchItem(i) {
    const r = _quickSearchResults[i];
    if (!r) return;
    closeQuickSearch();

    // Ouvre le détail de l'actif (utilise le slide-panel ou le modal centré)
    setTimeout(() => {
        if (typeof openAssetDetailModal === 'function') {
            openAssetDetailModal(r.asset.id);
        }
    }, 60);
}

function handleQuickSearchKey(e) {
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        _quickSearchSelectedIndex = Math.min(_quickSearchSelectedIndex + 1, _quickSearchResults.length - 1);
        renderQuickSearchResults(e.target.value);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        _quickSearchSelectedIndex = Math.max(_quickSearchSelectedIndex - 1, 0);
        renderQuickSearchResults(e.target.value);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        runQuickSearchItem(_quickSearchSelectedIndex);
    } else if (e.key === 'Escape') {
        e.preventDefault();
        closeQuickSearch();
    }
}

function openQuickSearch() {
    const modal = document.getElementById('modal-quick-search');
    const input = document.getElementById('quick-search-input');
    if (!modal || !input) return;

    // Ferme les autres overlays ouverts pour éviter les conflits visuels
    if (typeof closeSavedFiltersMenu === 'function') closeSavedFiltersMenu();
    if (typeof closeCommandPalette === 'function') closeCommandPalette();
    if (typeof closePortfolioMenu === 'function') closePortfolioMenu();
    if (typeof closePaperScenarioMenu === 'function') closePaperScenarioMenu();

    input.value = '';
    _quickSearchSelectedIndex = 0;
    renderQuickSearchResults('');
    modal.classList.remove('hidden');
    setTimeout(() => input.focus(), 30);
}

function closeQuickSearch() {
    const modal = document.getElementById('modal-quick-search');
    if (modal) modal.classList.add('hidden');
    _quickSearchSelectedIndex = 0;
    _quickSearchResults = [];
}

// ---------------------------------------------------------------------
// INITIALISATION
// ---------------------------------------------------------------------
function initSavedFiltersModule() {
    // Rendu initial du menu (au cas où il serait déjà dans le DOM)
    renderSavedFiltersMenu();

    // Écoute les clics extérieurs pour fermer le menu
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('saved-filters-menu');
        if (!menu || menu.classList.contains('hidden')) return;
        const wrap = menu.parentElement;
        if (wrap && !wrap.contains(e.target)) closeSavedFiltersMenu();
    });

    console.info('[SavedFilters] Module chargé — ' + loadSavedFilters().length + ' filtre(s) mémorisé(s).');
}

// Expose l'API globalement
window.loadSavedFilters             = loadSavedFilters;
window.captureCurrentFilterCriteria = captureCurrentFilterCriteria;
window.applySavedFilter             = applySavedFilter;
window.createSavedFilter            = createSavedFilter;
window.deleteSavedFilter            = deleteSavedFilter;
window.renameSavedFilter            = renameSavedFilter;
window.overwriteSavedFilter         = overwriteSavedFilter;
window.renderSavedFiltersMenu       = renderSavedFiltersMenu;
window.renameSavedFilterUI          = renameSavedFilterUI;
window.toggleSavedFiltersMenu       = toggleSavedFiltersMenu;
window.closeSavedFiltersMenu        = closeSavedFiltersMenu;
window.promptCreateSavedFilter      = promptCreateSavedFilter;
window.openQuickSearch              = openQuickSearch;
window.closeQuickSearch             = closeQuickSearch;
window.renderQuickSearchResults     = renderQuickSearchResults;
window.runQuickSearchItem           = runQuickSearchItem;
window.hoverQuickSearchItem         = hoverQuickSearchItem;
window.handleQuickSearchKey         = handleQuickSearchKey;
window.initSavedFiltersModule       = initSavedFiltersModule;