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

    // 16. Menu scénarios Paper Trading :
    //     - fermeture au clic extérieur
    //     - rendu initial
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('paper-scenario-menu');
        if (!menu || menu.classList.contains('hidden')) return;
        const wrap = menu.parentElement;
        if (wrap && !wrap.contains(e.target)) closePaperScenarioMenu();
    });
    renderPaperScenarioMenu();

    // 17. RAFFINEMENTS GRAPHIQUES — animations d'entrée au scroll
    // On observe les sections principales (tab-content) : à chaque fois
    // qu'une section devient visible (changement d'onglet, scroll), on
    // applique une animation d'apparition douce.
    const _revealSections = document.querySelectorAll(
        '#tab-dashboard > div, #tab-inventaire > div, #tab-gave > div, ' +
        '#tab-crypto > div, #tab-hors-gave > div, #tab-piliers > div, ' +
        '#tab-annee-n1 > div, #tab-strategies > div, #tab-objectifs > div'
    );
    _revealSections.forEach(el => el.classList.add('pm-reveal'));

    const _revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('pm-revealed');
                _revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.05, rootMargin: '0px 0px -30px 0px' });

    _revealSections.forEach(el => _revealObserver.observe(el));

    // Ré-observe quand on change d'onglet (les sections cachées ne sont
    // pas observées tant qu'elles restent à display:none par Tailwind).
    const _origSwitchTab = window.switchTab;
    if (typeof _origSwitchTab === 'function') {
        window.switchTab = function (tabId) {
            const r = _origSwitchTab.apply(this, arguments);
            setTimeout(() => {
                document.querySelectorAll('#' + tabId + ' > div').forEach(el => {
                    if (!el.classList.contains('pm-revealed')) {
                        el.classList.add('pm-reveal');
                        _revealObserver.observe(el);
                    }
                });
            }, 40);
            return r;
        };
    }

    // Pulse discret sur les KPI quand leur valeur change
    // On observe les éléments avec id="stat-*" via MutationObserver.
    const _kpiObserver = new MutationObserver((mutations) => {
        mutations.forEach(m => {
            const el = m.target;
            if (!el || el._pmPulsing) return;
            el._pmPulsing = true;
            el.classList.add('pm-pulse');
            setTimeout(() => {
                el.classList.remove('pm-pulse');
                el._pmPulsing = false;
            }, 560);
        });
    });
    document.querySelectorAll('[id^="stat-"]').forEach(el => {
        _kpiObserver.observe(el, { characterData: true, childList: true, subtree: true });
    });

    // 18. SAUVEGARDE AUTOMATIQUE DRIVE
    // Vérifie si un push silencieux est opportun (dernière sauvegarde > 24 h,
    // connexion Drive active, clé maîtresse mémorisée). Ne fait rien si l'une
    // des conditions n'est pas remplie — pas de popup surprise.
    if (typeof checkAndRunAutoDriveBackup === 'function') {
        checkAndRunAutoDriveBackup();
    }

    // 19. NOTIFICATIONS SYSTÈME — initialisation
    // a) Enregistre le Service Worker (nécessaire pour que sw.js soit actif)
    if (typeof registerServiceWorker === 'function') {
        registerServiceWorker();
    }
    // b) Synchronise l'UI du panneau dans le modal Alertes (état de la permission)
    if (typeof updateNativeNotifUI === 'function') {
        updateNativeNotifUI();
    }

    // Écoute les messages du Service Worker (clic sur une notification système)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
            const data = event.data || {};
            if (data.type === 'NOTIFICATION_CLICKED') {
                // Focus sur le dashboard + scroll vers les alertes
                if (typeof switchTab === 'function') switchTab('tab-dashboard');
                setTimeout(() => {
                    const zone = document.getElementById('alerts-banner-zone');
                    if (zone) zone.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 150);
                if (typeof showUndoToast === 'function') {
                    showUndoToast('Retour depuis une notification système.', false);
                }
            }
        });
    }

    // Certains navigateurs mettent à jour la permission sans événement —
    // on revérifie périodiquement (léger, toutes les 30 s) pour rafraîchir l'UI.
    setInterval(() => {
        if (typeof updateNativeNotifUI === 'function') updateNativeNotifUI();
    }, 30000);
});