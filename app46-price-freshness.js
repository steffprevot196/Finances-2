// =====================================================================
// app46-price-freshness.js — Fraîcheur des cours (badges « cours périmé »)
// =====================================================================
// PROBLÈME : quand un cours ne peut pas être récupéré (Yahoo/CoinGecko en
// échec, proxy bloqué…), l'actif GARDE silencieusement son ancienne valeur.
// Rien n'indique à l'utilisateur que le chiffre affiché date de plusieurs
// jours : le patrimoine total peut donc être faux sans que ça se voie.
//
// SOLUTION : chaque actif porte désormais
//     priceUpdatedAt : timestamp (ms) du dernier cours / dernière saisie
//     priceSource    : 'coingecko' | 'frankfurter' | 'yahoo' | 'fallback'
//                      | 'metals' | 'manual'
//     priceFailedAt  : timestamp de la dernière tentative ÉCHOUÉE
//                      (effacé dès qu'une actualisation réussit)
//     priceFailReason: motif court de l'échec
// (champs conservés tels quels par normalizeAsset, les sauvegardes et les
// exports : aucune migration nécessaire.)
//
// Statuts affichés :
//   failed      dernière actualisation en échec          → badge rouge
//   stale       cours trop ancien                        → badge rouge
//   aging       cours qui vieillit                       → badge ambre
//   unknown     actif coté mais date inconnue (anciennes données,
//               jusqu'à la prochaine actualisation)      → badge gris
//   manual-old  valeur saisie à la main depuis > 90 jours → badge gris
//   fresh       aucun badge (pas de bruit)
// =====================================================================

(function () {
    'use strict';

    const HOUR = 3600 * 1000;
    const DAY  = 24 * HOUR;

    // Seuils par type de valorisation. Les marchés actions/ETF/métaux sont
    // fermés le week-end : on tolère 3 jours avant « vieillit ».
    const RULES = {
        crypto: { aging: 12 * HOUR, stale: 2 * DAY },
        devise: { aging: 3 * DAY,   stale: 7 * DAY },
        stock:  { aging: 3 * DAY,   stale: 7 * DAY },
        metal:  { aging: 3 * DAY,   stale: 7 * DAY },
        manual: { aging: Infinity,  stale: 90 * DAY }
    };
    const CURRENCY_TICKERS = ['USD', 'JPY', 'CHF', 'GBP'];   // = fetchLivePrices (Frankfurter)

    const SOURCE_LABELS = {
        coingecko: 'CoinGecko', frankfurter: 'Frankfurter (BCE)', yahoo: 'Yahoo Finance',
        fallback: 'source de secours', metals: 'cours de l\u2019or/argent', manual: 'saisie manuelle'
    };

    function esc(s) {
        return (typeof escapeHTML === 'function')
            ? escapeHTML(String(s))
            : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    const tag = (a, t) => (typeof hasTag === 'function') ? hasTag(a, t) : (a.categories || []).includes(t);

    // ----------------------------------------------------------------
    // Marquage (appelé par app6-api.js / app4-forms.js)
    // ----------------------------------------------------------------
    function markPriceUpdated(asset, source, ts) {
        if (!asset) return;
        asset.priceUpdatedAt = Number.isFinite(ts) ? ts : Date.now();
        asset.priceSource = source || '';
        delete asset.priceFailedAt;
        delete asset.priceFailReason;
    }
    function markPriceFailed(asset, reason) {
        if (!asset) return;
        asset.priceFailedAt = Date.now();
        if (reason) asset.priceFailReason = String(reason).slice(0, 120);
    }

    // ----------------------------------------------------------------
    // Type de valorisation d'un actif
    // ----------------------------------------------------------------
    function priceKind(a) {
        if (!a || a.manualValueOverride || a.valuationMode === 'MANUAL') return 'manual';
        const ticker = String(a.ticker || '').toUpperCase();
        if (tag(a, 'Crypto')) {
            return (typeof CRYPTO_COINGECKO_IDS !== 'undefined' && CRYPTO_COINGECKO_IDS[ticker]) ? 'crypto' : 'manual';
        }
        if (tag(a, 'Devises/Liquidités')) return CURRENCY_TICKERS.includes(ticker) ? 'devise' : 'manual';
        if (tag(a, 'Or & Métaux')) return a.weightGrams ? 'metal' : 'manual';
        if ((tag(a, 'Action') || tag(a, 'ETF')) && (a.yahooTicker || a.ticker)) return 'stock';
        return 'manual';
    }

    // ----------------------------------------------------------------
    // Statut de fraîcheur
    // ----------------------------------------------------------------
    function getPriceFreshness(a, now) {
        now = Number.isFinite(now) ? now : Date.now();
        const kind = priceKind(a);
        const rule = RULES[kind];
        let ts = Number(a && a.priceUpdatedAt) || 0;
        // Métaux saisis à la main : la date choisie par l'utilisateur fait foi
        if (!ts && a && a.manualUpdateDate) {
            const d = new Date(a.manualUpdateDate).getTime();
            if (Number.isFinite(d)) ts = d;
        }
        const failedAt = Number(a && a.priceFailedAt) || 0;
        const base = { kind, ts, failedAt, source: (a && a.priceSource) || '', reason: (a && a.priceFailReason) || '' };

        if (kind === 'manual') {
            if (!ts) return Object.assign(base, { status: 'none', ageMs: 0 });
            const age = now - ts;
            return Object.assign(base, { status: age > rule.stale ? 'manual-old' : 'fresh', ageMs: age });
        }
        if (failedAt && failedAt > ts) return Object.assign(base, { status: 'failed', ageMs: ts ? now - ts : null });
        if (!ts) return Object.assign(base, { status: 'unknown', ageMs: null });
        const age = now - ts;
        const status = age > rule.stale ? 'stale' : (age > rule.aging ? 'aging' : 'fresh');
        return Object.assign(base, { status, ageMs: age });
    }

    function fmtAge(ms) {
        if (ms === null || ms === undefined) return '';
        const min = Math.round(ms / 60000);
        if (min < 60) return 'il y a ' + Math.max(1, min) + ' min';
        const h = Math.round(ms / HOUR);
        if (h < 48) return 'il y a ' + h + ' h';
        const d = Math.round(ms / DAY);
        if (d < 60) return 'il y a ' + d + ' j';
        return 'il y a ' + Math.round(d / 30) + ' mois';
    }
    function fmtDateTime(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        return d.toLocaleDateString('fr-FR') + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }

    function detailText(f) {
        const src = SOURCE_LABELS[f.source] ? ' (' + SOURCE_LABELS[f.source] + ')' : '';
        const last = f.ts ? 'Dernier cours reçu le ' + fmtDateTime(f.ts) + src + ' \u2014 ' + fmtAge(f.ageMs) + '.' : '';
        switch (f.status) {
            case 'failed':
                return 'La dernière actualisation a échoué' + (f.failedAt ? ' (le ' + fmtDateTime(f.failedAt) + ')' : '')
                    + (f.reason ? ' : ' + f.reason : '') + '. '
                    + (f.ts ? 'La valeur affichée date du ' + fmtDateTime(f.ts) + '.' : 'Aucun cours n\u2019a jamais été reçu pour cet actif.');
            case 'stale':   return last + ' Ce cours est périmé : la valeur affichée peut s\u2019écarter du marché.';
            case 'aging':   return last + ' Pensez à actualiser les cours.';
            case 'unknown': return 'Date du dernier cours inconnue (données antérieures à ce suivi). Elle sera renseignée à la prochaine actualisation.';
            case 'manual-old': return 'Valeur saisie manuellement le ' + fmtDateTime(f.ts) + ' \u2014 ' + fmtAge(f.ageMs) + '. Pensez à la revoir.';
            default: return last;
        }
    }

    const STYLES = {
        failed:       'bg-rose-500/15 text-rose-300 border-rose-500/40',
        stale:        'bg-rose-500/15 text-rose-300 border-rose-500/40',
        aging:        'bg-amber-500/15 text-amber-300 border-amber-500/40',
        unknown:      'bg-gray-500/15 text-gray-400 border-gray-500/30',
        'manual-old': 'bg-gray-500/15 text-gray-400 border-gray-500/30'
    };

    function badgeLabel(f) {
        switch (f.status) {
            case 'failed':     return 'Échec actualisation';
            case 'stale':      return 'Cours périmé \u00b7 ' + fmtAge(f.ageMs).replace('il y a ', '');
            case 'aging':      return 'Cours ' + fmtAge(f.ageMs);
            case 'unknown':    return 'Cours ?';
            case 'manual-old': return 'Saisi ' + fmtAge(f.ageMs);
            default:           return '';
        }
    }

    // Badge à insérer dans la cellule « nom » (même style que paperBadgeHTML…).
    // Retourne '' si le cours est à jour : on n'ajoute du bruit que s'il y a un souci.
    function priceFreshnessBadgeHTML(asset) {
        let f;
        try { f = getPriceFreshness(asset); } catch (e) { return ''; }
        const style = STYLES[f.status];
        if (!style) return '';
        const icon = (f.status === 'failed' || f.status === 'stale')
            ? '<i class="fa-solid fa-triangle-exclamation text-[8px]" aria-hidden="true"></i>'
            : '<i class="fa-regular fa-clock text-[8px]" aria-hidden="true"></i>';
        return ' <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-bold whitespace-nowrap align-middle '
            + style + '" data-price-status="' + f.status + '" title="' + esc(detailText(f)) + '">'
            + icon + ' ' + esc(badgeLabel(f)) + '</span>';
    }

    // ----------------------------------------------------------------
    // Résumé sur l'accueil (remplace l'ancien « Mis à jour en temps réel »,
    // affiché quoi qu'il arrive, même quand les cours étaient périmés)
    // ----------------------------------------------------------------
    function renderPriceFreshnessSummary() {
        const el = document.getElementById('stat-price-freshness');
        if (!el) return;
        const list = (typeof assets !== 'undefined' && Array.isArray(assets)) ? assets : [];
        const rows = list.map(a => ({ a, f: getPriceFreshness(a) })).filter(x => x.f.kind !== 'manual');
        const bad     = rows.filter(x => x.f.status === 'failed' || x.f.status === 'stale');
        const aging   = rows.filter(x => x.f.status === 'aging');
        const unknown = rows.filter(x => x.f.status === 'unknown');
        const latest  = rows.reduce((m, x) => Math.max(m, x.f.ts || 0), 0);

        let color, icon, text, names = [];
        if (!rows.length) {
            color = 'text-gray-400'; icon = 'fa-pen'; text = 'Valorisation manuelle';
        } else if (bad.length) {
            color = 'text-rose-400'; icon = 'fa-triangle-exclamation';
            text = bad.length + ' cours périmé' + (bad.length > 1 ? 's' : '') + ' ou en échec';
            names = bad.map(x => x.a.name);
        } else if (aging.length) {
            color = 'text-amber-400'; icon = 'fa-clock';
            text = aging.length + ' cours à actualiser';
            names = aging.map(x => x.a.name);
        } else if (unknown.length === rows.length) {
            color = 'text-gray-400'; icon = 'fa-circle-question'; text = 'Date des cours inconnue';
            names = unknown.map(x => x.a.name);
        } else {
            color = 'text-emerald-400'; icon = 'fa-circle-check';
            text = 'Cours à jour' + (latest ? ' \u00b7 ' + fmtAge(Date.now() - latest) : '');
            if (unknown.length) names = unknown.map(x => x.a.name);
        }

        el.className = 'text-xs mt-1 flex items-center gap-1 flex-wrap ' + color;
        el.textContent = '';
        const i = document.createElement('i');
        i.className = 'fa-solid ' + icon + ' text-[10px]';
        i.setAttribute('aria-hidden', 'true');
        const span = document.createElement('span');
        span.textContent = text;
        el.append(i, span);
        if (names.length) {
            const shown = names.slice(0, 6).join(', ') + (names.length > 6 ? ' \u2026 (+' + (names.length - 6) + ')' : '');
            el.title = shown;
            span.title = shown;
        } else {
            el.removeAttribute('title');
        }
        if (rows.length && (bad.length || aging.length || unknown.length)) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'underline decoration-dotted hover:text-white ml-1';
            btn.textContent = 'Actualiser';
            btn.addEventListener('click', () => { if (typeof fetchLivePrices === 'function') fetchLivePrices(); });
            el.appendChild(btn);
        }
    }

    // ----------------------------------------------------------------
    // Ligne « Cours du … » dans la fiche détail d'un actif
    // ----------------------------------------------------------------
    function updateDetailFreshness() {
        const line = document.getElementById('modal-asset-freshness');
        if (!line) return;
        const id = (typeof currentAssetDetailId !== 'undefined' && currentAssetDetailId !== null && currentAssetDetailId !== '')
            ? currentAssetDetailId
            : (typeof _lastAssetDetailOpenedId !== 'undefined' ? _lastAssetDetailOpenedId : null);
        const list = (typeof assets !== 'undefined' && Array.isArray(assets)) ? assets : [];
        const asset = list.find(a => String(a.id) === String(id));
        line.textContent = '';
        if (!asset) { line.classList.add('hidden'); return; }
        const f = getPriceFreshness(asset);
        if (f.status === 'none' || (f.status === 'fresh' && f.kind === 'manual' && !f.ts)) { line.classList.add('hidden'); return; }
        const style = { failed: 'text-rose-300', stale: 'text-rose-300', aging: 'text-amber-300' }[f.status] || 'text-gray-400';
        line.className = 'text-[11px] mt-1 ' + style;
        const src = SOURCE_LABELS[f.source] ? ' \u00b7 ' + SOURCE_LABELS[f.source] : '';
        if (f.status === 'failed') {
            line.textContent = 'Échec de la dernière actualisation' + (f.ts ? ' \u2014 valeur du ' + fmtDateTime(f.ts) : '') + (f.reason ? ' (' + f.reason + ')' : '');
        } else if (f.status === 'unknown') {
            line.textContent = 'Date du cours inconnue \u2014 actualisez les cours';
        } else {
            line.textContent = (f.kind === 'manual' ? 'Valeur saisie le ' : 'Cours du ') + fmtDateTime(f.ts) + src
                + ' \u00b7 ' + fmtAge(f.ageMs).replace('il y a', 'il y a');
        }
        line.title = detailText(f);
    }

    // ----------------------------------------------------------------
    // Exports + branchement
    // ----------------------------------------------------------------
    window.markPriceUpdated = markPriceUpdated;
    window.markPriceFailed = markPriceFailed;
    window.getPriceFreshness = getPriceFreshness;
    window.priceFreshnessBadgeHTML = priceFreshnessBadgeHTML;
    window.renderPriceFreshnessSummary = renderPriceFreshnessSummary;

    function init() {
        const sub = document.getElementById('modal-asset-subtitle');
        if (sub) {
            // app3-charts.js réécrit le sous-titre à chaque ouverture de la fiche
            new MutationObserver(updateDetailFreshness).observe(sub, { childList: true, characterData: true, subtree: true });
        }
        renderPriceFreshnessSummary();
        // Le temps passe même sans nouveau rendu : on réévalue le résumé toutes les 10 min
        setInterval(renderPriceFreshnessSummary, 10 * 60 * 1000);
        console.info('[PriceFreshness] Module chargé \u2014 suivi de la fraîcheur des cours actif.');
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
