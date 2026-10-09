// =====================================================================
// app28-csp-audit.js — AUDIT CSP + DÉLÉGATEUR DE FALLBACK (Chantier 5.3)
// Dépend de : app1-core.js (escapeHTML)
// Charge après app27-broker-import.js, avant tests.js
// =====================================================================
//
// CONTEXTE SÉCURITÉ :
// La CSP actuelle (index.html) contient script-src 'unsafe-inline' pour
// autoriser les ~200 attributs onclick=/onchange=/oninput= présents dans
// le HTML. Retirer 'unsafe-inline' renforcerait la sécurité, mais le
// navigateur bloquerait alors TOUS les handlers inline → app inutilisable.
//
// STRATÉGIE EN 2 TEMPS :
//
//   1. AUDIT (ce module, non invasif) :
//      • Scanne le DOM et catégorise chaque handler inline
//      • Génère un rapport console : simple / multi / complexe
//      • Mesure la surface exacte à traiter
//
//   2. DÉLÉGATEUR DE FALLBACK (ce module, activable) :
//      • Installe un écouteur global qui "rejoue" les handlers inline
//      • Parse les cas simples : fn() / fn(args) / event.stopPropagation()
//      • Découpe les cas multi : instr1; instr2; ...
//      • NE FAIT PAS appel à eval/Function (interdits par CSP)
//      • Une fois activé, on peut retirer 'unsafe-inline' de la CSP sans
//        casser le HTML existant.
//
// Aucune modification n'est faite à la CSP automatiquement. Le user peut :
//   • lancer l'audit : runCspAudit() (console) ou Ctrl+K → "Audit CSP"
//   • tester le délégateur : enableCspFallbackDelegator()
//   • le désactiver : disableCspFallbackDelegator()
// =====================================================================

// ---------------------------------------------------------------------
// AUDIT
// ---------------------------------------------------------------------
const CSP_AUDITED_ATTRS = [
    'onclick', 'onchange', 'oninput', 'onsubmit', 'onkeydown', 'onkeyup',
    'onfocus', 'onblur', 'onmouseover', 'onmouseout', 'onload', 'onerror'
];

// Catégorise un handler inline
function _classifyInlineHandler(code) {
    const c = String(code || '').trim();

    // Cas complexe : contient des opérateurs de contrôle
    if (c.includes('?') || c.includes('&&') || c.includes('||') ||
        /\bif\s*\(/.test(c) || /\breturn\b/.test(c)) {
        return 'complex';
    }

    // Multi-instructions (séparées par ;)
    // Sauf un seul point-virgule terminal
    const withoutTrailing = c.replace(/;\s*$/, '');
    if (withoutTrailing.includes(';')) return 'multi';

    // Simple : fn() ou fn(args) ou this.value ou event.xxx
    if (/^[a-zA-Z_$][a-zA-Z0-9_$.]*\s*\([^()]*\)$/.test(withoutTrailing)) return 'simple';

    // Autres cas (assignations directes, etc.)
    return 'other';
}

// Extrait la fonction cible et le nombre d'arguments
function _parseSimpleHandler(code) {
    const m = String(code || '').trim().replace(/;\s*$/, '').match(/^([a-zA-Z_$][a-zA-Z0-9_$.]*)\s*\(([^()]*)\)$/);
    if (!m) return null;
    return {
        fnPath: m[1],
        argsRaw: m[2],
        argsCount: m[2].split(',').map(s => s.trim()).filter(Boolean).length
    };
}

// Lance l'audit complet et affiche le rapport
function runCspAudit() {
    const handlers = [];
    CSP_AUDITED_ATTRS.forEach(attr => {
        document.querySelectorAll(`[${attr}]`).forEach(el => {
            const code = (el.getAttribute(attr) || '').trim();
            if (!code) return;
            const category = _classifyInlineHandler(code);
            const parsed = category === 'simple' ? _parseSimpleHandler(code) : null;
            handlers.push({
                element: el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''),
                attr,
                code,
                category,
                fnPath: parsed ? parsed.fnPath : null,
                argsCount: parsed ? parsed.argsCount : null
            });
        });
    });

    const byCategory = handlers.reduce((acc, h) => {
        acc[h.category] = (acc[h.category] || 0) + 1;
        return acc;
    }, {});

    // Top des fonctions appelées (uniquement pour les 'simple')
    const fnCounts = {};
    handlers.forEach(h => {
        if (h.fnPath) fnCounts[h.fnPath] = (fnCounts[h.fnPath] || 0) + 1;
    });
    const topFns = Object.entries(fnCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

    // Top des éléments qui portent le plus de handlers
    const elCounts = {};
    handlers.forEach(h => { elCounts[h.element] = (elCounts[h.element] || 0) + 1; });

    // Rapport console
    console.log('%c=== AUDIT CSP — Handlers inline ===', 'color: #8b5cf6; font-weight: bold; font-size: 13px;');
    console.log(`Total : ${handlers.length} handler(s) inline détecté(s)`);
    console.table(byCategory);

    console.log('%cTop 10 des fonctions appelées :', 'color: #06b6d4; font-weight: bold;');
    try { console.table(topFns.map(([fn, count]) => ({ Fonction: fn, Occurrences: count }))); } catch (_) {}

    if (byCategory.complex > 0 || byCategory.other > 0) {
        console.log('%c⚠ Cas nécessitant un traitement manuel (complexes/autres) :',
            'color: #f59e0b; font-weight: bold;');
        const toFix = handlers.filter(h => h.category === 'complex' || h.category === 'other').slice(0, 20);
        try { console.table(toFix.map(h => ({
            Élément: h.element, Attribut: h.attr, Code: h.code.slice(0, 60)
        }))); } catch (_) {}
        if (handlers.filter(h => h.category === 'complex' || h.category === 'other').length > 20) {
            console.log(`… et ${handlers.length - 20} autres.`);
        }
    }

    // Toast récapitulatif
    if (typeof toastInfo === 'function') {
        const simple = byCategory.simple || 0;
        const multi = byCategory.multi || 0;
        const complex = byCategory.complex || 0;
        const other = byCategory.other || 0;
        toastInfo(
            `Audit CSP : ${handlers.length} handlers`,
            `Simple: ${simple} · Multi: ${multi} · Complexe: ${complex} · Autre: ${other}`,
            { duration: 7000 }
        );
    }

    return { total: handlers.length, byCategory, handlers };
}

// ---------------------------------------------------------------------
// DÉLÉGATEUR DE FALLBACK
// ---------------------------------------------------------------------
// Rejoue les handlers inline SANS eval / Function (interdits par CSP).
// Supporte :
//   • fn() et fn(arg1, arg2) — args littéraux (string, number, bool)
//   • this.value, this.checked, this.dataset.xxx
//   • event.stopPropagation(), event.preventDefault()
//   • Multi-instructions séparées par ;
//
// Cas NON supportés (log warning, no-op silencieux) :
//   • Ternaires, if/else, return
//   • Expressions composées (a + b, fn() || fallback)
//   • Arrow functions inline
//
// ⚠ Ce module ne fait rien tant que enableCspFallbackDelegator() n'est
//    PAS appelé. La CSP actuelle reste inchangée.

let _cspDelegatorActive = false;
const _cspDelegatorListeners = [];

// Parse la valeur d'un argument littéral (string, number, bool, this.xxx)
function _parseArgValue(raw, el, event) {
    const s = String(raw || '').trim();
    if (!s) return undefined;

    // Chaîne : 'text' ou "text"
    if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
        return s.slice(1, -1);
    }
    // Nombre
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    // Booléens
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s === 'null') return null;
    if (s === 'undefined') return undefined;
    // this.value, this.checked, etc.
    if (s === 'this.value')   return el.value;
    if (s === 'this.checked') return el.checked;
    if (s === 'this.id')      return el.id;
    if (s === 'this.dataset') return el.dataset;
    // this.dataset.xxx
    const datasetMatch = s.match(/^this\.dataset\.([a-zA-Z0-9_]+)$/);
    if (datasetMatch) return el.dataset[datasetMatch[1]];
    // event
    if (s === 'event') return event;

    // Non supporté → undefined (l'appelant loguera)
    return undefined;
}

// Exécute une instruction unique du handler
function _execCspStatement(stmt, el, event) {
    const s = String(stmt || '').trim().replace(/;\s*$/, '');
    if (!s) return true;

    // Cas spécial : event.stopPropagation()
    if (s === 'event.stopPropagation()') { event.stopPropagation(); return true; }
    if (s === 'event.preventDefault()')  { event.preventDefault(); return true; }

    // Cas fn(...)
    const m = s.match(/^([a-zA-Z_$][a-zA-Z0-9_$.]*)\s*\(([^()]*)\)$/);
    if (!m) {
        console.warn('[CSP Delegator] Instruction non supportée :', s.slice(0, 80));
        return false;
    }

    const fnPath = m[1];
    const argsRaw = m[2].trim();

    // Résout la fonction dans window (avec support de la notation pointée)
    const fn = fnPath.split('.').reduce((obj, key) => (obj ? obj[key] : undefined), window);
    if (typeof fn !== 'function') {
        console.warn('[CSP Delegator] Fonction introuvable :', fnPath);
        return false;
    }

    // Parse les arguments
    let args = [];
    if (argsRaw) {
        args = argsRaw.split(',').map(a => _parseArgValue(a, el, event));
    }

    try {
        fn.apply(el, args);
        return true;
    } catch (err) {
        console.error('[CSP Delegator] Erreur dans', fnPath, ':', err);
        return false;
    }
}

// Exécute le code complet d'un handler inline
function _execCspHandler(code, el, event) {
    // Découpe en instructions (séparateur ;)
    const statements = String(code || '').split(';').map(s => s.trim()).filter(Boolean);
    let allOk = true;
    for (const stmt of statements) {
        if (!_execCspStatement(stmt, el, event)) allOk = false;
    }
    return allOk;
}

// Mappe le type d'événement vers l'attribut HTML correspondant
const _CSP_EVENT_ATTR_MAP = {
    click:       'onclick',
    change:      'onchange',
    input:       'oninput',
    submit:      'onsubmit',
    keydown:     'onkeydown',
    keyup:       'onkeyup',
    focus:       'onfocus',
    blur:        'onblur',
    mouseover:   'onmouseover',
    mouseout:    'onmouseout',
    load:        'onload',
    error:       'onerror'
};

// Active le délégateur global
function enableCspFallbackDelegator() {
    if (_cspDelegatorActive) {
        console.info('[CSP Delegator] Déjà actif.');
        return;
    }

    Object.entries(_CSP_EVENT_ATTR_MAP).forEach(([eventType, attr]) => {
        const listener = (event) => {
            // Ignore les événements déjà traités par un autre mécanisme
            if (event._cspDelegated) return;

            // Remonte la chaîne DOM pour trouver un élément avec l'attribut
            const el = event.target.closest && event.target.closest(`[${attr}]`);
            if (!el) return;

            const code = el.getAttribute(attr);
            if (!code || !code.trim()) return;

            // Marque l'événement comme traité pour éviter les doublons
            event._cspDelegated = true;

            // Exécute
            _execCspHandler(code, el, event);
        };

        // Capture en phase 1 (avant les handlers natifs) pour prendre la main
        document.addEventListener(eventType, listener, true);
        _cspDelegatorListeners.push({ eventType, listener });
    });

    _cspDelegatorActive = true;
    console.info('%c[CSP Delegator] ACTIVÉ — les handlers inline sont maintenant rejoués par le délégateur. Vous pouvez retirer \'unsafe-inline\' de la CSP.',
        'color: #10b981; font-weight: bold;');

    if (typeof toastInfo === 'function') {
        toastInfo(
            'Délégateur CSP activé',
            'Testez l\'app pour vérifier que tous les handlers fonctionnent. Si OK, retirez \'unsafe-inline\' de la CSP.',
            { duration: 8000 }
        );
    }
}

// Désactive le délégateur
function disableCspFallbackDelegator() {
    if (!_cspDelegatorActive) return;
    _cspDelegatorListeners.forEach(({ eventType, listener }) => {
        document.removeEventListener(eventType, listener, true);
    });
    _cspDelegatorListeners.length = 0;
    _cspDelegatorActive = false;
    console.info('[CSP Delegator] Désactivé.');
}

// Renvoie l'état du délégateur
function isCspFallbackDelegatorActive() {
    return _cspDelegatorActive;
}

// ---------------------------------------------------------------------
// INITIALISATION
// ---------------------------------------------------------------------
function initCspAuditModule() {
    // Rien à faire au boot : le module est purement à la demande.
    // L'audit est disponible via Ctrl+K ou runCspAudit() dans la console.
    console.info('[CSP Audit] Module chargé — lancez runCspAudit() pour auditer les handlers inline.');
}

// Expose l'API globalement
window.runCspAudit = runCspAudit;
window.enableCspFallbackDelegator = enableCspFallbackDelegator;
window.disableCspFallbackDelegator = disableCspFallbackDelegator;
window.isCspFallbackDelegatorActive = isCspFallbackDelegatorActive;