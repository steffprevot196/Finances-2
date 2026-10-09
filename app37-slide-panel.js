// =====================================================================
// app37-slide-panel.js — SLIDE-IN PANEL POUR LE DÉTAIL ACTIF (Chantier §8)
// Dépend de : app1-core.js, app3-charts.js (openAssetDetailModal)
// Charge après app36-waterfall.js, avant tests.js
// =====================================================================
//
// Améliore l'UX du modal de détail d'actif en proposant une vue SLIDE-IN
// latérale (au lieu du modal centré classique) :
//
//   • Panneau 480 px ancré à droite, hauteur 100vh
//   • La table d'inventaire reste visible à gauche (contexte préservé)
//   • Navigation clavier ← / → pour passer d'un actif à l'autre
//   • Bouton de bascule « Modal » ↔ « Slide-in » dans l'en-tête du panneau
//   • Mémorisation de la préférence dans localStorage
//
// Implémentation NON-INTRUSIVE :
//   • Aucune duplication du contenu du modal
//   • On ajoute simplement une classe sur <body> qui repositionne
//     #modal-asset-detail en panneau latéral via CSS
//   • Un listener clavier global gère la navigation entre actifs
//
// Le mode par défaut reste le modal centré (compatibilité). L'utilisateur
// peut basculer via le bouton dans l'en-tête du panneau ou Ctrl+K.

const SLIDE_PANEL_MODE_KEY = 'patriMonial_slidePanelMode';

// État : 'modal' (défaut) ou 'slide'
let slidePanelMode = localStorage.getItem(SLIDE_PANEL_MODE_KEY) || 'modal';

// ---------------------------------------------------------------------
// APPLICATION DU MODE
// ---------------------------------------------------------------------
function applySlidePanelMode() {
    document.body.classList.toggle('slide-panel-mode', slidePanelMode === 'slide');
    updateSlidePanelToggleUI();
}

function setSlidePanelMode(mode) {
    if (mode !== 'modal' && mode !== 'slide') return;
    slidePanelMode = mode;
    localStorage.setItem(SLIDE_PANEL_MODE_KEY, mode);
    applySlidePanelMode();
    _injectKeyboardHint();
    if (typeof toastInfo === 'function') {
        toastInfo(
            mode === 'slide' ? 'Vue slide-in activée' : 'Vue modal centré activée',
            mode === 'slide'
                ? 'Navigation clavier ← / → pour passer d\'un actif à l\'autre.'
                : 'Affichage classique en modal centré.'
        );
    }
}

function toggleSlidePanelMode() {
    setSlidePanelMode(slidePanelMode === 'slide' ? 'modal' : 'slide');
}

// ---------------------------------------------------------------------
// UI — Icône dans le modal
// ---------------------------------------------------------------------
function updateSlidePanelToggleUI() {
    const btn = document.getElementById('slide-panel-toggle-btn');
    const icon = document.getElementById('slide-panel-toggle-icon');
    if (!btn || !icon) return;

    if (slidePanelMode === 'slide') {
        icon.className = 'fa-solid fa-window-maximize';
        btn.title = 'Passer en vue modal centré';
    } else {
        icon.className = 'fa-solid fa-window-restore';
        btn.title = 'Passer en vue slide-in latérale';
    }
}

// Injecte le bouton de bascule dans l'en-tête du modal de détail (une seule fois)
function _injectSlidePanelToggle() {
    const header = document.querySelector('#modal-asset-detail .flex.items-center.gap-2');
    if (!header || document.getElementById('slide-panel-toggle-btn')) return;

    // Insère le bouton AVANT le bouton "split" (premier bouton d'action)
    const splitBtn = header.querySelector('button[onclick*="openSplitModal"]');
    if (!splitBtn) return;

    const btn = document.createElement('button');
    btn.id = 'slide-panel-toggle-btn';
    btn.type = 'button';
    btn.onclick = () => toggleSlidePanelMode();
    btn.className = 'w-8 h-8 rounded-lg bg-gray-800 text-gray-400 hover:text-cyan-400 transition';
    btn.title = 'Passer en vue slide-in latérale';
    btn.innerHTML = '<i id="slide-panel-toggle-icon" class="fa-solid fa-window-restore"></i>';

    header.insertBefore(btn, splitBtn);
    updateSlidePanelToggleUI();
}

// ---------------------------------------------------------------------
// NAVIGATION CLAVIER ← / →
// ---------------------------------------------------------------------
// Renvoie la liste ordonnée des IDs d'actifs actuellement affichables
// (respecte le filtre d'inventaire courant).
function _getNavigableAssetIds() {
    // Priorité : filtres de l'inventaire si présents
    const searchEl = document.getElementById('inventory-search');
    const q = searchEl ? (searchEl.value || '').toLowerCase() : '';

    const filterCat = (typeof inventoryFilter !== 'undefined') ? inventoryFilter : 'ALL';

    return assets
        .filter(a => {
            // Filtre catégorie (copie simplifiée de renderInventoryTable)
            let matchCat = filterCat === 'ALL';
            if (!matchCat && filterCat === 'IMMO') {
                matchCat = ['SCPI', 'Immobilier', 'Private Equity', 'Art / Collection', 'Autre'].some(t => hasTag(a, t));
            } else if (!matchCat && filterCat === 'CADRAN_ALL4') {
                matchCat = GAVE_QUADRANTS.includes(a.cadran);
            } else if (!matchCat && filterCat.startsWith('CADRAN_')) {
                matchCat = a.cadran === filterCat.slice(7);
            } else if (!matchCat) {
                matchCat = hasTag(a, filterCat);
            }
            // Filtre recherche
            const matchSearch = !q || (a.name || '').toLowerCase().includes(q) || (a.ticker || '').toLowerCase().includes(q);
            return matchCat && matchSearch;
        })
        .map(a => a.id);
}

// Retourne l'ID suivant/précédent, ou null si à l'extrémité.
function _getAdjacentAssetId(currentId, direction) {
    const ids = _getNavigableAssetIds();
    if (!ids.length) return null;
    const idx = ids.indexOf(currentId);
    if (idx === -1) {
        // Actif courant non trouvé (peut-être filtré) → retourne le premier
        return ids[0];
    }
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= ids.length) return null;
    return ids[targetIdx];
}

// Navigue vers l'actif voisin dans la direction indiquée (+1 = suivant, -1 = précédent).
function navigateAsset(direction) {
    if (typeof currentAssetDetailId === 'undefined' || currentAssetDetailId === null) return;

    const detailModal = document.getElementById('modal-asset-detail');
    if (!detailModal || detailModal.classList.contains('hidden')) return;

    const nextId = _getAdjacentAssetId(currentAssetDetailId, direction);
    if (nextId === null) {
        // Extrémité atteinte : petit flash visuel
        if (typeof showUndoToast === 'function') {
            showUndoToast(direction > 0 ? 'Dernier actif' : 'Premier actif', true);
        }
        return;
    }

    // Réouvre le modal sur le nouvel actif (même code que l'existant)
    if (typeof openAssetDetailModal === 'function') {
        openAssetDetailModal(nextId);
    }

    // Feedback haptique léger
    if (typeof haptic === 'function') haptic('tap');
}

// ---------------------------------------------------------------------
// LISTENER CLAVIER
// ---------------------------------------------------------------------
function _attachSlidePanelKeyboard() {
    document.addEventListener('keydown', (e) => {
        // Ignore si l'utilisateur est dans un champ texte
        const tag = (document.activeElement && document.activeElement.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement && document.activeElement.isContentEditable)) return;

        // Ignore les modificateurs (sauf Shift pour les flèches reste OK)
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        // Seulement si le modal de détail est ouvert
        const detailModal = document.getElementById('modal-asset-detail');
        if (!detailModal || detailModal.classList.contains('hidden')) return;

        // Navigation
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            navigateAsset(+1);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            navigateAsset(-1);
        }
    }, false);
}

// ---------------------------------------------------------------------
// AIDE CONTEXTUELLE — Raccourcis clavier ← / → (visible en mode slide)
// ---------------------------------------------------------------------
// Injecte une petite ligne d'aide sous le titre du modal pour rappeler
// la navigation clavier. Affichée uniquement en mode slide pour ne pas
// polluer le modal centré.
function _injectKeyboardHint() {
    const oldHint = document.getElementById('slide-panel-keyboard-hint');
    if (oldHint) oldHint.remove();

    if (slidePanelMode !== 'slide') return;

    const subtitle = document.getElementById('modal-asset-subtitle');
    if (!subtitle) return;

    const hint = document.createElement('div');
    hint.id = 'slide-panel-keyboard-hint';
    hint.className = 'text-[10px] text-gray-500 mt-0.5 flex items-center gap-1.5';
    hint.innerHTML = `
        <kbd class="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 font-mono text-[9px]">←</kbd>
        <kbd class="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 font-mono text-[9px]">→</kbd>
        <span class="italic">pour naviguer entre actifs</span>
    `;
    subtitle.parentElement.appendChild(hint);
}

// ---------------------------------------------------------------------
// INJECTION CSS (une seule fois)
// ---------------------------------------------------------------------
function _injectSlidePanelStyles() {
    if (document.getElementById('slide-panel-styles')) return;

    const styleEl = document.createElement('style');
    styleEl.id = 'slide-panel-styles';
    styleEl.textContent = `
        /* ============================================================
           SLIDE-IN PANEL — modal de détail en panneau latéral
           Activé par body.slide-panel-mode
           ============================================================ */
        body.slide-panel-mode #modal-asset-detail {
            align-items: stretch !important;
            justify-content: flex-end !important;
            padding: 0 !important;
        }
        body.slide-panel-mode #modal-asset-detail > div {
            width: 100% !important;
            max-width: 560px !important;
            height: 100vh !important;
            max-height: 100vh !important;
            border-radius: 0 !important;
            border-right: none !important;
            border-top: none !important;
            border-bottom: none !important;
            border-left: 1px solid #1f2937 !important;
            animation: slidePanelIn 260ms cubic-bezier(.22, 1, .36, 1) both;
        }
        @keyframes slidePanelIn {
            from { transform: translateX(30px); opacity: 0.8; }
            to   { transform: translateX(0);    opacity: 1; }
        }

        /* Léger assombrissement côté gauche (contexte) */
        body.slide-panel-mode #modal-asset-detail::before {
            content: '';
            position: absolute;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            pointer-events: none;
        }

        /* Mode light */
        body.slide-panel-mode.light #modal-asset-detail > div {
            border-left-color: #e5e7eb !important;
            background-color: #ffffff !important;
        }

        /* Petit indicateur en haut à gauche du panneau */
        body.slide-panel-mode #modal-asset-detail > div::before {
            content: '';
            position: absolute;
            left: 0;
            top: 50%;
            transform: translateY(-50%);
            width: 4px;
            height: 40px;
            background: #10b981;
            border-radius: 0 4px 4px 0;
            opacity: 0.7;
        }

        /* Réduit les animations si l'utilisateur le demande */
        @media (prefers-reduced-motion: reduce) {
            body.slide-panel-mode #modal-asset-detail > div {
                animation: none;
            }
        }

        /* Indicateur de position dans la liste (informatif) */
        .slide-panel-nav-badge {
            position: fixed;
            bottom: 16px;
            right: 16px;
            z-index: 55;
            background: rgba(15, 21, 32, 0.9);
            border: 1px solid #1f2937;
            border-radius: 8px;
            padding: 6px 10px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 10px;
            color: #9ca3af;
            opacity: 0;
            transition: opacity 200ms;
            pointer-events: none;
        }
        body.slide-panel-mode #modal-asset-detail:not(.hidden) ~ .slide-panel-nav-badge,
        .slide-panel-nav-badge.visible {
            opacity: 1;
        }
    `;
    document.head.appendChild(styleEl);
}

// ---------------------------------------------------------------------
// BADGE INDICATEUR DE POSITION
// ---------------------------------------------------------------------
let _navBadgeTimer = null;

function _showNavBadge() {
    const badge = document.getElementById('slide-panel-nav-badge');
    if (!badge) return;

    const ids = _getNavigableAssetIds();
    const idx = ids.indexOf(currentAssetDetailId);
    if (idx === -1) {
        badge.classList.remove('visible');
        return;
    }

    badge.textContent = `${idx + 1} / ${ids.length}  ← →`;
    badge.classList.add('visible');

    if (_navBadgeTimer) clearTimeout(_navBadgeTimer);
    _navBadgeTimer = setTimeout(() => {
        badge.classList.remove('visible');
    }, 1800);
}

// ---------------------------------------------------------------------
// HOOK SUR openAssetDetailModal
// ---------------------------------------------------------------------
// Réajuste l'UI (badge, injection du bouton, position) à chaque ouverture.
(function _hookOpenAssetDetailModal() {
    const orig = window.openAssetDetailModal;
    if (typeof orig !== 'function') return;
    if (orig._slidePanelHooked) return;

    const wrapped = function (...args) {
        const r = orig.apply(this, args);
        // Post-render
        setTimeout(() => {
            _injectSlidePanelToggle();
            updateSlidePanelToggleUI();
            _injectKeyboardHint();
            if (slidePanelMode === 'slide') _showNavBadge();
        }, 30);
        return r;
    };
    wrapped._slidePanelHooked = true;
    wrapped._originalFn = orig;
    window.openAssetDetailModal = wrapped;
})();

// ---------------------------------------------------------------------
// INITIALISATION
// ---------------------------------------------------------------------
function initSlidePanelModule() {
    _injectSlidePanelStyles();
    applySlidePanelMode();
    _attachSlidePanelKeyboard();
    _injectKeyboardHint();

    // Badge de navigation (injecté une seule fois)
    if (!document.getElementById('slide-panel-nav-badge')) {
        const badge = document.createElement('div');
        badge.id = 'slide-panel-nav-badge';
        badge.className = 'slide-panel-nav-badge';
        document.body.appendChild(badge);
    }

    console.info('[SlidePanel] Module chargé — mode ' + slidePanelMode);
}

// Expose l'API globalement
window.setSlidePanelMode       = setSlidePanelMode;
window.toggleSlidePanelMode    = toggleSlidePanelMode;
window.navigateAsset           = navigateAsset;
window.initSlidePanelModule    = initSlidePanelModule;