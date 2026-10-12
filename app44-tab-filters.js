// =====================================================================
// app44-tab-filters.js — FILTRES PAR ACTIF (Accueil + Vue d'ensemble)
// ---------------------------------------------------------------------
// Ajoute une barre de filtres en haut des onglets Accueil et Vue d'ensemble,
// identique à celle de l'Inventaire (Tous, Actions, ETF, Or & Métaux, Crypto,
// Cadrans de Gave…).
//
// STRATÉGIE D'IMPLÉMENTATION (monkey-patching ciblé) :
//   1. On redéfinit statsAssets() et statsCessions() pour qu'elles
//      appliquent automatiquement le filtre du tab actif.
//   2. Tous les consommateurs existants (calculateOverallStats,
//      renderAnnualPnlChart, buildPortfolioTimeline, computeRiskMetrics…)
//      héritent donc du filtre SANS modification de leur code.
//   3. On injecte dynamiquement les barres de filtres au boot.
//
// Le filtre Accueil est indépendant du filtre Vue d'ensemble : chaque
// onglet mémorise sa propre sélection pendant toute la session.
// =====================================================================

// ---------------------------------------------------------------------
// ÉTAT GLOBAL (session-scoped)
// ---------------------------------------------------------------------
let homeTabFilter      = 'ALL';
let dashboardTabFilter = 'ALL';

// ---------------------------------------------------------------------
// DÉFINITION DES FILTRES (mêmes codes que l'Inventaire)
// ---------------------------------------------------------------------
const TAB_FILTER_CODES = [
    { code: 'ALL',                label: 'Tous' },
    { code: 'Action',             label: 'Actions' },
    { code: 'ETF',                label: 'ETF' },
    { code: 'Obligation',         label: 'Obligations' },
    { code: 'Or & Métaux',        label: 'Or & Métaux' },
    { code: 'Crypto',             label: 'Crypto' },
    { code: 'Devises/Liquidités', label: 'Devises / Cash' },
    { code: 'IMMO',               label: 'SCPI / Immo / Autre' },
    { separator: true },
    { code: 'CADRAN_OR',          label: 'Cadran OR' },
    { code: 'CADRAN_MONNAIES',    label: 'Cadran Monnaies' },
    { code: 'CADRAN_ASIE',        label: 'Cadran Actions / Asie' },
    { code: 'CADRAN_PETROLE',     label: 'Cadran Pétrole' },
    { code: 'CADRAN_ALL4',        label: '4 Cadrans de Gave' }
];

// ---------------------------------------------------------------------
// FILTRAGE D'UNE LISTE D'ACTIFS
// ---------------------------------------------------------------------
// Reproduit exactement la logique de renderInventoryTable() pour rester
// cohérent avec le comportement de l'Inventaire.
function _applyTabFilter(list, filter) {
    if (!filter || filter === 'ALL') return list;
    return list.filter(a => {
        if (filter === 'IMMO') {
            return ['SCPI', 'Immobilier', 'Private Equity', 'Art / Collection', 'Autre']
                .some(t => hasTag(a, t));
        }
        if (filter === 'CADRAN_ALL4') {
            return GAVE_QUADRANTS.includes(a.cadran);
        }
        if (filter.startsWith('CADRAN_')) {
            return a.cadran === filter.slice(7);
        }
        return hasTag(a, filter);
    });
}

// ---------------------------------------------------------------------
// FILTRAGE DES CESSIONS (pour la section Performance annuelle)
// ---------------------------------------------------------------------
// Mappe les codes d'actif vers les types de cessions correspondants.
function _applyTabFilterToCessions(list, filter) {
    if (!filter || filter === 'ALL') return list;
    const typeMap = {
        'Action':             ['ACTION_ETF'],
        'ETF':                ['ACTION_ETF'],
        'Obligation':         ['ACTION_ETF'],
        'Or & Métaux':        ['JETON', 'COURS_LEGAL', 'METAUX_PRECIEUX'],
        'Crypto':             ['CRYPTO'],
        'Devises/Liquidités': ['ACTION_ETF'],
        'IMMO':               ['ACTION_ETF'],
        'CADRAN_OR':          ['JETON', 'COURS_LEGAL', 'METAUX_PRECIEUX'],
        'CADRAN_MONNAIES':    ['ACTION_ETF'],
        'CADRAN_ASIE':        ['ACTION_ETF'],
        'CADRAN_PETROLE':     ['ACTION_ETF'],
        'CADRAN_ALL4':        ['JETON', 'COURS_LEGAL', 'METAUX_PRECIEUX', 'ACTION_ETF']
    };
    const allowed = typeMap[filter];
    if (!allowed) return list;
    return list.filter(c => allowed.includes(c.type));
}

// ---------------------------------------------------------------------
// RETOURNE LE FILTRE ACTIF SELON L'ONGLET COURANT
// ---------------------------------------------------------------------
function _getActiveTabFilter() {
    if (activeTab === 'tab-accueil')   return homeTabFilter;
    if (activeTab === 'tab-dashboard') return dashboardTabFilter;
    return 'ALL';   // autres onglets : pas de filtre
}

// ---------------------------------------------------------------------
// OVERRIDE : statsAssets() — devient automatiquement filter-aware
// ---------------------------------------------------------------------
// Tous les consommateurs existants (calculateOverallStats, computeAnnualPnlData,
// buildPortfolioTimeline, computeRiskMetricsFromAssets, etc.) héritent du
// filtre sans modification de leur code.
function statsAssets() {
    const base = paperIncludeInStats ? assets : assets.filter(a => !isPaperAsset(a));
    const filter = _getActiveTabFilter();
    return _applyTabFilter(base, filter);
}

// ---------------------------------------------------------------------
// OVERRIDE : statsCessions() — filtre aussi les cessions par nature
// ---------------------------------------------------------------------
function statsCessions() {
    let result = cessions;
    if (!paperIncludeInStats) {
        const realIds = new Set(assets.filter(a => !isPaperAsset(a)).map(a => a.id));
        result = result.filter(c => !c.fromPaper || realIds.has(c.fromPaper));
    }
    const filter = _getActiveTabFilter();
    return _applyTabFilterToCessions(result, filter);
}

// ---------------------------------------------------------------------
// OVERRIDE : renderDividendsKPIs() — utilise statsAssets()
// ---------------------------------------------------------------------
// Fonction copiée depuis app10-tir.js avec une seule modification :
// `const realAssets = statsAssets();` au lieu de `assets.filter(...)`.
function renderDividendsKPIs() {
    const realAssets = statsAssets();   // ← FILTRE APPLIQUÉ

    let totalNet = 0, totalGross = 0, totalWithheld = 0, totalCount = 0;
    let taxEstimate = 0;

    realAssets.forEach(a => {
        const d12 = getAssetDividendsSinceMonths(a, 12);
        if (d12.count === 0) return;
        totalNet      += d12.net;
        totalGross    += d12.gross;
        totalWithheld += d12.withheld;
        totalCount    += d12.count;

        const env = a.envelope || 'CTO';
        if (env === 'PEA' || env === 'PEA_PME') {
            taxEstimate += d12.net * 0.172;
        } else if (taxRegimeMode === 'PFU') {
            taxEstimate += d12.net * 0.30;
        } else {
            taxEstimate += d12.net * (taxTMI + 0.172 - 0.068 * taxTMI);
        }
    });

    const yieldPct = getPortfolioDividendYield(realAssets);

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

// ---------------------------------------------------------------------
// OVERRIDE : renderCurrencyExposureKPI() — utilise statsAssets()
// ---------------------------------------------------------------------
function renderCurrencyExposureKPI() {
    const list = statsAssets();   // ← FILTRE APPLIQUÉ
    const exposure = buildCurrencyExposure(list);
    const total = list.reduce((s, a) => s + (a.value || 0), 0);

    const elDom = document.getElementById('stat-fx-dominant');
    const elDomPct = document.getElementById('stat-fx-dominant-pct');
    if (elDom && elDomPct) {
        if (!exposure.length || total <= 0) {
            elDom.innerHTML = '<span class="text-gray-500">—</span>';
            elDomPct.innerText = '— % du portefeuille';
        } else {
            const dom = exposure[0];
            const flag = _currencyFlag(dom.currency);
            const cls = dom.currency === 'EUR' ? 'text-emerald-400' : 'text-blue-400';
            elDom.innerHTML = `<span class="${cls}">${flag} ${escapeHTML(dom.currency)}</span>`;
            elDomPct.innerText = `${dom.pct.toFixed(1)} % du portefeuille`;
        }
    }

    const elForeign = document.getElementById('stat-fx-foreign-pct');
    if (elForeign) {
        const foreignPct = exposure.filter(e => e.currency !== 'EUR').reduce((s, e) => s + e.pct, 0);
        elForeign.innerText = foreignPct.toFixed(1) + ' %';
        elForeign.className = `text-2xl font-bold font-mono ${
            foreignPct >= 50 ? 'text-amber-400' :
            foreignPct >= 20 ? 'text-emerald-400' :
            'text-white'
        }`;
    }

    const elCount = document.getElementById('stat-fx-count');
    if (elCount) elCount.innerText = exposure.length;

    const elBreak = document.getElementById('stat-fx-breakdown');
    if (elBreak) {
        const top3 = exposure.slice(0, 3);
        if (!top3.length || total <= 0) {
            elBreak.innerHTML = '<div class="text-[11px] text-gray-500 italic">Aucune devise étrangère</div>';
        } else {
            const colors = { EUR: '#10b981', USD: '#3b82f6', GBP: '#8b5cf6', CHF: '#f59e0b', JPY: '#ef4444' };
            elBreak.innerHTML = top3.map(e => {
                const color = colors[e.currency] || '#6b7280';
                const flag = _currencyFlag(e.currency);
                return `<div>
                    <div class="flex justify-between text-[10px] mb-0.5">
                        <span class="text-gray-300">${flag} ${escapeHTML(e.currency)}</span>
                        <span class="font-mono text-gray-400">${e.pct.toFixed(1)} %</span>
                    </div>
                    <div class="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
                        <div class="h-full transition-all duration-500" style="width:${Math.min(100, e.pct)}%;background:${color};"></div>
                    </div>
                </div>`;
            }).join('');
        }
    }
}

// ---------------------------------------------------------------------
// CONSTRUCTION DU HTML DE LA BARRE DE FILTRES
// ---------------------------------------------------------------------
function _buildFilterButtonsHTML(setterName, activeFilter, barId) {
    let html = '';
    TAB_FILTER_CODES.forEach(item => {
        if (item.separator) {
            html += '<span class="w-px h-5 bg-gray-800 mx-0.5"></span>';
            return;
        }
        const isActive = item.code === activeFilter;
        const cls = isActive
            ? 'bg-gray-800 text-white border-gray-700 font-medium'
            : 'bg-gray-900 text-gray-400 border-gray-800 hover:text-white';
        html += `<button
            type="button"
            data-tab-filter-bar="${barId}"
            data-tab-filter-code="${escapeHTML(item.code)}"
            onclick="${setterName}(${safeInlineArg(item.code)})"
            class="tab-filter-btn px-3 py-1.5 rounded-lg text-xs border transition ${cls}">${escapeHTML(item.label)}</button>`;
    });
    return html;
}

// Met à jour l'état visuel des boutons d'une barre (sans la reconstruire).
function _updateFilterBarUI(barId, activeFilter) {
    const bar = document.getElementById(barId);
    if (!bar) return;
    bar.querySelectorAll('.tab-filter-btn').forEach(btn => {
        const isActive = btn.dataset.tabFilterCode === activeFilter;
        btn.classList.toggle('bg-gray-800', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('border-gray-700', isActive);
        btn.classList.toggle('font-medium', isActive);
        btn.classList.toggle('bg-gray-900', !isActive);
        btn.classList.toggle('text-gray-400', !isActive);
        btn.classList.toggle('border-gray-800', !isActive);
    });
}

// ---------------------------------------------------------------------
// INJECTION DES BARRES DE FILTRES AU BOOT
// ---------------------------------------------------------------------
function _injectTabFilterBars() {
    // --- Accueil ---
    const homeSection = document.getElementById('tab-accueil');
    if (homeSection && !document.getElementById('home-filter-bar')) {
        const bar = document.createElement('div');
        bar.id = 'home-filter-bar';
        bar.className = 'flex flex-wrap items-center gap-1.5 mb-4 pb-3 border-b border-gray-800';
        bar.innerHTML = `
            <span class="text-[10px] text-gray-500 uppercase tracking-wider font-bold mr-1">
                <i class="fa-solid fa-filter text-[9px] mr-1"></i>Filtrer
            </span>
            ${_buildFilterButtonsHTML('setHomeTabFilter', homeTabFilter, 'home-filter-bar')}
            <span id="home-filter-count" class="ml-auto text-[10px] text-gray-500 font-mono"></span>
        `;
        homeSection.insertBefore(bar, homeSection.firstChild);
    }

    // --- Vue d'ensemble ---
    const dashSection = document.getElementById('tab-dashboard');
    if (dashSection && !document.getElementById('dashboard-filter-bar')) {
        const bar = document.createElement('div');
        bar.id = 'dashboard-filter-bar';
        bar.className = 'flex flex-wrap items-center gap-1.5 mb-4 pb-3 border-b border-gray-800';
        bar.innerHTML = `
            <span class="text-[10px] text-gray-500 uppercase tracking-wider font-bold mr-1">
                <i class="fa-solid fa-filter text-[9px] mr-1"></i>Filtrer
            </span>
            ${_buildFilterButtonsHTML('setDashboardTabFilter', dashboardTabFilter, 'dashboard-filter-bar')}
            <span id="dashboard-filter-count" class="ml-auto text-[10px] text-gray-500 font-mono"></span>
        `;
        dashSection.insertBefore(bar, dashSection.firstChild);
    }

    _refreshFilterCounts();
}

// Met à jour le compteur "X actifs · Y €" à côté de chaque barre.
function _refreshFilterCounts() {
    const base = (typeof paperIncludeInStats !== 'undefined' && paperIncludeInStats)
        ? assets : assets.filter(a => !isPaperAsset(a));

    const homeList = _applyTabFilter(base, homeTabFilter);
    const homeCount = homeList.length;
    const homeValue = homeList.reduce((s, a) => s + (a.value || 0), 0);
    const homeEl = document.getElementById('home-filter-count');
    if (homeEl) homeEl.innerText = `${homeCount} actif(s) · ${formatEUR(homeValue)}`;

    const dashList = _applyTabFilter(base, dashboardTabFilter);
    const dashCount = dashList.length;
    const dashValue = dashList.reduce((s, a) => s + (a.value || 0), 0);
    const dashEl = document.getElementById('dashboard-filter-count');
    if (dashEl) dashEl.innerText = `${dashCount} actif(s) · ${formatEUR(dashValue)}`;
}

// ---------------------------------------------------------------------
// SETTERS PUBLICS
// ---------------------------------------------------------------------
function setHomeTabFilter(filter) {
    homeTabFilter = filter || 'ALL';
    _updateFilterBarUI('home-filter-bar', homeTabFilter);
    _refreshFilterCounts();
    if (typeof refreshAllUI === 'function') refreshAllUI();
}

function setDashboardTabFilter(filter) {
    dashboardTabFilter = filter || 'ALL';
    _updateFilterBarUI('dashboard-filter-bar', dashboardTabFilter);
    _refreshFilterCounts();
    if (typeof refreshAllUI === 'function') refreshAllUI();
}

// ---------------------------------------------------------------------
// HOOK : ré-injecte après un switchTab (car les onglets cachés peuvent
// avoir été nettoyés par destroyAllCharts + refreshAllUI)
// ---------------------------------------------------------------------
(function _hookSwitchTabForTabFilters() {
    const orig = window.switchTab;
    if (typeof orig !== 'function') return;
    if (orig._tabFiltersHooked) return;

    const wrapped = function (...args) {
        const r = orig.apply(this, args);
        // Différé : laisse le DOM de l'onglet s'installer
        setTimeout(_injectTabFilterBars, 30);
        return r;
    };
    wrapped._tabFiltersHooked = true;
    wrapped._originalFn = orig;
    window.switchTab = wrapped;
})();

// ---------------------------------------------------------------------
// INITIALISATION
// ---------------------------------------------------------------------
function initTabFiltersModule() {
    _injectTabFilterBars();
    console.info('[TabFilters] Module chargé — filtres Accueil et Vue d\'ensemble prêts.');
}

// Expose l'API globalement
window.setHomeTabFilter         = setHomeTabFilter;
window.setDashboardTabFilter    = setDashboardTabFilter;
window.initTabFiltersModule     = initTabFiltersModule;
window.homeTabFilter            = homeTabFilter;
window.dashboardTabFilter       = dashboardTabFilter;