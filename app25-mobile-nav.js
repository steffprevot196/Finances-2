// =====================================================================
// app25-mobile-nav.js — BOTTOM-NAV MOBILE + DRAWER (Chantier 2.4)
// Dépend de : app1-core.js (escapeHTML, debounce)
// Charge après app24-onboarding.js, avant app7-init.js
// =====================================================================
//
// Sur mobile (< 768 px), les onglets horizontaux scrollables du haut sont
// remplacés par une barre fixe en bas de l'écran avec :
//   • 4 onglets principaux (Vue, Inventaire, Gave, Crypto)
//   • 1 bouton "Plus" qui ouvre un drawer contenant tous les autres onglets
//
// Sur desktop, la barre reste masquée et la nav horizontale d'origine
// est conservée telle quelle.
//
// Ajoute également la navigation par SWIPE gauche/droite pour changer
// d'onglet.

// ---------------------------------------------------------------------
// DÉFINITION DES ONGLETS
// ---------------------------------------------------------------------
const MOBILE_NAV_PRIMARY = [
    { id: 'tab-accueil',    icon: 'fa-house',            label: 'Accueil' },
    { id: 'tab-inventaire', icon: 'fa-list-check',       label: 'Inv.' },
    { id: 'tab-gave',       icon: 'fa-compass',          label: 'Gave' },
    { id: 'tab-crypto',     icon: 'fa-bitcoin',          label: 'Crypto' }
];

const MOBILE_NAV_SECONDARY = [
    { id: 'tab-dashboard',  icon: 'fa-gauge-high',       label: 'Vue d\'ensemble', color: 'text-emerald-400' },
    { id: 'tab-hors-gave',  icon: 'fa-building-columns', label: 'Hors-Cadran',   color: 'text-blue-400' },
    { id: 'tab-piliers',    icon: 'fa-scale-balanced',   label: '3 Piliers',     color: 'text-cyan-400' },
    { id: 'tab-annee-n1',   icon: 'fa-receipt',          label: 'Fiscalité',     color: 'text-amber-400' },
    { id: 'tab-strategies', icon: 'fa-flask',            label: 'Stratégies',    color: 'text-purple-400' },
    { id: 'tab-objectifs',  icon: 'fa-bullseye',         label: 'Objectifs',     color: 'text-cyan-400' },
    { id: 'tab-watchlist',  icon: 'fa-binoculars',       label: 'Watchlist',     color: 'text-amber-400' },
    { id: 'tab-ledger',     icon: 'fa-scroll',           label: 'Historique',    color: 'text-slate-300' }
];

// ---------------------------------------------------------------------
// CONSTRUCTION DU HTML
// ---------------------------------------------------------------------
function _buildMobileNavHTML() {
    const primaryButtons = MOBILE_NAV_PRIMARY.map(t => `
        <button type="button" data-mobile-tab="${t.id}" onclick="mobileNavGoTo('${t.id}')" class="mobile-nav-btn flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition">
            <i class="fa-solid ${t.icon} text-lg"></i>
            <span class="text-[10px] font-medium">${escapeHTML(t.label)}</span>
        </button>
    `).join('');

    const drawerButtons = MOBILE_NAV_SECONDARY.map(t => `
        <button type="button" data-mobile-tab="${t.id}" onclick="mobileNavGoTo('${t.id}'); closeMobileDrawer();" class="mobile-drawer-btn flex items-center gap-3 w-full p-3 rounded-xl border border-gray-800 bg-gray-950 hover:bg-gray-800 hover:border-gray-700 transition text-left">
            <span class="flex-shrink-0 w-9 h-9 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-center ${t.color || 'text-gray-300'}">
                <i class="fa-solid ${t.icon}"></i>
            </span>
            <span class="flex-1 min-w-0">
                <span class="block text-[13px] font-bold text-white truncate">${escapeHTML(t.label)}</span>
            </span>
            <i class="fa-solid fa-chevron-right text-[10px] text-gray-600"></i>
        </button>
    `).join('');

    return `
        <!-- BOTTOM NAV BAR -->
        <nav id="mobile-bottom-nav"
             class="mobile-nav fixed bottom-0 left-0 right-0 z-[55] bg-gray-950/95 backdrop-blur-md border-t border-gray-800 safe-area-bottom"
             style="display: none;">
            <div class="flex items-stretch h-16 max-w-xl mx-auto">
                ${primaryButtons}
                <button type="button" onclick="toggleMobileDrawer()" class="mobile-nav-btn mobile-nav-more flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition relative">
                    <i class="fa-solid fa-ellipsis text-lg"></i>
                    <span class="text-[10px] font-medium">Plus</span>
                    <span id="mobile-nav-drawer-indicator" class="hidden absolute top-1 right-2 w-2 h-2 rounded-full bg-amber-500"></span>
                </button>
            </div>
        </nav>

        <!-- DRAWER (overlay + panneau) -->
        <div id="mobile-drawer-overlay"
             class="mobile-drawer-overlay fixed inset-0 bg-black/60 backdrop-blur-sm z-[59] opacity-0 pointer-events-none transition-opacity duration-200"
             onclick="closeMobileDrawer()">
        </div>

        <aside id="mobile-drawer"
               class="mobile-drawer fixed bottom-0 left-0 right-0 z-[60] bg-gray-900 border-t border-gray-800 rounded-t-2xl shadow-2xl transition-transform duration-300 max-h-[75vh] flex flex-col"
               style="transform: translateY(100%);">
            <div class="w-12 h-1.5 rounded-full bg-gray-700 mx-auto mt-3 mb-1 flex-shrink-0"></div>
            <div class="px-4 pb-3 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
                <div class="text-sm font-bold text-white">Autres onglets</div>
                <button onclick="closeMobileDrawer()" class="w-8 h-8 rounded-lg bg-gray-800 text-gray-400 hover:text-white flex items-center justify-center transition">
                    <i class="fa-solid fa-xmark text-[12px]"></i>
                </button>
            </div>
            <div class="p-4 space-y-2 overflow-y-auto">
                ${drawerButtons}
            </div>
        </aside>
    `;
}

// ---------------------------------------------------------------------
// INITIALISATION
// ---------------------------------------------------------------------
let _mobileDrawerOpen = false;

function initMobileNavModule() {
    // Évite un double appel (init peut être rappelé)
    if (document.getElementById('mobile-bottom-nav')) return;

    // Injection dans le body
    const wrapper = document.createElement('div');
    wrapper.innerHTML = _buildMobileNavHTML();
    document.body.appendChild(wrapper);

    // Refresh l'état visuel (tab actif)
    updateMobileNavActiveState();

    // Écoute du resize pour (dé)masquer la barre
    window.addEventListener('resize', debounce(_handleMobileResize, 150));
    _handleMobileResize();

    // Écoute des swipes
    _attachSwipeListeners();

    console.info('[MobileNav] Module initialisé.');
}

// Masque la barre sur desktop, l'affiche sur mobile.
function _handleMobileResize() {
    const nav = document.getElementById('mobile-bottom-nav');
    if (!nav) return;
    const isMobile = window.innerWidth < 768;
    nav.style.display = isMobile ? 'block' : 'none';

    // Ferme le drawer si on bascule en desktop
    if (!isMobile && _mobileDrawerOpen) closeMobileDrawer();

    // Ajoute une marge basse au body pour ne pas être masqué par la barre
    document.body.style.paddingBottom = isMobile ? '72px' : '';
}

// ---------------------------------------------------------------------
// NAVIGATION
// ---------------------------------------------------------------------
function mobileNavGoTo(tabId) {
    if (typeof switchTab !== 'function') return;
    switchTab(tabId);
    updateMobileNavActiveState();
}

// Met à jour l'onglet actif (couleur émeraude pour l'actif).
function updateMobileNavActiveState() {
    const active = (typeof activeTab !== 'undefined') ? activeTab : 'tab-dashboard';

    // Boutons primaires
    document.querySelectorAll('#mobile-bottom-nav [data-mobile-tab]').forEach(btn => {
        const isActive = btn.dataset.mobileTab === active;
        btn.classList.toggle('text-emerald-400', isActive);
        btn.classList.toggle('text-gray-500', !isActive);
        if (isActive) {
            btn.style.borderTop = '2px solid #10b981';
        } else {
            btn.style.borderTop = '';
        }
    });

    // Bouton "Plus" : actif si on est sur un onglet secondaire
    const moreBtn = document.querySelector('#mobile-bottom-nav .mobile-nav-more');
    const isSecondary = MOBILE_NAV_SECONDARY.some(t => t.id === active);
    if (moreBtn) {
        moreBtn.classList.toggle('text-emerald-400', isSecondary);
        moreBtn.classList.toggle('text-gray-500', !isSecondary);
        if (isSecondary) {
            moreBtn.style.borderTop = '2px solid #10b981';
        } else {
            moreBtn.style.borderTop = '';
        }
    }

    // Indicateur sur le bouton "Plus" si on est sur un secondaire
    const indicator = document.getElementById('mobile-nav-drawer-indicator');
    if (indicator) indicator.classList.toggle('hidden', !isSecondary);

    // Met en évidence le bouton correspondant dans le drawer
    document.querySelectorAll('#mobile-drawer [data-mobile-tab]').forEach(btn => {
        const isActive = btn.dataset.mobileTab === active;
        btn.classList.toggle('border-emerald-700/60', isActive);
        btn.classList.toggle('bg-emerald-950/30', isActive);
        btn.classList.toggle('border-gray-800', !isActive);
        btn.classList.toggle('bg-gray-950', !isActive);
    });
}

// ---------------------------------------------------------------------
// DRAWER
// ---------------------------------------------------------------------
function toggleMobileDrawer() {
    if (_mobileDrawerOpen) closeMobileDrawer();
    else openMobileDrawer();
}

function openMobileDrawer() {
    const drawer = document.getElementById('mobile-drawer');
    const overlay = document.getElementById('mobile-drawer-overlay');
    if (!drawer || !overlay) return;
    drawer.style.transform = 'translateY(0)';
    overlay.classList.remove('opacity-0', 'pointer-events-none');
    overlay.classList.add('opacity-100');
    _mobileDrawerOpen = true;
    document.body.style.overflow = 'hidden';   // bloque le scroll de fond
}

function closeMobileDrawer() {
    const drawer = document.getElementById('mobile-drawer');
    const overlay = document.getElementById('mobile-drawer-overlay');
    if (!drawer || !overlay) return;
    drawer.style.transform = 'translateY(100%)';
    overlay.classList.add('opacity-0', 'pointer-events-none');
    overlay.classList.remove('opacity-100');
    _mobileDrawerOpen = false;
    document.body.style.overflow = '';
}

// ---------------------------------------------------------------------
// SWIPE GESTURES
// ---------------------------------------------------------------------
// Permet de changer d'onglet par un swipe horizontal (gauche/droite)
// sur la zone de contenu principale. Ne s'active que sur mobile.
let _swipeStartX = 0;
let _swipeStartY = 0;
let _swipeTracking = false;

function _attachSwipeListeners() {
    const main = document.querySelector('main');
    if (!main) return;

    main.addEventListener('touchstart', (e) => {
        if (window.innerWidth >= 768) return;        // desktop : ignore
        if (_mobileDrawerOpen) return;               // drawer ouvert : ignore
        if (!e.touches || e.touches.length !== 1) return;
        _swipeStartX = e.touches[0].clientX;
        _swipeStartY = e.touches[0].clientY;
        _swipeTracking = true;
    }, { passive: true });

    main.addEventListener('touchend', (e) => {
        if (!_swipeTracking) return;
        _swipeTracking = false;
        if (!e.changedTouches || !e.changedTouches.length) return;

        const dx = e.changedTouches[0].clientX - _swipeStartX;
        const dy = e.changedTouches[0].clientY - _swipeStartY;

        // Rejette les gestes trop verticaux ou trop courts
        if (Math.abs(dx) < 60) return;
        if (Math.abs(dy) > Math.abs(dx) * 0.6) return;

        // Rejette si le swipe démarre dans un élément scrollable horizontalement
        // (tableaux, canvas, sliders)
        const target = e.target;
        if (target && target.closest && (
            target.closest('.overflow-x-auto') ||
            target.closest('input[type="range"]') ||
            target.closest('canvas')
        )) return;

        // Ordre complet des onglets (primaire + secondaire) pour le swipe
        const ORDER = [
            'tab-accueil', 'tab-dashboard', 'tab-inventaire', 'tab-gave', 'tab-crypto',
            'tab-hors-gave', 'tab-piliers', 'tab-annee-n1', 'tab-strategies',
            'tab-objectifs', 'tab-watchlist', 'tab-ledger'
        ];
        const current = (typeof activeTab !== 'undefined') ? activeTab : 'tab-dashboard';
        const idx = ORDER.indexOf(current);
        if (idx === -1) return;

        if (dx < 0) {
            // Swipe gauche → onglet suivant
            const next = ORDER[Math.min(idx + 1, ORDER.length - 1)];
            if (next !== current) mobileNavGoTo(next);
        } else {
            // Swipe droite → onglet précédent
            const prev = ORDER[Math.max(idx - 1, 0)];
            if (prev !== current) mobileNavGoTo(prev);
        }
    }, { passive: true });
}

// ---------------------------------------------------------------------
// HOOK : met à jour la nav à chaque switchTab (y compris depuis le bureau)
// ---------------------------------------------------------------------
(function _hookSwitchTabForMobileNav() {
    const orig = window.switchTab;
    if (typeof orig !== 'function') return;
    if (orig._mobileNavHooked) return;

    const wrapped = function (...args) {
        const r = orig.apply(this, args);
        // Différé léger : laisse activeTab se mettre à jour
        setTimeout(updateMobileNavActiveState, 0);
        return r;
    };
    wrapped._mobileNavHooked = true;
    wrapped._originalFn = orig;
    window.switchTab = wrapped;
})();

// Expose l'API globalement
window.mobileNavGoTo = mobileNavGoTo;
window.updateMobileNavActiveState = updateMobileNavActiveState;
window.openMobileDrawer = openMobileDrawer;
window.closeMobileDrawer = closeMobileDrawer;
window.toggleMobileDrawer = toggleMobileDrawer;