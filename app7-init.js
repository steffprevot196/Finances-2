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
    document.getElementById('tax-tmi-select').value      = taxTMI.toFixed(2);

    // 3. Initialisation des chips de tags du formulaire d'ajout
    renderAssetTagChips();

    // 3b. Synchronise le champ "Seuil de concentration" avec la valeur mémorisée
    const thresholdInput = document.getElementById('inventory-threshold-input');
    if (thresholdInput) thresholdInput.value = Math.round(concentrationThreshold * 100);

    // 3c. Restaure la préférence de teintage + met l'UI du toggle en cohérence
    applyTintClassToBody();
    updateTintToggleUI();

    // 3d. Restaure la préférence de thème clair/sombre (appliqué AVANT
    //     le premier refreshAllUI pour que les graphiques naissent
    //     directement avec les bonnes couleurs de grille)
    applyLightModeClass();

    // 3e. Restaure le mode Paper Trading (flag global + inclusion stats)
    applyPaperModeClass();
    updatePaperToggleUI();

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

    // 9b. Debounce sur la recherche d'actifs (300 ms — évite de spammer CoinGecko)
    const searchInput = document.getElementById('add-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(triggerAssetSearch, 300));
    }

    // 9c. Flag « champ Valeur Actuelle touché » pour ne plus écraser une saisie manuelle
    const addValueInput = document.getElementById('add-value');
    if (addValueInput) {
        addValueInput.addEventListener('input', () => { _addValueTouched = true; });
    }
        // 10. Force l'ouverture du calendrier natif sur tous les champs date (utile sur Firefox/Linux)
        document.querySelectorAll('input[type="date"]').forEach(inp => {
            inp.style.colorScheme = 'dark';
            inp.addEventListener('focus', () => {
                try { if (typeof inp.showPicker === 'function') inp.showPicker(); } catch (_) { /* fallback silencieux */ }
            });
        });

    // 11. Raccourcis clavier globaux : Ctrl+K (palette), Ctrl+Z (undo), Échap
    document.addEventListener('keydown', (e) => {
        // Ctrl+K / Cmd+K → palette de commandes
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            openCommandPalette();
            return;
        }
        // Ctrl+Z / Cmd+Z → annuler la dernière action destructive.
        // On laisse le undo natif du navigateur fonctionner dans les champs
        // texte (INPUT/TEXTAREA/contenteditable) pour ne pas gêner la saisie.
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
            const ae = document.activeElement;
            const tag = ae ? ae.tagName : '';
            const isEditable = tag === 'INPUT' || tag === 'TEXTAREA'
                || (ae && ae.isContentEditable);
            if (isEditable) return;
            e.preventDefault();
            performUndo();
            return;
        }
        if (e.key === 'Escape') {
            // Si la palette est ouverte, c'est elle qui gère son propre Échap
            const palette = document.getElementById('modal-command-palette');
            if (palette && !palette.classList.contains('hidden')) return;
            document.querySelectorAll('.fixed.inset-0:not(.hidden)').forEach(m => m.classList.add('hidden'));
        }
    });

    // 11b. Écouteurs de la palette (recherche + navigation clavier)
    const cmdInput = document.getElementById('cmd-palette-input');
    if (cmdInput) {
        cmdInput.addEventListener('input', () => {
            _cmdPaletteSelectedIndex = 0;
            renderCommandPaletteResults(cmdInput.value);
        });
        cmdInput.addEventListener('keydown', handleCommandPaletteKey);
    }

    // 11c. Enregistrement des actions « annulables ».
    // On monkey-patche les fonctions existantes : chacune capture l'état
    // AVANT son exécution, ce qui permet un undo fiable sans toucher à
    // leur implémentation. Liste blanche = actions destructives/irréversibles.
    const UNDO_WRAPPED_ACTIONS = [
        ['deleteAsset',           'Suppression d\'un actif'],
        ['deleteCession',         'Suppression d\'une cession'],
        ['deleteArbitrage',       'Suppression d\'un arbitrage'],
        ['deleteLot',             'Suppression d\'un lot'],
        ['clearAllData',          'Vidage complet du portefeuille'],
        ['resetData',             'Chargement des données démo'],
        ['handleDuplicateAsset',  'Duplication d\'actif'],
        ['confirmCsvImport',      'Import CSV / Excel'],
        ['restoreLocalBackup',    'Restauration sauvegarde locale'],
        ['pullFromDrive',         'Restauration depuis Google Drive'],
        ['handleEditLot',         'Modification d\'un lot'],
        ['handleManualGoldUpdate','Mise à jour manuelle Or'],
        ['saveManualRefresh',     'Mise à jour manuelle groupée'],
        ['applyReclass',          'Reclassement Action / ETF'],
        ['reassignAssetCadran',   'Réaffectation de cadran']
    ];
    UNDO_WRAPPED_ACTIONS.forEach(([name, label]) => {
        const original = window[name];
        if (typeof original !== 'function') return;
        window[name] = function (...args) {
            pushUndo(label);
            return original.apply(this, args);
        };
    });
        // 12. Initialisation du sélecteur multi-portefeuille
        updatePortfolioLabel();
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('portfolio-menu');
            if (!menu || menu.classList.contains('hidden')) return;
            const wrap = menu.parentElement;
            if (wrap && !wrap.contains(e.target)) closePortfolioMenu();
        });
    // 12. Initialisation du sélecteur multi-portefeuille
    updatePortfolioLabel();
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('portfolio-menu');
        if (!menu || menu.classList.contains('hidden')) return;
        const wrap = menu.parentElement;
        if (wrap && !wrap.contains(e.target)) closePortfolioMenu();
    });

    // 13. Re-rendu des SVG adaptatifs (treemap + heatmap) au resize (debounced)
    window.addEventListener('resize', debounce(() => {
        if (activeTab === 'tab-dashboard') {
            if (dashboardAllocView === 'treemap') renderDashboardTreemap();
            renderCalendarHeatmap();
        }
        // Repositionne le tooltip si visible pendant un redimensionnement
        if (_tooltipCurrentTarget) {
            _tooltipShow(_tooltipCurrentTarget);
        }
    }, 200));

    // 14. Système d'infobulles custom (remplace les title= natifs)
    initCustomTooltips();

    // 15. Filet de sécurité skeleton : si un rendu réel a repeuplé les tables,
    // on purge automatiquement tout skeleton résiduel à chaque refreshAllUI.
    const _originalRefreshAllUI = window.refreshAllUI;
    if (typeof _originalRefreshAllUI === 'function') {
        window.refreshAllUI = function () {
            const r = _originalRefreshAllUI.apply(this, arguments);
            document.querySelectorAll('.skeleton-row').forEach(el => el.remove());
            return r;
        };
    }
});