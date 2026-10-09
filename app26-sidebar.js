// =====================================================================
// app26-sidebar.js — SIDEBAR LATÉRALE COLLAPSIBLE (Chantier 2.1)
// Dépend de : app1-core.js (escapeHTML)
// Charge après app25-mobile-nav.js, avant app7-init.js
// =====================================================================
//
// Remplace la nav horizontale par une sidebar latérale fixe sur
// desktop (≥ 1024 px). Sur mobile (< 1024 px), la sidebar est
// totalement masquée — la bottom-nav (Chantier 2.4) prend le relais.
//
// La sidebar peut être :
//   • Déployée (largeur 240 px, libellés visibles)
//   • Repliée (largeur 64 px, icônes seules avec tooltip)
//
// Le choix est persisté dans localStorage ('patriMonial_sidebarCollapsed').
// Le toggle se fait via le bouton hamburger en haut à gauche de la sidebar
// (ou via Ctrl+K → "Basculer la sidebar").

const SIDEBAR_COLLAPSED_KEY = 'patriMonial_sidebarCollapsed';
const SIDEBAR_BREAKPOINT_PX = 1024;   // en-dessous : mobile (sidebar masquée)

// État courant
let sidebarCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
let sidebarVisible   = false;

// ---------------------------------------------------------------------
// DÉFINITION DES ENTRÉES DE NAVIGATION
// ---------------------------------------------------------------------
// Regroupement thématique pour la lisibilité (sections visuelles).
const SIDEBAR_SECTIONS = [
    {
        label: 'Vue globale',
        items: [
            { id: 'tab-accueil',    icon: 'fa-house',         label: 'Accueil',          color: 'text-emerald-400' },
            { id: 'tab-dashboard',  icon: 'fa-gauge-high',    label: 'Vue d\'ensemble',  color: 'text-emerald-400' }
        ]
    },
    {
        label: 'Portefeuille',
        items: [
            { id: 'tab-inventaire', icon: 'fa-list-check',    label: 'Inventaire',       color: 'text-white' },
            { id: 'tab-gave',       icon: 'fa-compass',       label: '4 Cadrans de Gave', color: 'text-amber-400' },
            { id: 'tab-crypto',     icon: 'fa-bitcoin',       label: 'Cryptomonnaies',   color: 'text-purple-400' },
            { id: 'tab-hors-gave',  icon: 'fa-building-columns', label: 'Hors-Cadran',   color: 'text-blue-400' },
            { id: 'tab-piliers',    icon: 'fa-scale-balanced', label: '3 Piliers',       color: 'text-cyan-400' }
        ]
    },
    {
        label: 'Analyse & stratégie',
        items: [
            { id: 'tab-strategies', icon: 'fa-flask',         label: 'Stratégies Paper', color: 'text-purple-400' },
            { id: 'tab-objectifs',  icon: 'fa-bullseye',      label: 'Objectifs & FIRE', color: 'text-cyan-400' },
            { id: 'tab-watchlist',  icon: 'fa-binoculars',    label: 'Watchlist',        color: 'text-amber-400', badge: 'watchlist' }
        ]
    },
    {
        label: 'Registres',
        items: [
            { id: 'tab-annee-n1',   icon: 'fa-receipt',       label: 'Fiscalité & Cessions', color: 'text-amber-400' },
            { id: 'tab-ledger',     icon: 'fa-scroll',        label: 'Historique unifié',    color: 'text-slate-300' }
        ]
    }
];

// ---------------------------------------------------------------------
// CONSTRUCTION DU HTML DE LA SIDEBAR
// ---------------------------------------------------------------------
function _buildSidebarHTML() {
    // En-tête : logo + titre (masqué en mode replié) + bouton hamburger
    const headerHTML = `
        <div class="sidebar-header flex items-center gap-2 px-3 py-4 border-b border-gray-800 flex-shrink-0">
            <div class="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white text-lg font-bold shadow-lg shadow-emerald-900/30">
                <i class="fa-solid fa-chart-pie"></i>
            </div>
            <div class="sidebar-label flex-1 min-w-0">
                <div class="text-sm font-bold text-white tracking-tight truncate">PatriMonial</div>
                <div class="text-[10px] text-gray-500 truncate">Suivi 360°</div>
            </div>
            <button type="button" onclick="toggleSidebarCollapsed()" class="sidebar-toggle-btn flex-shrink-0 w-8 h-8 rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition flex items-center justify-center" title="Replier / déployer la sidebar">
                <i id="sidebar-toggle-icon" class="fa-solid fa-chevron-left text-[11px]"></i>
            </button>
        </div>
    `;

    // Sections + items
    const sectionsHTML = SIDEBAR_SECTIONS.map(section => {
        const itemsHTML = section.items.map(it => {
            const badgeHTML = it.badge === 'watchlist'
                ? `<span id="sidebar-badge-watchlist" class="hidden ml-auto px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[9px] font-bold flex-shrink-0">0</span>`
                : '';
            return `
                <button type="button" data-sidebar-tab="${it.id}" onclick="sidebarGoTo('${it.id}')"
                        class="sidebar-nav-item group w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition relative"
                        title="${escapeHTML(it.label)}">
                    <span class="flex-shrink-0 w-6 flex items-center justify-center ${it.color || 'text-gray-400'}">
                        <i class="fa-solid ${it.icon} text-base"></i>
                    </span>
                    <span class="sidebar-label flex-1 min-w-0 text-[13px] font-medium text-gray-300 group-hover:text-white truncate">${escapeHTML(it.label)}</span>
                    ${badgeHTML}
                    <span class="sidebar-active-indicator absolute left-0 top-1 bottom-1 w-1 rounded-r-full bg-emerald-500 opacity-0 transition-opacity"></span>
                </button>
            `;
        }).join('');
        return `
            <div class="mb-3">
                <div class="sidebar-label px-3 mb-1.5 text-[10px] uppercase tracking-wider font-bold text-gray-600">${escapeHTML(section.label)}</div>
                <div class="space-y-0.5 px-1.5">${itemsHTML}</div>
            </div>
        `;
    }).join('');

    // Actions secondaires en bas (préférences) — mini-barre d'icônes
    const footerHTML = `
        <div class="sidebar-footer flex-shrink-0 border-t border-gray-800 p-2 flex items-center gap-1 justify-center">
            <button type="button" onclick="toggleLightMode()" class="sidebar-tool-btn w-8 h-8 rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition flex items-center justify-center" title="Thème (sombre / clair / auto)">
                <i id="sidebar-theme-icon" class="fa-solid fa-moon text-[12px]"></i>
            </button>
            <button type="button" onclick="toggleDensityMode()" class="sidebar-tool-btn w-8 h-8 rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition flex items-center justify-center" title="Densité (confort / compact)">
                <i id="sidebar-density-icon" class="fa-solid fa-expand text-[12px]"></i>
            </button>
            <button type="button" onclick="togglePaperMode()" class="sidebar-tool-btn w-8 h-8 rounded-lg bg-gray-800 text-gray-400 hover:bg-purple-900/60 hover:text-purple-300 transition flex items-center justify-center" title="Paper Trading (positions fictives)">
                <i class="fa-solid fa-flask text-[12px]"></i>
            </button>
            <button type="button" onclick="openCommandPalette()" class="sidebar-tool-btn w-8 h-8 rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition flex items-center justify-center" title="Commandes (Ctrl+K)">
                <i class="fa-solid fa-terminal text-[12px]"></i>
            </button>
            <button type="button" onclick="openBrokerImportModal()" class="sidebar-tool-btn w-8 h-8 rounded-lg bg-gray-800 text-gray-400 hover:bg-purple-900/60 hover:text-purple-300 transition flex items-center justify-center" title="Import broker (Binance / Coinbase / Kraken)">
                <i class="fa-solid fa-plug text-[12px]"></i>
            </button>
        </div>
    `;

    return `
        <aside id="app-sidebar" class="app-sidebar fixed left-0 top-0 bottom-0 z-[45] bg-gray-950 border-r border-gray-800 flex flex-col transition-all duration-250"
               style="width: 240px;">
            ${headerHTML}
            <div class="sidebar-scroll flex-1 overflow-y-auto overflow-x-hidden py-3">
                ${sectionsHTML}
            </div>
            ${footerHTML}
        </aside>
    `;
}

// ---------------------------------------------------------------------
// INITIALISATION
// ---------------------------------------------------------------------
function initSidebarModule() {
    // Évite un double appel
    if (document.getElementById('app-sidebar')) return;

    // Injection dans le body
    const wrapper = document.createElement('div');
    wrapper.innerHTML = _buildSidebarHTML();
    document.body.appendChild(wrapper);

    // Applique l'état visuel initial (replié / déployé + visible selon viewport)
    _handleSidebarResize();
    updateSidebarCollapsedUI();
    updateSidebarActiveState();

    // Écoute du resize pour (dé)masquer la sidebar
    window.addEventListener('resize', debounce(_handleSidebarResize, 150));

    // Écoute les clics en dehors en mode mobile (fermeture du drawer)
    document.addEventListener('click', _handleSidebarOutsideClick);

    console.info('[Sidebar] Module initialisé.');
}

// ---------------------------------------------------------------------
// GESTION DU VIEWPORT
// ---------------------------------------------------------------------
// • Desktop (≥ 1024 px) → sidebar visible, contenu décalé à droite
// • Mobile (< 1024 px)  → sidebar masquée, bottom-nav visible
function _handleSidebarResize() {
    const sidebar = document.getElementById('app-sidebar');
    if (!sidebar) return;

    const isDesktop = window.innerWidth >= SIDEBAR_BREAKPOINT_PX;
    sidebarVisible = isDesktop;

    if (isDesktop) {
        // Sidebar visible + marge à gauche du main
        sidebar.style.display = 'flex';
        sidebar.style.transform = '';
        document.body.classList.add('has-sidebar');
        document.body.classList.toggle('sidebar-collapsed', sidebarCollapsed);
        // La nav horizontale du haut est masquée (voir CSS)
    } else {
        // Sidebar masquée par défaut sur mobile
        sidebar.style.display = 'none';
        sidebar.style.transform = '';
        document.body.classList.remove('has-sidebar', 'sidebar-collapsed');
        // La bottom-nav prend le relais (Chantier 2.4)
    }
}

// ---------------------------------------------------------------------
// TOGGLE REPLIÉ / DÉPLOYÉ
// ---------------------------------------------------------------------
function toggleSidebarCollapsed() {
    sidebarCollapsed = !sidebarCollapsed;
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed));
    document.body.classList.toggle('sidebar-collapsed', sidebarCollapsed);
    updateSidebarCollapsedUI();

    // Affiche un toast discret (via le module 2.10)
    if (typeof toastInfo === 'function') {
        toastInfo(
            sidebarCollapsed ? 'Sidebar repliée' : 'Sidebar déployée',
            'Vous pouvez basculer à tout moment via le bouton en haut.',
            { duration: 2200 }
        );
    }
}

function updateSidebarCollapsedUI() {
    const sidebar = document.getElementById('app-sidebar');
    if (!sidebar) return;

    const icon = document.getElementById('sidebar-toggle-icon');
    const width = sidebarCollapsed ? '64px' : '240px';
    sidebar.style.width = width;

    if (icon) {
        // En mode replié : flèche vers la droite (déployer)
        // En mode déployé : flèche vers la gauche (replier)
        icon.className = sidebarCollapsed
            ? 'fa-solid fa-chevron-right text-[11px]'
            : 'fa-solid fa-chevron-left text-[11px]';
    }
}

// ---------------------------------------------------------------------
// NAVIGATION
// ---------------------------------------------------------------------
function sidebarGoTo(tabId) {
    if (typeof switchTab !== 'function') return;
    switchTab(tabId);
    updateSidebarActiveState();
}

// Met en évidence l'onglet actif + met à jour les badges
function updateSidebarActiveState() {
    const active = (typeof activeTab !== 'undefined') ? activeTab : 'tab-dashboard';

    document.querySelectorAll('#app-sidebar [data-sidebar-tab]').forEach(btn => {
        const isActive = btn.dataset.sidebarTab === active;
        btn.classList.toggle('bg-emerald-950/40', isActive);
        btn.classList.toggle('text-white', isActive);

        const indicator = btn.querySelector('.sidebar-active-indicator');
        if (indicator) indicator.style.opacity = isActive ? '1' : '0';

        const label = btn.querySelector('.sidebar-label');
        if (label) {
            label.classList.toggle('text-white', isActive);
            label.classList.toggle('font-bold', isActive);
        }
    });

    // Badge watchlist : compte les cibles atteintes (via le module 1.4)
    const wlBadge = document.getElementById('sidebar-badge-watchlist');
    if (wlBadge && typeof watchlistTriggeredCount === 'function') {
        const n = watchlistTriggeredCount();
        wlBadge.textContent = String(n);
        wlBadge.classList.toggle('hidden', n === 0);
    }

    // Synchronise les icônes de la footer avec les modules 2.2 et 2.6
    _syncSidebarFooterIcons();
}

// Synchronise les icônes du footer avec l'état des modules thème/densité
function _syncSidebarFooterIcons() {
    // Thème
    const themeIcon = document.getElementById('sidebar-theme-icon');
    if (themeIcon && typeof getEffectiveTheme === 'function') {
        const eff = getEffectiveTheme();
        if (typeof themeMode !== 'undefined' && themeMode === 'auto') {
            themeIcon.className = 'fa-solid fa-circle-half-stroke text-[12px]';
        } else if (eff === 'light') {
            themeIcon.className = 'fa-solid fa-sun text-[12px]';
        } else {
            themeIcon.className = 'fa-solid fa-moon text-[12px]';
        }
    }
    // Densité
    const densityIcon = document.getElementById('sidebar-density-icon');
    if (densityIcon && typeof densityMode !== 'undefined') {
        densityIcon.className = densityMode === 'compact'
            ? 'fa-solid fa-compress text-[12px]'
            : 'fa-solid fa-expand text-[12px]';
    }
}

// ---------------------------------------------------------------------
// GESTION DU CLIC EXTÉRIEUR (mobile drawer)
// ---------------------------------------------------------------------
// En mode mobile, la sidebar peut être ouverte en overlay. Un clic
// à l'extérieur la referme.
function _handleSidebarOutsideClick(e) {
    if (window.innerWidth >= SIDEBAR_BREAKPOINT_PX) return;
    const sidebar = document.getElementById('app-sidebar');
    if (!sidebar || sidebar.style.display === 'none') return;
    if (sidebar.contains(e.target)) return;
    // Ne ferme pas si le clic vient du bouton d'ouverture (à ajouter plus tard)
    closeSidebarMobile();
}

// Ouvre la sidebar en mode mobile overlay (utilisable depuis un futur
// bouton hamburger dans le header mobile)
function openSidebarMobile() {
    if (window.innerWidth >= SIDEBAR_BREAKPOINT_PX) return;
    const sidebar = document.getElementById('app-sidebar');
    if (!sidebar) return;
    sidebar.style.display = 'flex';
    sidebar.style.transform = 'translateX(0)';
    document.body.style.overflow = 'hidden';
}

function closeSidebarMobile() {
    if (window.innerWidth >= SIDEBAR_BREAKPOINT_PX) return;
    const sidebar = document.getElementById('app-sidebar');
    if (!sidebar) return;
    sidebar.style.transform = 'translateX(-100%)';
    document.body.style.overflow = '';
    // Cache après la transition
    setTimeout(() => {
        if (window.innerWidth < SIDEBAR_BREAKPOINT_PX) sidebar.style.display = 'none';
    }, 260);
}

// ---------------------------------------------------------------------
// HOOK : met à jour la sidebar à chaque switchTab
// ---------------------------------------------------------------------
(function _hookSwitchTabForSidebar() {
    const orig = window.switchTab;
    if (typeof orig !== 'function') return;
    if (orig._sidebarHooked) return;

    const wrapped = function (...args) {
        const r = orig.apply(this, args);
        setTimeout(updateSidebarActiveState, 0);
        return r;
    };
    wrapped._sidebarHooked = true;
    wrapped._originalFn = orig;
    window.switchTab = wrapped;
})();

// Expose l'API globalement
window.toggleSidebarCollapsed = toggleSidebarCollapsed;
window.sidebarGoTo = sidebarGoTo;
window.updateSidebarActiveState = updateSidebarActiveState;
window.openSidebarMobile = openSidebarMobile;
window.closeSidebarMobile = closeSidebarMobile;