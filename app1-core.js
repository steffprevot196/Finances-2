// =====================================================================
// app1-core.js — CONSTANTES, CATALOGUES, ÉTAT GLOBAL
// Aucune dépendance DOM. Chargé en premier.
// =====================================================================

// --- CATALOGUE AUCOFFRE.COM (Jetons Or/Argent, Pièces, Lingots) ---
const auCoffreCatalog = [
    { name: 'Vera Valor 1 Ounce Gold (Or Pur 999.9)', ticker: 'VV1OZ', weightGrams: 31.10, primePct: 0.02, category: 'Or & Métaux', cadran: 'OR', taxCategory: 'JETON', basePriceEUR: 2480.00 },
    { name: 'Vera Valor 1/20 Ounce Gold (Or Pur 999.9)', ticker: 'VV1/20OZ', weightGrams: 1.58, primePct: 0.02, category: 'Or & Métaux', cadran: 'OR', taxCategory: 'JETON', basePriceEUR: 135.00 },
    { name: 'Vera Valor 1/10 Ounce Gold (Or Pur 999.9)', ticker: 'VV1/10OZ', weightGrams: 3.11, primePct: 0.02, category: 'Or & Métaux', cadran: 'OR', taxCategory: 'JETON', basePriceEUR: 265.00 },
    { name: 'Vera Valor 1/2 Ounce Gold (Or Pur 999.9)', ticker: 'VV1/2OZ', weightGrams: 15.55, primePct: 0.02, category: 'Or & Métaux', cadran: 'OR', taxCategory: 'JETON', basePriceEUR: 1260.00 },
    { name: 'Vera Max 1/10 Ounce Gold', ticker: 'VMAX1/10', weightGrams: 3.11, primePct: 0.02, category: 'Or & Métaux', cadran: 'OR', taxCategory: 'JETON', basePriceEUR: 270.00 },
    { name: 'Vera Silver 1oz Argent', ticker: 'VS1OZ', weightGrams: 31.10, primePct: 0.05, category: 'Or & Métaux', cadran: 'OR', taxCategory: 'JETON', basePriceEUR: 32.50 },
    { name: 'Napoléon 20 Francs Or (Louis d\'Or)', ticker: 'NAP20', weightGrams: 5.80, primePct: 0.05, category: 'Or & Métaux', cadran: 'OR', taxCategory: 'COURS_LEGAL', basePriceEUR: 445.00 },
    { name: 'Napoléon 10 Francs Or (Demi-Napoléon)', ticker: 'NAP10', weightGrams: 2.90, primePct: 0.05, category: 'Or & Métaux', cadran: 'OR', taxCategory: 'COURS_LEGAL', basePriceEUR: 230.00 },
    { name: 'Krugerrand 1oz Or', ticker: 'KRUG1OZ', weightGrams: 31.10, primePct: 0.04, category: 'Or & Métaux', cadran: 'OR', taxCategory: 'COURS_LEGAL', basePriceEUR: 2460.00 },
    { name: 'Souverain Elisabeth II / George V Or', ticker: 'SOV-OR', weightGrams: 7.32, primePct: 0.05, category: 'Or & Métaux', cadran: 'OR', taxCategory: 'COURS_LEGAL', basePriceEUR: 550.00 },
    { name: '50 Pesos Or Mexicain', ticker: 'PESO50', weightGrams: 37.50, primePct: 0.04, category: 'Or & Métaux', cadran: 'OR', taxCategory: 'COURS_LEGAL', basePriceEUR: 2980.00 },
    { name: 'Maple Leaf 1oz Or', ticker: 'MAPLE1OZ', weightGrams: 31.10, primePct: 0.04, category: 'Or & Métaux', cadran: 'OR', taxCategory: 'COURS_LEGAL', basePriceEUR: 2475.00 },
    { name: 'Philharmonique 1oz Or', ticker: 'PHIL1OZ', weightGrams: 31.10, primePct: 0.04, category: 'Or & Métaux', cadran: 'OR', taxCategory: 'COURS_LEGAL', basePriceEUR: 2470.00 },
    { name: 'Lingot 1kg Or Pur 999', ticker: 'LING1KG', weightGrams: 1000, primePct: 0.01, category: 'Or & Métaux', cadran: 'OR', taxCategory: 'METAUX_PRECIEUX', basePriceEUR: 78500.00 },
    { name: 'Lingotin 100g Or Pur 999', ticker: 'LING100G', weightGrams: 100, primePct: 0.01, category: 'Or & Métaux', cadran: 'OR', taxCategory: 'METAUX_PRECIEUX', basePriceEUR: 7880.00 }
];

// --- CATALOGUE ACTIONS / ETF / FOREX ---
const popularMarketAssets = [
    { name: 'Yen Japonais (JPY/EUR)', ticker: 'JPY', category: 'Devises/Liquidités', cadran: 'MONNAIES', taxCategory: 'NON_CONCERNE', basePriceEUR: 0.0062 },
    { name: 'Dollar Américain (USD/EUR)', ticker: 'USD', category: 'Devises/Liquidités', cadran: 'MONNAIES', taxCategory: 'NON_CONCERNE', basePriceEUR: 0.92 },
    { name: 'Franc Suisse (CHF/EUR)', ticker: 'CHF', category: 'Devises/Liquidités', cadran: 'MONNAIES', taxCategory: 'NON_CONCERNE', basePriceEUR: 1.05 },
    { name: 'Livre Sterling (GBP/EUR)', ticker: 'GBP', category: 'Devises/Liquidités', cadran: 'MONNAIES', taxCategory: 'NON_CONCERNE', basePriceEUR: 1.18 },
    { name: 'SpaceX (Space Exploration Technologies)', ticker: 'SPCX', category: 'Actions/ETF', cadran: 'ASIE', taxCategory: 'NON_CONCERNE', basePriceEUR: 160.00 },
    { name: 'Amundi MSCI World ETF', ticker: 'CW8', isin: 'LU1737652237', category: 'Actions/ETF', cadran: 'ASIE', taxCategory: 'NON_CONCERNE', basePriceEUR: 512.00 },
    { name: 'Amundi PEA MSCI World ETF', ticker: 'WCEA', isin: 'FR0011869353', category: 'Actions/ETF', cadran: 'ASIE', taxCategory: 'NON_CONCERNE', basePriceEUR: 5.40 },
    { name: 'BNP Paribas Easy S&P 500 ETF', ticker: 'ESE', isin: 'FR0011550185', category: 'Actions/ETF', cadran: 'ASIE', taxCategory: 'NON_CONCERNE', basePriceEUR: 24.80 },
    { name: 'iShares Core S&P 500 ETF', ticker: 'CSPX', isin: 'IE00B4L5Y983', category: 'Actions/ETF', cadran: 'ASIE', taxCategory: 'NON_CONCERNE', basePriceEUR: 520.00 },
    { name: 'NVIDIA Corporation', ticker: 'NVDA', category: 'Actions/ETF', cadran: 'ASIE', taxCategory: 'NON_CONCERNE', basePriceEUR: 125.00 },
    { name: 'Apple Inc.', ticker: 'AAPL', category: 'Actions/ETF', cadran: 'ASIE', taxCategory: 'NON_CONCERNE', basePriceEUR: 210.00 },
    { name: 'iShares Euro Cash ETF', ticker: 'CSH2', category: 'Devises/Liquidités', cadran: 'MONNAIES', taxCategory: 'NON_CONCERNE', basePriceEUR: 102.10 },
    { name: 'TotalEnergies SE', ticker: 'TTE', category: 'Actions/ETF', cadran: 'PETROLE', taxCategory: 'NON_CONCERNE', basePriceEUR: 62.50 }
];

// --- CATALOGUE CRYPTOMONNAIES (Correction 4) ---
const cryptoCatalog = [
    { name: 'Bitcoin',         ticker: 'BTC',   basePriceEUR: 62000 },
    { name: 'Ethereum',        ticker: 'ETH',   basePriceEUR: 2400 },
    { name: 'Solana',          ticker: 'SOL',   basePriceEUR: 140 },
    { name: 'Cardano',         ticker: 'ADA',   basePriceEUR: 0.35 },
    { name: 'Ripple',          ticker: 'XRP',   basePriceEUR: 0.55 },
    { name: 'Dogecoin',        ticker: 'DOGE',  basePriceEUR: 0.12 },
    { name: 'Binance Coin',    ticker: 'BNB',   basePriceEUR: 520 },
    { name: 'Litecoin',        ticker: 'LTC',   basePriceEUR: 75 },
    { name: 'Polkadot',        ticker: 'DOT',   basePriceEUR: 5.5 },
    { name: 'Avalanche',       ticker: 'AVAX',  basePriceEUR: 28 },
    { name: 'Polygon (MATIC)', ticker: 'MATIC', basePriceEUR: 0.45 },
    { name: 'Chainlink',       ticker: 'LINK',  basePriceEUR: 14 }
];

// --- DONNÉES DE DÉMO ---
const defaultAssets = [
    { id: 1, name: 'Vera Valor 1/20 Ounce Gold', ticker: 'VV1/20OZ', category: 'Or & Métaux', cadran: 'OR', taxCategory: 'JETON', qty: 10, frais: 5.00, invested: 1300.00, value: 1350.00,
      buys: [{ date: '10/01/2024', type: 'Achat AuCoffre', qty: 10, price: 130.00, frais: 5.00, total: 1305.00 }],
      history: [{ date: 'Jan 2024', value: 1300, invested: 1300 }] },
    { id: 2, name: 'Napoléon 20 Francs Or', ticker: 'NAP20', category: 'Or & Métaux', cadran: 'OR', taxCategory: 'COURS_LEGAL', qty: 5, frais: 5.00, invested: 1875.00, value: 2225.00,
      buys: [{ date: '05/02/2022', type: 'Achat', qty: 5, price: 375.00, frais: 5.00, total: 1880.00 }],
      history: [{ date: 'Fév 2022', value: 1875, invested: 1875 }] },
    { id: 3, name: 'Yen Japonais (JPY/EUR)', ticker: 'JPY', category: 'Devises/Liquidités', cadran: 'MONNAIES', taxCategory: 'NON_CONCERNE', qty: 500000, frais: 2.00, invested: 3100.00, value: 3100.00,
      buys: [{ date: '12/03/2024', type: 'Change', qty: 500000, price: 0.0062, frais: 2.00, total: 3102.00 }],
      history: [{ date: 'Mar 2024', value: 3100, invested: 3100 }] }
];

const defaultCessions = [
    { id: 1, type: 'ACTION_ETF', name: 'TotalEnergies (TTE)', dateVente: '2025-04-15', dateAchat: '2016-03-10', prixVente: 14470.00, prixAchat: 9200.00, frais: 0, avant2018: true },
    { id: 2, type: 'ACTION_ETF', name: 'BNP Paribas', dateVente: '2025-06-20', dateAchat: '2023-05-15', prixVente: 6785.00, prixAchat: 8100.00, frais: 0, avant2018: false },
    { id: 3, type: 'CRYPTO', name: 'Bitcoin (BTC)', dateVente: '2025-11-05', dateAchat: '2022-01-20', prixVente: 4480.00, prixAchat: 1800.00, frais: 0, avant2018: false }
];

const defaultArbitrages = [
    { id: 1, date: '2024-11-02', source: 'Hors-Cadran (Livret A)', destination: 'Cadran ACTIONS (CW8)', montant: 2000, motif: 'DCA renforcé suite à correction des marchés actions.' },
    { id: 2, date: '2025-01-15', source: 'Crypto (BTC)', destination: 'Cadran OR (GGLD)', montant: 1500, motif: 'Prise de bénéfices crypto vers actif de protection (Or).' }
];

// =====================================================================
// ÉTAT GLOBAL DE L'APPLICATION
// =====================================================================
let assets       = JSON.parse(localStorage.getItem('patriMonial_assets'))     || defaultAssets;
let cessions     = JSON.parse(localStorage.getItem('patriMonial_cessions'))   || JSON.parse(JSON.stringify(defaultCessions));
let arbitrages   = JSON.parse(localStorage.getItem('patriMonial_arbitrages')) || JSON.parse(JSON.stringify(defaultArbitrages));
let taxRegimeMode = localStorage.getItem('patriMonial_taxMode') || 'PFU';
let taxTMI        = parseFloat(localStorage.getItem('patriMonial_tmi')) || 0.30;
let cessionFilter = 'ALL';
let activeTab     = 'tab-dashboard';

// Instances Chart.js (déclarées ici pour éviter la TDZ, cf. Correction 1)
let dashboardAllocChartInstance   = null;
let dashboardHistoryChartInstance = null;
let gaveChartInstance             = null;
let assetHistoryChartInstance     = null;
let quadrantHistoryChartInstance  = null;
// ⚠️ Correction 1 : déclarées AVANT toute fonction qui les utilise (destroyAllCharts)
let compareChartAllocInstance   = { A: null, B: null };
let compareChartHistoryInstance = { A: null, B: null };

// État UI
let currentQuadrantCode    = null;
let currentAssetDetailId   = null;
let dashboardRangeFilter   = 'ALL';
let quadrantRangeFilter    = 'ALL';
let assetDetailRangeFilter = 'ALL';
let inventoryFilter        = 'ALL';
let horsGaveFilter         = 'ALL';
let gaveDetailFilter       = new Set();
let compareActive          = false;
let compareSegmentA        = '';
let compareSegmentB        = '';
let compareRangeA          = 'ALL';
let compareRangeB          = 'ALL';
let pendingSellDate        = '';
let lastRiskMetrics        = {};
let realVolCache           = {};
let realSeriesCache        = {};
let finnhubApiKey          = localStorage.getItem('patriMonial_finnhubKey') || '';

// =====================================================================
// CONSTANTES MÉTIER
// =====================================================================
const DATA_VERSION = 2;
const GAVE_CODES   = ['OR', 'MONNAIES', 'ASIE', 'PETROLE'];
const GAVE_QUADRANTS = GAVE_CODES;
const METAL_TYPES    = ['JETON', 'COURS_LEGAL', 'METAUX_PRECIEUX'];

const ASSET_TAGS   = ['Action', 'ETF', 'Obligation', 'SCPI', 'Immobilier', 'Private Equity', 'Art / Collection', 'Or & Métaux', 'Matières Premières', 'Crypto', 'Devises/Liquidités', 'Autre'];
const SECURITY_TAGS = ['Action', 'ETF', 'Obligation'];
const MANUAL_VALUATION_TAGS = ['SCPI', 'Immobilier', 'Private Equity', 'Art / Collection'];

const ENVELOPPES = {
    CTO:      { label: 'Compte-Titres Ordinaire', short: 'CTO', plafond: null },
    PEA:      { label: 'PEA', short: 'PEA', plafond: 150000, exoAfterYears: 5 },
    PEA_PME:  { label: 'PEA-PME', short: 'PEA-PME', plafond: 225000, exoAfterYears: 5 },
    AV:       { label: 'Assurance-Vie', short: 'AV', plafond: null, ageFiscal: 8, abattementAnnuel: 4600 },
    PER:      { label: 'Plan Épargne Retraite', short: 'PER', plafond: null },
    LIVRET_A: { label: 'Livret A', short: 'Livret A', plafond: 22950, exo: true },
    LDDS:     { label: 'LDDS', short: 'LDDS', plafond: 12000, exo: true },
    LEP:      { label: 'LEP', short: 'LEP', plafond: 10000, exo: true },
    PEL:      { label: 'PEL', short: 'PEL', plafond: 61200 },
    CEL:      { label: 'CEL', short: 'CEL', plafond: 15300 }
};
const SECURITY_ENVELOPES   = ['CTO', 'PEA', 'PEA_PME', 'AV', 'PER'];
const CASH_ENVELOPES       = ['', 'LIVRET_A', 'LDDS', 'LEP', 'PEL', 'CEL'];
const ENVELOPES_WITH_DATE  = ['PEA', 'PEA_PME', 'AV', 'PER', 'PEL', 'CEL'];
const LEGACY_ENVELOPE_MAP  = { ASSURANCE_VIE: 'AV' };

const CADRAN_DEFAULT_NAMES = { OR: 'OR', MONNAIES: 'MONNAIES / DEVISES', ASIE: 'ACTIONS / ASIE', PETROLE: 'PÉTROLE / COMMODITIES' };
const CADRAN_NUM = { OR: 1, MONNAIES: 2, ASIE: 3, PETROLE: 4 };
let cadranNames = Object.assign({}, CADRAN_DEFAULT_NAMES, JSON.parse(localStorage.getItem('patriMonial_cadranNames') || '{}'));

const CADRAN_BADGE_COLORS = {
    OR: 'bg-amber-950 text-amber-300 border-amber-800/50',
    MONNAIES: 'bg-blue-950 text-blue-300 border-blue-800/50',
    ASIE: 'bg-emerald-950 text-emerald-300 border-emerald-800/50',
    PETROLE: 'bg-rose-950 text-rose-300 border-rose-800/50',
    CRYPTO: 'bg-purple-950 text-purple-300 border-purple-800/50',
    HORS_GAVE: 'bg-gray-800 text-gray-300 border-gray-700'
};

const METAL_TAX_OPTIONS = [
    { value: 'JETON', label: 'Jeton / Médaille (Exo < 5 000 €)' },
    { value: 'COURS_LEGAL', label: 'Pièce à Cours Légal (TFMP 11.5% / TPV)' },
    { value: 'METAUX_PRECIEUX', label: 'Lingot / Métal Précieux (TFMP 11.5%)' }
];

const FR_MONTHS = { 'jan': 0, 'fév': 1, 'fev': 1, 'mar': 2, 'avr': 3, 'mai': 4, 'juin': 5, 'juil': 6, 'aoû': 7, 'aou': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'déc': 11, 'dec': 11 };

const MSCI_WORLD_ANNUAL_RETURNS_EUR = {
    2014: 0.195, 2015: 0.104, 2016: 0.082, 2017: 0.075, 2018: -0.041,
    2019: 0.300, 2020: 0.063, 2021: 0.287, 2022: -0.128, 2023: 0.196, 2024: 0.260
};

const CRYPTO_COINGECKO_IDS = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', ADA: 'cardano', XRP: 'ripple', DOGE: 'dogecoin', BNB: 'binancecoin', LTC: 'litecoin', DOT: 'polkadot', AVAX: 'avalanche-2', MATIC: 'matic-network', LINK: 'chainlink' };
const CASH_CURRENCY_TICKERS = ['USD', 'JPY', 'CHF', 'GBP'];

// =====================================================================
// UTILITAIRES GÉNÉRIQUES
// =====================================================================
function formatEUR(v) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0);
}

function envelopeShort(code) {
    return code && ENVELOPPES[code] ? ENVELOPPES[code].short : '';
}

function looksLikeETF(name, ticker) {
    return /\b(ETF|UCITS|TRACKER|ISHARES|AMUNDI|LYXOR|XTRACKERS|VANGUARD|SPDR|MSCI|S&P ?500|NASDAQ ?100|EASY|ETC)\b/i
        .test(String(name || '') + ' ' + String(ticker || ''));
}

function parseFlexDate(str) {
    if (!str) return null;
    const s = String(str).trim();
    if (s.toLowerCase().includes('aujourd')) return new Date();
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    m = s.match(/^([A-Za-zéÉûù]+)\.?\s+(\d{4})$/);
    if (m) {
        const key = Object.keys(FR_MONTHS).find(k => m[1].toLowerCase().startsWith(k));
        if (key !== undefined) return new Date(+m[2], FR_MONTHS[key], 1);
    }
    const d = new Date(s);
    return isNaN(d) ? null : d;
}

// =====================================================================
// DÉRIVATION DES TAGS / CATÉGORIES (modèle v2)
// =====================================================================
function primaryCategoryFromTags(tags) {
    const has = t => tags.includes(t);
    if (has('Crypto')) return 'Crypto';
    if (has('Or & Métaux')) return 'Or & Métaux';
    if (has('Devises/Liquidités')) return 'Devises/Liquidités';
    if (has('Obligation')) return 'Obligations';
    if (has('Action') || has('ETF')) return 'Actions/ETF';
    if (has('Matières Premières')) return 'Matières Premières';
    if (has('SCPI') || has('Immobilier')) return 'Immobilier';
    if (has('Private Equity')) return 'Private Equity';
    if (has('Art / Collection')) return 'Art / Collection';
    return 'Autre';
}

function tagsFromLegacy(category, isETF, name) {
    const map = {
        'Or & Métaux': ['Or & Métaux'],
        'Devises/Liquidités': ['Devises/Liquidités'],
        'Actions/ETF': [isETF ? 'ETF' : 'Action'],
        'Obligations': ['Obligation'],
        'Crypto': ['Crypto'],
        'Matières Premières': ['Matières Premières'],
        'Autre': ['Autre']
    };
    const tags = (map[category] || ['Autre']).slice();
    if (isETF && !tags.includes('ETF')) tags.push('ETF');
    return tags;
}

function hasTag(a, tag) {
    return Array.isArray(a.categories) && a.categories.includes(tag);
}

function isSecurityAsset(a) {
    return Array.isArray(a.categories) && a.categories.some(t => SECURITY_TAGS.includes(t));
}

// =====================================================================
// NORMALISATION / MIGRATION D'UN ACTIF
// =====================================================================
function normalizeAsset(a) {
    // Tags (categories)
    if (!Array.isArray(a.categories) || a.categories.length === 0) {
        a.categories = tagsFromLegacy(a.category, a.isETF === true, a.name);
    }
    a.categories = [...new Set(a.categories.filter(t => ASSET_TAGS.includes(t)))];
    if (!a.categories.length) a.categories = ['Autre'];
    a.category = primaryCategoryFromTags(a.categories);

    // Cadrans (primary/secondary)
    if (!a.cadrans || typeof a.cadrans !== 'object') {
        a.cadrans = { primary: a.cadran || 'HORS_GAVE', secondary: [] };
    }
    if (!a.cadrans.primary) a.cadrans.primary = 'HORS_GAVE';
    if (!Array.isArray(a.cadrans.secondary)) a.cadrans.secondary = [];
    a.cadrans.secondary = [...new Set(a.cadrans.secondary)]
    .filter(c => GAVE_CODES.includes(c) && c !== a.cadrans.primary);

// Cohérence tag Crypto ↔ cadran CRYPTO (Correction 5)
if (a.cadrans.primary === 'CRYPTO' && !a.categories.includes('Crypto')) a.cadrans.primary = 'HORS_GAVE';
if (a.categories.includes('Crypto') && a.cadrans.primary === 'HORS_GAVE') a.cadrans.primary = 'CRYPTO';

a.cadran = a.cadrans.primary;

    // Enveloppes (ancien nom "enveloppe" -> nouveau "envelope")
    if (a.enveloppe !== undefined) {
        a.envelope = a.envelope || LEGACY_ENVELOPE_MAP[a.enveloppe] || a.enveloppe;
        delete a.enveloppe;
    }
    if (a.enveloppeDate !== undefined) {
        a.envelopeOpenedAt = a.envelopeOpenedAt || a.enveloppeDate;
        delete a.enveloppeDate;
    }
    if (LEGACY_ENVELOPE_MAP[a.envelope]) a.envelope = LEGACY_ENVELOPE_MAP[a.envelope];
    if (a.envelope === undefined || a.envelope === null) a.envelope = '';
    if (!a.envelope && isSecurityAsset(a)) a.envelope = 'CTO';
    if (a.envelope && !ENVELOPPES[a.envelope]) {
        a.envelope = isSecurityAsset(a) ? 'CTO' : '';
    }
    a.envelopeOpenedAt = a.envelopeOpenedAt || '';
    delete a.isETF;

        // Divers
        a.valuationMode = a.valuationMode || (a.categories.some(t => MANUAL_VALUATION_TAGS.includes(t)) ? 'MANUAL' : 'QUOTE');
        a.yahooTicker   = a.yahooTicker || '';
        a.zone          = a.zone || 'UE';
        a.isin          = (a.isin || '').toUpperCase().trim();

    // Initialisation des lots (rétrocompat : si absent, on en crée un à partir du premier achat)
    if (!Array.isArray(a.lots) || a.lots.length === 0) {
        const firstBuy = (a.buys && a.buys[0]) || null;
        if (firstBuy) {
            const buyDate = parseFlexDate(firstBuy.date);
            a.lots = [makeLot(
                buyDate ? buyDate.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
                Number(firstBuy.qty) || a.qty || 0,
                Number(firstBuy.price) || (a.qty ? (a.invested || 0) / a.qty : 0),
                Number(firstBuy.frais) || a.frais || 0,
                firstBuy.reference || a.reference || ''
            )];
        } else if (a.qty > 0) {
            // Pas de buys : on crée un lot unique à partir des totaux existants
            a.lots = [makeLot(
                new Date().toISOString().slice(0, 10),
                a.qty,
                (a.invested || 0) / a.qty,
                a.frais || 0,
                a.reference || ''
            )];
        }
    } else {
        // Nettoyage : s'assurer que chaque lot a un champ `reference`
        a.lots.forEach(l => { if (l.reference === undefined) l.reference = ''; });
    }
    return a;
}

function fixRelativeHistoryDates(a) {
    const todayFR = new Date().toLocaleDateString('fr-FR');
    (a.history || []).forEach(h => {
        if (typeof h.date === 'string' && h.date.toLowerCase().includes('aujourd')) h.date = todayFR;
    });
}

function migrateAssetToV2(a) {
    if (!Array.isArray(a.categories) && a.category === 'Actions/ETF' && a.isETF === undefined) {
        a.needsReclass = true;
        a.reclassSuggestion = looksLikeETF(a.name, a.ticker) ? 'ETF' : 'Action';
    }
    fixRelativeHistoryDates(a);
    return normalizeAsset(a);
}

function normalizeCession(c) {
    if (c.enveloppe !== undefined) {
        c.envelope = c.envelope || LEGACY_ENVELOPE_MAP[c.enveloppe] || c.enveloppe;
        delete c.enveloppe;
    }
    if (c.enveloppeDate !== undefined) {
        c.envelopeOpenedAt = c.envelopeOpenedAt || c.enveloppeDate;
        delete c.enveloppeDate;
    }
    if (LEGACY_ENVELOPE_MAP[c.envelope]) c.envelope = LEGACY_ENVELOPE_MAP[c.envelope];
    if (c.type === 'ACTION_ETF') {
        if (!c.subType) c.subType = looksLikeETF(c.name, '') ? 'ETF' : 'ACTION';
        if (!c.envelope) c.envelope = 'CTO';
    } else {
        c.envelope = '';
        delete c.subType;
    }
    c.envelopeOpenedAt = c.envelopeOpenedAt || '';
    c.zone = c.zone || 'UE';
    c.coupons = c.coupons || 0;
    return c;
}

// =====================================================================
// MIGRATION AU DÉMARRAGE (v1 -> v2)
// =====================================================================
function bootMigration() {
    const storedVer = parseInt(localStorage.getItem('patriMonial_dataVersion') || '1', 10);
    const hadData = localStorage.getItem('patriMonial_assets') !== null;

    if (hadData && storedVer < DATA_VERSION) {
        try {
            localStorage.setItem(
                'patriMonial_backup_v' + storedVer + '_' + Date.now(),
                JSON.stringify({ assets, cessions, arbitrages })
            );
        } catch (err) {
            console.warn('Sauvegarde pré-migration impossible :', err);
        }
    }

    assets.forEach(a => migrateAssetToV2(a));
    cessions.forEach(normalizeCession);

    if (storedVer < DATA_VERSION) {
        try {
            if (hadData) {
                localStorage.setItem('patriMonial_assets', JSON.stringify(assets));
                localStorage.setItem('patriMonial_cessions', JSON.stringify(cessions));
            }
            localStorage.setItem('patriMonial_dataVersion', String(DATA_VERSION));
        } catch (err) {
            console.warn('Écriture post-migration impossible :', err);
        }
    }
}

// =====================================================================
// LIBELLÉS DE CADRANS
// =====================================================================
function cadranLabel(code) {
    if (code === 'HORS_GAVE') return 'Hors-Cadran';
    if (code === 'CRYPTO') return 'Cryptomonnaies';
    return cadranNames[code] || code;
}

function cadranBadgeHTML(code) {
    const cls = CADRAN_BADGE_COLORS[code] || CADRAN_BADGE_COLORS.HORS_GAVE;
    return `<span class="px-2 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ${cls}">${cadranLabel(code)}</span>`;
}

function cadranSelectHTML(assetId, currentCadran) {
    const opts = [...GAVE_QUADRANTS, 'CRYPTO', 'HORS_GAVE'].map(code =>
        `<option value="${code}" ${code === currentCadran ? 'selected' : ''}>${code === 'HORS_GAVE' ? 'Hors-Cadran' : (code === 'CRYPTO' ? 'Cryptomonnaies' : `Cadran ${CADRAN_NUM[code]} : ${cadranLabel(code)}`)}</option>`
    ).join('');
    return `<select onchange="reassignAssetCadran(${assetId}, this.value)" class="bg-gray-950 border border-gray-800 rounded-md px-1.5 py-1 text-[10px] text-white focus:outline-none focus:border-indigo-500">${opts}</select>`;
}
// =====================================================================
// PERSISTANCE (localStorage)
// =====================================================================
function saveToStorage() {
    try { localStorage.setItem('patriMonial_assets', JSON.stringify(assets)); }
    catch (err) { console.warn('Sauvegarde actifs impossible (quota dépassé ?) :', err); }
}

function saveCessions() {
    try { localStorage.setItem('patriMonial_cessions', JSON.stringify(cessions)); }
    catch (err) { console.warn('Sauvegarde cessions impossible :', err); }
}

function saveArbitrages() {
    try { localStorage.setItem('patriMonial_arbitrages', JSON.stringify(arbitrages)); }
    catch (err) { console.warn('Sauvegarde arbitrages impossible :', err); }
}

function saveTaxSettings() {
    localStorage.setItem('patriMonial_taxMode', taxRegimeMode);
    localStorage.setItem('patriMonial_tmi', String(taxTMI));
}

// =====================================================================
// TIMELINE PORTEFEUILLE (utilisée par tous les graphiques)
// =====================================================================
function buildPortfolioTimeline(assetList = assets) {
    const assetPoints = assetList.map(a => {
        const pts = (a.history || [])
            .map(h => ({ date: parseFlexDate(h.date), invested: h.invested ?? a.invested, value: h.value ?? a.value }))
            .filter(p => p.date)
            .sort((x, y) => x.date - y.date);
        pts.push({ date: new Date(), invested: a.invested || 0, value: a.value || 0 });
        pts.sort((x, y) => x.date - y.date);
        return pts;
    });

    const allDates = [...new Set(assetPoints.flat().map(p => p.date.getTime()))].sort((a, b) => a - b);
    const labels = [], investedSeries = [], valueSeries = [];

    allDates.forEach(t => {
        let totalInvested = 0, totalValue = 0;
        assetPoints.forEach(pts => {
            let last = null;
            for (const p of pts) { if (p.date.getTime() <= t) last = p; else break; }
            if (last) { totalInvested += last.invested || 0; totalValue += last.value || 0; }
        });
        labels.push(new Date(t).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }));
        investedSeries.push(Math.round(totalInvested * 100) / 100);
        valueSeries.push(Math.round(totalValue * 100) / 100);
    });

    return { labels, investedSeries, valueSeries, rawDates: allDates };
}

function filterTimelineByRange(tl, range) {
    if (!range || range === 'ALL') return tl;

    const now = Date.now();
    let startDate, endDate;
    if (range === 'M12') {
        startDate = now - 365 * 24 * 3600 * 1000;
        endDate = now;
    } else if (range.startsWith('Y-')) {
        const year = parseInt(range.slice(2));
        startDate = new Date(year, 0, 1).getTime();
        endDate = new Date(year, 11, 31, 23, 59, 59).getTime();
    } else {
        return tl;
    }

    if (startDate > now) {
        return { labels: [], investedSeries: [], valueSeries: [], rawDates: [] };
    }
    endDate = Math.min(endDate, now);

    let startInvested = 0, startValue = 0, hasPriorPoint = false;
    for (let i = 0; i < tl.rawDates.length; i++) {
        if (tl.rawDates[i] <= startDate) {
            startInvested = tl.investedSeries[i];
            startValue = tl.valueSeries[i];
            hasPriorPoint = true;
        } else break;
    }

    const inRangeIdx = tl.rawDates.map((d, i) => i).filter(i => tl.rawDates[i] > startDate && tl.rawDates[i] <= endDate);

    const labels = [], investedSeries = [], valueSeries = [], rawDates = [];

    if (hasPriorPoint || inRangeIdx.length > 0) {
        labels.push(new Date(startDate).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }));
        investedSeries.push(startInvested);
        valueSeries.push(startValue);
        rawDates.push(startDate);
    }

    inRangeIdx.forEach(i => {
        labels.push(tl.labels[i]);
        investedSeries.push(tl.investedSeries[i]);
        valueSeries.push(tl.valueSeries[i]);
        rawDates.push(tl.rawDates[i]);
    });

    if (inRangeIdx.length === 0 && hasPriorPoint) {
        const closeDate = endDate;
        labels.push(new Date(closeDate).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }));
        investedSeries.push(startInvested);
        valueSeries.push(startValue);
        rawDates.push(closeDate);
    }

    return { labels, investedSeries, valueSeries, rawDates };
}

function getAvailableYears(assetList = assets) {
    const years = new Set([new Date().getFullYear()]);
    assetList.forEach(a => (a.history || []).forEach(h => {
        const d = parseFlexDate(h.date);
        if (d) years.add(d.getFullYear());
    }));
    return [...years].sort((a, b) => b - a);
}

function rangeSelectHTML(id, currentVal, years, onChangeFn) {
    let opts = `<option value="ALL" ${currentVal === 'ALL' ? 'selected' : ''}>Tout l'historique</option>`;
    opts += `<option value="M12" ${currentVal === 'M12' ? 'selected' : ''}>12 derniers mois</option>`;
    years.forEach(y => { opts += `<option value="Y-${y}" ${currentVal === 'Y-' + y ? 'selected' : ''}>Année ${y}</option>`; });
    return `<select id="${id}" onchange="${onChangeFn}(this.value)" class="bg-gray-950 border border-gray-800 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-indigo-500">${opts}</select>`;
}

// =====================================================================
// GESTION DES LOTS (FIFO + PRU moyen)
// =====================================================================
// Chaque actif porte un tableau `lots`, chaque lot = { id, date, qty, qtyRemaining, price, frais }.
// - PRU moyen  : méthode officielle française (art. 150-0 D du CGI)
// - FIFO       : méthode utilisée pour la traçabilité et le calcul ligne à ligne
// =====================================================================

// Crée un lot à partir d'un achat (reference optionnelle : n° de série AuCoffre, etc.)
function makeLot(date, qty, price, frais, reference) {
    return {
        id: Date.now() + Math.floor(Math.random() * 1000),
        date,
        qty,
        qtyRemaining: qty,
        price,
        frais: frais || 0,
        reference: (reference || '').trim()
    };
}

// Calcule le PRU moyen pondéré d'un actif (méthode fiscale française)
// PRU = (Σ(qty × prix) + Σ frais) / Σ qty  → calculé uniquement sur les lots restants
function computePRUFromLots(asset) {
    const lots = (asset.lots || []).filter(l => (l.qtyRemaining || 0) > 0);
    if (lots.length === 0) return 0;
    const totalQty = lots.reduce((s, l) => s + (l.qtyRemaining || 0), 0);
    if (totalQty <= 0) return 0;
    const totalCost = lots.reduce((s, l) => s + (l.qtyRemaining || 0) * (l.price || 0), 0);
    const totalFrais = lots.reduce((s, l) => s + (l.frais || 0), 0);
    return (totalCost + totalFrais) / totalQty;
}

// Consomme `qtyToSell` unités en FIFO et retourne :
//  - le prix de revient total des unités vendues (pour la fiscalité)
//  - la liste des lots consommés (traçabilité)
//  - le prix de revient unitaire pondéré des unités vendues
function consumeFIFO(asset, qtyToSell) {
    const lots = (asset.lots || []).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    let remaining = qtyToSell;
    let totalCost = 0;
    const consumed = [];

    for (const lot of lots) {
        if (remaining <= 0) break;
        const available = lot.qtyRemaining || 0;
        if (available <= 0) continue;
        const take = Math.min(available, remaining);
        const unitCost = (lot.price || 0) + ((lot.frais || 0) / (lot.qty || 1));
        totalCost += take * unitCost;
        lot.qtyRemaining = available - take;
        consumed.push({ lotId: lot.id, date: lot.date, qty: take, unitCost });
        remaining -= take;
    }

    if (remaining > 0) {
        return { error: `Quantité insuffisante : ${qtyToSell} demandées, ${qtyToSell - remaining} disponibles en lots.` };
    }

    return {
        costBasis: totalCost,
        unitCost: totalCost / qtyToSell,
        consumedLots: consumed
    };
}

// Consomme un lot spécifique (par son id) — utilisé pour la vente nominative
// Retourne { costBasis, unitCost, consumedLots } ou { error }
function consumeLotById(asset, lotId, qtyToSell) {
    const lot = (asset.lots || []).find(l => String(l.id) === String(lotId));
    if (!lot) return { error: 'Lot introuvable.' };
    const available = lot.qtyRemaining || 0;
    if (available < qtyToSell) {
        return { error: `Quantité insuffisante dans ce lot : ${available} disponibles, ${qtyToSell} demandées.` };
    }
    const unitCost = (lot.price || 0) + ((lot.frais || 0) / (lot.qty || 1));
    const totalCost = unitCost * qtyToSell;
    lot.qtyRemaining = available - qtyToSell;
    return {
        costBasis: totalCost,
        unitCost: unitCost,
        consumedLots: [{ lotId: lot.id, date: lot.date, qty: qtyToSell, unitCost, reference: lot.reference || '' }]
    };
}

// Recalcule qty, invested et value à partir des lots restants
function syncAssetFromLots(asset) {
    const lots = asset.lots || [];
    const qtyRemaining = lots.reduce((s, l) => s + (l.qtyRemaining || 0), 0);
    const totalCost = lots.reduce((s, l) => s + (l.qtyRemaining || 0) * (l.price || 0), 0);
    const totalFrais = lots.reduce((s, l) => s + (l.frais || 0), 0);

    asset.qty = qtyRemaining;
    asset.invested = totalCost + totalFrais;
    asset.frais = totalFrais;

    // La valeur actuelle est proportionnelle à la quantité restante si l'actif a déjà une valeur unitaire connue
    // (l'ancien `value` / ancien `qty` donne la valeur unitaire, qu'on multiplie par le nouveau `qty`)
    if (asset.qty > 0 && asset.value > 0) {
        // On ne touche pas à `value` : il sera recalculé par les flux de mise à jour de cours
    }
}



// =====================================================================
// UPSERT POINT D'HISTORIQUE DU JOUR
// =====================================================================
function upsertTodayHistoryPoint(asset, value, invested) {
    const todayStr = new Date().toDateString();
    asset.history = (asset.history || []).filter(h => {
        const d = parseFlexDate(h.date);
        return !(d && d.toDateString() === todayStr);
    });
    asset.history.push({ date: new Date().toLocaleDateString('fr-FR'), value, invested });
}

// =====================================================================
// SAUVEGARDE / RESTAURATION / IMPORT / EXPORT
// =====================================================================
function createSnapshot(label) {
    const backups = JSON.parse(localStorage.getItem('patriMonial_localBackups') || '[]');
    backups.push({
        label: label || new Date().toLocaleString('fr-FR'),
        at: Date.now(),
        data: currentDataSnapshot()
    });
    while (backups.length > 7) backups.shift();
    try { localStorage.setItem('patriMonial_localBackups', JSON.stringify(backups)); }
    catch (err) { console.warn('Sauvegarde locale impossible (quota ?) :', err); }
}

function currentDataSnapshot() {
    return {
        assets, cessions, arbitrages, cadranNames,
        dataVersion: DATA_VERSION,
        savedAt: new Date().toISOString()
    };
}

function checkDailyAutoBackup() {
    const last = localStorage.getItem('patriMonial_lastAutoBackup');
    const todayStr = new Date().toDateString();
    if (last !== todayStr) {
        createSnapshot('Auto — ' + todayStr);
        localStorage.setItem('patriMonial_lastAutoBackup', todayStr);
    }
}

function listLocalBackups() {
    return JSON.parse(localStorage.getItem('patriMonial_localBackups') || '[]');
}

// Export complet : actifs + cessions + arbitrages + noms de cadrans + préférences fiscales
function exportData() {
    const snapshot = {
        exportVersion: 2,
        exportedAt: new Date().toISOString(),
        app: 'PatriMonial',
        data: {
            assets,
            cessions,
            arbitrages,
            cadranNames,
            taxRegimeMode,
            taxTMI
        }
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `patrimonial_export_complet_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Import robuste : accepte l'ancien format (tableau d'actifs) ET le nouveau (snapshot complet)
function handleImportJSON(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const parsed = JSON.parse(ev.target.result);

            // Détection du format
            let newAssets, newCessions, newArbitrages, newCadranNames, newTaxMode, newTaxTMI;

            if (Array.isArray(parsed)) {
                // Ancien format : juste un tableau d'actifs
                newAssets = parsed;
                newCessions = cessions;         // on conserve les cessions actuelles
                newArbitrages = arbitrages;
                newCadranNames = cadranNames;
                newTaxMode = taxRegimeMode;
                newTaxTMI = taxTMI;
            } else if (parsed && parsed.data && Array.isArray(parsed.data.assets)) {
                // Nouveau format : snapshot complet
                newAssets = parsed.data.assets;
                newCessions = Array.isArray(parsed.data.cessions) ? parsed.data.cessions : [];
                newArbitrages = Array.isArray(parsed.data.arbitrages) ? parsed.data.arbitrages : [];
                newCadranNames = parsed.data.cadranNames || CADRAN_DEFAULT_NAMES;
                newTaxMode = parsed.data.taxRegimeMode || 'PFU';
                newTaxTMI = typeof parsed.data.taxTMI === 'number' ? parsed.data.taxTMI : 0.30;
            } else {
                throw new Error('Le fichier JSON n\'est ni un tableau d\'actifs ni un export complet PatriMonial.');
            }

            // Sauvegarde défensive de l'état actuel
            createSnapshot('Avant import JSON');

            // Confirmation utilisateur
            const msg = `Importer cette sauvegarde ?\n\n` +
                        `• ${newAssets.length} actif(s)\n` +
                        `• ${newCessions.length} cession(s)\n` +
                        `• ${newArbitrages.length} arbitrage(s)\n\n` +
                        `Vos données actuelles seront remplacées (une sauvegarde locale de l'état actuel a été créée).`;
            if (!confirm(msg)) return;

            // Application
            assets = newAssets;
            cessions = newCessions;
            arbitrages = newArbitrages;
            cadranNames = newCadranNames;
            taxRegimeMode = newTaxMode;
            taxTMI = newTaxTMI;

            // Migration v1 -> v2 si nécessaire (ajoute lots, reference, cadran, etc.)
            assets.forEach(a => migrateAssetToV2(a));
            cessions.forEach(normalizeCession);

            // Persistance
            saveToStorage(); saveCessions(); saveArbitrages(); saveTaxSettings();
            localStorage.setItem('patriMonial_cadranNames', JSON.stringify(cadranNames));

            refreshAllUI();
            alert(`Import réussi :\n• ${assets.length} actif(s)\n• ${cessions.length} cession(s)\n• ${arbitrages.length} arbitrage(s)`);
        } catch (err) {
            alert('Erreur d\'import : ' + err.message);
        } finally {
            e.target.value = '';
        }
    };
    reader.readAsText(file);
}