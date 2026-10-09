// =====================================================================
// app23-session-badges.js — BADGE « NOUVEAU / MODIFIÉ » (Chantier 2.7)
// Dépend de : app1-core.js (escapeHTML)
// Charge après app22-toasts.js, avant app7-init.js
// =====================================================================
//
// Marque d'un petit point bleu pulsant les entités (actifs, cessions,
// arbitrages) qui viennent d'être importées ou restaurées pendant la
// session en cours.
//
// Cas d'usage :
//   • Import JSON PatriMonial → les actifs importés sont badgés
//   • Restauration depuis Drive → idem
//   • Restauration sauvegarde locale → idem
//   • Import CSV → les actifs créés sont badgés
//
// Le badge disparaît :
//   • au bout de SESSION_BADGE_DURATION ms (5 minutes par défaut)
//   • si l'utilisateur clique dessus
//   • au rechargement de la page (volontairement session-scoped)
//
// ⚠ Aucune persistance localStorage : c'est un indicateur visuel
// strictement limité à la session courante.

const SESSION_BADGE_DURATION = 5 * 60 * 1000;   // 5 minutes
const SESSION_BADGE_KINDS = ['asset', 'cession', 'arbitrage'];

// Map : clé = 'asset_123', valeur = { kind, id, at, timer }
const sessionBadgeMap = new Map();

let _sessionBadgeCleanupTimer = null;

// ---------------------------------------------------------------------
// API PRINCIPALE
// ---------------------------------------------------------------------

// Marque une entité comme « nouvelle » pour la session.
//   kind : 'asset' | 'cession' | 'arbitrage'
//   id   : identifiant numérique ou string de l'entité
function markSessionNew(kind, id) {
    if (!SESSION_BADGE_KINDS.includes(kind)) return;
    if (id === undefined || id === null) return;

    const key = kind + '_' + id;
    // Si déjà marqué, on rafraîchit simplement le timestamp
    if (sessionBadgeMap.has(key)) {
        sessionBadgeMap.get(key).at = Date.now();
        return;
    }

    const entry = {
        kind, id,
        at: Date.now(),
        timer: null
    };
    // Auto-suppression après la durée
    entry.timer = setTimeout(() => {
        clearSessionBadge(kind, id);
    }, SESSION_BADGE_DURATION);

    sessionBadgeMap.set(key, entry);
}

// Marque un ensemble d'entités d'un seul coup.
function markSessionNewBatch(kind, ids) {
    if (!Array.isArray(ids)) return;
    ids.forEach(id => markSessionNew(kind, id));
}

// Retire le badge d'une entité (clic utilisateur ou expiration).
function clearSessionBadge(kind, id) {
    const key = kind + '_' + id;
    const entry = sessionBadgeMap.get(key);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    sessionBadgeMap.delete(key);
    // Re-render si la fonction est disponible (feedback immédiat)
    if (typeof _refreshSessionBadgesUI === 'function') {
        _refreshSessionBadgesUI();
    }
}

// Vérifie si une entité est marquée.
function isSessionNew(kind, id) {
    return sessionBadgeMap.has(kind + '_' + id);
}

// Compte les entités marquées (par kind ou au total).
function countSessionNew(kind) {
    if (!kind) return sessionBadgeMap.size;
    let count = 0;
    sessionBadgeMap.forEach(e => { if (e.kind === kind) count++; });
    return count;
}

// ---------------------------------------------------------------------
// RENDU DU BADGE
// ---------------------------------------------------------------------
// Renvoie un span HTML (vide si non marqué) à insérer juste après le nom.
// Le badge est un petit point bleu pulsant + tooltip explicatif.
function sessionBadgeHTML(kind, id) {
    if (!isSessionNew(kind, id)) return '';
    const key = kind + '_' + id;
    return ` <span class="session-badge" data-session-badge="${key}" title="Nouveau / modifié dans cette session — cliquez pour masquer" onclick="event.stopPropagation(); clearSessionBadge('${kind}', ${JSON.stringify(id)});">
        <span class="session-badge-dot"></span>
    </span>`;
}

// Force le re-rendu des tables principales (appelé après auto-expiration
// ou clear manuel). On évite refreshAllUI() pour ne pas tout recalculer.
function _refreshSessionBadgesUI() {
    if (typeof renderInventoryTable === 'function') renderInventoryTable();
    if (typeof renderCryptoTable === 'function') renderCryptoTable();
    if (typeof renderHorsGaveTable === 'function') renderHorsGaveTable();
    if (typeof renderGaveDetailTable === 'function') renderGaveDetailTable();
    if (typeof renderCessionsTable === 'function') renderCessionsTable();
    if (typeof renderArbitragesTable === 'function') renderArbitragesTable();
    if (typeof renderLedgerTab === 'function' && activeTab === 'tab-ledger') renderLedgerTab();
}

// ---------------------------------------------------------------------
// WRAP DES FONCTIONS D'IMPORT / RESTAURATION
// ---------------------------------------------------------------------
// Pour chaque fonction, on capture l'état AVANT l'appel (liste des ids
// existants), puis APRÈS l'appel on marque les ids nouveaux.

function _wrapImportFunction(fnName) {
    const original = window[fnName];
    if (typeof original !== 'function') return;
    if (original._sessionBadgeWrapped) return;

    const wrapped = function (...args) {
        // Snapshot AVANT
        const beforeAssetIds   = new Set((typeof assets !== 'undefined' ? assets : []).map(a => a.id));
        const beforeCessionIds = new Set((typeof cessions !== 'undefined' ? cessions : []).map(c => c.id));
        const beforeArbIds     = new Set((typeof arbitrages !== 'undefined' ? arbitrages : []).map(a => a.id));

        const result = original.apply(this, args);

        // Si la fonction retourne une promesse, on diffère la comparaison
        const compare = () => {
            // Détecte les nouveaux ids
            const newAssetIds = (typeof assets !== 'undefined' ? assets : [])
                .map(a => a.id).filter(id => !beforeAssetIds.has(id));
            const newCessionIds = (typeof cessions !== 'undefined' ? cessions : [])
                .map(c => c.id).filter(id => !beforeCessionIds.has(id));
            const newArbIds = (typeof arbitrages !== 'undefined' ? arbitrages : [])
                .map(a => a.id).filter(id => !beforeArbIds.has(id));

            if (newAssetIds.length)   markSessionNewBatch('asset', newAssetIds);
            if (newCessionIds.length) markSessionNewBatch('cession', newCessionIds);
            if (newArbIds.length)     markSessionNewBatch('arbitrage', newArbIds);

            const total = newAssetIds.length + newCessionIds.length + newArbIds.length;
            if (total > 0) {
                // Toast d'information (le module 2.10 est déjà chargé)
                if (typeof toastInfo === 'function') {
                    const parts = [];
                    if (newAssetIds.length)   parts.push(`${newAssetIds.length} actif(s)`);
                    if (newCessionIds.length) parts.push(`${newCessionIds.length} cession(s)`);
                    if (newArbIds.length)     parts.push(`${newArbIds.length} arbitrage(s)`);
                    toastInfo(
                        `${total} élément(s) marqué(s) comme nouveaux`,
                        parts.join(' · ') + ' — un point bleu apparaît sur les lignes concernées.'
                    );
                }
                _refreshSessionBadgesUI();
            }
        };

        if (result && typeof result.then === 'function') {
            // Fonction async : on attend la fin
            return result.then(r => { compare(); return r; })
                         .catch(err => { compare(); throw err; });
        }
        // Fonction sync
        compare();
        return result;
    };

    wrapped._sessionBadgeWrapped = true;
    wrapped._originalFn = original;
    window[fnName] = wrapped;
}

// ---------------------------------------------------------------------
// INITIALISATION
// ---------------------------------------------------------------------
function initSessionBadgesModule() {
    // Wrap des fonctions d'import / restauration
    [
        'handleImportJSON',
        'restoreLocalBackup',
        'pullFromDrive',
        'confirmCsvImport'
    ].forEach(_wrapImportFunction);

    console.info('[SessionBadges] Module initialisé.');
}

// Expose l'API globalement
window.markSessionNew        = markSessionNew;
window.markSessionNewBatch   = markSessionNewBatch;
window.clearSessionBadge     = clearSessionBadge;
window.isSessionNew          = isSessionNew;
window.sessionBadgeHTML      = sessionBadgeHTML;
window.countSessionNew       = countSessionNew;