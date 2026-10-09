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

// Catégorise un handler inline.
//
// Retourne :
//   'simple'   → un seul appel de fonction fn() / fn(args)
//   'assign'   → une assignation simple this.xxx = value
//   'multi'    → plusieurs instructions ;-séparées, toutes simples/assign
//   'complex'  → ternaire, if, &&, ||, return → nécessite conversion manuelle
//   'other'    → non reconnu
function _classifyInlineHandler(code) {
    const c = String(code || '').trim();
    const withoutTrailing = c.replace(/;\s*$/, '');

    // ── Cas complexes : à convertir manuellement en addEventListener ──
    //  - ternaires (cond ? a : b)
    //  - opérateurs logiques (a && b, a || b)
    //  - if/return explicites
    //  - arrow functions inline `x => ...`
    //  ⚠ On teste ces marqueurs UNIQUEMENT hors chaînes littérales pour
    //    éviter les faux positifs sur `title="Cliquez ?"` par exemple.
    const strippedStrings = withoutTrailing
        .replace(/'[^']*'/g, "''")
        .replace(/"[^"]*"/g, '""');
    if (/\bif\s*\(/.test(strippedStrings) ||
        /\breturn\b/.test(strippedStrings) ||
        /&&|\|\|/.test(strippedStrings) ||
        /\?[^.]/.test(strippedStrings) ||
        /=>/.test(strippedStrings)) {
        return 'complex';
    }

    // ── Multi-instructions ──
    if (withoutTrailing.includes(';')) {
        // Vérifie que CHAQUE instruction est simple ou assign
        const parts = withoutTrailing.split(';').map(s => s.trim()).filter(Boolean);
        const allSimple = parts.every(p =>
            /^[a-zA-Z_$][a-zA-Z0-9_$.]*(?:\?\.)?\s*\([^()]*\)$/.test(p) ||
            /^this(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*\s*=\s*.+$/.test(p) ||
            /^event\.(stopPropagation|preventDefault)\(\)$/.test(p)
        );
        return allSimple ? 'multi' : 'other';
    }

    // ── Appel de fonction simple ──
    if (/^[a-zA-Z_$][a-zA-Z0-9_$.]*(?:\?\.)?\s*\([^()]*\)$/.test(withoutTrailing)) {
        return 'simple';
    }

    // ── Assignation this.xxx = value ──
    if (/^this(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*\s*=\s*.+$/.test(withoutTrailing)) {
        return 'assign';
    }

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

// Parse la valeur d'un argument littéral : string, number, bool, null,
// undefined, this.xxx, event, tableau [a, b] ou objet {a: 1}.
// Ne fait AUCUN appel à eval/Function (interdits CSP).
function _parseArgValue(raw, el, event) {
    const s = String(raw || '').trim();
    if (!s) return undefined;

    // ── Chaîne littérale 'text' ou "text" ──
    if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
        // Déséchappe les séquences courantes
        const inner = s.slice(1, -1);
        return inner.replace(/\\(['"\\nrt])/g, (_, c) => ({
            "'": "'", '"': '"', '\\': '\\',
            'n': '\n', 'r': '\r', 't': '\t'
        }[c] || c));
    }

    // ── Nombre (avec signe, décimales, notation exponentielle) ──
    if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(s)) return Number(s);

    // ── Littéraux spéciaux ──
    if (s === 'true')      return true;
    if (s === 'false')     return false;
    if (s === 'null')      return null;
    if (s === 'undefined') return undefined;
    if (s === 'NaN')       return NaN;
    if (s === 'Infinity')  return Infinity;

    // ── this.xxx ──
    if (s === 'this.value')   return el.value;
    if (s === 'this.checked') return el.checked;
    if (s === 'this.id')      return el.id;
    if (s === 'this.tagName') return el.tagName;
    if (s === 'this.dataset') return el.dataset;

    // this.dataset.xxx
    const dsMatch = s.match(/^this\.dataset\.([a-zA-Z_$][a-zA-Z0-9_$]*)$/);
    if (dsMatch) return el.dataset[dsMatch[1]];

    // this.xxx (propriété DOM générique lisible)
    const thisPropMatch = s.match(/^this\.([a-zA-Z_$][a-zA-Z0-9_$]*)$/);
    if (thisPropMatch) return el[thisPropMatch[1]];

    // ── event ──
    if (s === 'event') return event;

    // ── Tableau littéral [a, b, c] ──
    if (s.startsWith('[') && s.endsWith(']')) {
        const inner = s.slice(1, -1).trim();
        if (!inner) return [];
        return inner.split(',').map(part => _parseArgValue(part, el, event));
    }

    // ── Objet littéral simple {k: v, k2: v2} (une seule profondeur) ──
    if (s.startsWith('{') && s.endsWith('}')) {
        const inner = s.slice(1, -1).trim();
        if (!inner) return {};
        const obj = {};
        // Découpe naïve sur les virgules (ne gère pas les objets imbriqués)
        inner.split(',').forEach(pair => {
            const [k, v] = pair.split(':').map(x => x.trim());
            if (!k) return;
            const cleanKey = k.replace(/^['"]|['"]$/g, '');
            obj[cleanKey] = _parseArgValue(v, el, event);
        });
        return obj;
    }

    // ── Non supporté ──
    return undefined;
}

// Découpe une liste d'arguments en respectant les profondeurs de
// parenthèses/crochets/accolades ET les chaînes littérales.
// Nécessaire pour parser correctement `fn(['a', 'b'], {x: 1})`.
function _splitArgsTopLevel(argsRaw) {
    const parts = [];
    let depth = 0;
    let inString = null;   // ' ou "
    let current = '';

    for (let i = 0; i < argsRaw.length; i++) {
        const ch = argsRaw[i];
        const prev = i > 0 ? argsRaw[i - 1] : '';

        // Gestion des chaînes
        if (inString) {
            current += ch;
            if (ch === inString && prev !== '\\') inString = null;
            continue;
        }
        if (ch === "'" || ch === '"') {
            inString = ch;
            current += ch;
            continue;
        }

        // Gestion des profondeurs
        if (ch === '(' || ch === '[' || ch === '{') { depth++; current += ch; continue; }
        if (ch === ')' || ch === ']' || ch === '}') { depth--; current += ch; continue; }

        // Virgule de séparation au niveau 0
        if (ch === ',' && depth === 0) {
            parts.push(current.trim());
            current = '';
            continue;
        }
        current += ch;
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
}

// Exécute une instruction unique du handler (sans eval/Function).
// Supporte :
//   • fn() / fn(args) où args peut contenir strings, numbers, bool,
//     this.xxx, event, tableaux [a, b], objets {a: 1}
//   • this.xxx = value             (assignation propriété DOM)
//   • this.style.prop = value      (assignation style inline)
//   • this.dataset.xxx = value     (assignation dataset)
//   • event.stopPropagation() / event.preventDefault()
function _execCspStatement(stmt, el, event) {
    const s = String(stmt || '').trim().replace(/;\s*$/, '');
    if (!s) return true;

    // ── Événement : stopPropagation / preventDefault ──
    if (s === 'event.stopPropagation()') { event.stopPropagation(); return true; }
    if (s === 'event.preventDefault()')  { event.preventDefault();  return true; }

    // ── Appel de fonction fn(args) ──
    const callMatch = s.match(/^([a-zA-Z_$][a-zA-Z0-9_$.]*(?:\?\.)?)\s*\(([\s\S]*)\)$/);
    if (callMatch) {
        const fnPath = callMatch[1].replace(/\?\./g, '.');   // ?. → .
        const argsRaw = callMatch[2].trim();

        const fn = fnPath.split('.').reduce((obj, key) => (obj ? obj[key] : undefined), window);
        if (typeof fn !== 'function') {
            console.warn('[CSP Delegator] Fonction introuvable :', fnPath);
            return false;
        }

        let args = [];
        if (argsRaw) {
            args = _splitArgsTopLevel(argsRaw).map(a => _parseArgValue(a, el, event));
        }

        try {
            fn.apply(el, args);
            return true;
        } catch (err) {
            console.error('[CSP Delegator] Erreur dans', fnPath, ':', err);
            return false;
        }
    }

    // ── Assignation this.xxx = value ──
    // Découpe sur le PREMIER = (pour éviter de matcher == ou ===)
    const assignMatch = s.match(/^(this(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)+)\s*=\s*([\s\S]+)$/);
    if (assignMatch && !s.includes('==')) {
        const path = assignMatch[1];                  // this.style.filter
        const valRaw = assignMatch[2].trim();
        const value = _parseArgValue(valRaw, el, event);

        // Découpe la cible en segments : ['this', 'style', 'filter']
        const segments = path.split('.').slice(1);    // retire 'this'
        if (!segments.length) return false;

        // Navigue jusqu'au parent de la propriété
        let target = el;
        for (let i = 0; i < segments.length - 1; i++) {
            target = target[segments[i]];
            if (target === undefined || target === null) {
                console.warn('[CSP Delegator] Chemin introuvable :', path);
                return false;
            }
        }
        const lastKey = segments[segments.length - 1];

        try {
            target[lastKey] = value;
            return true;
        } catch (err) {
            // Certaines propriétés DOM sont en lecture seule (el.offsetWidth…)
            console.warn('[CSP Delegator] Assignation refusée :', path, '=', value, '—', err.message);
            return false;
        }
    }

    // ── Non supporté : log explicite pour faciliter la conversion manuelle ──
    console.warn('[CSP Delegator] Instruction non supportée :', s.slice(0, 120));
    return false;
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
// RAPPORT DE PRÉPARATION AU RETRAIT DE 'unsafe-inline'
// ---------------------------------------------------------------------
// Analyse chaque handler inline du DOM et indique lesquels sont couverts
// par le délégateur, lesquels nécessitent une conversion manuelle.
// Retourne { total, delegated, manual, unknown, manualSamples }.
//
// Usage : taper `reportCspReadiness()` en console avant de basculer la CSP.
function reportCspReadiness() {
    const audit = runCspAudit();
    const delegated = { simple: 0, assign: 0, multi: 0 };
    const manual = [];
    const unknown = [];

    audit.handlers.forEach(h => {
        if (h.category === 'simple' || h.category === 'assign' || h.category === 'multi') {
            delegated[h.category]++;
        } else if (h.category === 'complex') {
            manual.push(h);
        } else {
            unknown.push(h);
        }
    });

    const totalDelegated = delegated.simple + delegated.assign + delegated.multi;
    const ready = (manual.length === 0 && unknown.length === 0);

    console.log('%c=== PRÉPARATION RETRAIT unsafe-inline ===',
        'color:#8b5cf6; font-weight:bold; font-size:13px;');
    console.log(`Total handlers inline    : ${audit.total}`);
    console.log(`✅ Couverts par le délégateur : ${totalDelegated}  (simple: ${delegated.simple}, assign: ${delegated.assign}, multi: ${delegated.multi})`);
    console.log(`⚠️ À convertir manuellement   : ${manual.length}`);
    console.log(`❓ Non reconnus               : ${unknown.length}`);
    console.log('');

    if (ready) {
        console.log('%c✅ PRÊT : aucun handler non couvert. Vous pouvez retirer \'unsafe-inline\' de la CSP après avoir activé le délégateur.',
            'color:#10b981; font-weight:bold;');
    } else {
        console.log('%c⏳ NON PRÊT : certains handlers ne sont pas couverts par le délégateur.',
            'color:#f59e0b; font-weight:bold;');
        if (manual.length) {
            console.log(`Handlers complexes (${manual.length}) — 20 premiers :`);
            console.table(manual.slice(0, 20).map(h => ({
                Élément: h.element,
                Attribut: h.attr,
                Code: h.code.slice(0, 80)
            })));
        }
        if (unknown.length) {
            console.log(`Handlers non reconnus (${unknown.length}) — 20 premiers :`);
            console.table(unknown.slice(0, 20).map(h => ({
                Élément: h.element,
                Attribut: h.attr,
                Code: h.code.slice(0, 80)
            })));
        }
    }

    return {
        total: audit.total,
        delegated: totalDelegated,
        manual: manual.length,
        unknown: unknown.length,
        ready,
        manualSamples: manual.slice(0, 20),
        unknownSamples: unknown.slice(0, 20)
    };
}

// ---------------------------------------------------------------------
// INITIALISATION
// ---------------------------------------------------------------------
function initCspAuditModule() {
    // Rien à faire au boot : le module est purement à la demande.
    // Commandes disponibles (console ou palette Ctrl+K) :
    //   • runCspAudit()              → audit brut des handlers inline
    //   • reportCspReadiness()       → rapport de couverture délégateur
    //   • enableCspFallbackDelegator()  → active le délégateur (à tester)
    //   • disableCspFallbackDelegator() → désactive le délégateur
    console.info('[CSP Audit] Module chargé — taper reportCspReadiness() pour connaître la couverture du délégateur.');
}

// Expose l'API globalement
window.runCspAudit = runCspAudit;
window.reportCspReadiness = reportCspReadiness;
window.enableCspFallbackDelegator = enableCspFallbackDelegator;
window.disableCspFallbackDelegator = disableCspFallbackDelegator;
window.isCspFallbackDelegatorActive = isCspFallbackDelegatorActive;