// =====================================================================
// app7-init.js — POINT D'ENTRÉE (chargé en dernier)
// Dépend de : app1 à app6 (toutes les fonctions doivent être définies)
// =====================================================================

window.addEventListener('DOMContentLoaded', () => {
    // 1. Migration des données v1 -> v2 (sauvegarde avant, normalisation après)
    bootMigration();

    // 2. Restauration des préférences fiscales
    document.getElementById('tax-regime-pfu').checked    = taxRegimeMode === 'PFU';
    document.getElementById('tax-regime-bareme').checked = taxRegimeMode === 'BAREME';
    document.getElementById('tax-tmi-select').value      = String(taxTMI);

    // 3. Initialisation des chips de tags du formulaire d'ajout
    renderAssetTagChips();

    // 4. Premier rendu complet de l'interface
    refreshAllUI();

    // 5. Simulateur fiscal pré-rempli
    calculateMetalTaxSim();

    // 6. Préchargement du cache de volatilité réelle (async, se termine plus tard)
    primeRealVolCache();

    // 7. Pop-up de reclassement Action/ETF si nécessaire
    maybeShowReclassModal();

    // 8. Snapshot quotidien (une seule fois par jour)
    checkDailyAutoBackup();

    // 9. État initial du modal Google Drive
    initDriveSyncUI();
        // 10. Force l'ouverture du calendrier natif sur tous les champs date (utile sur Firefox/Linux)
    document.querySelectorAll('input[type="date"]').forEach(inp => {
        inp.addEventListener('focus', () => {
            if (typeof inp.showPicker === 'function') {
                try { inp.showPicker(); } catch (e) { /* silencieux */ }
            }
        });
        inp.addEventListener('click', () => {
            if (typeof inp.showPicker === 'function') {
                try { inp.showPicker(); } catch (e) { /* silencieux */ }
            }
        });
    });
});