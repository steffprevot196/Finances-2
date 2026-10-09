// =====================================================================
// app16-watchlist.js — WATCHLIST / ACTIFS SURVEILLÉS (Chantier 1.4)
// Dépend de : app1-core.js (formatEUR, escapeHTML, debounce)
//             app6-api.js (fetchYahooQuote, fetchCoinGecko...)
// Charge après app15-notifications.js, avant app7-init.js
// =====================================================================

// ---------------------------------------------------------------------
// STOCKAGE
// ---------------------------------------------------------------------
// La watchlist est GLOBALE (partagée entre tous les portefeuilles), car
// elle représente une liste d'idées d'investissement indépendante du
// portefeuille courant. Elle est persistée dans localStorage sous une
// clé unique (pas de namespace par portefeuille).
const WATCHLIST_STORAGE_KEY = 'patriMonial_watchlist';

// Cache mémoire pour éviter de relire localStorage à chaque rendu
let watchlist = [];

function loadWatchlistFromStorage() {
    try {
        const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
        if (raw) {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) return list;
        }
    } catch (_) {}
    return [];
}

function saveWatchlistToStorage() {
    try { localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist)); } catch (_) {}
}

// ---------------------------------------------------------------------
// NORMALISATION D'UNE ENTRÉE
// ---------------------------------------------------------------------
// Champ optionnels :
//   • yahooTicker  : ticker Yahoo (CW8.PA, NVDA…) pour fetch de cours
//   • coingeckoId  : id CoinGecko (bitcoin, ethereum…) pour les cryptos
//   • currency     : devise de cotation (EUR par défaut)
//   • targetPrice  : prix d'entrée cible (0 = pas de cible)
//   • targetKind   : 'ABOVE' (acheter si le cours monte au-dessus) ou
//                    'BELOW' (acheter si le cours descend en-dessous)
//                    Par défaut BELOW (le cas le plus fréquent).
//   • tags         : tags ASSET_TAGS pour pré-remplir le modal d'ajout
//   • cadran       : cadran Gave pour pré-remplir
//   • lastPrice    : dernier cours connu (cache)
//   • lastPriceAt  : timestamp du dernier fetch
function normalizeWatchlistEntry(w) {
    if (!w || typeof w !== 'object') return null;
    const name = String(w.name || '').trim();
    const ticker = String(w.ticker || '').trim().toUpperCase();
    if (!name || !ticker) return null;

    return {
        id:           w.id || (Date.now() + Math.floor(Math.random() * 100000)),
        name,
        ticker,
        yahooTicker:  String(w.yahooTicker || '').trim(),
        coingeckoId:  String(w.coingeckoId || '').trim(),
        currency:     String(w.currency || 'EUR').toUpperCase(),
        targetPrice:  Number.isFinite(Number(w.targetPrice)) ? Number(w.targetPrice) : 0,
        targetKind:   w.targetKind === 'ABOVE' ? 'ABOVE' : 'BELOW',
        tags:         Array.isArray(w.tags) ? w.tags.filter(t => ASSET_TAGS.includes(t)) : [],
        cadran:       GAVE_CODES.concat(['CRYPTO', 'HORS_GAVE']).includes(w.cadran) ? w.cadran : 'HORS_GAVE',
        notes:        String(w.notes || '').trim(),
        addedAt:      w.addedAt || Date.now(),
        lastPrice:    Number.isFinite(Number(w.lastPrice)) ? Number(w.lastPrice) : null,
        lastPriceAt:  Number.isFinite(Number(w.lastPriceAt)) ? Number(w.lastPriceAt) : null,
        lastFetchErr: w.lastFetchErr || ''
    };
}

function initWatchlistFromStorage() {
    const raw = loadWatchlistFromStorage();
    watchlist = raw.map(normalizeWatchlistEntry).filter(Boolean);
}

// ---------------------------------------------------------------------
// HELPERS DE CALCUL
// ---------------------------------------------------------------------

// Distance au prix cible en % :
//   • négatif = encore loin (le cours n'a pas atteint la cible)
//   • positif = cible atteinte (ou dépassée)
// Retourne null si pas de cible ou pas de cours.
function watchlistTargetDistance(w) {
    if (!w || !w.targetPrice || w.targetPrice <= 0) return null;
    if (!Number.isFinite(w.lastPrice) || w.lastPrice <= 0) return null;
    const diff = w.lastPrice - w.targetPrice;
    // BELOW : on attend que le cours descende à la cible.
    //         Atteint si lastPrice <= targetPrice → distance négative convertie en positive
    // ABOVE : on attend que le cours monte à la cible.
    //         Atteint si lastPrice >= targetPrice → distance positive
    if (w.targetKind === 'BELOW') {
        // Distance restante = (lastPrice - targetPrice) / targetPrice
        //   >0 → encore au-dessus de la cible (pas atteint)
        //   ≤0 → cible atteinte ou dépassée
        return ((w.lastPrice - w.targetPrice) / w.targetPrice) * 100;
    } else {
        // ABOVE : distance restante = (targetPrice - lastPrice) / targetPrice
        return ((w.targetPrice - w.lastPrice) / w.targetPrice) * 100;
    }
}

// L'entrée a-t-elle atteint sa cible ?
function watchlistIsTargetReached(w) {
    const d = watchlistTargetDistance(w);
    return d !== null && d <= 0;
}

// Compte les entrées dont la cible est atteinte.
function watchlistTriggeredCount() {
    return watchlist.filter(watchlistIsTargetReached).length;
}

// ---------------------------------------------------------------------
// FETCH DE COURS (asynchrone, silencieux en cas d'erreur)
// ---------------------------------------------------------------------
// Priorité :
//   1. Crypto  → CoinGecko (via l'id)
//   2. Action/ETF → Twelve Data ou Yahoo (via yahooTicker)
//   3. Sinon → échec silencieux, on garde le dernier cours connu.
async function fetchWatchlistPrice(w) {
    if (!w) return null;

    // --- 1. Crypto via CoinGecko ---
    if (w.coingeckoId) {
        try {
            const res = await fetch(
                `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(w.coingeckoId)}&vs_currencies=${(w.currency || 'EUR').toLowerCase()}`
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const p = data[w.coingeckoId]?.[(w.currency || 'EUR').toLowerCase()];
            if (Number.isFinite(p) && p > 0) return p;
        } catch (err) {
            // Silencieux : on tente la suite
        }
    }

    // --- 2. Action/ETF via Yahoo (source la plus universelle) ---
    const symbol = w.yahooTicker || w.ticker;
    if (symbol && typeof fetchYahooQuote === 'function') {
        try {
            const p = await fetchYahooQuote(symbol);
            if (Number.isFinite(p) && p > 0) return p;
        } catch (err) {
            // Silencieux
        }
    }

    return null;
}

// Rafraîchit les cours de toutes les entrées de la watchlist.
// Renvoie { updated, failed } — pas de throw global.
async function refreshWatchlistPrices(silent = false) {
    if (!watchlist.length) return { updated: 0, failed: 0 };

    let updated = 0, failed = 0;
    for (const w of watchlist) {
        try {
            const p = await fetchWatchlistPrice(w);
            if (p !== null) {
                w.lastPrice = p;
                w.lastPriceAt = Date.now();
                w.lastFetchErr = '';
                updated++;
            } else {
                w.lastFetchErr = 'Cours indisponible';
                failed++;
            }
        } catch (err) {
            w.lastFetchErr = err.message || 'Erreur';
            failed++;
        }
        // Pause courte pour ne pas spammer les APIs
        await new Promise(r => setTimeout(r, 250));
    }
    saveWatchlistToStorage();

    if (!silent) {
        if (updated > 0 || failed > 0) {
            console.info(`[Watchlist] ${updated} cours mis à jour, ${failed} échec(s).`);
        }
    }
    return { updated, failed };
}

// =====================================================================
// ÉTAT UI
// =====================================================================
let watchlistFilter = 'ALL';
let watchlistLastRefreshAt = null;

// =====================================================================
// RENDU DES CARTES
// =====================================================================

// Icône/couleur selon le type d'actif (crypto vs action/ETF).
function _watchlistTypeBadge(w) {
    if (w.coingeckoId || /^(BTC|ETH|SOL|ADA|XRP|DOGE|BNB|LTC|DOT|AVAX|MATIC|LINK)$/.test(w.ticker)) {
        return '<span class="px-1.5 py-0.5 rounded border text-[9px] font-bold bg-purple-950 text-purple-300 border-purple-800/50"><i class="fa-brands fa-bitcoin text-[8px] mr-0.5"></i>Crypto</span>';
    }
    return '<span class="px-1.5 py-0.5 rounded border text-[9px] font-bold bg-indigo-950 text-indigo-300 border-indigo-800/50"><i class="fa-solid fa-chart-line text-[8px] mr-0.5"></i>Titre</span>';
}

// Construit le HTML d'une carte d'entrée watchlist.
function _watchlistCardHTML(w) {
    // ── SECURITY ── Coercition stricte de l'ID en contexte inline JS.
    const safeId = Number(w.id);
    if (!Number.isFinite(safeId) || safeId <= 0) return '';
    const hasTarget = w.targetPrice > 0;
    const distance = watchlistTargetDistance(w);
    const reached  = watchlistIsTargetReached(w);
    const hasPrice = Number.isFinite(w.lastPrice) && w.lastPrice > 0;

    // Couleur & libellé de la distance
    let distanceTxt = '—';
    let distanceCls = 'text-gray-500';
    let distanceHint = 'Prix cible non atteint';
    if (hasTarget && distance !== null) {
        if (reached) {
            distanceTxt = '✓ Atteinte';
            distanceCls = 'text-emerald-400';
            distanceHint = w.targetKind === 'BELOW'
                ? 'Cours ≤ cible — vous pouvez envisager l\'achat'
                : 'Cours ≥ cible — vous pouvez envisager l\'achat';
        } else {
            distanceTxt = distance.toFixed(2) + ' %';
            distanceCls = 'text-amber-400';
            distanceHint = w.targetKind === 'BELOW'
                ? 'Baisse restante jusqu\'à la cible'
                : 'Hausse restante jusqu\'à la cible';
        }
    }

    // Prix formaté
    const priceTxt = hasPrice
        ? formatNative(w.lastPrice, w.currency)
        : '<span class="text-gray-500 italic">cours non chargé</span>';

    // Badge fraîcheur du cours
    let freshness = '';
    if (w.lastPriceAt) {
        const ageMin = (Date.now() - w.lastPriceAt) / 60000;
        const ageTxt = ageMin < 1 ? 'à l\'instant'
                     : ageMin < 60 ? `${Math.floor(ageMin)} min`
                     : ageMin < 1440 ? `${Math.floor(ageMin / 60)} h`
                     : `${Math.floor(ageMin / 1440)} j`;
        freshness = `<span class="text-[9px] text-gray-600">MAJ ${ageTxt}</span>`;
    }
    if (w.lastFetchErr) {
        freshness += ` <span class="text-[9px] text-rose-400" title="${escapeHTML(w.lastFetchErr)}"><i class="fa-solid fa-triangle-exclamation"></i></span>`;
    }

    // Barre de progression vers la cible (visuelle)
    let progressHTML = '';
    if (hasTarget && hasPrice) {
        const pct = reached ? 100 : Math.max(0, Math.min(100, 100 - Math.min(100, Math.abs(distance))));
        const barCls = reached ? 'bg-emerald-500' : 'bg-amber-500';
        progressHTML = `
            <div class="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden mt-1">
                <div class="${barCls} h-full transition-all duration-500" style="width:${pct}%"></div>
            </div>`;
    }

    // Carte cible (bloc dédié si définie)
    const targetHTML = hasTarget ? `
        <div class="bg-gray-950 border border-gray-800 rounded-lg p-2.5 space-y-1">
            <div class="flex justify-between items-center text-[10px]">
                <span class="text-gray-500 uppercase tracking-wider">Cible d'achat</span>
                <span class="${distanceCls} font-mono font-bold">${distanceTxt}</span>
            </div>
            <div class="flex justify-between items-center">
                <span class="text-[11px] text-gray-400">${w.targetKind === 'BELOW' ? '≤' : '≥'} ${escapeHTML(formatNative(w.targetPrice, w.currency))}</span>
                <span class="text-[9px] text-gray-500" title="${escapeHTML(distanceHint)}">${escapeHTML(distanceHint.substring(0, 30))}…</span>
            </div>
            ${progressHTML}
        </div>` : `
        <div class="bg-gray-950/50 border border-dashed border-gray-800 rounded-lg p-2.5 text-center text-[10px] text-gray-500 italic">
            Aucune cible d'achat définie
        </div>`;

    // Notes (tronquées)
    const notesHTML = w.notes
        ? `<div class="text-[10px] text-gray-400 italic truncate" title="${escapeHTML(w.notes)}">
              <i class="fa-solid fa-note-sticky text-[9px] mr-1"></i>${escapeHTML(w.notes)}
           </div>`
        : '';

    // Tags
    const tagsHTML = (w.tags || []).map(t => 
        `<span class="px-1.5 py-0.5 rounded border text-[9px] bg-gray-800 text-gray-400 border-gray-700">${escapeHTML(t)}</span>`
    ).join(' ');

    return `
        <div class="bg-gray-900/60 border ${reached ? 'border-emerald-700/60 shadow-lg shadow-emerald-900/20' : 'border-gray-800'} rounded-xl p-4 flex flex-col gap-3">
            <!-- En-tête -->
            <div class="flex justify-between items-start gap-2">
                <div class="min-w-0 flex-1">
                    <div class="font-bold text-white text-sm truncate" title="${escapeHTML(w.name)}">${escapeHTML(w.name)}</div>
                    <div class="text-[10px] text-gray-500 font-mono flex items-center gap-1.5 mt-0.5">
                        ${escapeHTML(w.ticker)} · ${escapeHTML(w.currency)} ${_watchlistTypeBadge(w)}
                    </div>
                </div>
                <div class="text-right flex-shrink-0">
                    <div class="font-mono font-bold text-white text-sm">${priceTxt}</div>
                    <div class="mt-0.5">${freshness}</div>
                </div>
            </div>

            ${targetHTML}
            ${notesHTML}
            ${tagsHTML ? `<div class="flex flex-wrap gap-1">${tagsHTML}</div>` : ''}

            <!-- Actions -->
            <div class="flex justify-end gap-1 pt-2 border-t border-gray-800 flex-wrap">
                <button onclick="promoteWatchlistToAsset('${safeId}')" class="px-2 py-1 rounded bg-gray-800 hover:bg-emerald-900/60 text-gray-300 hover:text-emerald-300 text-[10px] transition flex items-center gap-1" title="Créer un actif réel pré-rempli depuis cette idée">
                    <i class="fa-solid fa-arrow-up-right-dots text-[9px]"></i> Promouvoir
                </button>
                <button onclick="editWatchlistEntry('${safeId}')" class="px-2 py-1 rounded bg-gray-800 hover:bg-indigo-900/60 text-gray-300 hover:text-indigo-300 text-[10px] transition" title="Modifier">
                    <i class="fa-solid fa-pen text-[9px]"></i>
                </button>
                <button onclick="deleteWatchlistEntry('${safeId}')" class="px-2 py-1 rounded bg-gray-800 hover:bg-rose-900/60 text-gray-300 hover:text-rose-300 text-[10px] transition" title="Supprimer">
                    <i class="fa-solid fa-trash text-[9px]"></i>
                </button>
            </div>
        </div>`;
}

// Filtre une liste d'entrées selon le filtre courant.
function _watchlistApplyFilter(list, filter) {
    switch (filter) {
        case 'TRIGGERED':   return list.filter(w => watchlistIsTargetReached(w));
        case 'WITH_TARGET': return list.filter(w => w.targetPrice > 0);
        case 'NO_TARGET':   return list.filter(w => w.targetPrice <= 0);
        case 'CRYPTO':      return list.filter(w => w.coingeckoId || /^(BTC|ETH|SOL|ADA|XRP|DOGE|BNB|LTC|DOT|AVAX|MATIC|LINK)$/.test(w.ticker));
        case 'STOCK':       return list.filter(w => !w.coingeckoId && !/^(BTC|ETH|SOL|ADA|XRP|DOGE|BNB|LTC|DOT|AVAX|MATIC|LINK)$/.test(w.ticker));
        default:            return list;
    }
}

// Rendu complet de l'onglet (appelé par renderWatchlistTab et refreshAllUI)
function renderWatchlistTab() {
    // Recharge depuis le storage (utile si un autre onglet a modifié)
    initWatchlistFromStorage();

    // KPIs
    const total = watchlist.length;
    const withTarget = watchlist.filter(w => w.targetPrice > 0).length;
    const triggered = watchlistTriggeredCount();
    const simulatedValue = watchlist.reduce((s, w) => {
        if (!Number.isFinite(w.lastPrice) || w.lastPrice <= 0) return s;
        // Convertit chaque cours dans sa devise native vers EUR via le cache FX
        let rate = 1;
        if (w.currency !== 'EUR' && typeof getFxRateSync === 'function') {
            rate = getFxRateSync(w.currency);
        }
        return s + w.lastPrice * rate;
    }, 0);

    const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
    setText('watchlist-stat-count', total);
    setText('watchlist-stat-with-target', withTarget + ' avec cible');
    setText('watchlist-stat-triggered', triggered);
    setText('watchlist-stat-total-value', formatEUR(simulatedValue));

    const lastRefreshEl = document.getElementById('watchlist-stat-last-refresh');
    if (lastRefreshEl) {
        if (watchlistLastRefreshAt) {
            lastRefreshEl.innerText = new Date(watchlistLastRefreshAt).toLocaleString('fr-FR', {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
            });
        } else {
            lastRefreshEl.innerText = '—';
        }
    }

    // Badge dans la nav
    const navBadge = document.getElementById('watchlist-nav-badge');
    if (navBadge) {
        if (triggered > 0) {
            navBadge.classList.remove('hidden');
            navBadge.innerText = triggered;
        } else {
            navBadge.classList.add('hidden');
        }
    }

    // Filtres actifs
    document.querySelectorAll('.watchlist-filter-btn').forEach(btn => {
        const isActive = btn.dataset.filter === watchlistFilter;
        btn.classList.toggle('bg-gray-800', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('border-gray-700', isActive);
        btn.classList.toggle('font-medium', isActive);
        btn.classList.toggle('bg-gray-900', !isActive);
        btn.classList.toggle('text-gray-400', !isActive);
        btn.classList.toggle('border-gray-800', !isActive);
    });

    // Grille
    const grid = document.getElementById('watchlist-grid');
    if (!grid) return;

    if (!total) {
        grid.innerHTML = `
            <div class="col-span-full bg-gray-900/60 border border-dashed border-gray-700 rounded-xl p-8 text-center text-sm text-gray-500">
                <i class="fa-solid fa-binoculars text-3xl text-amber-500/40 mb-2 block"></i>
                Aucune idée d'investissement surveillée.<br>
                <button onclick="openAddWatchlistModal()" class="mt-3 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-medium transition">
                    <i class="fa-solid fa-plus text-[10px]"></i> Ajouter votre première idée
                </button>
            </div>`;
        return;
    }

    const filtered = _watchlistApplyFilter(watchlist, watchlistFilter);
    // Tri : les cibles atteintes d'abord, puis par date d'ajout décroissante
    filtered.sort((a, b) => {
        const ra = watchlistIsTargetReached(a) ? 0 : 1;
        const rb = watchlistIsTargetReached(b) ? 0 : 1;
        if (ra !== rb) return ra - rb;
        return (b.addedAt || 0) - (a.addedAt || 0);
    });

    if (!filtered.length) {
        grid.innerHTML = `<div class="col-span-full text-gray-500 italic text-xs text-center py-6">Aucune entrée pour ce filtre.</div>`;
        return;
    }

    grid.innerHTML = filtered.map(_watchlistCardHTML).join('');
}

function filterWatchlist(filter) {
    watchlistFilter = filter;
    renderWatchlistTab();
}

// =====================================================================
// MODAL AJOUT / ÉDITION
// =====================================================================

// Alimente le select « Devise » (utilise le même set que le formulaire actif)
function _populateWatchlistCurrencySelect(selected) {
    const sel = document.getElementById('wl-currency');
    if (!sel) return;
    const codes = ['EUR', 'USD', 'GBP', 'CHF', 'JPY'];
    sel.innerHTML = codes.map(c => `<option value="${c}" ${c === (selected || 'EUR') ? 'selected' : ''}>${c}</option>`).join('');
}

function openAddWatchlistModal() {
    // Réutilise le même modal pour création et édition — on reset tout
    document.getElementById('wl-edit-id').value = '';
    document.getElementById('modal-watchlist-title').innerHTML =
        '<i class="fa-solid fa-binoculars text-amber-400"></i> Ajouter une idée d\'investissement';

    document.getElementById('wl-name').value = '';
    document.getElementById('wl-ticker').value = '';
    document.getElementById('wl-yahoo-ticker').value = '';
    document.getElementById('wl-coingecko-id').value = '';
    _populateWatchlistCurrencySelect('EUR');
    document.getElementById('wl-target-price').value = '';
    document.getElementById('wl-target-kind').value = 'BELOW';
    document.getElementById('wl-notes').value = '';
    document.getElementById('wl-cadran').value = 'HORS_GAVE';

    // Décoche tous les tags
    document.querySelectorAll('#wl-tags-wrap input').forEach(cb => { cb.checked = false; });

    document.getElementById('modal-add-watchlist').classList.remove('hidden');
    setTimeout(() => document.getElementById('wl-name').focus(), 60);
}

function editWatchlistEntry(id) {
    const w = watchlist.find(x => String(x.id) === String(id));
    if (!w) return;

    document.getElementById('wl-edit-id').value = w.id;
    document.getElementById('modal-watchlist-title').innerHTML =
        '<i class="fa-solid fa-pen text-amber-400"></i> Modifier l\'idée surveillée';

    document.getElementById('wl-name').value = w.name;
    document.getElementById('wl-ticker').value = w.ticker;
    document.getElementById('wl-yahoo-ticker').value = w.yahooTicker || '';
    document.getElementById('wl-coingecko-id').value = w.coingeckoId || '';
    _populateWatchlistCurrencySelect(w.currency);
    document.getElementById('wl-target-price').value = w.targetPrice > 0 ? w.targetPrice : '';
    document.getElementById('wl-target-kind').value = w.targetKind || 'BELOW';
    document.getElementById('wl-notes').value = w.notes || '';
    document.getElementById('wl-cadran').value = w.cadran || 'HORS_GAVE';

    document.querySelectorAll('#wl-tags-wrap input').forEach(cb => {
        cb.checked = (w.tags || []).includes(cb.value);
    });

    document.getElementById('modal-add-watchlist').classList.remove('hidden');
}

// Rendu des chips de tags (appelé une fois au boot)
function renderWatchlistTagChips() {
    const wrap = document.getElementById('wl-tags-wrap');
    if (!wrap || wrap.dataset.rendered === '1') return;
    wrap.innerHTML = ASSET_TAGS.map(t => `
        <label class="cursor-pointer select-none">
            <input type="checkbox" value="${escapeHTML(t)}" class="peer hidden">
            <span class="inline-block px-2.5 py-1 rounded-full border border-gray-700 bg-gray-900 text-gray-400 text-[11px] peer-checked:bg-amber-950 peer-checked:text-amber-300 peer-checked:border-amber-600 hover:text-white">${escapeHTML(t)}</span>
        </label>`).join('');
    wrap.dataset.rendered = '1';
}

function handleAddWatchlist(e) {
    e.preventDefault();

    const editId = document.getElementById('wl-edit-id').value;
    const name   = document.getElementById('wl-name').value.trim();
    const ticker = document.getElementById('wl-ticker').value.trim().toUpperCase();

    if (!name || !ticker) {
        alert('Le nom et le ticker sont obligatoires.');
        return;
    }

    const tags = Array.from(document.querySelectorAll('#wl-tags-wrap input:checked')).map(i => i.value);
    const entry = normalizeWatchlistEntry({
        id:           editId || undefined,
        name, ticker,
        yahooTicker:  document.getElementById('wl-yahoo-ticker').value.trim(),
        coingeckoId:  document.getElementById('wl-coingecko-id').value.trim().toLowerCase(),
        currency:     document.getElementById('wl-currency').value,
        targetPrice:  parseFloat(document.getElementById('wl-target-price').value) || 0,
        targetKind:   document.getElementById('wl-target-kind').value,
        notes:        document.getElementById('wl-notes').value.trim(),
        cadran:       document.getElementById('wl-cadran').value,
        tags
    });
    if (!entry) {
        alert('Données invalides.');
        return;
    }

    if (editId) {
        const idx = watchlist.findIndex(x => String(x.id) === String(editId));
        if (idx > -1) {
            // Préserve les données de cours déjà connues
            entry.lastPrice   = watchlist[idx].lastPrice;
            entry.lastPriceAt = watchlist[idx].lastPriceAt;
            entry.addedAt     = watchlist[idx].addedAt;
            watchlist[idx] = entry;
        }
    } else {
        watchlist.push(entry);
    }

    saveWatchlistToStorage();
    closeModal('modal-add-watchlist');
    renderWatchlistTab();

    // Fetch immédiat du cours (non bloquant) pour cette nouvelle entrée
    setTimeout(() => {
        fetchWatchlistPrice(entry).then(p => {
            if (p !== null) {
                entry.lastPrice = p;
                entry.lastPriceAt = Date.now();
                entry.lastFetchErr = '';
                saveWatchlistToStorage();
                renderWatchlistTab();
            }
        }).catch(() => {});
    }, 200);
}

function deleteWatchlistEntry(id) {
    const w = watchlist.find(x => String(x.id) === String(id));
    if (!w) return;
    if (!confirm(`Supprimer "${w.name}" de la watchlist ?\n\nCette action est réversible via Ctrl+Z.`)) return;

    if (typeof pushUndo === 'function') pushUndo('Suppression d\'une entrée watchlist');
    watchlist = watchlist.filter(x => String(x.id) !== String(id));
    saveWatchlistToStorage();
    renderWatchlistTab();
}

// =====================================================================
// PROMOTION D'UNE IDÉE WATCHLIST → ACTIF RÉEL (Chantier 1.4)
// ---------------------------------------------------------------------
// Ouvre le modal « Ajouter un actif » pré-rempli avec les données de
// l'entrée watchlist, propose un prix d'achat par défaut, puis demande
// à l'utilisateur s'il veut retirer l'idée de la watchlist après la
// création effective de l'actif.
// =====================================================================
function promoteWatchlistToAsset(id) {
    const w = watchlist.find(x => String(x.id) === String(id));
    if (!w) { alert('Idée introuvable.'); return; }
    if (typeof openAddAssetModal !== 'function') {
        alert('Le formulaire d\'ajout d\'actif n\'est pas disponible.');
        return;
    }

    // Ouvre le modal vide (réinitialise tous les champs)
    openAddAssetModal();

    // --- Pré-remplissage des champs principaux ---
    document.getElementById('add-name').value   = w.name;
    document.getElementById('add-ticker').value = w.ticker;

    // Yahoo ticker : uniquement s'il est présent (sinon on laisse vide)
    if (w.yahooTicker) {
        document.getElementById('add-yahoo-ticker').value = w.yahooTicker;
    }

    // Cadran (si défini et valide, sinon on laisse le défaut)
    const cadranSel = document.getElementById('add-cadran');
    if (cadranSel && w.cadran) {
        const opt = cadranSel.querySelector(`option[value="${w.cadran}"]`);
        if (opt) cadranSel.value = w.cadran;
    }

    // Tags : si l'entrée watchlist en a, on les applique (sinon on laisse
    // le défaut 'Or & Métaux' — l'utilisateur ajustera).
    if (Array.isArray(w.tags) && w.tags.length && typeof setFormTags === 'function') {
        setFormTags(w.tags);
    }

    // Devise (Chantier 1.2) : on applique la devise de la watchlist, puis
    // on déclenche la mise à jour du bloc taux de change.
    const curSel = document.getElementById('add-currency');
    if (curSel && w.currency) {
        curSel.value = w.currency;
        if (typeof onCurrencyChange === 'function') onCurrencyChange();
    }

    // --- Prix d'achat par défaut ---
    // Priorité 1 : prix cible si défini (c'est l'intention d'achat explicite).
    // Priorité 2 : dernier cours connu.
    // Priorité 3 : vide (l'utilisateur saisit).
    let suggestedPrice = 0;
    if (w.targetPrice > 0) {
        suggestedPrice = w.targetPrice;
    } else if (Number.isFinite(w.lastPrice) && w.lastPrice > 0) {
        suggestedPrice = w.lastPrice;
    }
    if (suggestedPrice > 0) {
        const priceInput = document.getElementById('add-price');
        if (priceInput) priceInput.value = suggestedPrice;

        // Valeur actuelle initialisée au même niveau (0 % de perf au démarrage)
        const valueInput = document.getElementById('add-value');
        if (valueInput && !valueInput.value) {
            valueInput.value = suggestedPrice.toFixed(4);
        }
    }

    // Quantité par défaut : 1 (l'utilisateur ajuste)
    const qtyInput = document.getElementById('add-qty');
    if (qtyInput) qtyInput.value = 1;

    // Date d'achat : aujourd'hui (déjà géré par openAddAssetModal)
    // Frais : 0 (déjà géré)

    // --- Encart informatif en haut du modal pour tracer la provenance ---
    _injectPromotionBanner(w);

    // Le modal est ouvert : on garde l'id watchlist en mémoire pour le cleanup
    window._pendingPromotionWatchlistId = w.id;
}

// Injecte (ou remplace) un petit bandeau "Promotion depuis la watchlist"
// en haut du formulaire d'ajout d'actif. Le bandeau est retiré
// automatiquement quand l'utilisateur ferme le modal sans créer.
function _injectPromotionBanner(w) {
    // Supprime un éventuel bandeau précédent
    const old = document.getElementById('promotion-banner');
    if (old) old.remove();

    const form = document.querySelector('#modal-add-asset form');
    if (!form) return;

    const banner = document.createElement('div');
    banner.id = 'promotion-banner';
    banner.className = 'bg-amber-950/40 border border-amber-800/60 rounded-xl p-3 flex items-start gap-3';
    banner.innerHTML = `
        <div class="flex-shrink-0 w-8 h-8 rounded-lg bg-amber-950 border border-amber-700/60 flex items-center justify-center text-amber-300">
            <i class="fa-solid fa-binoculars"></i>
        </div>
        <div class="flex-1 min-w-0">
            <div class="text-[11px] font-bold text-amber-200">Promotion depuis la watchlist</div>
            <div class="text-[11px] text-gray-300 mt-0.5 leading-relaxed">
                Cette idée <b>${escapeHTML(w.name)}</b> (${escapeHTML(w.ticker)}) va devenir un actif réel.
                Vérifiez le prix d'achat et la quantité, puis validez — l'entrée sera retirée de la watchlist.
            </div>
        </div>
        <button type="button" onclick="document.getElementById('promotion-banner').remove(); window._pendingPromotionWatchlistId = null;" class="flex-shrink-0 w-6 h-6 rounded-md bg-amber-900/60 text-amber-200 hover:bg-amber-800 hover:text-white flex items-center justify-center transition" title="Annuler la provenance watchlist">
            <i class="fa-solid fa-xmark text-[10px]"></i>
        </button>
    `;
    form.insertBefore(banner, form.firstChild);
}

// Hook appelé après une création d'actif réussie (fin de handleAddAsset).
// Si l'utilisateur vient de promouvoir une idée watchlist, on lui propose
// de retirer l'entrée correspondante (ou on la retire silencieusement si
// une confirmation explicite a déjà été donnée plus tôt).
function cleanupAfterPromotion() {
    const pendingId = window._pendingPromotionWatchlistId;
    if (!pendingId) return;

    const w = watchlist.find(x => String(x.id) === String(pendingId));
    window._pendingPromotionWatchlistId = null;
    const banner = document.getElementById('promotion-banner');
    if (banner) banner.remove();

    if (!w) return;
    if (!confirm(`Retirer "${w.name}" de la watchlist ?\n\nL'idée a été promue en actif réel — vous pouvez la retirer pour éviter un doublon.`)) return;

    watchlist = watchlist.filter(x => String(x.id) !== String(pendingId));
    saveWatchlistToStorage();
    renderWatchlistTab();
}

// =====================================================================
// INITIALISATION DE L'ONGLET
// =====================================================================
function initWatchlistModule() {
    initWatchlistFromStorage();
    renderWatchlistTagChips();

    // Si des entrées ont un yahooTicker/coingeckoId et aucun cours récent
    // (>1h), on lance un refresh silencieux en arrière-plan.
    const stale = watchlist.filter(w =>
        (w.yahooTicker || w.coingeckoId) &&
        (!w.lastPriceAt || (Date.now() - w.lastPriceAt) > 60 * 60 * 1000)
    );
    if (stale.length) {
        refreshWatchlistPrices(true).then(({ updated }) => {
            if (updated > 0) {
                watchlistLastRefreshAt = Date.now();
                renderWatchlistTab();
            }
        }).catch(() => {});
    }
}