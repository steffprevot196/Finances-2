// =====================================================================
// app4-forms.js — FORMULAIRES (actif, cession, recherche, vente)
// Dépend de : app1-core.js, app2-ui.js
// =====================================================================

// ---------------------------------------------------------------------
// Chips de tags (catégories multi-sélection)
// ---------------------------------------------------------------------
function renderAssetTagChips() {
    document.getElementById('add-tags-wrap').innerHTML = ASSET_TAGS.map(t => `
        <label class="cursor-pointer select-none">
            <input type="checkbox" value="${t}" onchange="onAssetTagsChanged()" class="peer hidden">
            <span class="inline-block px-2.5 py-1 rounded-full border border-gray-700 bg-gray-900 text-gray-400 text-[11px] peer-checked:bg-emerald-950 peer-checked:text-emerald-300 peer-checked:border-emerald-600 hover:text-white">${t}</span>
        </label>`).join('');
}

function getFormTags() {
    return Array.from(document.querySelectorAll('#add-tags-wrap input:checked')).map(i => i.value);
}

function setFormTags(tags) {
    document.querySelectorAll('#add-tags-wrap input').forEach(i => { i.checked = tags.includes(i.value); });
    onAssetTagsChanged();
}

function onAssetTagsChanged() {
    updateTaxCategoryOptions();
    updateAssetFormSections();
}

// ---------------------------------------------------------------------
// Options de régime fiscal selon les tags
// ---------------------------------------------------------------------
function updateTaxCategoryOptions(desiredValue) {
    const tags = getFormTags();
    const security = tags.some(t => SECURITY_TAGS.includes(t));
    const options = (!security && tags.includes('Or & Métaux'))
        ? METAL_TAX_OPTIONS
        : [{
            value: 'NON_CONCERNE',
            label: security
                ? 'Non concerné — titre financier (régime selon l\'enveloppe)'
                : 'Non concerné (régime général PFU/Barème)'
        }];

    const select = document.getElementById('add-tax-category');
    const note   = document.getElementById('add-tax-category-note');
    const previousValue = desiredValue || select.value;

    select.innerHTML = options.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
    select.value = options.some(o => o.value === previousValue) ? previousValue : options[0].value;

    select.disabled = options.length === 1;
    note.classList.toggle('hidden', options.length !== 1);
}

// ---------------------------------------------------------------------
// Options d'enveloppe selon les tags
// ---------------------------------------------------------------------
function envelopeOptionsFor(tags) {
    const security = tags.some(t => SECURITY_TAGS.includes(t));
    const codes = security
        ? SECURITY_ENVELOPES
        : (tags.includes('Devises/Liquidités') ? CASH_ENVELOPES : []);
    return codes.map(c => ({
        value: c,
        label: c === '' ? 'Aucune (compte courant / espèces)' : ENVELOPPES[c].label
    }));
}

// ---------------------------------------------------------------------
// Sections dépendantes des tags (obligation, valorisation, enveloppe)
// ---------------------------------------------------------------------
function updateAssetFormSections(desiredEnvelope) {
    const tags = getFormTags();
    document.getElementById('add-bond-wrap').classList.toggle('hidden', !tags.includes('Obligation'));

    const manual = tags.some(t => MANUAL_VALUATION_TAGS.includes(t));
    document.getElementById('add-valuation-wrap').classList.toggle('hidden', !manual);

    const opts = envelopeOptionsFor(tags);
    const sel  = document.getElementById('add-envelope');
    const previous = desiredEnvelope !== undefined ? desiredEnvelope : sel.value;

    sel.innerHTML = opts.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
    if (opts.length) {
        sel.value = opts.some(o => o.value === previous) ? previous : opts[0].value;
    }
    document.getElementById('add-envelope-wrap').classList.toggle('hidden', opts.length === 0);
    updateEnvelopeDetails();
}

function updateEnvelopeDetails() {
    const env  = document.getElementById('add-envelope').value;
    const tags = getFormTags();
    document.getElementById('add-envelope-date-wrap').classList.toggle('hidden', !ENVELOPES_WITH_DATE.includes(env));
    const isPEA = env === 'PEA' || env === 'PEA_PME';
    document.getElementById('add-zone-wrap').classList.toggle('hidden', !isPEA);

    const warns = [];
    if (isPEA) {
        if (tags.includes('Obligation')) warns.push('Les obligations ne sont normalement pas éligibles au PEA.');
        if (document.getElementById('add-zone').value === 'HORS_UE') warns.push('Un titre coté hors UE/EEE n\'est pas éligible au PEA.');
        warns.push(`Plafond de versements ${ENVELOPPES[env].label} : ${formatEUR(ENVELOPPES[env].plafond)}.`);
    }
    if (env === 'AV') warns.push('Assurance-Vie : l\'abattement annuel sur les gains ne s\'applique qu\'après 8 ans de contrat.');
    if (env === 'PER') warns.push('PER : fiscalité approximative (dépend du mode de sortie et de la déductibilité des versements).');
    if (env && ENVELOPPES[env] && ENVELOPPES[env].exo) {
        warns.push(`${ENVELOPPES[env].label} : intérêts exonérés, plafond ${formatEUR(ENVELOPPES[env].plafond)}.`);
    }
    const el = document.getElementById('add-envelope-warning');
    el.innerHTML = warns.map(w => `<div>⚠ ${w}</div>`).join('');
    el.classList.toggle('hidden', warns.length === 0);
}

// ---------------------------------------------------------------------
// Ouverture du formulaire d'ajout
// ---------------------------------------------------------------------
function openAddAssetModal() {
    document.getElementById('add-edit-id').value = '';
    document.getElementById('modal-add-asset-title').innerHTML = '<i class="fa-solid fa-plus-circle text-emerald-400"></i> Ajouter un Nouvel Actif';
    document.getElementById('modal-add-asset-submit-btn').innerText = 'Enregistrer l\'actif';
    document.getElementById('add-search-input').value = '';
    document.getElementById('search-results-container').classList.add('hidden');
    document.getElementById('search-results-container').innerHTML = '';
    document.getElementById('add-yahoo-ticker').value = '';
    document.getElementById('add-isin').value = '';
    document.getElementById('add-cadran').value = 'OR';
    document.getElementById('add-value-wrap').classList.add('hidden');
    document.getElementById('add-value').removeAttribute('required');
    document.getElementById('add-value').value = '';
    document.getElementById('add-purchase-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('add-broker').value = '';
    document.getElementById('add-bond-coupon').value = '';
    document.getElementById('add-bond-maturity').value = '';
    document.getElementById('add-bond-rating').value = '';
    document.getElementById('add-bond-nominal').value = 1000;
    document.getElementById('add-valuation-mode').value = 'MANUAL';
    document.getElementById('add-envelope-date').value = '';
    document.getElementById('add-zone').value = 'UE';
    setFormTags(['Or & Métaux']);
    document.getElementById('modal-add-asset').classList.remove('hidden');
}

// ---------------------------------------------------------------------
// Ouverture du formulaire d'édition
// ---------------------------------------------------------------------
function openEditAssetModal(id) {
    const asset = assets.find(a => a.id === id);
    if (!asset) return;

    document.getElementById('add-edit-id').value = asset.id;
    document.getElementById('add-name').value = asset.name;
    document.getElementById('add-ticker').value = asset.ticker;
    document.getElementById('add-yahoo-ticker').value = asset.yahooTicker || '';
    document.getElementById('add-isin').value = asset.isin || '';
    setFormTags(asset.categories);
    updateTaxCategoryOptions(asset.taxCategory || 'NON_CONCERNE');
    document.getElementById('add-cadran').value = asset.cadrans.primary;
    document.getElementById('add-qty').value = asset.qty;
    document.getElementById('add-frais').value = asset.frais || 0;
    document.getElementById('add-value-wrap').classList.remove('hidden');
    document.getElementById('add-value').setAttribute('required', 'required');
    document.getElementById('add-value').value = asset.qty
        ? (asset.value / asset.qty).toFixed(4)
        : asset.value;
    document.getElementById('add-price').value = asset.qty
        ? ((asset.invested - (asset.frais || 0)) / asset.qty).toFixed(4)
        : asset.invested;
    document.getElementById('add-purchase-date').value = asset.purchaseDate || '';
    document.getElementById('add-broker').value = asset.broker || '';

    document.getElementById('add-valuation-mode').value = asset.valuationMode || 'MANUAL';
    document.getElementById('add-bond-coupon').value = asset.coupon !== undefined ? (asset.coupon * 100).toFixed(3) : '';
    document.getElementById('add-bond-maturity').value = asset.maturity || '';
    document.getElementById('add-bond-rating').value = asset.rating || '';
    document.getElementById('add-bond-nominal').value = asset.nominal !== undefined ? asset.nominal : 1000;

    updateAssetFormSections(asset.envelope);
    document.getElementById('add-envelope-date').value = asset.envelopeOpenedAt || '';
    document.getElementById('add-zone').value = asset.zone || 'UE';
    updateEnvelopeDetails();

    document.getElementById('modal-add-asset-title').innerHTML = '<i class="fa-solid fa-pen text-emerald-400"></i> Modifier l\'Actif';
    document.getElementById('modal-add-asset-submit-btn').innerText = 'Enregistrer les Modifications';
    document.getElementById('search-results-container').classList.add('hidden');
    document.getElementById('add-search-input').value = '';
    document.getElementById('modal-add-asset').classList.remove('hidden');
}

// ---------------------------------------------------------------------
// Recalcul automatique du total (quantité × prix)
// ---------------------------------------------------------------------
function recalculateAddTotals() {
    const qty   = parseFloat(document.getElementById('add-qty').value) || 0;
    const price = parseFloat(document.getElementById('add-price').value) || 0;
    const valueInput = document.getElementById('add-value');
    if (!valueInput.value || valueInput.value == '0') {
        valueInput.value = price.toFixed(4);
    }
}

// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// VALIDATION DE COHÉRENCE (Partie 5)
// ---------------------------------------------------------------------
function validateAssetCoherence(fields) {
    const warnings = [];
    if (fields.cadrans.primary === 'CRYPTO' && !fields.categories.includes('Crypto'))
        warnings.push('Le cadran "Cryptomonnaies" est sélectionné mais le tag "Crypto" est absent.');
    if (fields.categories.includes('Crypto') && fields.cadrans.primary !== 'CRYPTO')
        warnings.push('Un actif taggé Crypto devrait avoir le cadran "Cryptomonnaies".');
    if (fields.categories.includes('Obligation') && (fields.envelope === 'PEA' || fields.envelope === 'PEA_PME'))
        warnings.push('Les obligations ne sont pas éligibles au PEA.');
    if (fields.isin && !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(fields.isin))
        warnings.push("Le format de l'ISIN est invalide (2 lettres + 9 alphanum + 1 chiffre).");
    if (fields.isin) {
        const duplicate = assets.find(a => a.isin === fields.isin && a.id !== fields.id);
        if (duplicate) warnings.push(`Un actif avec cet ISIN existe déjà : ${duplicate.name}.`);
    }
    return warnings;
}

// ---------------------------------------------------------------------
// Soumission du formulaire d'ajout/édition
// ---------------------------------------------------------------------
function handleAddAsset(e) {
    e.preventDefault();
    const editId = document.getElementById('add-edit-id').value;
    const tags = getFormTags();
    if (!tags.length) { alert('Sélectionnez au moins une catégorie.'); return; }

    const name         = document.getElementById('add-name').value;
    const ticker       = document.getElementById('add-ticker').value.toUpperCase();
    const taxCategory  = document.getElementById('add-tax-category').value;
    const primaryCadran = document.getElementById('add-cadran').value;
    const qty          = parseFloat(document.getElementById('add-qty').value) || 0;
    const price        = parseFloat(document.getElementById('add-price').value) || 0;
    const purchaseDate = document.getElementById('add-purchase-date').value;
    const broker       = document.getElementById('add-broker').value.trim();
    const purchaseDateFR = purchaseDate
        ? new Date(purchaseDate).toLocaleDateString('fr-FR')
        : new Date().toLocaleDateString('fr-FR');

    // À la création, la valeur de marché est initialisée au prix payé (0% de performance).
    // En édition, le champ "Valeur Actuelle" est réactivé et utilisé tel quel.
    const unitValue = editId
        ? (parseFloat(document.getElementById('add-value').value) || price)
        : price;
    const frais = parseFloat(document.getElementById('add-frais').value) || 0;

    const envelopeVisible = !document.getElementById('add-envelope-wrap').classList.contains('hidden');
    const envelope = envelopeVisible ? document.getElementById('add-envelope').value : '';
    const dateVisible = !document.getElementById('add-envelope-date-wrap').classList.contains('hidden');
    const envelopeOpenedAt = envelopeVisible && dateVisible
        ? document.getElementById('add-envelope-date').value
        : '';
    const zone = document.getElementById('add-zone').value;
    const yahooTicker = document.getElementById('add-yahoo-ticker').value.trim();
    const manualTag = tags.some(t => MANUAL_VALUATION_TAGS.includes(t));
    const valuationMode = manualTag
        ? document.getElementById('add-valuation-mode').value
        : 'QUOTE';

    const bond = tags.includes('Obligation') ? {
        coupon:   (parseFloat(document.getElementById('add-bond-coupon').value) || 0) / 100,
        maturity: document.getElementById('add-bond-maturity').value,
        rating:   document.getElementById('add-bond-rating').value.trim(),
        nominal:  parseFloat(document.getElementById('add-bond-nominal').value) || 1000
    } : null;

    const invested = (qty * price) + frais;
    const value    = qty * unitValue;
    const isin = (document.getElementById('add-isin').value || '').toUpperCase().trim();
    const fields = {
        name, ticker, isin, categories: tags, taxCategory,
        cadrans: { primary: primaryCadran, secondary: [] },
        qty, frais, invested, value,
        envelope, envelopeOpenedAt, zone, yahooTicker, valuationMode,
        purchaseDate, broker
    };

    if (editId) {
        const asset = assets.find(a => a.id === parseFloat(editId));
        if (asset) {
            Object.assign(asset, fields);
            delete asset.needsReclass;
            delete asset.reclassSuggestion;
            if (bond) Object.assign(asset, bond);
            else { delete asset.coupon; delete asset.maturity; delete asset.rating; delete asset.nominal; }
            normalizeAsset(asset);                     // ← AJOUT : resynchronise a.cadran, a.category, etc.
            upsertTodayHistoryPoint(asset, value, invested);
        }
        } else {
        const newAsset = Object.assign({
            id: Date.now(),
            buys: [{ date: purchaseDateFR, type: 'Achat Initial', qty, price, frais, total: invested }],
            history: [{ date: purchaseDateFR, value: invested, invested }],
            lots: [makeLot(purchaseDate || new Date().toISOString().slice(0, 10), qty, price, frais)]
        }, fields, bond || {});
        normalizeAsset(newAsset);
        syncAssetFromLots(newAsset);
        upsertTodayHistoryPoint(newAsset, value, invested);
        assets.push(newAsset);
    }
    const warnings = validateAssetCoherence(fields);
    if (warnings.length && !confirm('Avertissements :\n\n' + warnings.join('\n') + '\n\nContinuer quand même ?')) {
        return;
    }

    saveToStorage();
    closeModal('modal-add-asset');
    refreshAllUI();
    e.target.reset();
    document.getElementById('add-edit-id').value = '';
}

// ---------------------------------------------------------------------
// Suppression d'un actif
// ---------------------------------------------------------------------
function deleteAsset(id) {
    if (confirm('Supprimer cet actif ?')) {
        assets = assets.filter(a => a.id !== id);
        saveToStorage();
        refreshAllUI();
    }
}

// =====================================================================
// MOTEUR DE RECHERCHE (Vera Valor, Devises, Actions, Crypto...)
// =====================================================================
async function triggerAssetSearch() {
    const query = document.getElementById('add-search-input').value.trim();
    const container = document.getElementById('search-results-container');
    const qLower = query.toLowerCase();

    if (query.length < 1) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
    }

    container.innerHTML = '<div class="p-3 text-xs text-gray-400 flex items-center gap-2"><i class="fa-solid fa-spinner fa-spin"></i> Recherche dans le catalogue et les marchés...</div>';
    container.classList.remove('hidden');

    const results = [];

    // 1) Catalogue AuCoffre
    auCoffreCatalog.forEach(c => {
        if (c.name.toLowerCase().includes(qLower) || c.ticker.toLowerCase().includes(qLower) || (c.isin || '').toLowerCase().includes(qLower)) {
            results.push({
                type: 'aucoffre',
                badge: c.taxCategory === 'JETON' ? 'Jeton Or (Exo < 5k€)' : 'Or Cours Légitime',
                badgeColor: c.taxCategory === 'JETON'
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-800/50'
                    : 'bg-amber-950 text-amber-300 border-amber-800/50',
                name: c.name,
                ticker: c.ticker,
                category: c.category,
                cadran: c.cadran,
                taxCategory: c.taxCategory,
                priceEUR: c.basePriceEUR
            });
        }
    });

        // 2) Catalogue Actions / ETF / Forex
        popularMarketAssets.forEach(m => {
            if (m.name.toLowerCase().includes(qLower) || m.ticker.toLowerCase().includes(qLower) || (m.isin || '').toLowerCase().includes(qLower)) {
                results.push({
                    type: 'market',
                    badge: m.category === 'Devises/Liquidités' ? 'Devise / Forex' : 'Action / ETF',
                    badgeColor: m.category === 'Devises/Liquidités'
                        ? 'bg-blue-950 text-blue-300 border-blue-800/50'
                        : 'bg-indigo-950 text-indigo-300 border-indigo-800/50',
                    name: m.name,
                    ticker: m.ticker,
                    category: m.category,
                    cadran: m.cadran,
                    taxCategory: m.taxCategory || 'NON_CONCERNE',
                    priceEUR: m.basePriceEUR
                });
            }
        });
    
        // 2bis) Catalogue Crypto (Correction 4)
        cryptoCatalog.forEach(c => {
            if (c.name.toLowerCase().includes(qLower) || c.ticker.toLowerCase().includes(qLower) || (c.isin || '').toLowerCase().includes(qLower)) {
                results.push({
                    type: 'crypto',
                    badge: 'Crypto',
                    badgeColor: 'bg-purple-950 text-purple-300 border-purple-800/50',
                    name: c.name,
                    ticker: c.ticker,
                    tags: ['Crypto'],
                    cadran: 'CRYPTO',
                    taxCategory: 'NON_CONCERNE',
                    priceEUR: c.basePriceEUR
                });
            }
        });
    
        // 3) Détection directe des devises courantes
    if (qLower.includes('yen') || qLower === 'jpy') {
        if (!results.some(r => r.ticker === 'JPY')) {
            results.push({
                name: 'Yen Japonais (JPY/EUR)', ticker: 'JPY', category: 'Devises/Liquidités',
                cadran: 'MONNAIES', taxCategory: 'NON_CONCERNE',
                badge: 'Devise Forex', badgeColor: 'bg-blue-950 text-blue-300 border-blue-800',
                priceEUR: 0.0062
            });
        }
    } else if (qLower.includes('dollar') || qLower === 'usd') {
        if (!results.some(r => r.ticker === 'USD')) {
            results.push({
                name: 'Dollar Américain (USD/EUR)', ticker: 'USD', category: 'Devises/Liquidités',
                cadran: 'MONNAIES', taxCategory: 'NON_CONCERNE',
                badge: 'Devise Forex', badgeColor: 'bg-blue-950 text-blue-300 border-blue-800',
                priceEUR: 0.92
            });
        }
    } else if (qLower.includes('franc suisse') || qLower === 'chf') {
        if (!results.some(r => r.ticker === 'CHF')) {
            results.push({
                name: 'Franc Suisse (CHF/EUR)', ticker: 'CHF', category: 'Devises/Liquidités',
                cadran: 'MONNAIES', taxCategory: 'NON_CONCERNE',
                badge: 'Devise Forex', badgeColor: 'bg-blue-950 text-blue-300 border-blue-800',
                priceEUR: 1.05
            });
        }
    }

    renderSearchResults(results);

    // Complément Finnhub (asynchrone, ne bloque pas)
    if (typeof finnhubApiKey !== 'undefined' && finnhubApiKey && query.length >= 2) {
        searchFinnhubSymbol(query).then(finnhubResults => {
            if (finnhubResults.length) {
                const combined = [...results, ...finnhubResults];
                renderSearchResults(combined);
            }
        });
    }

    // Complément CoinGecko live (Partie 4.2)
    if (query.length >= 2) {
        fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data || !data.coins) return;
                const liveResults = data.coins.slice(0, 6).map(c => ({
                    type: 'crypto',
                    badge: 'Crypto (live)',
                    badgeColor: 'bg-purple-950 text-purple-300 border-purple-800/50',
                    name: c.name,
                    ticker: c.symbol.toUpperCase(),
                    tags: ['Crypto'],
                    cadran: 'CRYPTO',
                    taxCategory: 'NON_CONCERNE',
                    priceEUR: 0,
                    coingeckoId: c.id
                }));
                if (liveResults.length) {
                    const currentResults = document.querySelectorAll('#search-results-container > div').length;
                    if (currentResults <= 1) renderSearchResults(liveResults);
                }
            })
            .catch(err => console.warn('CoinGecko search failed:', err));
    }
}

function renderSearchResults(results) {
    const container = document.getElementById('search-results-container');
    container.innerHTML = '';

    if (results.length === 0) {
        container.innerHTML = '<div class="p-3 text-xs text-gray-500 italic">Aucun résultat spécifique. Vous pouvez remplir directement le formulaire ci-dessous.</div>';
        return;
    }

    results.forEach(item => {
        const div = document.createElement('div');
        div.className = 'p-2.5 hover:bg-gray-800/80 cursor-pointer transition flex items-center justify-between text-xs';
        div.onclick = () => selectSearchResult(item);
        div.innerHTML = `
            <div>
                <div class="font-bold text-white flex items-center gap-2">
                    ${item.name}
                    <span class="text-[9px] px-1.5 py-0.5 rounded border font-mono ${item.badgeColor}">${item.badge}</span>
                </div>
                <div class="text-[10px] text-gray-400 font-mono">${item.ticker} • ${item.category}</div>
            </div>
            <div class="text-right font-mono font-bold text-emerald-400">
                ${formatEUR(item.priceEUR)}
            </div>
        `;
        container.appendChild(div);
    });
}

function selectSearchResult(item) {
    document.getElementById('add-name').value = item.name;
    document.getElementById('add-ticker').value = item.ticker;
    document.getElementById('add-yahoo-ticker').value = item.yahooTicker || '';
    document.getElementById('add-isin').value = item.isin || '';

    let tags = item.tags;
    if (!tags) {
        tags = tagsFromLegacy(
            item.category,
            item.category === 'Actions/ETF' ? looksLikeETF(item.name, item.ticker) : false,
            item.name
        );
    }
    setFormTags(tags);
    updateTaxCategoryOptions(item.taxCategory || 'NON_CONCERNE');

    document.getElementById('add-cadran').value = item.cadran || 'HORS_GAVE';
    document.getElementById('add-zone').value = item.zone || 'UE';
    updateEnvelopeDetails();

    if (item.priceEUR > 0) {
        document.getElementById('add-price').value = item.priceEUR;
        document.getElementById('add-value').value = item.priceEUR;
    }

    document.getElementById('search-results-container').classList.add('hidden');
}

// =====================================================================
// VENDRE UN ACTIF (flux en 2 étapes : date, puis actif)
// =====================================================================
function openSellAssetModal() {
    document.getElementById('sell-date-input').value = new Date().toISOString().slice(0, 10);
    document.getElementById('sell-step-1').classList.remove('hidden');
    document.getElementById('sell-step-2').classList.add('hidden');
    document.getElementById('modal-sell-asset').classList.remove('hidden');
}

function goToSellStep2() {
    const saleDate = document.getElementById('sell-date-input').value;
    if (!saleDate) { alert('Choisissez une date de vente.'); return; }
    pendingSellDate = saleDate;
    document.getElementById('sell-date-label').innerText = new Date(saleDate).toLocaleDateString('fr-FR');

    const saleTime = new Date(saleDate).getTime();
    const eligible = assets.filter(a => {
        const buyDate = a.purchaseDate
            ? new Date(a.purchaseDate)
            : (a.buys && a.buys[0] ? parseFlexDate(a.buys[0].date) : null);
        return buyDate && buyDate.getTime() <= saleTime;
    });

    const list = document.getElementById('sell-asset-list');
    list.innerHTML = eligible.length ? eligible.map(a => `
        <div onclick="selectAssetToSell(${a.id})" class="clickable-row flex justify-between items-center p-2.5 bg-gray-950 border border-gray-800 rounded-lg cursor-pointer hover:border-rose-700">
            <div>
                <div class="font-bold text-white">${a.name}</div>
                <div class="text-[10px] text-gray-500 font-mono">${a.ticker} • Qté ${a.qty} • Frais ${formatEUR(a.frais || 0)}</div>
            </div>
            <div class="text-right font-mono"><div class="font-bold text-white">${formatEUR(a.value)}</div></div>
        </div>`).join('')
        : '<div class="text-gray-500 italic text-center py-4">Aucun actif acheté à cette date ou avant.</div>';

    document.getElementById('sell-step-1').classList.add('hidden');
    document.getElementById('sell-step-2').classList.remove('hidden');
}

function selectAssetToSell(assetId) {
    closeModal('modal-sell-asset');
    openAddCessionModal();
    document.getElementById('cession-source-asset').value = assetId;
    prefillCessionFromAsset();
    document.getElementById('cession-date-vente').value = pendingSellDate;
    updateCessionWarnings();
}

// =====================================================================
// FORMULAIRE DE CESSION
// =====================================================================
function openAddCessionModal() {
    document.getElementById('cession-edit-id').value = '';
    document.getElementById('modal-cession-title').innerHTML =
        '<i class="fa-solid fa-file-invoice-dollar text-indigo-400"></i> Ajouter une Cession';
    document.querySelector('#modal-add-cession button[type="submit"]').innerText = 'Enregistrer la Cession';

    const sourceSelect = document.getElementById('cession-source-asset');
    sourceSelect.innerHTML = '<option value="">-- Saisie libre --</option>' +
        assets.map(a => `<option value="${a.id}">${a.name} (${a.ticker})</option>`).join('');
    sourceSelect.value = '';

    populateCessionEnvelopeOptions();
    document.getElementById('cession-type').value = 'ACTION_ETF';
    setCessionSubtype('ACTION');
    document.getElementById('cession-name').value = '';
    document.getElementById('cession-date-vente').value = new Date().toISOString().slice(0, 10);
    document.getElementById('cession-date-achat').value = '';
    document.getElementById('cession-prix-vente').value = '';
    document.getElementById('cession-prix-achat').value = '';
    document.getElementById('cession-qty').value = '';
    document.getElementById('cession-qty').oninput = onCessionQtyChange;
    document.getElementById('cession-prix-vente').oninput = updateCessionUnitPrices;
    document.getElementById('cession-prix-achat').oninput = updateCessionUnitPrices;
    const hint = document.getElementById('cession-qty-hint');
    if (hint) hint.innerText = '';
    const venteUnitEl = document.getElementById('cession-prix-vente-unit');
    const achatUnitEl = document.getElementById('cession-prix-achat-unit');
    if (venteUnitEl) venteUnitEl.innerText = '— €/unité';
    if (achatUnitEl) achatUnitEl.innerText = '— €/unité';
    document.getElementById('cession-frais').value = 0;
    document.getElementById('cession-avant-2018').checked = false;
    document.getElementById('cession-enveloppe').value = 'CTO';
    document.getElementById('cession-enveloppe-date').value = '';
    document.getElementById('cession-zone').value = 'UE';
    document.getElementById('cession-coupons').value = 0;

    toggleCessionFieldsByType();
    document.getElementById('modal-add-cession').classList.remove('hidden');
}

function prefillCessionFromAsset() {
    const id = parseFloat(document.getElementById('cession-source-asset').value);
    if (!id) return;
    const asset = assets.find(a => a.id === id);
    if (!asset) return;

    // Un titre financier (même un "ETF Or") est taxé comme valeur mobilière ;
    // seul l'or physique suit le régime des métaux.
    const security = isSecurityAsset(asset);
    const cessionType = (!security && METAL_TYPES.includes(asset.taxCategory))
        ? asset.taxCategory
        : (hasTag(asset, 'Crypto') && !security ? 'CRYPTO' : 'ACTION_ETF');

    document.getElementById('cession-type').value = cessionType;
    setCessionSubtype(
        hasTag(asset, 'Obligation') ? 'OBLIGATION'
        : (hasTag(asset, 'ETF') ? 'ETF' : 'ACTION')
    );
        document.getElementById('cession-name').value = asset.name;

    // Quantité à vendre : pré-remplir avec la totalité détenue (mais l'utilisateur peut réduire)
    const qtyInput = document.getElementById('cession-qty');
    const qtyHint  = document.getElementById('cession-qty-hint');
    if (qtyInput) {
        qtyInput.value = asset.qty;
        qtyInput.max = asset.qty;
    }
    if (qtyHint) {
        qtyHint.innerText = `Détenu : ${asset.qty} unité(s)`;
    }

    // PRU moyen pondéré (méthode fiscale française) recalculé depuis les lots
    const pru = computePRUFromLots(asset);
    const prixAchatUnitaire = pru > 0 ? pru : (asset.qty > 0 ? (asset.invested / asset.qty) : 0);
    document.getElementById('cession-prix-achat').value = (prixAchatUnitaire * asset.qty).toFixed(2);
    document.getElementById('cession-prix-vente').value = (asset.value || 0).toFixed(2);
    document.getElementById('cession-enveloppe').value = SECURITY_ENVELOPES.includes(asset.envelope)
        ? asset.envelope
        : 'CTO';
    document.getElementById('cession-enveloppe-date').value = asset.envelopeOpenedAt || '';
    document.getElementById('cession-zone').value = asset.zone || 'UE';

        const buyDate = asset.buys && asset.buys[0] ? parseFlexDate(asset.buys[0].date) : null;
    if (buyDate) document.getElementById('cession-date-achat').value = buyDate.toISOString().slice(0, 10);

    toggleCessionFieldsByType();

    // Affiche immédiatement les prix unitaires (à partir des champs)
    updateCessionUnitPrices();
}

function toggleCessionFieldsByType() {
    const type = document.getElementById('cession-type').value;
    const isSec = type === 'ACTION_ETF';
    document.getElementById('cession-subtype-wrap').classList.toggle('hidden', !isSec);
    document.getElementById('cession-enveloppe-wrap').classList.toggle('hidden', !isSec);
    if (!isSec) document.getElementById('cession-enveloppe').value = 'CTO';
    onCessionSubTypeChange();
}

function setCessionSubtype(value) {
    document.getElementById('cession-subtype').value = value;
    const radio = document.querySelector(`input[name="cession-subtype-radio"][value="${value}"]`);
    if (radio) radio.checked = true;
}

function populateCessionEnvelopeOptions() {
    document.getElementById('cession-enveloppe').innerHTML =
        SECURITY_ENVELOPES.map(c => `<option value="${c}">${ENVELOPPES[c].label}</option>`).join('');
}

// Recalcule les prix d'achat/vente totaux quand on change la quantité vendue
function onCessionQtyChange() {
    const qtyInput = document.getElementById('cession-qty');
    const qty = parseFloat(qtyInput.value) || 0;
    const sourceId = parseFloat(document.getElementById('cession-source-asset').value);
    if (!sourceId) return;
    const asset = assets.find(a => a.id === sourceId);
    if (!asset) return;

    const maxQty = asset.qty;
    const unitValue = asset.qty > 0 ? (asset.value / asset.qty) : 0;
    const pru = computePRUFromLots(asset) || (asset.qty > 0 ? asset.invested / asset.qty : 0);

    // Mise à jour des prix totaux
    document.getElementById('cession-prix-achat').value = (pru * qty).toFixed(2);
    document.getElementById('cession-prix-vente').value = (unitValue * qty).toFixed(2);

        // Hint
    const hint = document.getElementById('cession-qty-hint');
    if (hint) {
        if (qty > maxQty) {
            hint.innerHTML = `<span class="text-rose-400">⚠ Dépasse le détenu (${maxQty})</span>`;
        } else if (qty < maxQty) {
            hint.innerHTML = `Détenu : ${maxQty} · Vente partielle (${(maxQty - qty).toFixed(2)} resteront)`;
        } else {
            hint.innerHTML = `Vente totale · Détenu : ${maxQty}`;
        }
    }

    // Affiche aussi les prix unitaires
    updateCessionUnitPrices();
}

// Recalcule les prix unitaires AFFICHÉS à partir des valeurs RÉELLES des champs
// (et non des valeurs théoriques), pour qu'ils suivent toute saisie manuelle.
function updateCessionUnitPrices() {
    const qty = parseFloat(document.getElementById('cession-qty').value) || 0;
    const venteTotale = parseFloat(document.getElementById('cession-prix-vente').value) || 0;
    const achatTotal  = parseFloat(document.getElementById('cession-prix-achat').value) || 0;

    const venteUnitEl = document.getElementById('cession-prix-vente-unit');
    const achatUnitEl = document.getElementById('cession-prix-achat-unit');

    if (venteUnitEl) {
        venteUnitEl.innerText = (qty > 0 && venteTotale > 0)
            ? `${formatEUR(venteTotale / qty)} / unité`
            : '— €/unité';
    }
    if (achatUnitEl) {
        achatUnitEl.innerText = (qty > 0 && achatTotal > 0)
            ? `${formatEUR(achatTotal / qty)} / unité`
            : '— €/unité';
    }
}

function onCessionSubTypeChange() {
    const sub = document.getElementById('cession-subtype').value;
    const isSec = document.getElementById('cession-type').value === 'ACTION_ETF';
    // Abattement pour durée de détention : uniquement actions acquises avant 2018 (pas ETF ni obligations)
    document.getElementById('cession-before2018-wrap').classList.toggle('hidden', !(isSec && sub === 'ACTION'));
    document.getElementById('cession-coupons-wrap').classList.toggle('hidden', !(isSec && sub === 'OBLIGATION'));
    onCessionEnvelopeChange();
}

function onCessionEnvelopeChange() {
    const env = document.getElementById('cession-enveloppe').value;
    document.getElementById('cession-enveloppe-date-wrap').classList.toggle('hidden', !ENVELOPES_WITH_DATE.includes(env));
    updateCessionWarnings();
}

// Conservée par compat : certains handlers HTML l'appellent encore
function toggleCessionEnveloppeDate() {
    const env = document.getElementById('cession-enveloppe').value;
    document.getElementById('cession-enveloppe-date-wrap').classList.toggle('hidden', env === 'CTO');
}

function updateCessionWarnings() {
    const box = document.getElementById('cession-warning');
    const type = document.getElementById('cession-type').value;
    if (type !== 'ACTION_ETF') { box.classList.add('hidden'); box.innerHTML = ''; return; }

    const env    = document.getElementById('cession-enveloppe').value;
    const sub    = document.getElementById('cession-subtype').value;
    const opened = document.getElementById('cession-enveloppe-date').value;
    const sale   = document.getElementById('cession-date-vente').value;
    const envYears = opened && sale ? computeHoldingYears(opened, sale) : null;
    const warns = [];

    if (env === 'PEA' || env === 'PEA_PME') {
        if (!opened) warns.push('Renseignez la date d\'ouverture du PEA pour appliquer le bon régime (seuil de 5 ans).');
        else if (envYears < 5) warns.push(`PEA de ${envYears.toFixed(1)} an(s) (&lt; 5 ans) : un retrait entraîne en principe la clôture du plan et l'imposition des gains au PFU (30 %).`);
        if (document.getElementById('cession-zone').value === 'HORS_UE') warns.push('Un titre coté hors UE/EEE n\'est pas éligible au PEA : vérifiez l\'enveloppe choisie.');
        if (sub === 'OBLIGATION') warns.push('Les obligations ne sont normalement pas éligibles au PEA.');
    } else if (env === 'AV') {
        if (!opened) warns.push('Renseignez la date d\'ouverture du contrat pour appliquer le bon régime (seuil de 8 ans).');
        else if (envYears < 8) warns.push(`Contrat de ${envYears.toFixed(1)} an(s) (&lt; 8 ans) : pas d'abattement annuel, gains imposés au PFU (30 %).`);
        else warns.push('Contrat ≥ 8 ans : l\'abattement annuel (4 600 € / 9 200 € en couple) est partagé entre TOUS vos retraits Assurance-Vie de l\'année.');
    } else if (env === 'PER') {
        warns.push('PER : estimation simplifiée (régime Assurance-Vie appliqué par approximation). À vérifier selon le mode de sortie et la déductibilité des versements.');
    }
    box.innerHTML = warns.map(w => `<div>⚠ ${w}</div>`).join('');
    box.classList.toggle('hidden', warns.length === 0);
}

function handleAddCession(e) {
    e.preventDefault();
    const editId = document.getElementById('cession-edit-id').value;
    const type   = document.getElementById('cession-type').value;

    // Lecture des valeurs saisies
    let prixVente = parseFloat(document.getElementById('cession-prix-vente').value) || 0;
    let prixAchat = parseFloat(document.getElementById('cession-prix-achat').value) || 0;
    const frais   = parseFloat(document.getElementById('cession-frais').value) || 0;
    const sourceAssetIdForCalc = parseFloat(document.getElementById('cession-source-asset').value);
    const qtySaisie = parseFloat(document.getElementById('cession-qty').value) || 0;

    // Recalcul défensif : si la vente vient d'un actif existant, on force la cohérence
    // Prix d'achat = PRU moyen × quantité vendue
    if (!editId && sourceAssetIdForCalc && qtySaisie > 0) {
        const srcAsset = assets.find(a => a.id === sourceAssetIdForCalc);
        if (srcAsset) {
            const pru = computePRUFromLots(srcAsset) || (srcAsset.qty > 0 ? srcAsset.invested / srcAsset.qty : 0);
            prixAchat = Math.round(pru * qtySaisie * 100) / 100;
        }
    }

    const cession = normalizeCession({
        id: editId ? parseFloat(editId) : Date.now(),
        type,
        subType: type === 'ACTION_ETF' ? document.getElementById('cession-subtype').value : undefined,
        name: document.getElementById('cession-name').value,
        dateVente: document.getElementById('cession-date-vente').value,
        dateAchat: document.getElementById('cession-date-achat').value,
        prixVente: prixVente,
        prixAchat: prixAchat,
        frais: frais,
        avant2018: document.getElementById('cession-avant-2018').checked,
        envelope: type === 'ACTION_ETF' ? document.getElementById('cession-enveloppe').value : '',
        envelopeOpenedAt: document.getElementById('cession-enveloppe-date').value,
        zone: document.getElementById('cession-zone').value,
        coupons: parseFloat(document.getElementById('cession-coupons').value) || 0
    });

    

        if (editId) {
        const idx = cessions.findIndex(c => c.id === parseFloat(editId));
        if (idx > -1) cessions[idx] = cession;
    } else {
        cessions.push(cession);
    }

    // Si la cession provient du flux "Vendre un actif", consommer les lots en FIFO
    const sourceAssetId = parseFloat(document.getElementById('cession-source-asset').value);
    if (!editId && sourceAssetId) {
        const asset = assets.find(a => a.id === sourceAssetId);
        if (asset) {
            const qtyToSell = parseFloat(document.getElementById('cession-qty').value) || asset.qty;

            if (qtyToSell > asset.qty) {
                alert(`Quantité invalide : ${qtyToSell} demandées, ${asset.qty} disponibles.`);
                return;
            }

            // Consommation FIFO
            const fifo = consumeFIFO(asset, qtyToSell);
            if (fifo.error) {
                alert(fifo.error);
                return;
            }

            // Recalcule invested / frais / qty sur les lots restants
            syncAssetFromLots(asset);

            // Si plus rien, on supprime l'actif
            if (asset.qty <= 0.0001) {
                if (confirm(`Vente totale de "${asset.name}". L'actif sera retiré du portefeuille.`)) {
                    assets = assets.filter(a => a.id !== sourceAssetId);
                    saveToStorage();
                }
            } else {
                // Vente partielle : l'actif reste
                // - sa valeur de marché est réduite proportionnellement à la quantité vendue
                // - l'investi et le frais sont déjà recalculés par syncAssetFromLots
                const totalQtyAvantVente = asset.qty + qtyToSell;  // qty restante + qty vendue
                const ratioRestant = totalQtyAvantVente > 0 ? (asset.qty / totalQtyAvantVente) : 0;
                asset.value = Math.round(asset.value * ratioRestant * 100) / 100;
                upsertTodayHistoryPoint(asset, asset.value, asset.invested);
                saveToStorage();
            }
        }
    }
    
        saveCessions();
        closeModal('modal-add-cession');
        calculateAnneeN1();
        renderCessionsTable(cessionFilter);
        refreshAllUI();
        e.target.reset();
    }

function editCession(id) {
    const c = cessions.find(x => x.id === id);
    if (!c) return;

    document.getElementById('cession-edit-id').value = c.id;
    document.getElementById('modal-cession-title').innerHTML = '<i class="fa-solid fa-pen text-indigo-400"></i> Modifier la Cession';
    document.querySelector('#modal-add-cession button[type="submit"]').innerText = 'Enregistrer les Modifications';

    const sourceSelect = document.getElementById('cession-source-asset');
    sourceSelect.innerHTML = '<option value="">-- Saisie libre --</option>' +
        assets.map(a => `<option value="${a.id}">${a.name} (${a.ticker})</option>`).join('');
    sourceSelect.value = '';

    populateCessionEnvelopeOptions();
    document.getElementById('cession-type').value = c.type;
    setCessionSubtype(c.subType || 'ACTION');
    document.getElementById('cession-name').value = c.name;
    document.getElementById('cession-date-vente').value = c.dateVente || '';
    document.getElementById('cession-date-achat').value = c.dateAchat || '';
    document.getElementById('cession-prix-vente').value = c.prixVente;
    document.getElementById('cession-prix-achat').value = c.prixAchat;
    document.getElementById('cession-frais').value = c.frais || 0;
    document.getElementById('cession-avant-2018').checked = !!c.avant2018;
    document.getElementById('cession-enveloppe').value = c.envelope || 'CTO';
    document.getElementById('cession-enveloppe-date').value = c.envelopeOpenedAt || '';
    document.getElementById('cession-zone').value = c.zone || 'UE';
    document.getElementById('cession-coupons').value = c.coupons || 0;

    toggleCessionFieldsByType();
    document.getElementById('modal-add-cession').classList.remove('hidden');
}

function deleteCession(id) {
    if (confirm('Supprimer cette cession ?')) {
        cessions = cessions.filter(c => c.id !== id);
        saveCessions();
        calculateAnneeN1();
        renderCessionsTable(cessionFilter);
    }
}

// =====================================================================
// RÉCAPITULATIF FISCAL (modal imprimable)
// =====================================================================
function openRecapModal() {
    const securities  = cessions.filter(c => (c.type === 'ACTION_ETF' && (!c.envelope || c.envelope === 'CTO')) || c.type === 'CRYPTO');
    const metals      = cessions.filter(c => METAL_TYPES.includes(c.type));
    const enveloppes  = cessions.filter(c => c.type === 'ACTION_ETF' && c.envelope && c.envelope !== 'CTO');
    const regimeLabel = taxRegimeMode === 'PFU'
        ? 'PFU / Flat Tax (30%)'
        : `Barème Progressif (TMI ${(taxTMI * 100).toFixed(0)}%)`;
    const impotEstime    = document.getElementById('cession-stat-impot-estime').innerText;
    const metalsTax      = document.getElementById('decomp-metaux-total').innerText;
    const enveloppesTax  = document.getElementById('decomp-enveloppes-total').innerText;

    document.getElementById('modal-recap-body').innerHTML = `
        <div class="p-3 bg-gray-950 rounded-lg border border-gray-800">
            <div class="text-gray-400 text-[10px] uppercase mb-1 font-sans">Régime retenu (CTO — Titres & Crypto)</div>
            <div class="text-white font-bold">${regimeLabel}</div>
        </div>
        <div class="grid grid-cols-3 gap-3">
            <div class="p-3 bg-gray-950 rounded-lg border border-gray-800">
                <div class="text-gray-400 text-[10px] uppercase mb-1 font-sans">Impôt CTO</div>
                <div class="text-white font-bold text-base">${impotEstime}</div>
            </div>
            <div class="p-3 bg-gray-950 rounded-lg border border-gray-800">
                <div class="text-gray-400 text-[10px] uppercase mb-1 font-sans">Impôt Métaux/Jetons</div>
                <div class="text-white font-bold text-base">${metalsTax}</div>
            </div>
            <div class="p-3 bg-gray-950 rounded-lg border border-gray-800">
                <div class="text-gray-400 text-[10px] uppercase mb-1 font-sans">Impôt PEA/AV/PER</div>
                <div class="text-white font-bold text-base">${enveloppesTax}</div>
            </div>
        </div>
        <div class="text-[10px] text-gray-500 font-sans leading-relaxed">Basé sur ${securities.length} cession(s) CTO/crypto, ${metals.length} cession(s) de métaux/jetons et ${enveloppes.length} cession(s) en enveloppe PEA/Assurance-Vie/PER enregistrée(s) dans le registre. Cette estimation est fournie à titre indicatif et ne remplace pas les cases précises de votre déclaration de revenus (2042, 2086, 2074...) ni l'avis d'un professionnel — en particulier pour le PER, dont la fiscalité dépend fortement du mode de sortie et de la déductibilité des versements.</div>
        <button onclick="window.print()" class="w-full mt-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center justify-center gap-2 font-sans"><i class="fa-solid fa-print"></i> Imprimer / Exporter en PDF</button>
    `;
    document.getElementById('modal-recap').classList.remove('hidden');
}

// =====================================================================
// SIMULATEUR FISCALITÉ MÉTAUX (indépendant du registre)
// =====================================================================
function calculateMetalTaxSim() {
    const sellPrice = parseFloat(document.getElementById('sim-sell-price').value) || 0;
    const buyPrice  = parseFloat(document.getElementById('sim-buy-price').value)  || 0;
    const years     = parseInt(document.getElementById('sim-years').value)       || 0;
    const type      = document.getElementById('sim-type').value;

    const box = document.getElementById('sim-result-box');
    const grossPV = Math.max(0, sellPrice - buyPrice);
    let html = '';

    if (type === 'JETON') {
        // Jetons : fiscalité bijoux/objets de collection (Art. 150 VJ CGI)
        if (sellPrice <= 5000) {
            html = `
                <div class="p-3 bg-emerald-950/60 border border-emerald-700/50 rounded-lg text-emerald-300">
                    <i class="fa-solid fa-circle-check text-emerald-400 mr-2"></i>
                    <b>EXONÉRATION TOTALE D'IMPÔT !</b> (Cession ≤ 5 000 € pour les Jetons sans cours légal).
                    <br><span class="text-[11px] text-emerald-400">Impôt dû : <b>0,00 €</b> (Économie totale vs TFMP Or d'investissement).</span>
                </div>`;
        } else {
            const tfop = sellPrice * 0.065; // 6% + 0.5% CRDS
            html = `
                <div class="p-3 bg-amber-950/60 border border-amber-700/50 rounded-lg text-amber-300">
                    <i class="fa-solid fa-triangle-exclamation mr-2"></i>
                    Prix > 5 000 € : Application de la Taxe Forfaitaire Objets de Collection (TFOP 6,5%) = <b>${formatEUR(tfop)}</b>.
                </div>`;
        }
    } else {
        const tfmp = sellPrice * 0.115; // 11% + 0.5% CRDS

        // TPV réelle avec abattement
        let abattementPct = 0;
        if (years >= 22) abattementPct = 1.0;
        else if (years > 2) abattementPct = (years - 2) * 0.05;

        const netPV  = grossPV * (1 - abattementPct);
        const tpvTax = netPV * 0.362; // 19% + 17.2% PS

        html = `
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div class="p-3 bg-gray-900 border border-gray-800 rounded-lg">
                    <div class="text-gray-400 font-bold mb-1">Option 1 : Taxe Forfaitaire TFMP (11,5%)</div>
                    <div class="text-base font-bold text-rose-400">${formatEUR(tfmp)}</div>
                    <div class="text-[10px] text-gray-500 mt-1">Calculée sur le prix total de vente.</div>
                </div>
                <div class="p-3 bg-gray-900 border border-gray-800 rounded-lg">
                    <div class="text-gray-400 font-bold mb-1">Option 2 : Plus-Value Réelle TPV (36,2%)</div>
                    <div class="text-base font-bold text-emerald-400">${formatEUR(tpvTax)}</div>
                    <div class="text-[10px] text-gray-500 mt-1">Abattement de ${(abattementPct * 100).toFixed(0)}% (Détention de ${years} ans).</div>
                </div>
            </div>`;
    }

    box.innerHTML = html;
}