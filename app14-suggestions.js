// =====================================================================
// app14-suggestions.js — SUGGESTIONS INTELLIGENTES (Chantier L)
// Dépend de : app1-core.js, app5-fiscal.js, app10-tir.js, app11-scoring.js
// Charge après app13-excel-export.js, avant app7-init.js
// =====================================================================

// ---------------------------------------------------------------------
// RÈGLES D'ANALYSE
// Chaque règle retourne null (non applicable) ou un objet :
//   { severity, icon, title, description, action? }
//   severity ∈ {'danger', 'warning', 'info', 'success'}
// ---------------------------------------------------------------------
function _suggestionsRules() {
    const list = assets.filter(a => !isPaperAsset(a));
    const totalValue = list.reduce((s, a) => s + (a.value || 0), 0);
    const totalInvested = list.reduce((s, a) => s + (a.invested || 0), 0);
    const totalFrais = list.reduce((s, a) => s + (a.frais || 0), 0);
    const rules = [];

    if (!list.length) {
        rules.push({
            severity: 'info', icon: 'fa-seedling',
            title: 'Portefeuille vide',
            description: 'Ajoutez vos premiers actifs pour activer les suggestions intelligentes.'
        });
        return rules;
    }

    // 1) Concentration HHI
    let hhi = 0;
    list.forEach(a => {
        const w = totalValue > 0 ? (a.value || 0) / totalValue : 0;
        hhi += w * w;
    });
    hhi *= 10000;
    if (hhi >= 2500) {
        rules.push({
            severity: 'warning', icon: 'fa-chart-pie',
            title: 'Portefeuille très concentré',
            description: `Votre HHI est de ${Math.round(hhi)} (>2500). Répartir davantage vos lignes réduirait le risque spécifique sans forcément baisser le rendement attendu.`
        });
    } else if (hhi > 0 && hhi < 1500 && list.length >= 8) {
        rules.push({
            severity: 'success', icon: 'fa-shield-halved',
            title: 'Bonne diversification',
            description: `HHI de ${Math.round(hhi)} — votre portefeuille est bien réparti sur ${list.length} lignes.`
        });
    }

    // 2) Poids max actif > 35 %
    if (totalValue > 0) {
        const top = list.reduce((m, a) => (a.value > (m.value || 0) ? a : m), { value: 0 });
        const topPct = (top.value || 0) / totalValue * 100;
        if (topPct >= 35) {
            rules.push({
                severity: 'warning', icon: 'fa-triangle-exclamation',
                title: `« ${top.name} » pèse ${topPct.toFixed(0)} %`,
                description: 'Au-delà de 35 %, le sort du portefeuille dépend fortement d\'un seul actif. Envisagez un allègement partiel ou un renforcement des autres lignes.'
            });
        }
    }

    // 3) Frais relatifs élevés
    if (totalInvested > 0) {
        const fraisPct = totalFrais / totalInvested * 100;
        if (fraisPct > 1.5) {
            rules.push({
                severity: 'warning', icon: 'fa-receipt',
                title: `Frais cumulés : ${fraisPct.toFixed(2)} % du capital`,
                description: 'Vos frais pèsent plus de 1,5 % du capital investi. Comparez vos courtiers : certains appliquent 0 % de commission sur les ETF.'
            });
        } else if (fraisPct > 0 && fraisPct < 0.3 && totalInvested > 5000) {
            rules.push({
                severity: 'success', icon: 'fa-thumbs-up',
                title: 'Frais maîtrisés',
                description: `Seulement ${fraisPct.toFixed(2)} % de frais sur votre capital investi.`
            });
        }
    }

    // 4) Cash dormant > 20 %
    const cash = list.filter(a => hasTag(a, 'Devises/Liquidités') || (a.categories || []).includes('Cash'))
                     .reduce((s, a) => s + (a.value || 0), 0);
    if (totalValue > 0 && cash / totalValue > 0.20) {
        rules.push({
            severity: 'info', icon: 'fa-coins',
            title: `Cash dormant : ${(cash / totalValue * 100).toFixed(0)} % du portefeuille`,
            description: 'Un excédent de liquidités peut être investi progressivement (DCA) pour lisser le point d\'entrée. À ajuster selon votre horizon.'
        });
    }

    // 5) Exposition Crypto
    const crypto = list.filter(a => hasTag(a, 'Crypto')).reduce((s, a) => s + (a.value || 0), 0);
    if (totalValue > 0) {
        const pct = crypto / totalValue * 100;
        if (pct > 25) {
            rules.push({
                severity: 'warning', icon: 'fa-bitcoin',
                title: `Crypto : ${pct.toFixed(0)} % du portefeuille`,
                description: 'Une exposition crypto supérieure à 25 % introduit une volatilité importante. Vérifiez votre tolérance au risque.'
            });
        } else if (pct > 5 && pct < 15) {
            rules.push({
                severity: 'info', icon: 'fa-bitcoin',
                title: `Crypto : ${pct.toFixed(0)} %`,
                description: 'Position crypto modérée — cohérente avec une poche de diversification classique.'
            });
        }
    }

    // 6) Poche Or
    const gold = list.filter(a => hasTag(a, 'Or & Métaux')).reduce((s, a) => s + (a.value || 0), 0);
    if (totalValue > 0) {
        const pct = gold / totalValue * 100;
        if (pct < 10 && totalValue > 10000) {
            rules.push({
                severity: 'info', icon: 'fa-coins',
                title: 'Or sous-représenté',
                description: `Or à ${pct.toFixed(0)} % — historiquement utilisé comme protection contre l'inflation. Une poche 10-15 % est fréquente chez les investisseurs prudents.`
            });
        }
    }

    // 7) Nombre de lignes
    if (list.length >= 40) {
        rules.push({
            severity: 'info', icon: 'fa-layer-group',
            title: `${list.length} lignes — portefeuille dense`,
            description: 'Au-delà de 40 lignes, le suivi devient complexe. Envisagez de fusionner ou purger les petites positions (<0,5 % du portefeuille).'
        });
    } else if (list.length > 0 && list.length < 4 && totalValue > 5000) {
        rules.push({
            severity: 'warning', icon: 'fa-layer-group',
            title: `Seulement ${list.length} ligne(s)`,
            description: 'Pour lisser la performance, viser 8-15 lignes diversifiées est souvent recommandé.'
        });
    }

    // 8) Petites positions (< 1 % du portefeuille)
    if (totalValue > 0 && list.length >= 10) {
        const small = list.filter(a => (a.value || 0) / totalValue < 0.005);
        if (small.length >= 3) {
            rules.push({
                severity: 'info', icon: 'fa-broom',
                title: `${small.length} position(s) < 0,5 %`,
                description: 'Les micro-positions génèrent du bruit et des frais. Envisagez de les regrouper ou de les purger (sans impact fiscal si MV).'
            });
        }
    }

    // 9) Lots en forte moins-value latente
    let losingLots = 0;
    let worstLotPct = 0;
    let worstLotAsset = null;
    list.forEach(a => {
        const enriched = (typeof _enrichLotsForAsset === 'function') ? _enrichLotsForAsset(a) : null;
        if (!enriched) return;
        enriched.lots.forEach(l => {
            if (l._isSold) return;
            if (l._pnlPct < -20) {
                losingLots++;
                if (l._pnlPct < worstLotPct) {
                    worstLotPct = l._pnlPct;
                    worstLotAsset = a;
                }
            }
        });
    });
    if (losingLots > 0 && worstLotAsset) {
        rules.push({
            severity: 'info', icon: 'fa-arrow-trend-down',
            title: `${losingLots} lot(s) en MV latente ≥ 20 %`,
            description: `Le lot le plus en difficulté porte sur ${worstLotAsset.name} (${worstLotPct.toFixed(0)} %). Vérifiez votre thèse d'investissement — ou utilisez la MV comme opportunité de compensation fiscale.`
        });
    }

    // 10) Plus-values latentes importantes
    const totalPnl = totalValue - totalInvested;
    if (totalPnl > 0 && totalInvested > 0 && totalPnl / totalInvested > 0.30 && taxRegimeMode === 'PFU') {
        rules.push({
            severity: 'info', icon: 'fa-scale-balanced',
            title: `PV latentes : +${(totalPnl / totalInvested * 100).toFixed(0)} %`,
            description: 'Une part importante de vos gains n\'est pas encore réalisée. Tester le régime Barème peut parfois être plus avantageux (voir onglet Fiscalité).'
        });
    }

    // 11) Probabilité objectif < 50 % (si objectifs définis)
    try {
        const goals = (typeof loadGoalsFromStorage === 'function') ? loadGoalsFromStorage() : [];
        if (goals.length && typeof runGoalMonteCarlo === 'function') {
            const risky = goals
                .map(g => ({ g, mc: runGoalMonteCarlo(g, 500) }))
                .filter(x => x.mc.successProb < 0.5);
            if (risky.length) {
                rules.push({
                    severity: 'warning', icon: 'fa-bullseye',
                    title: `${risky.length} objectif(s) en risque`,
                    description: `« ${risky[0].g.name} » a moins de 50 % de probabilité d'atteinte au rythme actuel. Ajustez l'épargne ou l'horizon.`
                });
            }
        }
    } catch (_) {}

    // 12) Aucune alerte configurée
    try {
        const alerts = (typeof loadAlertsFromStorage === 'function') ? loadAlertsFromStorage() : [];
        if (alerts.length === 0 && totalValue > 10000) {
            rules.push({
                severity: 'info', icon: 'fa-bell',
                title: 'Aucune alerte configurée',
                description: 'Définissez au moins une alerte (cours cible, P&L jour, concentration…) pour être notifié automatiquement.'
            });
        }
    } catch (_) {}

    // Trie par sévérité : danger > warning > info > success
    const order = { danger: 0, warning: 1, info: 2, success: 3 };
    rules.sort((a, b) => (order[a.severity] ?? 99) - (order[b.severity] ?? 99));

    return rules;
}

// ---------------------------------------------------------------------
// RENDU DES CARTES DE SUGGESTIONS
// ---------------------------------------------------------------------
const _SUGGESTIONS_STYLE = {
    danger:  { bg: 'bg-rose-950/30',    bd: 'border-rose-800/50',    fg: 'text-rose-300',    accent: 'bg-rose-500' },
    warning: { bg: 'bg-amber-950/30',   bd: 'border-amber-800/50',   fg: 'text-amber-300',   accent: 'bg-amber-500' },
    info:    { bg: 'bg-blue-950/30',    bd: 'border-blue-800/50',    fg: 'text-blue-300',    accent: 'bg-blue-500' },
    success: { bg: 'bg-emerald-950/30', bd: 'border-emerald-800/50', fg: 'text-emerald-300', accent: 'bg-emerald-500' }
};

function renderSuggestions() {
    const grid = document.getElementById('suggestions-grid');
    if (!grid) return;

    const rules = _suggestionsRules();

    if (!rules.length) {
        grid.innerHTML = `<div class="col-span-full bg-gray-950 border border-dashed border-gray-700 rounded-xl p-6 text-center text-xs text-gray-500">
            <i class="fa-solid fa-circle-check text-emerald-500/50 text-2xl mb-2 block"></i>
            Aucune suggestion — votre portefeuille est équilibré au regard des critères actuels.
        </div>`;
        return;
    }

    grid.innerHTML = rules.map(r => {
        const s = _SUGGESTIONS_STYLE[r.severity] || _SUGGESTIONS_STYLE.info;
        return `
            <div class="${s.bg} ${s.bd} border rounded-xl p-3 flex flex-col gap-2 relative overflow-hidden">
                <div class="absolute left-0 top-0 bottom-0 w-1 ${s.accent}"></div>
                <div class="flex items-start gap-2 pl-1">
                    <div class="flex-shrink-0 w-7 h-7 rounded-lg ${s.bg} border ${s.bd} flex items-center justify-center ${s.fg}">
                        <i class="fa-solid ${r.icon} text-[12px]"></i>
                    </div>
                    <div class="min-w-0 flex-1">
                        <div class="text-[12px] font-bold text-white leading-snug">${escapeHTML(r.title)}</div>
                        <div class="text-[11px] text-gray-400 mt-1 leading-relaxed">${escapeHTML(r.description)}</div>
                    </div>
                </div>
            </div>`;
    }).join('');
}

function refreshSuggestions() {
    renderSuggestions();
}