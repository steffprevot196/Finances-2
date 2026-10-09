// =====================================================================
// app41-pwa.js — PWA INSTALLATION & SHORTCUTS (Chantier #12)
// Dépend de : app1-core.js (escapeHTML), app15-notifications.js
// Charge après app40-withdrawal.js, avant tests.js
// =====================================================================
//
// Trois responsabilités :
//
//   1. BOUTON "INSTALLER"
//      Capture l'événement beforeinstallprompt et propose un bouton
//      discret dans le header. Respecte le refus de l'utilisateur avec
//      un cooldown de 30 jours.
//
//   2. RACCOURCIS D'URL
//      Gère les query strings ?tab=dashboard, ?tab=objectifs, etc.
//      utilisées par les shortcuts du manifest.json. Après application,
//      nettoie l'URL pour ne pas bloquer le bouton "retour" du navigateur.
//
//   3. DÉTECTION DE MISE À JOUR SW
//      Si un nouveau Service Worker est en attente (installed), propose
//      un toast "Recharger maintenant" au lieu d'attendre un reload manuel.
//
// ⚠ Ce module NE réenregistre PAS le SW — c'est le rôle de
//    registerServiceWorker() dans app15-notifications.js, appelé par
//    app7-init.js. Un doublon ferait échouer l'enregistrement.
// =====================================================================

const PWA_INSTALL_DISMISSED_KEY = 'patriMonial_pwaInstallDismissed';
const PWA_INSTALL_COOLDOWN_MS = 30 * 24 * 3600 * 1000;   // 30 jours

let _deferredInstallPrompt = null;   // événement beforeinstallprompt capturé

// ---------------------------------------------------------------------
// 1) BOUTON INSTALLER — ÉLIGIBILITÉ
// ---------------------------------------------------------------------
function _shouldShowInstallButton() {
    // Déjà installée ? L'app tourne en mode standalone → pas de bouton
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return false;
    if (window.navigator.standalone === true) return false;   // legacy iOS Safari

    // L'utilisateur a explicitement fermé le bouton
    const dismissed = localStorage.getItem(PWA_INSTALL_DISMISSED_KEY);
    if (dismissed === 'permanent') return false;
    if (dismissed) {
        const last = parseInt(dismissed, 10);
        if (Number.isFinite(last) && (Date.now() - last) < PWA_INSTALL_COOLDOWN_MS) return false;
    }
    return true;
}

// ---------------------------------------------------------------------
// 2) BOUTON INSTALLER — INJECTION DOM
// ---------------------------------------------------------------------
// Injecté juste à gauche du bouton thème (☀/🌙) dans le header.
// Si le bouton thème n'existe pas (structure HTML modifiée), on ne fait
// rien — dégradation silencieuse.
function _injectInstallButton() {
    if (document.getElementById('pwa-install-btn')) return;   // déjà présent

    const themeBtn = document.getElementById('theme-toggle-btn');
    if (!themeBtn || !themeBtn.parentElement) return;

    const btn = document.createElement('button');
    btn.id = 'pwa-install-btn';
    btn.type = 'button';
    btn.title = 'Installer PatriMonial sur cet appareil (fonctionne offline)';
    btn.className = 'px-2.5 py-1.5 rounded-lg bg-emerald-950/60 text-emerald-300 border border-emerald-700/50 hover:bg-emerald-900/80 text-xs font-medium transition flex items-center gap-1.5 flex-shrink-0';
    btn.innerHTML = '<i class="fa-solid fa-download text-[11px]"></i><span class="hidden sm:inline">Installer</span>';
    btn.addEventListener('click', _onInstallClick);

    themeBtn.parentElement.insertBefore(btn, themeBtn);
}

function _removeInstallButton() {
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.remove();
}

// ---------------------------------------------------------------------
// 3) BOUTON INSTALLER — CLIC
// ---------------------------------------------------------------------
async function _onInstallClick() {
    // Cas 1 : pas de beforeinstallprompt disponible (Safari, Firefox,
    // ou l'événement n'a pas encore été fired). On informe l'utilisateur
    // de la procédure manuelle.
    if (!_deferredInstallPrompt) {
        alert(
            'Installation manuelle :\n\n' +
            '• Sur iPhone / iPad : bouton Partager → « Sur l\'écran d\'accueil »\n' +
            '• Sur Firefox Android : menu ⋮ → « Installer »\n' +
            '• Sur Firefox desktop : non supporté (utilisez Chrome / Edge / Brave)\n' +
            '• Sur Chrome / Edge / Brave : le bouton devrait apparaître automatiquement\n\n' +
            'L\'application doit être servie en HTTPS (ou localhost) pour être installable.'
        );
        return;
    }

    // Cas 2 : on déclenche le prompt natif
    _deferredInstallPrompt.prompt();
    const result = await _deferredInstallPrompt.userChoice;

    if (result.outcome === 'accepted') {
        if (typeof toastSuccess === 'function') {
            toastSuccess('Installation en cours…', 'Retrouvez PatriMonial dans votre liste d\'apps.');
        }
        _deferredInstallPrompt = null;
        _removeInstallButton();
    } else {
        // Refus : cooldown 30 jours avant de reproposer
        localStorage.setItem(PWA_INSTALL_DISMISSED_KEY, String(Date.now()));
        _removeInstallButton();
    }
}

// ---------------------------------------------------------------------
// 4) ÉCOUTE DES ÉVÉNEMENTS PWA
// ---------------------------------------------------------------------
window.addEventListener('beforeinstallprompt', (e) => {
    // Empêche la mini-infobar native (Chrome) qui est intrusive
    e.preventDefault();
    _deferredInstallPrompt = e;
    if (_shouldShowInstallButton()) _injectInstallButton();
});

window.addEventListener('appinstalled', () => {
    _deferredInstallPrompt = null;
    _removeInstallButton();
    if (typeof toastSuccess === 'function') {
        toastSuccess('Installation réussie', 'PatriMonial est disponible offline depuis votre écran d\'accueil.');
    }
});

// ---------------------------------------------------------------------
// 5) RACCOURCIS D'URL — ?tab=dashboard → switchTab('tab-dashboard')
// ---------------------------------------------------------------------
// Table de conversion des slugs courts (utilisés dans manifest.json)
// vers les ids internes des onglets (utilisés par switchTab()).
const PWA_TAB_SHORTCUTS = {
    'accueil':    'tab-accueil',
    'dashboard':  'tab-dashboard',
    'inventaire': 'tab-inventaire',
    'gave':       'tab-gave',
    'crypto':     'tab-crypto',
    'hors':       'tab-hors-gave',
    'hors-gave':  'tab-hors-gave',
    'piliers':    'tab-piliers',
    'fiscalite':  'tab-annee-n1',
    'annee-n1':   'tab-annee-n1',
    'strategies': 'tab-strategies',
    'objectifs':  'tab-objectifs',
    'watchlist':  'tab-watchlist',
    'ledger':     'tab-ledger'
};

function _handleTabShortcut() {
    let params;
    try {
        params = new URLSearchParams(window.location.search);
    } catch (_) {
        return;
    }
    const tabParam = params.get('tab');
    if (!tabParam) return;

    const targetTab = PWA_TAB_SHORTCUTS[tabParam.toLowerCase()] || ('tab-' + tabParam);

    // Différé : laisse le boot complet s'installer (onboarding, refreshAllUI,
    // etc.) avant de switcher. 250 ms est un compromis : assez pour que
    // switchTab soit disponible et que le premier rendu soit stable, assez
    // court pour ne pas voir un flash de l'onglet d'accueil.
    setTimeout(() => {
        const el = document.getElementById(targetTab);
        if (!el || typeof switchTab !== 'function') return;

        switchTab(targetTab);

        // Nettoie l'URL pour ne pas polluer le bouton "retour" du navigateur
        // (sinon un retour arrière relance le switch sur l'onglet précédent).
        try {
            const cleanUrl = window.location.pathname + (window.location.hash || '');
            window.history.replaceState({}, '', cleanUrl);
        } catch (_) { /* silencieux */ }
    }, 250);
}

// ---------------------------------------------------------------------
// 6) DÉTECTION DE MISE À JOUR SW
// ---------------------------------------------------------------------
// Quand un nouveau SW est installé mais qu'un ancien contrôle la page
// (state 'installed' + controller présent), on propose un reload.
function _watchSWUpdate() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.ready.then((registration) => {
        // Écoute les futurs SW en cours d'installation
        registration.addEventListener('updatefound', () => {
            const newSW = registration.installing;
            if (!newSW) return;

            newSW.addEventListener('statechange', () => {
                // 'installed' + un controller actif = mise à jour disponible
                // (si pas de controller, c'est le premier install → pas de notif)
                if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                    _notifyUpdateAvailable();
                }
            });
        });

        // Cas edge : un nouveau SW était déjà en waiting avant ce listener
        if (registration.waiting && navigator.serviceWorker.controller) {
            _notifyUpdateAvailable();
        }
    }).catch(() => { /* silencieux : pas de SW, on s'en fout */ });
}

function _notifyUpdateAvailable() {
    if (typeof toastInfo !== 'function') return;
    toastInfo(
        'Mise à jour disponible',
        'Une nouvelle version de PatriMonial est prête. Rechargez pour l\'installer.',
        {
            duration: 12000,
            actions: [
                {
                    label: 'Recharger maintenant',
                    primary: true,
                    onClick: () => {
                        // Demande au SW en waiting de s'activer immédiatement
                        if (navigator.serviceWorker.controller) {
                            navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
                        }
                        // Puis recharge la page pour que le nouveau SW prenne la main
                        setTimeout(() => window.location.reload(), 200);
                    }
                },
                { label: 'Plus tard' }
            ]
        }
    );
}

// ---------------------------------------------------------------------
// 7) INITIALISATION
// ---------------------------------------------------------------------
function initPwaModule() {
    // 7a. Traite l'éventuel ?tab=xxx dans l'URL (raccourci PWA)
    _handleTabShortcut();

    // 7b. Si beforeinstallprompt a déjà été fired avant que ce module soit
    //     chargé (cas possible si le script est en bas de page), on
    //     injecte le bouton immédiatement.
    if (_deferredInstallPrompt && _shouldShowInstallButton()) {
        _injectInstallButton();
    }

    // 7c. Filet de sécurité : certains navigateurs envoient beforeinstallprompt
    //     de manière différée (parfois > 1 s après le chargement). On revérifie
    //     une fois après 3 secondes.
    setTimeout(() => {
        if (_deferredInstallPrompt && _shouldShowInstallButton()) {
            _injectInstallButton();
        }
    }, 3000);

    // 7d. Écoute les mises à jour SW
    _watchSWUpdate();

    console.info('[PWA] Module chargé — installer disponible si éligible.');
}

// ---------------------------------------------------------------------
// API GLOBALE
// ---------------------------------------------------------------------
window.initPwaModule = initPwaModule;
window._onInstallClick = _onInstallClick;
window._handleTabShortcut = _handleTabShortcut;