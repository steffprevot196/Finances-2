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

    // 3d. Restaure la préférence de thème (light / dark / auto) — appliqué
    //     AVANT le premier refreshAllUI pour que les graphiques naissent
    //     directement avec les bonnes couleurs de grille.
    //     Chantier 2.2 : en mode 'auto', on installe un listener matchMedia
    //     pour suivre les changements de mode OS en temps réel.
    applyLightModeClass();
    if (typeof initThemeAutoListener === 'function') {
        initThemeAutoListener();
    }

    // 3d-bis. Chantier 2.6 — Restaure la préférence de densité (confort/compact)
    //          La classe CSS body.density-compact est appliquée immédiatement
    //          pour éviter un flash visuel au premier rendu.
    if (typeof applyDensityClass === 'function') {
        applyDensityClass();
    }

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

    // 8b. Chantier 1.4 — initialisation de la watchlist
    //     (charge depuis localStorage, rend les chips de tags, refresh silencieux des cours périmés)
    if (typeof initWatchlistModule === 'function') {
        initWatchlistModule();
    }

    // 8c. Chantier 1.6 — chargement silencieux du benchmark réel
    //     (si présent en cache IndexedDB, utilisé immédiatement ;
    //      sinon premier fetch silencieux non bloquant en arrière-plan)
    if (typeof getBenchmarkSeries === 'function' && typeof refreshBenchmarkSeries === 'function') {
        getBenchmarkSeries().then(series => {
            if (series && series.length >= 60) {
                // Cache chaud : recalcul immédiat avec le benchmark
                if (typeof calculateRiskMetrics === 'function') calculateRiskMetrics();
                return;
            }
            // Cache froid : premier fetch silencieux (ne bloque pas l'UI)
            setTimeout(() => {
                refreshBenchmarkSeries({ force: true })
                    .then(() => {
                        if (typeof calculateRiskMetrics === 'function') calculateRiskMetrics();
                    })
                    .catch(err => console.info('[Benchmark] Fetch silencieux échoué :', err.message));
            }, 4000);
        }).catch(() => {});
    }

    // 8d. Chantier 1.8 — initialisation de l'optimiseur fiscal
    //     (aucun fetch nécessaire : tout est recalculé à la volée
    //      quand l'onglet Fiscalité est affiché)
    if (typeof initTaxOptimizerModule === 'function') {
        initTaxOptimizerModule();
    }

    // 8e. Chantier 1.10 — initialisation du ledger unifié
    //     (aucun fetch : le ledger est reconstruit à la volée à chaque
    //      rendu de l'onglet Historique)
    if (typeof initLedgerModule === 'function') {
        initLedgerModule();
    }

    // 8f. Chantier 1.9 — initialisation de la configuration FIRE
    //     (charge la config depuis localStorage ; le rendu est déclenché
    //      automatiquement quand l'onglet Objectifs est affiché)
    if (typeof initFireModule === 'function') {
        initFireModule();
    }

    // 8g. Chantier 2.5 — initialisation de l'export PNG des graphiques
    //     (attache automatiquement un bouton 📷 au survol de chaque canvas
    //      Chart.js, y compris ceux créés plus tard via MutationObserver)
    if (typeof initChartExportModule === 'function') {
        initChartExportModule();
    }

    // 8h. Chantier 2.8 — initialisation du feedback haptique mobile
    //     (n'a AUCUN effet sur desktop / Safari iOS : guard automatique
    //      si navigator.vibrate n'est pas supporté)
    if (typeof initHapticsModule === 'function') {
        initHapticsModule();
    }

    // 8i. Chantier 2.10 — initialisation des toasts unifiés
    //     (remplace les alert() d'information par des toasts non bloquants ;
    //      les confirm() restent intacts car une question oui/non
    //      nécessite une réponse bloquante)
    if (typeof initToastsModule === 'function') {
        initToastsModule();
    }

    // 8j. Chantier 2.7 — initialisation des badges « Nouveau / Modifié »
    //     (marque d'un point bleu pulsant les entités importées ou
    //      restaurées pendant la session ; wrap des fonctions d'import
    //      pour détecter automatiquement les nouveautés par diff)
    if (typeof initSessionBadgesModule === 'function') {
        initSessionBadgesModule();
    }

    // 8k. Chantier 2.3 — initialisation de l'onboarding wizard
    //     Affiche le wizard UNIQUEMENT si :
    //       • jamais complété (flag localStorage absent)
    //       • portefeuille vide (aucun actif / cession / arbitrage)
    //     Le léger différé (600 ms) laisse le temps au premier rendu
    //     de s'installer avant de superposer le modal, ce qui évite
    //     un "flash" désagréable au démarrage.
    if (typeof initOnboardingModule === 'function') {
        initOnboardingModule();
        setTimeout(() => {
            if (typeof shouldShowOnboarding === 'function' && shouldShowOnboarding()) {
                openOnboardingModal();
            }
        }, 600);
    }

    // 8l. Chantier 2.4 — initialisation de la bottom-nav mobile
    //     Injecte la barre fixe + le drawer dans le body. Sur desktop
    //     (≥ 768 px), la barre reste masquée et la nav horizontale
    //     d'origine est conservée. Active également les swipes
    //     gauche/droite pour changer d'onglet sur mobile.
    if (typeof initMobileNavModule === 'function') {
        initMobileNavModule();
    }

    // 8m. Chantier 2.1 — initialisation de la sidebar latérale
    //     Sur desktop (≥ 1024 px) : sidebar visible, nav horizontale
    //     masquée. Sur mobile/tablette (< 1024 px) : sidebar masquée,
    //     bottom-nav visible (Chantier 2.4).
    //     ⚠ Doit être initialisée APRÈS la bottom-nav pour que les règles
    //     de masquage CSS s'appliquent dans le bon ordre.
    if (typeof initSidebarModule === 'function') {
        initSidebarModule();
    }

    // 8n. Chantier 1.7 — initialisation du module d'import broker
    //     (Binance / Coinbase / Kraken — lecture seule)
    if (typeof initBrokerImportModule === 'function') {
        initBrokerImportModule();
    }

    // 8n-bis. Chantier 5.3 — initialisation de l'audit CSP
    //         Le module reste dormant par défaut (aucune modification
    //         de comportement). L'audit et le délégateur sont activables
    //         manuellement via la palette Ctrl+K ou la console.
    if (typeof initCspAuditModule === 'function') {
        initCspAuditModule();
    }

    // 8n-bis-2. Activation PERMANENTE du délégateur CSP.
    //          ⚠ INDISPENSABLE depuis le retrait de 'unsafe-inline' de la CSP
    //          (index.html). Sans cet appel, TOUS les attributs onclick=,
    //          onchange=, oninput=, onsubmit=… présents dans le HTML et dans
    //          les chaînes innerHTML générées dynamiquement sont bloqués par
    //          le navigateur → app inutilisable.
    //
    //          Le délégateur (app28-csp-audit.js) rejoue ces handlers sans
    //          recourir à eval/Function (interdits par CSP). Couverture
    //          contrôlable via reportCspReadiness() en console.
    //
    //          Un try/catch défensif évite qu'une erreur inattendue dans le
    //          module CSP ne bloque tout le démarrage de l'application.
    if (typeof enableCspFallbackDelegator === 'function') {
        try {
            enableCspFallbackDelegator();
        } catch (err) {
            console.error('[Boot] Activation du délégateur CSP échouée :', err);
            // L'app reste fonctionnelle en mode dégradé : les handlers
            // inline échoueront, mais le reste du boot continue.
        }
    }

    // 8n-ter. Chantier §3 — initialisation du comparateur CW8
    //         Le rendu est déclenché par renderCw8Comparison() depuis
    //         refreshAllUI sur l'onglet dashboard. On installe un hook
    //         sur refreshBenchmarkSeries() pour re-rendre le comparateur
    //         dès que le benchmark CW8 est téléchargé (dépendance forte :
    //         sans benchmark, le comparateur est en état vide).
    if (typeof initBenchmarkCompareModule === 'function') {
        initBenchmarkCompareModule();
    }

    // 8n-quater. Chantier §3 — initialisation de la vue Timeline
    //             Le module app30-timeline.js installe un hook sur
    //             filterLedgerByKind (app18-ledger.js) et écoute les
    //             changements de filtres pour resynchroniser la vue
    //             timeline quand elle est active. Aucun rendu au boot
    //             (la vue Tableau reste par défaut).
    if (typeof initTimelineModule === 'function') {
        initTimelineModule();
    }

    // 8n-quinquies. Chantier §3 — initialisation du module ESG
    //               Aucun rendu au boot : la carte ESG du dashboard est
    //               rendue automatiquement par refreshAllUI() quand
    //               l'onglet dashboard est actif. On précharge juste le
    //               catalogue + l'aperçu ESG du formulaire si présent.
    if (typeof initEsgModule === 'function') {
        initEsgModule();
    }

    // 8n-sexies. Chantier §3 — initialisation du simulateur PER
    //             Le module app32-per.js charge la config depuis
    //             localStorage. Le rendu est déclenché par
    //             renderPerPanel() quand l'onglet Objectifs est actif.
    if (typeof initPerModule === 'function') {
        initPerModule();
    }

    // 8n-septies. Chantier §4 — initialisation du rapport mensuel
    //              Crée le snapshot du mois courant s'il n'existe pas encore.
    //              Le rendu est déclenché par refreshAllUI() quand l'onglet
    //              dashboard est actif.
    if (typeof initMonthlySnapshotsModule === 'function') {
        initMonthlySnapshotsModule();
    }

    // 8n-octies. Chantier §5 — initialisation de la matrice de corrélation
    //             Le calcul utilise realSeriesCache (déjà peuplé par
    //             primeRealVolCache). Le rendu est déclenché par
    //             refreshAllUI() quand l'onglet dashboard est actif.
    if (typeof initCorrelationModule === 'function') {
        initCorrelationModule();
    }

    // 8n-nonies. Chantier §6 — initialisation du DCA planifié
    //              Le check initial est throttlé (1 h) et différé de 3 s
    //              pour ne pas gêner le premier rendu. Les évaluations
    //              suivantes sont déclenchées par refreshAllUI.
    if (typeof initDcaModule === 'function') {
        initDcaModule();
    }

    // 8n-decies. Chantier §7 — initialisation du waterfall du P&L
    //             Le rendu est déclenché par refreshAllUI() quand l'onglet
    //             dashboard est actif. Aucune initialisation lourde.
    if (typeof initWaterfallModule === 'function') {
        initWaterfallModule();
    }

    // 8n-undecies. Chantier §8 — initialisation du slide-in panel
    //              Injecte le CSS + attache le listener clavier ← / →
    //              + restaure la préférence modale (modal centré vs slide-in).
    if (typeof initSlidePanelModule === 'function') {
        initSlidePanelModule();
    }

    // 8n-duodecies. Chantier §9 — initialisation des filtres sauvegardés
    //               + palette Ctrl+P. Le rendu du menu est fait au boot,
    //               la palette est ouverte à la demande (Ctrl+P).
    if (typeof initSavedFiltersModule === 'function') {
        initSavedFiltersModule();
    }

    // 8n-terdecies. Chantier §10 — initialisation du module de thèses
    //               Le panel est injecté dynamiquement à l'ouverture du
    //               modal de détail actif. La section "Thèses à revoir"
    //               est rendue par refreshAllUI sur l'onglet Accueil.
    if (typeof initThesisModule === 'function') {
        initThesisModule();
    }

    // 8n-quaterdecies. Chantier §9 — initialisation du simulateur de sortie
    //                  progressive (retirement drawdown). Charge la config
    //                  depuis localStorage ; le rendu du panneau est
    //                  déclenché par refreshAllUI sur l'onglet Objectifs.
    if (typeof initWithdrawalModule === 'function') {
        initWithdrawalModule();
    }

    // 8n-quindecies. Chantier #12 — initialisation du module PWA.
    //                • Capture l'événement beforeinstallprompt (bouton
    //                  "Installer" dans le header si éligible).
    //                • Traite les raccourcis du manifest (?tab=xxx)
    //                  différemment du reste du boot (250 ms de délai).
    //                • Écoute les mises à jour du Service Worker pour
    //                  proposer un reload non intrusif.
    //                ⚠ Ne réenregistre PAS le SW : c'est le rôle de
    //                  registerServiceWorker() dans app15-notifications.js,
    //                  appelé juste au-dessus (bloc "19. NOTIFICATIONS SYSTÈME").
    if (typeof initPwaModule === 'function') {
        initPwaModule();
    }

    // 8n-sexdecies. Chantier #10 — initialisation du détecteur de lignes
    //               mortes. Aucun chargement asynchrone : tout est calculé
    //               à la volée par refreshAllUI sur l'onglet dashboard.
    if (typeof initDeadLinesModule === 'function') {
        initDeadLinesModule();
    }

    // 8n-septdecies. Chantier #13 — initialisation du wrapper Web Worker
    //                Monte-Carlo. Aucune action au boot : le Worker est
    //                instancié lazy au premier appel de
    //                runMCWithdrawalAsync() depuis le panneau Withdrawal.
    //                Ce log permet juste de vérifier la disponibilité du
    //                support dans la console.
    if (typeof initMcWorkerModule === 'function') {
        initMcWorkerModule();
    }

    // Hook sur refreshBenchmarkSeries : dès que le benchmark est
    // téléchargé ou rafraîchi, on recalcule le comparateur CW8 et on
    // re-rend si l'onglet dashboard est actif.
    if (typeof refreshBenchmarkSeries === 'function' && !refreshBenchmarkSeries._cw8Hooked) {
        const _origRefreshBenchmark = refreshBenchmarkSeries;
        const _wrappedRefreshBenchmark = async function (...args) {
            const result = await _origRefreshBenchmark.apply(this, args);
            try {
                if (typeof invalidateCw8ComparisonCache === 'function') {
                    invalidateCw8ComparisonCache();
                }
                if (typeof activeTab !== 'undefined' && activeTab === 'tab-dashboard' &&
                    typeof renderCw8Comparison === 'function') {
                    renderCw8Comparison();
                }
            } catch (err) {
                console.warn('[CW8 Compare] Hook refreshBenchmarkSeries échoué :', err);
            }
            return result;
        };
        _wrappedRefreshBenchmark._cw8Hooked = true;
        _wrappedRefreshBenchmark._originalFn = _origRefreshBenchmark;
        window.refreshBenchmarkSeries = _wrappedRefreshBenchmark;
        // Réassignation nécessaire car app6-api.js déclare la fonction avec `async function`
        // (donc attachée à `window` en script classique)
    }

    // 8o. Chantier 5.2 — Boot recovery depuis IndexedDB
    //     Si localStorage est vide (portefeuille neuf ou effacé) MAIS qu'un
    //     snapshot IndexedDB existe pour ce portefeuille, on propose à
    //     l'utilisateur de restaurer. Différé de 1,5 s pour ne pas gêner
    //     l'onboarding ou les premiers rendus.
    setTimeout(async () => {
        try {
            // Conditions : IndexedDB doit être accessible
            if (typeof loadFromIdb !== 'function') return;

            // État courant (après bootMigration + premier refreshAllUI)
            const currentAssetsCount = Array.isArray(assets) ? assets.length : 0;
            const currentCessionsCount = Array.isArray(cessions) ? cessions.length : 0;
            const currentArbCount = Array.isArray(arbitrages) ? arbitrages.length : 0;

            // Ne rien faire si l'utilisateur a déjà des données en mémoire
            if (currentAssetsCount > 0 || currentCessionsCount > 0 || currentArbCount > 0) return;

            // Cherche un snapshot IndexedDB
            const idbData = await loadFromIdb(currentPortfolioId);
            if (!idbData) return;

            const hasIdbAssets = Array.isArray(idbData.assets) && idbData.assets.length > 0;
            const hasIdbCessions = Array.isArray(idbData.cessions) && idbData.cessions.length > 0;
            const hasIdbArb = Array.isArray(idbData.arbitrages) && idbData.arbitrages.length > 0;
            if (!hasIdbAssets && !hasIdbCessions && !hasIdbArb) return;

            // Ne pas interrompre l'onboarding en cours (jamais complété)
            const onboardingDone = localStorage.getItem('patriMonial_onboardingDone') === 'true';
            if (!onboardingDone) return;

            // Snapshot IDB trouvé + portefeuille vide + onboarding déjà fait → proposer
            const idbDate = idbData.updatedAt
                ? new Date(idbData.updatedAt).toLocaleString('fr-FR')
                : 'date inconnue';
            const parts = [];
            if (hasIdbAssets)   parts.push(`${idbData.assets.length} actif(s)`);
            if (hasIdbCessions) parts.push(`${idbData.cessions.length} cession(s)`);
            if (hasIdbArb)      parts.push(`${idbData.arbitrages.length} arbitrage(s)`);

            const msg =
                `Une sauvegarde de secours a été trouvée dans IndexedDB.\n\n` +
                `Date : ${idbDate}\n` +
                `Contenu : ${parts.join(' · ')}\n\n` +
                `Vos données actuelles sont vides. Voulez-vous restaurer ce snapshot ?`;

            if (!confirm(msg)) return;

            // Capture avant restauration (au cas où)
            if (typeof pushUndo === 'function') pushUndo('Restauration IndexedDB (boot)');

            // Restaure (sans écraser si null)
            if (hasIdbAssets)   assets = idbData.assets;
            if (hasIdbCessions) cessions = idbData.cessions;
            if (hasIdbArb)      arbitrages = idbData.arbitrages;

            // Normalise (les snapshots IDB ont pu être créés avant migration)
            assets.forEach(a => { if (typeof migrateAssetToV2 === 'function') migrateAssetToV2(a); });
            cessions.forEach(c => { if (typeof normalizeCession === 'function') normalizeCession(c); });

            // Persiste dans localStorage + refresh
            if (typeof saveToStorage === 'function') saveToStorage();
            if (typeof saveCessions === 'function') saveCessions();
            if (typeof saveArbitrages === 'function') saveArbitrages();
            if (typeof refreshAllUI === 'function') refreshAllUI();

            if (typeof toastSuccess === 'function') {
                toastSuccess(
                    'Données restaurées depuis IndexedDB',
                    `${parts.join(' · ')}`
                );
            }
        } catch (err) {
            console.warn('[Boot Recovery] Échec :', err);
        }
    }, 1500);

    // 8p. Chantier 5.2 — Auto-compaction discrète au boot
    //     Si le portefeuille contient un historique très ancien (> 5 ans)
    //     ou si la taille approche la limite localStorage, on tronque
    //     SILENCIEUSEMENT les points de plus de 3 ans.
    //
    //     Cette opération est :
    //       • non destructive pour les données fiscales (lots/achats/cessions intacts)
    //       • limitée à 1× par semaine (clé localStorage de throttle)
    //       • silencieuse sauf si > 500 points supprimés
    //
    //     Différé de 3 s pour ne pas bloquer le premier rendu.
    setTimeout(() => {
        try {
            // Vérifie la fonction disponible
            if (typeof compactAllHistories !== 'function') return;

            // Throttle : 1× par semaine maximum
            const THROTTLE_KEY = 'patriMonial_lastAutoCompaction';
            const last = parseInt(localStorage.getItem(THROTTLE_KEY) || '0', 10) || 0;
            const ONE_WEEK = 7 * 24 * 3600 * 1000;
            if (Date.now() - last < ONE_WEEK) return;

            // Détecte si une compaction est nécessaire :
            //   • seuil de taille : > 3,5 Mo (marge sous la limite 5 Mo)
            //   • seuil d'âge : plus de 5 ans d'historique cumulé
            let totalBytes = 0;
            try { totalBytes = JSON.stringify(assets).length; } catch (_) {}
            const SIZE_THRESHOLD = 3.5 * 1024 * 1024;

            let hasAncientPoints = false;
            const FIVE_YEARS_AGO = new Date();
            FIVE_YEARS_AGO.setFullYear(FIVE_YEARS_AGO.getFullYear() - 5);

            // Échantillonnage rapide (premiers 5 actifs) pour éviter un scan complet coûteux
            const sampleSize = Math.min(5, assets.length);
            for (let i = 0; i < sampleSize && !hasAncientPoints; i++) {
                const h = assets[i].history || [];
                for (const pt of h) {
                    const d = typeof parseFlexDate === 'function' ? parseFlexDate(pt.date) : null;
                    if (d && d < FIVE_YEARS_AGO) { hasAncientPoints = true; break; }
                }
            }

            const needsCompaction = totalBytes > SIZE_THRESHOLD || hasAncientPoints;
            if (!needsCompaction) {
                // Marque quand même pour éviter de rescanner à chaque boot
                localStorage.setItem(THROTTLE_KEY, String(Date.now()));
                return;
            }

            // Applique la compaction sur 3 ans (compromis : garde assez de
            // données pour les graphiques annuels tout en réduisant la taille)
            const result = compactAllHistories(3);

            // Enregistre le throttle
            localStorage.setItem(THROTTLE_KEY, String(Date.now()));

            if (result.pointsRemoved > 0) {
                // Persiste + mirror IDB
                if (typeof saveToStorage === 'function') saveToStorage();
                if (typeof forceIdbMirror === 'function') forceIdbMirror().catch(() => {});

                // Invalide les caches dépendants
                if (typeof _sparklineCache !== 'undefined' && _sparklineCache.clear) _sparklineCache.clear();

                // Notifie l'utilisateur uniquement si l'opération est significative
                if (result.pointsRemoved > 500 && typeof toastInfo === 'function') {
                    toastInfo(
                        'Historique compacté automatiquement',
                        `${result.pointsRemoved.toLocaleString('fr-FR')} point(s) ancien(s) supprimé(s) (données fiscales préservées).`,
                        { duration: 6000 }
                    );
                } else {
                    console.info(`[Auto-Compaction] ${result.pointsRemoved} point(s) supprimé(s) silencieusement.`);
                }

                // Refresh si l'onglet dashboard est actif (les graphiques changent)
                if (typeof activeTab !== 'undefined' && activeTab === 'tab-dashboard' &&
                    typeof initDashboardCharts === 'function') {
                    initDashboardCharts();
                }
            }
        } catch (err) {
            console.warn('[Auto-Compaction] Échec :', err);
        }
    }, 3000);

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

    // 9c-bis. Chantier §3 — aperçu ESG en temps réel dans le formulaire
    const esgInput = document.getElementById('add-esg-score');
    if (esgInput && typeof updateEsgPreview === 'function') {
        esgInput.addEventListener('input', updateEsgPreview);
    }
    const tickerInput = document.getElementById('add-ticker');
    if (tickerInput && typeof updateEsgPreview === 'function') {
        tickerInput.addEventListener('input', updateEsgPreview);
    }

    // 9d. Flag « champ Taux de change touché » (Chantier 1.2)
    //     Empêche _autoFillFxRate d'écraser une saisie manuelle de l'utilisateur
    //     pendant que la requête API Frankfurter est en vol.
    const addFxRateInput = document.getElementById('add-fx-rate');
    if (addFxRateInput) {
        addFxRateInput.addEventListener('input', () => { _addFxRateTouched = true; });
    }

    // 9e. Re-fetch du taux de change quand la date d'achat change (Chantier 1.2)
    //     Seulement si l'utilisateur n'a pas saisi un taux manuellement, et si
    //     la devise courante n'est pas EUR.
    const addPurchaseDateInput = document.getElementById('add-purchase-date');
    if (addPurchaseDateInput) {
        addPurchaseDateInput.addEventListener('change', () => {
            const curSel = document.getElementById('add-currency');
            if (!curSel || curSel.value === 'EUR') return;
            if (_addFxRateTouched) return;   // l'utilisateur a saisi un taux manuel
            const dateVal = addPurchaseDateInput.value;
            if (typeof _autoFillFxRate === 'function') {
                _autoFillFxRate(curSel.value, dateVal);
            }
        });
    }

    // 9f. Préchargement des taux de change pour les devises déjà présentes
    //     dans le portefeuille (non bloquant, Chantier 1.2).
    if (typeof preloadUsedCurrencies === 'function') {
        preloadUsedCurrencies().catch(err => console.warn('[FX] Préchargement échoué :', err));
    }
        // 10. Force l'ouverture du calendrier natif sur tous les champs date (utile sur Firefox/Linux)
        document.querySelectorAll('input[type="date"]').forEach(inp => {
            inp.style.colorScheme = 'dark';
            inp.addEventListener('focus', () => {
                try { if (typeof inp.showPicker === 'function') inp.showPicker(); } catch (_) { /* fallback silencieux */ }
            });
        });

    // 11. Raccourcis clavier globaux : Ctrl+K (palette), Ctrl+P (recherche rapide), Ctrl+Z (undo), Échap
    document.addEventListener('keydown', (e) => {
        // Ctrl+K / Cmd+K → palette de commandes
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            openCommandPalette();
            return;
        }
        // Ctrl+P / Cmd+P → recherche rapide d'actifs (Chantier §9)
        // (on empêche le comportement natif du navigateur qui ouvre l'impression)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p' && !e.shiftKey) {
            e.preventDefault();
            if (typeof openQuickSearch === 'function') openQuickSearch();
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
        '#tab-accueil > div, #tab-dashboard > div, #tab-inventaire > div, #tab-gave > div, ' +
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