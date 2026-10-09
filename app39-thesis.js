// =====================================================================
// app39-thesis.js — NOTES DE THÈSE D'INVESTISSEMENT (Chantier §10)
// Dépend de : app1-core.js (assets, escapeHTML, parseFlexDate)
// Charge après app38-filters.js, avant tests.js
// =====================================================================
//
// Permet d'attacher à chaque actif une "thèse d'investissement" :
// un texte libre (~500 caractères) qui explique POURQUOI on détient
// cette position, et qui sert de garde-fou émotionnel lors des baisses.
//
// FONCTIONNALITÉS :
//   • Champ texte libre optionnel sur chaque actif
//   • Date de dernière mise à jour de la thèse
//   • Rappel automatique si :
//       - performance latente < -20 %
//       - ET thèse inchangée depuis > 1 an
//   • Bandeau permanent dans le modal de détail (texte visible)
//   • Bouton "Marquer comme revue" pour horodater une révision
//
// STOCKAGE : directement sur l'objet asset :
//   asset.thesis = {
//     text: string,              // ~500 chars max
//     createdAt: number,         // timestamp de création initiale
//     updatedAt: number,         // timestamp de dernière modification
//     lastReviewedAt: number     // timestamp de dernière revue explicite
//   }
//
// Le module ne modifie pas la structure de `assets` si aucun actif n'a
// de thèse : la propriété `thesis` reste absente (undefined).
// =====================================================================

const THESIS_MAX_LENGTH = 500;
const THESIS_REVIEW_STALE_DAYS = 365;    // 1 an
const THESIS_LOSS_THRESHOLD_PCT = -20;   // % de perte déclencheur

// ---------------------------------------------------------------------
// HELPERS DE BASE
// ---------------------------------------------------------------------
function hasThesis(asset) {
    return !!(asset && asset.thesis && typeof asset.thesis.text === 'string' && asset.thesis.text.trim().length > 0);
}

function getThesisText(asset) {
    return hasThesis(asset) ? asset.thesis.text.trim() : '';
}

// Combien de jours depuis la dernière revue ? (ou la dernière modif à défaut)
function getThesisAgeDays(asset) {
    if (!hasThesis(asset)) return null;
    const last = asset.thesis.lastReviewedAt || asset.thesis.updatedAt || asset.thesis.createdAt;
    if (!Number.isFinite(last) || last <= 0) return null;
    return Math.floor((Date.now() - last) / 864e5);
}

// Performance latente en % (signée)
function _getAssetPnlPct(asset) {
    if (!asset || !Number.isFinite(asset.invested) || asset.invested <= 0) return 0;
    return ((asset.value || 0) - asset.invested) / asset.invested * 100;
}

// ---------------------------------------------------------------------
// DÉTECTION DES THÈSES À REVOIR
// ---------------------------------------------------------------------
// Renvoie la liste des actifs nécessitant une revue de thèse :
//   • thèse âgée > THESIS_REVIEW_STALE_DAYS
//   • ET performance latente < THESIS_LOSS_THRESHOLD_PCT
// Retourne [{ asset, ageDays, pnlPct, severity }] triés par criticité.
function detectStaleTheses(assetList) {
    const list = (assetList || assets).filter(a => !isPaperAsset(a));
    const results = [];

    list.forEach(a => {
        if (!hasThesis(a)) return;
        const ageDays = getThesisAgeDays(a);
        if (ageDays === null || ageDays < THESIS_REVIEW_STALE_DAYS) return;

        const pnlPct = _getAssetPnlPct(a);
        if (pnlPct >= THESIS_LOSS_THRESHOLD_PCT) return;

        // Sévérité : plus la perte est forte et la thèse ancienne, plus c'est critique
        const lossSeverity = Math.abs(pnlPct + THESIS_LOSS_THRESHOLD_PCT);
        const ageSeverity = (ageDays - THESIS_REVIEW_STALE_DAYS) / 365;
        const severity = lossSeverity + ageSeverity;

        results.push({
            asset: a,
            ageDays,
            pnlPct,
            severity
        });
    });

    return results.sort((a, b) => b.severity - a.severity);
}

// Compte simplifié pour les badges
function countStaleTheses() {
    return detectStaleTheses().length;
}

// ---------------------------------------------------------------------
// CRUD — création / mise à jour / revue
// ---------------------------------------------------------------------
// Met à jour (ou crée) la thèse d'un actif.
function setAssetThesis(assetId, text) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return false;

    const trimmed = String(text || '').trim().slice(0, THESIS_MAX_LENGTH);
    const now = Date.now();

    if (!trimmed) {
        // Vide → on supprime la thèse
        delete asset.thesis;
        return true;
    }

    if (!asset.thesis) {
        asset.thesis = {
            text: trimmed,
            createdAt: now,
            updatedAt: now,
            lastReviewedAt: now
        };
    } else {
        asset.thesis.text = trimmed;
        asset.thesis.updatedAt = now;
        // Une modification de texte vaut validation implicite → revue
        asset.thesis.lastReviewedAt = now;
    }
    return true;
}

// Marque une thèse comme "revue" sans modifier le texte (bouton dédié).
function markThesisReviewed(assetId) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset || !hasThesis(asset)) return false;
    asset.thesis.lastReviewedAt = Date.now();
    return true;
}

// Supprime la thèse d'un actif (déjà couvert par setAssetThesis(id, '')).
function removeAssetThesis(assetId) {
    return setAssetThesis(assetId, '');
}

// ---------------------------------------------------------------------
// RENDU — Encart dans le modal de détail
// ---------------------------------------------------------------------
// Injecte (ou remplace) un bloc de thèse dans le modal de détail actif.
// L'emplacement d'insertion est APRÈS le graphique et AVANT la section lots.
function renderThesisPanel(asset) {
    const old = document.getElementById('asset-thesis-panel');
    if (old) old.remove();

    // Emplacement cible : la div p-6 qui suit la zone graphique
    const modal = document.getElementById('modal-asset-detail');
    if (!modal) return;
    const content = modal.querySelector('.p-6.space-y-4');
    if (!content) return;

    // Ancre : on insère juste avant la section "Détail des achats successifs"
    const lotsTitle = content.querySelector('.text-xs.font-bold.uppercase');
    const anchor = lotsTitle ? lotsTitle.closest('div') : null;

    const thesis = hasThesis(asset) ? asset.thesis : null;
    const pnlPct = _getAssetPnlPct(asset);
    const ageDays = getThesisAgeDays(asset);
    const isStale = thesis && ageDays !== null && ageDays >= THESIS_REVIEW_STALE_DAYS && pnlPct < THESIS_LOSS_THRESHOLD_PCT;

    const formattedDate = (ts) => ts ? new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

    const panel = document.createElement('div');
    panel.id = 'asset-thesis-panel';
    panel.className = thesis
        ? `rounded-xl p-4 space-y-2 border ${isStale ? 'bg-amber-950/20 border-amber-800/50' : 'bg-indigo-950/20 border-indigo-800/40'}`
        : 'rounded-xl p-4 space-y-2 border border-dashed border-gray-700 bg-gray-950/40';

    if (thesis) {
        const lastDate = formattedDate(thesis.lastReviewedAt || thesis.updatedAt || thesis.createdAt);
        const ageTxt = ageDays !== null ? `${ageDays} j` : '—';

        panel.innerHTML = `
            <div class="flex items-start justify-between gap-3">
                <div class="flex items-start gap-2 min-w-0">
                    <i class="fa-solid fa-scroll text-${isStale ? 'amber' : 'indigo'}-400 mt-0.5"></i>
                    <div class="min-w-0">
                        <div class="text-[11px] font-bold text-${isStale ? 'amber' : 'indigo'}-300 uppercase tracking-wide">
                            Thèse d'investissement
                        </div>
                        <div class="text-[10px] text-gray-500 mt-0.5">
                            Dernière revue : ${lastDate} · il y a ${ageTxt}
                        </div>
                    </div>
                </div>
                <div class="flex gap-1 flex-shrink-0">
                    <button type="button" onclick="event.stopPropagation(); openThesisEditModal(${asset.id})"
                            class="px-2 py-1 rounded bg-gray-800 hover:bg-indigo-900/60 text-gray-300 hover:text-indigo-300 text-[10px] transition"
                            title="Modifier la thèse">
                        <i class="fa-solid fa-pen text-[9px]"></i>
                    </button>
                    <button type="button" onclick="event.stopPropagation(); onThesisMarkReviewed(${asset.id})"
                            class="px-2 py-1 rounded bg-gray-800 hover:bg-emerald-900/60 text-gray-300 hover:text-emerald-300 text-[10px] transition"
                            title="Marquer comme revue (aujourd'hui)">
                        <i class="fa-solid fa-check text-[9px]"></i> Revue
                    </button>
                </div>
            </div>
            <div class="text-[11px] text-gray-300 leading-relaxed whitespace-pre-wrap pl-6">${escapeHTML(thesis.text)}</div>
            ${isStale ? `
                <div class="bg-amber-950/40 border border-amber-800/50 rounded-lg p-2.5 text-[10px] text-amber-200 leading-relaxed pl-2 ml-6">
                    <i class="fa-solid fa-triangle-exclamation mr-1"></i>
                    <b>Revue recommandée :</b> la thèse date de plus d'un an et la position est en perte de ${pnlPct.toFixed(1)} %.
                    La raison de votre investissement est-elle toujours valide ?
                </div>
            ` : ''}
        `;
    } else {
        panel.innerHTML = `
            <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-2 min-w-0">
                    <i class="fa-solid fa-scroll text-gray-500"></i>
                    <div>
                        <div class="text-[11px] font-bold text-gray-400">Aucune thèse d'investissement</div>
                        <div class="text-[10px] text-gray-500 mt-0.5">
                            Documentez pourquoi vous détenez cette position — utile pour éviter les décisions émotionnelles.
                        </div>
                    </div>
                </div>
                <button type="button" onclick="event.stopPropagation(); openThesisEditModal(${asset.id})"
                        class="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-medium transition flex items-center gap-1.5 flex-shrink-0">
                    <i class="fa-solid fa-plus text-[9px]"></i> Rédiger
                </button>
            </div>
        `;
    }

    if (anchor) {
        content.insertBefore(panel, anchor);
    } else {
        content.appendChild(panel);
    }
}

function onThesisMarkReviewed(assetId) {
    if (markThesisReviewed(assetId)) {
        saveToStorage();
        const asset = assets.find(a => a.id === assetId);
        if (asset) renderThesisPanel(asset);
        if (typeof toastSuccess === 'function') {
            toastSuccess('Thèse revue', 'La date de dernière revue a été mise à jour.');
        }
    }
}

// ---------------------------------------------------------------------
// MODAL D'ÉDITION DE THÈSE
// ---------------------------------------------------------------------
function openThesisEditModal(assetId) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;

    const modal = document.getElementById('modal-thesis-edit');
    if (!modal) return;

    // En-tête
    document.getElementById('thesis-asset-id').value = assetId;
    document.getElementById('thesis-modal-title').innerHTML =
        `<i class="fa-solid fa-scroll text-indigo-400"></i> Thèse — ${escapeHTML(asset.name)}`;

    // Contenu
    const textarea = document.getElementById('thesis-text-input');
    textarea.value = hasThesis(asset) ? asset.thesis.text : '';

    // Info date
    const infoEl = document.getElementById('thesis-modal-info');
    if (hasThesis(asset)) {
        const ageDays = getThesisAgeDays(asset);
        const last = asset.thesis.lastReviewedAt || asset.thesis.updatedAt || asset.thesis.createdAt;
        infoEl.innerHTML = `<i class="fa-solid fa-circle-info text-blue-400 mr-1"></i> Thèse créée il y a ${ageDays} jour(s) · dernière revue le ${new Date(last).toLocaleDateString('fr-FR')}`;
    } else {
        infoEl.innerHTML = `<i class="fa-solid fa-lightbulb text-amber-400 mr-1"></i> Décrivez en quelques phrases <b>pourquoi</b> vous détenez cette position et <b>à quelles conditions</b> vous la vendriez.`;
    }

    updateThesisCharCount();
    modal.classList.remove('hidden');
    setTimeout(() => textarea.focus(), 60);
}

function updateThesisCharCount() {
    const textarea = document.getElementById('thesis-text-input');
    const counter = document.getElementById('thesis-char-count');
    if (!textarea || !counter) return;
    const len = textarea.value.length;
    counter.innerText = `${len} / ${THESIS_MAX_LENGTH}`;
    counter.className = `text-[10px] font-mono ${len > THESIS_MAX_LENGTH * 0.9 ? 'text-amber-400' : 'text-gray-500'}`;
}

function handleThesisSubmit(e) {
    e.preventDefault();
    const assetId = parseFloat(document.getElementById('thesis-asset-id').value);
    const text = document.getElementById('thesis-text-input').value;

    if (!setAssetThesis(assetId, text)) {
        alert('Actif introuvable.');
        return;
    }

    saveToStorage();
    closeModal('modal-thesis-edit');

    // Re-render
    const asset = assets.find(a => a.id === assetId);
    if (asset && typeof currentAssetDetailId !== 'undefined' && currentAssetDetailId === assetId) {
        renderThesisPanel(asset);
    }
    if (typeof renderInventoryTable === 'function') renderInventoryTable();

    if (typeof toastSuccess === 'function') {
        toastSuccess(
            text.trim() ? 'Thèse enregistrée' : 'Thèse supprimée',
            text.trim() ? 'La note est visible dans le détail de l\'actif.' : 'La note a été retirée.'
        );
    }
}

function deleteThesisConfirm() {
    const assetId = parseFloat(document.getElementById('thesis-asset-id').value);
    const asset = assets.find(a => a.id === assetId);
    if (!asset || !hasThesis(asset)) return;
    if (!confirm('Supprimer la thèse de cet actif ?')) return;

    setAssetThesis(assetId, '');
    saveToStorage();
    closeModal('modal-thesis-edit');
    if (typeof currentAssetDetailId !== 'undefined' && currentAssetDetailId === assetId) {
        renderThesisPanel(asset);
    }
    if (typeof toastInfo === 'function') toastInfo('Thèse supprimée', asset.name);
}

// ---------------------------------------------------------------------
// SECTION "THÈSES À REVOIR" (dans le dashboard)
// ---------------------------------------------------------------------
function renderThesesReviewSection() {
    const wrap = document.getElementById('theses-review-wrap');
    if (!wrap) return;

    const stale = detectStaleTheses();

    if (!stale.length) {
        wrap.innerHTML = `
            <div class="flex items-center gap-2 text-emerald-400 bg-emerald-950/20 border border-emerald-800/40 rounded-lg p-3 text-[11px]">
                <i class="fa-solid fa-circle-check"></i>
                <span><b>Aucune thèse à revoir</b> — toutes vos positions en difficulté ont une note récente.</span>
            </div>`;
        return;
    }

    wrap.innerHTML = `
        <div class="text-[11px] text-amber-300 mb-2 flex items-center gap-1.5">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <b>${stale.length} thèse(s) à revoir</b> — note ancienne + position en perte
        </div>
        ${stale.map(item => {
            const a = item.asset;
            return `
                <div class="flex items-center justify-between gap-2 bg-amber-950/20 border border-amber-800/40 rounded-lg p-2.5 mb-1.5 last:mb-0">
                    <div class="min-w-0 flex-1 cursor-pointer" onclick="openAssetDetailModal(${a.id})">
                        <div class="font-bold text-white text-[11px] truncate">${escapeHTML(a.name)}</div>
                        <div class="text-[10px] text-gray-400 font-mono">
                            ${escapeHTML(a.ticker || '—')} · perte ${item.pnlPct.toFixed(1)} % · thèse il y a ${item.ageDays} j
                        </div>
                    </div>
                    <button type="button" onclick="event.stopPropagation(); openThesisEditModal(${a.id})"
                            class="px-2 py-1 rounded bg-amber-700 hover:bg-amber-600 text-white text-[10px] font-medium transition flex-shrink-0">
                        <i class="fa-solid fa-pen text-[9px]"></i> Revoir
                    </button>
                </div>
            `;
        }).join('')}
    `;
}

// ---------------------------------------------------------------------
// BADGE — pour la table d'inventaire (petit icône scroll)
// ---------------------------------------------------------------------
// Renvoie '' ou un <span> discret selon que l'actif a une thèse et si
// elle nécessite une revue.
function thesisBadgeHTML(asset) {
    if (!hasThesis(asset)) return '';
    const ageDays = getThesisAgeDays(asset);
    const pnlPct = _getAssetPnlPct(asset);
    const stale = ageDays !== null && ageDays >= THESIS_REVIEW_STALE_DAYS && pnlPct < THESIS_LOSS_THRESHOLD_PCT;

    if (stale) {
        return ` <span class="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold bg-amber-950 text-amber-300 border border-amber-800/50" title="Thèse à revoir (âge ${ageDays} j, perte ${pnlPct.toFixed(1)} %)"><i class="fa-solid fa-scroll text-[8px]"></i> ⚠</span>`;
    }
    return ` <span class="inline-flex items-center px-1 py-0.5 rounded text-[9px] bg-indigo-950/60 text-indigo-300 border border-indigo-800/40" title="Thèse disponible (âge ${ageDays} j)"><i class="fa-solid fa-scroll text-[8px]"></i></span>`;
}

// ---------------------------------------------------------------------
// HOOK SUR openAssetDetailModal
// ---------------------------------------------------------------------
(function _hookThesisPanel() {
    const orig = window.openAssetDetailModal;
    if (typeof orig !== 'function') return;
    if (orig._thesisHooked) return;

    const wrapped = function (...args) {
        const r = orig.apply(this, args);
        setTimeout(() => {
            const asset = assets.find(a => a.id === currentAssetDetailId);
            if (asset) renderThesisPanel(asset);
        }, 40);
        return r;
    };
    wrapped._thesisHooked = true;
    wrapped._originalFn = orig;
    window.openAssetDetailModal = wrapped;
})();

// ---------------------------------------------------------------------
// INITIALISATION
// ---------------------------------------------------------------------
function initThesisModule() {
    console.info('[Thesis] Module chargé — ' + detectStaleTheses().length + ' thèse(s) à revoir.');
}

// Expose l'API globalement
window.hasThesis               = hasThesis;
window.getThesisText           = getThesisText;
window.getThesisAgeDays        = getThesisAgeDays;
window.detectStaleTheses       = detectStaleTheses;
window.countStaleTheses        = countStaleTheses;
window.setAssetThesis          = setAssetThesis;
window.markThesisReviewed      = markThesisReviewed;
window.removeAssetThesis       = removeAssetThesis;
window.renderThesisPanel       = renderThesisPanel;
window.onThesisMarkReviewed    = onThesisMarkReviewed;
window.openThesisEditModal     = openThesisEditModal;
window.updateThesisCharCount   = updateThesisCharCount;
window.handleThesisSubmit      = handleThesisSubmit;
window.deleteThesisConfirm     = deleteThesisConfirm;
window.renderThesesReviewSection = renderThesesReviewSection;
window.thesisBadgeHTML         = thesisBadgeHTML;
window.initThesisModule        = initThesisModule;