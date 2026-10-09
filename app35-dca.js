// =====================================================================
// app35-dca.js — DCA PLANIFIÉ AVEC SUGGESTION DE CADRAN (Chantier §6)
// Dépend de : app1-core.js, app6-api.js, app15-notifications.js
// Charge après app34-correlation.js, avant tests.js
// =====================================================================
//
// Permet de planifier un DCA (Dollar-Cost Averaging) mensuel :
//   • Montant + jour du mois + nom du plan
//   • À la date prévue, un rappel (toast + notification système) est envoyé
//   • Suggestion automatique du cadran sous-pondéré (4 Cadrans de Gave)
//   • Bouton « Enregistrer » qui ouvre le formulaire d'ajout pré-rempli
//
// Le check est déclenché à chaque refreshAllUI (throttled à 1× / heure)
// et au boot. Le cooldown est de 1 mois : pas de spam si l'app est
// rechargée plusieurs fois le même jour.
//
// STOCKAGE :
//   patriMonial_dcaConfig : objet unique { enabled, amount, dayOfMonth,
//                                          label, lastTriggeredMonth,
//                                          targetCadran (optionnel),
//                                          monthlySavings }
// =====================================================================

const DCA_STORAGE_KEY = 'patriMonial_dcaConfig';
const DCA_CHECK_THROTTLE_MS = 60 * 60 * 1000;   // 1 h

const DCA_DEFAULT_CONFIG = {
    enabled: false,
    amount: 500,              // Montant mensuel (€)
    dayOfMonth: 5,            // Jour du mois (1-28 pour éviter les mois courts)
    label: 'DCA mensuel',     // Nom du plan
    targetCadran: '',         // '' = suggestion auto, sinon OR/MONNAIES/ASIE/PETROLE
    lastTriggeredMonth: null, // Format 'YYYY-MM' du dernier rappel envoyé
    notes: ''
};

let dcaConfig = { ...DCA_DEFAULT_CONFIG };
let _lastDcaCheckAt = 0;

// ---------------------------------------------------------------------
// STOCKAGE
// ---------------------------------------------------------------------
function loadDcaConfigFromStorage() {
    try {
        const raw = localStorage.getItem(DCA_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                return { ...DCA_DEFAULT_CONFIG, ...parsed };
            }
        }
    } catch (_) {}
    return { ...DCA_DEFAULT_CONFIG };
}

function saveDcaConfigToStorage() {
    try {
        localStorage.setItem(DCA_STORAGE_KEY, JSON.stringify(dcaConfig));
    } catch (_) {}
}

// ---------------------------------------------------------------------
// SUGGESTION DE CADRAN
// ---------------------------------------------------------------------
// Renvoie le cadran le plus sous-pondéré vs cible 25 %, avec écart en €.
// Si le cadran cible est verrouillé par l'utilisateur, on renvoie celui-ci.
// Retourne { cadran, label, value, pct, gap, gapPct } ou null si pas assez de données.
function computeDcaSuggestedCadran() {
    const realAssets = assets.filter(a => !isPaperAsset(a));

    // Si l'utilisateur a verrouillé un cadran cible, on l'utilise
    if (dcaConfig.targetCadran && GAVE_CODES.includes(dcaConfig.targetCadran)) {
        const q = dcaConfig.targetCadran;
        const value = realAssets.filter(a => a.cadran === q).reduce((s, a) => s + (a.value || 0), 0);
        return {
            cadran: q,
            label: cadranLabel(q),
            value,
            pct: 0,
            gap: 0,
            gapPct: 0,
            locked: true
        };
    }

    // Sinon, calcul auto : trouve le cadran le plus sous-pondéré
    const totals = {};
    GAVE_QUADRANTS.forEach(q => {
        totals[q] = realAssets
            .filter(a => a.cadran === q)
            .reduce((s, a) => s + (a.value || 0), 0);
    });
    const total = Object.values(totals).reduce((a, b) => a + b, 0);
    if (total <= 0) return null;

    const target = total / 4;
    let best = null;
    GAVE_QUADRANTS.forEach(q => {
        const gap = totals[q] - target;               // négatif = sous-pondéré
        if (!best || gap < best.gap) {
            best = {
                cadran: q,
                label: cadranLabel(q),
                value: totals[q],
                pct: total > 0 ? (totals[q] / total * 100) : 0,
                gap,
                gapPct: total > 0 ? (gap / total * 100) : 0,
                locked: false
            };
        }
    });
    return best;
}

// ---------------------------------------------------------------------
// DÉTECTION / ÉVALUATION
// ---------------------------------------------------------------------
// Renvoie true si le DCA doit déclencher aujourd'hui.
function _shouldTriggerDcaToday() {
    if (!dcaConfig.enabled) return false;

    const now = new Date();
    const todayDay = now.getDate();
    const todayMonthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

    // Déjà déclenché ce mois-ci → non
    if (dcaConfig.lastTriggeredMonth === todayMonthKey) return false;

    // Jour du mois atteint ou dépassé (jour ≤ aujourd'hui, mois courant)
    // → tolérance : si le jour exact est passé sans que l'app soit ouverte,
    //   on déclenche au premier lancement du mois suivant la date.
    return todayDay >= dcaConfig.dayOfMonth;
}

// Évalue et déclenche les rappels DCA si nécessaire.
// Appelée au boot et à chaque refreshAllUI (throttled).
function evaluateDca() {
    const now = Date.now();
    if (now - _lastDcaCheckAt < DCA_CHECK_THROTTLE_MS) return;
    _lastDcaCheckAt = now;

    if (!_shouldTriggerDcaToday()) return;

    // Marque comme déclenché (persiste pour éviter un doublon)
    const todayMonthKey = new Date().getFullYear() + '-' +
        String(new Date().getMonth() + 1).padStart(2, '0');
    dcaConfig.lastTriggeredMonth = todayMonthKey;
    saveDcaConfigToStorage();

    // Suggestion de cadran
    const suggestion = computeDcaSuggestedCadran();
    const amount = Number(dcaConfig.amount) || 0;

    // Message principal
    const labelTxt = dcaConfig.label || 'DCA mensuel';
    let suggestionTxt = '';
    if (suggestion) {
        if (suggestion.locked) {
            suggestionTxt = `Placement prévu sur le ${suggestion.label} (verrouillé).`;
        } else {
            suggestionTxt = `Cadran le plus sous-pondéré : ${suggestion.label} (${suggestion.pct.toFixed(1)} % vs cible 25 %).`;
        }
    } else {
        suggestionTxt = 'Ajoutez des actifs pour recevoir des suggestions de répartition.';
    }

    // --- Toast ---
    if (typeof toastInfo === 'function') {
        toastInfo(
            `${labelTxt} · ${formatEUR(amount)}`,
            suggestionTxt + '\nCliquez sur "Enregistrer l\'achat" pour ouvrir le formulaire pré-rempli.',
            {
                duration: 12000,
                actions: [
                    { label: 'Enregistrer l\'achat', primary: true, onClick: () => openDcaQuickAdd() },
                    { label: 'Reporter', onClick: () => {
                        // Report : annule le marquage du mois pour redéclencher demain
                        dcaConfig.lastTriggeredMonth = null;
                        saveDcaConfigToStorage();
                    }}
                ]
            }
        );
    }

    // --- Notification système native ---
    if (typeof sendNativeNotification === 'function') {
        sendNativeNotification(
            `PatriMonial · ${labelTxt}`,
            `${formatEUR(amount)} à placer. ${suggestionTxt}`,
            { tag: 'dca-reminder-' + todayMonthKey, alertId: 'dca' }
        ).catch(() => {});
    }

    // --- Bannière persistante dans le header ---
    renderDcaBanner();

    // Vibrations (mobile)
    if (typeof haptic === 'function') haptic('action');
}

// Effacer la bannière DCA courante (bouton × dessus)
function dismissDcaBanner() {
    const banner = document.getElementById('dca-banner');
    if (banner) banner.classList.add('hidden');
}

// ---------------------------------------------------------------------
// BANNIÈRE PERSISTANTE (header)
// ---------------------------------------------------------------------
function renderDcaBanner() {
    const banner = document.getElementById('dca-banner');
    if (!banner) return;

    if (!dcaConfig.enabled) {
        banner.classList.add('hidden');
        return;
    }

    const suggestion = computeDcaSuggestedCadran();
    const amount = Number(dcaConfig.amount) || 0;
    const todayMonthKey = new Date().getFullYear() + '-' +
        String(new Date().getMonth() + 1).padStart(2, '0');

    // Affiche la bannière uniquement si le DCA a été déclenché ce mois-ci
    if (dcaConfig.lastTriggeredMonth !== todayMonthKey) {
        banner.classList.add('hidden');
        return;
    }

    banner.classList.remove('hidden');

    const titleEl = document.getElementById('dca-banner-title');
    const detailEl = document.getElementById('dca-banner-detail');
    if (titleEl) titleEl.innerText = `${dcaConfig.label || 'DCA'} · ${formatEUR(amount)} à placer`;
    if (detailEl) {
        if (suggestion) {
            detailEl.innerText = suggestion.locked
                ? `Placement prévu : ${suggestion.label}`
                : `Suggestion : renforcer ${suggestion.label} (${suggestion.pct.toFixed(1)} % vs cible 25 %)`;
        } else {
            detailEl.innerText = 'Ajoutez des actifs pour affiner la suggestion';
        }
    }
}

// ---------------------------------------------------------------------
// ACTION RAPIDE — Ouvrir le formulaire d'ajout pré-rempli
// ---------------------------------------------------------------------
function openDcaQuickAdd() {
    if (typeof openAddAssetModal !== 'function') {
        alert('Le formulaire d\'ajout d\'actif n\'est pas disponible.');
        return;
    }

    // Ouvre le modal vide
    openAddAssetModal();

    const amount = Number(dcaConfig.amount) || 0;
    const suggestion = computeDcaSuggestedCadran();

    // Pré-remplit le cadran si suggéré
    if (suggestion && suggestion.cadran) {
        const cadranSel = document.getElementById('add-cadran');
        if (cadranSel) {
            const opt = cadranSel.querySelector(`option[value="${suggestion.cadran}"]`);
            if (opt) cadranSel.value = suggestion.cadran;
        }
    }

    // Pré-remplit le prix d'achat par défaut avec le montant du DCA
    const priceInput = document.getElementById('add-price');
    const qtyInput = document.getElementById('add-qty');
    const valueInput = document.getElementById('add-value');
    if (qtyInput) qtyInput.value = 1;
    if (priceInput && !priceInput.value) priceInput.value = amount;
    if (valueInput && !valueInput.value) valueInput.value = amount;

    // Bandeau informatif en haut du formulaire
    _injectDcaBanner(suggestion, amount);
}

function _injectDcaBanner(suggestion, amount) {
    const old = document.getElementById('dca-promotion-banner');
    if (old) old.remove();

    const form = document.querySelector('#modal-add-asset form');
    if (!form) return;

    const suggestionTxt = suggestion
        ? (suggestion.locked
            ? `Cadran cible : <b>${escapeHTML(suggestion.label)}</b> (verrouillé dans votre config).`
            : `Suggestion : <b>${escapeHTML(suggestion.label)}</b> (actuellement ${suggestion.pct.toFixed(1)} %, cible 25 %).`)
        : `Ajoutez des actifs pour activer les suggestions de répartition.`;

    const banner = document.createElement('div');
    banner.id = 'dca-promotion-banner';
    banner.className = 'bg-emerald-950/40 border border-emerald-800/60 rounded-xl p-3 flex items-start gap-3';
    banner.innerHTML = `
        <div class="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-700/60 flex items-center justify-center text-emerald-300">
            <i class="fa-solid fa-coins"></i>
        </div>
        <div class="flex-1 min-w-0">
            <div class="text-[11px] font-bold text-emerald-200">DCA planifié — ${formatEUR(amount)}</div>
            <div class="text-[11px] text-gray-300 mt-0.5 leading-relaxed">${suggestionTxt}</div>
        </div>
        <button type="button" onclick="document.getElementById('dca-promotion-banner').remove();" class="flex-shrink-0 w-6 h-6 rounded-md bg-emerald-900/60 text-emerald-200 hover:bg-emerald-800 hover:text-white flex items-center justify-center transition" title="Retirer le bandeau">
            <i class="fa-solid fa-xmark text-[10px]"></i>
        </button>
    `;
    form.insertBefore(banner, form.firstChild);
}

// ---------------------------------------------------------------------
// PANNEAU DE CONFIGURATION (intégré dans tab-objectifs)
// ---------------------------------------------------------------------
function renderDcaPanel() {
    const panel = document.getElementById('dca-panel');
    if (!panel) return;

    // Recharge la config
    dcaConfig = loadDcaConfigFromStorage();

    const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };

    // Statut
    setText('dca-stat-amount',   formatEUR(dcaConfig.amount));
    setText('dca-stat-day',      dcaConfig.dayOfMonth + ' du mois');
    setText('dca-stat-label',    dcaConfig.label || '—');
    setText('dca-stat-status',   dcaConfig.enabled ? 'Actif' : 'Désactivé');

    // Suggestion de cadran
    const suggestion = computeDcaSuggestedCadran();
    const sugEl = document.getElementById('dca-suggestion-text');
    const sugBadge = document.getElementById('dca-suggestion-badge');
    if (sugEl && sugBadge) {
        if (suggestion) {
            if (suggestion.locked) {
                sugEl.innerHTML = `Cadran cible verrouillé : <b>${escapeHTML(suggestion.label)}</b>`;
                sugBadge.className = 'px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-700/50 text-[9px] font-bold';
                sugBadge.innerText = 'Verrouillé';
            } else {
                sugEl.innerHTML = `Cadran le plus sous-pondéré : <b>${escapeHTML(suggestion.label)}</b> (${suggestion.pct.toFixed(1)} % vs cible 25 %, écart ${formatEUR(suggestion.gap)})`;
                sugBadge.className = 'px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/50 text-[9px] font-bold';
                sugBadge.innerText = 'Auto';
            }
        } else {
            sugEl.innerHTML = '<span class="text-gray-500 italic">Ajoutez des actifs dans les 4 Cadrans pour activer la suggestion.</span>';
            sugBadge.className = 'hidden';
        }
    }

    // Dernier rappel
    const lastEl = document.getElementById('dca-stat-last');
    if (lastEl) {
        if (dcaConfig.lastTriggeredMonth) {
            const [y, m] = dcaConfig.lastTriggeredMonth.split('-');
            const mois = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin',
                          'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
            lastEl.innerText = `${mois[parseInt(m, 10) - 1]} ${y}`;
        } else {
            lastEl.innerText = '—';
        }
    }

    // Bouton activer/désactiver
    const toggleBtn = document.getElementById('dca-toggle-btn');
    if (toggleBtn) {
        if (dcaConfig.enabled) {
            toggleBtn.innerHTML = '<i class="fa-solid fa-pause text-[10px]"></i> Désactiver';
            toggleBtn.className = 'px-3 py-1.5 rounded-lg bg-rose-950/60 text-rose-300 border border-rose-800/50 hover:bg-rose-900/70 text-xs font-medium transition flex items-center gap-1.5';
        } else {
            toggleBtn.innerHTML = '<i class="fa-solid fa-play text-[10px]"></i> Activer';
            toggleBtn.className = 'px-3 py-1.5 rounded-lg bg-emerald-950/60 text-emerald-300 border border-emerald-800/50 hover:bg-emerald-900/70 text-xs font-medium transition flex items-center gap-1.5';
        }
    }
}

// ---------------------------------------------------------------------
// MODAL DE CONFIGURATION
// ---------------------------------------------------------------------
function openDcaConfigModal() {
    dcaConfig = loadDcaConfigFromStorage();
    document.getElementById('dca-input-label').value    = dcaConfig.label;
    document.getElementById('dca-input-amount').value   = dcaConfig.amount;
    document.getElementById('dca-input-day').value      = dcaConfig.dayOfMonth;
    document.getElementById('dca-input-cadran').value   = dcaConfig.targetCadran || '';
    document.getElementById('dca-input-notes').value    = dcaConfig.notes || '';

    updateDcaPreview();
    document.getElementById('modal-dca-config').classList.remove('hidden');
}

function updateDcaPreview() {
    const amount = parseFloat(document.getElementById('dca-input-amount').value) || 0;
    const day = parseInt(document.getElementById('dca-input-day').value, 10) || 1;
    const cadran = document.getElementById('dca-input-cadran').value;

    // Affiche l'impact annuel
    const annual = amount * 12;
    const preview = document.getElementById('dca-preview-annual');
    if (preview) preview.innerText = formatEUR(annual) + ' / an';

    // Suggestion dynamique (respecte le cadran sélectionné)
    const oldTarget = dcaConfig.targetCadran;
    dcaConfig.targetCadran = cadran;
    const suggestion = computeDcaSuggestedCadran();
    dcaConfig.targetCadran = oldTarget;

    const sugEl = document.getElementById('dca-preview-suggestion');
    if (sugEl) {
        if (suggestion) {
            sugEl.innerText = suggestion.locked
                ? `Placement prévu sur ${suggestion.label} (verrouillé)`
                : `Suggestion auto : ${suggestion.label} (${suggestion.pct.toFixed(1)} % vs cible 25 %)`;
        } else {
            sugEl.innerText = 'Ajoutez des actifs dans les 4 Cadrans pour activer la suggestion.';
        }
    }
}

function handleSaveDcaConfig(e) {
    e.preventDefault();
    const label = document.getElementById('dca-input-label').value.trim() || 'DCA mensuel';
    const amount = parseFloat(document.getElementById('dca-input-amount').value) || 0;
    const day = parseInt(document.getElementById('dca-input-day').value, 10) || 1;
    const cadran = document.getElementById('dca-input-cadran').value;
    const notes = document.getElementById('dca-input-notes').value.trim();

    if (amount <= 0) { alert('Le montant doit être strictement positif.'); return; }
    if (day < 1 || day > 28) { alert('Le jour du mois doit être compris entre 1 et 28 (pour éviter les mois courts).'); return; }
    if (cadran && !GAVE_CODES.includes(cadran)) { alert('Cadran invalide.'); return; }

    dcaConfig.label = label;
    dcaConfig.amount = amount;
    dcaConfig.dayOfMonth = day;
    dcaConfig.targetCadran = cadran;
    dcaConfig.notes = notes;
    dcaConfig.enabled = true;

    saveDcaConfigToStorage();
    closeModal('modal-dca-config');
    renderDcaPanel();
    renderDcaBanner();

    if (typeof toastSuccess === 'function') {
        toastSuccess('DCA configuré', `${formatEUR(amount)} le ${day} de chaque mois.`);
    }
}

function toggleDcaEnabled() {
    dcaConfig.enabled = !dcaConfig.enabled;
    saveDcaConfigToStorage();
    renderDcaPanel();
    renderDcaBanner();
    if (typeof toastInfo === 'function') {
        toastInfo(dcaConfig.enabled ? 'DCA activé' : 'DCA désactivé', '');
    }
}

// ---------------------------------------------------------------------
// INITIALISATION
// ---------------------------------------------------------------------
function initDcaModule() {
    dcaConfig = loadDcaConfigFromStorage();
    // Check initial (mais throttlé : si déjà vérifié < 1h, ne fait rien)
    setTimeout(() => evaluateDca(), 3000);
    console.info('[DCA] Module chargé — ' + (dcaConfig.enabled ? 'actif' : 'inactif'));
}

// Expose l'API globalement
window.computeDcaSuggestedCadran = computeDcaSuggestedCadran;
window.evaluateDca                = evaluateDca;
window.renderDcaPanel             = renderDcaPanel;
window.renderDcaBanner            = renderDcaBanner;
window.dismissDcaBanner           = dismissDcaBanner;
window.openDcaConfigModal         = openDcaConfigModal;
window.handleSaveDcaConfig        = handleSaveDcaConfig;
window.toggleDcaEnabled           = toggleDcaEnabled;
window.openDcaQuickAdd            = openDcaQuickAdd;
window.initDcaModule              = initDcaModule;