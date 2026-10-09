// =====================================================================
// monte-carlo-worker.js — WEB WORKER POUR LES SIMULATIONS (Chantier #13)
// ---------------------------------------------------------------------
// Déport des boucles Monte-Carlo dans un thread séparé pour ne pas
// geler l'UI quand plusieurs simulations tournent en série (notamment
// sur l'onglet Objectifs où 4 MC cohabitent).
//
// ARCHITECTURE :
//   • Un dispatcher unique reçoit { requestId, type, payload }
//   • Chaque `type` a son handler dédié (fonction pure)
//   • Le résultat est posté avec le même requestId → corrélation
//
// CONTRAINTES :
//   • Aucune dépendance (pas d'accès à window, assets, formatEUR…)
//   • Seuls Math.* et les API du Worker sont disponibles
//   • Déterministe en apparence (Math.random reste stochastique)
//
// VERSION : à synchroniser avec SW_VERSION de sw.js quand le fichier
// change (le Worker est précaché via APP_SHELL côté PWA).
// =====================================================================

const MC_WORKER_VERSION = 'v1.0.0';

// ---------------------------------------------------------------------
// UTILITAIRES PARTAGÉS
// ---------------------------------------------------------------------

// Tirage gaussien (Box-Muller). Identique à celui de app40-withdrawal.js
// et des autres simulateurs pour garantir la cohérence statistique des
// résultats entre le mode Worker et le mode fallback synchrone.
function _gaussian() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Percentile générique sur un tableau TRIÉ.
function _pctile(sortedArr, p) {
    return sortedArr.length ? sortedArr[Math.floor(sortedArr.length * p)] : 0;
}

// ---------------------------------------------------------------------
// HANDLER 1 — WITHdrawal (sortie progressive)
// ---------------------------------------------------------------------
// Reproduit exactement la boucle de runWithdrawalMonteCarlo() de
// app40-withdrawal.js, à une différence près : les paramètres mensuels
// (meanMonthly, volMonthly) sont calculés côté main thread et passés
// en payload — le Worker ne fait QUE la partie stochastique.
//
// Retourne uniquement les agrégats statistiques finaux ; les métadonnées
// (initialCapital, volAnnual, realAnnualReturn) sont ajoutées par le
// main thread à la réception.
function _runWithdrawal(payload) {
    const {
        current,
        monthlyAmount,
        months,
        meanMonthly,
        volMonthly,
        numPaths
    } = payload;

    // Validation défensive : le Worker ne doit jamais planter silencieusement
    if (!Number.isFinite(current) || current <= 0) {
        return { error: 'invalid_current' };
    }
    if (!Number.isFinite(months) || months < 1) {
        return { error: 'invalid_months' };
    }
    if (!Number.isFinite(numPaths) || numPaths < 1) {
        return { error: 'invalid_numPaths' };
    }

    const finalValues = [];
    const depletionMonths = [];
    let successCount = 0;

    for (let i = 0; i < numPaths; i++) {
        let val = current;
        let depletedAt = null;

        for (let m = 0; m < months; m++) {
            const r = meanMonthly + volMonthly * _gaussian();
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

    return {
        successProb: successCount / numPaths,
        failureCount: numPaths - successCount,
        medianFinal: _pctile(finalValues, 0.50),
        p10Final:    _pctile(finalValues, 0.10),
        p90Final:    _pctile(finalValues, 0.90),
        medianDepletionYear: depletionMonths.length
            ? Math.round(depletionMonths[Math.floor(depletionMonths.length / 2)] / 12 * 10) / 10
            : null
    };
}

// ---------------------------------------------------------------------
// DISPATCHER
// ---------------------------------------------------------------------
// Point d'entrée unique du Worker. Reçoit un message du main thread,
// route vers le handler correspondant, poste la réponse.
//
// Format entrant : { requestId, type, payload }
// Format sortant  : { requestId, type, ok, result?, error? }
self.addEventListener('message', (event) => {
    const data = event.data || {};
    const { requestId, type, payload } = data;

    // Ignore les messages malformés (aucune exception levée)
    if (!requestId || !type) return;

    try {
        let result;

        switch (type) {
            case 'withdrawal':
                result = _runWithdrawal(payload);
                break;

            // Handlers réservés pour évolution future :
            // case 'goal':     result = _runGoal(payload);     break;
            // case 'fire':     result = _runFire(payload);     break;
            // case 'per':      result = _runPer(payload);      break;

            default:
                throw new Error('Type de simulation inconnu : ' + type);
        }

        // Erreur signalée par le handler lui-même (payload invalide)
        if (result && result.error) {
            self.postMessage({ requestId, type, ok: false, error: result.error });
            return;
        }

        self.postMessage({ requestId, type, ok: true, result });

    } catch (err) {
        // Exception inattendue : on renvoie l'erreur au main thread
        // plutôt que de laisser le Worker mourir.
        self.postMessage({
            requestId,
            type,
            ok: false,
            error: (err && err.message) ? err.message : 'Worker error'
        });
    }
});

// ---------------------------------------------------------------------
// LOG DE DÉMARRAGE
// ---------------------------------------------------------------------
// Visible dans la console du main thread via les DevTools
// (onglet Sources → Workers → monte-carlo-worker.js).
console.info('[MCWorker] ' + MC_WORKER_VERSION + ' démarré — handler: withdrawal');