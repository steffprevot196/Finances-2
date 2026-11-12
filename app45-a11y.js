// =====================================================================
// app45-a11y.js — Accessibilité : modales, noms accessibles, étiquettes
// =====================================================================
// Ce module ne modifie aucune logique métier. Il :
//   1. déclare chaque modale `modal-*` comme boîte de dialogue ARIA
//      (role="dialog", aria-modal, aria-labelledby) ;
//   2. gère le focus : entrée dans la modale à l'ouverture, piège de Tab
//      (le focus ne sort plus de la modale), restitution du focus à la
//      fermeture ;
//   3. expose closeTopmostModal() : Échap ferme UNIQUEMENT la modale du
//      dessus (et non toutes, comme avant) ;
//   4. donne un nom accessible aux boutons-icônes (×, crayon, corbeille…),
//      associe les <label> à leur champ (for/id), masque les icônes
//      décoratives aux lecteurs d'écran.
// Les points 4 s'appliquent au chargement ET au contenu généré ensuite
// par le JS (innerHTML), via un MutationObserver (nœuds ajoutés seulement).
// Idempotent : on peut rappeler enhanceAccessibility(root) sans risque.
// =====================================================================

(function () {
    'use strict';

    const MODAL_SELECTOR = '[id^="modal-"].fixed.inset-0';
    const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), '
        + 'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const FIELD_TAGS = /^(INPUT|SELECT|TEXTAREA)$/;

    // ----------------------------------------------------------------
    // Utilitaires
    // ----------------------------------------------------------------
    function isVisible(el) {
        // getClientRects : fiable aussi pour position:fixed (offsetParent = null)
        return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    }
    function isOpen(modal) { return !modal.classList.contains('hidden'); }

    // Éléments correspondant au sélecteur : la racine elle-même + ses descendants
    function matchAll(root, selector) {
        const out = [];
        if (root.matches && root.matches(selector)) out.push(root);
        if (root.querySelectorAll) out.push(...root.querySelectorAll(selector));
        return out;
    }

    function openDialogs() {
        return [...document.querySelectorAll(MODAL_SELECTOR)].filter(m => isOpen(m) && isVisible(m));
    }

    // Modale visuellement au-dessus : z-index le plus haut ; à égalité,
    // la dernière dans le DOM (ordre de peinture).
    function topDialog() {
        const list = openDialogs();
        if (!list.length) return null;
        return list.reduce((best, m) => {
            const zb = parseInt(getComputedStyle(best).zIndex, 10) || 0;
            const zm = parseInt(getComputedStyle(m).zIndex, 10) || 0;
            if (zm > zb) return m;
            if (zm < zb) return best;
            return (best.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING) ? m : best;
        });
    }

    // ----------------------------------------------------------------
    // 1) Sémantique de dialogue
    // ----------------------------------------------------------------
    function humanize(id) { return id.replace(/^modal-/, '').replace(/-/g, ' '); }

    function ensureDialogTitle(modal) {
        const ref = modal.getAttribute('aria-labelledby');
        if (ref && document.getElementById(ref)) return;
        const heading = modal.querySelector('h1, h2, h3, h4');
        if (heading && heading.textContent.trim()) {
            if (!heading.id) heading.id = modal.id + '-title';
            modal.setAttribute('aria-labelledby', heading.id);
            modal.removeAttribute('aria-label');
        } else if (!modal.hasAttribute('aria-label')) {
            modal.setAttribute('aria-label', humanize(modal.id));
        }
    }

    const wasOpen = new WeakMap();   // modale -> était ouverte au dernier passage
    const openers = new WeakMap();   // modale -> élément qui avait le focus avant ouverture

    const classObserver = new MutationObserver(records => {
        const seen = new Set();
        records.forEach(r => seen.add(r.target));
        seen.forEach(modal => {
            const open = isOpen(modal);
            if (open && !wasOpen.get(modal)) onOpened(modal);
            else if (!open && wasOpen.get(modal)) onClosed(modal);
            wasOpen.set(modal, open);
        });
    });

    function enhanceDialog(modal) {
        if (modal.dataset.a11yDialog) return;
        modal.dataset.a11yDialog = '1';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        if (!modal.hasAttribute('tabindex')) modal.setAttribute('tabindex', '-1');
        ensureDialogTitle(modal);
        classObserver.observe(modal, { attributes: true, attributeFilter: ['class'] });
        wasOpen.set(modal, false);
        if (isOpen(modal)) { onOpened(modal); wasOpen.set(modal, true); }
    }

    // ----------------------------------------------------------------
    // 2) Focus : entrée, piège de Tab, restitution
    // ----------------------------------------------------------------
    function focusFirst(modal) {
        const preferred = modal.querySelector('[autofocus], [data-autofocus]');
        let target = (preferred && isVisible(preferred)) ? preferred : null;
        if (!target) {
            const list = [...modal.querySelectorAll(FOCUSABLE)].filter(isVisible);
            // On préfère un champ de saisie au bouton de fermeture (×) de l'en-tête
            target = list.find(el => FIELD_TAGS.test(el.tagName)) || list[0] || null;
        }
        (target || modal).focus({ preventScroll: true });
    }

    function onOpened(modal) {
        ensureDialogTitle(modal);
        const ae = document.activeElement;
        openers.set(modal, (ae && ae !== document.body && !modal.contains(ae)) ? ae : null);
        // Le contenu est souvent rempli juste après le retrait de `hidden` :
        // on attend le prochain rendu avant de placer le focus.
        requestAnimationFrame(() => {
            if (!isOpen(modal) || modal.contains(document.activeElement)) return;
            focusFirst(modal);
        });
    }

    function onClosed(modal) {
        const opener = openers.get(modal);
        openers.delete(modal);
        if (opener && opener.isConnected && isVisible(opener)) {
            opener.focus({ preventScroll: true });
        }
    }

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;
        const top = topDialog();
        if (!top) return;
        const list = [...top.querySelectorAll(FOCUSABLE)].filter(isVisible);
        if (!list.length) { e.preventDefault(); top.focus(); return; }
        const first = list[0];
        const last = list[list.length - 1];
        const ae = document.activeElement;
        if (!top.contains(ae)) {
            e.preventDefault();
            (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && (ae === first || ae === top)) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && ae === last) {
            e.preventDefault();
            first.focus();
        }
    });

    // ----------------------------------------------------------------
    // 3) Échap : ferme seulement la modale du dessus
    // ----------------------------------------------------------------
    // Retourne true si une modale a été fermée.
    function closeTopmostModal() {
        const top = topDialog();
        if (!top) return false;
        if (top.id === 'modal-command-palette' && typeof closeCommandPalette === 'function') {
            closeCommandPalette();
        } else if (typeof closeModal === 'function' && top.id) {
            closeModal(top.id);
        } else {
            top.classList.add('hidden');
        }
        return true;
    }
    window.closeTopmostModal = closeTopmostModal;

    // ----------------------------------------------------------------
    // 4) Noms accessibles, étiquettes, icônes décoratives
    // ----------------------------------------------------------------
    const ICON_LABELS = [
        [/fa-(xmark|times|circle-xmark|xmark-circle|rectangle-xmark)\b/, 'Fermer'],
        [/fa-(pen|pencil|pen-to-square|pen-clip|edit)\b/, 'Modifier'],
        [/fa-(trash|trash-can|trash-alt)\b/, 'Supprimer'],
        [/fa-(magnifying-glass|search)\b/, 'Rechercher'],
        [/fa-(plus|circle-plus|square-plus)\b/, 'Ajouter'],
        [/fa-(minus|circle-minus)\b/, 'Retirer'],
        [/fa-(chevron-left|angle-left|arrow-left|caret-left)\b/, 'Précédent'],
        [/fa-(chevron-right|angle-right|arrow-right|caret-right)\b/, 'Suivant'],
        [/fa-(copy|clone)\b/, 'Dupliquer'],
        [/fa-(bell)\b/, 'Notifications'],
        [/fa-(moon|sun|circle-half-stroke)\b/, 'Changer de thème'],
        [/fa-(gear|cog|sliders)\b/, 'Paramètres'],
        [/fa-(arrows-rotate|rotate-right|rotate|sync)\b/, 'Actualiser'],
        [/fa-(download|file-arrow-down)\b/, 'Télécharger'],
        [/fa-(ellipsis|ellipsis-vertical)\b/, 'Plus d\u2019actions']
    ];

    function enhanceButtons(root) {
        matchAll(root, 'button, [role="button"]').forEach(btn => {
            if (btn.hasAttribute('aria-label') || btn.hasAttribute('aria-labelledby')) return;
            if (btn.textContent.trim()) return;           // déjà nommé par son texte
            if (btn.getAttribute('title')) return;        // le title fournit déjà un nom
            const classes = [...btn.querySelectorAll('i, svg')]
                .map(el => el.getAttribute('class') || '').join(' ');
            const hit = ICON_LABELS.find(([re]) => re.test(classes));
            if (!hit) return;
            let label = hit[1];
            // Dans un tableau, on précise la ligne concernée : « Modifier — Nom de l'actif »
            if (label === 'Modifier' || label === 'Supprimer' || label === 'Dupliquer') {
                const row = btn.closest('tr');
                const cell = row && row.querySelector('td, th');
                const txt = cell && cell.textContent.trim().replace(/\s+/g, ' ').slice(0, 50);
                if (txt) label += ' \u2014 ' + txt;
            }
            btn.setAttribute('aria-label', label);
        });
    }

    let uid = 0;
    function enhanceFields(root) {
        // a) <label> sans `for` suivi (directement ou via un conteneur) d'UN champ
        matchAll(root, 'label:not([for])').forEach(label => {
            if (label.querySelector('input, select, textarea')) return;   // enveloppe déjà son champ
            let field = label.nextElementSibling;
            if (field && !FIELD_TAGS.test(field.tagName)) {
                const inner = field.querySelectorAll('input:not([type="hidden"]), select, textarea');
                field = (inner.length === 1) ? inner[0] : null;
            }
            if (!field || !FIELD_TAGS.test(field.tagName)) return;
            if (!field.id) field.id = 'a11y-field-' + (++uid);
            label.setAttribute('for', field.id);
        });
        // b) Champs restés sans nom : repli sur title, puis placeholder
        matchAll(root, 'input:not([type="hidden"]):not([type="file"]), select, textarea').forEach(field => {
            if (field.hasAttribute('aria-label') || field.hasAttribute('aria-labelledby')) return;
            if (field.labels && field.labels.length) return;
            const name = field.getAttribute('title') || field.getAttribute('placeholder');
            if (name) field.setAttribute('aria-label', name);
        });
    }

    function hideDecorativeIcons(root) {
        matchAll(root, 'i[class*="fa-"]:not([aria-hidden])').forEach(i => i.setAttribute('aria-hidden', 'true'));
    }

    function enhanceAccessibility(root) {
        root = root || document.body;
        if (!root || root.nodeType !== 1) return;
        matchAll(root, MODAL_SELECTOR).forEach(enhanceDialog);
        enhanceFields(root);        // avant les boutons : pas de dépendance, mais ordre stable
        enhanceButtons(root);
        hideDecorativeIcons(root);
    }
    window.enhanceAccessibility = enhanceAccessibility;

    // Contenu ajouté dynamiquement (innerHTML, modales créées à la volée)
    const pending = new Set();
    let scheduled = false;
    function flush() {
        scheduled = false;
        const nodes = [...pending];
        pending.clear();
        nodes.forEach(n => { if (n.isConnected) enhanceAccessibility(n); });
    }
    const domObserver = new MutationObserver(records => {
        records.forEach(r => r.addedNodes.forEach(n => { if (n.nodeType === 1) pending.add(n); }));
        if (pending.size && !scheduled) { scheduled = true; requestAnimationFrame(flush); }
    });

    function init() {
        enhanceAccessibility(document.body);
        domObserver.observe(document.body, { childList: true, subtree: true });
        console.info('[A11y] Module chargé \u2014 ' + document.querySelectorAll(MODAL_SELECTOR).length + ' modale(s) équipée(s).');
    }
    if (document.body) init();
    else document.addEventListener('DOMContentLoaded', init);
})();
