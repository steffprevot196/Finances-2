// =====================================================================
// tests.js — TESTS UNITAIRES (Chantier 5.1 — dette technique)
// Dépend de : tous les modules de l'app (chargé en dernier)
// Charge après app27-broker-import.js, avant app7-init.js
// =====================================================================
//
// Mini-framework de tests sans dépendance externe (pas de Jest, pas de
// npm). S'exécute UNIQUEMENT à la demande :
//   • Depuis la console : runTests()
//   • Depuis la palette Ctrl+K : commande « Lancer les tests unitaires »
//
// Aucune donnée globale n'est modifiée durablement : les tests qui
// touchent aux assets/cessions font un backup + restore systématique.
//
// Résultat : un objet { total, passed, failed, durationMs, results[] }
// et un tableau console.table() pour un affichage tabulaire.
// =====================================================================

// ---------------------------------------------------------------------
// MINI-FRAMEWORK
// ---------------------------------------------------------------------
const _testResults = [];
let _currentSuite = 'Général';

// Change la suite courante (utilisé par les groupes de tests)
function _suite(name) {
    _currentSuite = name;
}

// Assertion de base : enregistre un résultat pass/fail
function _assert(condition, testName, details = '') {
    _testResults.push({
        suite: _currentSuite,
        name: testName,
        passed: !!condition,
        details: condition ? '' : String(details || 'Assertion échouée')
    });
}

// Vérifie l'égalité stricte
function assertEq(actual, expected, testName) {
    const pass = actual === expected;
    _assert(pass, testName, pass ? '' : `Attendu : ${JSON.stringify(expected)} · Obtenu : ${JSON.stringify(actual)}`);
}

// Vérifie l'égalité avec tolérance (nombres flottants)
function assertApprox(actual, expected, tolerance, testName) {
    if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
        _assert(false, testName, `Valeur non numérique : actual=${actual}, expected=${expected}`);
        return;
    }
    const diff = Math.abs(actual - expected);
    const pass = diff <= tolerance;
    _assert(pass, testName, pass ? '' : `Attendu ≈ ${expected} (±${tolerance}) · Obtenu ${actual} · Écart ${diff}`);
}

// Vérifie qu'une valeur est null ou undefined
function assertNull(actual, testName) {
    const pass = actual === null || actual === undefined;
    _assert(pass, testName, pass ? '' : `Attendu null/undefined · Obtenu ${JSON.stringify(actual)}`);
}

// Vérifie qu'une valeur est truthy
function assertTrue(actual, testName) {
    _assert(!!actual, testName, !!actual ? '' : `Attendu truthy · Obtenu ${JSON.stringify(actual)}`);
}

// Vérifie qu'une valeur est falsy
function assertFalse(actual, testName) {
    _assert(!actual, testName, !actual ? '' : `Attendu falsy · Obtenu ${JSON.stringify(actual)}`);
}

// Vérifie qu'une fonction ne throw pas, ou qu'elle throw bien
function assertThrows(fn, testName) {
    let threw = false;
    try { fn(); } catch (_) { threw = true; }
    _assert(threw, testName, threw ? '' : 'Aucune exception levée alors qu\'une était attendue');
}

function assertDoesNotThrow(fn, testName) {
    let threw = false;
    let err = '';
    try { fn(); } catch (e) { threw = true; err = e.message; }
    _assert(!threw, testName, threw ? `Exception inattendue : ${err}` : '');
}

// ---------------------------------------------------------------------
// TESTS : parseFlexDate
// ---------------------------------------------------------------------
_suite('parseFlexDate');
(function testParseFlexDate() {
    // Format FR : JJ/MM/AAAA
    const d1 = parseFlexDate('15/03/2024');
    assertTrue(d1 instanceof Date, 'parseFlexDate accepte JJ/MM/AAAA');
    if (d1) {
        assertEq(d1.getDate(), 15, 'parseFlexDate extrait le jour');
        assertEq(d1.getMonth(), 2, 'parseFlexDate extrait le mois (0-indexé)');
        assertEq(d1.getFullYear(), 2024, 'parseFlexDate extrait l\'année');
    }

    // Format "Mois AAAA" (FR abrégé)
    const d2 = parseFlexDate('Jan 2024');
    assertTrue(d2 instanceof Date, 'parseFlexDate accepte "Mois AAAA"');
    if (d2) {
        assertEq(d2.getMonth(), 0, 'parseFlexDate "Jan 2024" → janvier');
        assertEq(d2.getFullYear(), 2024, 'parseFlexDate "Jan 2024" → 2024');
    }

    // Format ISO
    const d3 = parseFlexDate('2024-06-15');
    assertTrue(d3 instanceof Date, 'parseFlexDate accepte ISO YYYY-MM-DD');

    // Chaîne invalide
    assertNull(parseFlexDate(''), 'parseFlexDate("") → null');
    assertNull(parseFlexDate(null), 'parseFlexDate(null) → null');
})();

// ---------------------------------------------------------------------
// TESTS : formatEUR et formatUnitPrice
// ---------------------------------------------------------------------
_suite('formatEUR / formatUnitPrice');
(function testFormat() {
    const eur = formatEUR(1234.56);
    assertTrue(eur.includes('234'), 'formatEUR affiche la partie entière');
    assertTrue(eur.includes('€'), 'formatEUR contient le symbole €');

    assertEq(formatEUR(0), '0,00 €', 'formatEUR(0) → "0,00 €"');
    assertEq(formatEUR(null), '0,00 €', 'formatEUR(null) → "0,00 €"');

    // formatUnitPrice : petit prix → beaucoup de décimales
    const small = formatUnitPrice(0.00001234);
    assertTrue(small.includes('0,00001'), 'formatUnitPrice gère les très petites valeurs');

    const big = formatUnitPrice(1234.56);
    assertTrue(big.includes('234,56'), 'formatUnitPrice gère les valeurs normales');
})();

// ---------------------------------------------------------------------
// TESTS : computePRUFromLots
// ---------------------------------------------------------------------
_suite('computePRUFromLots');
(function testPRU() {
    // PRU d'un actif simple : 10 unités à 100 € + 10 € de frais = 1010 € → PRU 101
    const asset = {
        lots: [
            { qty: 10, qtyRemaining: 10, price: 100, frais: 10 }
        ]
    };
    assertApprox(computePRUFromLots(asset), 101, 0.001, 'PRU avec frais inclus');

    // PRU multi-lots : 5 à 100 € + 5 à 200 € = 1500 / 10 = 150
    const asset2 = {
        lots: [
            { qty: 5, qtyRemaining: 5, price: 100, frais: 0 },
            { qty: 5, qtyRemaining: 5, price: 200, frais: 0 }
        ]
    };
    assertApprox(computePRUFromLots(asset2), 150, 0.001, 'PRU moyenne pondérée');

    // Lots partiellement vendus
    const asset3 = {
        lots: [
            { qty: 10, qtyRemaining: 5, price: 100, frais: 0 },
            { qty: 5, qtyRemaining: 5, price: 200, frais: 0 }
        ]
    };
    // 5 unités à 100 + 5 à 200 = 500 + 1000 = 1500 / 10 = 150
    assertApprox(computePRUFromLots(asset3), 150, 0.001, 'PRU ignore les unités vendues');

    // Aucun lot
    assertEq(computePRUFromLots({ lots: [] }), 0, 'PRU sans lots → 0');
})();

// ---------------------------------------------------------------------
// TESTS : consumeFIFO
// ---------------------------------------------------------------------
_suite('consumeFIFO');
(function testFIFO() {
    // Cas simple : 2 lots, on vend 3 unités → consomme 3 du lot le plus ancien
    const asset = {
        lots: [
            { id: 1, date: '2024-01-01', qty: 5, qtyRemaining: 5, price: 100, frais: 0 },
            { id: 2, date: '2024-02-01', qty: 5, qtyRemaining: 5, price: 200, frais: 0 }
        ]
    };
    const result = consumeFIFO(asset, 3);
    assertEq(result.error, undefined, 'consumeFIFO ne renvoie pas d\'erreur');
    assertApprox(result.costBasis, 300, 0.001, 'consumeFIFO coût total (3 × 100 €)');
    assertEq(asset.lots[0].qtyRemaining, 2, 'consumeFIFO réduit le lot le plus ancien');
    assertEq(asset.lots[1].qtyRemaining, 5, 'consumeFIFO laisse le lot récent intact');

    // Cas : on vend plus que dispo → erreur
    const asset2 = {
        lots: [{ id: 1, date: '2024-01-01', qty: 5, qtyRemaining: 5, price: 100, frais: 0 }]
    };
    const result2 = consumeFIFO(asset2, 10);
    assertTrue(result2.error, 'consumeFIFO renvoie une erreur si quantité insuffisante');

    // Cas : traversée de plusieurs lots
    const asset3 = {
        lots: [
            { id: 1, date: '2024-01-01', qty: 3, qtyRemaining: 3, price: 100, frais: 0 },
            { id: 2, date: '2024-02-01', qty: 5, qtyRemaining: 5, price: 200, frais: 0 }
        ]
    };
    const result3 = consumeFIFO(asset3, 5);
    // 3 unités à 100 + 2 à 200 = 300 + 400 = 700
    assertApprox(result3.costBasis, 700, 0.001, 'consumeFIFO traverse plusieurs lots');
    assertEq(asset3.lots[0].qtyRemaining, 0, 'consumeFIFO vide le premier lot');
    assertEq(asset3.lots[1].qtyRemaining, 3, 'consumeFIFO entame le second lot');
})();

// ---------------------------------------------------------------------
// TESTS : computeTIR
// ---------------------------------------------------------------------
_suite('computeTIR');
(function testTIR() {
    // Cas simple : 100 € investis le 01/01/2023, 110 € reçus le 01/01/2025
    // → TRI annuel ≈ 4,88 % (110/100)^(1/2) - 1 ≈ 0.0488
    const flows = [
        { date: new Date('2023-01-01'), amount: -100 },
        { date: new Date('2025-01-01'), amount: 110 }
    ];
    const tir = computeTIR(flows);
    assertTrue(tir !== null && Number.isFinite(tir), 'computeTIR renvoie un résultat numérique');
    assertApprox(tir, 0.0488, 0.005, 'computeTIR approx. 4,88 % sur 2 ans');

    // Cas dégénérés
    assertNull(computeTIR([]), 'computeTIR([]) → null');
    assertNull(computeTIR([{ date: new Date(), amount: -100 }]), 'computeTIR avec un seul flux → null');

    // Tous les flux positifs (pas de TRI)
    const allPositive = [
        { date: new Date('2023-01-01'), amount: 100 },
        { date: new Date('2024-01-01'), amount: 100 }
    ];
    assertNull(computeTIR(allPositive), 'computeTIR que des flux positifs → null');

    // Durée trop courte (< 30 jours)
    const shortFlows = [
        { date: new Date('2024-01-01'), amount: -100 },
        { date: new Date('2024-01-15'), amount: 110 }
    ];
    assertNull(computeTIR(shortFlows), 'computeTIR durée < 30 jours → null');

    // Perte : 100 € investis, 80 € reçus au bout d'un an
    const lossFlows = [
        { date: new Date('2023-01-01'), amount: -100 },
        { date: new Date('2024-01-01'), amount: 80 }
    ];
    const lossTIR = computeTIR(lossFlows);
    assertTrue(lossTIR !== null && lossTIR < 0, 'computeTIR renvoie un taux négatif sur une perte');
    assertApprox(lossTIR, -0.20, 0.01, 'computeTIR approx. -20 % sur 1 an');
})();

// ---------------------------------------------------------------------
// TESTS : computeCessionLine
// ---------------------------------------------------------------------
_suite('computeCessionLine');

// Backup/restore de l'état global pour isoler les tests
const _originalTaxMode = (typeof taxRegimeMode !== 'undefined') ? taxRegimeMode : 'PFU';
const _originalTMI = (typeof taxTMI !== 'undefined') ? taxTMI : 0.30;

(function testCessionLine() {
    // --- Cas 1 : PFU sur une action en plus-value ---
    if (typeof taxRegimeMode !== 'undefined') taxRegimeMode = 'PFU';
    const cession1 = {
        type: 'ACTION_ETF',
        subType: 'ACTION',
        name: 'Test Action',
        dateVente: '2025-06-15',
        dateAchat: '2024-06-15',
        prixVente: 1000,
        prixAchat: 800,
        frais: 0,
        avant2018: false,
        envelope: 'CTO'
    };
    const line1 = computeCessionLine(cession1);
    assertEq(line1.pvBrute, 200, 'computeCessionLine : PV brute = 200 €');
    assertApprox(line1.taxLine, 60, 0.001, 'computeCessionLine : impôt PFU 30 % = 60 €');

    // --- Cas 2 : Barème sur une action ---
    if (typeof taxRegimeMode !== 'undefined') taxRegimeMode = 'BAREME';
    if (typeof taxTMI !== 'undefined') taxTMI = 0.30;
    const line2 = computeCessionLine(cession1);
    // Barème : 200 × 0.30 (IR) + 200 × 0.172 (PS) − 200 × 0.068 × 0.30 (CSG)
    //       = 60 + 34.4 − 4.08 = 90.32
    assertApprox(line2.taxLine, 90.32, 0.01, 'computeCessionLine : impôt barème = 90,32 €');

    // --- Cas 3 : Jeton ≤ 5 000 € → exonéré ---
    const cessionJeton = {
        type: 'JETON',
        name: 'Vera Valor',
        dateVente: '2025-06-15',
        dateAchat: '2024-06-15',
        prixVente: 4000,
        prixAchat: 3000,
        frais: 0
    };
    const lineJeton = computeCessionLine(cessionJeton);
    assertEq(lineJeton.taxLine, 0, 'computeCessionLine : jeton ≤ 5000 € → exonéré');

    // --- Cas 4 : Jeton > 5 000 € → TFOP 6,5 % ---
    const cessionJeton2 = { ...cessionJeton, prixVente: 6000 };
    const lineJeton2 = computeCessionLine(cessionJeton2);
    assertApprox(lineJeton2.taxLine, 390, 0.01, 'computeCessionLine : jeton > 5000 € → TFOP 6,5 % = 390 €');

    // --- Cas 5 : Pièce Cours Légal, TFMP vs TPV (choix optimal) ---
    const cessionOr = {
        type: 'COURS_LEGAL',
        name: 'Napoléon',
        dateVente: '2025-06-15',
        dateAchat: '2020-06-15',
        prixVente: 1000,
        prixAchat: 700,
        frais: 0
    };
    const lineOr = computeCessionLine(cessionOr);
    // TFMP = 1000 × 0.115 = 115 €
    // TPV  = 300 × 0.362 × (1 − 0.05 × (5−2)) = 300 × 0.362 × 0.85 = 92.31 €
    // Optimal = 92.31 € (TPV)
    assertTrue(lineOr.taxLine > 0 && lineOr.taxLine < 115, 'computeCessionLine : pièce cours légal → TPV préférée à TFMP');
    assertApprox(lineOr.taxLine, 92.31, 0.5, 'computeCessionLine : pièce cours légal → TPV ≈ 92,31 €');
})();

// Restaure l'état fiscal d'origine
if (typeof taxRegimeMode !== 'undefined') taxRegimeMode = _originalTaxMode;
if (typeof taxTMI !== 'undefined') taxTMI = _originalTMI;

// ---------------------------------------------------------------------
// TESTS : getAssetTaxNature
// ---------------------------------------------------------------------
_suite('getAssetTaxNature');
(function testTaxNature() {
    // Titres CTO
    const titres = {
        categories: ['Action'],
        envelope: 'CTO'
    };
    assertEq(getAssetTaxNature(titres), 'TITRES', 'getAssetTaxNature : action CTO → TITRES');

    // Crypto
    const crypto = {
        categories: ['Crypto'],
        envelope: ''
    };
    assertEq(getAssetTaxNature(crypto), 'CRYPTO', 'getAssetTaxNature : crypto → CRYPTO');

    // PEA → exclu
    const pea = {
        categories: ['Action'],
        envelope: 'PEA'
    };
    assertNull(getAssetTaxNature(pea), 'getAssetTaxNature : PEA → null (hors pool)');

    // Métaux → exclu
    const metaux = {
        categories: ['Or & Métaux'],
        taxCategory: 'JETON',
        envelope: ''
    };
    assertNull(getAssetTaxNature(metaux), 'getAssetTaxNature : métaux → null (régime dédié)');

    // ETF CTO
    const etf = {
        categories: ['ETF'],
        envelope: 'CTO'
    };
    assertEq(getAssetTaxNature(etf), 'TITRES', 'getAssetTaxNature : ETF CTO → TITRES');
})();

// ---------------------------------------------------------------------
// TESTS : _analyzeBrokerImport (détection créations vs fusions)
// ---------------------------------------------------------------------
_suite('_analyzeBrokerImport');
(function testAnalyzeBrokerImport() {
    // On teste avec des données synthétiques — la fonction dépend de `assets` global.
    // On utilise un asset temporaire injecté puis retiré.
    const backup = assets.slice();

    // Injecte un actif BTC existant
    assets.push({
        id: 999001,
        name: 'Bitcoin (test)',
        ticker: 'BTC',
        categories: ['Crypto'],
        envelope: '',
        qty: 1,
        invested: 30000,
        value: 60000,
        lots: [{ id: 1, date: '2024-01-01', qty: 1, qtyRemaining: 1, price: 30000, frais: 0 }]
    });

    // Positions à analyser : BTC (fusion) + SOL (création)
    const positions = [
        { ticker: 'BTC', name: 'Bitcoin', qty: 0.5, priceEUR: 60000, valueEUR: 30000 },
        { ticker: 'SOL', name: 'Solana', qty: 10, priceEUR: 150, valueEUR: 1500 }
    ];
    const result = _analyzeBrokerImport(positions);

    assertEq(result.toCreate.length, 1, '_analyzeBrokerImport : 1 création (SOL)');
    assertEq(result.toCreate[0].ticker, 'SOL', '_analyzeBrokerImport : la création est SOL');
    assertEq(result.toMerge.length, 1, '_analyzeBrokerImport : 1 fusion (BTC)');
    assertEq(result.toMerge[0].position.ticker, 'BTC', '_analyzeBrokerImport : la fusion est BTC');
    assertApprox(result.toMerge[0].newQty, 1.5, 0.001, '_analyzeBrokerImport : nouvelle quantité BTC = 1,5');

    // Restaure l'état
    assets.length = 0;
    backup.forEach(a => assets.push(a));
})();

// ---------------------------------------------------------------------
// TESTS : compactAssetHistory (Chantier 5.2 — dette technique)
// ---------------------------------------------------------------------
_suite('compactAssetHistory');
(function testCompactHistory() {
    // Cas 1 : historique vide
    const a1 = { history: [] };
    assertEq(compactAssetHistory(a1, 2), 0, 'compactAssetHistory : historique vide → 0');
    assertEq(a1.history.length, 0, 'compactAssetHistory : historique vide reste vide');

    // Cas 2 : historique récent (rien à supprimer)
    const now = new Date();
    const oneYearAgo = new Date(now); oneYearAgo.setFullYear(now.getFullYear() - 1);
    const a2 = {
        history: [
            { date: now.toLocaleDateString('fr-FR'), value: 100, invested: 90 },
            { date: oneYearAgo.toLocaleDateString('fr-FR'), value: 95, invested: 90 }
        ]
    };
    assertEq(compactAssetHistory(a2, 2), 0, 'compactAssetHistory : tout récent → 0 supprimé');
    assertEq(a2.history.length, 2, 'compactAssetHistory : tout récent reste intact');

    // Cas 3 : historique ancien (points > 2 ans)
    const threeYearsAgo = new Date(now); threeYearsAgo.setFullYear(now.getFullYear() - 3);
    const fiveYearsAgo  = new Date(now); fiveYearsAgo.setFullYear(now.getFullYear() - 5);
    const a3 = {
        history: [
            { date: fiveYearsAgo.toLocaleDateString('fr-FR'), value: 80, invested: 70 },
            { date: threeYearsAgo.toLocaleDateString('fr-FR'), value: 85, invested: 80 },
            { date: oneYearAgo.toLocaleDateString('fr-FR'), value: 95, invested: 90 },
            { date: now.toLocaleDateString('fr-FR'), value: 100, invested: 90 }
        ]
    };
    const removed = compactAssetHistory(a3, 2);
    assertEq(removed, 2, 'compactAssetHistory : 2 points de plus de 2 ans supprimés');
    assertEq(a3.history.length, 2, 'compactAssetHistory : 2 points récents conservés');

    // Cas 4 : données invalides (dates non parsables → conservées par sécurité)
    const a4 = {
        history: [
            { date: 'invalide', value: 50, invested: 50 },
            { date: now.toLocaleDateString('fr-FR'), value: 100, invested: 90 }
        ]
    };
    const removed4 = compactAssetHistory(a4, 1);
    assertEq(removed4, 0, 'compactAssetHistory : date invalide conservée par sécurité');
    assertEq(a4.history.length, 2, 'compactAssetHistory : rien supprimé si dates non parsables');

    // Cas 5 : maxYears = 0 → désactive la compaction
    assertEq(compactAssetHistory(a3, 0), 0, 'compactAssetHistory : maxYears=0 → aucune suppression');
})();

// ---------------------------------------------------------------------
// TESTS : previewHistoryCompaction
// ---------------------------------------------------------------------
_suite('previewHistoryCompaction');
(function testPreviewCompaction() {
    // Backup de l'état global
    const backup = assets.slice();

    // Vide les assets puis injecte un jeu de test
    assets.length = 0;
    const now = new Date();
    const oneYearAgo = new Date(now); oneYearAgo.setFullYear(now.getFullYear() - 1);
    const fourYearsAgo = new Date(now); fourYearsAgo.setFullYear(now.getFullYear() - 4);

    assets.push({
        id: 998001,
        name: 'Actif test',
        ticker: 'TEST',
        categories: ['Autre'],
        envelope: '',
        history: [
            { date: fourYearsAgo.toLocaleDateString('fr-FR'), value: 50, invested: 50 },
            { date: oneYearAgo.toLocaleDateString('fr-FR'), value: 90, invested: 90 },
            { date: now.toLocaleDateString('fr-FR'), value: 100, invested: 100 }
        ]
    });

    const preview = previewHistoryCompaction(2);
    assertEq(preview.pointsRemoved, 1, 'previewHistoryCompaction : 1 point à supprimer (le plus ancien)');
    assertEq(preview.assetsAffected, 1, 'previewHistoryCompaction : 1 actif concerné');
    assertTrue(preview.currentBytes > 0, 'previewHistoryCompaction : taille > 0');
    assertTrue(preview.estimatedBytes < preview.currentBytes, 'previewHistoryCompaction : estimation après < avant');
    assertEq(preview.years, 2, 'previewHistoryCompaction : years correctement reporté');

    // Restaure
    assets.length = 0;
    backup.forEach(a => assets.push(a));
})();

// ---------------------------------------------------------------------
// TESTS : formatBytes
// ---------------------------------------------------------------------
_suite('formatBytes');
(function testFormatBytes() {
    assertEq(formatBytes(0), '0 o', 'formatBytes(0) → "0 o"');
    assertEq(formatBytes(500), '500 o', 'formatBytes(500) → "500 o"');
    assertEq(formatBytes(2048), '2.0 Ko', 'formatBytes(2048) → "2.0 Ko"');
    assertEq(formatBytes(1024 * 1024), '1.00 Mo', 'formatBytes(1 Mo) → "1.00 Mo"');
    assertEq(formatBytes(3.5 * 1024 * 1024), '3.50 Mo', 'formatBytes(3,5 Mo) → "3.50 Mo"');
    assertEq(formatBytes(-10), '0 o', 'formatBytes(-10) → "0 o" (valeur négative)');
})();

// ---------------------------------------------------------------------
// TESTS : _cloneAssetsForUndo (Chantier 5.4 — dette technique)
// ---------------------------------------------------------------------
_suite('_cloneAssetsForUndo');
(function testCloneAssetsForUndo() {
    // -----------------------------------------------------------------
    // Cas 1 : mode standard (lightweight = false) → clone profond complet
    // -----------------------------------------------------------------
    const original = [{
        id: 1,
        name: 'Test',
        ticker: 'TST',
        qty: 10,
        invested: 1000,
        value: 1200,
        lots: [{ id: 10, date: '2024-01-01', qty: 10, qtyRemaining: 10, price: 100, frais: 0 }],
        buys: [{ date: '01/01/2024', qty: 10, price: 100, frais: 0 }],
        dividends: [{ id: 1, date: '2024-06-01', amount: 50 }],
        splits: [],
        cadrans: { primary: 'OR', secondary: ['ASIE'] },
        history: [{ date: '01/01/2024', value: 1000, invested: 1000 }]
    }];

    const cloned = _cloneAssetsForUndo(original, false);
    assertEq(cloned.length, 1, '_cloneAssetsForUndo : même nombre d\'éléments');
    assertEq(cloned[0].id, 1, '_cloneAssetsForUndo : id préservé');
    assertEq(cloned[0].name, 'Test', '_cloneAssetsForUndo : name préservé');
    assertTrue(cloned[0] !== original[0], '_cloneAssetsForUndo : objet racine différent');
    assertTrue(cloned[0].lots !== original[0].lots, '_cloneAssetsForUndo : tableau lots différent (mode standard)');
    assertTrue(cloned[0].history !== original[0].history, '_cloneAssetsForUndo : tableau history différent (mode standard)');

    // Modifie le clone → n'impacte pas l'original
    cloned[0].lots[0].qty = 999;
    assertEq(original[0].lots[0].qty, 10, '_cloneAssetsForUndo : modifier le clone n\'impacte pas l\'original (mode standard)');

    // -----------------------------------------------------------------
    // Cas 2 : mode lightweight (lightweight = true)
    //   → lots/buys/dividends/splits clonés
    //   → history PARTAGÉ (même référence)
    // -----------------------------------------------------------------
    const original2 = [{
        id: 2,
        name: 'Test Light',
        ticker: 'TL',
        qty: 5,
        invested: 500,
        value: 600,
        lots: [{ id: 20, date: '2024-01-01', qty: 5, qtyRemaining: 5, price: 100, frais: 0 }],
        buys: [{ date: '01/01/2024', qty: 5, price: 100, frais: 0 }],
        dividends: [{ id: 2, date: '2024-06-01', amount: 25 }],
        splits: [{ id: 3, date: '2024-03-01', ratio: 2, note: 'Split test' }],
        cadrans: { primary: 'ASIE', secondary: ['MONNAIES'] },
        history: [
            { date: '01/01/2024', value: 500, invested: 500 },
            { date: '02/01/2024', value: 510, invested: 500 }
        ]
    }];

    const cloned2 = _cloneAssetsForUndo(original2, true);
    assertEq(cloned2.length, 1, '_cloneAssetsForUndo (light) : même nombre d\'éléments');
    assertTrue(cloned2[0] !== original2[0], '_cloneAssetsForUndo (light) : objet racine différent');
    assertTrue(cloned2[0].lots !== original2[0].lots, '_cloneAssetsForUndo (light) : tableau lots cloné');
    assertTrue(cloned2[0].buys !== original2[0].buys, '_cloneAssetsForUndo (light) : tableau buys cloné');
    assertTrue(cloned2[0].dividends !== original2[0].dividends, '_cloneAssetsForUndo (light) : tableau dividends cloné');
    assertTrue(cloned2[0].splits !== original2[0].splits, '_cloneAssetsForUndo (light) : tableau splits cloné');
    assertTrue(cloned2[0].cadrans !== original2[0].cadrans, '_cloneAssetsForUndo (light) : objet cadrans cloné');
    assertTrue(cloned2[0].cadrans.secondary !== original2[0].cadrans.secondary, '_cloneAssetsForUndo (light) : tableau secondary cloné');

    // CONTRAT D'IMMUTABILITÉ : history est partagé par référence
    assertTrue(cloned2[0].history === original2[0].history, '_cloneAssetsForUndo (light) : tableau history PARTAGÉ (référence identique)');

    // Modifie le clone (lots) → n'impacte pas l'original
    cloned2[0].lots[0].qty = 999;
    assertEq(original2[0].lots[0].qty, 5, '_cloneAssetsForUndo (light) : modifier les lots du clone n\'impacte pas l\'original');

    // Modifie le clone (secondary) → n'impacte pas l'original
    cloned2[0].cadrans.secondary.push('PETROLE');
    assertEq(original2[0].cadrans.secondary.length, 1, '_cloneAssetsForUndo (light) : modifier secondary du clone n\'impacte pas l\'original');

    // -----------------------------------------------------------------
    // Cas 3 : simulation du contrat d'immutabilité history
    //   On vérifie que upsertTodayHistoryPoint (via .filter + réassignation)
    //   ne modifie PAS la référence partagée.
    // -----------------------------------------------------------------
    const beforeRef = cloned2[0].history;         // référence partagée
    const originalHistoryRef = original2[0].history;

    // Simule la logique de upsertTodayHistoryPoint (sans dépendre de la
    // fonction réelle qui touche au DOM/état global)
    const todayStr = new Date().toDateString();
    const filtered = beforeRef.filter(h => {
        const d = parseFlexDate(h.date);
        return !(d && d.toDateString() === todayStr);
    });
    filtered.push({ date: new Date().toLocaleDateString('fr-FR'), value: 777, invested: 500 });

    // Réassigne sur le clone
    cloned2[0].history = filtered;

    // Vérification : l'original n'a pas changé
    assertTrue(original2[0].history === originalHistoryRef, '_cloneAssetsForUndo (light) : original.history référence inchangée');
    assertEq(original2[0].history.length, 2, '_cloneAssetsForUndo (light) : original.history contient toujours 2 points');
    assertTrue(cloned2[0].history !== originalHistoryRef, '_cloneAssetsForUndo (light) : clone.history est un NOUVEAU tableau après réassignation');

    // -----------------------------------------------------------------
    // Cas 4 : liste vide
    // -----------------------------------------------------------------
    assertEq(_cloneAssetsForUndo([], true).length, 0, '_cloneAssetsForUndo : liste vide → tableau vide');
    assertEq(_cloneAssetsForUndo([], false).length, 0, '_cloneAssetsForUndo : liste vide (standard) → tableau vide');
})();

// ---------------------------------------------------------------------
// TESTS : _cloneSimpleForUndo
// ---------------------------------------------------------------------
_suite('_cloneSimpleForUndo');
(function testCloneSimple() {
    const obj = { a: 1, b: [1, 2, 3], c: { d: 'e' } };
    const c = _cloneSimpleForUndo(obj);

    assertTrue(c !== obj, '_cloneSimpleForUndo : référence différente');
    assertEq(c.a, 1, '_cloneSimpleForUndo : valeur scalaire préservée');
    assertTrue(c.b !== obj.b, '_cloneSimpleForUndo : tableau cloné');
    assertTrue(c.c !== obj.c, '_cloneSimpleForUndo : objet imbriqué cloné');

    // Modifie le clone → n'impacte pas l'original
    c.b.push(4);
    assertEq(obj.b.length, 3, '_cloneSimpleForUndo : modifier le clone n\'impacte pas l\'original');

    // Cas null / undefined
    assertNull(_cloneSimpleForUndo(null), '_cloneSimpleForUndo : null → null');

    // Cas tableau vide
    const emptyArr = _cloneSimpleForUndo([]);
    assertTrue(Array.isArray(emptyArr), '_cloneSimpleForUndo : [] → tableau');
    assertEq(emptyArr.length, 0, '_cloneSimpleForUndo : [] → longueur 0');
})();

// ---------------------------------------------------------------------
// TESTS : pushUndo / performUndo (intégration)
// ---------------------------------------------------------------------
_suite('pushUndo / performUndo');
(function testPushUndoIntegration() {
    // Backup de l'état global
    const backupAssets = assets.slice();
    const backupCessions = cessions.slice();
    const backupArbitrages = arbitrages.slice();
    const backupStackLen = undoStack.length;

    // Prépare un mini-jeu de données
    assets.length = 0;
    cessions.length = 0;
    arbitrages.length = 0;
    assets.push({
        id: 997001,
        name: 'État initial',
        ticker: 'INIT',
        categories: ['Autre'],
        envelope: '',
        qty: 1,
        invested: 100,
        value: 100,
        lots: [],
        buys: [],
        history: []
    });

    // Capture l'état initial
    pushUndo('Test intégration');

    // Modifie les données
    assets[0].name = 'État modifié';
    assets[0].value = 200;
    assets.push({
        id: 997002,
        name: 'Nouvel actif',
        ticker: 'NEW',
        categories: ['Autre'],
        envelope: '',
        qty: 1, invested: 50, value: 50,
        lots: [], buys: [], history: []
    });

    // Vérifie l'état modifié
    assertEq(assets.length, 2, 'pushUndo : 2 actifs après ajout');
    assertEq(assets[0].name, 'État modifié', 'pushUndo : nom modifié');

    // Performe l'undo
    performUndo();

    // Vérifie la restauration
    assertEq(assets.length, 1, 'performUndo : 1 seul actif restauré');
    assertEq(assets[0].name, 'État initial', 'performUndo : nom initial restauré');
    assertEq(assets[0].value, 100, 'performUndo : valeur initiale restaurée');

    // Restaure le contexte du test
    assets.length = 0;
    backupAssets.forEach(a => assets.push(a));
    cessions.length = 0;
    backupCessions.forEach(c => cessions.push(c));
    arbitrages.length = 0;
    backupArbitrages.forEach(a => arbitrages.push(a));
    // Ajuste la taille de la pile (retire l'entrée de test)
    while (undoStack.length > backupStackLen) undoStack.pop();
})();

// ---------------------------------------------------------------------
// TESTS : _cw8PriceAt (benchmark lookup)
// ---------------------------------------------------------------------
_suite('_cw8PriceAt');
(function testCw8PriceAt() {
    // Backup du cache benchmark
    const backupSeries = benchmarkSeriesCache;
    const backupMeta = benchmarkMetaCache;

    // Injecte une série de test : 3 points à 100, 110, 120
    benchmarkSeriesCache = [
        { date: new Date('2024-01-01').getTime(), price: 100 },
        { date: new Date('2024-02-01').getTime(), price: 110 },
        { date: new Date('2024-03-01').getTime(), price: 120 }
    ];

    // Cas 1 : date exacte
    const p1 = _cw8PriceAt(new Date('2024-02-01'));
    assertEq(p1, 110, '_cw8PriceAt : date exacte → cours exact');

    // Cas 2 : date intermédiaire (dans la tolérance 7 jours) → forward-fill
    // Note : 2024-02-15 aurait dépassé la tolérance de 7j et renvoyé null
    // (voir Cas 5 qui teste précisément ce cas), d'où l'usage du 05/02.
    const p2 = _cw8PriceAt(new Date('2024-02-05'));
    assertEq(p2, 110, '_cw8PriceAt : date intermédiaire → forward-fill');

    // Cas 3 : date antérieure à tous les points → null
    const p3 = _cw8PriceAt(new Date('2023-12-01'));
    assertNull(p3, '_cw8PriceAt : date antérieure → null');

    // Cas 4 : date très postérieure → dernier point si < 7j de tolérance
    const p4 = _cw8PriceAt(new Date('2024-03-05'));   // 4 jours après
    assertEq(p4, 120, '_cw8PriceAt : 4 jours après → dernier point (tolérance 7j)');

    // Cas 5 : date > 7 jours après le dernier point → null
    const p5 = _cw8PriceAt(new Date('2024-03-15'));   // 14 jours après
    assertNull(p5, '_cw8PriceAt : 14 jours après → null (au-delà tolérance)');

    // Restaure
    benchmarkSeriesCache = backupSeries;
    benchmarkMetaCache = backupMeta;
})();

// ---------------------------------------------------------------------
// TESTS : computeCw8Comparison (intégration)
// ---------------------------------------------------------------------
_suite('computeCw8Comparison');
(function testCw8Comparison() {
    // Backup complet de l'état global
    const backupAssets = assets.slice();
    const backupSeries = benchmarkSeriesCache;
    const backupMeta = benchmarkMetaCache;
    const backupPortfolioId = currentPortfolioId;

    // -----------------------------------------------------------------
    // Cas 1 : pas de benchmark → null
    // -----------------------------------------------------------------
    benchmarkSeriesCache = null;
    assets.length = 0;
    assets.push({
        id: 996001, name: 'Test', ticker: 'TST',
        categories: ['Autre'], envelope: '',
        qty: 10, invested: 1000, value: 1200,
        lots: [], history: [],
        buys: [
            { date: '01/01/2023', qty: 10, price: 100, frais: 0 }
        ]
    });
    assertNull(computeCw8Comparison(), 'computeCw8Comparison : benchmark absent → null');

    // -----------------------------------------------------------------
    // Cas 2 : portefeuille vide → null
    // -----------------------------------------------------------------
    // Benchmark réaliste : computeCw8Comparison() exige au moins 30 points.
    // Les 3 dates clés (01/01/2023, 01/01/2024, 01/01/2025) portent les
    // prix 400 / 500 / 600 utilisés par les assertions plus bas ; les 30
    // points « filler » placés AVANT 2023-01-01 satisfont la contrainte de
    // longueur sans interférer avec les calculs de flux (ils ne sont pas
    // candidats pour _cw8PriceAt aux dates des flux, qui matchent
    // exactement les 3 dates clés).
    benchmarkSeriesCache = [];
    for (let i = 30; i >= 1; i--) {
        const d = new Date('2023-01-01');
        d.setDate(d.getDate() - i * 10);
        benchmarkSeriesCache.push({ date: d.getTime(), price: 380 + i });
    }
    benchmarkSeriesCache.push({ date: new Date('2023-01-01').getTime(), price: 400 });
    benchmarkSeriesCache.push({ date: new Date('2024-01-01').getTime(), price: 500 });
    benchmarkSeriesCache.push({ date: new Date('2025-01-01').getTime(), price: 600 });

    assets.length = 0;
    assertNull(computeCw8Comparison(), 'computeCw8Comparison : portefeuille vide → null');

    // -----------------------------------------------------------------
    // Cas 3 : un seul flux → null
    // -----------------------------------------------------------------
    assets.push({
        id: 996002, name: 'Test A', ticker: 'TA',
        categories: ['Autre'], envelope: '',
        qty: 10, invested: 4000, value: 5000,
        lots: [], history: [],
        buys: [
            { date: '01/01/2023', qty: 10, price: 400, frais: 0 }
        ]
    });
    assertNull(computeCw8Comparison(), 'computeCw8Comparison : 1 flux → null');

    // -----------------------------------------------------------------
    // Cas 4 : deux flux + benchmark valide → comparaison valide
    // -----------------------------------------------------------------
    assets.length = 0;
    assets.push({
        id: 996003, name: 'Test B', ticker: 'TB',
        categories: ['Autre'], envelope: '',
        qty: 20, invested: 9000, value: 12000,
        lots: [], history: [],
        buys: [
            { date: '01/01/2023', qty: 10, price: 400, frais: 0 },  // 4000 € investis
            { date: '01/01/2024', qty: 10, price: 500, frais: 0 }   // 5000 € investis
        ]
    });

    const result = computeCw8Comparison();
    assertTrue(result !== null, 'computeCw8Comparison : 2 flux + benchmark → résultat non null');
    if (result) {
        assertEq(result.totalInvested, 9000, 'computeCw8Comparison : capital total = 9000 €');
        assertEq(result.buysCount, 2, 'computeCw8Comparison : 2 flux détectés');
        assertTrue(result.points.length >= 2, 'computeCw8Comparison : au moins 2 points de trajectoire');
        assertTrue(Number.isFinite(result.realValue) && result.realValue > 0, 'computeCw8Comparison : valeur réelle > 0');
        assertTrue(Number.isFinite(result.cw8Value) && result.cw8Value > 0, 'computeCw8Comparison : valeur CW8 > 0');
        assertTrue(Number.isFinite(result.deltaEUR), 'computeCw8Comparison : delta EUR calculé');
        assertTrue(Number.isFinite(result.deltaPct), 'computeCw8Comparison : delta % calculé');
        assertTrue(Number.isFinite(result.cagrDelta), 'computeCw8Comparison : delta CAGR calculé');

        // Test logique du calcul CW8 :
        // Flux 1 : 4000 € @ CW8 = 400 → 10 parts
        // Flux 2 : 5000 € @ CW8 = 500 → 10 parts
        // Total : 20 parts CW8
        // Au dernier point (2025-01-01), cours = 600 → valeur = 12 000 €
        // Rendement CW8 = (12000 - 9000) / 9000 = 33,3 %
        assertApprox(result.cw8Value, 12000, 100, 'computeCw8Comparison : valeur CW8 ≈ 12 000 € (20 parts × 600 €)');
        assertApprox(result.cw8ReturnPct, 33.33, 2, 'computeCw8Comparison : rendement CW8 ≈ 33 %');
    }

    // -----------------------------------------------------------------
    // Cas 5 : _computeCw8CacheKey change quand les données changent
    // -----------------------------------------------------------------
    const key1 = _computeCw8CacheKey();
    assets[0].buys.push({ date: '01/06/2024', qty: 5, price: 550, frais: 0 });
    const key2 = _computeCw8CacheKey();
    assertTrue(key1 !== key2, '_computeCw8CacheKey : change après ajout d\'un flux');

    // -----------------------------------------------------------------
    // Cas 6 : getCw8Comparison utilise le cache
    // -----------------------------------------------------------------
    invalidateCw8ComparisonCache();
    const r1 = getCw8Comparison();
    const r2 = getCw8Comparison();
    assertTrue(r1 === r2, 'getCw8Comparison : même référence (cache actif)');

    invalidateCw8ComparisonCache();
    const r3 = getCw8Comparison();
    assertTrue(r3 !== r1, 'getCw8Comparison : nouvelle référence après invalidation');

    // Restaure tout
    assets.length = 0;
    backupAssets.forEach(a => assets.push(a));
    benchmarkSeriesCache = backupSeries;
    benchmarkMetaCache = backupMeta;
    // currentPortfolioId n'a pas été modifié, pas besoin de restaurer
    invalidateCw8ComparisonCache();
})();

// ---------------------------------------------------------------------
// TESTS : esgScoreToGrade (Chantier §3)
// ---------------------------------------------------------------------
_suite('esgScoreToGrade');
(function testEsgScoreToGrade() {
    // Bornes supérieures
    assertEq(esgScoreToGrade(100), 'AAA', 'esgScoreToGrade(100) → AAA');
    assertEq(esgScoreToGrade(85),  'AAA', 'esgScoreToGrade(85) → AAA (borne basse)');
    assertEq(esgScoreToGrade(84.9), 'AA', 'esgScoreToGrade(84,9) → AA');
    assertEq(esgScoreToGrade(75),  'AA',  'esgScoreToGrade(75) → AA (borne basse)');
    assertEq(esgScoreToGrade(74.9), 'A',  'esgScoreToGrade(74,9) → A');
    assertEq(esgScoreToGrade(65),  'A',   'esgScoreToGrade(65) → A (borne basse)');
    assertEq(esgScoreToGrade(55),  'BBB', 'esgScoreToGrade(55) → BBB');
    assertEq(esgScoreToGrade(45),  'BB',  'esgScoreToGrade(45) → BB');
    assertEq(esgScoreToGrade(35),  'B',   'esgScoreToGrade(35) → B');
    assertEq(esgScoreToGrade(25),  'CCC', 'esgScoreToGrade(25) → CCC');

    // Cas limites bas
    assertEq(esgScoreToGrade(24.9), 'NR', 'esgScoreToGrade(24,9) → NR (< 25)');
    assertEq(esgScoreToGrade(0),    'NR', 'esgScoreToGrade(0) → NR');

    // Cas invalides
    assertEq(esgScoreToGrade(-10), 'NR', 'esgScoreToGrade(-10) → NR');
    assertEq(esgScoreToGrade(null), 'NR', 'esgScoreToGrade(null) → NR');
    assertEq(esgScoreToGrade(undefined), 'NR', 'esgScoreToGrade(undefined) → NR');
    assertEq(esgScoreToGrade(NaN), 'NR', 'esgScoreToGrade(NaN) → NR');
    assertEq(esgScoreToGrade('abc'), 'NR', 'esgScoreToGrade("abc") → NR');
})();

// ---------------------------------------------------------------------
// TESTS : getAssetEsgScore
// ---------------------------------------------------------------------
_suite('getAssetEsgScore');
(function testGetAssetEsgScore() {
    // Cas 1 : saisie manuelle prioritaire
    const a1 = { ticker: 'CW8', esgScore: 92 };
    const r1 = getAssetEsgScore(a1);
    assertTrue(r1 !== null, 'getAssetEsgScore : saisie manuelle détectée');
    if (r1) {
        assertEq(r1.score, 92, 'getAssetEsgScore : score manuel utilisé');
        assertEq(r1.grade, 'AAA', 'getAssetEsgScore : grade calculé (AAA)');
        assertTrue(r1.isManual, 'getAssetEsgScore : flag isManual = true');
    }

    // Cas 2 : correspondance catalogue directe
    const a2 = { ticker: 'CW8' };
    const r2 = getAssetEsgScore(a2);
    assertTrue(r2 !== null, 'getAssetEsgScore : catalogue trouvé pour CW8');
    if (r2) {
        assertEq(r2.score, 78, 'getAssetEsgScore : score catalogue CW8 = 78');
        assertEq(r2.grade, 'AA', 'getAssetEsgScore : grade CW8 = AA');
        assertFalse(r2.isManual, 'getAssetEsgScore : flag isManual = false');
    }

    // Cas 3 : correspondance partielle avec suffixe (.PA)
    const a3 = { ticker: 'CW8.PA' };
    const r3 = getAssetEsgScore(a3);
    assertTrue(r3 !== null, 'getAssetEsgScore : CW8.PA → CW8 (strip suffixe)');
    if (r3) assertEq(r3.score, 78, 'getAssetEsgScore : CW8.PA donne même score que CW8');

    // Cas 4 : insensible à la casse
    const a4 = { ticker: 'cw8' };
    const r4 = getAssetEsgScore(a4);
    assertTrue(r4 !== null, 'getAssetEsgScore : insensible à la casse');

    // Cas 5 : ticker inconnu → null
    const a5 = { ticker: 'XXXXXX' };
    assertNull(getAssetEsgScore(a5), 'getAssetEsgScore : ticker inconnu → null');

    // Cas 6 : asset null → null
    assertNull(getAssetEsgScore(null), 'getAssetEsgScore : null → null');

    // Cas 7 : ticker vide → null
    assertNull(getAssetEsgScore({ ticker: '' }), 'getAssetEsgScore : ticker vide → null');

    // Cas 8 : score manuel = 0 → ignore et utilise catalogue
    const a8 = { ticker: 'CW8', esgScore: 0 };
    const r8 = getAssetEsgScore(a8);
    assertTrue(r8 !== null, 'getAssetEsgScore : score manuel 0 → catalogue utilisé');
    if (r8) assertEq(r8.score, 78, 'getAssetEsgScore : score catalogue = 78');
})();

// ---------------------------------------------------------------------
// TESTS : computePortfolioEsg
// ---------------------------------------------------------------------
_suite('computePortfolioEsg');
(function testComputePortfolioEsg() {
    // Cas 1 : liste vide → score 0, grade NR
    const r1 = computePortfolioEsg([]);
    assertEq(r1.score, 0, 'computePortfolioEsg : liste vide → score 0');
    assertEq(r1.grade, 'NR', 'computePortfolioEsg : liste vide → grade NR');
    assertEq(r1.coveragePct, 0, 'computePortfolioEsg : liste vide → couverture 0');

    // Cas 2 : actifs sans score → couverture 0
    const r2 = computePortfolioEsg([
        { id: 1, ticker: 'UNKNOWN1', value: 1000, categories: ['Autre'] }
    ]);
    assertEq(r2.score, 0, 'computePortfolioEsg : aucun score → score 0');
    assertEq(r2.coveragePct, 0, 'computePortfolioEsg : aucun score → couverture 0');

    // Cas 3 : moyenne pondérée correcte
    // CW8 (78) : 1000 € — MSFT (84) : 500 €
    // Attendu : (78*1000 + 84*500) / 1500 = (78000 + 42000) / 1500 = 80
    const r3 = computePortfolioEsg([
        { id: 1, ticker: 'CW8',  value: 1000, categories: ['ETF'] },
        { id: 2, ticker: 'MSFT', value: 500,  categories: ['Action'] }
    ]);
    assertTrue(r3.score > 0, 'computePortfolioEsg : score > 0');
    assertApprox(r3.score, 80, 0.01, 'computePortfolioEsg : moyenne pondérée = 80');
    assertEq(r3.grade, 'AA', 'computePortfolioEsg : grade AA (80)');
    assertEq(r3.coveragePct, 100, 'computePortfolioEsg : couverture 100 % (tous notés)');
    assertEq(r3.count, 2, 'computePortfolioEsg : 2 actifs notés');

    // Cas 4 : couverture partielle
    // CW8 (78, 1000 €) + UNKNOWN (500 €) → couverture = 1000/1500 = 66.67 %
    const r4 = computePortfolioEsg([
        { id: 1, ticker: 'CW8',       value: 1000, categories: ['ETF'] },
        { id: 2, ticker: 'ZZUNKNOWN', value: 500,  categories: ['Autre'] }
    ]);
    assertApprox(r4.coveragePct, 66.67, 0.5, 'computePortfolioEsg : couverture ≈ 66,67 %');
    assertEq(r4.count, 1, 'computePortfolioEsg : 1 seul actif noté');
    assertEq(r4.score, 78, 'computePortfolioEsg : score = 78 (CW8 seul)');

    // Cas 5 : exclut les positions papier
    const r5 = computePortfolioEsg([
        { id: 1, ticker: 'CW8', value: 1000, categories: ['ETF'], isPaper: false },
        { id: 2, ticker: 'CW8', value: 5000, categories: ['ETF'], isPaper: true }
    ]);
    assertEq(r5.score, 78, 'computePortfolioEsg : ignore les positions papier');

    // Cas 6 : value = 0 → totalValue = 0
    const r6 = computePortfolioEsg([
        { id: 1, ticker: 'CW8', value: 0, categories: ['ETF'] }
    ]);
    assertEq(r6.score, 0, 'computePortfolioEsg : value 0 → score 0');
    assertEq(r6.grade, 'NR', 'computePortfolioEsg : value 0 → NR');
})();

// ---------------------------------------------------------------------
// TESTS : esgCellHTML / esgBadgeHTML
// ---------------------------------------------------------------------
_suite('esgCellHTML / esgBadgeHTML');
(function testEsgCellHtml() {
    // Cas 1 : actif noté → contient le score et le grade
    const a1 = { ticker: 'CW8', value: 1000, categories: ['ETF'] };
    const html1 = esgCellHTML(a1);
    assertTrue(html1.includes('78'), 'esgCellHTML : contient le score 78');
    assertTrue(html1.includes('AA'), 'esgCellHTML : contient le grade AA');
    assertTrue(html1.includes('fa-leaf'), 'esgCellHTML : contient l\'icône feuille');

    // Cas 2 : actif non noté → tiret
    const a2 = { ticker: 'ZZUNKNOWN', value: 1000, categories: ['Autre'] };
    const html2 = esgCellHTML(a2);
    assertTrue(html2.includes('—'), 'esgCellHTML : actif non noté → tiret');

    // Cas 3 : badge (mini)
    const html3 = esgBadgeHTML(a1);
    assertTrue(html3.includes('AA'), 'esgBadgeHTML : contient le grade AA');
    assertTrue(html3.length > 0, 'esgBadgeHTML : non vide pour actif noté');

    // Cas 4 : badge vide pour actif non noté
    const html4 = esgBadgeHTML(a2);
    assertEq(html4, '', 'esgBadgeHTML : actif non noté → chaîne vide');
})();

// ---------------------------------------------------------------------
// TESTS : calculatePerAccumulation (Chantier §3)
// ---------------------------------------------------------------------
_suite('calculatePerAccumulation');
(function testPerAccumulation() {
    // Backup de la config
    const backupConfig = { ...perConfig };

    // Cas 1 : aucune contribution, aucun rendement → balance inchangée
    perConfig.currentAge = 30;
    perConfig.retirementAge = 40;
    perConfig.currentBalance = 10000;
    perConfig.monthlyContribution = 0;
    perConfig.expectedReturn = 0;
    perConfig.tmiEntry = 0;

    const r1 = calculatePerAccumulation();
    assertEq(r1.yearsToRetirement, 10, 'calculatePerAccumulation : 10 ans jusqu\'à la retraite');
    assertApprox(r1.finalBalance, 10000, 0.01, 'calculatePerAccumulation : sans contribution ni rendement → solde inchangé');
    assertApprox(r1.totalContributions, 10000, 0.01, 'calculatePerAccumulation : totalContributions = solde initial');
    assertEq(r1.yearlyData.length, 11, 'calculatePerAccumulation : 11 points (année 0 à 10)');

    // Cas 2 : contribution mensuelle sans rendement
    // 10 ans × 12 mois × 100 € = 12 000 € ajoutés à 10 000 € → 22 000 €
    perConfig.monthlyContribution = 100;
    perConfig.expectedReturn = 0;

    const r2 = calculatePerAccumulation();
    assertApprox(r2.finalBalance, 22000, 0.5, 'calculatePerAccumulation : 12 000 € de versements + 10 000 € initial');

    // Cas 3 : économie d'impôt
    perConfig.tmiEntry = 0.30;
    const r3 = calculatePerAccumulation();
    // Économie attendue : (10000 + 12000) × 0.30 = 6600
    assertApprox(r3.economyTax, 6600, 1, 'calculatePerAccumulation : économie d\'impôt = 30 % des versements');

    // Cas 4 : rendement > 0
    perConfig.expectedReturn = 0.05;
    perConfig.monthlyContribution = 0;
    perConfig.currentBalance = 10000;
    const r4 = calculatePerAccumulation();
    // 10 000 € à 5 %/an sur 10 ans composé = 10 000 × (1 + 0.05/12)^120 ≈ 16 470 €
    assertApprox(r4.finalBalance, 16470, 50, 'calculatePerAccumulation : 10 000 € à 5 % sur 10 ans ≈ 16 470 €');

    // Restaure la config
    Object.assign(perConfig, backupConfig);
})();

// ---------------------------------------------------------------------
// TESTS : computePerCapitalExit (fiscalité capital)
// ---------------------------------------------------------------------
_suite('computePerCapitalExit');
(function testPerCapitalExit() {
    const backupConfig = { ...perConfig };

    perConfig.tmiRetirement = 0.11;
    const acc = {
        finalBalance: 100000,
        totalContributions: 50000,
        totalGains: 50000
    };

    const r = computePerCapitalExit(acc);
    // Versements : abattement 10 % → 45000 × 11 % IR = 4950
    // PS : 50000 × 17,2 % = 8600
    // Total versements : 4950 + 8600 = 13550
    // Plus-values : 50000 × 30 % = 15000
    // Total tax : 28550 · Net : 100000 − 28550 = 71450
    assertApprox(r.taxVersements, 13550, 5, 'computePerCapitalExit : tax versements ≈ 13 550 €');
    assertApprox(r.taxPlusValues, 15000, 1, 'computePerCapitalExit : tax plus-values = 15 000 €');
    assertApprox(r.totalTax, 28550, 5, 'computePerCapitalExit : tax total ≈ 28 550 €');
    assertApprox(r.netRecu, 71450, 5, 'computePerCapitalExit : net reçu ≈ 71 450 €');

    // Cas sans gains
    const acc2 = { finalBalance: 50000, totalContributions: 50000, totalGains: 0 };
    const r2 = computePerCapitalExit(acc2);
    assertApprox(r2.taxPlusValues, 0, 0.01, 'computePerCapitalExit : plus-value 0 → tax PV = 0');

    Object.assign(perConfig, backupConfig);
})();

// ---------------------------------------------------------------------
// TESTS : computePerRenteExit
// ---------------------------------------------------------------------
_suite('computePerRenteExit');
(function testPerRenteExit() {
    const backupConfig = { ...perConfig };

    perConfig.tmiRetirement = 0.11;
    perConfig.annuityRate = 0.04;

    const acc = { finalBalance: 100000, totalContributions: 50000, totalGains: 50000 };
    const r = computePerRenteExit(acc);

    // Rente brute : 100000 × 0.04 = 4000 €/an
    assertApprox(r.renteAnnuelle, 4000, 1, 'computePerRenteExit : rente brute = 4 000 €/an');
    assertApprox(r.renteMensuelleBrute, 4000 / 12, 0.5, 'computePerRenteExit : rente mensuelle brute ≈ 333 €');
    assertTrue(r.renteNetteAnnuelle < r.renteAnnuelle, 'computePerRenteExit : net < brut (fiscalité appliquée)');
    assertTrue(r.renteNetteAnnuelle > 0, 'computePerRenteExit : rente nette > 0');

    Object.assign(perConfig, backupConfig);
})();

// ---------------------------------------------------------------------
// TESTS : computeCtoComparison
// ---------------------------------------------------------------------
_suite('computeCtoComparison');
(function testCtoComparison() {
    const backupConfig = { ...perConfig };

    perConfig.monthlyContribution = 100;
    perConfig.tmiEntry = 0.30;
    perConfig.expectedReturn = 0;
    perConfig.currentBalance = 0;
    perConfig.currentAge = 30;
    perConfig.retirementAge = 40;

    const acc = calculatePerAccumulation();
    const r = computeCtoComparison(acc);

    // 10 ans × 12 mois × 100 € brut = 12 000 € brut versés
    // Net investi : 12000 × (1 − 0.30) = 8400 €
    assertApprox(r.totalInvested, 8400, 0.5, 'computeCtoComparison : net investi = 8 400 €');
    assertApprox(r.finalBalance, 8400, 0.5, 'computeCtoComparison : sans rendement, balance = investi');
    assertApprox(r.gains, 0, 0.5, 'computeCtoComparison : sans rendement, gains = 0');
    assertApprox(r.tax, 0, 0.5, 'computeCtoComparison : sans gains, tax = 0');

    Object.assign(perConfig, backupConfig);
})();

// ---------------------------------------------------------------------
// TESTS : computePerProjection (intégration)
// ---------------------------------------------------------------------
_suite('computePerProjection');
(function testPerProjection() {
    const backupConfig = { ...perConfig };

    perConfig.currentAge = 35;
    perConfig.retirementAge = 64;
    perConfig.currentBalance = 5000;
    perConfig.monthlyContribution = 300;
    perConfig.expectedReturn = 0.05;
    perConfig.tmiEntry = 0.30;
    perConfig.tmiRetirement = 0.11;
    perConfig.exitMode = 'capital';

    const proj = computePerProjection();
    assertEq(proj.yearsToRetirement, 29, 'computePerProjection : 29 ans jusqu\'à la retraite');
    assertTrue(proj.accumulation.finalBalance > 0, 'computePerProjection : capital final > 0');
    assertTrue(proj.capitalExit.netRecu > 0, 'computePerProjection : net capital > 0');
    assertTrue(Number.isFinite(proj.perAdvantage), 'computePerProjection : avantage PER calculé');
    assertEq(proj.exitMode, 'capital', 'computePerProjection : mode = capital');

    // Test avec mode rente
    perConfig.exitMode = 'rente';
    const proj2 = computePerProjection();
    assertEq(proj2.exitMode, 'rente', 'computePerProjection : mode = rente');
    assertTrue(proj2.renteExit.renteAnnuelle > 0, 'computePerProjection : rente annuelle > 0');

    Object.assign(perConfig, backupConfig);
})();

// ---------------------------------------------------------------------
// TESTS : _currentMonthKey / _monthLabel (Chantier §4)
// ---------------------------------------------------------------------
_suite('_currentMonthKey / _monthLabel');
(function testMonthHelpers() {
    // _currentMonthKey : format 'YYYY-MM'
    const key = _currentMonthKey();
    assertTrue(/^\d{4}-\d{2}$/.test(key), '_currentMonthKey : format YYYY-MM');

    // Vérifie que le mois correspond bien à la date du jour
    const now = new Date();
    const expected = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    assertEq(key, expected, '_currentMonthKey : correspond au mois courant');

    // _monthLabel : conversion humaine
    assertEq(_monthLabel('2025-01'), 'Jan 2025', '_monthLabel : janvier');
    assertEq(_monthLabel('2025-12'), 'Déc 2025', '_monthLabel : décembre');
    assertEq(_monthLabel('2024-06'), 'Juin 2024', '_monthLabel : juin');
})();

// ---------------------------------------------------------------------
// TESTS : captureMonthlySnapshot
// ---------------------------------------------------------------------
_suite('captureMonthlySnapshot');
(function testCaptureMonthlySnapshot() {
    // Backup de l'état global + localStorage
    const backupAssets = assets.slice();
    const backupSnapshots = localStorage.getItem(MONTHLY_SNAPSHOTS_KEY);

    // Jeu de test minimal : 2 actifs dans 2 cadrans
    assets.length = 0;
    assets.push({
        id: 995001, name: 'Test A', ticker: 'TA',
        categories: ['Action'], cadran: 'ASIE', envelope: 'CTO',
        qty: 10, invested: 1000, value: 1500,
        lots: [{ id: 1, qty: 10, qtyRemaining: 10, price: 100, frais: 0, date: '2024-01-01' }],
        buys: [], history: []
    });
    assets.push({
        id: 995002, name: 'Test B', ticker: 'TB',
        categories: ['Or & Métaux'], cadran: 'OR', envelope: '',
        qty: 5, invested: 500, value: 400,
        lots: [{ id: 2, qty: 5, qtyRemaining: 5, price: 100, frais: 0, date: '2024-01-01' }],
        buys: [], history: []
    });

    // Vide les snapshots pour isoler le test
    localStorage.removeItem(MONTHLY_SNAPSHOTS_KEY);

    // --- Cas 1 : création ---
    const snap = captureMonthlySnapshot();
    assertEq(snap.month, _currentMonthKey(), 'captureMonthlySnapshot : month = mois courant');
    assertEq(snap.totalValue, 1900, 'captureMonthlySnapshot : totalValue = 1900 €');
    assertEq(snap.totalInvested, 1500, 'captureMonthlySnapshot : totalInvested = 1500 €');
    assertEq(snap.pnl, 400, 'captureMonthlySnapshot : pnl = 400 €');
    assertApprox(snap.pnlPct, 26.67, 0.1, 'captureMonthlySnapshot : pnlPct ≈ 26,67 %');
    assertEq(snap.positionsCount, 2, 'captureMonthlySnapshot : 2 positions');
    assertEq(snap.top3.length, 2, 'captureMonthlySnapshot : top3 contient 2 actifs');
    assertEq(snap.top3[0].ticker, 'TA', 'captureMonthlySnapshot : top = Test A');
    assertEq(snap.top3[0].pnl, 500, 'captureMonthlySnapshot : top P&L = +500 €');

    // byCadran
    assertEq(snap.byCadran.ASIE, 1500, 'captureMonthlySnapshot : byCadran.ASIE = 1500 €');
    assertEq(snap.byCadran.OR, 400, 'captureMonthlySnapshot : byCadran.OR = 400 €');

    // --- Cas 2 : persistance dans localStorage ---
    const stored = loadMonthlySnapshots();
    assertEq(stored.length, 1, 'captureMonthlySnapshot : 1 snapshot persisté');

    // --- Cas 3 : mise à jour du même mois (pas de doublon) ---
    assets[0].value = 2000;
    const snap2 = captureMonthlySnapshot();
    const stored2 = loadMonthlySnapshots();
    assertEq(stored2.length, 1, 'captureMonthlySnapshot : pas de doublon pour le même mois');
    assertEq(stored2[0].totalValue, 2400, 'captureMonthlySnapshot : mise à jour du snapshot existant');

    // Restaure
    localStorage.removeItem(MONTHLY_SNAPSHOTS_KEY);
    if (backupSnapshots) localStorage.setItem(MONTHLY_SNAPSHOTS_KEY, backupSnapshots);
    assets.length = 0;
    backupAssets.forEach(a => assets.push(a));
})();

// ---------------------------------------------------------------------
// TESTS : _enrichSnapshotsWithVariations (MoM / YoY)
// ---------------------------------------------------------------------
_suite('_enrichSnapshotsWithVariations');
(function testEnrichSnapshots() {
    // Backup
    const backupSnapshots = localStorage.getItem(MONTHLY_SNAPSHOTS_KEY);

    // Injecte un jeu de 14 snapshots synthétiques :
    //   - mois : 2025-01 → 2025-12 (12 mois) + 2024-01 + 2024-12
    //   - totalValue : valeurs simples pour tester MoM et YoY
    const fakeList = [
        { month: '2024-01', totalValue: 10000, totalInvested: 9000, pnl: 1000, pnlPct: 11.11, positionsCount: 2, top3: [], flop3: [], byCadran: {}, capturedAt: 1 },
        { month: '2024-12', totalValue: 11000, totalInvested: 9500, pnl: 1500, pnlPct: 15.79, positionsCount: 2, top3: [], flop3: [], byCadran: {}, capturedAt: 2 },
        { month: '2025-01', totalValue: 12000, totalInvested: 10000, pnl: 2000, pnlPct: 20.00, positionsCount: 2, top3: [], flop3: [], byCadran: {}, capturedAt: 3 },
        { month: '2025-02', totalValue: 12500, totalInvested: 10000, pnl: 2500, pnlPct: 25.00, positionsCount: 2, top3: [], flop3: [], byCadran: {}, capturedAt: 4 },
        { month: '2025-03', totalValue: 11800, totalInvested: 10000, pnl: 1800, pnlPct: 18.00, positionsCount: 2, top3: [], flop3: [], byCadran: {}, capturedAt: 5 },
        { month: '2025-04', totalValue: 12300, totalInvested: 10000, pnl: 2300, pnlPct: 23.00, positionsCount: 2, top3: [], flop3: [], byCadran: {}, capturedAt: 6 },
        { month: '2025-05', totalValue: 13000, totalInvested: 10000, pnl: 3000, pnlPct: 30.00, positionsCount: 2, top3: [], flop3: [], byCadran: {}, capturedAt: 7 },
        { month: '2025-06', totalValue: 12800, totalInvested: 10000, pnl: 2800, pnlPct: 28.00, positionsCount: 2, top3: [], flop3: [], byCadran: {}, capturedAt: 8 },
        { month: '2025-07', totalValue: 13200, totalInvested: 10000, pnl: 3200, pnlPct: 32.00, positionsCount: 2, top3: [], flop3: [], byCadran: {}, capturedAt: 9 },
        { month: '2025-08', totalValue: 13600, totalInvested: 10000, pnl: 3600, pnlPct: 36.00, positionsCount: 2, top3: [], flop3: [], byCadran: {}, capturedAt: 10 },
        { month: '2025-09', totalValue: 14000, totalInvested: 10000, pnl: 4000, pnlPct: 40.00, positionsCount: 2, top3: [], flop3: [], byCadran: {}, capturedAt: 11 },
        { month: '2025-10', totalValue: 14500, totalInvested: 10000, pnl: 4500, pnlPct: 45.00, positionsCount: 2, top3: [], flop3: [], byCadran: {}, capturedAt: 12 },
        { month: '2025-11', totalValue: 15000, totalInvested: 10000, pnl: 5000, pnlPct: 50.00, positionsCount: 2, top3: [], flop3: [], byCadran: {}, capturedAt: 13 },
        { month: '2025-12', totalValue: 15500, totalInvested: 10000, pnl: 5500, pnlPct: 55.00, positionsCount: 2, top3: [], flop3: [], byCadran: {}, capturedAt: 14 }
    ];
    localStorage.setItem(MONTHLY_SNAPSHOTS_KEY, JSON.stringify(fakeList));

    const enriched = _enrichSnapshotsWithVariations();

    // Tri décroissant : le plus récent en tête
    assertEq(enriched[0].month, '2025-12', '_enrichSnapshotsWithVariations : tri décroissant (2025-12 en tête)');
    assertEq(enriched[enriched.length - 1].month, '2024-01', '_enrichSnapshotsWithVariations : 2024-01 en queue');

    // Cas MoM : 2025-02 vs 2025-01 (12500 - 12000 = +500)
    const feb = enriched.find(s => s.month === '2025-02');
    assertTrue(feb.mom !== null, '_enrichSnapshotsWithVariations : 2025-02 a un MoM');
    assertEq(feb.mom.deltaEUR, 500, '_enrichSnapshotsWithVariations : MoM 2025-02 = +500 €');
    assertApprox(feb.mom.deltaPct, 4.17, 0.01, '_enrichSnapshotsWithVariations : MoM % 2025-02 ≈ +4,17 %');

    // Cas MoM négatif : 2025-03 vs 2025-02 (11800 - 12500 = -700)
    const mar = enriched.find(s => s.month === '2025-03');
    assertEq(mar.mom.deltaEUR, -700, '_enrichSnapshotsWithVariations : MoM 2025-03 = -700 €');
    assertTrue(mar.mom.deltaPct < 0, '_enrichSnapshotsWithVariations : MoM % 2025-03 négatif');

    // Cas MoM null : le premier snapshot (2024-01) n'a pas de MoM
    const jan24 = enriched.find(s => s.month === '2024-01');
    assertNull(jan24.mom, '_enrichSnapshotsWithVariations : 2024-01 n\'a pas de MoM (premier)');

    // Cas YoY : 2025-01 vs 2024-01 (12000 - 10000 = +2000) → index 1 de la liste triée ascendante → 12 rangs plus tôt
    const jan25 = enriched.find(s => s.month === '2025-01');
    assertTrue(jan25.yoy !== null, '_enrichSnapshotsWithVariations : 2025-01 a un YoY');
    assertEq(jan25.yoy.deltaEUR, 2000, '_enrichSnapshotsWithVariations : YoY 2025-01 = +2000 €');
    assertApprox(jan25.yoy.deltaPct, 20.00, 0.01, '_enrichSnapshotsWithVariations : YoY % 2025-01 = +20 %');

    // Cas YoY null : 2024-12 (pas de 2023-12)
    const dec24 = enriched.find(s => s.month === '2024-12');
    assertNull(dec24.yoy, '_enrichSnapshotsWithVariations : 2024-12 n\'a pas de YoY');

    // Restaure
    localStorage.removeItem(MONTHLY_SNAPSHOTS_KEY);
    if (backupSnapshots) localStorage.setItem(MONTHLY_SNAPSHOTS_KEY, backupSnapshots);
})();

// ---------------------------------------------------------------------
// TESTS : _pearsonCorrelation (Chantier §5)
// ---------------------------------------------------------------------
_suite('_pearsonCorrelation');
(function testPearsonCorrelation() {
    // --- Cas 1 : corrélation parfaite +1 (y = 2x) ---
    const days = [];
    for (let i = 0; i < 40; i++) {
        const d = new Date(2025, 0, 1 + i);
        days.push(d.toISOString().slice(0, 10));
    }
    const a1 = { returnsByDay: {} };
    const b1 = { returnsByDay: {} };
    days.forEach((day, i) => {
        const x = Math.sin(i) * 0.01;   // variation pseudo-aléatoire
        a1.returnsByDay[day] = x;
        b1.returnsByDay[day] = 2 * x;   // linéairement dépendant
    });
    const res1 = _pearsonCorrelation(a1, b1);
    assertTrue(res1 !== null, '_pearsonCorrelation : +1 calculable');
    assertApprox(res1.r, 1.0, 0.0001, '_pearsonCorrelation : corrélation parfaite +1');
    assertEq(res1.n, 40, '_pearsonCorrelation : 40 points alignés');

    // --- Cas 2 : corrélation parfaite -1 (y = -x) ---
    const a2 = { returnsByDay: {} };
    const b2 = { returnsByDay: {} };
    days.forEach((day, i) => {
        const x = Math.cos(i) * 0.01;
        a2.returnsByDay[day] = x;
        b2.returnsByDay[day] = -x;
    });
    const res2 = _pearsonCorrelation(a2, b2);
    assertApprox(res2.r, -1.0, 0.0001, '_pearsonCorrelation : corrélation parfaite -1');

    // --- Cas 3 : corrélation nulle (bruit indépendant) ---
    // Séquence alternée pour x, constante pour y → cov = 0
    const a3 = { returnsByDay: {} };
    const b3 = { returnsByDay: {} };
    days.forEach((day, i) => {
        a3.returnsByDay[day] = i % 2 === 0 ? 0.01 : -0.01;
        b3.returnsByDay[day] = 0.005;   // constante (stdev = 0 → null)
    });
    const res3 = _pearsonCorrelation(a3, b3);
    assertNull(res3, '_pearsonCorrelation : stdev nulle → null');

    // --- Cas 4 : jours insuffisants (< 30) ---
    const a4 = { returnsByDay: {} };
    const b4 = { returnsByDay: {} };
    for (let i = 0; i < 10; i++) {
        const d = new Date(2025, 0, 1 + i).toISOString().slice(0, 10);
        a4.returnsByDay[d] = i * 0.001;
        b4.returnsByDay[d] = i * 0.002;
    }
    assertNull(_pearsonCorrelation(a4, b4), '_pearsonCorrelation : 10 jours → null');

    // --- Cas 5 : jours partiellement communs ---
    // 35 jours communs sur 50 → doit utiliser les 35 communs
    const a5 = { returnsByDay: {} };
    const b5 = { returnsByDay: {} };
    for (let i = 0; i < 50; i++) {
        const d = new Date(2025, 0, 1 + i).toISOString().slice(0, 10);
        a5.returnsByDay[d] = Math.sin(i) * 0.01;
        if (i >= 15) b5.returnsByDay[d] = Math.sin(i) * 0.01;   // 35 communs
    }
    const res5 = _pearsonCorrelation(a5, b5);
    assertTrue(res5 !== null, '_pearsonCorrelation : 35 jours communs → calculable');
    assertEq(res5.n, 35, '_pearsonCorrelation : n = 35 jours communs');
    assertApprox(res5.r, 1.0, 0.0001, '_pearsonCorrelation : corrélation +1 sur jours communs');
})();

// ---------------------------------------------------------------------
// TESTS : _detectCorrelationClusters (Chantier §5)
// ---------------------------------------------------------------------
_suite('_detectCorrelationClusters');
(function testDetectClusters() {
    // --- Cas 1 : clique parfaite de 3 actifs (tous corrélés > 0.85) ---
    const matrix1 = [
        [1.00, 0.92, 0.90],
        [0.92, 1.00, 0.88],
        [0.90, 0.88, 1.00]
    ];
    const assets1 = [
        { id: 1, ticker: 'AAPL', name: 'Apple' },
        { id: 2, ticker: 'MSFT', name: 'Microsoft' },
        { id: 3, ticker: 'NVDA', name: 'Nvidia' }
    ];
    const clusters1 = _detectCorrelationClusters(matrix1, assets1);
    assertEq(clusters1.length, 1, '_detectCorrelationClusters : 1 cluster détecté');
    assertEq(clusters1[0].size, 3, '_detectCorrelationClusters : taille = 3');
    assertTrue(clusters1[0].avgR > 0.85, '_detectCorrelationClusters : avgR > 0.85');
    assertTrue(clusters1[0].tickers.includes('AAPL'), '_detectCorrelationClusters : contient AAPL');

    // --- Cas 2 : cluster de 2 (sous le seuil minimal de 3) → pas de cluster ---
    const matrix2 = [
        [1.00, 0.92],
        [0.92, 1.00]
    ];
    const assets2 = [
        { id: 1, ticker: 'AAA', name: 'A' },
        { id: 2, ticker: 'BBB', name: 'B' }
    ];
    const clusters2 = _detectCorrelationClusters(matrix2, assets2);
    assertEq(clusters2.length, 0, '_detectCorrelationClusters : 2 actifs → pas de cluster (min 3)');

    // --- Cas 3 : chaîne non-clique (A-B forts, B-C forts, A-C faible) ---
    // Union-find regroupe A,B,C mais ce n'est PAS une clique → doit être rejeté
    const matrix3 = [
        [1.00, 0.90, 0.20],
        [0.90, 1.00, 0.90],
        [0.20, 0.90, 1.00]
    ];
    const assets3 = [
        { id: 1, ticker: 'AAA', name: 'A' },
        { id: 2, ticker: 'BBB', name: 'B' },
        { id: 3, ticker: 'CCC', name: 'C' }
    ];
    const clusters3 = _detectCorrelationClusters(matrix3, assets3);
    assertEq(clusters3.length, 0, '_detectCorrelationClusters : chaîne non-clique → 0 cluster');

    // --- Cas 4 : deux clusters distincts ---
    const matrix4 = [
        //  Cluster 1 : A, B, C           Cluster 2 : D, E, F
        [1.00, 0.92, 0.90, 0.10, 0.15, 0.05],
        [0.92, 1.00, 0.88, 0.08, 0.12, 0.10],
        [0.90, 0.88, 1.00, 0.12, 0.10, 0.08],
        [0.10, 0.08, 0.12, 1.00, 0.90, 0.88],
        [0.15, 0.12, 0.10, 0.90, 1.00, 0.92],
        [0.05, 0.10, 0.08, 0.88, 0.92, 1.00]
    ];
    const assets4 = [
        { id: 1, ticker: 'A', name: 'A' }, { id: 2, ticker: 'B', name: 'B' },
        { id: 3, ticker: 'C', name: 'C' }, { id: 4, ticker: 'D', name: 'D' },
        { id: 5, ticker: 'E', name: 'E' }, { id: 6, ticker: 'F', name: 'F' }
    ];
    const clusters4 = _detectCorrelationClusters(matrix4, assets4);
    assertEq(clusters4.length, 2, '_detectCorrelationClusters : 2 clusters distincts');
    assertEq(clusters4[0].size, 3, '_detectCorrelationClusters : chaque cluster a 3 actifs');
    assertEq(clusters4[1].size, 3, '_detectCorrelationClusters : second cluster a 3 actifs');
})();

// ---------------------------------------------------------------------
// TESTS : _correlationColor (Chantier §5)
// ---------------------------------------------------------------------
_suite('_correlationColor');
(function testCorrelationColor() {
    // Cas 1 : NaN → gris
    assertEq(_correlationColor(NaN), '#1f2937', '_correlationColor : NaN → gris');

    // Cas 2 : r ≈ 0 → gris neutre
    assertEq(_correlationColor(0), '#374151', '_correlationColor : 0 → gris neutre');
    assertEq(_correlationColor(0.04), '#374151', '_correlationColor : 0.04 → gris neutre');

    // Cas 3 : r > 0 → couleur rouge (rouge dominant)
    const colorPos = _correlationColor(0.9);
    assertTrue(colorPos.startsWith('rgb('), '_correlationColor : r=0.9 → format rgb');
    const posMatch = colorPos.match(/rgb\((\d+),(\d+),(\d+)\)/);
    assertTrue(parseInt(posMatch[1]) > parseInt(posMatch[2]), '_correlationColor : r>0 → rouge dominant');
    assertTrue(parseInt(posMatch[1]) > parseInt(posMatch[3]), '_correlationColor : r>0 → bleu < rouge');

    // Cas 4 : r < 0 → couleur bleue (bleu dominant)
    const colorNeg = _correlationColor(-0.9);
    const negMatch = colorNeg.match(/rgb\((\d+),(\d+),(\d+)\)/);
    assertTrue(parseInt(negMatch[3]) > parseInt(negMatch[1]), '_correlationColor : r<0 → bleu dominant');
})();

// ---------------------------------------------------------------------
// TESTS : computeCorrelationMatrix (intégration avec realSeriesCache)
// ---------------------------------------------------------------------
_suite('computeCorrelationMatrix');
(function testComputeCorrelationMatrix() {
    // Backup de l'état global
    const backupAssets = assets.slice();
    const backupSeries = realSeriesCache;

    // --- Cas 1 : pas assez d'actifs corrélables → matrice vide ---
    assets.length = 0;
    realSeriesCache = {};
    let m1 = computeCorrelationMatrix();
    assertEq(m1.assets.length, 0, 'computeCorrelationMatrix : 0 actifs corrélables');
    assertEq(m1.matrix.length, 0, 'computeCorrelationMatrix : matrice vide');
    assertEq(m1.clusters.length, 0, 'computeCorrelationMatrix : pas de cluster');

    // --- Cas 2 : un actif isolé → pas de matrice ---
    assets.push({
        id: 990001, name: 'Test A', ticker: 'TA',
        categories: ['Autre'], envelope: '', qty: 1, invested: 100, value: 100,
        lots: [], buys: [], history: []
    });
    realSeriesCache = {
        'TA': (() => {
            const s = [];
            for (let i = 0; i < 40; i++) {
                s.push({ date: new Date(2025, 0, 1 + i).getTime(), price: 100 + i * 0.5 });
            }
            return s;
        })()
    };
    let m2 = computeCorrelationMatrix();
    assertEq(m2.assets.length, 1, 'computeCorrelationMatrix : 1 actif corrélable');
    assertEq(m2.pairs.length, 0, 'computeCorrelationMatrix : aucune paire calculable');

    // --- Cas 3 : 3 actifs fortement corrélés → cluster détecté ---
    assets.push({
        id: 990002, name: 'Test B', ticker: 'TB',
        categories: ['Autre'], envelope: '', qty: 1, invested: 100, value: 100,
        lots: [], buys: [], history: []
    });
    assets.push({
        id: 990003, name: 'Test C', ticker: 'TC',
        categories: ['Autre'], envelope: '', qty: 1, invested: 100, value: 100,
        lots: [], buys: [], history: []
    });
    // Séries quasi-identiques → corrélation ~ +1
    const baseSeries = (() => {
        const s = [];
        for (let i = 0; i < 40; i++) {
            s.push({ date: new Date(2025, 0, 1 + i).getTime(), price: 100 + Math.sin(i) * 5 });
        }
        return s;
    })();
    realSeriesCache = {
        'TA': baseSeries.map(p => ({ ...p })),
        'TB': baseSeries.map(p => ({ ...p, price: p.price * 1.01 })),
        'TC': baseSeries.map(p => ({ ...p, price: p.price * 0.99 }))
    };

    const m3 = computeCorrelationMatrix();
    assertEq(m3.assets.length, 3, 'computeCorrelationMatrix : 3 actifs corrélables');
    assertEq(m3.pairs.length, 3, 'computeCorrelationMatrix : 3 paires (3 choose 2)');

    // Toutes les corrélations doivent être ≈ +1
    m3.pairs.forEach(p => {
        assertTrue(p.r > 0.99, `computeCorrelationMatrix : corrélation ${p.i}-${p.j} ≈ +1 (obtenu ${p.r.toFixed(3)})`);
    });

    // Diagonale = 1
    for (let i = 0; i < 3; i++) {
        assertEq(m3.matrix[i][i], 1, `computeCorrelationMatrix : diagonale [${i}][${i}] = 1`);
    }

    // Cluster détecté (3 actifs corrélés > 0.85)
    assertEq(m3.clusters.length, 1, 'computeCorrelationMatrix : 1 cluster détecté');
    assertEq(m3.clusters[0].size, 3, 'computeCorrelationMatrix : cluster de taille 3');

    // --- Cas 4 : cache actif ---
    const key1 = _computeCorrelationCacheKey();
    const r1 = getCorrelationMatrix();
    const r2 = getCorrelationMatrix();
    assertTrue(r1 === r2, 'getCorrelationMatrix : cache actif (même référence)');

    // Modifie une série → invalide le cache
    realSeriesCache['TA'] = realSeriesCache['TA'].slice(0, 20);   // < 30 points
    const key2 = _computeCorrelationCacheKey();
    assertTrue(key1 !== key2, '_computeCorrelationCacheKey : change après modification de série');

    invalidateCorrelationCache();
    const r3 = getCorrelationMatrix();
    assertTrue(r3 !== r1, 'getCorrelationMatrix : nouvelle référence après invalidation');

    // Restaure
    assets.length = 0;
    backupAssets.forEach(a => assets.push(a));
    realSeriesCache = backupSeries;
    invalidateCorrelationCache();
})();

// ---------------------------------------------------------------------
// TESTS : computeDcaSuggestedCadran (Chantier §6)
// ---------------------------------------------------------------------
_suite('computeDcaSuggestedCadran');
(function testDcaSuggestedCadran() {
    // Backup complet
    const backupAssets = assets.slice();
    const backupConfig = { ...dcaConfig };

    // --- Cas 1 : portefeuille vide → null ---
    assets.length = 0;
    dcaConfig.targetCadran = '';
    assertNull(computeDcaSuggestedCadran(), 'computeDcaSuggestedCadran : portefeuille vide → null');

    // --- Cas 2 : 4 cadrans équilibrés (gap = 0 partout) ---
    assets.push({
        id: 985001, name: 'Actif OR', ticker: 'OR1', cadran: 'OR',
        categories: ['Or & Métaux'], envelope: '', qty: 1, invested: 1000, value: 1000,
        lots: [], buys: [], history: []
    });
    assets.push({
        id: 985002, name: 'Actif MON', ticker: 'MON1', cadran: 'MONNAIES',
        categories: ['Devises/Liquidités'], envelope: '', qty: 1, invested: 1000, value: 1000,
        lots: [], buys: [], history: []
    });
    assets.push({
        id: 985003, name: 'Actif ASIE', ticker: 'A1', cadran: 'ASIE',
        categories: ['Action'], envelope: 'CTO', qty: 1, invested: 1000, value: 1000,
        lots: [], buys: [], history: []
    });
    assets.push({
        id: 985004, name: 'Actif PET', ticker: 'P1', cadran: 'PETROLE',
        categories: ['Matières Premières'], envelope: '', qty: 1, invested: 1000, value: 1000,
        lots: [], buys: [], history: []
    });
    const r2 = computeDcaSuggestedCadran();
    assertTrue(r2 !== null, 'computeDcaSuggestedCadran : 4 cadrans équilibrés → non null');
    assertApprox(r2.pct, 25, 0.01, 'computeDcaSuggestedCadran : chaque cadran à 25 %');
    assertApprox(r2.gap, 0, 0.01, 'computeDcaSuggestedCadran : gap = 0');

    // --- Cas 3 : un cadran sous-pondéré détecté correctement ---
    // ASIE passe à 2500 € (portefeuille total = 5500, cible = 1375)
    // OR = 1000 (gap -375), MON = 1000 (gap -375), ASIE = 2500 (gap +1125), PET = 1000 (gap -375)
    // Le "premier" trouvé à égalité sera OR ou MON (ordre GAVE_QUADRANTS = OR, MONNAIES, ASIE, PETROLE)
    // Donc OR est attendu
    assets[2].value = 2500;
    const r3 = computeDcaSuggestedCadran();
    assertTrue(r3 !== null, 'computeDcaSuggestedCadran : avec écart → non null');
    assertEq(r3.cadran, 'OR', 'computeDcaSuggestedCadran : OR (1er sous-pondéré à égalité)');
    assertTrue(r3.gap < 0, 'computeDcaSuggestedCadran : gap négatif (sous-pondéré)');
    assertApprox(r3.pct, 1000 / 5500 * 100, 0.01, 'computeDcaSuggestedCadran : % correct');

    // --- Cas 4 : cadran verrouillé par l'utilisateur ---
    dcaConfig.targetCadran = 'PETROLE';
    const r4 = computeDcaSuggestedCadran();
    assertTrue(r4 !== null, 'computeDcaSuggestedCadran : cadran verrouillé → non null');
    assertEq(r4.cadran, 'PETROLE', 'computeDcaSuggestedCadran : cadran verrouillé retourné');
    assertTrue(r4.locked === true, 'computeDcaSuggestedCadran : flag locked = true');
    assertEq(r4.value, 1000, 'computeDcaSuggestedCadran : valeur du cadran verrouillé');

    // --- Cas 5 : cadran cible invalide → ignoré (fallback auto) ---
    dcaConfig.targetCadran = 'INVALID_CADRAN';
    const r5 = computeDcaSuggestedCadran();
    assertTrue(r5 !== null, 'computeDcaSuggestedCadran : cadran invalide → fallback auto');
    assertTrue(r5.cadran !== 'INVALID_CADRAN', 'computeDcaSuggestedCadran : cadran invalide ignoré');
    assertTrue(r5.locked === false, 'computeDcaSuggestedCadran : flag locked = false sur fallback');

    // Restaure
    assets.length = 0;
    backupAssets.forEach(a => assets.push(a));
    Object.assign(dcaConfig, backupConfig);
})();

// ---------------------------------------------------------------------
// TESTS : _shouldTriggerDcaToday (Chantier §6)
// ---------------------------------------------------------------------
_suite('_shouldTriggerDcaToday');
(function testShouldTriggerDcaToday() {
    const backupConfig = { ...dcaConfig };

    const now = new Date();
    const todayMonthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

    // --- Cas 1 : DCA désactivé → false ---
    dcaConfig.enabled = false;
    dcaConfig.dayOfMonth = 1;
    dcaConfig.lastTriggeredMonth = null;
    assertFalse(_shouldTriggerDcaToday(), '_shouldTriggerDcaToday : DCA désactivé → false');

    // --- Cas 2 : DCA activé, jour loin dans le futur → false ---
    dcaConfig.enabled = true;
    dcaConfig.dayOfMonth = 28;
    dcaConfig.lastTriggeredMonth = null;
    // Si on est aujourd'hui le 28 ou plus, le test n'est pas significatif
    // On teste uniquement si on est en début de mois (jour < 28)
    if (now.getDate() < 28) {
        assertFalse(_shouldTriggerDcaToday(), '_shouldTriggerDcaToday : jour futur → false');
    }

    // --- Cas 3 : jour atteint → true ---
    dcaConfig.dayOfMonth = 1;
    assertTrue(_shouldTriggerDcaToday(), '_shouldTriggerDcaToday : jour atteint → true');

    // --- Cas 4 : déjà déclenché ce mois-ci → false ---
    dcaConfig.lastTriggeredMonth = todayMonthKey;
    assertFalse(_shouldTriggerDcaToday(), '_shouldTriggerDcaToday : déjà déclenché ce mois → false');

    // --- Cas 5 : déclenché le mois dernier → true ---
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    dcaConfig.lastTriggeredMonth = lastMonth.getFullYear() + '-' +
        String(lastMonth.getMonth() + 1).padStart(2, '0');
    assertTrue(_shouldTriggerDcaToday(), '_shouldTriggerDcaToday : déclenché mois dernier → true');

    // Restaure
    Object.assign(dcaConfig, backupConfig);
})();

// ---------------------------------------------------------------------
// TESTS : persistance DCA (load/save)
// ---------------------------------------------------------------------
_suite('DCA — persistance');
(function testDcaPersistence() {
    // Backup
    const backupRaw = localStorage.getItem(DCA_STORAGE_KEY);
    const backupConfig = { ...dcaConfig };

    // --- Cas 1 : pas de config → valeurs par défaut ---
    localStorage.removeItem(DCA_STORAGE_KEY);
    const loaded1 = loadDcaConfigFromStorage();
    assertEq(loaded1.enabled, false, 'loadDcaConfigFromStorage : enabled par défaut = false');
    assertEq(loaded1.amount, 500, 'loadDcaConfigFromStorage : amount par défaut = 500');
    assertEq(loaded1.dayOfMonth, 5, 'loadDcaConfigFromStorage : dayOfMonth par défaut = 5');

    // --- Cas 2 : save puis load ---
    dcaConfig.enabled = true;
    dcaConfig.amount = 750;
    dcaConfig.dayOfMonth = 10;
    dcaConfig.label = 'Test DCA';
    dcaConfig.targetCadran = 'OR';
    saveDcaConfigToStorage();

    const loaded2 = loadDcaConfigFromStorage();
    assertEq(loaded2.enabled, true, 'loadDcaConfigFromStorage : enabled = true');
    assertEq(loaded2.amount, 750, 'loadDcaConfigFromStorage : amount = 750');
    assertEq(loaded2.dayOfMonth, 10, 'loadDcaConfigFromStorage : dayOfMonth = 10');
    assertEq(loaded2.label, 'Test DCA', 'loadDcaConfigFromStorage : label préservé');
    assertEq(loaded2.targetCadran, 'OR', 'loadDcaConfigFromStorage : targetCadran préservé');

    // --- Cas 3 : JSON invalide → fallback ---
    localStorage.setItem(DCA_STORAGE_KEY, '{invalid json');
    const loaded3 = loadDcaConfigFromStorage();
    assertEq(loaded3.enabled, false, 'loadDcaConfigFromStorage : JSON invalide → défaut');

    // Restaure
    localStorage.removeItem(DCA_STORAGE_KEY);
    if (backupRaw) localStorage.setItem(DCA_STORAGE_KEY, backupRaw);
    Object.assign(dcaConfig, backupConfig);
})();

// ---------------------------------------------------------------------
// TESTS : computeWaterfallData (Chantier §7)
// ---------------------------------------------------------------------
_suite('computeWaterfallData');
(function testComputeWaterfallData() {
    // Backup
    const backupAssets = assets.slice();

    // --- Cas 1 : portefeuille vide → items vides ---
    assets.length = 0;
    const r1 = computeWaterfallData();
    assertEq(r1.items.length, 0, 'computeWaterfallData : portefeuille vide → items vides');
    assertEq(r1.totalPnl, 0, 'computeWaterfallData : portefeuille vide → totalPnl = 0');
    assertEq(r1.positionsCount, 0, 'computeWaterfallData : portefeuille vide → 0 positions');

    // --- Cas 2 : 3 actifs (2 positifs, 1 négatif), sous le seuil TOP_N ---
    // TOP_N = 6 donc pas de regroupement "Autres"
    assets.length = 0;
    assets.push({ id: 970001, name: 'A', ticker: 'AAA', categories: ['Action'], envelope: 'CTO', qty: 1, invested: 1000, value: 1500, lots: [], buys: [], history: [] });
    assets.push({ id: 970002, name: 'B', ticker: 'BBB', categories: ['Action'], envelope: 'CTO', qty: 1, invested: 500, value: 300,  lots: [], buys: [], history: [] });
    assets.push({ id: 970003, name: 'C', ticker: 'CCC', categories: ['Action'], envelope: 'CTO', qty: 1, invested: 200, value: 400,  lots: [], buys: [], history: [] });

    // Total = 500 - 200 + 200 = 500
    const r2 = computeWaterfallData();
    // items = 3 deltas + 1 total = 4
    assertEq(r2.items.length, 4, 'computeWaterfallData : 3 deltas + 1 total');
    assertEq(r2.totalPnl, 500, 'computeWaterfallData : totalPnl = +500 €');
    assertEq(r2.positionsCount, 3, 'computeWaterfallData : 3 positions');

    // Tri par |delta| décroissant : AAA (+500), BBB (-200), CCC (+200)
    // Les abs : 500, 200, 200 → AAA en tête
    assertEq(r2.items[0].label, 'AAA', 'computeWaterfallData : tri par |delta| → AAA en 1er');
    assertEq(r2.items[0].delta, 500, 'computeWaterfallData : AAA delta = +500 €');
    assertTrue(r2.items[0].isPos === true, 'computeWaterfallData : AAA isPos = true');
    assertEq(r2.items[0].start, 0, 'computeWaterfallData : AAA start = 0');
    assertEq(r2.items[0].end, 500, 'computeWaterfallData : AAA end = 500');

    // --- Cas 3 : vérification du cumul ---
    // Ordre cumulé : AAA (0→500), BBB (500→300), CCC (300→500)
    const bbb = r2.items.find(it => it.label === 'BBB');
    const ccc = r2.items.find(it => it.label === 'CCC');
    assertTrue(bbb !== undefined, 'computeWaterfallData : BBB présent');
    assertTrue(ccc !== undefined, 'computeWaterfallData : CCC présent');

    // BBB (-200) doit venir après AAA dans l'ordre de tri (|500| > |200|)
    // À égalité 200 entre BBB et CCC, l'ordre dépend du sort stable — on ne teste pas l'ordre exact
    assertTrue(
        (bbb.start === 500 && bbb.end === 300) || (bbb.start === 300 && bbb.end === 100),
        'computeWaterfallData : BBB cumul cohérent'
    );

    // --- Cas 4 : la barre "Total" est toujours la dernière ---
    const lastItem = r2.items[r2.items.length - 1];
    assertEq(lastItem.kind, 'total', 'computeWaterfallData : dernière barre = total');
    assertEq(lastItem.start, 0, 'computeWaterfallData : Total part de 0');
    assertEq(lastItem.end, 500, 'computeWaterfallData : Total = +500 €');
    assertEq(lastItem.label, 'Total', 'computeWaterfallData : label = "Total"');

    // --- Cas 5 : regroupement "Autres" quand > TOP_N (6) actifs ---
    // Ajoute 5 actifs supplémentaires → 8 actifs au total
    // TOP_N = 6 → 6 affichés + 2 regroupés sous "Autres"
    assets.length = 0;
    const deltas = [500, 400, 300, 200, 100, 50, -30, -10];   // 8 actifs
    deltas.forEach((d, i) => {
        assets.push({
            id: 970100 + i,
            name: 'Actif ' + (i + 1),
            ticker: 'A' + String(i + 1).padStart(2, '0'),
            categories: ['Action'], envelope: 'CTO',
            qty: 1, invested: 1000, value: 1000 + d,
            lots: [], buys: [], history: []
        });
    });

    const r5 = computeWaterfallData();
    // items = 6 deltas + 1 "Autres" + 1 total = 8
    assertEq(r5.items.length, 8, 'computeWaterfallData : 6 deltas + Autres + Total');

    // Le dernier delta avant Total doit être "Autres (2)"
    const otherItem = r5.items.find(it => it.kind === 'other');
    assertTrue(otherItem !== undefined, 'computeWaterfallData : item "Autres" présent');
    assertEq(otherItem.childCount, 2, 'computeWaterfallData : "Autres" regroupe 2 actifs');
    assertEq(otherItem.delta, -40, 'computeWaterfallData : "Autres" delta = -30 + (-10) = -40 €');
    assertTrue(otherItem.isPos === false, 'computeWaterfallData : "Autres" isPos = false (négatif)');
    assertTrue(otherItem.label.startsWith('Autres'), 'computeWaterfallData : label commence par "Autres"');

    // Total attendu : 500+400+300+200+100+50-30-10 = 1510
    assertEq(r5.totalPnl, 1510, 'computeWaterfallData : totalPnl = +1510 €');
    const last5 = r5.items[r5.items.length - 1];
    assertEq(last5.end, 1510, 'computeWaterfallData : Total = +1510 €');

    // --- Cas 6 : exclusion des positions papier ---
    assets.push({
        id: 970999, name: 'Paper', ticker: 'PPR',
        categories: ['Action'], envelope: 'CTO',
        qty: 1, invested: 100, value: 5000,
        isPaper: true, paperScenarioId: 'default',
        lots: [], buys: [], history: []
    });
    const r6 = computeWaterfallData();
    assertEq(r6.totalPnl, 1510, 'computeWaterfallData : position papier exclue');
    assertEq(r6.positionsCount, 8, 'computeWaterfallData : 8 positions réelles (paper exclu)');

    // --- Cas 7 : tous les actifs en perte → total négatif ---
    assets.length = 0;
    assets.push({ id: 970201, name: 'X', ticker: 'XX', categories: ['Action'], envelope: 'CTO', qty: 1, invested: 1000, value: 800, lots: [], buys: [], history: [] });
    assets.push({ id: 970202, name: 'Y', ticker: 'YY', categories: ['Action'], envelope: 'CTO', qty: 1, invested: 500, value: 400, lots: [], buys: [], history: [] });
    const r7 = computeWaterfallData();
    assertEq(r7.totalPnl, -300, 'computeWaterfallData : total négatif = -300 €');
    const last7 = r7.items[r7.items.length - 1];
    assertTrue(last7.isPos === false, 'computeWaterfallData : Total isPos = false');
    assertEq(last7.end, -300, 'computeWaterfallData : Total end = -300 €');

    // Restaure
    assets.length = 0;
    backupAssets.forEach(a => assets.push(a));
})();

// ---------------------------------------------------------------------
// TESTS : computeWaterfallData — ordre de tri
// ---------------------------------------------------------------------
_suite('computeWaterfallData — tri');
(function testWaterfallSort() {
    const backupAssets = assets.slice();

    // 5 actifs avec des |delta| bien distincts
    assets.length = 0;
    const cases = [
        { ticker: 'ZZZ', delta: -50 },
        { ticker: 'AAA', delta: 800 },
        { ticker: 'MMM', delta: 100 },
        { ticker: 'BBB', delta: -400 },
        { ticker: 'CCC', delta: 300 }
    ];
    cases.forEach((c, i) => {
        assets.push({
            id: 975000 + i,
            name: 'Test ' + c.ticker,
            ticker: c.ticker,
            categories: ['Action'], envelope: 'CTO',
            qty: 1, invested: 1000, value: 1000 + c.delta,
            lots: [], buys: [], history: []
        });
    });

    const r = computeWaterfallData();
    const deltas = r.items.filter(it => it.kind === 'delta');
    // Ordre attendu par |delta| décroissant : AAA (800), BBB (400), CCC (300), MMM (100), ZZZ (50)
    assertEq(deltas[0].label, 'AAA', 'computeWaterfallData — tri : AAA en 1er (|800|)');
    assertEq(deltas[1].label, 'BBB', 'computeWaterfallData — tri : BBB en 2ᵉ (|400|)');
    assertEq(deltas[2].label, 'CCC', 'computeWaterfallData — tri : CCC en 3ᵉ (|300|)');
    assertEq(deltas[3].label, 'MMM', 'computeWaterfallData — tri : MMM en 4ᵉ (|100|)');
    assertEq(deltas[4].label, 'ZZZ', 'computeWaterfallData — tri : ZZZ en 5ᵉ (|50|)');

    // Restaure
    assets.length = 0;
    backupAssets.forEach(a => assets.push(a));
})();

// ---------------------------------------------------------------------
// TESTS : _getNavigableAssetIds (Chantier §8)
// ---------------------------------------------------------------------
_suite('_getNavigableAssetIds');
(function testNavigableAssetIds() {
    // Backup
    const backupAssets = assets.slice();
    const backupFilter = (typeof inventoryFilter !== 'undefined') ? inventoryFilter : 'ALL';
    const backupSearch = (typeof document !== 'undefined' && document.getElementById('inventory-search'))
        ? document.getElementById('inventory-search').value
        : '';

    // Jeu de test : 4 actifs (2 Action CTO, 1 Crypto, 1 Or)
    assets.length = 0;
    assets.push({
        id: 960001, name: 'Apple', ticker: 'AAPL',
        categories: ['Action'], envelope: 'CTO', cadran: 'ASIE',
        qty: 1, invested: 100, value: 150, lots: [], buys: [], history: []
    });
    assets.push({
        id: 960002, name: 'Microsoft', ticker: 'MSFT',
        categories: ['Action'], envelope: 'CTO', cadran: 'ASIE',
        qty: 1, invested: 100, value: 200, lots: [], buys: [], history: []
    });
    assets.push({
        id: 960003, name: 'Bitcoin', ticker: 'BTC',
        categories: ['Crypto'], envelope: '', cadran: 'CRYPTO',
        qty: 1, invested: 100, value: 300, lots: [], buys: [], history: []
    });
    assets.push({
        id: 960004, name: 'Napoléon', ticker: 'NAP20',
        categories: ['Or & Métaux'], envelope: '', cadran: 'OR',
        qty: 1, invested: 100, value: 120, lots: [], buys: [], history: []
    });

    // --- Cas 1 : filtre ALL, pas de recherche → 4 actifs ---
    if (typeof inventoryFilter !== 'undefined') inventoryFilter = 'ALL';
    const searchEl = document.getElementById('inventory-search');
    if (searchEl) searchEl.value = '';

    const ids1 = _getNavigableAssetIds();
    assertEq(ids1.length, 4, '_getNavigableAssetIds : 4 actifs avec filtre ALL');

    // --- Cas 2 : filtre Crypto → 1 actif ---
    if (typeof inventoryFilter !== 'undefined') inventoryFilter = 'Crypto';
    const ids2 = _getNavigableAssetIds();
    assertEq(ids2.length, 1, '_getNavigableAssetIds : 1 actif avec filtre Crypto');
    assertEq(ids2[0], 960003, '_getNavigableAssetIds : filtre Crypto → BTC');

    // --- Cas 3 : filtre Action → 2 actifs ---
    if (typeof inventoryFilter !== 'undefined') inventoryFilter = 'Action';
    const ids3 = _getNavigableAssetIds();
    assertEq(ids3.length, 2, '_getNavigableAssetIds : 2 actifs avec filtre Action');

    // --- Cas 4 : filtre ALL + recherche 'apple' → 1 actif ---
    if (typeof inventoryFilter !== 'undefined') inventoryFilter = 'ALL';
    if (searchEl) searchEl.value = 'apple';
    const ids4 = _getNavigableAssetIds();
    assertEq(ids4.length, 1, '_getNavigableAssetIds : recherche "apple" → 1 actif');
    assertEq(ids4[0], 960001, '_getNavigableAssetIds : recherche "apple" → AAPL');

    // --- Cas 5 : recherche par ticker (insensible à la casse) ---
    if (searchEl) searchEl.value = 'NAP';
    const ids5 = _getNavigableAssetIds();
    assertEq(ids5.length, 1, '_getNavigableAssetIds : recherche "NAP" → 1 actif');
    assertEq(ids5[0], 960004, '_getNavigableAssetIds : recherche "NAP" → NAP20');

    // --- Cas 6 : filtre CADRAN_OR → 1 actif ---
    if (searchEl) searchEl.value = '';
    if (typeof inventoryFilter !== 'undefined') inventoryFilter = 'CADRAN_OR';
    const ids6 = _getNavigableAssetIds();
    assertEq(ids6.length, 1, '_getNavigableAssetIds : filtre CADRAN_OR → 1 actif');
    assertEq(ids6[0], 960004, '_getNavigableAssetIds : filtre CADRAN_OR → NAP20');

    // Restaure
    if (typeof inventoryFilter !== 'undefined') inventoryFilter = backupFilter;
    if (searchEl) searchEl.value = backupSearch;
    assets.length = 0;
    backupAssets.forEach(a => assets.push(a));
})();

// ---------------------------------------------------------------------
// TESTS : _getAdjacentAssetId (Chantier §8)
// ---------------------------------------------------------------------
_suite('_getAdjacentAssetId');
(function testAdjacentAssetId() {
    const backupAssets = assets.slice();
    const backupFilter = (typeof inventoryFilter !== 'undefined') ? inventoryFilter : 'ALL';

    assets.length = 0;
    assets.push({ id: 961001, name: 'A', ticker: 'A', categories: ['Action'], envelope: 'CTO', qty: 1, invested: 100, value: 100, lots: [], buys: [], history: [] });
    assets.push({ id: 961002, name: 'B', ticker: 'B', categories: ['Action'], envelope: 'CTO', qty: 1, invested: 100, value: 100, lots: [], buys: [], history: [] });
    assets.push({ id: 961003, name: 'C', ticker: 'C', categories: ['Action'], envelope: 'CTO', qty: 1, invested: 100, value: 100, lots: [], buys: [], history: [] });

    if (typeof inventoryFilter !== 'undefined') inventoryFilter = 'ALL';

    // --- Cas 1 : du premier vers suivant ---
    assertEq(_getAdjacentAssetId(961001, +1), 961002, '_getAdjacentAssetId : 1er → 2ᵉ');
    // --- Cas 2 : du milieu vers suivant ---
    assertEq(_getAdjacentAssetId(961002, +1), 961003, '_getAdjacentAssetId : 2ᵉ → 3ᵉ');
    // --- Cas 3 : du dernier vers suivant → null (extrémité) ---
    assertNull(_getAdjacentAssetId(961003, +1), '_getAdjacentAssetId : dernier → null (extrémité haute)');
    // --- Cas 4 : du premier vers précédent → null (extrémité) ---
    assertNull(_getAdjacentAssetId(961001, -1), '_getAdjacentAssetId : 1er → null (extrémité basse)');
    // --- Cas 5 : du milieu vers précédent ---
    assertEq(_getAdjacentAssetId(961002, -1), 961001, '_getAdjacentAssetId : 2ᵉ → 1er');

    // --- Cas 6 : actif non trouvé → retourne le premier ---
    assertEq(_getAdjacentAssetId(999999, +1), 961001, '_getAdjacentAssetId : actif inconnu → 1er');

    // --- Cas 7 : liste vide → null ---
    assets.length = 0;
    assertNull(_getAdjacentAssetId(961001, +1), '_getAdjacentAssetId : liste vide → null');

    // Restaure
    assets.length = 0;
    backupAssets.forEach(a => assets.push(a));
    if (typeof inventoryFilter !== 'undefined') inventoryFilter = backupFilter;
})();

// ---------------------------------------------------------------------
// TESTS : setSlidePanelMode / persistance (Chantier §8)
// ---------------------------------------------------------------------
_suite('setSlidePanelMode — persistance');
(function testSlidePanelMode() {
    // Backup
    const backupMode = slidePanelMode;
    const backupRaw = localStorage.getItem(SLIDE_PANEL_MODE_KEY);

    // --- Cas 1 : mode 'slide' → localStorage + classe body ---
    setSlidePanelMode('slide');
    assertEq(slidePanelMode, 'slide', 'setSlidePanelMode : variable mise à jour');
    assertEq(localStorage.getItem(SLIDE_PANEL_MODE_KEY), 'slide', 'setSlidePanelMode : localStorage mis à jour');
    assertTrue(document.body.classList.contains('slide-panel-mode'), 'setSlidePanelMode : classe body.slide-panel-mode appliquée');

    // --- Cas 2 : mode 'modal' → retire la classe ---
    setSlidePanelMode('modal');
    assertEq(slidePanelMode, 'modal', 'setSlidePanelMode : retour au mode modal');
    assertFalse(document.body.classList.contains('slide-panel-mode'), 'setSlidePanelMode : classe body retirée');

    // --- Cas 3 : mode invalide → ignoré ---
    setSlidePanelMode('invalid_mode');
    assertEq(slidePanelMode, 'modal', 'setSlidePanelMode : mode invalide → ignoré');

    // --- Cas 4 : toggle ---
    toggleSlidePanelMode();
    assertEq(slidePanelMode, 'slide', 'toggleSlidePanelMode : modal → slide');
    toggleSlidePanelMode();
    assertEq(slidePanelMode, 'modal', 'toggleSlidePanelMode : slide → modal');

    // Restaure
    slidePanelMode = backupMode;
    if (backupRaw) localStorage.setItem(SLIDE_PANEL_MODE_KEY, backupRaw);
    else localStorage.removeItem(SLIDE_PANEL_MODE_KEY);
    document.body.classList.toggle('slide-panel-mode', slidePanelMode === 'slide');
})();

// ---------------------------------------------------------------------
// TESTS : captureCurrentFilterCriteria (Chantier §9)
// ---------------------------------------------------------------------
_suite('captureCurrentFilterCriteria');
(function testCaptureFilter() {
    // Backup
    const backupFilter = (typeof inventoryFilter !== 'undefined') ? inventoryFilter : 'ALL';
    const searchEl = document.getElementById('inventory-search');
    const backupSearch = searchEl ? searchEl.value : '';
    const thresholdEl = document.getElementById('inventory-threshold-input');
    const backupThreshold = thresholdEl ? thresholdEl.value : '';

    // --- Cas 1 : état par défaut ---
    if (typeof inventoryFilter !== 'undefined') inventoryFilter = 'ALL';
    if (searchEl) searchEl.value = '';
    if (thresholdEl) thresholdEl.value = '25';

    const c1 = captureCurrentFilterCriteria();
    assertEq(c1.search, '', 'captureCurrentFilterCriteria : search vide');
    assertEq(c1.category, 'ALL', 'captureCurrentFilterCriteria : catégorie par défaut');
    assertEq(c1.threshold, 25, 'captureCurrentFilterCriteria : seuil par défaut = 25 %');

    // --- Cas 2 : filtre + recherche + seuil ---
    if (typeof inventoryFilter !== 'undefined') inventoryFilter = 'ETF';
    if (searchEl) searchEl.value = 'world';
    if (thresholdEl) thresholdEl.value = '40';

    const c2 = captureCurrentFilterCriteria();
    assertEq(c2.search, 'world', 'captureCurrentFilterCriteria : search capturé');
    assertEq(c2.category, 'ETF', 'captureCurrentFilterCriteria : catégorie capturée');
    assertEq(c2.threshold, 40, 'captureCurrentFilterCriteria : seuil capturé');

    // Restaure
    if (typeof inventoryFilter !== 'undefined') inventoryFilter = backupFilter;
    if (searchEl) searchEl.value = backupSearch;
    if (thresholdEl) thresholdEl.value = backupThreshold;
})();

// ---------------------------------------------------------------------
// TESTS : CRUD filtres sauvegardés (Chantier §9)
// ---------------------------------------------------------------------
_suite('Filtres sauvegardés — CRUD');
(function testSavedFiltersCrud() {
    // Backup localStorage
    const backupRaw = localStorage.getItem(SAVED_FILTERS_KEY);

    // Vide pour isoler
    localStorage.removeItem(SAVED_FILTERS_KEY);
    if (typeof _savedFiltersCache !== 'undefined') _savedFiltersCache = null;

    // --- Cas 1 : liste vide au démarrage ---
    const list1 = loadSavedFilters();
    assertEq(list1.length, 0, 'loadSavedFilters : liste vide au démarrage');

    // --- Cas 2 : createSavedFilter ---
    const id1 = createSavedFilter('Mes ETF');
    assertTrue(id1 !== null, 'createSavedFilter : retourne un id');
    assertTrue(typeof id1 === 'string' && id1.startsWith('flt_'), 'createSavedFilter : id au bon format');

    const list2 = loadSavedFilters();
    assertEq(list2.length, 1, 'createSavedFilter : 1 filtre persisté');
    assertEq(list2[0].name, 'Mes ETF', 'createSavedFilter : nom préservé');
    assertEq(list2[0].applyCount, 0, 'createSavedFilter : applyCount initial = 0');
    assertTrue(list2[0].criteria !== undefined, 'createSavedFilter : criteria présent');

    // --- Cas 3 : nom vide → null ---
    assertNull(createSavedFilter(''), 'createSavedFilter : nom vide → null');
    assertNull(createSavedFilter('   '), 'createSavedFilter : nom blancs → null');
    assertNull(createSavedFilter(null), 'createSavedFilter : null → null');

    // --- Cas 4 : renameSavedFilter ---
    renameSavedFilter(id1, 'Mes ETF Monde');
    const list3 = loadSavedFilters();
    assertEq(list3[0].name, 'Mes ETF Monde', 'renameSavedFilter : nom mis à jour');

    // Nom identique → pas de changement
    renameSavedFilter(id1, 'Mes ETF Monde');
    assertEq(loadSavedFilters()[0].name, 'Mes ETF Monde', 'renameSavedFilter : nom identique → pas de modif');

    // --- Cas 5 : overwriteSavedFilter ---
    const filtersBefore = loadSavedFilters();
    const oldCreatedAt = filtersBefore[0].createdAt;

    // Change l'état puis écrase
    const searchEl = document.getElementById('inventory-search');
    const backupSearch = searchEl ? searchEl.value : '';
    if (searchEl) searchEl.value = 'apple';

    overwriteSavedFilter(id1);
    const list4 = loadSavedFilters();
    assertEq(list4[0].criteria.search, 'apple', 'overwriteSavedFilter : criteria mis à jour');
    assertEq(list4[0].createdAt, oldCreatedAt, 'overwriteSavedFilter : createdAt préservé');
    assertTrue(list4[0].updatedAt > 0, 'overwriteSavedFilter : updatedAt défini');

    if (searchEl) searchEl.value = backupSearch;

    // --- Cas 6 : deleteSavedFilter (avec confirm) ---
    const _origConfirm = window.confirm;
    window.confirm = () => true;   // auto-accept

    deleteSavedFilter(id1);
    assertEq(loadSavedFilters().length, 0, 'deleteSavedFilter : filtre supprimé');

    window.confirm = _origConfirm;

    // --- Cas 7 : persistance dans localStorage ---
    const id2 = createSavedFilter('Test persistance');
    const raw = localStorage.getItem(SAVED_FILTERS_KEY);
    assertTrue(raw !== null, 'Persistance : clé localStorage présente');
    const parsed = JSON.parse(raw);
    assertEq(parsed.length, 1, 'Persistance : 1 filtre dans localStorage');
    assertEq(parsed[0].id, id2, 'Persistance : id correct');

    // Restaure
    localStorage.removeItem(SAVED_FILTERS_KEY);
    if (backupRaw) localStorage.setItem(SAVED_FILTERS_KEY, backupRaw);
    if (typeof _savedFiltersCache !== 'undefined') _savedFiltersCache = null;
})();

// ---------------------------------------------------------------------
// TESTS : _quickSearchScore (Chantier §9)
// ---------------------------------------------------------------------
_suite('_quickSearchScore');
(function testQuickSearchScore() {
    const asset = { id: 1, name: 'Apple Inc.', ticker: 'AAPL' };

    // --- Cas 1 : query vide → score minimal (1) ---
    assertEq(_quickSearchScore('', asset), 1, '_quickSearchScore : query vide → 1');

    // --- Cas 2 : ticker exact → score maximal (1000) ---
    assertEq(_quickSearchScore('aapl', asset), 1000, '_quickSearchScore : ticker exact = 1000');
    assertEq(_quickSearchScore('AAPL', asset), 1000, '_quickSearchScore : ticker exact insensible à la casse');

    // --- Cas 3 : ticker commence par → 800+ ---
    const s3 = _quickSearchScore('aa', asset);
    assertTrue(s3 >= 800 && s3 < 1000, '_quickSearchScore : ticker commence par → 800+');
    assertTrue(s3 > _quickSearchScore('ppl', asset), '_quickSearchScore : préfixe > contenu');

    // --- Cas 4 : nom commence par → 600+ ---
    const s4 = _quickSearchScore('app', asset);
    assertTrue(s4 >= 600 && s4 < 800, '_quickSearchScore : nom commence par → 600+');

    // --- Cas 5 : nom contient → 400+ ---
    const s5 = _quickSearchScore('inc', asset);
    assertTrue(s5 >= 400 && s5 < 600, '_quickSearchScore : nom contient → 400+');

    // --- Cas 6 : ticker contient → 200+ ---
    // 'pl' n'est pas en début de ticker mais est contenu dedans
    const s6 = _quickSearchScore('pl', asset);
    assertTrue(s6 > 0, '_quickSearchScore : ticker contient → > 0');

    // --- Cas 7 : aucun match → 0 ---
    assertEq(_quickSearchScore('xyzabc', asset), 0, '_quickSearchScore : pas de match → 0');

    // --- Cas 8 : cohérence d'ordre général ---
    const exact  = _quickSearchScore('aapl', asset);
    const prefix = _quickSearchScore('aa', asset);
    const name   = _quickSearchScore('app', asset);
    const inside = _quickSearchScore('inc', asset);
    assertTrue(exact > prefix, '_quickSearchScore : exact > préfixe ticker');
    assertTrue(prefix > name, '_quickSearchScore : préfixe ticker > préfixe nom');
    assertTrue(name > inside, '_quickSearchScore : préfixe nom > nom contient');
})();

// ---------------------------------------------------------------------
// TESTS : _buildQuickSearchResults (intégration)
// ---------------------------------------------------------------------
_suite('_buildQuickSearchResults');
(function testBuildQuickSearchResults() {
    const backupAssets = assets.slice();

    assets.length = 0;
    assets.push({ id: 950001, name: 'Apple Inc.', ticker: 'AAPL', categories: ['Action'], envelope: 'CTO', qty: 1, invested: 100, value: 200, lots: [], buys: [], history: [] });
    assets.push({ id: 950002, name: 'Amazon', ticker: 'AMZN', categories: ['Action'], envelope: 'CTO', qty: 1, invested: 100, value: 150, lots: [], buys: [], history: [] });
    assets.push({ id: 950003, name: 'Microsoft', ticker: 'MSFT', categories: ['Action'], envelope: 'CTO', qty: 1, invested: 100, value: 300, lots: [], buys: [], history: [] });
    assets.push({ id: 950004, name: 'Bitcoin', ticker: 'BTC', categories: ['Crypto'], envelope: '', qty: 1, invested: 100, value: 5000, lots: [], buys: [], history: [] });

    // --- Cas 1 : query vide → 4 résultats triés par valeur décroissante ---
    const r1 = _buildQuickSearchResults('');
    assertEq(r1.length, 4, '_buildQuickSearchResults : query vide → tous');
    assertEq(r1[0].asset.ticker, 'BTC', '_buildQuickSearchResults : BTC en 1er (plus grosse valeur)');
    assertEq(r1[1].asset.ticker, 'MSFT', '_buildQuickSearchResults : MSFT en 2ᵉ');

    // --- Cas 2 : query 'A' → 3 résultats (AAPL, AMZN, + autres contenant 'a') ---
    const r2 = _buildQuickSearchResults('a');
    assertTrue(r2.length >= 2, '_buildQuickSearchResults : query "a" → plusieurs résultats');
    assertTrue(r2.every(r => r.score > 0), '_buildQuickSearchResults : tous les résultats ont score > 0');

    // --- Cas 3 : query 'aapl' → exact match en premier ---
    const r3 = _buildQuickSearchResults('aapl');
    assertTrue(r3.length >= 1, '_buildQuickSearchResults : "aapl" → au moins 1');
    assertEq(r3[0].asset.ticker, 'AAPL', '_buildQuickSearchResults : "aapl" → AAPL en tête');

    // --- Cas 4 : query inconnue → 0 résultat ---
    const r4 = _buildQuickSearchResults('zzzzzz');
    assertEq(r4.length, 0, '_buildQuickSearchResults : "zzzzzz" → 0 résultat');

    // Restaure
    assets.length = 0;
    backupAssets.forEach(a => assets.push(a));
})();

// ---------------------------------------------------------------------
// TESTS : hasThesis / getThesisText / getThesisAgeDays (Chantier §10)
// ---------------------------------------------------------------------
_suite('hasThesis / getThesisText');
(function testHasThesis() {
    // --- Cas 1 : asset null → false ---
    assertFalse(hasThesis(null), 'hasThesis : null → false');
    assertFalse(hasThesis(undefined), 'hasThesis : undefined → false');

    // --- Cas 2 : pas de propriété thesis → false ---
    assertFalse(hasThesis({ id: 1, name: 'Test' }), 'hasThesis : pas de thesis → false');

    // --- Cas 3 : thesis vide → false ---
    assertFalse(hasThesis({ thesis: { text: '' } }), 'hasThesis : texte vide → false');
    assertFalse(hasThesis({ thesis: { text: '   ' } }), 'hasThesis : texte blancs → false');
    assertFalse(hasThesis({ thesis: { text: null } }), 'hasThesis : texte null → false');

    // --- Cas 4 : thesis valide → true ---
    assertTrue(hasThesis({ thesis: { text: 'Je détiens pour...' } }), 'hasThesis : texte valide → true');

    // --- getThesisText ---
    assertEq(getThesisText({ thesis: { text: '  Hello  ' } }), 'Hello', 'getThesisText : trim appliqué');
    assertEq(getThesisText({ thesis: { text: '' } }), '', 'getThesisText : vide → ""');
    assertEq(getThesisText(null), '', 'getThesisText : null → ""');
})();

// ---------------------------------------------------------------------
// TESTS : getThesisAgeDays
// ---------------------------------------------------------------------
_suite('getThesisAgeDays');
(function testThesisAge() {
    // --- Cas 1 : pas de thèse → null ---
    assertNull(getThesisAgeDays({ }), 'getThesisAgeDays : pas de thèse → null');
    assertNull(getThesisAgeDays({ thesis: { text: '' } }), 'getThesisAgeDays : texte vide → null');

    // --- Cas 2 : thèse du jour → 0 jours ---
    const asset1 = {
        thesis: {
            text: 'Test',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            lastReviewedAt: Date.now()
        }
    };
    assertEq(getThesisAgeDays(asset1), 0, 'getThesisAgeDays : aujourd\'hui → 0');

    // --- Cas 3 : thèse de 100 jours → 100 ---
    const asset2 = {
        thesis: {
            text: 'Test',
            createdAt: Date.now() - 100 * 864e5,
            updatedAt: Date.now() - 100 * 864e5,
            lastReviewedAt: Date.now() - 100 * 864e5
        }
    };
    assertEq(getThesisAgeDays(asset2), 100, 'getThesisAgeDays : 100 jours');

    // --- Cas 4 : priorité lastReviewedAt > updatedAt > createdAt ---
    const asset3 = {
        thesis: {
            text: 'Test',
            createdAt: Date.now() - 200 * 864e5,
            updatedAt: Date.now() - 100 * 864e5,
            lastReviewedAt: Date.now() - 50 * 864e5
        }
    };
    assertEq(getThesisAgeDays(asset3), 50, 'getThesisAgeDays : lastReviewedAt prioritaire');

    // --- Cas 5 : lastReviewedAt absent → utilise updatedAt ---
    const asset4 = {
        thesis: {
            text: 'Test',
            createdAt: Date.now() - 200 * 864e5,
            updatedAt: Date.now() - 100 * 864e5
        }
    };
    assertEq(getThesisAgeDays(asset4), 100, 'getThesisAgeDays : fallback sur updatedAt');

    // --- Cas 6 : timestamp invalide → null ---
    const asset5 = {
        thesis: { text: 'Test', lastReviewedAt: 0 }
    };
    assertNull(getThesisAgeDays(asset5), 'getThesisAgeDays : timestamp invalide → null');
})();

// ---------------------------------------------------------------------
// TESTS : setAssetThesis (Chantier §10)
// ---------------------------------------------------------------------
_suite('setAssetThesis');
(function testSetAssetThesis() {
    const backupAssets = assets.slice();

    // --- Cas 1 : actif introuvable → false ---
    assets.length = 0;
    assertFalse(setAssetThesis(99999, 'Test'), 'setAssetThesis : actif introuvable → false');

    // --- Cas 2 : création d'une thèse ---
    assets.push({
        id: 940001, name: 'Test A', ticker: 'TA',
        categories: ['Action'], envelope: 'CTO',
        qty: 1, invested: 100, value: 100,
        lots: [], buys: [], history: []
    });
    assertTrue(setAssetThesis(940001, 'Ma thèse de test'), 'setAssetThesis : création → true');
    assertTrue(hasThesis(assets[0]), 'setAssetThesis : thèse présente');
    assertEq(assets[0].thesis.text, 'Ma thèse de test', 'setAssetThesis : texte correct');
    assertTrue(assets[0].thesis.createdAt > 0, 'setAssetThesis : createdAt défini');
    assertTrue(assets[0].thesis.updatedAt > 0, 'setAssetThesis : updatedAt défini');
    assertTrue(assets[0].thesis.lastReviewedAt > 0, 'setAssetThesis : lastReviewedAt défini');

    // --- Cas 3 : mise à jour d'une thèse existante ---
    const originalCreatedAt = assets[0].thesis.createdAt;
    setAssetThesis(940001, 'Thèse mise à jour');
    assertEq(assets[0].thesis.text, 'Thèse mise à jour', 'setAssetThesis : texte mis à jour');
    assertEq(assets[0].thesis.createdAt, originalCreatedAt, 'setAssetThesis : createdAt préservé');

    // --- Cas 4 : trim appliqué ---
    setAssetThesis(940001, '  Avec espaces  ');
    assertEq(assets[0].thesis.text, 'Avec espaces', 'setAssetThesis : trim appliqué');

    // --- Cas 5 : troncature à THESIS_MAX_LENGTH ---
    const longText = 'x'.repeat(THESIS_MAX_LENGTH + 100);
    setAssetThesis(940001, longText);
    assertEq(assets[0].thesis.text.length, THESIS_MAX_LENGTH, 'setAssetThesis : tronqué à 500 chars');

    // --- Cas 6 : texte vide → suppression ---
    setAssetThesis(940001, '');
    assertFalse(hasThesis(assets[0]), 'setAssetThesis : texte vide → suppression');
    assertTrue(assets[0].thesis === undefined, 'setAssetThesis : propriété thesis supprimée');

    // --- Cas 7 : null → suppression ---
    setAssetThesis(940001, 'Re-remplir');
    setAssetThesis(940001, null);
    assertFalse(hasThesis(assets[0]), 'setAssetThesis : null → suppression');

    assets.length = 0;
    backupAssets.forEach(a => assets.push(a));
})();

// ---------------------------------------------------------------------
// TESTS : markThesisReviewed (Chantier §10)
// ---------------------------------------------------------------------
_suite('markThesisReviewed');
(function testMarkReviewed() {
    const backupAssets = assets.slice();

    // --- Cas 1 : actif sans thèse → false ---
    assets.length = 0;
    assets.push({
        id: 941001, name: 'Test B', ticker: 'TB',
        categories: ['Action'], envelope: 'CTO',
        qty: 1, invested: 100, value: 100,
        lots: [], buys: [], history: []
    });
    assertFalse(markThesisReviewed(941001), 'markThesisReviewed : sans thèse → false');

    // --- Cas 2 : actif avec thèse → true ---
    setAssetThesis(941001, 'Ma thèse');
    // Recule artificiellement la date
    assets[0].thesis.lastReviewedAt = Date.now() - 100 * 864e5;
    const oldReviewedAt = assets[0].thesis.lastReviewedAt;
    assertTrue(markThesisReviewed(941001), 'markThesisReviewed : avec thèse → true');
    assertTrue(assets[0].thesis.lastReviewedAt > oldReviewedAt, 'markThesisReviewed : date mise à jour');

    // --- Cas 3 : actif introuvable → false ---
    assertFalse(markThesisReviewed(99999), 'markThesisReviewed : actif introuvable → false');

    assets.length = 0;
    backupAssets.forEach(a => assets.push(a));
})();

// ---------------------------------------------------------------------
// TESTS : detectStaleTheses (Chantier §10)
// ---------------------------------------------------------------------
_suite('detectStaleTheses');
(function testDetectStale() {
    const backupAssets = assets.slice();
    assets.length = 0;

    // --- Cas 1 : pas de thèse → pas détecté ---
    assets.push({
        id: 942001, name: 'No thesis', ticker: 'NT',
        categories: ['Action'], envelope: 'CTO',
        qty: 1, invested: 100, value: 50,   // perte -50 %
        lots: [], buys: [], history: []
    });
    assertEq(detectStaleTheses().length, 0, 'detectStaleTheses : sans thèse → 0');

    // --- Cas 2 : thèse récente + perte → pas détecté ---
    setAssetThesis(942001, 'Thèse récente');
    // Force une date récente (< 1 an)
    assets[0].thesis.lastReviewedAt = Date.now() - 10 * 864e5;
    assertEq(detectStaleTheses().length, 0, 'detectStaleTheses : thèse récente → 0');

    // --- Cas 3 : thèse ancienne MAIS position en gain → pas détecté ---
    assets[0].thesis.lastReviewedAt = Date.now() - 500 * 864e5;   // > 1 an
    assets[0].value = 200;   // gain +100 %
    assertEq(detectStaleTheses().length, 0, 'detectStaleTheses : thèse ancienne en gain → 0');

    // --- Cas 4 : thèse ancienne + perte → détecté ---
    assets[0].value = 50;    // perte -50 % (sous le seuil -20 %)
    const r4 = detectStaleTheses();
    assertEq(r4.length, 1, 'detectStaleTheses : thèse ancienne + perte → 1');
    assertEq(r4[0].asset.id, 942001, 'detectStaleTheses : bon actif');
    assertTrue(r4[0].ageDays >= 500, 'detectStaleTheses : ageDays ≥ 500');
    assertApprox(r4[0].pnlPct, -50, 0.5, 'detectStaleTheses : pnlPct ≈ -50 %');

    // --- Cas 5 : perte légère (> -20 %) → pas détecté ---
    assets[0].value = 85;    // perte -15 % (au-dessus du seuil -20 %)
    assertEq(detectStaleTheses().length, 0, 'detectStaleTheses : perte < 20 % → 0');

    // --- Cas 6 : tri par sévérité décroissante ---
    assets.length = 0;
    // Créer 3 actifs avec des profils de sévérité différents
    const createAsset = (id, name, value, invested, ageDays) => {
        assets.push({
            id, name, ticker: name,
            categories: ['Action'], envelope: 'CTO',
            qty: 1, invested, value,
            lots: [], buys: [], history: []
        });
        setAssetThesis(id, 'Thèse');
        const a = assets.find(x => x.id === id);
        a.thesis.lastReviewedAt = Date.now() - ageDays * 864e5;
    };
    createAsset(950001, 'Light', 800, 1000, 400);      // -20 % sur 400 j → seuil juste atteint
    createAsset(950002, 'Severe', 300, 1000, 800);     // -70 % sur 800 j → très sévère
    createAsset(950003, 'Medium', 500, 1000, 500);     // -50 % sur 500 j → moyen

    const r6 = detectStaleTheses();
    assertEq(r6.length, 3, 'detectStaleTheses : 3 détectés');
    assertEq(r6[0].asset.name, 'Severe', 'detectStaleTheses : "Severe" en 1er (plus critique)');
    assertEq(r6[2].asset.name, 'Light', 'detectStaleTheses : "Light" en dernier');

    // --- Cas 7 : paper trading exclu ---
    assets.push({
        id: 950099, name: 'Paper', ticker: 'PPR',
        categories: ['Action'], envelope: 'CTO',
        qty: 1, invested: 1000, value: 100,
        isPaper: true, paperScenarioId: 'default',
        lots: [], buys: [], history: [],
        thesis: { text: 'Test', createdAt: 1, updatedAt: 1, lastReviewedAt: 1 }
    });
    const r7 = detectStaleTheses();
    assertTrue(r7.every(x => !x.asset.isPaper), 'detectStaleTheses : paper exclu');

    assets.length = 0;
    backupAssets.forEach(a => assets.push(a));
})();

// ---------------------------------------------------------------------
// TESTS : thesisBadgeHTML (Chantier §10)
// ---------------------------------------------------------------------
_suite('thesisBadgeHTML');
(function testThesisBadge() {
    // --- Cas 1 : pas de thèse → chaîne vide ---
    assertEq(thesisBadgeHTML({ id: 1, name: 'A' }), '', 'thesisBadgeHTML : pas de thèse → ""');
    assertEq(thesisBadgeHTML({ thesis: { text: '' } }), '', 'thesisBadgeHTML : texte vide → ""');

    // --- Cas 2 : thèse récente + gain → badge indigo normal ---
    const a1 = {
        id: 1, name: 'Test', invested: 100, value: 150,
        thesis: { text: 'Test', createdAt: Date.now() - 10 * 864e5, updatedAt: Date.now() - 10 * 864e5, lastReviewedAt: Date.now() - 10 * 864e5 }
    };
    const html1 = thesisBadgeHTML(a1);
    assertTrue(html1.length > 0, 'thesisBadgeHTML : thèse récente → badge');
    assertTrue(html1.includes('indigo'), 'thesisBadgeHTML : badge indigo (normal)');
    assertFalse(html1.includes('amber'), 'thesisBadgeHTML : pas de couleur amber');

    // --- Cas 3 : thèse ancienne + perte → badge amber avec ⚠ ---
    const a2 = {
        id: 2, name: 'Test', invested: 1000, value: 500,
        thesis: { text: 'Test', createdAt: Date.now() - 500 * 864e5, updatedAt: Date.now() - 500 * 864e5, lastReviewedAt: Date.now() - 500 * 864e5 }
    };
    const html2 = thesisBadgeHTML(a2);
    assertTrue(html2.includes('amber'), 'thesisBadgeHTML : thèse stale → badge amber');
    assertTrue(html2.includes('⚠'), 'thesisBadgeHTML : badge stale contient ⚠');

    // --- Cas 4 : thèse ancienne MAIS en gain → badge indigo normal (pas de ⚠) ---
    const a3 = {
        id: 3, name: 'Test', invested: 1000, value: 2000,
        thesis: { text: 'Test', createdAt: Date.now() - 500 * 864e5, updatedAt: Date.now() - 500 * 864e5, lastReviewedAt: Date.now() - 500 * 864e5 }
    };
    const html3 = thesisBadgeHTML(a3);
    assertTrue(html3.includes('indigo'), 'thesisBadgeHTML : thèse ancienne en gain → indigo (pas de ⚠)');
    assertFalse(html3.includes('⚠'), 'thesisBadgeHTML : pas de ⚠ si gain');
})();

// ---------------------------------------------------------------------
// TESTS : Chantier §9 — Simulateur de sortie progressive
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// TESTS : loadWithdrawalConfigFromStorage / saveWithdrawalConfigToStorage
// ---------------------------------------------------------------------
_suite('Withdrawal — persistance');
(function testWithdrawalPersistence() {
    const backupRaw = localStorage.getItem(WITHDRAWAL_STORAGE_KEY);
    const backupConfig = { ...withdrawalConfig };

    // --- Cas 1 : pas de config → valeurs par défaut ---
    localStorage.removeItem(WITHDRAWAL_STORAGE_KEY);
    const loaded1 = loadWithdrawalConfigFromStorage();
    assertEq(loaded1.monthlyAmount, 2500, 'loadWithdrawalConfigFromStorage : amount par défaut = 2500');
    assertEq(loaded1.years, 30, 'loadWithdrawalConfigFromStorage : years par défaut = 30');
    assertEq(loaded1.expectedReturn, 0.05, 'loadWithdrawalConfigFromStorage : rendement par défaut = 5 %');
    assertEq(loaded1.inflationRate, 0.02, 'loadWithdrawalConfigFromStorage : inflation par défaut = 2 %');
    assertEq(loaded1.volOverride, 0, 'loadWithdrawalConfigFromStorage : volOverride par défaut = 0 (auto)');

    // --- Cas 2 : save puis load ---
    withdrawalConfig.monthlyAmount = 3000;
    withdrawalConfig.years = 25;
    withdrawalConfig.expectedReturn = 0.06;
    withdrawalConfig.inflationRate = 0.025;
    withdrawalConfig.volOverride = 0.18;
    saveWithdrawalConfigToStorage();

    const loaded2 = loadWithdrawalConfigFromStorage();
    assertEq(loaded2.monthlyAmount, 3000, 'Persistance : amount préservé');
    assertEq(loaded2.years, 25, 'Persistance : years préservé');
    assertEq(loaded2.expectedReturn, 0.06, 'Persistance : rendement préservé');
    assertEq(loaded2.inflationRate, 0.025, 'Persistance : inflation préservée');
    assertEq(loaded2.volOverride, 0.18, 'Persistance : volOverride préservée');

    // --- Cas 3 : JSON invalide → fallback ---
    localStorage.setItem(WITHDRAWAL_STORAGE_KEY, '{invalid json');
    const loaded3 = loadWithdrawalConfigFromStorage();
    assertEq(loaded3.monthlyAmount, 2500, 'JSON invalide → défaut = 2500');

    // Restaure
    localStorage.removeItem(WITHDRAWAL_STORAGE_KEY);
    if (backupRaw) localStorage.setItem(WITHDRAWAL_STORAGE_KEY, backupRaw);
    Object.assign(withdrawalConfig, backupConfig);
})();

// ---------------------------------------------------------------------
// TESTS : _getWithdrawalVolAnnual — priorité override > réelle > fallback
// ---------------------------------------------------------------------
_suite('_getWithdrawalVolAnnual');
(function testWithdrawalVol() {
    const backupAssets = assets.slice();
    const backupConfig = { ...withdrawalConfig };

    // --- Cas 1 : volOverride > 0 → utilise l'override ---
    withdrawalConfig.volOverride = 0.22;
    assertApprox(_getWithdrawalVolAnnual(), 0.22, 0.0001, '_getWithdrawalVolAnnual : override utilisé');

    // --- Cas 2 : volOverride = 0 + portefeuille vide → fallback 0.15 ---
    withdrawalConfig.volOverride = 0;
    assets.length = 0;
    assertApprox(_getWithdrawalVolAnnual(), 0.15, 0.0001, '_getWithdrawalVolAnnual : vide → 0.15');

    // --- Cas 3 : volOverride = 0 + 1 seul actif → fallback 0.15 ---
    //   (computeRiskMetricsFromAssets exige >= 2 actifs réels)
    assets.push({
        id: 999000, name: 'Test', ticker: 'TST',
        categories: ['Autre'], envelope: '',
        qty: 1, invested: 1000, value: 1000,
        lots: [], buys: [], history: []
    });
    assertApprox(_getWithdrawalVolAnnual(), 0.15, 0.0001, '_getWithdrawalVolAnnual : 1 actif → fallback 0.15');

    // Restaure
    assets.length = 0;
    backupAssets.forEach(a => assets.push(a));
    Object.assign(withdrawalConfig, backupConfig);
})();

// ---------------------------------------------------------------------
// TESTS : runWithdrawalMonteCarlo — cas portefeuille vide
// ---------------------------------------------------------------------
_suite('runWithdrawalMonteCarlo — vide');
(function testWithdrawalEmpty() {
    const backupAssets = assets.slice();
    assets.length = 0;

    const r = runWithdrawalMonteCarlo(100);
    assertEq(r.successProb, 0, 'runWithdrawalMonteCarlo : vide → successProb = 0');
    assertEq(r.medianFinal, 0, 'runWithdrawalMonteCarlo : vide → medianFinal = 0');
    assertEq(r.p10Final, 0, 'runWithdrawalMonteCarlo : vide → p10Final = 0');
    assertEq(r.p90Final, 0, 'runWithdrawalMonteCarlo : vide → p90Final = 0');
    assertEq(r.initialCapital, 0, 'runWithdrawalMonteCarlo : vide → initialCapital = 0');
    assertEq(r.monthlyAmount, 0, 'runWithdrawalMonteCarlo : vide → monthlyAmount = 0');
    assertEq(r.years, 0, 'runWithdrawalMonteCarlo : vide → years = 0');

    assets.length = 0;
    backupAssets.forEach(a => assets.push(a));
})();

// ---------------------------------------------------------------------
// TESTS : runWithdrawalMonteCarlo — cas nominal (retrait soutenable)
// ---------------------------------------------------------------------
_suite('runWithdrawalMonteCarlo — nominal');
(function testWithdrawalNominal() {
    const backupAssets = assets.slice();
    const backupConfig = { ...withdrawalConfig };

    // Portefeuille 1 M€, retrait 2 500 €/mois (= 30 000 €/an = 3 % de
    // retrait initial). Rendement réel net ≈ 2,94 %/an. → soutenable.
    assets.length = 0;
    assets.push({
        id: 999001, name: 'Test', ticker: 'TST',
        categories: ['Autre'], envelope: '',
        qty: 1, invested: 1000000, value: 1000000,
        lots: [], buys: [], history: []
    });

    withdrawalConfig.monthlyAmount = 2500;
    withdrawalConfig.years = 30;
    withdrawalConfig.expectedReturn = 0.05;
    withdrawalConfig.inflationRate = 0.02;
    withdrawalConfig.volOverride = 0.15;

    const r = runWithdrawalMonteCarlo(300);

    // --- Structure du résultat ---
    assertEq(r.initialCapital, 1000000, 'runWithdrawalMonteCarlo : capital initial = 1 M€');
    assertEq(r.monthlyAmount, 2500, 'runWithdrawalMonteCarlo : retrait mensuel = 2 500 €');
    assertEq(r.years, 30, 'runWithdrawalMonteCarlo : horizon = 30 ans');
    assertEq(r.numPaths, 300, 'runWithdrawalMonteCarlo : numPaths respecté');
    assertApprox(r.volAnnual, 0.15, 0.001, 'runWithdrawalMonteCarlo : volAnnual = 15 %');
    // Rendement réel Fisher exact : (1.05 / 1.02) − 1 ≈ 0.02941
    assertApprox(r.realAnnualReturn, 0.02941, 0.0001, 'runWithdrawalMonteCarlo : rendement réel Fisher ≈ 2,94 %');

    // --- Bornes ---
    assertTrue(r.successProb >= 0 && r.successProb <= 1, 'runWithdrawalMonteCarlo : successProb ∈ [0, 1]');
    assertTrue(r.failureCount === r.numPaths - Math.round(r.successProb * r.numPaths),
        'runWithdrawalMonteCarlo : failureCount cohérent avec successProb');

    // --- Percentiles ordonnés ---
    assertTrue(r.p10Final <= r.medianFinal, 'runWithdrawalMonteCarlo : P10 ≤ P50');
    assertTrue(r.medianFinal <= r.p90Final, 'runWithdrawalMonteCarlo : P50 ≤ P90');

    // --- Cas soutenable : probabilité élevée attendue ---
    // Avec 3 % de retrait initial, le capital tient dans la grande majorité
    // des scénarios (seuil bas pour absorber la variabilité stochastique).
    assertTrue(r.successProb >= 0.7,
        'runWithdrawalMonteCarlo : retrait à 3 % → succès ≥ 70 % (obtenu ' + (r.successProb * 100).toFixed(1) + ' %)');

    // Restaure
    assets.length = 0;
    backupAssets.forEach(a => assets.push(a));
    Object.assign(withdrawalConfig, backupConfig);
})();

// ---------------------------------------------------------------------
// TESTS : runWithdrawalMonteCarlo — cas insoutenable (retrait massif)
// ---------------------------------------------------------------------
_suite('runWithdrawalMonteCarlo — insoutenable');
(function testWithdrawalUnsustainable() {
    const backupAssets = assets.slice();
    const backupConfig = { ...withdrawalConfig };

    // Portefeuille 100 k€, retrait 5 000 €/mois = 60 000 €/an = 60 % de
    // retrait initial. Épuisement attendu en ~2 ans médian.
    assets.length = 0;
    assets.push({
        id: 999002, name: 'Test2', ticker: 'TS2',
        categories: ['Autre'], envelope: '',
        qty: 1, invested: 100000, value: 100000,
        lots: [], buys: [], history: []
    });

    withdrawalConfig.monthlyAmount = 5000;
    withdrawalConfig.years = 30;
    withdrawalConfig.expectedReturn = 0.05;
    withdrawalConfig.inflationRate = 0.02;
    withdrawalConfig.volOverride = 0.15;

    const r = runWithdrawalMonteCarlo(200);

    // --- Cas insoutenable : probabilité très faible ---
    assertTrue(r.successProb < 0.05,
        'runWithdrawalMonteCarlo : retrait 60 % → succès < 5 % (obtenu ' + (r.successProb * 100).toFixed(1) + ' %)');
    assertTrue(r.failureCount > 0, 'runWithdrawalMonteCarlo : failureCount > 0');
    assertTrue(r.medianDepletionYear !== null, 'runWithdrawalMonteCarlo : médiane d\'épuisement calculée');
    assertTrue(r.medianDepletionYear < 5,
        'runWithdrawalMonteCarlo : épuisement médian < 5 ans (obtenu ' + r.medianDepletionYear + ' ans)');

    // Restaure
    assets.length = 0;
    backupAssets.forEach(a => assets.push(a));
    Object.assign(withdrawalConfig, backupConfig);
})();

// ---------------------------------------------------------------------
// TESTS : runWithdrawalMonteCarlo — clamp des paramètres (years, montants)
// ---------------------------------------------------------------------
_suite('runWithdrawalMonteCarlo — clamp');
(function testWithdrawalClamp() {
    const backupAssets = assets.slice();
    const backupConfig = { ...withdrawalConfig };

    assets.length = 0;
    assets.push({
        id: 999003, name: 'Test3', ticker: 'TS3',
        categories: ['Autre'], envelope: '',
        qty: 1, invested: 10000, value: 10000,
        lots: [], buys: [], history: []
    });

    withdrawalConfig.monthlyAmount = 100;
    withdrawalConfig.expectedReturn = 0.05;
    withdrawalConfig.inflationRate = 0.02;
    withdrawalConfig.volOverride = 0.15;

    // --- years = 100 → clampé à 60 (borne haute) ---
    withdrawalConfig.years = 100;
    const r1 = runWithdrawalMonteCarlo(30);
    assertEq(r1.years, 60, 'runWithdrawalMonteCarlo : years > 60 → clampé à 60');

    // --- years = 0 → clampé à 1 (borne basse) ---
    withdrawalConfig.years = 0;
    const r2 = runWithdrawalMonteCarlo(30);
    assertEq(r2.years, 1, 'runWithdrawalMonteCarlo : years = 0 → clampé à 1');

    // Restaure
    assets.length = 0;
    backupAssets.forEach(a => assets.push(a));
    Object.assign(withdrawalConfig, backupConfig);
})();

// ---------------------------------------------------------------------
// TESTS : getWithdrawalResult — cache et invalidation
// ---------------------------------------------------------------------
_suite('getWithdrawalResult — cache');
(function testWithdrawalCache() {
    const backupAssets = assets.slice();
    const backupConfig = { ...withdrawalConfig };

    assets.length = 0;
    assets.push({
        id: 999004, name: 'Test4', ticker: 'TS4',
        categories: ['Autre'], envelope: '',
        qty: 1, invested: 500000, value: 500000,
        lots: [], buys: [], history: []
    });

    withdrawalConfig.monthlyAmount = 1500;
    withdrawalConfig.years = 20;
    withdrawalConfig.expectedReturn = 0.05;
    withdrawalConfig.inflationRate = 0.02;
    withdrawalConfig.volOverride = 0.15;

    // Invalide par sécurité avant le test
    invalidateWithdrawalCache();

    // --- Deux appels → même référence (cache actif) ---
    const r1 = getWithdrawalResult();
    const r2 = getWithdrawalResult();
    assertTrue(r1 === r2, 'getWithdrawalResult : cache actif (même référence)');

    // --- Invalidation → nouvelle référence ---
    invalidateWithdrawalCache();
    const r3 = getWithdrawalResult();
    assertTrue(r3 !== r1, 'getWithdrawalResult : nouvelle référence après invalidation');

    // --- L\'invalidation remet bien le cache à zéro ---
    assertTrue(_withdrawalMcResult !== null, 'invalidateWithdrawalCache : un nouveau calcul a repeuplé le cache');

    // Restaure
    assets.length = 0;
    backupAssets.forEach(a => assets.push(a));
    Object.assign(withdrawalConfig, backupConfig);
    invalidateWithdrawalCache();
})();

// ---------------------------------------------------------------------
// LANCEUR
// ---------------------------------------------------------------------
function runTests(options = {}) {
    // Les IIFE de test se sont déjà exécutées au chargement de ce fichier
    // (elles sont auto-invoquées). Leurs résultats sont déjà présents dans
    // _testResults : on ne fait ici que mesurer le temps de formatage et
    // afficher le rapport. On ne vide PAS _testResults, sinon tous les
    // résultats accumulés par les IIFE seraient perdus.
    const t0 = performance.now();

    const durationMs = Math.round(performance.now() - t0);
    const total = _testResults.length;
    const passed = _testResults.filter(r => r.passed).length;
    const failed = total - passed;

    // Résumé console
    console.log(`%c[Tests] ${passed}/${total} réussis en ${durationMs} ms`,
        `color: ${failed > 0 ? '#ef4444' : '#10b981'}; font-weight: bold;`);

    if (failed > 0) {
        console.group('%cÉchecs :', 'color: #ef4444; font-weight: bold;');
        _testResults.filter(r => !r.passed).forEach(r => {
            console.log(`❌ [${r.suite}] ${r.name} — ${r.details}`);
        });
        console.groupEnd();
    }

    // Table console
    try { console.table(_testResults.map(r => ({
        Suite: r.suite,
        Test: r.name,
        Statut: r.passed ? '✅' : '❌',
        Détails: r.details || '—'
    }))); } catch (_) {}

    // Toast informatif
    if (typeof toastSuccess === 'function' && typeof toastError === 'function') {
        if (failed === 0) {
            toastSuccess(`${passed}/${total} tests réussis`, `Durée : ${durationMs} ms`);
        } else {
            toastError(`${failed} test(s) en échec`, `${passed}/${total} réussis · voir console`);
        }
    }

    return {
        total, passed, failed, durationMs,
        results: _testResults.slice()
    };
}

// Regroupe tous les tests pour permettre la ré-exécution


// Expose l'API globalement
window.runTests = runTests;

// Log discret au chargement : indique comment lancer les tests
console.info('%c[Tests] Module chargé — lancez les tests avec runTests() ou Ctrl+K → « Lancer les tests »',
    'color: #8b5cf6;');