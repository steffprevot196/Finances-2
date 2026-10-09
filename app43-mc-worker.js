// =====================================================================
// app43-mc-worker.js — WRAPPER WEB WORKER MONTE-CARLO (Chantier #13)
// Dépend de : monte-carlo-worker.js (le Worker lui-même)
// Charge après app42-dead-lines.js, avant tests.js
// =====================================================================
//
// Expose une API async au reste de l'app pour lancer une simulation
// Monte-Carlo dans un thread séparé sans geler l'UI.
//
// ARCHITECTURE :
//   • Singleton lazy : le Worker n'est créé qu'au premier appel
//   • Corrélation requestId ↔ Promise via une Map
//   • Timeout de sécurité (30 s) pour ne jamais laisser une Promise pendre
//   • Fallback synchrone automatique si :
//       - l'API Worker n'est pas disponible (vieux navigateur, file://)
//       - l'instanciation échoue (CSP, chemin invalide…)
//       - le Worker plante en cours de session (marqué `broken` à vie)
//   • Terminaison propre via terminateMCWorker() pour les tests

const MC_WORKER_URL = './monte-carlo-worker.js';
const MC_WORKER_TIMEOUT_MS = 30 * 1000;   // 30 s : très large, une simulation
                                          // 5000 paths prend < 1 s en pratique

// ---------------------------------------------------------------------
// ÉTAT INTERNE (module-level, non exporté)
// ---------------------------------------------------------------------
let _mcWorkerInstance = null;
let _mcWorkerBroken = false;            // une fois cassé, on n'y revient plus
let _mcRequestCounter = 0;
const _mcPendingRequests = new Map();   // requestId → { resolve, reject, timer }

// ---------------------------------------------------------------------
// DÉTECTION DE SUPPORT
// ---------------------------------------------------------------------
// Trois conditions cumulatives :
//   1. L'API Worker est présente dans window
//   2. Le protocole n'est pas file:// (les Workers y sont bloqués pour
//      des raisons de sécurité par tous les navigateurs modernes)
//   3. Le contexte n'est pas un iframe sandboxé sans allow-scripts
//      (détection simple : try/catch sur new Worker plus loin)
function _isWorkerSupported() {
    if (typeof Worker === 'undefined') return false;
    if (typeof location === 'undefined') return false;
    if (location.protocol === 'file:') return false;
    return true;
}

// ---------------------------------------------------------------------
// GESTION DES MESSAGES DU WORKER
// ---------------------------------------------------------------------
function _onWorkerMessage(event) {
    const data = event.data || {};
    const { requestId, ok, result, error } = data;

    const pending = _mcPendingRequests.get(requestId);
    if (!pending) return;   // requête déjà résolue (timeout) ou inconnue

    clearTimeout(pending.timer);
    _mcPendingRequests.delete(requestId);

    if (ok) {
        pending.resolve(result);
    } else {
        pending.reject(new Error(error || 'Worker returned error'));
    }
}

function _onWorkerError(event) {
    // Une erreur fatale du Worker (import manquant, crash mémoire, etc.)
    // invalide toutes les requêtes en vol. On marque le Worker comme
    // définitivement cassé et on laisse le fallback sync prendre le relais.
    console.warn('[MCWorker] Erreur fatale :', event.message || 'inconnue');
    _mcWorkerBroken = true;

    // Rejette toutes les requêtes en attente
    _mcPendingRequests.forEach((p) => {
        clearTimeout(p.timer);
        p.reject(new Error('Worker fatal error: ' + (event.message || 'unknown')));
    });
    _mcPendingRequests.clear();

    // Termine et libère la référence
    if (_mcWorkerInstance) {
        try { _mcWorkerInstance.terminate(); } catch (_) {}
        _mcWorkerInstance = null;
    }
}

// ---------------------------------------------------------------------
// INSTANCIATION LAZY
// ---------------------------------------------------------------------
// Renvoie le Worker existant, en crée un nouveau si nécessaire, ou
// renvoie null si le support est indisponible / le Worker est cassé.
function _getWorker() {
    if (_mcWorkerBroken) return null;
    if (_mcWorkerInstance) return _mcWorkerInstance;
    if (!_isWorkerSupported()) return null;

    try {
        const w = new Worker(MC_WORKER_URL);
        w.addEventListener('message', _onWorkerMessage);
        w.addEventListener('error', _onWorkerError);
        _mcWorkerInstance = w;
        return w;
    } catch (err) {
        // Échec d'instanciation synchrone (URL invalide, CSP, etc.)
        console.warn('[MCWorker] Instanciation échouée, fallback sync activé :', err);
        _mcWorkerBroken = true;
        _mcWorkerInstance = null;
        return null;
    }
}

// ---------------------------------------------------------------------
// APPEL ASYNCHRONE GÉNÉRIQUE
// ---------------------------------------------------------------------
// Envoie un message au Worker et retourne une Promise corrélée par
// requestId. Timeout de sécurité.
function _callWorker(type, payload) {
    return new Promise((resolve, reject) => {
        const worker = _mcWorkerInstance;
        if (!worker) {
            reject(new Error('Worker non disponible'));
            return;
        }

        const requestId = 'mc_' + (++_mcRequestCounter) + '_' + Date.now();

        const timer = setTimeout(() => {
            _mcPendingRequests.delete(requestId);
            reject(new Error('Monte-Carlo timeout (' + MC_WORKER_TIMEOUT_MS + ' ms)'));
        }, MC_WORKER_TIMEOUT_MS);

        _mcPendingRequests.set(requestId, { resolve, reject, timer });

        try {
            worker.postMessage({ requestId, type, payload });
        } catch (err) {
            clearTimeout(timer);
            _mcPendingRequests.delete(requestId);
            reject(err);
        }
    });
}

// ---------------------------------------------------------------------
// FALLBACK SYNCHRONE — WITHdrawal
// ---------------------------------------------------------------------
// Reproduit EXACTEMENT la boucle du Worker pour garantir des résultats
// statistiquement cohérents entre les deux modes. Utilisé quand le
// Worker n'est pas disponible ou a planté.
//
// Le main thread est bloqué pendant ~200 ms — acceptable puisque ce
// fallback ne s'active que sur les navigateurs/contextes rares où le
// Worker est indisponible.
function _runWithdrawalSync(payload) {
    const {
        current,
        monthlyAmount,
        months,
        meanMonthly,
        volMonthly,
        numPaths
    } = payload;

    // Validation identique au Worker
    if (!Number.isFinite(current) || current <= 0) return { error: 'invalid_current' };
    if (!Number.isFinite(months) || months < 1) return { error: 'invalid_months' };
    if (!Number.isFinite(numPaths) || numPaths < 1) return { error: 'invalid_numPaths' };

    // Box-Muller local (identique à celui du Worker)
    function gaussian() {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    const finalValues = [];
    const depletionMonths = [];
    let successCount = 0;

    for (let i = 0; i < numPaths; i++) {
        let val = current;
        let depletedAt = null;
        for (let m = 0; m < months; m++) {
            const r = meanMonthly + volMonthly * gaussian();
            val = val * (1 + r) - monthlyAmount;
            if (val <= 0) {
                val = 0;
                depletedAt = m + 1;
                break;
            }
        }
        if (depletedAt === null) {
            successCount++;
            finalValues.push(val);
        } else {
            depletionMonths.push(depletedAt);
        }
    }

    finalValues.sort((a, b) => a - b);
    depletionMonths.sort((a, b) => a - b);

    const pctile = (arr, p) => arr.length ? arr[Math.floor(arr.length * p)] : 0;

    return {
        successProb: successCount / numPaths,
        failureCount: numPaths - successCount,
        medianFinal: pctile(finalValues, 0.50),
        p10Final:    pctile(finalValues, 0.10),
        p90Final:    pctile(finalValues, 0.90),
        medianDepletionYear: depletionMonths.length
            ? Math.round(depletionMonths[Math.floor(depletionMonths.length / 2)] / 12 * 10) / 10
            : null
    };
}

// ---------------------------------------------------------------------
// API PUBLIQUE — WITHdrawal
// ---------------------------------------------------------------------
// Le seul point d'entrée utilisé par app40-withdrawal.js.
//
// Payload attendu :
//   { current, monthlyAmount, months, meanMonthly, volMonthly, numPaths }
//
// Retourne la même structure que le Worker (successProb, p10Final, etc.)
// ou lève une exception si le payload est invalide.
async function runMCWithdrawalAsync(payload) {
    // Stratégie :
    //   1. Si Worker disponible → appel async
    //   2. Si l'appel échoue (timeout, erreur, plantage) → fallback sync
    //   3. Si Worker indisponible dès le départ → fallback sync immédiat
    const worker = _getWorker();

    if (!worker) {
        // Fallback direct — on log une fois pour information, mais on
        // n'alerte pas l'utilisateur (dégradation invisible pour lui).
        return _runWithdrawalSync(payload);
    }

    try {
        const result = await _callWorker('withdrawal', payload);
        return result;
    } catch (err) {
        console.warn('[MCWorker] Appel async échoué, fallback sync :', err.message);
        _mcWorkerBroken = true;
        if (_mcWorkerInstance) {
            try { _mcWorkerInstance.terminate(); } catch (_) {}
            _mcWorkerInstance = null;
        }
        return _runWithdrawalSync(payload);
    }
}

// ---------------------------------------------------------------------
// UTILITAIRES DE DEBUG / TESTS
// ---------------------------------------------------------------------
// Terminaison manuelle du Worker (utilisé par les tests ou par une
// éventuelle commande Ctrl+K). Après terminate(), le prochain appel
// recréera un Worker si le support est disponible et non cassé.
function terminateMCWorker() {
    if (_mcWorkerInstance) {
        try { _mcWorkerInstance.terminate(); } catch (_) {}
        _mcWorkerInstance = null;
    }
    _mcPendingRequests.forEach((p) => {
        clearTimeout(p.timer);
        p.reject(new Error('Worker terminated'));
    });
    _mcPendingRequests.clear();
}

// Retourne l'état interne du module (utile pour tests et debug console).
function getMCWorkerStatus() {
    return {
        supported: _isWorkerSupported(),
        initialized: _mcWorkerInstance !== null,
        broken: _mcWorkerBroken,
        pendingCount: _mcPendingRequests.size
    };
}

// Force le reset complet du module (debug/tests uniquement).
// À appeler avec précaution : casse les Promesses en attente.
function resetMCWorkerState() {
    terminateMCWorker();
    _mcWorkerBroken = false;
    _mcRequestCounter = 0;
}

// ---------------------------------------------------------------------
// INITIALISATION
// ---------------------------------------------------------------------
function initMcWorkerModule() {
    // Aucune action au boot : le Worker est instancié lazy au premier
    // appel de runMCWithdrawalAsync(). On log juste l'état du support
    // pour information dans la console.
    const supported = _isWorkerSupported();
    console.info('[MCWorker] Wrapper chargé — support : ' + (supported ? 'activé (lazy)' : 'désactivé (fallback sync)'));
}

// ---------------------------------------------------------------------
// API GLOBALE
// ---------------------------------------------------------------------
window.runMCWithdrawalAsync = runMCWithdrawalAsync;
window.terminateMCWorker = terminateMCWorker;
window.getMCWorkerStatus = getMCWorkerStatus;
window.resetMCWorkerState = resetMCWorkerState;
window.initMcWorkerModule = initMcWorkerModule;

// Expose aussi le fallback sync pour les tests unitaires (l'appel direct
// permet de tester la cohérence des résultats sans dépendre du Worker).
window._runWithdrawalSync = _runWithdrawalSync;