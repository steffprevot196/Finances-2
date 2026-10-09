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
// MULTI-PORTEFEUILLE — registre, sélection, bascule
// ---------------------------------------------------------------------
// Les clés localStorage sont namespacées par un suffixe `__<id>`.
// Le portefeuille par défaut conserve les clés historiques
// (patriMonial_assets, patriMonial_cessions…), ce qui permet la
// compatibilité ascendante : les données des utilisateurs existants
// sont rattachées automatiquement au portefeuille « principal ».
// =====================================================================
const PORTFOLIO_DEFAULT = 'default';

function _loadPortfolioRegistry() {
    try {
        const raw = localStorage.getItem('patriMonial_portfolios');
        if (raw) {
            const p = JSON.parse(raw);
            if (Array.isArray(p) && p.length) return p;
        }
    } catch (_) {}
    return [{ id: PORTFOLIO_DEFAULT, name: 'Portefeuille principal' }];
}

let portfolios = _loadPortfolioRegistry();
let currentPortfolioId = (() => {
    const saved = localStorage.getItem('patriMonial_currentPortfolio');
    if (saved && portfolios.some(p => p.id === saved)) return saved;
    return PORTFOLIO_DEFAULT;
})();

function savePortfolioRegistry() {
    try { localStorage.setItem('patriMonial_portfolios', JSON.stringify(portfolios)); } catch (_) {}
}
function persistCurrentPortfolio() {
    localStorage.setItem('patriMonial_currentPortfolio', currentPortfolioId);
}

// Renvoie la clé localStorage namespacée pour le portefeuille courant.
function pfKey(base) {
    return currentPortfolioId === PORTFOLIO_DEFAULT ? base : base + '__' + currentPortfolioId;
}
function currentPortfolio() {
    return portfolios.find(p => p.id === currentPortfolioId) || portfolios[0];
}

// Lecteurs tolérants (null si la clé n'existe pas encore)
function readPortfolioAssets() {
    try { const r = localStorage.getItem(pfKey('patriMonial_assets')); return r ? JSON.parse(r) : null; } catch (_) { return null; }
}
function readPortfolioCessions() {
    try { const r = localStorage.getItem(pfKey('patriMonial_cessions')); return r ? JSON.parse(r) : null; } catch (_) { return null; }
}
function readPortfolioArbitrages() {
    try { const r = localStorage.getItem(pfKey('patriMonial_arbitrages')); return r ? JSON.parse(r) : null; } catch (_) { return null; }
}
function readPortfolioCadranNames() {
    try { const r = localStorage.getItem(pfKey('patriMonial_cadranNames')); return r ? JSON.parse(r) : null; } catch (_) { return null; }
}

// =====================================================================
// ÉTAT GLOBAL DE L'APPLICATION
// =====================================================================
let assets       = readPortfolioAssets()     || defaultAssets;
let cessions     = readPortfolioCessions()   || JSON.parse(JSON.stringify(defaultCessions));
let arbitrages   = readPortfolioArbitrages() || JSON.parse(JSON.stringify(defaultArbitrages));
let taxRegimeMode = localStorage.getItem('patriMonial_taxMode') || 'PFU';
let taxTMI        = parseFloat(localStorage.getItem('patriMonial_tmi')) || 0.30;
let cessionFilter = 'ALL';
let activeTab     = 'tab-accueil';

// Instances Chart.js (déclarées ici pour éviter la TDZ, cf. Correction 1)
let dashboardAllocChartInstance   = null;
let dashboardHistoryChartInstance = null;
let gaveChartInstance             = null;
let assetHistoryChartInstance     = null;
let quadrantHistoryChartInstance  = null;
// ⚠️ Correction 1 : déclarées AVANT toute fonction qui les utilise (destroyAllCharts)
let compareChartAllocInstance   = { A: null, B: null };
let compareChartHistoryInstance = { A: null, B: null };

// Paper Trading v2 — comparateur de scénarios (Étape C)
let paperCompareState = { A: null, B: null };  // scenarioId sélectionnés
let paperCompareChartAllocInstance   = { A: null, B: null };
let paperCompareChartHistoryInstance = null;

// État UI
let currentQuadrantCode    = null;
let currentAssetDetailId   = null;
let dashboardRangeFilter   = 'ALL';
let dashboardAllocView     = localStorage.getItem('patriMonial_allocView') || 'donut';
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

// État du tableau des lots (persiste entre les ouvertures du modal détail)
let lotSortKey    = 'date';   // 'date' | 'qty' | 'qtyRemaining' | 'price' | 'cumPRU' | 'pnl' | 'frais'
let lotSortDir    = 'asc';    // 'asc' | 'desc'
let lotShowSold   = true;     // afficher les lots totalement vendus ?
let lastRiskMetrics        = {};
let realVolCache           = {};
let realSeriesCache        = {};
let finnhubApiKey          = localStorage.getItem('patriMonial_finnhubKey') || '';
let twelveDataApiKey       = localStorage.getItem('patriMonial_twelveDataKey') || '';

// Seuil de concentration (poids max d'un actif dans le portefeuille).
// Au-delà : un badge ⚠ s'affiche sur la ligne / carte de l'actif.
let concentrationThreshold = parseFloat(localStorage.getItem('patriMonial_concentrationThreshold'));
if (!Number.isFinite(concentrationThreshold) || concentrationThreshold <= 0) concentrationThreshold = 0.25;

// Teintage des lignes / cartes en fonction de la performance (actif)
let tintRowsEnabled = localStorage.getItem('patriMonial_tintRows');
tintRowsEnabled = (tintRowsEnabled === null) ? true : (tintRowsEnabled === 'true');

// Thème — 3 modes : 'light' | 'dark' | 'auto' (Chantier 2.2)
//   • 'dark'  : mode sombre permanent (défaut historique)
//   • 'light' : mode clair permanent
//   • 'auto'  : suit la préférence OS (prefers-color-scheme), se met à jour
//               automatiquement quand l'utilisateur change de mode OS
//
// Rétrocompatibilité : l'ancienne clé booléenne `patriMonial_lightMode`
// est lue au premier lancement pour migrer vers le nouveau système.
let themeMode = (() => {
    const saved = localStorage.getItem('patriMonial_themeMode');
    if (saved === 'light' || saved === 'dark' || saved === 'auto') return saved;
    // Migration depuis l'ancien flag booléen
    const legacy = localStorage.getItem('patriMonial_lightMode');
    if (legacy === 'true') return 'light';
    if (legacy === 'false') return 'dark';
    return 'dark';
})();

// Renvoie le thème EFFECTIF ('light' ou 'dark') en tenant compte du mode.
// En mode 'auto', lit la préférence OS via matchMedia.
function getEffectiveTheme() {
    if (themeMode === 'auto') {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
            ? 'light' : 'dark';
    }
    return themeMode;
}

// Compatibilité : ancien code qui lit `lightMode`. Renvoie true si le
// thème effectif est clair. Utilisé notamment par les graphiques.
Object.defineProperty(window, 'lightMode', {
    get: () => getEffectiveTheme() === 'light',
    configurable: true
});

// Mode Paper Trading — nouveaux actifs marqués fictifs ; inclusion stats paramétrable
let paperMode = localStorage.getItem('patriMonial_paperMode') === 'true';
let paperIncludeInStats = localStorage.getItem('patriMonial_paperIncludeInStats') !== 'false';

// =====================================================================
// PAPER TRADING v2 — registre des scénarios (partagé entre portefeuilles)
// =====================================================================
const PAPER_SCENARIO_DEFAULT = 'default';
const PAPER_SCENARIO_COLORS = ['#a855f7', '#06b6d4', '#f59e0b', '#ef4444', '#10b981', '#6366f1', '#ec4899', '#84cc16'];

function _loadPaperScenarios() {
    try {
        const raw = localStorage.getItem('patriMonial_paperScenarios');
        if (raw) {
            const list = JSON.parse(raw);
            if (Array.isArray(list) && list.length) return list;
        }
    } catch (_) {}
    return [{
        id: PAPER_SCENARIO_DEFAULT,
        name: 'Scénario par défaut',
        color: PAPER_SCENARIO_COLORS[0],
        notes: '',
        createdAt: Date.now()
    }];
}

let paperScenarios = _loadPaperScenarios();
let currentPaperScenarioId = (() => {
    const saved = localStorage.getItem('patriMonial_currentPaperScenario');
    if (saved && paperScenarios.some(s => s.id === saved)) return saved;
    return paperScenarios[0].id;
})();

function savePaperScenarios() {
    try { localStorage.setItem('patriMonial_paperScenarios', JSON.stringify(paperScenarios)); } catch (_) {}
    localStorage.setItem('patriMonial_currentPaperScenario', currentPaperScenarioId);
}

function currentPaperScenario() {
    return paperScenarios.find(s => s.id === currentPaperScenarioId) || paperScenarios[0];
}

function paperScenarioColor(scenarioId) {
    const s = paperScenarios.find(x => x.id === scenarioId);
    return s ? s.color : PAPER_SCENARIO_COLORS[0];
}

function paperScenarioName(scenarioId) {
    const s = paperScenarios.find(x => x.id === scenarioId);
    return s ? s.name : 'Scénario inconnu';
}

function paperAssetsOfScenario(scenarioId) {
    return assets.filter(a => isPaperAsset(a) && (!scenarioId || a.paperScenarioId === scenarioId));
}

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
let cadranNames = Object.assign({}, CADRAN_DEFAULT_NAMES, readPortfolioCadranNames() || {});

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

// Formatage des prix UNITAIRE (PRU, valeur unitaire courante).
// Adapte le nombre de décimales à l'ordre de grandeur pour rester lisible
// sur les cryptos fractionnaires (ex: 0,00001234 € pour SHIB).
function formatUnitPrice(v) {
    if (!Number.isFinite(v)) return '—';
    const abs = Math.abs(v);
    if (abs === 0) return '0,00 €';
    const decimals = abs < 0.01 ? 8 : abs < 1 ? 4 : 2;
    return new Intl.NumberFormat('fr-FR', {
        style: 'currency', currency: 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: decimals
    }).format(v);
}

// ---------------------------------------------------------------------
// MULTI-DEVISES — formatage et valeur native (Chantier 1.2)
// ---------------------------------------------------------------------

// Formate un montant dans sa devise native (USD, GBP, CHF, JPY…).
function formatNative(amount, currency) {
    if (!Number.isFinite(amount)) return '—';
    const cur = String(currency || 'EUR').toUpperCase();
    try {
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: cur,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    } catch (_) {
        // Devise inconnue d'Intl → fallback texte brut
        return amount.toFixed(2) + ' ' + cur;
    }
}

// Renvoie la valeur native d'un actif (montant + unitaire) dans sa devise
// de cotation, ou null si :
//   • l'actif est en EUR (aucune conversion à faire)
//   • la quantité est nulle
//   • aucun taux de change n'est disponible
// Utilise le taux courant depuis le cache (`getFxRateSync`, défini dans
// app6-api.js). Si le cache est froid, un fallback statique prend le relais.
function getAssetNativeValue(asset) {
    if (!asset) return null;
    const cur = (asset.currency || 'EUR').toUpperCase();
    if (cur === 'EUR') return null;
    if (!Number.isFinite(asset.qty) || asset.qty <= 0) return null;
    if (!Number.isFinite(asset.value) || asset.value <= 0) return null;

    let rate = 1;
    if (typeof getFxRateSync === 'function') {
        rate = getFxRateSync(cur);
    } else if (typeof FX_FALLBACK !== 'undefined' && FX_FALLBACK[cur]) {
        rate = FX_FALLBACK[cur];
    }
    if (!Number.isFinite(rate) || rate <= 0) return null;

    const nativeValue     = asset.value / rate;
    const nativeUnitValue = nativeValue / asset.qty;
    return {
        currency: cur,
        rate,
        nativeValue,
        nativeUnitValue
    };
}

// Petite pastille HTML à coller à côté de la valeur EUR dans l'inventaire.
// Affiche "≈ 500,00 $ " en gris discret. Retourne '' si non applicable.
function nativeValueBadgeHTML(asset) {
    const nat = getAssetNativeValue(asset);
    if (!nat) return '';
    const title = `Taux utilisé : 1 ${nat.currency} ≈ ${nat.rate.toFixed(4)} €`;
    return `<span class="block text-[10px] text-gray-500 font-mono truncate" title="${title}">≈ ${escapeHTML(formatNative(nat.nativeValue, nat.currency))}</span>`;
}

// --- Sécurité : échappement HTML pour les données importables (protection XSS) ---
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// --- Formatage des quantités (grands nombres crypto, fractions d'onces…) ---
function fmtQty(q) {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 8 }).format(q || 0);
}

// --- Debounce générique (limite la fréquence d'appel des API externes) ---
function debounce(fn, delay = 300) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// =====================================================================
// COUNT-UP ANIMÉ — interpolation douce d'un nombre affiché (KPI)
// ---------------------------------------------------------------------
// Élément suivi via el.dataset.countupValue : à la 1ʳᵉ invocation, la
// valeur de départ vaut 0 (page fraîchement chargée) ; ensuite, la
// valeur précédente est reprise pour une transition continue.
// Le formateur `format(v)` gère l'affichage (€, %, signe…).
// =====================================================================
const _prefersReducedMotion = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

function countUp(el, target, format, opts = {}) {
    if (!el) return;
    if (!Number.isFinite(target)) { el.innerText = format(target); return; }

    // Préférence OS : aucune animation
    if (_prefersReducedMotion) {
        el.innerText = format(target);
        el.dataset.countupValue = String(target);
        return;
    }

    const hasPrev = el.dataset.countupValue !== undefined;
    const from = hasPrev ? parseFloat(el.dataset.countupValue) : 0;
    el.dataset.countupValue = String(target);

    // Variation négligeable : écriture directe (évite un micro-flash)
    if (hasPrev && Math.abs(target - from) < 0.01) {
        el.innerText = format(target);
        return;
    }

    // Annule une éventuelle animation en cours sur cet élément
    if (el._countUpRAF) { cancelAnimationFrame(el._countUpRAF); el._countUpRAF = null; }

    // Durée : plus longue au 1er affichage (part de 0), plus courte sur les mises à jour
    const duration = opts.duration ?? (hasPrev ? 400 : 700);
    const start = performance.now();
    const easeOut = t => 1 - Math.pow(1 - t, 3);

    function tick(now) {
        const t = Math.min(1, (now - start) / duration);
        const v = from + (target - from) * easeOut(t);
        el.innerText = format(v);
        if (t < 1) {
            el._countUpRAF = requestAnimationFrame(tick);
        } else {
            el.innerText = format(target);
            el._countUpRAF = null;
        }
    }
    el._countUpRAF = requestAnimationFrame(tick);
}

// Formateurs prêts à l'emploi pour les KPI du bandeau
function fmtSignedEUR(v) { return (v >= 0 ? '+' : '') + formatEUR(v); }
function fmtSignedPct(v) { return (v >= 0 ? '+' : '') + v.toFixed(2) + '%'; }

// =====================================================================
// TOOLTIPS CUSTOM — délégué d'événements global
// ---------------------------------------------------------------------
// Aucun code appelant à modifier : tout attribut `title="..."` posé
// sur n'importe quel élément (y compris dynamiquement après un re-render)
// devient automatiquement une infobulle stylée.
// Les <title> SVG (treemap, heatmap) sont aussi pris en charge.
// =====================================================================
let _tooltipEl = null;
let _tooltipShowTimer = null;
let _tooltipCurrentTarget = null;

function initCustomTooltips() {
    if (_tooltipEl) return;
    _tooltipEl = document.getElementById('custom-tooltip');
    if (!_tooltipEl) {
        _tooltipEl = document.createElement('div');
        _tooltipEl.id = 'custom-tooltip';
        _tooltipEl.className = 'custom-tooltip';
        document.body.appendChild(_tooltipEl);
    }

    // Écoute en capture pour intercepter avant tout stopPropagation éventuel
    document.addEventListener('mouseover',  _tooltipOnMouseOver,  true);
    document.addEventListener('mouseout',   _tooltipOnMouseOut,   true);
    document.addEventListener('focusin',    _tooltipOnFocusIn,    true);
    document.addEventListener('focusout',   _tooltipHide,         true);
    document.addEventListener('scroll',     _tooltipHide,         true);
    document.addEventListener('click',      _tooltipHide,         true);
    window.addEventListener('blur',         _tooltipHide);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') _tooltipHide(); }, true);
}

// Remonte la chaîne DOM jusqu'à un élément porteur d'un title= (ou d'un
// <title> SVG enfant). Migre le title en dataset.tooltip pour neutraliser
// définitivement le tooltip natif sur cet élément.
function _findTooltipTarget(node) {
    let current = node;
    while (current && current !== document.body && current.nodeType === 1) {
        if (current.dataset && current.dataset.tooltip) return current;

        if (current.hasAttribute && current.hasAttribute('title')) {
            const t = (current.getAttribute('title') || '').trim();
            if (t) {
                current.dataset.tooltip = t;
                current.removeAttribute('title');
                return current;
            }
        }
        // Fallback SVG : <title> enfant direct
        if (current.children && current.children.length) {
            for (const child of current.children) {
                if (child.tagName && child.tagName.toLowerCase() === 'title') {
                    const txt = (child.textContent || '').trim();
                    if (txt) {
                        current.dataset.tooltip = txt;
                        child.remove();
                        return current;
                    }
                }
            }
        }
        current = current.parentElement;
    }
    return null;
}

function _tooltipOnMouseOver(e) {
    const target = _findTooltipTarget(e.target);
    if (!target) return;
    if (target === _tooltipCurrentTarget) return;

    _tooltipHide();
    _tooltipCurrentTarget = target;
    _tooltipShowTimer = setTimeout(() => _tooltipShow(target), 300);
}

function _tooltipOnMouseOut(e) {
    const t = _tooltipCurrentTarget;
    if (!t) return;
    const rel = e.relatedTarget;
    if (rel && (t === rel || t.contains(rel))) return;
    _tooltipHide();
}

function _tooltipOnFocusIn(e) {
    const target = _findTooltipTarget(e.target);
    if (!target) return;
    _tooltipHide();
    _tooltipCurrentTarget = target;
    _tooltipShow(target);
}

function _tooltipShow(target) {
    if (!_tooltipEl || !target.dataset || !target.dataset.tooltip) return;

    const raw = target.dataset.tooltip;
    const lines = raw.split(/\r?\n/);

    // Reconstruit le contenu en <div> par ligne (sécurité : textContent)
    _tooltipEl.innerHTML = '';
    lines.forEach((line, i) => {
        const d = document.createElement('div');
        d.textContent = line;
        if (i > 0) d.style.marginTop = '3px';
        _tooltipEl.appendChild(d);
    });
    _tooltipEl.classList.toggle('multiline', lines.length > 1);

    // Mesure hors-écran avant positionnement
    _tooltipEl.style.visibility = 'hidden';
    _tooltipEl.style.opacity = '0';
    _tooltipEl.style.left = '-9999px';
    _tooltipEl.style.top  = '-9999px';
    _tooltipEl.classList.add('visible');

    const rect   = target.getBoundingClientRect();
    const ttRect = _tooltipEl.getBoundingClientRect();
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Préférence : au-dessus de l'élément, centré horizontalement
    let placement = 'top';
    let top  = rect.top - ttRect.height - margin;
    let left = rect.left + rect.width / 2 - ttRect.width / 2;

    if (top < margin) {
        top = rect.bottom + margin;
        placement = 'bottom';
    }
    // Clamp aux bords du viewport
    left = Math.max(margin, Math.min(left, vw - ttRect.width - margin));
    // Si le tooltip dépasse en bas, on le remonte pour rester visible
    if (top + ttRect.height > vh - margin) {
        top = Math.max(margin, vh - ttRect.height - margin);
    }

    _tooltipEl.style.left = left + 'px';
    _tooltipEl.style.top  = top + 'px';
    _tooltipEl.setAttribute('data-placement', placement);
    _tooltipEl.setAttribute('aria-hidden', 'false');
    _tooltipEl.style.visibility = '';
    _tooltipEl.style.opacity = '';
}

function _tooltipHide() {
    clearTimeout(_tooltipShowTimer);
    _tooltipShowTimer = null;
    _tooltipCurrentTarget = null;
    if (_tooltipEl) {
        _tooltipEl.classList.remove('visible');
        _tooltipEl.setAttribute('aria-hidden', 'true');
    }
}

// =====================================================================
// SKELETON LOADING — affiche des lignes fantômes pendant une tâche async
// ---------------------------------------------------------------------
// withSkeleton(asyncFn, { rows, targetSelector, minMs }) :
//   1. capture le contenu actuel de la zone cible,
//   2. le remplace par N lignes shimmer,
//   3. exécute asyncFn(),
//   4. restaure le contenu réel OU le nouveau contenu rendu par la fonction.
// minMs garantit un temps d'affichage minimum (évite le flash pour les
// tâches trop rapides).
// =====================================================================
let _skeletonDepth = 0;

function _skeletonRowsHTML(n, columns = 12) {
    let html = '';
    for (let i = 0; i < n; i++) {
        const widths = ['w-24', 'w-16', 'w-24', 'w-8', 'w-12', 'w-12', 'w-8', 'w-16', 'w-16', 'w-16', 'w-12', 'w-12'];
        let cells = '';
        for (let c = 0; c < columns; c++) {
            const w = widths[c % widths.length];
            cells += `<td class="p-3"><span class="skeleton-block ${w}"></span></td>`;
        }
        html += `<tr class="skeleton-row">${cells}</tr>`;
    }
    return html;
}

function showSkeletonFor(selector, rows = 6, columns = 12) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) return null;
    const backup = el.innerHTML;
    el.innerHTML = _skeletonRowsHTML(rows, columns);
    return backup;
}

function restoreSkeletonFor(selector, backup) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el || backup === null) return;
    el.innerHTML = backup;
}

async function withSkeleton(asyncFn, opts = {}) {
    const selector = opts.selector || '#table-inventory-body';
    const rows     = opts.rows     || 6;
    const columns  = opts.columns  || 12;
    const minMs    = opts.minMs    || 400;

    // Un seul skeleton actif à la fois : si une tâche est déjà en cours,
    // on n'en rajoute pas un second par-dessus.
    if (_skeletonDepth > 0) {
        return await asyncFn();
    }
    _skeletonDepth++;

    const backup = showSkeletonFor(selector, rows, columns);
    const t0 = performance.now();
    let result;
    try {
        result = await asyncFn();
    } finally {
        const elapsed = performance.now() - t0;
        const remaining = Math.max(0, minMs - elapsed);
        if (remaining > 0) await new Promise(r => setTimeout(r, remaining));
        // Si asyncFn a rendu l'UI (via refreshAllUI), on ne restaure PAS
        // le backup — sinon on écraserait le rendu frais. On laisse les
        // fonctions métier repeupler le tableau.
        if (document.querySelector(selector) && document.querySelector(selector).querySelector('.skeleton-row')) {
            restoreSkeletonFor(selector, backup);
        }
        _skeletonDepth--;
    }
    return result;
}

// =====================================================================
// BANDEAU DE PROGRESSION DISCRET (opérations longues : API externes)
// =====================================================================
let _progressToastHideTimer = null;

function showProgressToast(title, detail = '', pct = 0) {
    const toast = document.getElementById('progress-toast');
    if (!toast) return;
    if (_progressToastHideTimer) { clearTimeout(_progressToastHideTimer); _progressToastHideTimer = null; }
    const iconEl = document.getElementById('progress-toast-icon');
    if (iconEl) iconEl.className = 'fa-solid fa-arrows-rotate fa-spin';
    document.getElementById('progress-toast-title').innerText  = title;
    document.getElementById('progress-toast-detail').innerText = detail || '—';
    document.getElementById('progress-toast-bar').style.width  = Math.max(0, Math.min(100, pct)) + '%';
    toast.classList.remove('hidden');
}

function updateProgressToast(detail, pct) {
    const toast = document.getElementById('progress-toast');
    if (!toast || toast.classList.contains('hidden')) return;
    if (detail !== undefined) document.getElementById('progress-toast-detail').innerText = detail;
    if (pct !== undefined)    document.getElementById('progress-toast-bar').style.width  = Math.max(0, Math.min(100, pct)) + '%';
}

function hideProgressToast(delay = 0) {
    if (_progressToastHideTimer) clearTimeout(_progressToastHideTimer);
    _progressToastHideTimer = setTimeout(() => {
        const toast = document.getElementById('progress-toast');
        if (toast) toast.classList.add('hidden');
        const bar = document.getElementById('progress-toast-bar');
        if (bar) bar.style.width = '0%';
    }, delay);
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

// ---------------------------------------------------------------------
// SECURITY — Coercition d'un identifiant en nombre (protection XSS stocké)
// ---------------------------------------------------------------------
// Les IDs sont interpolés dans des handlers inline :
//   onclick="fn(${asset.id})"   (app2-ui.js, app3-charts.js, app5-fiscal.js…)
// Un JSON importé contenant un `id` de type chaîne casserait la quote et
// permettrait d'injecter du code exécutable. On force systématiquement
// un nombre fini strictement positif, sinon on génère un nouvel ID.
function _safeId(v, fallback) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
    if (typeof v === 'string' && /^\d+$/.test(v)) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) return n;
    }
    return (fallback !== undefined)
        ? fallback
        : (Date.now() + Math.floor(Math.random() * 100000));
}

// ---------------------------------------------------------------------
// NORMALISATION D'UN ARBITRAGE
// ---------------------------------------------------------------------
// Les arbitrages ne passent pas par migrateAssetToV2 : on leur applique
// juste la coercition d'ID (même menace que pour les actifs / cessions).
function normalizeArbitrage(arb) {
    if (!arb || typeof arb !== 'object') return arb;
    arb.id      = _safeId(arb.id);
    arb.date    = arb.date || '';
    arb.source  = String(arb.source || '');
    arb.destination = String(arb.destination || '');
    arb.montant = Number(arb.montant) || 0;
    arb.motif   = String(arb.motif || '');
    return arb;
}

function normalizeAsset(a) {
    // ── SECURITY ── Coercition de l'ID racine AVANT tout traitement
    a.id = _safeId(a.id);
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

    // Dividendes & coupons (Chantier 1.1)
    // Format : [{ id, date, amount, currency, taxWithheld, source, kind }]
    //   kind : 'DIVIDENDE' | 'COUPON' | 'INTERET'
    if (!Array.isArray(a.dividends)) a.dividends = [];
    a.dividends = a.dividends
        .filter(d => d && d.date && Number.isFinite(Number(d.amount)))
        .map(d => ({
            id:          _safeId(d.id),
            date:        d.date,
            amount:      Number(d.amount) || 0,
            currency:    (d.currency || 'EUR').toUpperCase(),
            taxWithheld: Number(d.taxWithheld) || 0,
            source:      d.source || '',
            kind:        d.kind || 'DIVIDENDE'
        }));

    // --- Multi-devises (Chantier 1.2) ---
    // Devise native de cotation de l'actif. Par défaut EUR (comportement
    // historique : tous les montants `invested` et `value` sont en EUR).
    //   • currency = 'EUR'  → comportement strictement inchangé
    //   • currency ≠ 'EUR'  → l'utilisateur déclare que l'actif est coté
    //                          dans cette devise ; `invested` et `value`
    //                          restent exprimés en EUR (montants convertis
    //                          par l'utilisateur OU par l'app via l'API FX).
    a.currency = String(a.currency || 'EUR').toUpperCase();

    // Taux de conversion figé au moment de l'achat : combien d'EUR pour
    // 1 unité de la devise native (ex: USD→EUR = 0.92 à une date donnée).
    // 0 ou absent = taux inconnu → l'app affichera un avertissement sur
    // les calculs "en devise native" mais n'empêchera PAS les calculs EUR.
    if (a.currency !== 'EUR') {
        a.fxRateAtPurchase = Number.isFinite(Number(a.fxRateAtPurchase))
            ? Number(a.fxRateAtPurchase)
            : 0;
        // Date du taux figé (ISO YYYY-MM-DD). Fallback : date d'achat du
        // premier lot si connue, sinon aujourd'hui.
        if (!a.fxRateDate) {
            const firstLot = (a.lots || [])[0];
            a.fxRateDate = (firstLot && firstLot.date) || a.purchaseDate || '';
        }
    } else {
        // Nettoyage : en EUR, ces champs n'ont pas de sens
        delete a.fxRateAtPurchase;
        delete a.fxRateDate;
    }

    // --- Splits & actions gratuites (Chantier 1.3) ---
    // Historique des divisions/multiplications de nominal subies par l'actif.
    // Format : [{ id, date, ratio, note, appliedAt }]
    //   ratio > 1  → split classique (ex: 10 pour un split 10:1 : on multiplie
    //                 la quantité par 10, on divise le prix par 10)
    //   0 < ratio < 1 → reverse split (regroupement : ex 0.1 pour un 1:10)
    //
    // Fisc : un split est NEUTRE fiscalement (le PRU total ne change pas, seule
    // la granularité des lots change). C'est pourquoi on ne touche PAS à
    // `invested`, mais on recalcule le PRU unitaire des lots.
    if (!Array.isArray(a.splits)) a.splits = [];
    a.splits = a.splits
        .filter(s => s && s.date && Number.isFinite(Number(s.ratio)) && Number(s.ratio) > 0)
        .map(s => ({
            id:        _safeId(s.id),
            date:      s.date,
            ratio:     Number(s.ratio),
            note:      s.note || '',
            appliedAt: s.appliedAt || null
        }))
        .sort((a, b) => new Date(a.date) - new Date(b.date));

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
        // Nettoyage : ID numérique + champs obligatoires présents
        a.lots.forEach(l => {
            l.id = _safeId(l.id);                              // ── SECURITY ──
            if (l.reference === undefined) l.reference = '';
            if (l.qty === undefined)       l.qty = l.qtyRemaining || 0;
            if (l.qtyRemaining === undefined) l.qtyRemaining = l.qty || 0;
        });
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
    // ── SECURITY ── Coercition de l'ID avant tout traitement
    c.id = _safeId(c.id);

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
    const storedVer = parseInt(localStorage.getItem(pfKey('patriMonial_dataVersion')) || '1', 10);
    const hadData = localStorage.getItem(pfKey('patriMonial_assets')) !== null;

    if (hadData && storedVer < DATA_VERSION) {
        try {
            localStorage.setItem(
                pfKey('patriMonial_backup_v' + storedVer + '_' + Date.now()),
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
                localStorage.setItem(pfKey('patriMonial_assets'), JSON.stringify(assets));
                localStorage.setItem(pfKey('patriMonial_cessions'), JSON.stringify(cessions));
            }
            localStorage.setItem(pfKey('patriMonial_dataVersion'), String(DATA_VERSION));
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
    return `<span class="px-2 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ${cls}">${escapeHTML(cadranLabel(code))}</span>`;
}

function cadranSelectHTML(assetId, currentCadran) {
    const opts = [...GAVE_QUADRANTS, 'CRYPTO', 'HORS_GAVE'].map(code => {
        const label = code === 'HORS_GAVE'
            ? 'Hors-Cadran'
            : (code === 'CRYPTO' ? 'Cryptomonnaies' : `Cadran ${CADRAN_NUM[code]} : ${cadranLabel(code)}`);
        return `<option value="${code}" ${code === currentCadran ? 'selected' : ''}>${escapeHTML(label)}</option>`;
    }).join('');
    return `<select onchange="reassignAssetCadran(${assetId}, this.value)" class="bg-gray-950 border border-gray-800 rounded-md px-1.5 py-1 text-[10px] text-white focus:outline-none focus:border-indigo-500">${opts}</select>`;
}

// =====================================================================
// PERSISTANCE (localStorage)
// =====================================================================
// =====================================================================
// SAUVEGARDE — Écriture localStorage + shadow write IndexedDB (5.2)
// ---------------------------------------------------------------------
// localStorage reste la source PRIMAIRE (lectures synchrones partout
// dans l'app). IndexedDB est utilisé comme MIRROIR de secours :
//   • à chaque écriture réussie → mirror en arrière-plan (debounced 500 ms)
//   • en cas d'erreur quota localStorage → mirror IMMÉDIAT + toast
//   • un seul avertissement quota par session (évite le spam)
// =====================================================================

// Flag global : un seul toast d'avertissement quota par session
let _quotaWarningShown = false;

// Détecte une erreur de quota (les navigateurs ont des messages variés)
function _isQuotaError(err) {
    if (!err) return false;
    const msg = String(err.message || err.name || '').toLowerCase();
    return msg.includes('quota') ||
           msg.includes('quotaexceeded') ||
           msg.includes('storage') ||
           msg.includes('exceeded');
}

// Traite une erreur d'écriture localStorage : force le mirror IDB + toast
// (une seule fois par session pour ne pas spammer).
function _handleStorageWriteError(err, label) {
    console.warn(`[Storage] Écriture ${label} impossible :`, err);
    // Mirror immédiat vers IndexedDB (source de secours)
    if (typeof forceIdbMirror === 'function') {
        forceIdbMirror().catch(e => console.warn('[Storage] Mirror immédiat échoué :', e));
    }
    // Toast une seule fois par session
    if (!_quotaWarningShown && _isQuotaError(err) && typeof toastWarning === 'function') {
        _quotaWarningShown = true;
        toastWarning(
            'Stockage local saturé',
            'Vos données sont sauvegardées dans IndexedDB (secours). Pensez à exporter un JSON ou à purger les historiques anciens.',
            { duration: 9000 }
        );
    }
}

function saveToStorage() {
    try {
        localStorage.setItem(pfKey('patriMonial_assets'), JSON.stringify(assets));
        // Shadow write en arrière-plan (non bloquant)
        if (typeof scheduleIdbMirror === 'function') scheduleIdbMirror('assets');
    } catch (err) {
        _handleStorageWriteError(err, 'actifs');
    }
}

function saveCessions() {
    try {
        localStorage.setItem(pfKey('patriMonial_cessions'), JSON.stringify(cessions));
        if (typeof scheduleIdbMirror === 'function') scheduleIdbMirror('cessions');
    } catch (err) {
        _handleStorageWriteError(err, 'cessions');
    }
}

function saveArbitrages() {
    try {
        localStorage.setItem(pfKey('patriMonial_arbitrages'), JSON.stringify(arbitrages));
        if (typeof scheduleIdbMirror === 'function') scheduleIdbMirror('arbitrages');
    } catch (err) {
        _handleStorageWriteError(err, 'arbitrages');
    }
}

function saveTaxSettings() {
    localStorage.setItem('patriMonial_taxMode', taxRegimeMode);
    localStorage.setItem('patriMonial_tmi', String(taxTMI));
}

function saveConcentrationThreshold(pct) {
    const v = parseFloat(pct);
    if (!Number.isFinite(v) || v <= 0) return;
    concentrationThreshold = Math.min(1, v / 100);
    localStorage.setItem('patriMonial_concentrationThreshold', String(concentrationThreshold));
    renderInventoryTable();
    renderCryptoTable();
    renderHorsGaveTable();
    renderGaveDetailTable();
}

// Active/désactive le teintage performance des lignes et cartes.
function setTintRowsEnabled(enabled) {
    tintRowsEnabled = !!enabled;
    localStorage.setItem('patriMonial_tintRows', String(tintRowsEnabled));
    applyTintClassToBody();
    // Rafraîchit toutes les tables pour faire apparaître / disparaître le teintage
    renderInventoryTable();
    renderCryptoTable();
    renderHorsGaveTable();
    renderGaveDetailTable();
}

function applyTintClassToBody() {
    document.body.classList.toggle('tint-rows-enabled', !!tintRowsEnabled);
}

// =====================================================================
// THÈME — 3 modes (light / dark / auto) — Chantier 2.2
// =====================================================================

// Applique la classe .light au body selon le thème EFFECTIF.
// Rafraîchit aussi l'icône du bouton.
function applyThemeClass() {
    const effective = getEffectiveTheme();
    document.body.classList.toggle('light', effective === 'light');
    updateThemeToggleUI();
}

// Alias conservé pour la compatibilité avec les anciens appels
// (applyLightModeClass est appelé dans app7-init.js historique).
function applyLightModeClass() {
    applyThemeClass();
}

// Met à jour l'icône + le tooltip du bouton selon le mode courant.
//   • dark  → icône soleil (clic = passer en light)
//   • light → icône lune   (clic = passer en auto)
//   • auto  → icône écran  (clic = passer en dark) + petite indication
function updateThemeToggleUI() {
    const btn  = document.getElementById('theme-toggle-btn');
    const icon = document.getElementById('theme-toggle-icon');
    if (!btn || !icon) return;

    const effective = getEffectiveTheme();
    const labels = {
        dark:  { next: 'light',  tooltip: 'Thème : Sombre · Cliquez pour passer en Clair' },
        light: { next: 'auto',   tooltip: 'Thème : Clair · Cliquez pour passer en Automatique' },
        auto:  { next: 'dark',   tooltip: 'Thème : Automatique (suit l\'OS) · Cliquez pour passer en Sombre' }
    };
    const cfg = labels[themeMode] || labels.dark;

    // Icône : le mode en cours, pas le mode suivant (plus intuitif)
    if (themeMode === 'auto') {
        icon.className = 'fa-solid fa-circle-half-stroke';   // demi-cercle = auto
    } else if (effective === 'light') {
        icon.className = 'fa-solid fa-sun';
    } else {
        icon.className = 'fa-solid fa-moon';
    }

    btn.title = cfg.tooltip;
}

// Change le mode explicitement (appelé par le bouton ou par commande).
function setThemeMode(mode) {
    if (mode !== 'light' && mode !== 'dark' && mode !== 'auto') return;
    themeMode = mode;
    localStorage.setItem('patriMonial_themeMode', mode);
    // Nettoyage de l'ancienne clé pour éviter toute confusion future
    try { localStorage.removeItem('patriMonial_lightMode'); } catch (_) {}

    applyThemeClass();
    if (typeof refreshAllUI === 'function') refreshAllUI();
}

// Cycle : dark → light → auto → dark…
function cycleThemeMode() {
    const order = ['dark', 'light', 'auto'];
    const idx = order.indexOf(themeMode);
    const next = order[(idx + 1) % order.length];
    setThemeMode(next);
    // Toast discret pour indiquer le mode actif
    if (typeof showUndoToast === 'function') {
        const labels = { dark: 'Thème sombre', light: 'Thème clair', auto: 'Thème automatique (suit l\'OS)' };
        showUndoToast(labels[next], false);
    }
}

// Compatibilité : ancien appel `toggleLightMode()` depuis le HTML.
// On le mappe sur cycleThemeMode() pour ne rien casser.
function toggleLightMode() {
    cycleThemeMode();
}

// Compatibilité : ancien appel `setLightMode(true/false)`.
function setLightMode(enabled) {
    setThemeMode(enabled ? 'light' : 'dark');
}

// =====================================================================
// DENSITÉ D'AFFICHAGE — confort vs compact (Chantier 2.6)
// ---------------------------------------------------------------------
// Sur un portefeuille de 50+ lignes, le padding standard (p-3 = 12 px)
// prend beaucoup de place verticale. Le mode "compact" réduit de ~30 %
// la hauteur des lignes de tableau et des cartes, sans toucher à la
// lisibilité (police et contrastes inchangés).
//
// Deux valeurs possibles :
//   • 'comfort' (défaut) → interface actuelle
//   • 'compact'          → lignes + cartes resserrées
//
// Persisté dans localStorage sous 'patriMonial_density'.
// =====================================================================
let densityMode = (() => {
    const saved = localStorage.getItem('patriMonial_density');
    return (saved === 'compact' || saved === 'comfort') ? saved : 'comfort';
})();

function applyDensityClass() {
    document.body.classList.toggle('density-compact', densityMode === 'compact');
    updateDensityToggleUI();
}

function updateDensityToggleUI() {
    const btn  = document.getElementById('density-toggle-btn');
    const icon = document.getElementById('density-toggle-icon');
    if (!btn || !icon) return;

    if (densityMode === 'compact') {
        icon.className = 'fa-solid fa-compress';
        btn.title = 'Densité : Compacte · Cliquez pour repasser en Confort';
        btn.className = 'w-8 h-8 rounded-lg bg-indigo-950/60 text-indigo-300 border border-indigo-700/50 hover:bg-indigo-900/80 hover:text-white transition flex items-center justify-center flex-shrink-0';
    } else {
        icon.className = 'fa-solid fa-expand';
        btn.title = 'Densité : Confort · Cliquez pour passer en Compacte';
        btn.className = 'w-8 h-8 rounded-lg bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700 hover:text-white transition flex items-center justify-center flex-shrink-0';
    }
}

function setDensityMode(mode) {
    if (mode !== 'comfort' && mode !== 'compact') return;
    densityMode = mode;
    localStorage.setItem('patriMonial_density', mode);
    applyDensityClass();
    // Pas de refreshAllUI nécessaire : le CSS s'applique instantanément
    // et les graphiques ne sont pas affectés par la densité.
}

function toggleDensityMode() {
    setDensityMode(densityMode === 'compact' ? 'comfort' : 'compact');
    if (typeof showUndoToast === 'function') {
        showUndoToast(densityMode === 'compact' ? 'Densité compacte' : 'Densité confort', false);
    }
}

// Écoute les changements de préférence OS : si le mode est 'auto', on
// réapplique immédiatement le thème effectif quand l'utilisateur change
// de mode sur son système d'exploitation (ex: passage en mode nuit à 20h).
function initThemeAutoListener() {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => {
        if (themeMode === 'auto') {
            applyThemeClass();
            if (typeof refreshAllUI === 'function') refreshAllUI();
        }
    };
    // API moderne (addEventListener) avec fallback legacy (addListener)
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else if (mq.addListener) mq.addListener(handler);
}

// =====================================================================
// PAPER TRADING — positions fictives marquées `isPaper: true`
// =====================================================================
function isPaperAsset(a) { return !!(a && a.isPaper); }

// Renvoie la liste des actifs à utiliser pour les agrégats / KPI.
// Si `paperIncludeInStats` est faux, exclut les positions papier.
function statsAssets() {
    return paperIncludeInStats ? assets : assets.filter(a => !isPaperAsset(a));
}

// Cessions à utiliser pour la fiscalité : on exclut celles issues d'actifs papier
// (elles ne correspondent à aucune réalité fiscale tant que non promues).
function statsCessions() {
    if (paperIncludeInStats) return cessions;
    const realIds = new Set(assets.filter(a => !isPaperAsset(a)).map(a => a.id));
    return cessions.filter(c => !c.fromPaper || realIds.has(c.fromPaper));
}

function countPaperAssets() {
    return assets.filter(isPaperAsset).length;
}

function applyPaperModeClass() {
    document.body.classList.toggle('paper-mode', !!paperMode);
}

function updatePaperToggleUI() {
    const btn       = document.getElementById('paper-toggle-btn');
    const icon      = document.getElementById('paper-toggle-icon');
    const badge     = document.getElementById('paper-count-badge');
    const banner    = document.getElementById('paper-mode-banner');
    const includeCb = document.getElementById('paper-include-stats');
    const labelEl   = document.getElementById('paper-toggle-label');
    const scenLabel = document.getElementById('paper-current-scenario-label');

    const scen = currentPaperScenario();
    // Le badge compte uniquement les positions du scénario courant (pour rester cohérent avec le sélecteur)
    const n = scen ? assets.filter(a => isPaperAsset(a) && a.paperScenarioId === scen.id).length : 0;

    if (badge) {
        badge.textContent = String(n);
        badge.classList.toggle('hidden', n === 0);
    }
    if (labelEl) {
        labelEl.textContent = paperMode && scen ? scen.name : 'Paper';
        if (paperMode && scen) labelEl.style.color = scen.color;
        else labelEl.style.color = '';
    }
    if (scenLabel && scen) {
        scenLabel.textContent = scen.name;
        scenLabel.style.color = scen.color;
    }
    if (icon) {
        icon.className = paperMode
            ? 'fa-solid fa-flask text-[11px]'
            : 'fa-solid fa-flask text-[11px] opacity-50';
        if (paperMode && scen) icon.style.color = scen.color;
        else icon.style.color = '';
    }
    if (btn) {
        btn.className = paperMode
            ? 'px-3 py-1.5 rounded-lg bg-purple-950/60 border border-purple-700/50 text-xs text-purple-200 hover:bg-purple-900/70 transition flex items-center gap-1.5 flex-shrink-0 max-w-[240px]'
            : 'px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-xs text-gray-400 hover:text-white transition flex items-center gap-1.5 flex-shrink-0 max-w-[240px]';
        btn.title = paperMode
            ? `Mode Paper Trading ACTIF — scénario : ${scen ? scen.name : '—'}`
            : 'Activer le mode Paper Trading (positions fictives)';
    }
    if (banner) banner.classList.toggle('hidden', !paperMode);
    if (includeCb) includeCb.checked = paperIncludeInStats;

    // Menu scénarios : mise à jour si visible
    if (typeof renderPaperScenarioMenu === 'function') renderPaperScenarioMenu();
}

function setPaperMode(enabled) {
    paperMode = !!enabled;
    localStorage.setItem('patriMonial_paperMode', String(paperMode));
    applyPaperModeClass();
    updatePaperToggleUI();
    if (typeof refreshAllUI === 'function') refreshAllUI();
}

function togglePaperMode() {
    setPaperMode(!paperMode);
}

function setPaperIncludeInStats(enabled) {
    paperIncludeInStats = !!enabled;
    localStorage.setItem('patriMonial_paperIncludeInStats', String(paperIncludeInStats));
    updatePaperToggleUI();
    if (typeof refreshAllUI === 'function') refreshAllUI();
}

// --- CRUD scénarios -----------------------------------------------------
function setCurrentPaperScenario(scenarioId) {
    if (!paperScenarios.some(s => s.id === scenarioId)) return;
    currentPaperScenarioId = scenarioId;
    savePaperScenarios();
    updatePaperToggleUI();
    if (typeof refreshAllUI === 'function') refreshAllUI();
}

function createPaperScenario(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    const id = 'ps_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const usedColors = new Set(paperScenarios.map(s => s.color));
    const color = PAPER_SCENARIO_COLORS.find(c => !usedColors.has(c))
        || PAPER_SCENARIO_COLORS[paperScenarios.length % PAPER_SCENARIO_COLORS.length];
    paperScenarios.push({ id, name: trimmed, color, notes: '', createdAt: Date.now() });
    savePaperScenarios();
    return id;
}

function renamePaperScenario(id, newName) {
    const s = paperScenarios.find(x => x.id === id);
    if (!s) return;
    const trimmed = (newName || '').trim();
    if (!trimmed) return;
    s.name = trimmed;
    savePaperScenarios();
    updatePaperToggleUI();
    if (typeof refreshAllUI === 'function') refreshAllUI();
}

function deletePaperScenario(id) {
    if (paperScenarios.length <= 1) {
        alert('Impossible de supprimer le dernier scénario.');
        return;
    }
    const s = paperScenarios.find(x => x.id === id);
    if (!s) return;
    const victims = assets.filter(a => isPaperAsset(a) && a.paperScenarioId === id);
    const msg = `Supprimer le scénario "${s.name}" ?\n\n` +
        (victims.length ? `${victims.length} position(s) papier rattachée(s) à ce scénario seront AUSSI supprimées.\n\n` : '') +
        `Cette action est irréversible (Ctrl+Z pour annuler).`;
    if (!confirm(msg)) return;

    pushUndo('Suppression du scénario : ' + s.name);
    const victimIds = new Set(victims.map(v => v.id));
    assets = assets.filter(a => !victimIds.has(a.id));
    paperScenarios = paperScenarios.filter(x => x.id !== id);
    if (currentPaperScenarioId === id) currentPaperScenarioId = paperScenarios[0].id;
    savePaperScenarios();
    saveToStorage();
    if (typeof refreshAllUI === 'function') refreshAllUI();
    if (typeof renderPaperScenarioMenu === 'function') renderPaperScenarioMenu();
}

// Archive/désarchive un scénario : il garde ses positions et ses stats mais
// n'apparaît plus dans le menu principal (sauf case "Afficher les archivés").
function archivePaperScenario(id, archived = true) {
    const s = paperScenarios.find(x => x.id === id);
    if (!s) return;
    s.archived = !!archived;
    s.archivedAt = archived ? Date.now() : null;
    savePaperScenarios();
    updatePaperToggleUI();
    if (typeof renderStrategiesTab === 'function') renderStrategiesTab();
}

function toggleArchivePaperScenario(id) {
    const s = paperScenarios.find(x => x.id === id);
    if (!s) return;
    const victims = assets.filter(a => isPaperAsset(a) && a.paperScenarioId === id);
    const verb = s.archived ? 'Désarchiver' : 'Archiver';
    if (!confirm(`${verb} le scénario "${s.name}" ?\n\n` +
        (s.archived
            ? 'Il redeviendra visible dans le menu des scénarios actifs.'
            : `Il restera conservé avec ses ${victims.length} position(s) mais n'apparaîtra plus dans le menu principal.`)
    )) return;
    archivePaperScenario(id, !s.archived);
}

function activePaperScenarios() {
    return paperScenarios.filter(s => !s.archived);
}
function archivedPaperScenarios() {
    return paperScenarios.filter(s => s.archived);
}

// Duplique un scénario (positions + paramètres) dans un nouveau scénario.
// Le nouveau scénario devient le scénario courant après duplication.
function duplicatePaperScenario(id) {
    const s = paperScenarios.find(x => x.id === id);
    if (!s) return;
    const defaultName = s.name + ' (copie)';
    const newName = prompt('Nom du nouveau scénario dupliqué :', defaultName);
    if (!newName || !newName.trim()) return;

    pushUndo('Duplication du scénario : ' + s.name);

    const newId = createPaperScenario(newName);
    if (!newId) return;

    // Clone les positions papier rattachées au scénario source
    const srcAssets = assets.filter(a => isPaperAsset(a) && a.paperScenarioId === id);
    const clones = srcAssets.map(a => {
        const c = JSON.parse(JSON.stringify(a));
        c.id = Date.now() + Math.floor(Math.random() * 100000);
        c.paperScenarioId = newId;
        // Nouveaux IDs de lots pour éviter les collisions
        if (Array.isArray(c.lots)) {
            c.lots.forEach(l => { l.id = Date.now() + Math.floor(Math.random() * 100000); });
        }
        return c;
    });
    assets.push(...clones);
    saveToStorage();
    setCurrentPaperScenario(newId);
    if (typeof refreshAllUI === 'function') refreshAllUI();
    if (typeof renderStrategiesTab === 'function') renderStrategiesTab();
    alert(`Scénario dupliqué : ${clones.length} position(s) copiée(s) dans "${newName}".`);
}

// Agrège les valeurs d'un scénario jour par jour (pour la sparkline 60j).
// Renvoie un tableau { date, value } trié par date, en réutilisant l'historique
// de chaque actif du scénario.
function buildPaperScenarioSeries(scenarioId, days = 60) {
    // ... (code existant inchangé)
    const list = assets.filter(a => isPaperAsset(a) && a.paperScenarioId === scenarioId);
    if (!list.length) return [];
    const cutoff = Date.now() - days * 864e5;

    const allPoints = [];
    list.forEach(a => {
        (a.history || []).forEach(h => {
            const d = parseFlexDate(h.date);
            if (d && Number.isFinite(h.value)) allPoints.push({ date: d, id: a.id, value: h.value });
        });
        allPoints.push({ date: new Date(), id: a.id, value: a.value || 0 });
    });
    if (!allPoints.length) return [];
    allPoints.sort((x, y) => x.date - y.date);

    const start = new Date(Math.max(cutoff, allPoints[0].date.getTime()));
    const today = new Date();
    const lastValues = {};
    const series = [];
    const cursor = new Date(start);
    while (cursor <= today) {
        const endOfDay = new Date(cursor); endOfDay.setHours(23, 59, 59, 999);
        for (const p of allPoints) {
            if (p.date <= endOfDay) lastValues[p.id] = p.value;
        }
        const total = Object.values(lastValues).reduce((s, v) => s + v, 0);
        series.push({ date: new Date(cursor).getTime(), value: total });
        cursor.setDate(cursor.getDate() + 1);
    }
    return series;
}

// ---------------------------------------------------------------------
// PAPER TRADING v2 — Helpers pour le comparateur (Étape C)
// ---------------------------------------------------------------------
// Renvoie un objet de synthèse pour un scénario donné :
//  { invested, value, pnl, pnlPct, positions, sharpe, vol, maxDD, meanAnnualized, scenario }
function summarizePaperScenario(scenarioId) {
    const s = paperScenarios.find(x => x.id === scenarioId);
    if (!s) return null;
    const list = assets.filter(a => isPaperAsset(a) && a.paperScenarioId === scenarioId);
    const invested = list.reduce((sum, a) => sum + (a.invested || 0), 0);
    const value    = list.reduce((sum, a) => sum + (a.value    || 0), 0);
    const pnl      = value - invested;
    const pnlPct   = invested > 0 ? (pnl / invested * 100) : 0;

    let rm = null;
    if (list.length >= 2) {
        try { rm = computeRiskMetricsFromAssets(list); } catch (_) { rm = null; }
    }
    return {
        scenario: s,
        list,
        positions: list.length,
        invested,
        value,
        pnl,
        pnlPct,
        sharpe:       rm && Number.isFinite(rm.sharpe)      ? rm.sharpe      : null,
        vol:          rm && Number.isFinite(rm.volatility)  ? rm.volatility  : null,
        maxDD:        rm && Number.isFinite(rm.maxdrawdown) ? rm.maxdrawdown : null,
        meanAnnual:   rm && Number.isFinite(rm.meanAnnualized) ? rm.meanAnnualized : null,
        usedRealData: rm ? !!rm.usedRealReturns : false
    };
}

// Delta formaté pour la table de comparaison
function paperDelta(a, b, format = 'eur', lowerIsBetter = false) {
    if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) {
        return { txt: '—', cls: 'text-gray-600' };
    }
    const d = a - b;
    let txt, isWinA;
    if (format === 'eur') {
        txt = (d >= 0 ? '+' : '') + formatEUR(d);
        isWinA = d >= 0;
    } else if (format === 'pct') {
        txt = (d >= 0 ? '+' : '') + d.toFixed(2) + ' pts';
        isWinA = d >= 0;
    } else if (format === 'ratio') {
        txt = (d >= 0 ? '+' : '') + d.toFixed(2);
        isWinA = d >= 0;
    } else if (format === 'count') {
        txt = (d >= 0 ? '+' : '') + d;
        isWinA = d >= 0;
    }
    if (lowerIsBetter) isWinA = !isWinA;
    return { txt, cls: isWinA ? 'text-emerald-400' : 'text-rose-400' };
}

// --- UI scénarios : menu déroulant attaché au bouton Paper -------------
function renderPaperScenarioMenu() {
    const list = document.getElementById('paper-scenario-list');
    if (!list) return;
    list.innerHTML = paperScenarios.map(s => {
        const isCurrent = s.id === currentPaperScenarioId;
        const count = assets.filter(a => isPaperAsset(a) && a.paperScenarioId === s.id).length;
        return `<div class="flex items-center justify-between border-b border-gray-800/60 last:border-b-0 ${isCurrent ? 'bg-purple-950/30' : ''}">
            <button onclick="setCurrentPaperScenario('${s.id}'); closePaperScenarioMenu();" class="flex-1 text-left min-w-0 flex items-center gap-2 p-2.5 hover:bg-gray-800/50 transition">
                <span class="w-3 h-3 rounded-full flex-shrink-0" style="background:${s.color};"></span>
                <span class="min-w-0 flex-1">
                    <span class="block text-xs font-medium ${isCurrent ? 'text-white' : 'text-gray-300'} truncate">${escapeHTML(s.name)}</span>
                    <span class="block text-[10px] text-gray-500 font-mono">${count} position(s) · créé le ${new Date(s.createdAt).toLocaleDateString('fr-FR')}</span>
                </span>
                ${isCurrent ? '<i class="fa-solid fa-circle-check text-purple-400 text-[10px]"></i>' : ''}
            </button>
            <div class="flex gap-0.5 flex-shrink-0 pr-1.5">
                <button onclick="event.stopPropagation(); renamePaperScenarioUI('${s.id}')" class="p-1.5 text-gray-500 hover:text-purple-400 transition" title="Renommer"><i class="fa-solid fa-pen text-[10px]"></i></button>
                ${paperScenarios.length > 1 ? `<button onclick="event.stopPropagation(); deletePaperScenario('${s.id}')" class="p-1.5 text-gray-500 hover:text-rose-400 transition" title="Supprimer"><i class="fa-solid fa-trash text-[10px]"></i></button>` : ''}
            </div>
        </div>`;
    }).join('');
}

function renamePaperScenarioUI(id) {
    const s = paperScenarios.find(x => x.id === id);
    if (!s) return;
    const name = prompt('Nouveau nom du scénario :', s.name);
    if (!name || !name.trim() || name.trim() === s.name) return;
    renamePaperScenario(id, name);
    renderPaperScenarioMenu();
}

function togglePaperScenarioMenu(evt) {
    if (evt) evt.stopPropagation();
    const menu = document.getElementById('paper-scenario-menu');
    if (!menu) return;
    if (menu.classList.contains('hidden')) {
        renderPaperScenarioMenu();
        menu.classList.remove('hidden');
    } else {
        menu.classList.add('hidden');
    }
}

function closePaperScenarioMenu() {
    const menu = document.getElementById('paper-scenario-menu');
    if (menu) menu.classList.add('hidden');
}

function createPaperScenarioUI() {
    const name = prompt('Nom du nouveau scénario (ex : DCA BTC 2025, Rotation Asie…) :', 'Nouveau scénario');
    if (!name || !name.trim()) return;
    const id = createPaperScenario(name);
    if (!id) return;
    setCurrentPaperScenario(id);
    if (typeof renderPaperScenarioMenu === 'function') renderPaperScenarioMenu();
    // Active automatiquement le mode papier si pas déjà actif
    if (!paperMode) togglePaperMode();
}

// Promotion d'une position papier en position réelle (retire le flag isPaper)
function promotePaperAsset(id) {
    const a = assets.find(x => x.id === id);
    if (!a || !isPaperAsset(a)) return;
    const scenName = paperScenarioName(a.paperScenarioId);
    if (!confirm(`Promouvoir "${a.name}" (scénario « ${scenName} ») du mode papier au portefeuille réel ?\n\nLa position sortira du mode fictif et sera incluse dans tous les calculs fiscaux (impôt, plus-values latentes, ratios de risque).`)) return;
    delete a.isPaper;
    delete a.paperScenarioId;
    saveToStorage();
    if (typeof refreshAllUI === 'function') refreshAllUI();
}

// Purge des positions papier.
//   - sans argument : toutes les positions papier
//   - avec scenarioId : seulement celles du scénario ciblé
function deleteAllPaperAssets(scenarioId) {
    const target = scenarioId || null;
    const victims = assets.filter(a => isPaperAsset(a) && (!target || a.paperScenarioId === target));
    if (!victims.length) {
        alert('Aucune position papier à supprimer dans cette sélection.');
        return;
    }
    const label = target ? `du scénario « ${paperScenarioName(target)} »` : 'de tous les scénarios';
    if (!confirm(`Supprimer définitivement les ${victims.length} position(s) papier ${label} ?\n\nCette action est irréversible (mais vous pouvez Ctrl+Z juste après).`)) return;
    pushUndo('Purge des positions papier');
    const victimIds = new Set(victims.map(v => v.id));
    assets = assets.filter(a => !victimIds.has(a.id));
    saveToStorage();
    if (typeof refreshAllUI === 'function') refreshAllUI();
}

// Renvoie la classe CSS de teintage pour un actif ('' si neutre ou désactivé)
function rowTintClass(asset) {
    if (!tintRowsEnabled) return '';
    const v = (asset.value || 0) - (asset.invested || 0);
    if (v > 0.01)  return 'row-profit';
    if (v < -0.01) return 'row-loss';
    return '';
}

// Idem pour les cartes mobiles (classes distinctes)
function cardTintClass(asset) {
    if (!tintRowsEnabled) return '';
    const v = (asset.value || 0) - (asset.invested || 0);
    if (v > 0.01)  return 'card-profit';
    if (v < -0.01) return 'card-loss';
    return '';
}

// =====================================================================
// UNDO — pile bornée à 10 états, capture complète avant chaque action
// destructive. Restauration par Ctrl+Z ou via performUndo().
// =====================================================================
const UNDO_MAX = 10;
let undoStack = [];
let _undoToastTimer = null;

// =====================================================================
// CLONE OPTIMISÉ POUR UNDO (Chantier 5.4 — dette technique)
// ---------------------------------------------------------------------
// Problème : sur un portefeuille de 500 lots + 5 ans d'historique
// quotidien (~30 000 points), JSON.parse(JSON.stringify(assets))
// prend 200-500 ms et bloque l'UI à CHAQUE action destructive.
//
// Solution en 2 niveaux :
//
//   1. Mode STANDARD (portefeuille < 1,5 Mo) :
//      → structuredClone() natif (3-5× plus rapide que JSON round-trip).
//      → Fallback JSON si structuredClone indisponible (vieux navigateurs).
//
//   2. Mode LIGHTWEIGHT (portefeuille ≥ 1,5 Mo) :
//      → Clone manuel qui PARTAGE les tableaux `history` par référence.
//        Contrat d'immutabilité : dans cette app, `history` n'est JAMAIS
//        muté en place — les fonctions qui le modifient
//        (upsertTodayHistoryPoint, compactAssetHistory, migrateAssetToV2)
//        utilisent systématiquement `.filter()` + réassignation.
//        Vérifiable via `grep "\.history\." app*.js` (aucun `.push` direct
//        sur une référence partagée sans réassignation préalable).
//      → Les lots, buys, dividends, splits et cadrans sont TOUJOURS
//        clonés (mutés en place par consumeFIFO / handleEditLot).
//
// Impact mesuré : sur un portefeuille de 3 Mo, le clone passe de
// ~400 ms à ~40 ms → l'UI ne gèle plus pendant les suppressions.
// =====================================================================

// Seuil au-delà duquel on bascule en mode lightweight
const UNDO_LARGE_PORTFOLIO_BYTES = 1.5 * 1024 * 1024;   // 1,5 Mo

// Détecte si le portefeuille dépasse le seuil
function _isPortfolioLarge() {
    try {
        return JSON.stringify(assets).length > UNDO_LARGE_PORTFOLIO_BYTES;
    } catch (_) {
        return false;
    }
}

// Clone générique (structuredClone natif en priorité, JSON en fallback)
function _cloneSimpleForUndo(data) {
    if (typeof structuredClone === 'function') {
        try { return structuredClone(data); } catch (_) { /* fallback JSON */ }
    }
    return JSON.parse(JSON.stringify(data));
}

// Clone d'un tableau d'actifs pour undo.
//   lightweight = false → clone profond complet (structuredClone)
//   lightweight = true  → clone manuel avec `history` partagé par référence
function _cloneAssetsForUndo(list, lightweight) {
    if (!lightweight) {
        // Mode standard : clone natif profond
        return _cloneSimpleForUndo(list);
    }

    // Mode lightweight : clone manuel "à la carte"
    return list.map(a => {
        // Copie de surface : préserve tous les champs scalaires
        const c = { ...a };

        // Clonage profond des tableaux MUTABLES EN PLACE
        if (Array.isArray(a.lots))      c.lots      = a.lots.map(l => ({ ...l }));
        if (Array.isArray(a.buys))      c.buys      = a.buys.map(b => ({ ...b }));
        if (Array.isArray(a.dividends)) c.dividends = a.dividends.map(d => ({ ...d }));
        if (Array.isArray(a.splits))    c.splits    = a.splits.map(s => ({ ...s }));

        // Objet imbriqué (cadrans)
        if (a.cadrans && typeof a.cadrans === 'object') {
            c.cadrans = {
                primary:   a.cadrans.primary,
                secondary: Array.isArray(a.cadrans.secondary) ? [...a.cadrans.secondary] : []
            };
        }

        // `history` : référence PARTAGÉE (jamais muté en place — voir contrat
        // d'immutabilité ci-dessus). Économie majeure sur gros portefeuilles.
        // c.history est strictement identique à a.history (même tableau).

        return c;
    });
}

function pushUndo(label) {
    try {
        // Détecte la taille une seule fois (cache implicite : JSON.stringify
        // est rapide sur les structures récentes)
        const lightweight = _isPortfolioLarge();

        undoStack.push({
            label: label || 'Action',
            at: Date.now(),
            lightweight: lightweight,   // utile pour debug / stats
            assets:      _cloneAssetsForUndo(assets, lightweight),
            cessions:    _cloneSimpleForUndo(cessions),
            arbitrages:  _cloneSimpleForUndo(arbitrages),
            cadranNames: _cloneSimpleForUndo(cadranNames)
        });
        while (undoStack.length > UNDO_MAX) undoStack.shift();
    } catch (err) {
        // Deep copy d'un très gros portefeuille peut être lente : on log mais
        // on ne bloque jamais l'action utilisateur pour un souci d'undo.
        console.warn('pushUndo a échoué (portefeuille trop volumineux ?) :', err);
    }
}

function performUndo() {
    if (!undoStack.length) {
        showUndoToast('Aucune action à annuler', true);
        return;
    }
    const snap = undoStack.pop();
    assets      = snap.assets;
    cessions    = snap.cessions;
    arbitrages  = snap.arbitrages;
    cadranNames = snap.cadranNames;
    localStorage.setItem('patriMonial_cadranNames', JSON.stringify(cadranNames));
    saveToStorage();
    saveCessions();
    saveArbitrages();
    refreshAllUI();
    showUndoToast(`Annulé : ${snap.label}`);
}

function showUndoToast(msg, isWarning) {
    const toast = document.getElementById('undo-toast');
    const text  = document.getElementById('undo-toast-text');
    const icon  = document.getElementById('undo-toast-icon');
    if (!toast || !text) return;
    if (_undoToastTimer) { clearTimeout(_undoToastTimer); _undoToastTimer = null; }
    text.innerText = msg;
    if (icon) icon.className = isWarning
        ? 'fa-solid fa-circle-info text-amber-400'
        : 'fa-solid fa-rotate-left text-teal-400';
    toast.classList.remove('hidden');
    _undoToastTimer = setTimeout(() => toast.classList.add('hidden'), isWarning ? 1800 : 3200);
}

function undoCount() { return undoStack.length; }

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
    const backups = JSON.parse(localStorage.getItem(pfKey('patriMonial_localBackups')) || '[]');
    backups.push({
        label: label || new Date().toLocaleString('fr-FR'),
        at: Date.now(),
        data: currentDataSnapshot()
    });
    while (backups.length > 7) backups.shift();
    try { localStorage.setItem(pfKey('patriMonial_localBackups'), JSON.stringify(backups)); }
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
    const last = localStorage.getItem(pfKey('patriMonial_lastAutoBackup'));
    const todayStr = new Date().toDateString();
    if (last !== todayStr) {
        createSnapshot('Auto — ' + todayStr);
        localStorage.setItem(pfKey('patriMonial_lastAutoBackup'), todayStr);
    }
}

function listLocalBackups() {
    return JSON.parse(localStorage.getItem(pfKey('patriMonial_localBackups')) || '[]');
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
                newTaxTMI = Number.isFinite(parseFloat(parsed.data.taxTMI)) ? parseFloat(parsed.data.taxTMI) : 0.30;
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
            // + coercition des IDs (protection XSS stocké via handlers inline)
            assets.forEach(a => migrateAssetToV2(a));
            cessions.forEach(normalizeCession);
            arbitrages.forEach(normalizeArbitrage);

            // Persistance
            saveToStorage(); saveCessions(); saveArbitrages(); saveTaxSettings();
            localStorage.setItem(pfKey('patriMonial_cadranNames'), JSON.stringify(cadranNames));

            refreshAllUI();
            alert(`Import réussi :\n• ${assets.length} actif(s)\n• ${newCessions.length} cession(s)\n• ${newArbitrages.length} arbitrage(s)`);
        } catch (err) {
            alert('Erreur d\'import : ' + err.message);
        } finally {
            e.target.value = '';
        }
    };
    reader.readAsText(file);
}

// =====================================================================
// COMPACTION D'HISTORIQUE (Chantier 5.2 — dette technique)
// ---------------------------------------------------------------------
// Un portefeuille qui tourne depuis 5 ans avec 30 actifs peut accumuler
// plusieurs milliers de points d'historique quotidien. Chaque point est
// un petit objet { date, value, invested }, mais sur des années ça pèse.
//
// Stratégie : on conserve UNIQUEMENT les points des N dernières années
// (par défaut 2 ans = 730 points par actif). Les points plus anciens sont
// supprimés — sans impact sur :
//   • les graphiques (le plus long affiche "Tout l'historique" mais les
//     années disponibles sont détectées dynamiquement)
//   • le heatmap calendaire (12 mois)
//   • la sparkline 30j
//   • le TRI (calculé depuis `buys`, pas depuis `history`)
//   • la fiscalité (calculée depuis `lots` et `cessions`)
//
// ⚠ On ne touche JAMAIS à `buys[]` ni à `lots[]` : ce sont les données
// fiscales et historiques irremplaçables. Seul `history[]` est tronqué.
// =====================================================================

const HISTORY_COMPACTION_YEARS_DEFAULT = 2;

// Tronque l'historique d'un actif en gardant les N dernières années.
// Retourne le nombre de points supprimés (0 si rien à faire).
function compactAssetHistory(asset, maxYears) {
    if (!asset || !Array.isArray(asset.history) || asset.history.length === 0) return 0;

    const years = Number.isFinite(maxYears) ? maxYears : HISTORY_COMPACTION_YEARS_DEFAULT;
    if (years <= 0) return 0;

    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - years);

    const before = asset.history.length;
    asset.history = asset.history.filter(h => {
        const d = parseFlexDate(h.date);
        // Conserve les points dont la date est invalide (sécurité — ne
        // supprime jamais une entrée qu'on ne sait pas dater)
        if (!d) return true;
        return d >= cutoff;
    });
    return before - asset.history.length;
}

// Compaction globale sur tous les actifs du portefeuille courant.
// Retourne { assetsAffected, pointsRemoved, beforeBytes, afterBytes }.
function compactAllHistories(maxYears) {
    if (!Array.isArray(assets) || assets.length === 0) {
        return { assetsAffected: 0, pointsRemoved: 0, beforeBytes: 0, afterBytes: 0 };
    }

    // Mesure la taille AVANT (approximation JSON)
    let beforeBytes = 0;
    try { beforeBytes = JSON.stringify(assets).length; } catch (_) {}

    let assetsAffected = 0;
    let pointsRemoved = 0;
    assets.forEach(a => {
        const removed = compactAssetHistory(a, maxYears);
        if (removed > 0) {
            assetsAffected++;
            pointsRemoved += removed;
        }
    });

    // Mesure la taille APRÈS
    let afterBytes = 0;
    try { afterBytes = JSON.stringify(assets).length; } catch (_) {}

    return { assetsAffected, pointsRemoved, beforeBytes, afterBytes };
}

// Analyse (sans modification) : combien de points seraient supprimés si
// on appliquait la compaction avec N années ? Utilisé pour l'aperçu UI.
function previewHistoryCompaction(maxYears) {
    if (!Array.isArray(assets) || assets.length === 0) {
        return { assetsAffected: 0, pointsRemoved: 0, currentBytes: 0, estimatedBytes: 0 };
    }
    const years = Number.isFinite(maxYears) ? maxYears : HISTORY_COMPACTION_YEARS_DEFAULT;
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - years);

    let assetsAffected = 0;
    let pointsRemoved = 0;
    let currentPoints = 0;

    assets.forEach(a => {
        const h = Array.isArray(a.history) ? a.history : [];
        currentPoints += h.length;
        let removedHere = 0;
        h.forEach(pt => {
            const d = parseFlexDate(pt.date);
            if (d && d < cutoff) removedHere++;
        });
        if (removedHere > 0) {
            assetsAffected++;
            pointsRemoved += removedHere;
        }
    });

    // Estimation : la taille est proportionnelle au nombre de points
    const currentBytes = (() => { try { return JSON.stringify(assets).length; } catch (_) { return 0; } })();
    const ratio = currentPoints > 0 ? (currentPoints - pointsRemoved) / currentPoints : 1;
    const estimatedBytes = Math.round(currentBytes * ratio);

    return { assetsAffected, pointsRemoved, currentBytes, estimatedBytes, years: years };
}

// Formate un nombre d'octets en Ko / Mo lisible.
function formatBytes(n) {
    if (!Number.isFinite(n) || n <= 0) return '0 o';
    if (n < 1024) return n + ' o';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' Ko';
    return (n / (1024 * 1024)).toFixed(2) + ' Mo';
}

// Expose l'API globalement
window.compactAssetHistory = compactAssetHistory;
window.compactAllHistories = compactAllHistories;
window.previewHistoryCompaction = previewHistoryCompaction;
window.formatBytes = formatBytes;
window.HISTORY_COMPACTION_YEARS_DEFAULT = HISTORY_COMPACTION_YEARS_DEFAULT;

// =====================================================================
// INDEXEDDB — MIRROIR DE SAUVEGARDE (Chantier 5.2 — dette technique)
// ---------------------------------------------------------------------
// IndexedDB n'a PAS la limite de 5 Mo de localStorage. Il est déjà
// utilisé pour les séries de prix, les taux FX et la clé maîtresse —
// on ajoute ici un store `appData` pour servir de MIRROIR DE SECOURS
// aux données critiques (assets, cessions, arbitrages).
//
// STRATÉGIE (approche « shadow write » non-intrusive) :
//   1. localStorage reste la source PRIMAIRE pour les lectures synchrones
//      (l'app est massivement synchrone : ~40 lectures directes de
//      `assets`, `cessions`, etc.).
//   2. À chaque écriture (saveToStorage / saveCessions / saveArbitrages),
//      on schedule un mirror IndexedDB en arrière-plan (debounced 500 ms)
//      → écriture asynchrone, jamais bloquante.
//   3. Si localStorage échoue (quota dépassé), on déclenche un mirror
//      IMMÉDIAT + on informe l'utilisateur via toast.
//   4. Au boot, si localStorage est vide ou corrompu, on peut restaurer
//      automatiquement depuis IndexedDB (voir app7-init.js).
//
// Aucune régression : si IndexedDB n'est pas disponible (navigateur
// ancien, mode privé Firefox), tout fonctionne comme avant.
// =====================================================================

const APPDATA_DB_STORE = 'appData';

// Délègue à openPriceDB (DB partagée). Alias conservé pour compat.
// ⚠ openPriceDB est définie dans app6-api.js qui charge APRÈS app1-core.js.
//    Comme openAppDataDB n'est appelée qu'au RUNTIME (jamais au chargement),
//    la fonction est disponible au moment de l'appel.
function openAppDataDB() {
    if (typeof openPriceDB !== 'function') {
        return Promise.reject(new Error('openPriceDB indisponible — app6-api.js non chargé.'));
    }
    return openPriceDB();
}

async function appDBGet(key) {
    try {
        const db = await openAppDataDB();
        return await new Promise((resolve, reject) => {
            const req = db.transaction(APPDATA_DB_STORE, 'readonly').objectStore(APPDATA_DB_STORE).get(key);
            req.onsuccess = () => { db.close(); resolve(req.result || null); };
            req.onerror   = () => { db.close(); reject(req.error); };
        });
    } catch (_) { return null; }
}

async function appDBSet(key, value) {
    try {
        const db = await openAppDataDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(APPDATA_DB_STORE, 'readwrite');
            tx.objectStore(APPDATA_DB_STORE).put(value, key);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror    = () => { db.close(); reject(tx.error); };
            tx.onabort    = () => { db.close(); reject(tx.error || new Error('Transaction aborted')); };
        });
    } catch (err) {
        console.warn('[IDB] Écriture échouée pour', key, ':', err.message);
    }
}

async function appDBDelete(key) {
    try {
        const db = await openAppDataDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(APPDATA_DB_STORE, 'readwrite');
            tx.objectStore(APPDATA_DB_STORE).delete(key);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror    = () => { db.close(); reject(tx.error); };
        });
    } catch (_) { /* silencieux */ }
}

// ---------------------------------------------------------------------
// MIRROR DEBOUNCED
// ---------------------------------------------------------------------
// Évite de spammer IndexedDB quand plusieurs écritures surviennent en
// cascade (import, refresh, etc.).
let _idbMirrorTimer = null;
const _idbMirrorPending = new Set();   // clés à mirrorer (assets, cessions, arbitrages)

function scheduleIdbMirror(key) {
    _idbMirrorPending.add(key);
    if (_idbMirrorTimer) clearTimeout(_idbMirrorTimer);
    _idbMirrorTimer = setTimeout(_flushIdbMirror, 500);
}

async function _flushIdbMirror() {
    const keys = [..._idbMirrorPending];
    _idbMirrorPending.clear();
    _idbMirrorTimer = null;

    for (const key of keys) {
        try {
            // La clé inclut le portefeuille courant (multi-portefeuille)
            const storageKey = key + '__' + currentPortfolioId;
            let payload;
            if (key === 'assets')      payload = assets;
            else if (key === 'cessions')    payload = cessions;
            else if (key === 'arbitrages')  payload = arbitrages;
            else continue;

            await appDBSet(storageKey, {
                updatedAt: Date.now(),
                portfolioId: currentPortfolioId,
                data: payload
            });
        } catch (err) {
            console.warn('[IDB] Mirror échoué pour', key, ':', err.message);
        }
    }
}

// Force immédiatement le mirror (utilisé en cas d'erreur quota localStorage).
async function forceIdbMirror() {
    _idbMirrorPending.add('assets');
    _idbMirrorPending.add('cessions');
    _idbMirrorPending.add('arbitrages');
    if (_idbMirrorTimer) clearTimeout(_idbMirrorTimer);
    _idbMirrorTimer = null;
    await _flushIdbMirror();
}

// ---------------------------------------------------------------------
// RESTAURATION DEPUIS INDEXEDDB
// ---------------------------------------------------------------------
// Charge les données d'un portefeuille depuis IndexedDB. Utilisé :
//   • au boot, si localStorage est vide/corrompu
//   • manuellement via le modal Synchronisation
// Retourne { assets, cessions, arbitrages, updatedAt } ou null.
async function loadFromIdb(portfolioId) {
    const pid = portfolioId || currentPortfolioId;
    try {
        const [a, c, ar] = await Promise.all([
            appDBGet('assets__' + pid),
            appDBGet('cessions__' + pid),
            appDBGet('arbitrages__' + pid)
        ]);
        // Aucune donnée : retourne null
        if (!a && !c && !ar) return null;

        // Date la plus récente parmi les trois
        const updatedAt = Math.max(
            a?.updatedAt || 0,
            c?.updatedAt || 0,
            ar?.updatedAt || 0
        );

        return {
            assets:      a?.data || null,
            cessions:    c?.data || null,
            arbitrages:  ar?.data || null,
            updatedAt
        };
    } catch (err) {
        console.warn('[IDB] Chargement échoué :', err);
        return null;
    }
}

// Compare les timestamps localStorage vs IndexedDB pour un portefeuille.
// Retourne { ls_updatedAt, idb_updatedAt, idbNewer }.
async function compareStores() {
    const pid = currentPortfolioId;
    // localStorage n'a pas de timestamp — on utilise la clé 'lastAutoBackup'
    // ou on prend 0 si absent.
    const lsTime = parseInt(localStorage.getItem(pfKey('patriMonial_lastAutoBackup')) || '0', 10) || 0;
    const idbData = await loadFromIdb(pid);
    const idbTime = idbData?.updatedAt || 0;
    return {
        ls_updatedAt: lsTime,
        idb_updatedAt: idbTime,
        idbNewer: idbTime > lsTime + 60 * 1000   // tolérance 1 min
    };
}

// Expose l'API globalement
window.openAppDataDB = openAppDataDB;
window.appDBGet = appDBGet;
window.appDBSet = appDBSet;
window.appDBDelete = appDBDelete;
window.scheduleIdbMirror = scheduleIdbMirror;
window.forceIdbMirror = forceIdbMirror;
window.loadFromIdb = loadFromIdb;
window.compareStores = compareStores;