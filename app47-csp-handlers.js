// =====================================================================
// app47-csp-handlers.js — Gestionnaires nommés pour la CSP stricte
// =====================================================================
// Avec une CSP sans 'unsafe-inline', les attributs onclick="…" sont bloqués. Ils
// sont désormais écrits data-onclick="…" et rejoués par le délégateur (app28),
// qui N'UTILISE NI eval NI new Function : il ne comprend donc qu'une grammaire
// limitée (appel fn(args), assignation this.x = …, getElementById(…).méthode()).
//
// Ses arguments ne peuvent être que : chaînes, nombres, booléens, null, `event`,
// `this.value`/`this.checked`/`this.dataset.x`, tableaux et objets littéraux.
// TOUT AUTRE ARGUMENT (variable globale, `this` seul, expression, concaténation…)
// devient SILENCIEUSEMENT `undefined` — c'est ainsi que le bouton « crayon » de la
// fiche d'un actif échouait avec « ID manquant » (arg `window.currentAssetDetailId`).
//
// Chaque fonction ci-dessous remplace un handler qui sortait de cette grammaire.
// Dans ces fonctions, `this` est l'élément qui a déclenché l'événement
// (le délégateur appelle fn.apply(element, args)).
// =====================================================================

// ---- Actif ouvert dans la fiche détail -------------------------------
// `currentAssetDetailId` peut avoir été remis à null (fermeture partielle,
// double déclenchement) : on retombe sur le dernier actif ouvert (app4-forms.js).
function _detailAssetId() {
    if (typeof currentAssetDetailId !== 'undefined' && currentAssetDetailId !== null && currentAssetDetailId !== '') {
        return currentAssetDetailId;
    }
    return (typeof _lastAssetDetailOpenedId !== 'undefined') ? _lastAssetDetailOpenedId : null;
}

function openSplitModalForCurrentAsset()   { openSplitModal(_detailAssetId()); }
function exportCurrentAssetLotsCSV()       { exportLotsCSV(_detailAssetId()); }
function openAddDividendForCurrentAsset()  { openAddDividendModal(_detailAssetId()); }

// ---- Modale cadran ----------------------------------------------------
function renameCurrentQuadrant(event) {
    startRenameCadran(currentQuadrantCode, event);
}

// ---- Arbitrage / rééquilibrage : la fonction attend le bouton lui-même ---
function convertRebalanceToArbitrageFromButton() {
    return convertRebalanceToArbitrage(this);      // this = le bouton cliqué
}

// ---- Onglets / sections ----------------------------------------------
function scrollToWaterfall() {
    const chart = document.getElementById('waterfallChart');
    const parent = chart && chart.parentElement;
    if (parent) parent.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function refreshCorrelationSection() {
    if (typeof invalidateCorrelationCache === 'function') invalidateCorrelationCache();
    if (typeof renderCorrelationSection === 'function') renderCorrelationSection();
}

// ---- Curseurs et listes -----------------------------------------------
function updatePerMixedLabel(value) {
    const el = document.getElementById('per-mixed-label');
    if (el) el.innerText = value + ' % capital / ' + (100 - value) + ' % rente';
}

function syncCessionSubType(value) {
    const target = document.getElementById('cession-subtype');
    if (target) target.value = value;
    if (typeof onCessionSubTypeChange === 'function') onCessionSubTypeChange();
}

// ---- Bandeau de promotion (watchlist) ---------------------------------
function dismissPromotionBanner() {
    const banner = document.getElementById('promotion-banner');
    if (banner) banner.remove();
    window._pendingPromotionWatchlistId = null;
}

// ---- Assistant de démarrage (onboarding) ------------------------------
function onboardingSetTaxMode(mode) {
    onboardingState.data.taxMode = mode;
    renderOnboardingStep();
}

function onboardingConcentrationInput(value) {
    const label = document.getElementById('onb-concentration-label');
    if (label) label.innerText = value + ' %';
    onboardingState.data.concentrationThreshold = parseFloat(value) / 100;
}

function onboardingDeferDrive() {
    onboardingState.data.driveDeferred = true;
    nextOnboardingStep();
}

function onboardingOpenDriveSync() {
    onboardingState.data.driveDeferred = false;
    closeModal('modal-onboarding');
    openDriveSyncModal();
}

function onboardingDeferGoal() {
    onboardingState.data.goalDeferred = true;
    finishOnboarding();
}
