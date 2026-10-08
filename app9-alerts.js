// =====================================================================
// app9-alerts.js — ALERTES PERSONNALISÉES (Chantier F)
// Dépend de : app1-core.js (assets, formatEUR, parseFlexDate)
// Charge après app6-api.js et app8-goals.js, avant app7-init.js
// =====================================================================

// ---------------------------------------------------------------------
// ÉTAT ET STOCKAGE
// ---------------------------------------------------------------------
let alerts = [];
let triggeredAlerts = [];   // session-scoped, non persistées

const ALERTS_STORAGE_KEY = 'patriMonial_alerts';

function loadAlertsFromStorage() {
    try {
        const raw = localStorage.getItem(ALERTS_STORAGE_KEY);
        if (raw) {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) return list;
        }
    } catch (_) {}
    return [];
}

function saveAlertsToStorage() {
    try { localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alerts)); } catch (_) {}
}

// ---------------------------------------------------------------------
// TYPES D'ALERTES
// ---------------------------------------------------------------------
const ALERT_TYPES = {
    PRICE_ABOVE: {
        label: 'Cours au-dessus de…',
        requiresAsset: true, requiresThreshold: true, thresholdUnit: '€',
        thresholdLabel: 'Prix unitaire seuil',
        hint: 'Déclenche si le cours actuel de l\'actif dépasse ce prix.'
    },
    PRICE_BELOW: {
        label: 'Cours en-dessous de…',
        requiresAsset: true, requiresThreshold: true, thresholdUnit: '€',
        thresholdLabel: 'Prix unitaire seuil',
        hint: 'Déclenche si le cours actuel de l\'actif passe en-dessous de ce prix.'
    },
    PNL_DAY_PCT: {
        label: 'Portefeuille en baisse > X % ce jour',
        requiresThreshold: true, thresholdUnit: '%',
        thresholdLabel: 'Baisse en % (valeur positive, ex: 5 pour -5 %)',
        hint: 'Compare la valeur totale actuelle à la dernière valeur de la veille.'
    },
    PNL_DAY_ABS: {
        label: 'Portefeuille en baisse > X € ce jour',
        requiresThreshold: true, thresholdUnit: '€',
        thresholdLabel: 'Baisse en € (valeur positive)',
        hint: 'Compare la valeur totale actuelle à la dernière valeur de la veille.'
    },
    CONCENTRATION: {
        label: 'Un actif dépasse X % du portefeuille',
        requiresThreshold: true, thresholdUnit: '%',
        thresholdLabel: 'Poids max toléré (%)',
        hint: 'Déclenche dès qu\'un actif dépasse ce poids (portefeuille réel uniquement).'
    },
    ASSET_TARGET: {
        label: 'Objectif de vente sur un actif',
        requiresAsset: true, requiresThreshold: true, thresholdUnit: '€',
        thresholdLabel: 'Prix cible de vente',
        hint: 'Similaire à "Cours au-dessus de", mais avec formulation "vendre".'
    },
    MONTHLY_REMINDER: {
        label: 'Rappel mensuel à date fixe',
        requiresDayOfMonth: true,
        hint: 'Déclenche chaque mois au jour indiqué (ex: le 1er pour un DCA).'
    }
};

// ---------------------------------------------------------------------
// HELPERS MÉTIER
// ---------------------------------------------------------------------
// Calcule la variation de la valeur totale du portefeuille depuis la veille.
function computeDayPnl() {
    const todayStr = new Date().toDateString();
    let todayVal = 0, prevVal = 0;
    assets.filter(a => !isPaperAsset(a)).forEach(a => {
        todayVal += a.value || 0;
        let lastPrev = null;
        (a.history || []).forEach(h => {
            const d = parseFlexDate(h.date);
            if (d && d.toDateString() !== todayStr && Number.isFinite(h.value)) {
                if (!lastPrev || d > lastPrev.date) lastPrev = { date: d, value: h.value };
            }
        });
        prevVal += lastPrev ? lastPrev.value : (a.value || 0);
    });
    const diff = todayVal - prevVal;
    const pct  = prevVal > 0 ? (diff / prevVal * 100) : 0;
    return { diff, pct, todayVal, prevVal };
}

// Prix unitaire d'un actif (approximation : valeur actuelle / quantité).
function getAssetUnitValue(asset) {
    if (!asset) return null;
    if (asset.qty > 0 && asset.value > 0) return asset.value / asset.qty;
    return null;
}

// Poids max d'un actif dans le portefeuille réel.
function getMaxConcentration() {
    const realAssets = assets.filter(a => !isPaperAsset(a));
    const total = realAssets.reduce((s, a) => s + (a.value || 0), 0);
    if (total <= 0) return { pct: 0, asset: null };
    let maxPct = 0, maxAsset = null;
    realAssets.forEach(a => {
        const pct = (a.value || 0) / total * 100;
        if (pct > maxPct) { maxPct = pct; maxAsset = a; }
    });
    return { pct: maxPct, asset: maxAsset };
}

// ---------------------------------------------------------------------
// ÉVALUATION DES ALERTES
// ---------------------------------------------------------------------
// Vérifie toutes les alertes actives. Ajoute au tableau triggeredAlerts
// (dédup par alertId) celles dont la condition est remplie et dont le
// cooldown est écoulé.
function evaluateAlerts() {
    alerts = loadAlertsFromStorage();
    if (!alerts.length) {
        triggeredAlerts = [];
        renderAlertsBanner();
        updateAlertsButtonUI();
        return;
    }

    const now = Date.now();
    const dayPnl = computeDayPnl();
    const concentration = getMaxConcentration();
    const todayDate = new Date();
    const todayDay = todayDate.getDate();
    const todayMonthKey = todayDate.getFullYear() + '-' + (todayDate.getMonth() + 1);

    alerts.forEach(a => {
        if (a.active === false) return;
        const cooldownMs = (a.cooldownHours || 24) * 3600 * 1000;
        if (cooldownMs > 0 && a.lastTriggeredAt && (now - a.lastTriggeredAt) < cooldownMs) return;

        let triggered = false;
        let message = '';

        const asset = a.assetId ? assets.find(x => x.id === a.assetId) : null;

        switch (a.type) {
            case 'PRICE_ABOVE':
            case 'ASSET_TARGET': {
                if (!asset) return;
                const unit = getAssetUnitValue(asset);
                if (unit === null) return;
                if (unit >= a.threshold) {
                    triggered = true;
                    const verb = a.type === 'ASSET_TARGET' ? 'Objectif de vente atteint' : 'Cours au-dessus du seuil';
                    message = `${verb} : ${asset.name} à ${formatEUR(unit)} (seuil ${formatEUR(a.threshold)})`;
                }
                break;
            }
            case 'PRICE_BELOW': {
                if (!asset) return;
                const unit = getAssetUnitValue(asset);
                if (unit === null) return;
                if (unit <= a.threshold) {
                    triggered = true;
                    message = `Cours en-dessous du seuil : ${asset.name} à ${formatEUR(unit)} (seuil ${formatEUR(a.threshold)})`;
                }
                break;
            }
            case 'PNL_DAY_PCT': {
                if (dayPnl.pct <= -Math.abs(a.threshold)) {
                    triggered = true;
                    message = `Portefeuille en baisse de ${dayPnl.pct.toFixed(2)} % aujourd'hui (${formatEUR(dayPnl.diff)})`;
                }
                break;
            }
            case 'PNL_DAY_ABS': {
                if (dayPnl.diff <= -Math.abs(a.threshold)) {
                    triggered = true;
                    message = `Portefeuille en baisse de ${formatEUR(dayPnl.diff)} aujourd'hui (${dayPnl.pct.toFixed(2)} %)`;
                }
                break;
            }
            case 'CONCENTRATION': {
                if (concentration.pct >= a.threshold && concentration.asset) {
                    triggered = true;
                    message = `Sur-concentration : ${concentration.asset.name} pèse ${concentration.pct.toFixed(1)} % (seuil ${a.threshold} %)`;
                }
                break;
            }
            case 'MONTHLY_REMINDER': {
                if (todayDay === (a.dayOfMonth || 1)) {
                    // On ne déclenche qu'une fois par mois
                    const monthKey = 'triggeredMonth';
                    if (a.lastTriggeredMonth === todayMonthKey) return;
                    triggered = true;
                    message = a.customMessage || `Rappel mensuel du ${a.dayOfMonth} : pensez à votre épargne / DCA`;
                    a.lastTriggeredMonth = todayMonthKey;
                }
                break;
            }
        }

        if (!triggered) return;

        // Dédup : on retire une éventuelle occurrence précédente, on ajoute la nouvelle
        triggeredAlerts = triggeredAlerts.filter(t => t.alertId !== a.id);
        triggeredAlerts.push({
            alertId: a.id,
            name: a.name,
            message: message,
            customMessage: a.customMessage || '',
            at: now
        });
        a.lastTriggeredAt = now;

        // --- Notification système native (Chantier N) ---
        // Chaque alerte peut choisir d'envoyer ou non une notif système via
        // le flag `nativeNotif` (défaut : true). Le cooldown déjà appliqué
        // plus haut empêche le spam.
        if (a.nativeNotif !== false) {
            const title = 'PatriMonial · ' + (a.name || 'Alerte');
            const body  = message + (a.customMessage ? '\n' + a.customMessage : '');
            // Envoi non bloquant : ne perturbe pas la boucle si échec
            sendNativeNotification(title, body, {
                tag: 'alert-' + a.id,
                alertId: a.id
            }).catch(() => {});
        }
    });

    saveAlertsToStorage();
    renderAlertsBanner();
    updateAlertsButtonUI();
}

// ---------------------------------------------------------------------
// RENDU — Bannière d'alertes déclenchées
// ---------------------------------------------------------------------
function renderAlertsBanner() {
    const zone = document.getElementById('alerts-banner-zone');
    if (!zone) return;

    if (!triggeredAlerts.length) {
        zone.innerHTML = '';
        return;
    }

    zone.innerHTML = triggeredAlerts.map((t, i) => `
        <div class="bg-rose-950/40 border border-rose-800/60 rounded-xl p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 shadow-lg shadow-rose-900/20">
            <div class="flex items-start gap-3 min-w-0">
                <div class="flex-shrink-0 w-8 h-8 rounded-lg bg-rose-950 border border-rose-700/60 flex items-center justify-center text-rose-300">
                    <i class="fa-solid fa-bell text-sm"></i>
                </div>
                <div class="min-w-0">
                    <div class="text-xs font-bold text-rose-200 truncate" title="${escapeHTML(t.name)}">
                        ${escapeHTML(t.name)}
                    </div>
                    <div class="text-[11px] text-gray-300 mt-0.5">
                        ${escapeHTML(t.message)}
                        ${t.customMessage ? `<span class="block text-rose-300 italic mt-0.5">${escapeHTML(t.customMessage)}</span>` : ''}
                    </div>
                </div>
            </div>
            <div class="flex items-center gap-1 flex-shrink-0">
                <span class="text-[10px] text-gray-500 font-mono whitespace-nowrap">${new Date(t.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                <button onclick="dismissTriggeredAlert(${i})" class="w-7 h-7 rounded-md bg-rose-900/60 text-rose-200 hover:bg-rose-800 hover:text-white flex items-center justify-center transition" title="Ignorer cette alerte">
                    <i class="fa-solid fa-xmark text-[10px]"></i>
                </button>
            </div>
        </div>
    `).join('') + (triggeredAlerts.length > 1
        ? `<div class="flex justify-end"><button onclick="dismissAllTriggeredAlerts()" class="text-[11px] text-rose-300 hover:text-rose-200 underline">Tout ignorer</button></div>`
        : '');
}

function dismissTriggeredAlert(index) {
    triggeredAlerts.splice(index, 1);
    renderAlertsBanner();
    updateAlertsButtonUI();
}

function dismissAllTriggeredAlerts() {
    triggeredAlerts = [];
    renderAlertsBanner();
    updateAlertsButtonUI();
}

function updateAlertsButtonUI() {
    const badge = document.getElementById('alerts-badge');
    if (!badge) return;
    const n = triggeredAlerts.length;
    badge.textContent = String(n);
    badge.classList.toggle('hidden', n === 0);
}

// ---------------------------------------------------------------------
// MODAL — Liste des alertes
// ---------------------------------------------------------------------
function openAlertsModal() {
    alerts = loadAlertsFromStorage();
    renderAlertsList();
    updateNativeNotifUI();
    document.getElementById('modal-alerts').classList.remove('hidden');
}

function renderAlertsList() {
    const list = document.getElementById('alerts-list');
    if (!list) return;

    if (!alerts.length) {
        list.innerHTML = `<div class="bg-gray-950 border border-dashed border-gray-700 rounded-lg p-6 text-center text-[11px] text-gray-500">
            <i class="fa-solid fa-bell-slash text-xl text-rose-500/40 mb-1 block"></i>
            Aucune alerte configurée. Cliquez sur le bouton ci-dessus pour commencer.
        </div>`;
        return;
    }

    // Trie : actives d'abord, puis désactivées
    const sorted = [...alerts].sort((a, b) => {
        const aa = a.active === false ? 1 : 0;
        const bb = b.active === false ? 1 : 0;
        return aa - bb;
    });

    list.innerHTML = sorted.map(a => {
        const typeLabel = ALERT_TYPES[a.type]?.label || a.type;
        const asset = a.assetId ? assets.find(x => x.id === a.assetId) : null;
        const isActive = a.active !== false;

        // Résumé court du déclencheur
        let triggerTxt = typeLabel;
        if (a.type === 'PRICE_ABOVE' && asset) triggerTxt = `Cours de ${asset.name} > ${formatEUR(a.threshold)}`;
        else if (a.type === 'PRICE_BELOW' && asset) triggerTxt = `Cours de ${asset.name} < ${formatEUR(a.threshold)}`;
        else if (a.type === 'ASSET_TARGET' && asset) triggerTxt = `Objectif de vente sur ${asset.name} à ${formatEUR(a.threshold)}`;
        else if (a.type === 'PNL_DAY_PCT') triggerTxt = `Portefeuille en baisse > ${a.threshold} % ce jour`;
        else if (a.type === 'PNL_DAY_ABS') triggerTxt = `Portefeuille en baisse > ${formatEUR(a.threshold)} ce jour`;
        else if (a.type === 'CONCENTRATION') triggerTxt = `Un actif dépasse ${a.threshold} % du portefeuille`;
        else if (a.type === 'MONTHLY_REMINDER') triggerTxt = `Rappel le ${a.dayOfMonth} de chaque mois`;

        const lastTrig = a.lastTriggeredAt
            ? new Date(a.lastTriggeredAt).toLocaleString('fr-FR')
            : 'Jamais déclenchée';

        return `<div class="bg-gray-950 border border-gray-800 rounded-lg p-3 ${isActive ? '' : 'opacity-60'} flex flex-col gap-2">
            <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                        <span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${isActive ? '#ef4444' : '#6b7280'};"></span>
                        <span class="font-bold text-white text-xs truncate">${escapeHTML(a.name)}</span>
                        ${!isActive ? '<span class="text-[9px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 border border-gray-700">désactivée</span>' : ''}
                    </div>
                    <div class="text-[10px] text-gray-400 mt-0.5">${escapeHTML(triggerTxt)}</div>
                    ${a.customMessage ? `<div class="text-[10px] text-rose-300 italic mt-0.5">"${escapeHTML(a.customMessage)}"</div>` : ''}
                </div>
                <div class="flex items-center gap-0.5 flex-shrink-0">
                    <button onclick="toggleAlertActive(${a.id})" class="w-7 h-7 rounded-md bg-gray-800 text-gray-300 hover:bg-amber-900/60 hover:text-amber-300 flex items-center justify-center transition" title="${isActive ? 'Désactiver' : 'Activer'}">
                        <i class="fa-solid fa-${isActive ? 'pause' : 'play'} text-[10px]"></i>
                    </button>
                    <button onclick="editAlert(${a.id})" class="w-7 h-7 rounded-md bg-gray-800 text-gray-300 hover:bg-indigo-900/60 hover:text-indigo-300 flex items-center justify-center transition" title="Modifier">
                        <i class="fa-solid fa-pen text-[10px]"></i>
                    </button>
                    <button onclick="deleteAlert(${a.id})" class="w-7 h-7 rounded-md bg-gray-800 text-gray-300 hover:bg-rose-900/60 hover:text-rose-300 flex items-center justify-center transition" title="Supprimer">
                        <i class="fa-solid fa-trash text-[10px]"></i>
                    </button>
                </div>
            </div>
            <div class="text-[9px] text-gray-600 font-mono">Dernière décl. : ${lastTrig}</div>
        </div>`;
    }).join('');
}

// ---------------------------------------------------------------------
// MODAL — Création / édition d'une alerte
// ---------------------------------------------------------------------
function openAddAlertModal() {
    document.getElementById('alert-edit-id').value = '';
    document.getElementById('modal-add-alert-title').innerHTML =
        '<i class="fa-solid fa-plus-circle text-rose-400"></i> Nouvelle alerte';
    document.getElementById('alert-name').value = '';
    // Peuple le sélecteur de type
    const typeSel = document.getElementById('alert-type');
    typeSel.innerHTML = Object.entries(ALERT_TYPES).map(([key, cfg]) =>
        `<option value="${key}">${escapeHTML(cfg.label)}</option>`
    ).join('');
    // Peuple le sélecteur d'actif
    const assetSel = document.getElementById('alert-asset-id');
    const realAssets = assets.filter(a => !isPaperAsset(a));
    assetSel.innerHTML = realAssets.length
        ? realAssets.map(a => `<option value="${a.id}">${escapeHTML(a.name)} (${escapeHTML(a.ticker)})</option>`).join('')
        : '<option value="">— Aucun actif —</option>';
    // Valeurs par défaut
    document.getElementById('alert-threshold').value = '';
    document.getElementById('alert-dayofmonth').value = 1;
    document.getElementById('alert-cooldown').value = '24';
    document.getElementById('alert-custom-message').value = '';
    document.getElementById('alert-active').checked = true;
    document.getElementById('alert-native-notif').checked = isNativeNotificationsEnabled();

    onAlertTypeChange();
    document.getElementById('modal-add-alert').classList.remove('hidden');
}

function editAlert(id) {
    const a = alerts.find(x => x.id === id);
    if (!a) return;
    document.getElementById('alert-edit-id').value = a.id;
    document.getElementById('modal-add-alert-title').innerHTML =
        '<i class="fa-solid fa-pen text-rose-400"></i> Modifier l\'alerte';
    document.getElementById('alert-name').value = a.name;

    // Peuple les sélecteurs
    const typeSel = document.getElementById('alert-type');
    typeSel.innerHTML = Object.entries(ALERT_TYPES).map(([key, cfg]) =>
        `<option value="${key}">${escapeHTML(cfg.label)}</option>`
    ).join('');
    typeSel.value = a.type;

    const assetSel = document.getElementById('alert-asset-id');
    const realAssets = assets.filter(x => !isPaperAsset(x));
    assetSel.innerHTML = realAssets.length
        ? realAssets.map(x => `<option value="${x.id}">${escapeHTML(x.name)} (${escapeHTML(x.ticker)})</option>`).join('')
        : '<option value="">— Aucun actif —</option>';
    if (a.assetId) assetSel.value = a.assetId;

    document.getElementById('alert-threshold').value = a.threshold !== undefined ? a.threshold : '';
    document.getElementById('alert-dayofmonth').value = a.dayOfMonth || 1;
    document.getElementById('alert-cooldown').value = String(a.cooldownHours !== undefined ? a.cooldownHours : 24);
    document.getElementById('alert-custom-message').value = a.customMessage || '';
    document.getElementById('alert-active').checked = a.active !== false;
    document.getElementById('alert-native-notif').checked = a.nativeNotif !== false;

    onAlertTypeChange();
    document.getElementById('modal-add-alert').classList.remove('hidden');
}

function onAlertTypeChange() {
    const type = document.getElementById('alert-type').value;
    const cfg = ALERT_TYPES[type] || {};

    document.getElementById('alert-asset-wrap').classList.toggle('hidden', !cfg.requiresAsset);
    document.getElementById('alert-threshold-wrap').classList.toggle('hidden', !cfg.requiresThreshold);
    document.getElementById('alert-dayofmonth-wrap').classList.toggle('hidden', !cfg.requiresDayOfMonth);

    if (cfg.requiresThreshold) {
        document.getElementById('alert-threshold-label').innerText = cfg.thresholdLabel || 'Seuil';
        document.getElementById('alert-threshold-unit').innerText = cfg.thresholdUnit || '';
        document.getElementById('alert-threshold-hint').innerText = cfg.hint || '';
    }
    if (cfg.requiresDayOfMonth) {
        const hint = document.getElementById('alert-threshold-hint');
        if (hint) hint.innerText = '';
    }
}

function handleAddAlert(e) {
    e.preventDefault();
    const editId = document.getElementById('alert-edit-id').value;
    const type = document.getElementById('alert-type').value;
    const cfg = ALERT_TYPES[type] || {};

    const alert = {
        id: editId ? parseFloat(editId) : Date.now() + Math.floor(Math.random() * 1000),
        name: document.getElementById('alert-name').value.trim(),
        type,
        active: document.getElementById('alert-active').checked,
        nativeNotif: document.getElementById('alert-native-notif').checked,
        cooldownHours: parseFloat(document.getElementById('alert-cooldown').value) || 24,
        customMessage: document.getElementById('alert-custom-message').value.trim()
    };

    if (cfg.requiresAsset) {
        const assetId = parseFloat(document.getElementById('alert-asset-id').value);
        if (!assetId) { alert('Sélectionnez un actif.'); return; }
        alert.assetId = assetId;
    }
    if (cfg.requiresThreshold) {
        const th = parseFloat(document.getElementById('alert-threshold').value);
        if (!Number.isFinite(th)) { alert('Renseignez un seuil valide.'); return; }
        alert.threshold = th;
    }
    if (cfg.requiresDayOfMonth) {
        alert.dayOfMonth = Math.max(1, Math.min(28, parseInt(document.getElementById('alert-dayofmonth').value) || 1));
    }

    if (!alert.name) { alert('Donnez un nom à l\'alerte.'); return; }

    if (editId) {
        const idx = alerts.findIndex(x => x.id === parseFloat(editId));
        if (idx > -1) alerts[idx] = { ...alerts[idx], ...alert };
    } else {
        alerts.push(alert);
    }
    saveAlertsToStorage();
    closeModal('modal-add-alert');
    renderAlertsList();
    updateAlertsButtonUI();
    // Réévalue immédiatement
    evaluateAlerts();
    renderAlertsList();
}

function deleteAlert(id) {
    const a = alerts.find(x => x.id === id);
    if (!a) return;
    if (!confirm(`Supprimer l'alerte "${a.name}" ?`)) return;
    pushUndo('Suppression d\'une alerte');
    alerts = alerts.filter(x => x.id !== id);
    saveAlertsToStorage();
    renderAlertsList();
    updateAlertsButtonUI();
    // Retire aussi le triggered correspondant
    triggeredAlerts = triggeredAlerts.filter(t => t.alertId !== id);
    renderAlertsBanner();
}

function toggleAlertActive(id) {
    const a = alerts.find(x => x.id === id);
    if (!a) return;
    a.active = !(a.active !== false);
    saveAlertsToStorage();
    renderAlertsList();
}

// Bouton "Tester" dans le formulaire — déclenche une alerte fictive pour
// vérifier que tout fonctionne sans attendre une vraie condition.
function testCurrentAlertForm() {
    const name = document.getElementById('alert-name').value.trim() || 'Alerte de test';
    const customMsg = document.getElementById('alert-custom-message').value.trim();
    triggeredAlerts = triggeredAlerts.filter(t => t.alertId !== '__test__');
    triggeredAlerts.push({
        alertId: '__test__',
        name: name,
        message: 'Ceci est un déclenchement de test — votre configuration fonctionne.',
        customMessage: customMsg,
        at: Date.now()
    });
    closeModal('modal-add-alert');
    closeModal('modal-alerts');
    renderAlertsBanner();
    updateAlertsButtonUI();
}

// ---------------------------------------------------------------------
// INITIALISATION
// ---------------------------------------------------------------------
// Chargée au boot via app7-init.js, et réévaluée à chaque refreshAllUI()
// depuis app6-api.js (via le hook existant).
(function initAlertsModule() {
    alerts = loadAlertsFromStorage();
    // Le rendu réel se fait au DOMContentLoaded depuis app7-init.js
})();