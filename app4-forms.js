// =====================================================================
// app4-forms.js — FORMULAIRES (actif, cession, recherche, vente)
// Dépend de : app1-core.js, app2-ui.js
// =====================================================================

// Flag « champ Valeur Actuelle touché » — déclaré tôt pour éviter toute
// ambiguïté sur sa portée (utilisé dans openAddAssetModal/openEditAssetModal).
let _addValueTouched = false;

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
    document.getElementById('add-reference').value = '';
    document.getElementById('add-cadran').value = 'OR';
    document.getElementById('add-value-wrap').classList.add('hidden');
    document.getElementById('add-value').removeAttribute('required');
    document.getElementById('add-value').value = '';
    _addValueTouched = false;
    document.getElementById('add-purchase-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('add-qty').value = 1;
    setBrokerValue('');
    document.getElementById('add-bond-coupon').value = '';
    document.getElementById('add-bond-maturity').value = '';
    document.getElementById('add-bond-rating').value = '';
    document.getElementById('add-bond-nominal').value = 1000;
    document.getElementById('add-valuation-mode').value = 'MANUAL';
    document.getElementById('add-envelope-date').value = '';
    document.getElementById('add-zone').value = 'UE';

    // Devise — reset à EUR par défaut (Chantier 1.2)
    const curSel = document.getElementById('add-currency');
    if (curSel) curSel.value = 'EUR';
    const fxInput = document.getElementById('add-fx-rate');
    if (fxInput) fxInput.value = '';
    _addFxRateTouched = false;
    onCurrencyChange();

    // Score ESG — reset (Chantier §3)
    const esgInput = document.getElementById('add-esg-score');
    if (esgInput) esgInput.value = '';
    updateEsgPreview();

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
    document.getElementById('add-reference').value = (asset.lots || []).map(l => l.reference).filter(Boolean).join(', ');
    setFormTags(asset.categories);
    updateTaxCategoryOptions(asset.taxCategory || 'NON_CONCERNE');
    document.getElementById('add-cadran').value = asset.cadrans.primary;
    document.getElementById('add-qty').value = asset.qty;
    document.getElementById('add-frais').value = asset.frais || 0;
    document.getElementById('add-value-wrap').classList.remove('hidden');
    document.getElementById('add-value').setAttribute('required', 'required');
        _addValueTouched = true;   // en édition, la valeur existante ne doit pas être écrasée
    document.getElementById('add-value').value = asset.qty
        ? (asset.value / asset.qty).toFixed(4)
        : asset.value;
    document.getElementById('add-price').value = asset.qty
        ? ((asset.invested - (asset.frais || 0)) / asset.qty).toFixed(4)
        : asset.invested;
    document.getElementById('add-purchase-date').value = asset.purchaseDate || '';
    setBrokerValue(asset.broker || '');

    document.getElementById('add-valuation-mode').value = asset.valuationMode || 'MANUAL';
    document.getElementById('add-bond-coupon').value = asset.coupon !== undefined ? (asset.coupon * 100).toFixed(3) : '';
    document.getElementById('add-bond-maturity').value = asset.maturity || '';
    document.getElementById('add-bond-rating').value = asset.rating || '';
    document.getElementById('add-bond-nominal').value = asset.nominal !== undefined ? asset.nominal : 1000;

    updateAssetFormSections(asset.envelope);
    document.getElementById('add-envelope-date').value = asset.envelopeOpenedAt || '';
    document.getElementById('add-zone').value = asset.zone || 'UE';
    updateEnvelopeDetails();

    // Devise — restaure la devise et le taux d'achat (Chantier 1.2)
    const curSel = document.getElementById('add-currency');
    if (curSel) curSel.value = asset.currency || 'EUR';
    const fxInput = document.getElementById('add-fx-rate');
    if (fxInput) {
        // En édition, on pré-remplit avec la valeur stockée SANS lancer de fetch
        fxInput.value = asset.fxRateAtPurchase ? asset.fxRateAtPurchase.toFixed(6) : '';
    }
    // Marque comme "touche" pour empêcher un fetch automatique d'écraser la valeur
    _addFxRateTouched = !!(asset.fxRateAtPurchase);
    onCurrencyChange();

    // Score ESG — préremplit avec la valeur stockée (Chantier §3)
    const esgInput = document.getElementById('add-esg-score');
    if (esgInput) {
        esgInput.value = Number.isFinite(asset.esgScore) ? asset.esgScore : '';
    }
    updateEsgPreview();

    document.getElementById('modal-add-asset-title').innerHTML = '<i class="fa-solid fa-pen text-emerald-400"></i> Modifier l\'Actif';
    document.getElementById('modal-add-asset-submit-btn').innerText = 'Enregistrer les Modifications';
    document.getElementById('search-results-container').classList.add('hidden');
    document.getElementById('add-search-input').value = '';
    document.getElementById('modal-add-asset').classList.remove('hidden');
}

// ---------------------------------------------------------------------
// SCORE ESG — aperçu en direct dans le formulaire (Chantier §3)
// ---------------------------------------------------------------------
// Affiche le grade correspondant au score saisi + indique si un score
// catalogue existe déjà pour ce ticker.
function updateEsgPreview() {
    const input = document.getElementById('add-esg-score');
    const previewEl = document.getElementById('add-esg-preview');
    const hintEl = document.getElementById('add-esg-catalog-hint');
    const tickerInput = document.getElementById('add-ticker');
    const ticker = (tickerInput?.value || '').toUpperCase().trim();

    // Aperçu du grade si score saisi
    const raw = parseFloat(input?.value);
    if (previewEl) {
        if (Number.isFinite(raw) && raw >= 0 && raw <= 100 && typeof esgScoreToGrade === 'function') {
            const grade = esgScoreToGrade(raw);
            const styles = (typeof ESG_GRADE_STYLES !== 'undefined' && ESG_GRADE_STYLES[grade]) || null;
            const color = styles ? styles.fg : 'text-gray-400';
            previewEl.className = `text-[11px] font-bold ${color} ml-2`;
            previewEl.innerText = `→ ${grade}`;
        } else if (input && input.value) {
            previewEl.className = 'text-[11px] font-bold text-rose-400 ml-2';
            previewEl.innerText = '→ valeur invalide (0-100)';
        } else {
            previewEl.className = 'text-[11px] font-bold text-gray-500 ml-2';
            previewEl.innerText = '';
        }
    }

    // Hint : score catalogue existant
    if (hintEl && typeof ESG_CATALOG !== 'undefined') {
        if (!ticker) {
            hintEl.innerHTML = '';
            return;
        }
        const baseTicker = ticker.replace(/[.\-].*$/, '');
        const cat = ESG_CATALOG[ticker] || ESG_CATALOG[baseTicker];
        if (cat) {
            hintEl.innerHTML = `<i class="fa-solid fa-leaf text-emerald-400 mr-1"></i>Score catalogue disponible : <b>${cat.score}</b> (${cat.grade}) — ${escapeHTML(cat.source)}. Laissez vide pour l'utiliser.`;
        } else {
            hintEl.innerHTML = '';
        }
    }
}

// ---------------------------------------------------------------------
// Recalcul automatique du total (quantité × prix)
// Le flag _addValueTouched empêche d'écraser une valeur saisie
// intentionnellement par l'utilisateur (y compris 0).
// ---------------------------------------------------------------------
function recalculateAddTotals() {
    if (_addValueTouched) return;
    const price = parseFloat(document.getElementById('add-price').value) || 0;
    const valueInput = document.getElementById('add-value');
    if (valueInput && !valueInput.value) {
        valueInput.value = price.toFixed(4);
    }
}

// ---------------------------------------------------------------------
// DEVISE — gestion du formulaire d'ajout/édition (Chantier 1.2)
// ---------------------------------------------------------------------
// Affiche ou masque le bloc "Taux de change" selon la devise choisie, met
// à jour les avertissements, et récupère automatiquement un taux indicatif
// via l'API Frankfurter (async) si la devise n'est pas EUR.
// ---------------------------------------------------------------------

// Flag pour ne PAS réécraser un taux saisi manuellement par l'utilisateur
// quand l'API répond (course async).
let _addFxRateTouched = false;

function onCurrencyChange() {
    const sel = document.getElementById('add-currency');
    const wrap = document.getElementById('add-fx-rate-wrap');
    const input = document.getElementById('add-fx-rate');
    const hint = document.getElementById('add-fx-rate-hint');
    const warning = document.getElementById('add-currency-warning');
    if (!sel || !wrap || !input || !hint || !warning) return;

    const cur = (sel.value || 'EUR').toUpperCase();

    if (cur === 'EUR') {
        wrap.classList.add('hidden');
        warning.classList.add('hidden');
        input.value = '';
        _addFxRateTouched = false;
        return;
    }

    wrap.classList.remove('hidden');
    warning.classList.remove('hidden');

    // Avertissements généraux
    const warns = [
        `Les montants « Prix d'achat » et « Valeur actuelle » doivent être saisis en <b>EUR</b>. ` +
        `La devise sert à afficher la valeur native et à calculer l'exposition.`,
        `Le taux de change est figé à la date d'achat : il sert à reconstituer la <b>valeur native</b> ` +
        `(valeur actuelle ÷ taux courant) et à mesurer l'effet de change.`
    ];
    warning.innerHTML = warns.map(w => `<div><i class="fa-solid fa-circle-info mr-1"></i>${w}</div>`).join('');

    // Si l'utilisateur a déjà saisi un taux à la main, ne pas écraser
    if (_addFxRateTouched && input.value) return;

    // Sinon, on tente de récupérer un taux auto (taux du jour si création,
    // taux de la date d'achat si elle est déjà renseignée).
    const purchaseDate = document.getElementById('add-purchase-date')?.value || '';
    _autoFillFxRate(cur, purchaseDate);
}

// Récupère un taux indicatif (async) et remplit le champ s'il n'a pas été
// touché entre-temps. Affiche l'état dans le hint.
async function _autoFillFxRate(currency, dateISO) {
    const input = document.getElementById('add-fx-rate');
    const hint = document.getElementById('add-fx-rate-hint');
    if (!input || !hint) return;

    hint.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-[9px]"></i> Récupération du taux…';

    try {
        // On demande le taux à la date d'achat si dispo, sinon le plus récent
        let rate = null;
        if (typeof getFxRateToEUR === 'function') {
            rate = await getFxRateToEUR(currency, dateISO || null);
        }

        if (rate === null || !Number.isFinite(rate) || rate <= 0) {
            hint.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-amber-400 text-[9px]"></i> Taux indisponible — saisissez-le manuellement.';
            return;
        }

        // Ne pas écraser une saisie manuelle faite pendant l'attente API
        if (_addFxRateTouched && input.value) return;

        input.value = rate.toFixed(6);
        const src = (typeof FX_SUPPORTED !== 'undefined' && FX_SUPPORTED.includes(currency))
            ? 'Frankfurter (BCE)'
            : 'fallback local';
        hint.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-400 text-[9px]"></i> Taux indicatif (${src}) : 1 ${currency} ≈ ${rate.toFixed(4)} €`;
    } catch (err) {
        hint.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-amber-400 text-[9px]"></i> Erreur : ' + (err.message || 'inconnue') + ' — saisie manuelle requise.';
    }
}

// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// VALIDATION DE COHÉRENCE (Partie 5)
// ---------------------------------------------------------------------
// currentId : id de l'actif en cours d'édition (null en création).
// Permet d'exclure l'actif lui-même de la détection de doublon ISIN.
function validateAssetCoherence(fields, currentId = null) {
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
        const duplicate = assets.find(a => a.isin === fields.isin && a.id !== currentId);
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
    const referenceRaw = (document.getElementById('add-reference').value || '').trim();

    // Devise (Chantier 1.2)
    const currency = (document.getElementById('add-currency')?.value || 'EUR').toUpperCase();
    let fxRateAtPurchase = 0;
    if (currency !== 'EUR') {
        const fxRaw = parseFloat(document.getElementById('add-fx-rate')?.value);
        if (!Number.isFinite(fxRaw) || fxRaw <= 0) {
            alert(`Vous avez choisi la devise ${currency} mais le taux de change est vide ou invalide.\n\n` +
                  `Saisissez un taux strictement positif (ex : 0.92 pour USD→EUR), ou repassez en EUR.`);
            return;
        }
        fxRateAtPurchase = fxRaw;
    }

    // Score ESG (Chantier §3) — saisie manuelle optionnelle
    const esgRaw = parseFloat(document.getElementById('add-esg-score')?.value);
    const esgScore = Number.isFinite(esgRaw) && esgRaw >= 0 && esgRaw <= 100 ? esgRaw : null;

    const fields = {
        name, ticker, isin, categories: tags, taxCategory,
        cadrans: { primary: primaryCadran, secondary: [] },
        qty, frais, invested, value,
        envelope, envelopeOpenedAt, zone, yahooTicker, valuationMode,
        purchaseDate, broker,
        currency,
        fxRateAtPurchase: currency !== 'EUR' ? fxRateAtPurchase : undefined,
        fxRateDate:       currency !== 'EUR' ? (purchaseDate || '') : undefined,
        esgScore:         esgScore   // null = utilise le catalogue automatique
    };

    if (editId) {
        const asset = assets.find(a => a.id === parseFloat(editId));
        if (asset) {
            Object.assign(asset, fields);
            delete asset.needsReclass;
            delete asset.reclassSuggestion;
            if (bond) Object.assign(asset, bond);
            else { delete asset.coupon; delete asset.maturity; delete asset.rating; delete asset.nominal; }
            normalizeAsset(asset);
            upsertTodayHistoryPoint(asset, value, invested);
        }
    } else {
        // Création des lots pour ce nouvel achat
        const references = referenceRaw
            ? referenceRaw.split(',').map(s => s.trim()).filter(Boolean)
            : [];

        let lots;
        if (references.length > 0) {
            const fraisParRef = frais / references.length;
            lots = references.map(ref => makeLot(
                purchaseDate || new Date().toISOString().slice(0, 10),
                1, price, fraisParRef, ref
            ));
            if (references.length !== qty) {
                if (!confirm(`Vous avez saisi ${references.length} référence(s) mais ${qty} unité(s).\n` +
                    `Chaque référence correspondra à 1 unité. Voulez-vous continuer ?`)) {
                    return;
                }
            }
        } else {
            lots = [makeLot(
                purchaseDate || new Date().toISOString().slice(0, 10),
                qty, price, frais, ''
            )];
        }

        // ⭐ NOUVEAU : détection d'un actif existant avec le même ISIN ou ticker
        const existing = assets.find(a => {
            // On ne fusionne que si même enveloppe fiscale aussi
            if ((a.envelope || '') !== (envelope || '')) return false;
            if (isin && a.isin && a.isin.toUpperCase() === isin.toUpperCase()) return true;
            if (!isin && a.ticker && a.ticker.toUpperCase() === ticker.toUpperCase()) return true;
            return false;
        });

        if (existing) {
            const msg = `Un actif "${existing.name}" (${existing.ticker}) existe déjà dans la même enveloppe.\n\n` +
                `• OK = AJOUTER cet achat comme un nouveau lot à l'actif existant (recommandé → 1 seule ligne)\n` +
                `• Annuler = CRÉER un actif séparé (2 lignes distinctes)`;

            if (confirm(msg)) {
                // Capturer la valeur unitaire marché AVANT modification
                const oldUnitValue = existing.qty > 0 ? (existing.value / existing.qty) : price;

                // Devise (Chantier 1.2) — on ne modifie la devise de l'actif
                // existant QUE si :
                //   • il était en EUR (devise par défaut historique) ET
                //   • l'utilisateur saisit une devise ≠ EUR
                // Sinon on respecte la devise d'origine pour ne pas fausser
                // l'historique de change déjà enregistré.
                if (currency !== 'EUR' && (existing.currency === 'EUR' || !existing.currency)) {
                    existing.currency = currency;
                    existing.fxRateAtPurchase = fxRateAtPurchase;
                    existing.fxRateDate = purchaseDate || '';
                }

                // Ajouter les nouveaux lots et le buy à l'actif existant
                existing.lots = (existing.lots || []).concat(lots);
                existing.buys = (existing.buys || []).concat([{
                    date: purchaseDateFR, type: 'Achat Additionnel',
                    qty, price, frais, total: invested,
                    reference: references.join(', ') || ''
                }]);

                // Recalculer qty / invested / frais depuis les lots
                syncAssetFromLots(existing);

                // Recalculer la valeur de marché : qty × valeur unitaire précédente
                existing.value = Math.round(existing.qty * oldUnitValue * 100) / 100;

                upsertTodayHistoryPoint(existing, existing.value, existing.invested);
                saveToStorage();
                closeModal('modal-add-asset');
                refreshAllUI();
                e.target.reset();
                document.getElementById('add-edit-id').value = '';
                return;
            }
        }

        // Création d'un actif séparé (nouveau ticker ou refus de fusion)
        const newAsset = Object.assign({
            id: Date.now(),
            buys: [{ date: purchaseDateFR, type: 'Achat Initial', qty, price, frais, total: invested, reference: references.join(', ') || '' }],
            history: [{ date: purchaseDateFR, value: invested, invested }],
            lots
        }, fields, bond || {});

        // Paper trading : tout nouvel actif créé pendant que le mode est actif
        // reçoit le flag `isPaper`. Il peut être promu en réel plus tard.
        if (paperMode) newAsset.isPaper = true;

        normalizeAsset(newAsset);
        syncAssetFromLots(newAsset);
        // La qty réelle peut différer de la qty saisie si le nombre de références
        // ne correspond pas (cf. confirm() ci-dessus). On réaligne `value` en conséquence.
        newAsset.value = newAsset.qty * unitValue;
        upsertTodayHistoryPoint(newAsset, newAsset.value, newAsset.invested);
        assets.push(newAsset);
    }


    const warnings = validateAssetCoherence(fields, editId ? parseFloat(editId) : null);
    if (warnings.length && !confirm('Avertissements :\n\n' + warnings.join('\n') + '\n\nContinuer quand même ?')) {
        return;
    }

    saveToStorage();
    closeModal('modal-add-asset');
    refreshAllUI();
    e.target.reset();
    document.getElementById('add-edit-id').value = '';

    // Chantier 1.4 — si l'actif vient d'être promu depuis la watchlist,
    // propose de retirer l'entrée correspondante pour éviter un doublon.
    if (typeof cleanupAfterPromotion === 'function') {
        setTimeout(() => cleanupAfterPromotion(), 150);
    }
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
                // Si la requête ressemble à un ISIN, on le propage aux résultats
                // (l'API Finnhub ne renvoie pas l'ISIN dans sa réponse)
                const isIsinQuery = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/i.test(query);
                const enriched = isIsinQuery
                    ? finnhubResults.map(r => ({ ...r, isin: query.toUpperCase() }))
                    : finnhubResults;
                const combined = [...results, ...enriched];
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

        // ── SECURITY (audit B3) ──
        // `item.badgeColor` est interpolé dans un attribut `class`.
        // Aujourd'hui il provient de catalogues statiques, mais la fonction
        // est aussi alimentée par `searchFinnhubSymbol()` (réponse API
        // distante) : une réponse compromise pourrait injecter des
        // attributs via des guillemets. On échappe par défense en profondeur.
        // Note : les autres champs (`name`, `badge`, `ticker`, `category`)
        // sont déjà échappés — le seul trou était `badgeColor`.
        const safeBadgeColor = escapeHTML(item.badgeColor || '');
        const safeName       = escapeHTML(item.name);
        const safeBadge      = escapeHTML(item.badge || '');
        const safeTicker     = escapeHTML(item.ticker || '');
        const safeCategory   = escapeHTML(item.category || '');
        const safePrice      = formatEUR(item.priceEUR);

        div.innerHTML = `
            <div>
                <div class="font-bold text-white flex items-center gap-2">
                    ${safeName}
                    <span class="text-[9px] px-1.5 py-0.5 rounded border font-mono ${safeBadgeColor}">${safeBadge}</span>
                </div>
                <div class="text-[10px] text-gray-400 font-mono">${safeTicker} • ${safeCategory}</div>
            </div>
            <div class="text-right font-mono font-bold text-emerald-400">
                ${safePrice}
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
                <div class="font-bold text-white">${escapeHTML(a.name)}</div>
                <div class="text-[10px] text-gray-500 font-mono">${escapeHTML(a.ticker)} • Qté ${fmtQty(a.qty)} • Frais ${formatEUR(a.frais || 0)}</div>
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
        assets.map(a => `<option value="${a.id}">${escapeHTML(a.name)} (${escapeHTML(a.ticker)})</option>`).join('');
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
    document.getElementById('cession-qty').removeAttribute('readonly');
    document.getElementById('cession-qty').classList.remove('opacity-60', 'cursor-not-allowed');
    document.getElementById('cession-qty').oninput = onCessionQtyChange;
    document.getElementById('cession-prix-vente').oninput = updateCessionUnitPrices;
    document.getElementById('cession-prix-achat').oninput = updateCessionUnitPrices;

    // Cache le sélecteur nominatif à l'ouverture
    const lotPickerWrap = document.getElementById('cession-lot-picker-wrap');
    if (lotPickerWrap) lotPickerWrap.classList.add('hidden');
    const lotHidden = document.getElementById('cession-lot-id-hidden');
    if (lotHidden) lotHidden.value = '';
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

    // Affiche le sélecteur nominatif si plusieurs pièces référencées disponibles
    renderCessionLotPicker(asset);
}

// Affiche le sélecteur de pièce nominative si l'actif a plusieurs lots référencés
function renderCessionLotPicker(asset) {
    const wrap   = document.getElementById('cession-lot-picker-wrap');
    const picker = document.getElementById('cession-lot-picker');
    const hidden = document.getElementById('cession-lot-id-hidden');
    if (!wrap || !picker || !hidden) return;

    const lotsDispos = (asset.lots || []).filter(l => (l.qtyRemaining || 0) > 0 && l.reference);

    // Cas 1 : pas de référence nominative → on cache et on utilise le FIFO
    if (lotsDispos.length === 0) {
        wrap.classList.add('hidden');
        picker.innerHTML = '';
        hidden.value = '';
        const qtyInput = document.getElementById('cession-qty');
        qtyInput.removeAttribute('readonly');
        qtyInput.classList.remove('opacity-60', 'cursor-not-allowed');
        qtyInput.oninput = onCessionQtyChange;
        return;
    }

    // Cas 2 : au moins un lot avec référence → on affiche le sélecteur
    wrap.classList.remove('hidden');
    picker.innerHTML = lotsDispos.map((lot, i) => {
        const dateStr = lot.date ? new Date(lot.date).toLocaleDateString('fr-FR') : '—';
        const prixStr = formatEUR(lot.price || 0);
        return `
            <label class="flex items-start gap-2 p-2 bg-gray-950 border border-gray-800 rounded-lg cursor-pointer hover:border-indigo-500 transition">
                <input type="radio" name="cession-lot-radio" value="${lot.id}" ${i === 0 ? 'checked' : ''} class="mt-0.5 accent-indigo-500" onchange="onCessionLotChange()">
                <span class="flex-1 min-w-0">
                    <span class="block text-[11px] font-bold text-white font-mono truncate">Réf. ${escapeHTML(lot.reference)}</span>
                    <span class="block text-[10px] text-gray-400">
                        Achetée le ${dateStr} · ${prixStr} / unité · Disponible : ${fmtQty(lot.qtyRemaining)}
                    </span>
                </span>
            </label>`;
    }).join('');

    // Sélectionne par défaut le premier lot et force la quantité à 1
    const firstLot = lotsDispos[0];
    hidden.value = firstLot.id;
    const qtyInput = document.getElementById('cession-qty');
    qtyInput.value = 1;
    qtyInput.setAttribute('readonly', 'readonly');
    qtyInput.classList.add('opacity-60', 'cursor-not-allowed');
    qtyInput.oninput = null;

    // Pré-remplit date achat et prix achat depuis ce lot
    document.getElementById('cession-date-achat').value = firstLot.date || '';
    document.getElementById('cession-prix-achat').value = ((firstLot.price || 0) * 1).toFixed(2);

    // Hint quantité
    const hint = document.getElementById('cession-qty-hint');
    if (hint) hint.innerHTML = `<span class="text-indigo-400">Vente nominative — 1 pièce</span>`;

    onCessionQtyChange();
}

// Appelée quand l'utilisateur change de pièce dans le sélecteur
function onCessionLotChange() {
    const radio = document.querySelector('input[name="cession-lot-radio"]:checked');
    if (!radio) return;
    const lotId = radio.value;
    const hidden = document.getElementById('cession-lot-id-hidden');
    if (hidden) hidden.value = lotId;

    const sourceId = parseFloat(document.getElementById('cession-source-asset').value);
    const asset = assets.find(a => a.id === sourceId);
    if (!asset) return;
    const lot = (asset.lots || []).find(l => String(l.id) === String(lotId));
    if (!lot) return;

    // Recalcule prix d'achat (total = unitaire × 1)
    document.getElementById('cession-date-achat').value = lot.date || '';
    document.getElementById('cession-prix-achat').value = ((lot.price || 0) + ((lot.frais || 0) / (lot.qty || 1))).toFixed(2);
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

    // Si un lot nominatif est sélectionné, on prend SON prix d'achat, sinon PRU moyen
    const selectedLotId = document.getElementById('cession-lot-id-hidden')?.value || '';
    let pru;
    if (selectedLotId) {
        const lot = (asset.lots || []).find(l => String(l.id) === String(selectedLotId));
        pru = lot ? ((lot.price || 0) + ((lot.frais || 0) / (lot.qty || 1))) : 0;
    } else {
        pru = computePRUFromLots(asset) || (asset.qty > 0 ? asset.invested / asset.qty : 0);
    }

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

    // --- ÉTAPE 1 : VALIDER et SIMULER la consommation des lots AVANT toute mutation ---
    let assetToModify = null;
    let qtyToSell = 0;
    const sourceAssetId = parseFloat(document.getElementById('cession-source-asset').value);

    if (!editId && sourceAssetId) {
        assetToModify = assets.find(a => a.id === sourceAssetId);
        if (!assetToModify) {
            alert('Actif source introuvable.');
            return;
        }
        qtyToSell = parseFloat(document.getElementById('cession-qty').value) || assetToModify.qty;
        if (qtyToSell > assetToModify.qty) {
            alert(`Quantité invalide : ${qtyToSell} demandées, ${assetToModify.qty} disponibles.`);
            return;
        }

        const selectedLotId = document.getElementById('cession-lot-id-hidden')?.value || '';

        // Snapshot des qtyRemaining AVANT le dry-run : on peut ainsi
        // restaurer sans risque même si le dry-run échoue en cours de route.
        const snapshot = (assetToModify.lots || []).map(l => ({ id: l.id, qtyRemaining: l.qtyRemaining || 0 }));

        const dryRun = selectedLotId
            ? consumeLotById(assetToModify, selectedLotId, qtyToSell)
            : consumeFIFO(assetToModify, qtyToSell);

        // Rollback inconditionnel depuis le snapshot (sur succès ET échec)
        snapshot.forEach(s => {
            const lot = (assetToModify.lots || []).find(l => String(l.id) === String(s.id));
            if (lot) lot.qtyRemaining = s.qtyRemaining;
        });

        if (dryRun.error) {
            alert(dryRun.error);
            return;
        }
    }

    // --- ÉTAPE 2 : la cession est valide → on la persiste ---
    if (editId) {
        const idx = cessions.findIndex(c => c.id === parseFloat(editId));
        if (idx > -1) cessions[idx] = cession;
    } else {
        cessions.push(cession);
    }

    // --- ÉTAPE 3 : appliquer la consommation des lots pour de vrai ---
    if (assetToModify) {
        const selectedLotId = document.getElementById('cession-lot-id-hidden')?.value || '';
        const consommation = selectedLotId
            ? consumeLotById(assetToModify, selectedLotId, qtyToSell)
            : consumeFIFO(assetToModify, qtyToSell);

        // (Impossible d'échouer ici : on l'a validé en étape 1.)
        if (consommation.error) {
            // Sécurité ultime : on retire la cession que l'on vient d'ajouter
            cessions = cessions.filter(c => c.id !== cession.id);
            alert('Erreur inattendue lors de la consommation des lots : ' + consommation.error);
            return;
        }

        syncAssetFromLots(assetToModify);

        if (assetToModify.qty <= 0.0001) {
            if (confirm(`Vente totale de "${assetToModify.name}". L'actif sera retiré du portefeuille.`)) {
                assets = assets.filter(a => a.id !== sourceAssetId);
            }
        } else {
            const totalQtyAvantVente = assetToModify.qty + qtyToSell;
            const ratioRestant = totalQtyAvantVente > 0 ? (assetToModify.qty / totalQtyAvantVente) : 0;
            assetToModify.value = Math.round(assetToModify.value * ratioRestant * 100) / 100;
            upsertTodayHistoryPoint(assetToModify, assetToModify.value, assetToModify.invested);
        }
        saveToStorage();
    }

    saveCessions();
    closeModal('modal-add-cession');
    refreshAllUI();   // inclut déjà calculateAnneeN1 + renderCessionsTable
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
        assets.map(a => `<option value="${a.id}">${escapeHTML(a.name)} (${escapeHTML(a.ticker)})</option>`).join('');
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

    // B14 : lecture via l'objet structuré (plus de parsing de texte DOM)
    const tax = (typeof lastTaxBreakdown !== 'undefined' && lastTaxBreakdown)
        ? lastTaxBreakdown
        : (typeof computeTaxBreakdown === 'function' ? computeTaxBreakdown() : null);
    const impotEstime   = tax ? formatEUR(tax.selectedTotal)     : '—';
    const metalsTax     = tax ? formatEUR(tax.metalsTaxTotal)    : '—';
    const enveloppesTax = tax ? formatEUR(tax.enveloppesTaxTotal) : '—';

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
        <button onclick="exportRecapPDF()" class="w-full mt-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center justify-center gap-2 font-sans"><i class="fa-solid fa-file-pdf"></i> Exporter en PDF (mise en page A4)</button>
    `;
    document.getElementById('modal-recap').classList.remove('hidden');
}
// Gestion du sélecteur de courtier (avec création custom)
const KNOWN_BROKERS = [
    'Boursorama', 'Bourse Direct', 'Fortuneo', 'Trade Republic', 'Interactive Brokers',
    'Degiro', 'Saxo Banque', 'Binance', 'Coinbase', 'Kraken', 'Ledger', 'AuCoffre.com',
    'Linxea', 'Yomoni', 'Nalo'
];

function onBrokerSelectChange() {
    const sel = document.getElementById('add-broker-select');
    const custom = document.getElementById('add-broker-custom');
    const hidden = document.getElementById('add-broker');
    if (sel.value === '__custom__') {
        custom.classList.remove('hidden');
        custom.focus();
        custom.oninput = () => { hidden.value = custom.value.trim(); };
        hidden.value = custom.value.trim();
    } else {
        custom.classList.add('hidden');
        custom.value = '';
        hidden.value = sel.value;
    }
}

// Pré-remplit le sélecteur de courtier à partir d'une valeur enregistrée
function setBrokerValue(brokerName) {
    const sel = document.getElementById('add-broker-select');
    const custom = document.getElementById('add-broker-custom');
    const hidden = document.getElementById('add-broker');
    const v = (brokerName || '').trim();
    if (!v) {
        sel.value = '';
        custom.classList.add('hidden');
        custom.value = '';
        hidden.value = '';
        return;
    }
    if (KNOWN_BROKERS.includes(v) || v === '') {
        sel.value = v;
        custom.classList.add('hidden');
        custom.value = '';
    } else {
        sel.value = '__custom__';
        custom.classList.remove('hidden');
        custom.value = v;
        custom.oninput = () => { hidden.value = custom.value.trim(); };
    }
    hidden.value = v;
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


// =====================================================================
// IMPORT CSV / EXCEL — utiliser SheetJS (déjà chargé dans index.html)
// Supporte : AuCoffre, Trade Republic, Boursorama, Scalable, Revolut…
// Chaque ligne devient un nouveau lot (fusion si ticker existant).
// =====================================================================
let _csvRows = [];
let _csvHeaders = [];

const CSV_FIELD_DEFS = [
    { key: 'name',   label: 'Nom du produit *',   patterns: ['nom','name','produit','libell','designation','description','title'] },
    { key: 'ticker', label: 'Ticker / Symbole',    patterns: ['ticker','symbole','symbol','code','ref'] },
    { key: 'qty',    label: 'Quantité *',          patterns: ['quantit','quantity','qty','nombre','shares','unit'] },
    { key: 'price',  label: "Prix d'achat unitaire *", patterns: ["prix d'achat",'prix achat','prix unitaire','prix','price','cours','purchase price'] },
    { key: 'date',   label: "Date d'achat",        patterns: ["date d'achat",'date achat','date','purchase date'] },
    { key: 'frais',  label: 'Frais / Commission',  patterns: ['frais','commission','fee','courtage'] }
];

// Parse un nombre au format FR (1.234,56) ou EN (1,234.56)
function _parseNumberLoose(raw) {
    if (typeof raw === 'number') return raw;
    if (raw === null || raw === undefined) return NaN;
    let s = String(raw).trim().replace(/\s/g, '').replace(/[€$£]/g, '');
    if (s === '') return NaN;
    const hasComma = s.includes(',');
    const hasDot = s.includes('.');
    if (hasComma && hasDot) {
        // Si la virgule est après le point → format FR (le point = milliers)
        if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
        else s = s.replace(/,/g, '');
    } else if (hasComma) {
        s = s.replace(',', '.');
    }
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : NaN;
}

function openCsvImportModal() {
    resetCsvImport();
    document.getElementById('modal-csv-import').classList.remove('hidden');
}

function resetCsvImport() {
    _csvRows = [];
    _csvHeaders = [];
    const s1 = document.getElementById('csv-step-1');
    const s2 = document.getElementById('csv-step-2');
    const btn = document.getElementById('csv-import-btn');
    if (s1) s1.classList.remove('hidden');
    if (s2) s2.classList.add('hidden');
    if (btn) btn.classList.add('hidden');
    const inp = document.getElementById('input-import-csv');
    if (inp) inp.value = '';
}

function handleImportCSVFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            if (typeof XLSX === 'undefined') { alert('SheetJS non chargé — vérifiez votre connexion internet.'); return; }
            const data = new Uint8Array(ev.target.result);
            const wb = XLSX.read(data, { type: 'array', cellDates: true });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });

            if (!json.length || json.length < 2) { alert('Fichier vide ou trop court.'); return; }

            _csvHeaders = (json[0] || []).map(h => String(h || '').trim());
            _csvRows = json.slice(1).filter(r => r.some(c => String(c || '').trim() !== ''));
            if (!_csvRows.length) { alert('Aucune ligne de données détectée.'); return; }

            renderCsvMapping();
            renderCsvPreview();
            document.getElementById('csv-step-1').classList.add('hidden');
            document.getElementById('csv-step-2').classList.remove('hidden');
            document.getElementById('csv-import-btn').classList.remove('hidden');
        } catch (err) {
            alert('Erreur de lecture du fichier : ' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

function _headerMatches(header, patterns) {
    const h = String(header || '').toLowerCase().trim();
    return patterns.some(p => h.includes(p));
}

function renderCsvMapping() {
    const container = document.getElementById('csv-column-mapping');
    container.innerHTML = CSV_FIELD_DEFS.map(f => {
        let detected = '';
        _csvHeaders.forEach((h, i) => {
            if (detected === '' && _headerMatches(h, f.patterns)) detected = i;
        });
        const opts = '<option value="">— Ignorer —</option>' + _csvHeaders.map((h, i) =>
            `<option value="${i}" ${String(detected) === String(i) ? 'selected' : ''}>${escapeHTML(h || '(colonne ' + (i + 1) + ')')}</option>`
        ).join('');
        return `<div>
            <label class="block text-[10px] text-gray-400 uppercase mb-1">${escapeHTML(f.label)}</label>
            <select data-csv-field="${f.key}" onchange="renderCsvPreview()" class="w-full bg-gray-950 border border-gray-800 rounded-lg p-1.5 text-white text-xs focus:outline-none focus:border-teal-500">${opts}</select>
        </div>`;
    }).join('');
}

function getCsvFieldMap() {
    const map = {};
    document.querySelectorAll('#csv-column-mapping select[data-csv-field]').forEach(sel => {
        if (sel.value !== '') map[sel.dataset.csvField] = parseInt(sel.value);
    });
    return map;
}

function renderCsvPreview() {
    const thead = document.getElementById('csv-preview-header');
    const tbody = document.getElementById('csv-preview-body');
    thead.innerHTML = _csvHeaders.map(h => `<th class="p-2 text-left">${escapeHTML(h || '')}</th>`).join('');
    const rows = _csvRows.slice(0, 20).map(r =>
        `<tr class="border-t border-gray-800/60">${
            _csvHeaders.map((_, i) => `<td class="p-2 text-[11px]">${escapeHTML(String(r[i] ?? ''))}</td>`).join('')
        }</tr>`
    ).join('');
    tbody.innerHTML = rows + (_csvRows.length > 20
        ? `<tr><td colspan="${_csvHeaders.length}" class="p-2 text-center text-gray-500 text-[11px]">… et ${_csvRows.length - 20} autres lignes</td></tr>`
        : '');
}

function confirmCsvImport() {
    const map = getCsvFieldMap();
    if (map.name === undefined || map.qty === undefined || map.price === undefined) {
        alert('Vous devez mapper au minimum : Nom, Quantité et Prix d\'achat.');
        return;
    }
    const mergeDup = document.getElementById('csv-merge-duplicates').checked;
    const dryRun = document.getElementById('csv-dryrun').checked;

    // Skeleton immédiat sur l'inventaire pendant la construction des actifs
    if (!dryRun) showSkeletonFor('#table-inventory-body', 6, 13);

    let created = 0, merged = 0, skipped = 0;
    const todayISO = new Date().toISOString().slice(0, 10);

    _csvRows.forEach((row, lineNo) => {
        const name = String(row[map.name] || '').trim();
        if (!name) { skipped++; return; }

        const ticker = map.ticker !== undefined
            ? (String(row[map.ticker] || '').trim().toUpperCase() || name.slice(0, 6).toUpperCase().replace(/\s/g, ''))
            : name.slice(0, 6).toUpperCase().replace(/\s/g, '');

        const qty = _parseNumberLoose(row[map.qty]);
        const price = _parseNumberLoose(row[map.price]);
        const frais = map.frais !== undefined ? (_parseNumberLoose(row[map.frais]) || 0) : 0;

        let dateISO = todayISO;
        let dateFR = new Date().toLocaleDateString('fr-FR');
        if (map.date !== undefined && row[map.date]) {
            const d = parseFlexDate(String(row[map.date]).trim());
            if (d) {
                dateISO = d.toISOString().slice(0, 10);
                dateFR = d.toLocaleDateString('fr-FR');
            }
        }

        if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) {
            skipped++;
            return;
        }

        // Fusion avec un actif existant ?
        const existing = mergeDup ? assets.find(a => (a.ticker || '').toUpperCase() === ticker) : null;

        if (existing) {
            if (!dryRun) {
                const oldUnit = existing.qty > 0 ? (existing.value / existing.qty) : price;
                existing.lots = (existing.lots || []).concat([ makeLot(dateISO, qty, price, frais, '') ]);
                existing.buys = (existing.buys || []).concat([{ date: dateFR, type: 'Import CSV', qty, price, frais, total: qty * price + frais }]);
                syncAssetFromLots(existing);
                existing.value = Math.round(existing.qty * oldUnit * 100) / 100;
                upsertTodayHistoryPoint(existing, existing.value, existing.invested);
            }
            merged++;
        } else {
            const newAsset = {
                id: Date.now() + Math.floor(Math.random() * 100000),
                name, ticker,
                categories: ['Action'],
                taxCategory: 'NON_CONCERNE',
                cadrans: { primary: 'HORS_GAVE', secondary: [] },
                cadran: 'HORS_GAVE',
                qty, frais, invested: qty * price + frais, value: qty * price,
                envelope: 'CTO',
                envelopeOpenedAt: '',
                zone: 'UE',
                valuationMode: 'QUOTE',
                yahooTicker: '',
                purchaseDate: dateISO,
                broker: 'Import CSV',
                lots: [ makeLot(dateISO, qty, price, frais, '') ],
                buys: [{ date: dateFR, type: 'Import CSV', qty, price, frais, total: qty * price + frais }],
                history: [{ date: dateFR, value: qty * price, invested: qty * price + frais }]
            };
            if (!dryRun) {
                // Paper trading : les imports en mode actif deviennent des positions papier
                if (paperMode) newAsset.isPaper = true;
                normalizeAsset(newAsset);
                assets.push(newAsset);
            }
            created++;
        }
    });

    if (!dryRun) {
        saveToStorage();
        refreshAllUI();
    }
    closeModal('modal-csv-import');

    alert(
        `Import ${dryRun ? '(PRÉVISUALISATION) ' : ''}terminé :\n` +
        `• ${created} nouvel/aux actif(s)\n` +
        `• ${merged} lot(s) ajouté(s) à des actifs existants\n` +
        `• ${skipped} ligne(s) ignorée(s) (données manquantes ou invalides)`
    );
}


// =====================================================================
// DUPLICATION D'UN ACTIF (variantes rapides : Vera Valor 1/10, 1/20…)
// =====================================================================
function duplicateAsset(id) {
    const source = assets.find(a => a.id === id);
    if (!source) return;

    document.getElementById('dup-source-id').value = id;
    document.getElementById('dup-source-label').innerText =
        `${source.name} (${source.ticker}) — ${formatEUR(source.value || 0)}`;

    // Pré-remplissage intelligent :
    // - Nom : "Nom source — variante" (l'utilisateur remplace "variante" par 1/10, 1/20…)
    // - Ticker : "TICKER-2" — l'utilisateur ajuste (VV1/10OZ, VV1/2OZ…)
    // - Quantité / Prix : ceux de la source (PRU fiscal recalculé des lots)
    // - Date / Frais : aujourd'hui, 0 €
    document.getElementById('dup-name').value = source.name + ' — variante';
    document.getElementById('dup-ticker').value = source.ticker + '-2';
    document.getElementById('dup-qty').value = source.qty || 1;

    const pru = computePRUFromLots(source) || (source.qty > 0 ? source.invested / source.qty : 0);
    document.getElementById('dup-price').value = pru > 0 ? pru.toFixed(4) : '';
    document.getElementById('dup-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('dup-frais').value = 0;

    document.getElementById('modal-duplicate-asset').classList.remove('hidden');
    setTimeout(() => document.getElementById('dup-name').select(), 50);
}

function handleDuplicateAsset(e) {
    e.preventDefault();
    const sourceId = parseFloat(document.getElementById('dup-source-id').value);
    const source = assets.find(a => a.id === sourceId);
    if (!source) { alert('Actif source introuvable.'); return; }

    const name   = document.getElementById('dup-name').value.trim();
    const ticker = document.getElementById('dup-ticker').value.trim().toUpperCase();
    const qty    = parseFloat(document.getElementById('dup-qty').value) || 0;
    const price  = parseFloat(document.getElementById('dup-price').value) || 0;
    const frais  = parseFloat(document.getElementById('dup-frais').value) || 0;
    const dateISO = document.getElementById('dup-date').value || new Date().toISOString().slice(0, 10);
    const dateFR  = new Date(dateISO).toLocaleDateString('fr-FR');

    if (!name || !ticker) { alert('Nom et ticker sont requis.'); return; }
    if (qty <= 0 || price < 0) { alert('Quantité et prix doivent être positifs.'); return; }

    // Alerte douce si le ticker existe déjà (l'utilisateur peut vouloir créer une
    // variante ou écraser volontairement — on ne bloque pas, on prévient).
    const dupTicker = assets.find(a => a.id !== sourceId && (a.ticker || '').toUpperCase() === ticker);
    if (dupTicker && !confirm(`Un actif avec le ticker "${ticker}" existe déjà :\n"${dupTicker.name}"\n\nCréer quand même la copie ?`)) return;

    // Clone superficiel : on garde categories, cadrans, envelope, taxCategory,
    // isin, broker, valuationMode, zone, yahooTicker… puis on écrase les champs
    // spécifiques au lot et on repart d'un historique propre.
    const clone = JSON.parse(JSON.stringify(source));
    clone.id           = Date.now() + Math.floor(Math.random() * 100000);
    clone.name         = name;
    clone.ticker       = ticker;
    clone.qty          = qty;
    clone.frais        = frais;
    clone.invested     = qty * price + frais;
    clone.value        = qty * price;
    clone.purchaseDate = dateISO;

    // Lot unique neuf, historique neuf, aucun flag résiduel de migration/override
    clone.lots    = [ makeLot(dateISO, qty, price, frais, '') ];
    clone.buys    = [{ date: dateFR, type: 'Copie', qty, price, frais, total: clone.invested }];
    clone.history = [{ date: dateFR, value: clone.value, invested: clone.invested }];
    delete clone.needsReclass;
    delete clone.reclassSuggestion;
    delete clone.manualValueOverride;
    delete clone.manualUpdateDate;
    delete clone.manualUpdateSource;

    normalizeAsset(clone);
    assets.push(clone);

    saveToStorage();
    closeModal('modal-duplicate-asset');
    refreshAllUI();

    // Redirige vers la copie : c'est presque toujours l'intention de l'utilisateur
    // qui vient de dupliquer (pour l'éditer juste après).
    setTimeout(() => openEditAssetModal(clone.id), 80);
}


// =====================================================================
// EXPORT PDF — Récapitulatif fiscal (mise en page A4 dédiée)
// Injecte un DOM HTML complet dans #print-fiscal-recap, puis déclenche
// l'impression. Le CSS @media print masque tout le reste de l'app.
// =====================================================================
function exportRecapPDF() {
    const container = document.getElementById('print-fiscal-recap');
    if (!container) { alert('Conteneur d\'impression introuvable.'); return; }

    const tax = (typeof computeTaxBreakdown === 'function')
        ? computeTaxBreakdown()
        : {
            selectedTotal: 0, metalsTaxTotal: 0, enveloppesTaxTotal: 0, totalImpot: 0,
            plusValuesBrutes: 0, moinsValuesBrutes: 0, netForPFU: 0, totalBrutVentes: 0,
            securitiesCount: 0, pfuTotal: 0, baremeTotal: 0,
            pfuIR: 0, pfuPS: 0, baremeIR: 0, baremePS: 0, csgDeductible: 0
        };

    const regimeLabel = taxRegimeMode === 'PFU'
        ? 'PFU / Flat Tax (30 % — 12,8 % IR + 17,2 % PS)'
        : `Barème Progressif (TMI ${(taxTMI * 100).toFixed(0)} %)`;

    const exercise = new Date().getFullYear() - 1;  // exercice N-1
    const nowFR    = new Date().toLocaleString('fr-FR');

    // --- Groupement des cessions par grande famille fiscale ---
    const groups = {
        cto:    { label: 'Valeurs mobilières — CTO (Actions / ETF / Obligations)', rows: [] },
        crypto: { label: 'Actifs numériques — Cryptomonnaies', rows: [] },
        metals: { label: 'Métaux précieux, Jetons & Pièces à cours légal', rows: [] },
        env:    { label: 'Enveloppes fiscales (PEA / PEA-PME / Assurance-Vie / PER)', rows: [] }
    };
    cessions.forEach(c => {
        if (c.type === 'CRYPTO')                                          groups.crypto.rows.push(c);
        else if (METAL_TYPES.includes(c.type))                            groups.metals.rows.push(c);
        else if (c.type === 'ACTION_ETF' && c.envelope && c.envelope !== 'CTO') groups.env.rows.push(c);
        else                                                              groups.cto.rows.push(c);
    });

    // --- Rendus ligne à ligne ---
    const renderRows = (rows) => {
        if (!rows.length) {
            return `<tr><td colspan="7" style="text-align:center;color:#9ca3af;font-style:italic;padding:10px;">Aucune cession enregistrée dans cette catégorie.</td></tr>`;
        }
        return rows
            .slice()
            .sort((a, b) => new Date(b.dateVente) - new Date(a.dateVente))
            .map(c => {
                const line  = computeCessionLine(c);
                const isPos = line.pvBrute >= 0;
                const dateFR = c.dateVente ? new Date(c.dateVente).toLocaleDateString('fr-FR') : '—';
                return `<tr>
                    <td>${dateFR}</td>
                    <td>${escapeHTML(c.name)}</td>
                    <td class="pdf-num">${formatEUR(c.prixVente)}</td>
                    <td class="pdf-num">${formatEUR(c.prixAchat)}</td>
                    <td class="pdf-num" style="color:${isPos ? '#047857' : '#be123c'};font-weight:600;">${isPos ? '+' : ''}${formatEUR(line.pvBrute)}</td>
                    <td style="font-size:9.5px;color:#4b5563;">${escapeHTML(line.abattementLabel)} · ${escapeHTML(line.detentionTag)}</td>
                    <td class="pdf-num" style="color:#b45309;font-weight:600;">${formatEUR(line.taxLine)}</td>
                </tr>`;
            })
            .join('');
    };

    const renderGroupTotal = (rows, label) => {
        const pv  = rows.reduce((s, c) => s + Math.max(0, (c.prixVente || 0) - (c.prixAchat || 0) - (c.frais || 0)), 0);
        const mv  = rows.reduce((s, c) => s + Math.min(0, (c.prixVente || 0) - (c.prixAchat || 0) - (c.frais || 0)), 0);
        const t   = rows.reduce((s, c) => s + computeCessionLine(c).taxLine, 0);
        return `<tr class="pdf-total-row">
            <td colspan="4" style="text-align:right;">Sous-total — ${escapeHTML(label)}</td>
            <td class="pdf-num">${formatEUR(pv + mv)}</td>
            <td></td>
            <td class="pdf-num">${formatEUR(t)}</td>
        </tr>`;
    };

    // --- Page 1 : synthèse ---
    let html = `<div class="pdf-page">
        <div class="pdf-header">
            <div style="display:flex;align-items:center;gap:12px;">
                <div class="pdf-logo">📊</div>
                <div>
                    <h1>PatriMonial — Récapitulatif Fiscal</h1>
                    <div style="font-size:11px;color:#4b5563;">Exercice ${exercise} · Déclaration des revenus ${exercise + 1}</div>
                </div>
            </div>
            <div class="pdf-meta">
                Édité le ${nowFR}<br>
                Régime retenu : <b>${regimeLabel}</b>
            </div>
        </div>

        <div class="pdf-kpi-grid">
            <div class="pdf-kpi"><div class="label">Total cessions brutes</div><div class="value">${formatEUR(tax.totalBrutVentes)}</div></div>
            <div class="pdf-kpi positive"><div class="label">Plus-values brutes</div><div class="value">${formatEUR(tax.plusValuesBrutes)}</div></div>
            <div class="pdf-kpi negative"><div class="label">Moins-values brutes</div><div class="value">${formatEUR(tax.moinsValuesBrutes)}</div></div>
            <div class="pdf-kpi accent"><div class="label">Impôt total estimé</div><div class="value">${formatEUR(tax.totalImpot)}</div></div>
        </div>

        <h2>1 · Synthèse du régime CTO (Titres &amp; Crypto)</h2>
        <div class="pdf-kpi-grid">
            <div class="pdf-kpi"><div class="label">Solde net imposable</div><div class="value">${formatEUR(tax.netForPFU)}</div></div>
            <div class="pdf-kpi"><div class="label">PFU — IR 12,8 %</div><div class="value">${formatEUR(tax.pfuIR)}</div></div>
            <div class="pdf-kpi"><div class="label">PFU — PS 17,2 %</div><div class="value">${formatEUR(tax.pfuPS)}</div></div>
            <div class="pdf-kpi accent"><div class="label">Total PFU</div><div class="value">${formatEUR(tax.pfuTotal)}</div></div>
        </div>
        <div class="pdf-kpi-grid">
            <div class="pdf-kpi"><div class="label">Barème — IR (TMI ${(taxTMI * 100).toFixed(0)} %)</div><div class="value">${formatEUR(tax.baremeIR)}</div></div>
            <div class="pdf-kpi"><div class="label">Barème — PS 17,2 %</div><div class="value">${formatEUR(tax.baremePS)}</div></div>
            <div class="pdf-kpi negative"><div class="label">Déduction CSG 6,8 %</div><div class="value">-${formatEUR(tax.csgDeductible)}</div></div>
            <div class="pdf-kpi accent"><div class="label">Total Barème</div><div class="value">${formatEUR(tax.baremeTotal)}</div></div>
        </div>
        <div style="font-size:10px;color:#4b5563;margin-top:4px;">
            Option retenue : <b>${regimeLabel}</b> · Impôt CTO : <b>${formatEUR(tax.selectedTotal)}</b>
        </div>
    </div>`;

    // --- Page 2 : détail par catégorie ---
    html += `<div class="pdf-page">
        <div class="pdf-header" style="margin-bottom:12px;padding-bottom:8px;">
            <div><h1 style="font-size:15px;">Détail des cessions par catégorie fiscale</h1></div>
            <div class="pdf-meta">Exercice ${exercise}</div>
        </div>`;

    const sections = [
        { idx: 2, data: groups.cto    },
        { idx: 3, data: groups.crypto },
        { idx: 4, data: groups.metals },
        { idx: 5, data: groups.env    }
    ];
    sections.forEach(s => {
        html += `<div class="pdf-section">
            <h2>${s.idx} · ${s.data.label}</h2>
            <table>
                <thead><tr>
                    <th>Date</th><th>Libellé</th>
                    <th style="text-align:right;">Prix vente</th>
                    <th style="text-align:right;">Prix achat</th>
                    <th style="text-align:right;">Plus/moins-value</th>
                    <th>Régime / abattement</th>
                    <th style="text-align:right;">Impôt ligne</th>
                </tr></thead>
                <tbody>
                    ${renderRows(s.data.rows)}
                    ${s.data.rows.length ? renderGroupTotal(s.data.rows, s.data.label) : ''}
                </tbody>
            </table>
        </div>`;
    });

    // --- Total général + pied de page ---
    html += `<div class="pdf-section">
        <h2>6 · Total général</h2>
        <table>
            <tbody>
                <tr><td style="width:65%;">Impôt CTO / Crypto (régime sélectionné)</td><td class="pdf-num">${formatEUR(tax.selectedTotal)}</td></tr>
                <tr><td>Impôt Métaux précieux / Jetons / Pièces à cours légal</td><td class="pdf-num">${formatEUR(tax.metalsTaxTotal)}</td></tr>
                <tr><td>Impôt Enveloppes (PEA / AV / PER)</td><td class="pdf-num">${formatEUR(tax.enveloppesTaxTotal)}</td></tr>
                <tr class="pdf-total-row"><td>Total impôt estimé pour l'exercice ${exercise}</td><td class="pdf-num">${formatEUR(tax.totalImpot)}</td></tr>
            </tbody>
        </table>
    </div>

    <div class="pdf-footer">
        <b>Avertissement :</b> ce document est une estimation indicative produite automatiquement à partir des données saisies dans PatriMonial. Il ne remplace pas les cases précises de votre déclaration de revenus (2042, 2086, 2074…) ni l'avis d'un professionnel de la fiscalité — en particulier pour le PER, dont la fiscalité dépend fortement du mode de sortie et de la déductibilité des versements.
        <br>Nombre de cessions prises en compte : <b>${cessions.length}</b> · Document généré le ${nowFR}.
    </div>
    </div>`;

    container.innerHTML = html;

    // Laisse le navigateur appliquer les styles avant d'ouvrir la boîte d'impression
    setTimeout(() => window.print(), 150);
}


// =====================================================================
// SIMULATEUR « ET SI JE VENDAIS ? » — calcul temps réel, 0 modification
// ---------------------------------------------------------------------
// La simulation se contente de construire une cession fictive (id=-1) et
// de la passer à computeCessionLine() : on réutilise ainsi TOUTE la
// logique fiscale (métaux, jetons, enveloppes PEA/AV/PER, PFU/Barème,
// abattement durée) sans la dupliquer.
// =====================================================================
let _simulatorAssetId = null;

function openSellSimulator(assetId) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;

    _simulatorAssetId = assetId;

    // En-tête
    document.getElementById('sim-asset-name').innerText     = asset.name;
    document.getElementById('sim-asset-ticker').innerText   = asset.ticker + (asset.envelope ? ' · ' + envelopeShort(asset.envelope) : '');
    document.getElementById('sim-asset-held').innerText     = fmtQty(asset.qty) + ' u.';

    const pru       = computePRUFromLots(asset) || (asset.qty > 0 ? asset.invested / asset.qty : 0);
    const unitValue = asset.qty > 0 ? (asset.value / asset.qty) : 0;

    document.getElementById('sim-asset-pru').innerText         = formatUnitPrice(pru);
    document.getElementById('sim-asset-value-unit').innerText  = formatUnitPrice(unitValue);

    // Inputs
    const qtyInput = document.getElementById('sim-quantity');
    qtyInput.max   = asset.qty;
    qtyInput.value = asset.qty;
    const slider = document.getElementById('sim-quantity-slider');
    slider.max   = asset.qty;
    slider.value = asset.qty;
    document.getElementById('sim-unit-price').value = unitValue.toFixed(4);
    document.getElementById('sim-sale-date').value  = new Date().toISOString().slice(0, 10);

    document.getElementById('modal-simulate-sale').classList.remove('hidden');
    recalcSimulation();
}

// Synchronisation slider ↔ champ numérique
function onSimQuantityInput(source) {
    const asset = assets.find(a => a.id === _simulatorAssetId);
    if (!asset) return;
    const max = asset.qty;
    const slider = document.getElementById('sim-quantity-slider');
    const number = document.getElementById('sim-quantity');

    let v;
    if (source === 'slider') {
        v = parseFloat(slider.value) || 0;
        number.value = v;
    } else {
        v = parseFloat(number.value) || 0;
        v = Math.max(0, Math.min(v, max));
        number.value = v;
        slider.value = v;
    }
    recalcSimulation();
}

function simSetQuantityPct(pct) {
    const asset = assets.find(a => a.id === _simulatorAssetId);
    if (!asset) return;
    const v = asset.qty * (pct / 100);
    document.getElementById('sim-quantity').value = v;
    document.getElementById('sim-quantity-slider').value = v;
    recalcSimulation();
}

function recalcSimulation() {
    const asset = assets.find(a => a.id === _simulatorAssetId);
    if (!asset) return;

    const qtyInput   = document.getElementById('sim-quantity');
    const priceInput = document.getElementById('sim-unit-price');
    const dateInput  = document.getElementById('sim-sale-date');

    const qty       = Math.max(0, Math.min(parseFloat(qtyInput.value) || 0, asset.qty));
    const unitPrice = parseFloat(priceInput.value) || 0;
    const dateISO   = dateInput.value || new Date().toISOString().slice(0, 10);

    // Rappel : delta vs valeur unitaire courante
    const currentUnitValue = asset.qty > 0 ? (asset.value / asset.qty) : 0;
    const deltaEl = document.getElementById('sim-price-delta');
    if (currentUnitValue > 0 && unitPrice > 0) {
        const d = ((unitPrice - currentUnitValue) / currentUnitValue) * 100;
        const c = d >= 0 ? 'text-emerald-400' : 'text-rose-400';
        deltaEl.className = 'text-[10px] mt-1 font-mono ' + c;
        deltaEl.innerText = (d >= 0 ? '+' : '') + d.toFixed(2) + ' % vs cours actuel';
    } else {
        deltaEl.className = 'text-[10px] mt-1 font-mono text-gray-500';
        deltaEl.innerText = '—';
    }

    // PRU fiscal (méthode officielle : lots restants uniquement)
    const pru = computePRUFromLots(asset) || (asset.qty > 0 ? asset.invested / asset.qty : 0);

    const totalSale = qty * unitPrice;
    const totalCost = pru * qty;
    const pnl       = totalSale - totalCost;

    // --- Détermination du type fiscal, identique à prefillCessionFromAsset() ---
    const security = isSecurityAsset(asset);
    const cessionType = (!security && METAL_TYPES.includes(asset.taxCategory))
        ? asset.taxCategory
        : (hasTag(asset, 'Crypto') && !security ? 'CRYPTO' : 'ACTION_ETF');
    const subType = hasTag(asset, 'Obligation') ? 'OBLIGATION'
                  : hasTag(asset, 'ETF')        ? 'ETF'
                  : 'ACTION';

    // Date d'acquisition la plus ancienne connue (pour l'abattement durée)
    const firstLot = (asset.lots || []).slice().sort((a, b) => new Date(a.date) - new Date(b.date))[0];
    const dateAchatISO = firstLot ? firstLot.date : (asset.purchaseDate || '');

    // Cession fictive passée à computeCessionLine : réutilise 100 % de la fiscalité
    const fakeCession = normalizeCession({
        id: -1,
        type: cessionType,
        subType,
        name: asset.name,
        dateVente: dateISO,
        dateAchat: dateAchatISO,
        prixVente: totalSale,
        prixAchat: totalCost,
        frais: 0,
        avant2018: false,
        envelope: security ? (asset.envelope || 'CTO') : '',
        envelopeOpenedAt: asset.envelopeOpenedAt || '',
        zone: asset.zone || 'UE',
        coupons: 0
    });

    const line = computeCessionLine(fakeCession);

    // --- Rendu ---
    document.getElementById('sim-result-total-sale').innerText = formatEUR(totalSale);
    document.getElementById('sim-result-cost').innerText       = formatEUR(totalCost);

    const pnlEl = document.getElementById('sim-result-pnl');
    pnlEl.className = 'font-bold ' + (pnl >= 0 ? 'text-emerald-400' : 'text-rose-400');
    pnlEl.innerText = (pnl >= 0 ? '+' : '') + formatEUR(pnl);

    document.getElementById('sim-result-regime').innerText     = line.detentionTag || '—';
    document.getElementById('sim-result-abattement').innerText = line.abattementLabel || '—';
    document.getElementById('sim-result-tax').innerText        = formatEUR(line.taxLine);

    const net = pnl - line.taxLine;
    const netEl = document.getElementById('sim-result-net');
    netEl.className = 'font-bold ' + (net >= 0 ? 'text-emerald-400' : 'text-rose-400');
    netEl.innerText = (net >= 0 ? '+' : '') + formatEUR(net);

    const netPct = totalSale > 0 ? (net / totalSale) * 100 : 0;
    const netPctEl = document.getElementById('sim-result-net-pct');
    netPctEl.className = 'font-mono ' + (net >= 0 ? 'text-emerald-400' : 'text-rose-400');
    netPctEl.innerText = (netPct >= 0 ? '+' : '') + netPct.toFixed(2) + ' %';

    // Avertissement (quantité nulle, partielle, ou dépasse)
    const warn = document.getElementById('sim-warning');
    const warns = [];
    if (qty <= 0) warns.push('Quantité nulle : aucune vente simulée.');
    if (qty > 0 && qty < asset.qty - 1e-9) warns.push(`Vente partielle : ${fmtQty(asset.qty - qty)} unité(s) resteront dans le portefeuille.`);
    if (qty > asset.qty + 1e-9) warns.push('Quantité demandée supérieure à la position détenue.');
    if (line.taxLine === 0 && pnl > 0) warns.push('Bonne nouvelle : aucune fiscalité estimée sur cette vente (franchise, abattement ou enveloppe exonérante).');
    warn.innerHTML = warns.map(w => `<div><i class="fa-solid fa-circle-info mr-1"></i> ${escapeHTML(w)}</div>`).join('');
    warn.classList.toggle('hidden', warns.length === 0);
}

// Ouvre le formulaire de cession pré-rempli avec les valeurs du simulateur.
function simulateToCessionForm() {
    const asset = assets.find(a => a.id === _simulatorAssetId);
    if (!asset) { closeModal('modal-simulate-sale'); return; }

    const qty       = parseFloat(document.getElementById('sim-quantity').value) || 0;
    const unitPrice = parseFloat(document.getElementById('sim-unit-price').value) || 0;
    const dateISO   = document.getElementById('sim-sale-date').value;

    if (qty <= 0) { alert('Quantité nulle : rien à concrétiser.'); return; }

    closeModal('modal-simulate-sale');
    openAddCessionModal();

    // Pré-remplissage via le flux normal du formulaire de cession
    document.getElementById('cession-source-asset').value = asset.id;
    prefillCessionFromAsset();

    // Écrase ensuite avec les valeurs de la simulation
    document.getElementById('cession-date-vente').value = dateISO;
    document.getElementById('cession-qty').value        = qty;
    document.getElementById('cession-prix-vente').value = (qty * unitPrice).toFixed(2);
    // Le prix d'achat total sera recalculé côté handleAddCession (défensif)
    updateCessionUnitPrices();
    onCessionQtyChange();
}

// =====================================================================
// DIVIDENDES — CRUD (Chantier 1.1)
// =====================================================================

// Ouvre le modal d'ajout OU d'édition d'un dividende.
//   openAddDividendModal(assetId)             → mode création
//   openAddDividendModal(assetId, dividendId) → mode édition
function openAddDividendModal(assetId, dividendId) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) {
        alert('Actif introuvable.');
        return;
    }
    const editId = dividendId !== undefined && dividendId !== null ? dividendId : null;

    document.getElementById('dividend-asset-id').value = assetId;
    document.getElementById('dividend-edit-id').value  = editId || '';

    if (editId) {
        const div = (asset.dividends || []).find(d => d.id === editId);
        if (!div) { alert('Dividende introuvable.'); return; }
        document.getElementById('modal-dividend-title').innerHTML =
            '<i class="fa-solid fa-pen text-emerald-400"></i> Modifier le dividende';
        document.getElementById('dividend-date').value      = div.date || new Date().toISOString().slice(0, 10);
        document.getElementById('dividend-kind').value      = div.kind || 'DIVIDENDE';
        document.getElementById('dividend-amount').value    = div.amount || '';
        document.getElementById('dividend-currency').value  = div.currency || 'EUR';
        document.getElementById('dividend-withheld').value  = div.taxWithheld || 0;
        document.getElementById('dividend-source').value    = div.source || '';
    } else {
        document.getElementById('modal-dividend-title').innerHTML =
            '<i class="fa-solid fa-sack-dollar text-emerald-400"></i> Nouveau dividende';
        document.getElementById('dividend-date').value      = new Date().toISOString().slice(0, 10);
        document.getElementById('dividend-kind').value      = 'DIVIDENDE';
        document.getElementById('dividend-amount').value    = '';
        document.getElementById('dividend-currency').value  = 'EUR';
        document.getElementById('dividend-withheld').value  = 0;
        document.getElementById('dividend-source').value    = '';
    }

    document.getElementById('modal-add-dividend').classList.remove('hidden');
}

// Validation + persistance du formulaire de dividende
function handleAddDividend(e) {
    e.preventDefault();

    const assetId = parseFloat(document.getElementById('dividend-asset-id').value);
    const editId  = document.getElementById('dividend-edit-id').value;
    const asset   = assets.find(a => a.id === assetId);
    if (!asset) { alert('Actif introuvable.'); return; }

    const date     = document.getElementById('dividend-date').value;
    const kind     = document.getElementById('dividend-kind').value;
    const amount   = parseFloat(document.getElementById('dividend-amount').value);
    const currency = document.getElementById('dividend-currency').value;
    const withheld = parseFloat(document.getElementById('dividend-withheld').value) || 0;
    const source   = document.getElementById('dividend-source').value.trim();

    // Validations
    if (!date) { alert('Renseignez la date du versement.'); return; }
    if (!Number.isFinite(amount) || amount <= 0) {
        alert('Le montant brut doit être strictement positif.');
        return;
    }
    if (withheld < 0) { alert('La retenue à la source ne peut pas être négative.'); return; }
    if (withheld > amount) {
        alert('La retenue à la source ne peut pas dépasser le montant brut.');
        return;
    }

    // Devise différente de EUR → on enregistre un avertissement informatif
    // (pas de conversion automatique à ce stade, la conversion nécessiterait
    //  une table de change historique ; l'utilisateur devra saisir le montant
    //  en EUR s'il veut une agrégation homogène).
    if (currency !== 'EUR') {
        const ok = confirm(
            `Vous enregistrez ce dividende en ${currency}.\n\n` +
            `L'application ne convertit PAS automatiquement les devises pour le calcul du TRI ` +
            `ni pour le rendement du portefeuille. Le montant sera additionné tel quel aux ` +
            `autres montants (mélange de devises).\n\n` +
            `Pour un résultat exact, saisissez le montant déjà converti en EUR.\n\n` +
            `Continuer quand même ?`
        );
        if (!ok) return;
    }

    if (!Array.isArray(asset.dividends)) asset.dividends = [];

    if (editId) {
        const idx = asset.dividends.findIndex(d => String(d.id) === String(editId));
        if (idx === -1) { alert('Dividende introuvable pour modification.'); return; }
        asset.dividends[idx] = {
            ...asset.dividends[idx],
            date, kind, amount, currency, taxWithheld: withheld, source
        };
    } else {
        asset.dividends.push({
            id: Date.now() + Math.floor(Math.random() * 100000),
            date, kind, amount, currency, taxWithheld: withheld, source
        });
    }

    // Tri chronologique croissant (cohérent avec les autres structures)
    asset.dividends.sort((a, b) => new Date(a.date) - new Date(b.date));

    saveToStorage();

    // Invalide les caches dépendants (TRI + scoring)
    if (typeof invalidateTIRCache === 'function') invalidateTIRCache();
    if (typeof invalidateScoringCache === 'function') invalidateScoringCache();
    if (typeof _sparklineCache !== 'undefined' && _sparklineCache.clear) _sparklineCache.clear();

    closeModal('modal-add-dividend');

    // Re-render : tableau + KPI + stats globales + inventaire + détail actif
    refreshAllUI();

    // Recharge le tableau des dividendes dans le modal de détail actif si ouvert
    if (currentAssetDetailId === assetId) {
        const refreshedAsset = assets.find(a => a.id === assetId);
        if (refreshedAsset) renderAssetDividendsTable(refreshedAsset);
    }

    e.target.reset();
}

// Suppression d'un dividende avec confirmation (récap du contenu)
function deleteDividend(assetId, dividendId) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;
    const div = (asset.dividends || []).find(d => String(d.id) === String(dividendId));
    if (!div) return;

    const dt = parseFlexDate(div.date);
    const dtTxt = dt ? dt.toLocaleDateString('fr-FR') : '—';
    const net = (Number(div.amount) || 0) - (Number(div.taxWithheld) || 0);

    const recap =
        `Date : ${dtTxt}\n` +
        `Type : ${div.kind || 'DIVIDENDE'}\n` +
        `Montant brut : ${formatEUR(div.amount)}\n` +
        `Retenue : ${formatEUR(div.taxWithheld || 0)}\n` +
        `Net perçu : ${formatEUR(net)}` +
        (div.source ? `\nSource : ${div.source}` : '');

    if (!confirm(`Supprimer ce dividende ?\n\n${recap}\n\nCette action est irréversible.`)) return;

    pushUndo('Suppression d\'un dividende');
    asset.dividends = asset.dividends.filter(d => String(d.id) !== String(dividendId));
    saveToStorage();

    // Invalide les caches dépendants
    if (typeof invalidateTIRCache === 'function') invalidateTIRCache();
    if (typeof invalidateScoringCache === 'function') invalidateScoringCache();
    if (typeof _sparklineCache !== 'undefined' && _sparklineCache.clear) _sparklineCache.clear();

    refreshAllUI();

    // Recharge le tableau si le modal est encore ouvert
    if (currentAssetDetailId === assetId) {
        const refreshedAsset = assets.find(a => a.id === assetId);
        if (refreshedAsset) renderAssetDividendsTable(refreshedAsset);
    }
}

// =====================================================================
// SPLITS & REVERSE SPLITS — CRUD (Chantier 1.3)
// ---------------------------------------------------------------------
// Un split est NEUTRE fiscalement : il multiplie la quantité et divise le
// prix unitaire, sans changer la valeur totale ni le capital investi.
//   ratio > 1 → split (ex: 10 pour 10:1)
//   0 < ratio < 1 → reverse split (ex: 0.1 pour 1:10)
//
// On applique le ratio à :
//   • asset.qty
//   • chaque lot : qty, qtyRemaining, price
//   • chaque buy  : qty, price  (pour cohérence du TRI)
// On NE TOUCHE PAS à :
//   • asset.invested (capital investi total, inchangé)
//   • asset.value    (valeur de marché totale, inchangée)
//   • asset.history  (séries de valeurs totales, inchangées)
//   • les cessions déjà enregistrées (à la charge de l'utilisateur)
// =====================================================================

function openSplitModal(assetId) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) { alert('Actif introuvable.'); return; }
    if (!asset.lots || asset.lots.length === 0) {
        alert('Cet actif n\'a aucun lot. Le split n\'a rien à modifier.');
        return;
    }

    document.getElementById('split-asset-id').value = assetId;
    document.getElementById('split-asset-name').innerText = asset.name;
    document.getElementById('split-asset-qty').innerText = fmtQty(asset.qty);
    const pru = computePRUFromLots(asset);
    document.getElementById('split-asset-pru').innerText = formatUnitPrice(pru);

    // Valeurs par défaut
    document.querySelector('input[name="split-type"][value="SPLIT"]').checked = true;
    document.getElementById('split-ratio-a').value = 10;
    document.getElementById('split-ratio-b').value = 1;
    document.getElementById('split-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('split-note').value = '';

    onSplitTypeChange();
    document.getElementById('modal-add-split').classList.remove('hidden');
}

// Adapte les libellés et les valeurs par défaut selon le type choisi.
function onSplitTypeChange() {
    const type = document.querySelector('input[name="split-type"]:checked')?.value || 'SPLIT';
    const labelA = document.getElementById('split-label-a');
    const labelB = document.getElementById('split-label-b');
    const inputA = document.getElementById('split-ratio-a');
    const inputB = document.getElementById('split-ratio-b');

    if (type === 'SPLIT') {
        labelA.innerText = 'Nouvelles actions reçues *';
        labelB.innerText = 'Anciennes actions échangées *';
        // Valeurs par défaut pour un split classique : 10:1
        if (inputA.value === '1' && inputB.value === '10') {
            inputA.value = 10;
            inputB.value = 1;
        }
    } else {
        labelA.innerText = 'Nouvelles actions après regroupement *';
        labelB.innerText = 'Anciennes actions regroupées *';
        // Valeurs par défaut pour un reverse split : 1:10
        if (inputA.value === '10' && inputB.value === '1') {
            inputA.value = 1;
            inputB.value = 10;
        }
    }
    updateSplitPreview();
}

// Calcule et affiche l'aperçu avant / après en temps réel.
function updateSplitPreview() {
    const assetId = parseFloat(document.getElementById('split-asset-id').value);
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;

    const a = parseFloat(document.getElementById('split-ratio-a').value) || 0;
    const b = parseFloat(document.getElementById('split-ratio-b').value) || 0;

    // Récupère les éléments du preview
    const elQtyB = document.getElementById('split-preview-qty-before');
    const elPruB = document.getElementById('split-preview-pru-before');
    const elInvB = document.getElementById('split-preview-inv-before');
    const elQtyA = document.getElementById('split-preview-qty-after');
    const elPruA = document.getElementById('split-preview-pru-after');
    const elInvA = document.getElementById('split-preview-inv-after');
    if (!elQtyB || !elQtyA) return;

    const pruBefore = computePRUFromLots(asset);
    elQtyB.innerText = fmtQty(asset.qty);
    elPruB.innerText = formatUnitPrice(pruBefore);
    elInvB.innerText = formatEUR(asset.invested);

    if (a <= 0 || b <= 0) {
        elQtyA.innerText = '—';
        elPruA.innerText = '—';
        elInvA.innerText = '—';
        return;
    }

    const ratio = a / b;
    const qtyAfter = asset.qty * ratio;
    const pruAfter = ratio > 0 ? pruBefore / ratio : 0;

    elQtyA.innerText = fmtQty(qtyAfter);
    elPruA.innerText = formatUnitPrice(pruAfter);
    elInvA.innerText = formatEUR(asset.invested) + ' (inchangé)';
}

// Applique définitivement le split à l'actif et à tous ses lots.
function handleAddSplit(e) {
    e.preventDefault();

    const assetId = parseFloat(document.getElementById('split-asset-id').value);
    const asset = assets.find(a => a.id === assetId);
    if (!asset) { alert('Actif introuvable.'); return; }

    const type = document.querySelector('input[name="split-type"]:checked')?.value || 'SPLIT';
    const a = parseFloat(document.getElementById('split-ratio-a').value) || 0;
    const b = parseFloat(document.getElementById('split-ratio-b').value) || 0;
    const date = document.getElementById('split-date').value;
    const note = document.getElementById('split-note').value.trim();

    if (a <= 0 || b <= 0) {
        alert('Les deux valeurs du ratio doivent être strictement positives.');
        return;
    }
    if (!date) {
        alert('Renseignez la date d\'effet du split.');
        return;
    }
    const ratio = a / b;
    if (ratio === 1) {
        alert('Le ratio vaut 1 :1, aucune modification ne serait appliquée.');
        return;
    }

    // Confirmation avec récapitulatif chiffré
    const pruBefore = computePRUFromLots(asset);
    const qtyAfter = asset.qty * ratio;
    const pruAfter = pruBefore / ratio;

    const opLabel = type === 'SPLIT' ? 'Split' : 'Reverse split';
    const msg =
        `${opLabel} ${a}:${b} — ${asset.name}\n\n` +
        `Quantité : ${fmtQty(asset.qty)} → ${fmtQty(qtyAfter)}\n` +
        `PRU/u : ${formatUnitPrice(pruBefore)} → ${formatUnitPrice(pruAfter)}\n` +
        `Capital investi : ${formatEUR(asset.invested)} (inchangé)\n\n` +
        `Cette opération modifiera tous les lots en cours. Confirmer ?`;

    if (!confirm(msg)) return;

    pushUndo(`${opLabel} ${a}:${b} sur ${asset.name}`);

    // --- 1) Applique le ratio à la quantité totale ---
    asset.qty = qtyAfter;

    // --- 2) Applique le ratio à chaque lot (qty, qtyRemaining, price) ---
    // Les frais du lot restent inchangés (montant total en EUR).
    // Le prix unitaire est divisé par le ratio → prix_lot × qty_lot reste
    // strictement identique, donc le PRU total NE CHANGE PAS.
    (asset.lots || []).forEach(lot => {
        lot.qty          = (lot.qty || 0) * ratio;
        lot.qtyRemaining = (lot.qtyRemaining || 0) * ratio;
        lot.price        = (lot.price || 0) / ratio;
    });

    // --- 3) Applique le ratio aux buys (pour cohérence du TRI) ---
    (asset.buys || []).forEach(buy => {
        buy.qty   = (buy.qty || 0) * ratio;
        buy.price = (buy.price || 0) / ratio;
        // buy.total reste identique
    });

    // --- 4) asset.value et asset.invested sont INCHANGÉS (neutre fiscalement) ---
    // Mais asset.frais doit rester cohérent : il est déjà en EUR total → inchangé.

    // --- 5) Enregistre le split dans l'historique ---
    if (!Array.isArray(asset.splits)) asset.splits = [];
    asset.splits.push({
        id:        Date.now() + Math.floor(Math.random() * 100000),
        date,
        ratio,
        note,
        appliedAt: Date.now()
    });
    asset.splits.sort((x, y) => new Date(x.date) - new Date(y.date));

    // --- 6) Invalide les caches dépendants ---
    if (typeof invalidateTIRCache === 'function') invalidateTIRCache();
    if (typeof invalidateScoringCache === 'function') invalidateScoringCache();
    if (typeof _sparklineCache !== 'undefined' && _sparklineCache.clear) _sparklineCache.clear();

    saveToStorage();
    closeModal('modal-add-split');
    refreshAllUI();

    // Recharge le tableau des lots si le modal de détail est ouvert
    if (currentAssetDetailId === assetId) {
        const refreshed = assets.find(a => a.id === assetId);
        if (refreshed) {
            renderAssetLotsTable(refreshed);
            renderAssetDividendsTable(refreshed);
            renderFxEffectPanel(refreshed);
        }
    }

    e.target.reset();
}

// Suppression d'un split de l'historique (NE REJOUE PAS l'opération inverse).
// L'utilisateur est averti qu'il doit corriger manuellement s'il veut revenir en arrière.
function deleteSplit(assetId, splitId) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;
    const sp = (asset.splits || []).find(s => String(s.id) === String(splitId));
    if (!sp) return;

    const dt = parseFlexDate(sp.date);
    const dtTxt = dt ? dt.toLocaleDateString('fr-FR') : '—';
    const label = sp.ratio >= 1 ? `split ${sp.ratio}:1` : `reverse split 1:${(1 / sp.ratio).toFixed(0)}`;

    const msg =
        `Supprimer ce split de l'historique ?\n\n` +
        `Date : ${dtTxt}\n` +
        `Opération : ${label}\n` +
        (sp.note ? `Note : ${sp.note}\n` : '') +
        `\n⚠ ATTENTION : la suppression ne défait PAS l'opération sur les lots.\n` +
        `Si vous voulez revenir à la situation antérieure, appliquez un split inverse ` +
        `manuellement (ex: ${sp.ratio}:1 au lieu de 1:${sp.ratio.toFixed(0)}).\n\n` +
        `Confirmer la suppression de l'entrée d'historique ?`;

    if (!confirm(msg)) return;

    pushUndo('Suppression d\'un split');
    asset.splits = asset.splits.filter(s => String(s.id) !== String(splitId));
    saveToStorage();
    refreshAllUI();

    if (currentAssetDetailId === assetId) {
        const refreshed = assets.find(a => a.id === assetId);
        if (refreshed) renderAssetLotsTable(refreshed);
    }
}