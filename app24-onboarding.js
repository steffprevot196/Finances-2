// =====================================================================
// app24-onboarding.js — ONBOARDING WIZARD (Chantier 2.3)
// Dépend de : app1-core.js (assets, formatEUR, taxRegimeMode…)
// Charge après app23-session-badges.js, avant app7-init.js
// =====================================================================
//
// À la PREMIÈRE utilisation (aucune donnée, jamais vu l'onboarding),
// affiche un assistant en 4 étapes :
//
//   1. Montant investi initial     → crée un premier actif générique
//   2. Profil fiscal & risque      → définit TMI + seuil de concentration
//   3. Sauvegarde Google Drive     → propose la configuration
//   4. Premier objectif            → invite à créer un objectif
//
// Le wizard peut être :
//   • Complété → flag persistant, ne réapparaît plus
//   • Fermé prématurément → réapparaîtra au prochain lancement (sauf skip définitif)
//   • Relancé à la demande via "Aide → Refaire l'onboarding" (menu commandes)

const ONBOARDING_DONE_KEY = 'patriMonial_onboardingDone';
const ONBOARDING_STEP_KEY = 'patriMonial_onboardingStep';   // step actuel (0-3)

// État du wizard (mémoire volatile, reset à chaque ouverture)
let onboardingState = {
    step: 0,
    totalSteps: 4,
    data: {
        // Étape 1
        initialAmount: 0,
        initialName: '',
        // Étape 2
        tmi: 0.30,
        concentrationThreshold: 0.25,
        // Étape 3
        driveDeferred: true,
        // Étape 4
        goalCreated: false,
        goalDeferred: true
    }
};

// ---------------------------------------------------------------------
// DÉTECTION PREMIER LANCEMENT
// ---------------------------------------------------------------------
// Critères pour déclencher l'onboarding automatiquement :
//   • jamais complété (flag localStorage absent)
//   • aucune donnée dans le portefeuille actif
//   • aucune cession ni arbitrage
//   • pas de paper trading ni positions fictives
function shouldShowOnboarding() {
    // Déjà fait → non
    if (localStorage.getItem(ONBOARDING_DONE_KEY) === 'true') return false;

    // Données présentes → non
    const hasAssets = Array.isArray(assets) && assets.length > 0;
    const hasCessions = Array.isArray(cessions) && cessions.length > 0;
    const hasArbitrages = Array.isArray(arbitrages) && arbitrages.length > 0;
    if (hasAssets || hasCessions || hasArbitrages) return false;

    return true;
}

// Force l'affichage (utilisé par la commande palette Ctrl+K → Refaire l'onboarding)
function forceShowOnboarding() {
    localStorage.removeItem(ONBOARDING_DONE_KEY);
    localStorage.removeItem(ONBOARDING_STEP_KEY);
    onboardingState.step = 0;
    openOnboardingModal();
}

// ---------------------------------------------------------------------
// NAVIGATION ENTRE ÉTAPES
// ---------------------------------------------------------------------
function nextOnboardingStep() {
    if (onboardingState.step >= onboardingState.totalSteps - 1) {
        finishOnboarding();
        return;
    }
    onboardingState.step++;
    localStorage.setItem(ONBOARDING_STEP_KEY, String(onboardingState.step));
    renderOnboardingStep();
}

function prevOnboardingStep() {
    if (onboardingState.step <= 0) return;
    onboardingState.step--;
    localStorage.setItem(ONBOARDING_STEP_KEY, String(onboardingState.step));
    renderOnboardingStep();
}

function gotoOnboardingStep(step) {
    if (step < 0 || step >= onboardingState.totalSteps) return;
    onboardingState.step = step;
    renderOnboardingStep();
}

// ---------------------------------------------------------------------
// FIN / ABANDON
// ---------------------------------------------------------------------
function finishOnboarding() {
    localStorage.setItem(ONBOARDING_DONE_KEY, 'true');
    localStorage.removeItem(ONBOARDING_STEP_KEY);
    closeModal('modal-onboarding');
    if (typeof toastSuccess === 'function') {
        toastSuccess('Bienvenue !', 'Votre portefeuille est prêt — bonne gestion !');
    }
    // Ouvre le dashboard pour que l'utilisateur voie le résultat
    if (typeof switchTab === 'function') switchTab('tab-dashboard');
    if (typeof refreshAllUI === 'function') refreshAllUI();
}

function skipOnboardingForever() {
    if (!confirm('Passer l\'assistant et ne plus le revoir ?\n\nVous pourrez le relancer à tout moment via Ctrl+K → « Refaire l\'onboarding ».')) return;
    localStorage.setItem(ONBOARDING_DONE_KEY, 'true');
    localStorage.removeItem(ONBOARDING_STEP_KEY);
    closeModal('modal-onboarding');
    if (typeof toastInfo === 'function') {
        toastInfo('Assistant ignoré', 'Vous pouvez le relancer via Ctrl+K.');
    }
}

function skipOnboardingOnce() {
    // Ferme sans marquer comme "done" → réapparaîtra au prochain lancement
    localStorage.setItem(ONBOARDING_STEP_KEY, String(onboardingState.step));
    closeModal('modal-onboarding');
}

// ---------------------------------------------------------------------
// PRÉ-REMPLISSAGE INTELLIGENT
// ---------------------------------------------------------------------
// Si l'utilisateur revient en arrière ou relance l'onboarding, on
// réhydrate les champs avec ses choix précédents ou l'état existant.

function hydrateOnboardingState() {
    // Étape 2 — profil fiscal : reprend les valeurs actuelles
    if (typeof taxTMI !== 'undefined' && Number.isFinite(taxTMI)) {
        onboardingState.data.tmi = taxTMI;
    }
    if (typeof concentrationThreshold !== 'undefined' && Number.isFinite(concentrationThreshold)) {
        onboardingState.data.concentrationThreshold = concentrationThreshold;
    }

    // Reprend l'étape où l'utilisateur s'était arrêté
    const savedStep = parseInt(localStorage.getItem(ONBOARDING_STEP_KEY), 10);
    if (Number.isFinite(savedStep) && savedStep >= 0 && savedStep < onboardingState.totalSteps) {
        onboardingState.step = savedStep;
    } else {
        onboardingState.step = 0;
    }
}

// ---------------------------------------------------------------------
// OUVERTURE DU MODAL
// ---------------------------------------------------------------------
function openOnboardingModal() {
    document.getElementById('modal-onboarding').classList.remove('hidden');
    renderOnboardingStep();
}

// ---------------------------------------------------------------------
// RENDU DE L'ÉTAPE COURANTE
// ---------------------------------------------------------------------
function renderOnboardingStep() {
    const step = onboardingState.step;
    const total = onboardingState.totalSteps;

    // --- Mise à jour de l'indicateur de progression ---
    document.getElementById('onboarding-step-label').innerText = `Étape ${step + 1} sur ${total}`;
    const pct = Math.round(((step + 1) / total) * 100);
    document.getElementById('onboarding-step-percent').innerText = pct + ' %';

    // Segments colorés jusqu'à l'étape courante
    for (let i = 0; i < total; i++) {
        const seg = document.getElementById('onboarding-progress-' + i);
        if (!seg) continue;
        if (i <= step) {
            seg.className = 'flex-1 h-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all';
        } else {
            seg.className = 'flex-1 h-1.5 rounded-full bg-gray-800 transition-all';
        }
    }

    // --- Bouton "Précédent" visible dès l'étape 2 ---
    const prevBtn = document.getElementById('onboarding-prev-btn');
    if (prevBtn) prevBtn.classList.toggle('hidden', step === 0);

    // --- Bouton "Suivant" → "Terminer" à la dernière étape ---
    const nextLabel = document.getElementById('onboarding-next-label');
    const nextIcon  = document.getElementById('onboarding-next-icon');
    if (nextLabel && nextIcon) {
        if (step === total - 1) {
            nextLabel.innerText = 'Terminer';
            nextIcon.className = 'fa-solid fa-check text-[10px]';
        } else {
            nextLabel.innerText = 'Suivant';
            nextIcon.className = 'fa-solid fa-arrow-right text-[10px]';
        }
    }

    // --- Contenu dynamique ---
    const content = document.getElementById('onboarding-step-content');
    if (!content) return;

    switch (step) {
        case 0: content.innerHTML = _renderOnboardingStep1(); break;
        case 1: content.innerHTML = _renderOnboardingStep2(); break;
        case 2: content.innerHTML = _renderOnboardingStep3(); break;
        case 3: content.innerHTML = _renderOnboardingStep4(); break;
    }

    // --- Hooks post-render (focus, listeners) ---
    _attachOnboardingListeners(step);
}

// ---------------------------------------------------------------------
// ÉTAPE 1 — Montant investi initial
// ---------------------------------------------------------------------
function _renderOnboardingStep1() {
    const d = onboardingState.data;
    return `
        <div class="space-y-4">
            <div class="flex items-start gap-3">
                <div class="flex-shrink-0 w-10 h-10 rounded-xl bg-emerald-950 border border-emerald-700/60 flex items-center justify-center text-emerald-400">
                    <i class="fa-solid fa-vault"></i>
                </div>
                <div>
                    <h4 class="text-base font-bold text-white">Combien avez-vous investi au total ?</h4>
                    <p class="text-[11px] text-gray-400 mt-1 leading-relaxed">
                        Indiquez le montant global de votre portefeuille actuel. Nous créerons un premier
                        actif générique que vous pourrez <b>détailler</b> (ou <b>remplacer</b>) ensuite
                        via l'inventaire. <b>Aucune obligation</b> — vous pouvez aussi passer cette étape.
                    </p>
                </div>
            </div>

            <div>
                <label class="block text-gray-400 mb-1">Nom du portefeuille / de l'actif</label>
                <input type="text" id="onb-asset-name" placeholder="ex: Portefeuille principal, Épargne totale…" value="${escapeHTML(d.initialName)}" class="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-emerald-500">
            </div>

            <div>
                <label class="block text-gray-400 mb-1">Montant investi total (€)</label>
                <input type="number" step="any" id="onb-asset-amount" placeholder="ex: 25000" value="${d.initialAmount || ''}" class="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-white font-mono text-lg focus:outline-none focus:border-emerald-500">
                <p class="text-[10px] text-gray-500 mt-1">
                    <i class="fa-solid fa-circle-info mr-1"></i>
                    Ce montant sera considéré comme votre capital de départ. Laissez 0 pour ignorer cette étape.
                </p>
            </div>

            <div class="bg-blue-950/20 border border-blue-800/40 rounded-lg p-3 text-[11px] text-blue-200 leading-relaxed">
                <i class="fa-solid fa-lightbulb text-blue-400 mr-1"></i>
                <b>Astuce :</b> si vous avez déjà un relevé de votre courtier (PDF ou CSV), vous pourrez
                importer directement toutes vos lignes via <b>le bouton « Import CSV »</b> une fois l'onboarding terminé.
            </div>
        </div>
    `;
}

// ---------------------------------------------------------------------
// ÉTAPE 2 — Profil fiscal & risque
// ---------------------------------------------------------------------
function _renderOnboardingStep2() {
    const d = onboardingState.data;
    return `
        <div class="space-y-4">
            <div class="flex items-start gap-3">
                <div class="flex-shrink-0 w-10 h-10 rounded-xl bg-indigo-950 border border-indigo-700/60 flex items-center justify-center text-indigo-400">
                    <i class="fa-solid fa-user-tag"></i>
                </div>
                <div>
                    <h4 class="text-base font-bold text-white">Votre profil fiscal & tolérance au risque</h4>
                    <p class="text-[11px] text-gray-400 mt-1 leading-relaxed">
                        Ces paramètres ajustent les <b>calculs d'impôt</b> et les <b>alertes de concentration</b>.
                        Vous pourrez les modifier à tout moment dans l'onglet Fiscalité.
                    </p>
                </div>
            </div>

            <div>
                <label class="block text-gray-400 mb-2">Régime fiscal par défaut</label>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label class="flex items-start gap-2.5 p-3 rounded-xl border ${d.taxMode === 'BAREME' ? 'border-gray-800' : 'border-indigo-500 bg-indigo-950/20'} cursor-pointer hover:border-indigo-500 transition" onclick="onboardingState.data.taxMode='PFU'; renderOnboardingStep();">
                        <input type="radio" name="onb-tax" ${d.taxMode === 'BAREME' ? '' : 'checked'} class="mt-0.5 accent-indigo-500">
                        <span>
                            <span class="block font-bold text-white text-[12px]">PFU — Flat Tax 30 %</span>
                            <span class="block text-[10px] text-gray-500 mt-0.5">Simple, standard, sans condition de revenu.</span>
                        </span>
                    </label>
                    <label class="flex items-start gap-2.5 p-3 rounded-xl border ${d.taxMode === 'BAREME' ? 'border-indigo-500 bg-indigo-950/20' : 'border-gray-800'} cursor-pointer hover:border-indigo-500 transition" onclick="onboardingState.data.taxMode='BAREME'; renderOnboardingStep();">
                        <input type="radio" name="onb-tax" ${d.taxMode === 'BAREME' ? 'checked' : ''} class="mt-0.5 accent-indigo-500">
                        <span>
                            <span class="block font-bold text-white text-[12px]">Barème progressif IR</span>
                            <span class="block text-[10px] text-gray-500 mt-0.5">Avantageux si TMI ≤ 11 %.</span>
                        </span>
                    </label>
                </div>
            </div>

            <div>
                <label class="block text-gray-400 mb-1">Votre Tranche Marginale d'Imposition (TMI)</label>
                <select id="onb-tmi" class="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-indigo-500">
                    <option value="0"    ${d.tmi === 0    ? 'selected' : ''}>0 % — Non imposable</option>
                    <option value="0.11" ${d.tmi === 0.11 ? 'selected' : ''}>11 % — Tranche 1</option>
                    <option value="0.30" ${d.tmi === 0.30 ? 'selected' : ''}>30 % — Tranche 2 (défaut)</option>
                    <option value="0.41" ${d.tmi === 0.41 ? 'selected' : ''}>41 % — Tranche 3</option>
                    <option value="0.45" ${d.tmi === 0.45 ? 'selected' : ''}>45 % — Tranche 4</option>
                </select>
            </div>

            <div>
                <label class="block text-gray-400 mb-1">Seuil d'alerte de concentration</label>
                <div class="flex items-center gap-2">
                    <input type="range" id="onb-concentration" min="10" max="50" step="5" value="${Math.round(d.concentrationThreshold * 100)}" oninput="document.getElementById('onb-concentration-label').innerText = this.value + ' %'; onboardingState.data.concentrationThreshold = parseFloat(this.value) / 100;" class="flex-1 accent-indigo-500">
                    <span id="onb-concentration-label" class="w-14 text-right font-mono text-white text-sm font-bold">${Math.round(d.concentrationThreshold * 100)} %</span>
                </div>
                <p class="text-[10px] text-gray-500 mt-1">
                    Un badge ⚠ apparaîtra sur tout actif dépassant ce poids dans le portefeuille.
                    25 % est une valeur classique pour un portefeuille diversifié.
                </p>
            </div>
        </div>
    `;
}

// ---------------------------------------------------------------------
// ÉTAPE 3 — Sauvegarde Google Drive
// ---------------------------------------------------------------------
function _renderOnboardingStep3() {
    const hasClientId = typeof getDriveClientId === 'function' && !!getDriveClientId();
    return `
        <div class="space-y-4">
            <div class="flex items-start gap-3">
                <div class="flex-shrink-0 w-10 h-10 rounded-xl bg-blue-950 border border-blue-700/60 flex items-center justify-center text-blue-400">
                    <i class="fa-solid fa-cloud-arrow-up"></i>
                </div>
                <div>
                    <h4 class="text-base font-bold text-white">Sauvegardez vos données</h4>
                    <p class="text-[11px] text-gray-400 mt-1 leading-relaxed">
                        Vos données sont stockées <b>localement</b> dans votre navigateur. Pour les protéger
                        contre une perte (changement d'ordinateur, nettoyage du cache…), nous vous
                        recommandons d'activer la <b>synchronisation Google Drive chiffrée</b>.
                    </p>
                </div>
            </div>

            <div class="bg-blue-950/20 border border-blue-800/40 rounded-xl p-3.5 space-y-2">
                <div class="flex items-start gap-2">
                    <i class="fa-solid fa-shield-halved text-blue-400 mt-0.5"></i>
                    <div class="text-[11px] text-gray-300 leading-relaxed">
                        <b class="text-blue-200">Chiffrement AES-256</b> : votre phrase secrète est dérivée localement
                        (PBKDF2 250 000 itérations) et la clé <b>n'est jamais exportable</b>. Google ne voit
                        que des données binaires illisibles.
                    </div>
                </div>
                <div class="flex items-start gap-2">
                    <i class="fa-solid fa-clock text-blue-400 mt-0.5"></i>
                    <div class="text-[11px] text-gray-300 leading-relaxed">
                        <b class="text-blue-200">Automatique</b> : une fois configurée, la sauvegarde se fait
                        en arrière-plan <b>toutes les 24 h</b> — sans aucune action de votre part.
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button onclick="onboardingState.data.driveDeferred=false; closeModal('modal-onboarding'); openDriveSyncModal();" class="p-3 rounded-xl border border-blue-700/60 bg-blue-950/30 hover:bg-blue-900/50 text-left transition">
                    <div class="flex items-center gap-2">
                        <i class="fa-solid fa-rocket text-blue-400"></i>
                        <span class="font-bold text-white text-[12px]">Configurer maintenant</span>
                    </div>
                    <div class="text-[10px] text-gray-400 mt-1">Ouvre le panneau Drive (le wizard reprendra après).</div>
                </button>
                <button onclick="onboardingState.data.driveDeferred=true; nextOnboardingStep();" class="p-3 rounded-xl border border-gray-800 bg-gray-950/40 hover:bg-gray-900/60 text-left transition">
                    <div class="flex items-center gap-2">
                        <i class="fa-solid fa-clock text-gray-500"></i>
                        <span class="font-bold text-gray-300 text-[12px]">Plus tard</span>
                    </div>
                    <div class="text-[10px] text-gray-500 mt-1">Accessible à tout moment via « Synchronisation » dans le header.</div>
                </button>
            </div>

            ${hasClientId
                ? `<div class="text-[10px] text-emerald-400 bg-emerald-950/30 border border-emerald-800/50 rounded-lg p-2.5">
                       <i class="fa-solid fa-circle-check mr-1"></i> Un Client ID Google est déjà configuré — vous pouvez vous connecter en un clic.
                   </div>`
                : `<div class="text-[10px] text-gray-500 italic">
                       Aucun Client ID Google configuré pour l'instant. La première configuration prend ~5 min (voir instructions dans le panneau Drive).
                   </div>`}
        </div>
    `;
}

// ---------------------------------------------------------------------
// ÉTAPE 4 — Premier objectif
// ---------------------------------------------------------------------
function _renderOnboardingStep4() {
    return `
        <div class="space-y-4">
            <div class="flex items-start gap-3">
                <div class="flex-shrink-0 w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-700/60 flex items-center justify-center text-cyan-400">
                    <i class="fa-solid fa-bullseye"></i>
                </div>
                <div>
                    <h4 class="text-base font-bold text-white">Fixez votre premier objectif</h4>
                    <p class="text-[11px] text-gray-400 mt-1 leading-relaxed">
                        Les objectifs permettent de suivre votre progression vers un montant cible
                        (épargne immobilière, retraite, indépendance financière…) avec une simulation
                        <b>Monte-Carlo</b> basée sur la volatilité réelle de votre portefeuille.
                    </p>
                </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button onclick="closeModal('modal-onboarding'); openAddGoalModal();" class="p-3 rounded-xl border border-cyan-700/60 bg-cyan-950/30 hover:bg-cyan-900/50 text-left transition">
                    <div class="flex items-center gap-2">
                        <i class="fa-solid fa-plus text-cyan-400"></i>
                        <span class="font-bold text-white text-[12px]">Créer un objectif maintenant</span>
                    </div>
                    <div class="text-[10px] text-gray-400 mt-1">Ouvre le formulaire dédié (le wizard se terminera automatiquement).</div>
                </button>
                <button onclick="onboardingState.data.goalDeferred=true; finishOnboarding();" class="p-3 rounded-xl border border-gray-800 bg-gray-950/40 hover:bg-gray-900/60 text-left transition">
                    <div class="flex items-center gap-2">
                        <i class="fa-solid fa-flag-checkered text-gray-500"></i>
                        <span class="font-bold text-gray-300 text-[12px]">Terminer sans objectif</span>
                    </div>
                    <div class="text-[10px] text-gray-500 mt-1">Vous pourrez en ajouter plus tard depuis l'onglet Objectifs.</div>
                </button>
            </div>

            <div class="bg-gradient-to-br from-emerald-950/40 to-teal-950/30 border border-emerald-800/50 rounded-xl p-4">
                <div class="flex items-start gap-3">
                    <i class="fa-solid fa-gift text-emerald-400 text-lg mt-0.5"></i>
                    <div class="text-[11px] text-gray-200 leading-relaxed">
                        <b class="text-emerald-300">Astuce FIRE :</b> si votre objectif est l'indépendance financière,
                        découvrez l'onglet <b>Objectifs → Indépendance financière</b>. Il calcule automatiquement
                        le capital cible selon la règle des 4 % (ou 3 % ou 5 %), et vous montre votre
                        probabilité d'atteinte via 5 000 simulations.
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ---------------------------------------------------------------------
// LISTENERS POST-RENDER
// ---------------------------------------------------------------------
function _attachOnboardingListeners(step) {
    // Étape 1 : mise à jour de l'état au fil de la saisie
    if (step === 0) {
        const nameInput = document.getElementById('onb-asset-name');
        const amountInput = document.getElementById('onb-asset-amount');
        if (nameInput) nameInput.addEventListener('input', () => {
            onboardingState.data.initialName = nameInput.value;
        });
        if (amountInput) amountInput.addEventListener('input', () => {
            onboardingState.data.initialAmount = parseFloat(amountInput.value) || 0;
        });
        // Focus sur le champ montant si vide
        if (amountInput && !amountInput.value) setTimeout(() => amountInput.focus(), 100);
    }
    // Étape 2 : TMI
    if (step === 1) {
        const tmiSel = document.getElementById('onb-tmi');
        if (tmiSel) tmiSel.addEventListener('change', () => {
            onboardingState.data.tmi = parseFloat(tmiSel.value) || 0;
        });
    }
}

// ---------------------------------------------------------------------
// APPLICATION DE L'ÉTAPE 1 AU PASSAGE À L'ÉTAPE 2
// ---------------------------------------------------------------------
// Crée un actif générique si un montant a été saisi. Sinon, passe
// silencieusement à l'étape suivante.
function _applyOnboardingStep1() {
    const d = onboardingState.data;
    if (!d.initialAmount || d.initialAmount <= 0) return;

    const name = (d.initialName || 'Portefeuille initial').trim();

    // Évite les doublons si l'utilisateur revient en arrière et re-valide
    const existing = assets.find(a => a.name === name && a.categories?.includes('Autre'));
    if (existing) return;

    const newAsset = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        name,
        ticker: 'INIT',
        categories: ['Autre'],
        taxCategory: 'NON_CONCERNE',
        cadrans: { primary: 'HORS_GAVE', secondary: [] },
        cadran: 'HORS_GAVE',
        qty: 1,
        frais: 0,
        invested: d.initialAmount,
        value: d.initialAmount,
        envelope: '',
        envelopeOpenedAt: '',
        zone: 'UE',
        valuationMode: 'MANUAL',
        yahooTicker: '',
        purchaseDate: new Date().toISOString().slice(0, 10),
        broker: '',
        lots: [typeof makeLot === 'function'
            ? makeLot(new Date().toISOString().slice(0, 10), 1, d.initialAmount, 0, '')
            : { id: Date.now(), date: new Date().toISOString().slice(0, 10), qty: 1, qtyRemaining: 1, price: d.initialAmount, frais: 0, reference: '' }],
        buys: [{
            date: new Date().toLocaleDateString('fr-FR'),
            type: 'Initialisation onboarding',
            qty: 1, price: d.initialAmount, frais: 0, total: d.initialAmount
        }],
        history: [{
            date: new Date().toLocaleDateString('fr-FR'),
            value: d.initialAmount, invested: d.initialAmount
        }]
    };

    if (typeof normalizeAsset === 'function') normalizeAsset(newAsset);
    assets.push(newAsset);
    if (typeof saveToStorage === 'function') saveToStorage();
}

// ---------------------------------------------------------------------
// APPLICATION DE L'ÉTAPE 2
// ---------------------------------------------------------------------
function _applyOnboardingStep2() {
    const d = onboardingState.data;
    // TMI + régime fiscal
    if (typeof taxTMI !== 'undefined') taxTMI = d.tmi;
    if (typeof taxRegimeMode !== 'undefined') taxRegimeMode = d.taxMode || 'PFU';
    if (typeof saveTaxSettings === 'function') saveTaxSettings();

    // Seuil de concentration
    if (typeof concentrationThreshold !== 'undefined') {
        concentrationThreshold = d.concentrationThreshold;
        try {
            localStorage.setItem('patriMonial_concentrationThreshold', String(concentrationThreshold));
        } catch (_) {}
        // Met à jour l'input du seuil dans l'inventaire si présent
        const inp = document.getElementById('inventory-threshold-input');
        if (inp) inp.value = Math.round(concentrationThreshold * 100);
    }
}

// ---------------------------------------------------------------------
// HOOK : appelé par nextOnboardingStep avant d'avancer
// ---------------------------------------------------------------------
// Redéfinition propre de nextOnboardingStep pour intégrer les actions
// des étapes 1 et 2 AVANT de passer à la suivante.
nextOnboardingStep = function () {
    const step = onboardingState.step;
    // Actions d'application selon l'étape en cours
    if (step === 0) _applyOnboardingStep1();
    if (step === 1) _applyOnboardingStep2();

    // Appel de la logique de navigation
    if (step >= onboardingState.totalSteps - 1) {
        finishOnboarding();
        return;
    }
    onboardingState.step++;
    localStorage.setItem(ONBOARDING_STEP_KEY, String(onboardingState.step));
    renderOnboardingStep();
    // Refresh UI si une action a modifié les données
    if (step === 0 && typeof refreshAllUI === 'function') refreshAllUI();
};

// Expose les nouvelles fonctions
window.openOnboardingModal = openOnboardingModal;
window.renderOnboardingStep = renderOnboardingStep;

// Expose l'API globalement
window.shouldShowOnboarding = shouldShowOnboarding;
window.forceShowOnboarding = forceShowOnboarding;
window.finishOnboarding = finishOnboarding;
window.skipOnboardingForever = skipOnboardingForever;
window.skipOnboardingOnce = skipOnboardingOnce;
window.nextOnboardingStep = nextOnboardingStep;
window.prevOnboardingStep = prevOnboardingStep;
window.gotoOnboardingStep = gotoOnboardingStep;