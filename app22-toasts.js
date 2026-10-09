// =====================================================================
// app22-toasts.js — TOASTS UNIFIÉS (Chantier 2.10)
// Dépend de : aucune (module autonome)
// Charge après app21-haptics.js, avant app7-init.js
// =====================================================================
//
// Remplace les alert() d'INFORMATION par des toasts non-bloquants.
// Les confirm() RESTENT en place (une question binaire nécessite une
// réponse bloquante).
//
// API publique :
//   showToast({ type, title, message, duration, actions })
//   toastSuccess(title, message?)
//   toastError(title, message?)
//   toastWarning(title, message?)
//   toastInfo(title, message?)
//
// Types disponibles : 'success' | 'error' | 'warning' | 'info'
//
// ⚠ Ne remplace PAS alert() en masse : les toasts sont adaptés à un
// feedback contextuel, pas à une information critique nécessitant une
// lecture attentive. Voir app22-toasts.js pour la liste des
// remplacements ciblés.

// ---------------------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------------------
const TOAST_CONTAINER_ID = 'toast-container';
const TOAST_DEFAULT_DURATION = 4200;   // ms
const TOAST_MAX_VISIBLE = 4;           // au-delà, les plus anciens sont fermés

// Icônes et couleurs par type (Tailwind classes)
const TOAST_STYLES = {
    success: {
        icon: 'fa-circle-check',
        accent: '#10b981',
        bg: 'rgba(16, 185, 129, 0.12)',
        border: 'rgba(16, 185, 129, 0.35)',
        iconColor: 'text-emerald-400'
    },
    error: {
        icon: 'fa-circle-exclamation',
        accent: '#ef4444',
        bg: 'rgba(239, 68, 68, 0.12)',
        border: 'rgba(239, 68, 68, 0.35)',
        iconColor: 'text-rose-400'
    },
    warning: {
        icon: 'fa-triangle-exclamation',
        accent: '#f59e0b',
        bg: 'rgba(245, 158, 11, 0.12)',
        border: 'rgba(245, 158, 11, 0.35)',
        iconColor: 'text-amber-400'
    },
    info: {
        icon: 'fa-circle-info',
        accent: '#3b82f6',
        bg: 'rgba(59, 130, 246, 0.12)',
        border: 'rgba(59, 130, 246, 0.35)',
        iconColor: 'text-blue-400'
    }
};

// ---------------------------------------------------------------------
// HELPERS DOM
// ---------------------------------------------------------------------
// Récupère (ou crée) le conteneur de toasts. On le crée à la volée pour
// ne pas dépendre d'un élément HTML statique → permet de charger le
// module dans n'importe quel ordre.
function _getToastContainer() {
    let container = document.getElementById(TOAST_CONTAINER_ID);
    if (!container) {
        container = document.createElement('div');
        container.id = TOAST_CONTAINER_ID;
        // Position : en haut à droite, empilé verticalement.
        // z-index élevé pour passer au-dessus des modals.
        container.className = 'fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none';
        container.style.maxWidth = 'calc(100vw - 2rem)';
        document.body.appendChild(container);
    }
    return container;
}

// Échappe le contenu pour éviter toute injection (les messages viennent
// parfois de données utilisateur : noms d'actifs, erreurs d'API…)
function _esc(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------
// CRÉATION D'UN TOAST
// ---------------------------------------------------------------------
// opts = {
//   type: 'success' | 'error' | 'warning' | 'info'   (défaut : 'info')
//   title: string (obligatoire, court — max ~60 caractères)
//   message: string (optionnel, texte long — supporte \n)
//   duration: ms (0 = ne pas auto-fermer)            (défaut : 4200)
//   actions: [{ label, onClick, primary? }]          (optionnel)
//   onClose: function()                              (optionnel)
// }
function showToast(opts = {}) {
    const type = TOAST_STYLES[opts.type] ? opts.type : 'info';
    const style = TOAST_STYLES[type];
    const container = _getToastContainer();

    // Limite le nombre de toasts visibles simultanément
    const currentToasts = container.querySelectorAll('.pm-toast');
    if (currentToasts.length >= TOAST_MAX_VISIBLE) {
        // Ferme le plus ancien
        _removeToast(currentToasts[0]);
    }

    // --- Construction du DOM ---
    const toast = document.createElement('div');
    toast.className = 'pm-toast pointer-events-auto bg-gray-900 border rounded-xl shadow-2xl overflow-hidden transition-all duration-300';
    toast.style.borderColor = style.border;
    toast.style.background = `linear-gradient(135deg, ${style.bg}, rgba(15, 21, 32, 0.95))`;
    toast.style.width = '360px';
    toast.style.maxWidth = 'calc(100vw - 2rem)';
    toast.style.transform = 'translateX(120%)';
    toast.style.opacity = '0';

    // Actions (boutons optionnels)
    const actionsHTML = (opts.actions && opts.actions.length)
        ? `<div class="flex gap-1.5 mt-2 pt-2 border-t border-gray-800/60">
              ${opts.actions.map((a, i) => {
                  const cls = a.primary
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                      : 'bg-gray-800 hover:bg-gray-700 text-gray-300';
                  return `<button type="button" data-toast-action="${i}" class="px-2.5 py-1 rounded-md text-[11px] font-medium transition ${cls}">${_esc(a.label)}</button>`;
              }).join('')}
           </div>`
        : '';

    toast.innerHTML = `
        <div class="p-3 flex items-start gap-3">
            <div class="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style="background:${style.bg}; border:1px solid ${style.border};">
                <i class="fa-solid ${style.icon} text-sm ${style.iconColor}"></i>
            </div>
            <div class="flex-1 min-w-0">
                <div class="text-[12px] font-bold text-white leading-snug">${_esc(opts.title || '')}</div>
                ${opts.message ? `<div class="text-[11px] text-gray-300 mt-1 leading-relaxed whitespace-pre-line">${_esc(opts.message)}</div>` : ''}
                ${actionsHTML}
            </div>
            <button type="button" data-toast-close class="flex-shrink-0 w-6 h-6 rounded-md text-gray-500 hover:text-white hover:bg-gray-800 flex items-center justify-center transition" title="Fermer">
                <i class="fa-solid fa-xmark text-[10px]"></i>
            </button>
        </div>
        ${opts.duration === 0
            ? ''
            : `<div class="h-0.5" style="background:${style.accent}; animation: pmToastProgress ${opts.duration}ms linear forwards;"></div>`}
    `;

    // --- Attache les events ---
    toast.querySelector('[data-toast-close]').addEventListener('click', () => {
        _removeToast(toast);
        if (typeof opts.onClose === 'function') opts.onClose();
    });

    // Boutons d'action
    if (opts.actions) {
        toast.querySelectorAll('[data-toast-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.toastAction, 10);
                const action = opts.actions[idx];
                _removeToast(toast);
                if (action && typeof action.onClick === 'function') {
                    try { action.onClick(); } catch (err) { console.error('[Toast action]', err); }
                }
            });
        });
    }

    // Vibration douce (si supportée) — feedback natif
    if (typeof haptic === 'function') {
        haptic(type === 'error' ? 'destructive' : 'tap');
    }

    container.appendChild(toast);

    // Animation d'entrée (utilise requestAnimationFrame pour laisser le
    // navigateur peindre l'état initial avant la transition)
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(0)';
            toast.style.opacity = '1';
        });
    });

    // Auto-fermeture
    const duration = (opts.duration === undefined) ? TOAST_DEFAULT_DURATION : opts.duration;
    if (duration > 0) {
        toast._pmAutoCloseTimer = setTimeout(() => {
            _removeToast(toast);
            if (typeof opts.onClose === 'function') opts.onClose();
        }, duration);
    }

    return toast;
}

// ---------------------------------------------------------------------
// FERMETURE D'UN TOAST
// ---------------------------------------------------------------------
function _removeToast(toast) {
    if (!toast || !toast.parentElement) return;
    if (toast._pmAutoCloseTimer) clearTimeout(toast._pmAutoCloseTimer);

    // Animation de sortie
    toast.style.transform = 'translateX(120%)';
    toast.style.opacity = '0';
    toast.style.maxHeight = toast.offsetHeight + 'px';

    // Puis suppression après la transition
    setTimeout(() => {
        // Rétrécit la hauteur pour que les toasts suivants remontent en douceur
        toast.style.maxHeight = '0';
        toast.style.marginTop = '0';
        toast.style.padding = '0';
        setTimeout(() => {
            if (toast.parentElement) toast.parentElement.removeChild(toast);
        }, 200);
    }, 200);
}

// Raccourcis pour les 4 types
function toastSuccess(title, message, opts) {
    return showToast({ type: 'success', title, message, ...(opts || {}) });
}
function toastError(title, message, opts) {
    return showToast({ type: 'error', title, message, duration: 6500, ...(opts || {}) });
}
function toastWarning(title, message, opts) {
    return showToast({ type: 'warning', title, message, duration: 5500, ...(opts || {}) });
}
function toastInfo(title, message, opts) {
    return showToast({ type: 'info', title, message, ...(opts || {}) });
}

// ---------------------------------------------------------------------
// WRAP AUTOMATIQUE DES ALERT() D'INFORMATION
// ---------------------------------------------------------------------
// Certaines fonctions existantes se terminent par un alert() qui est un
// simple feedback (« Sauvegarde effectuée », « 3 actifs importés »…).
// On les remplace par des toasts pour ne plus bloquer l'UI.
//
// ⚠ On ne remplace QUE les alert() d'information. Les confirm() (questions
// oui/non) restent intacts — un toast ne peut pas bloquer pour obtenir
// une réponse.
//
// Le wrap est fait via une fonction utilitaire `_replaceAlertWithToast()`
// qui recompile le corps de la fonction en remplaçant `alert(` par
// `toastInfo(`. Cette approche est FRAGILE et sera remplacée à terme par
// une refonte manuelle fichier par fichier.

// Remplacement CIBLÉ (fait au coup par coup) :
// On liste ici les fonctions dont l'alert() final devient un toast.
// Le pattern : on récupère la fonction, on l'appelle en interceptant
// temporairement window.alert par un toast.

// Intercepteur temporaire : appelé juste avant la fonction cible,
// restaure window.alert après l'exécution. C'est thread-safe en JS
// mono-thread tant qu'aucun appel async n'est en vol.
function _withAlertAsToast(fnName, toastType = 'info') {
    const original = window[fnName];
    if (typeof original !== 'function') return;
    if (original._alertWrapped) return;

    const wrapped = function (...args) {
        const realAlert = window.alert;
        window.alert = (msg) => {
            // Détermine le titre depuis le type
            const titles = {
                success: 'Succès',
                error:   'Erreur',
                warning: 'Attention',
                info:    'Information'
            };
            // Détecte le type automatiquement selon le contenu
            const m = String(msg || '');
            let inferred = toastType;
            if (/erreur|échec|impossible|échoué/i.test(m)) inferred = 'error';
            else if (/attention|avertissement|⚠/i.test(m)) inferred = 'warning';
            else if (/réussi|succès|✅|effectué|importé|enregistré/i.test(m)) inferred = 'success';

            showToast({
                type: inferred,
                title: titles[inferred] || 'Information',
                message: m,
                // Les messages longs (ex. erreurs d'API multi-lignes) restent plus longtemps
                duration: m.length > 100 ? 8000 : 4500
            });
        };
        try {
            return original.apply(this, args);
        } finally {
            // Restauration garantie même en cas d'exception
            window.alert = realAlert;
        }
    };
    wrapped._alertWrapped = true;
    wrapped._originalFn = original;
    window[fnName] = wrapped;
}

// ---------------------------------------------------------------------
// INITIALISATION
// ---------------------------------------------------------------------
function initToastsModule() {
    // Injecte le keyframe CSS utilisé par la barre de progression
    // (on ne peut pas le mettre dans style.css car la durée est dynamique)
    if (!document.getElementById('pm-toast-styles')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'pm-toast-styles';
        styleEl.textContent = `
            @keyframes pmToastProgress {
                from { width: 100%; opacity: 1; }
                to   { width: 0%;   opacity: 0.3; }
            }
            @media (prefers-reduced-motion: reduce) {
                .pm-toast { transition: none !important; }
                .pm-toast [style*="pmToastProgress"] { animation: none !important; }
            }
        `;
        document.head.appendChild(styleEl);
    }

    // Wraps ciblés : liste des fonctions dont l'alert() d'info devient un toast.
    // Ces fonctions sont identifiées comme affichant un message de confirmation
    // post-action (jamais de question binaire).
    const INFO_ALERT_FUNCTIONS = [
        // Chantier 1.2 — devise
        // (aucune alert critique)

        // Chantier 1.8 — récolte MV
        // (confirm() uniquement → non wrappé)

        // Import / Export
        'handleImportJSON',          // « Import réussi : … »
        'exportToExcel',             // (peut échouer avec alert → toast error)
        'confirmCsvImport',          // (récap d'import → toast info)
        'saveManualRefresh',         // « 3 actifs mis à jour manuellement »
        'handleManualGoldUpdate',    // « Valeur mise à jour : … »
        'restoreLocalBackup',        // « Sauvegarde restaurée »
        'pullFromDrive',             // « Données restaurées depuis Google Drive »
        'pushToDrive',               // « Sauvegarde envoyée sur Google Drive »
        'connectDrive',              // « Connecté à Google Drive »
        'deleteDriveBackup',         // (alert succès ou erreur)
        'forceAutoDriveBackup',      // (alert succès ou erreur)
        'forgetMasterKey',           // « Phrase oubliée »
        'addPortfolio',              // « Portefeuille créé et activé »
        'deletePortfolio',           // (confirm en amont, mais alert en cas d'erreur)
        'resetData',                 // (si message succès)
        'handleDuplicateAsset',      // (déjà silencieux mais au cas où)
        'duplicatePaperScenario',    // « Scénario dupliqué : … »
        'promotePaperAsset',         // (confirm en amont, mais retour silencieux)
        'promoteWatchlistToAsset',   // (aucun alert mais préventif)
        'downloadCurrentLedgerCSV',  // (éventuelle erreur)
        'handleSaveFireConfig'       // (validation → alert si erreur)
    ];

    INFO_ALERT_FUNCTIONS.forEach(fnName => _withAlertAsToast(fnName, 'info'));

    console.info('[Toasts] Module initialisé.');
}

// Expose l'API globalement
window.showToast = showToast;
window.toastSuccess = toastSuccess;
window.toastError = toastError;
window.toastWarning = toastWarning;
window.toastInfo = toastInfo;