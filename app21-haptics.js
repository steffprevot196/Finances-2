// =====================================================================
// app21-haptics.js — FEEDBACK HAPTIQUE MOBILE (Chantier 2.8)
// Dépend de : aucune (module autonome)
// Charge après app20-chart-export.js, avant app7-init.js
// =====================================================================
//
// Utilise navigator.vibrate() pour ajouter des micro-vibrations sur les
// actions critiques de l'app. Aucun effet sur desktop (le navigateur
// ignore simplement l'appel).
//
// Contrainte technique : la Vibration API n'est disponible que sur
// certains navigateurs (Chrome Android, Firefox Android, Edge Android).
// Safari iOS ne l'implémente pas. Le module est donc un pur bonus —
// aucune dépendance fonctionnelle.
//
// Pattern utilisé : monkey-patching des fonctions existantes. On enveloppe
// chaque fonction cible pour ajouter un appel vibrate() AVANT l'exécution
// de la fonction originale. Aucun impact sur la logique métier.

// ---------------------------------------------------------------------
// PROFILS DE VIBRATION
// ---------------------------------------------------------------------
// Format : durée en ms, ou tableau [vibrate, pause, vibrate, pause…].
// Les valeurs sont choisies pour rester DISCÈTES (< 30 ms) : au-delà,
// l'utilisateur a l'impression d'une sonnerie, pas d'un retour tactile.
const HAPTIC_PATTERNS = {
    // Micro-tap : feedback générique après un clic réussi
    tap:       10,
    // Action importante : légère insistance
    action:    [12, 30, 12],
    // Action destructive : double tap court
    destructive: [15, 40, 15],
    // Succès : simple confirmation
    success:   12,
    // Alerte : pattern reconnaissable
    alert:     [20, 60, 20, 60, 20],
    // Toggle : très léger
    toggle:    8
};

// Vibration activée par défaut. Peut être désactivée par l'utilisateur
// depuis les préférences (pas d'UI dédiée pour l'instant, mais la clé
// existe pour compatibilité avec de futures options).
const HAPTIC_ENABLED_KEY = 'patriMonial_hapticsEnabled';

function isHapticsEnabled() {
    return localStorage.getItem(HAPTIC_ENABLED_KEY) !== 'false';
}

function setHapticsEnabled(enabled) {
    localStorage.setItem(HAPTIC_ENABLED_KEY, String(!!enabled));
}

// ---------------------------------------------------------------------
// FONCTION PRINCIPALE
// ---------------------------------------------------------------------
// Déclenche une vibration selon un profil nommé. Safe par défaut :
//   • silencieux si l'API n'est pas supportée
//   • silencieux si désactivée par l'utilisateur
//   • try/catch complet (certains navigateurs refusent l'appel si l'app
//     n'est pas en premier plan ou si le document est caché)
function haptic(profile = 'tap') {
    if (!isHapticsEnabled()) return;
    if (!navigator || typeof navigator.vibrate !== 'function') return;

    const pattern = HAPTIC_PATTERNS[profile] ?? HAPTIC_PATTERNS.tap;
    try {
        navigator.vibrate(pattern);
    } catch (_) {
        // Silencieux : la vibration est un bonus, pas une fonctionnalité critique
    }
}

// ---------------------------------------------------------------------
// WRAP AUTOMATIQUE DES FONCTIONS CRITIQUES
// ---------------------------------------------------------------------
// Chaque entrée : [nom de la fonction globale, profil de vibration].
// La fonction est remplacée par un wrapper qui :
//   1. déclenche la vibration,
//   2. appelle la fonction originale avec les mêmes arguments.
//
// Si la fonction n'existe pas (module pas encore chargé), on skip.
function wrapWithHaptic(fnName, profile) {
    const original = window[fnName];
    if (typeof original !== 'function') return;
    // Évite le double-wrap si initHapticsModule est appelé deux fois
    if (original._hapticsWrapped) return;

    const wrapped = function (...args) {
        haptic(profile);
        return original.apply(this, args);
    };
    wrapped._hapticsWrapped = true;
    wrapped._originalFn = original;
    window[fnName] = wrapped;
}

// ---------------------------------------------------------------------
// INITIALISATION
// ---------------------------------------------------------------------
function initHapticsModule() {
    // Sécurité : ne rien faire si l'API n'est pas supportée (desktop)
    if (!navigator || typeof navigator.vibrate !== 'function') {
        return;
    }

    // --- 1) Actions destructives (vibration distinctive) ---
    wrapWithHaptic('deleteAsset',           'destructive');
    wrapWithHaptic('deleteCession',         'destructive');
    wrapWithHaptic('deleteArbitrage',       'destructive');
    wrapWithHaptic('deleteLot',             'destructive');
    wrapWithHaptic('deleteDividend',        'destructive');
    wrapWithHaptic('deleteSplit',           'destructive');
    wrapWithHaptic('deleteGoal',            'destructive');
    wrapWithHaptic('deleteAlert',           'destructive');
    wrapWithHaptic('deletePaperScenario',   'destructive');
    wrapWithHaptic('deleteAllPaperAssets',  'destructive');
    wrapWithHaptic('clearAllData',          'destructive');
    wrapWithHaptic('deleteWatchlistEntry',  'destructive');

    // --- 2) Créations / validations de formulaire (succès) ---
    wrapWithHaptic('handleAddAsset',        'success');
    wrapWithHaptic('handleAddCession',      'success');
    wrapWithHaptic('handleAddArbitrage',    'success');
    wrapWithHaptic('handleAddGoal',         'success');
    wrapWithHaptic('handleAddAlert',        'success');
    wrapWithHaptic('handleAddDividend',     'success');
    wrapWithHaptic('handleAddSplit',        'success');
    wrapWithHaptic('handleAddWatchlist',    'success');
    wrapWithHaptic('handleSaveFireConfig',  'success');

    // --- 3) Modifications (feedback plus léger) ---
    wrapWithHaptic('handleEditLot',         'action');
    wrapWithHaptic('handleDuplicateAsset',  'action');
    wrapWithHaptic('applyReclass',          'action');
    wrapWithHaptic('reassignAssetCadran',   'action');
    wrapWithHaptic('saveManualRefresh',     'action');
    wrapWithHaptic('handleManualGoldUpdate','action');

    // --- 4) Actions globales ---
    wrapWithHaptic('resetData',             'action');
    wrapWithHaptic('restoreLocalBackup',    'action');
    wrapWithHaptic('pullFromDrive',         'action');
    wrapWithHaptic('confirmCsvImport',      'action');

    // --- 5) Toggles d'interface (vibration légère) ---
    wrapWithHaptic('togglePaperMode',       'toggle');
    wrapWithHaptic('toggleLightMode',       'toggle');
    wrapWithHaptic('toggleDensityMode',     'toggle');
    wrapWithHaptic('toggleCompareMode',     'toggle');
    wrapWithHaptic('toggleTintRows',        'toggle');
    wrapWithHaptic('setTaxRegime',          'toggle');

    // --- 6) Déclenchement d'alerte (pattern reconnaissable) ---
    // Note : evaluateAlerts est appelée automatiquement après chaque refresh,
    // on ne la wrappe PAS pour éviter une vibration toutes les 3 secondes.
    // En revanche, testCurrentAlertForm simule un déclenchement manuel →
    // vibration adaptée.
    wrapWithHaptic('testCurrentAlertForm',  'alert');
    wrapWithHaptic('dismissAllTriggeredAlerts', 'tap');

    // --- 7) Vibration douce sur changement d'onglet ---
    // Tab switch : très léger, pour rendre la navigation "native"
    wrapWithHaptic('switchTab',             'tap');

    // Log discret (utile en debug)
    console.info('[Haptics] Module initialisé — vibrate supporté.');
}

// Expose une API publique pour les futurs appels explicites
window.haptic = haptic;
window.setHapticsEnabled = setHapticsEnabled;
window.isHapticsEnabled = isHapticsEnabled;