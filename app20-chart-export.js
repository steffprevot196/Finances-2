// =====================================================================
// app20-chart-export.js — EXPORT PNG DES GRAPHIQUES (Chantier 2.5)
// Dépend de : app1-core.js (debounce)
// Charge après app19-fire.js, avant app7-init.js
// =====================================================================
//
// Ajoute automatiquement un petit bouton 📷 en haut à droite de chaque
// canvas Chart.js, visible au survol de la souris. Clic → téléchargement
// d'un PNG haute résolution avec un fond adapté au thème courant.
//
// Le fond est composé sur un canvas temporaire (Chart.js laisse le canvas
// transparent par défaut, ce qui donne des PNG illisibles sur fond blanc).

// ---------------------------------------------------------------------
// EXPORT D'UN CANVAS EN PNG
// ---------------------------------------------------------------------
// canvasId  : id du <canvas> Chart.js
// filename  : nom de fichier (sans extension) ; un timestamp est ajouté
// opts.title: titre optionnel à dessiner en haut du PNG (pour le partage)
function exportChartAsPNG(canvasId, filename, opts = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !canvas.width || !canvas.height) {
        alert('Graphique indisponible.');
        return;
    }

    try {
        // --- 1) Canvas temporaire aux mêmes dimensions physiques ---
        const temp = document.createElement('canvas');
        const W = canvas.width;
        const H = canvas.height;
        // Zone réservée au titre (0 si pas de titre)
        const titleH = opts.title ? Math.round(40 * (W / 800)) : 0;
        temp.width = W;
        temp.height = H + titleH;
        const ctx = temp.getContext('2d');

        // --- 2) Fond opaque selon le thème effectif ---
        const isLight = document.body.classList.contains('light');
        ctx.fillStyle = isLight ? '#ffffff' : '#0f1520';
        ctx.fillRect(0, 0, temp.width, temp.height);

        // --- 3) Titre optionnel ---
        if (opts.title) {
            ctx.fillStyle = isLight ? '#0f172a' : '#f1f5f9';
            const fontSize = Math.round(20 * (W / 800));
            ctx.font = `bold ${fontSize}px 'Inter', system-ui, sans-serif`;
            ctx.textBaseline = 'middle';
            ctx.fillText(opts.title, Math.round(20 * (W / 800)), titleH / 2);
        }

        // --- 4) Dessin du graphique par-dessus ---
        ctx.drawImage(canvas, 0, titleH);

        // --- 5) Pied de page discret (signature PatriMonial) ---
        if (opts.signature !== false) {
            const footerH = Math.round(24 * (W / 800));
            ctx.fillStyle = isLight ? '#f3f4f6' : '#070b13';
            ctx.fillRect(0, temp.height, temp.width, footerH);
            ctx.fillStyle = isLight ? '#6b7280' : '#64748b';
            const fontSize = Math.round(11 * (W / 800));
            ctx.font = `${fontSize}px 'Inter', system-ui, sans-serif`;
            ctx.textBaseline = 'middle';
            const txt = `PatriMonial · ${new Date().toLocaleDateString('fr-FR')}`;
            ctx.fillText(txt, Math.round(20 * (W / 800)), temp.height + footerH / 2);
        }

        // --- 6) Téléchargement ---
        const url = temp.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        const safeName = (filename || 'graphique').replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
        a.download = `${safeName}_${new Date().toISOString().slice(0, 10)}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        if (typeof showUndoToast === 'function') {
            showUndoToast('Graphique exporté en PNG', false);
        }
    } catch (err) {
        console.error('[Chart Export] Échec :', err);
        alert('Impossible d\'exporter le graphique : ' + err.message);
    }
}

// ---------------------------------------------------------------------
// ATTACHEMENT AUTOMATIQUE DES BOUTONS D'EXPORT
// ---------------------------------------------------------------------
// Scanne tous les <canvas> d'un scope et leur ajoute un bouton 📷
// positionné en haut à droite, visible uniquement au survol.
//
// Un attribut `data-export-attached` évite de doubler les boutons si la
// fonction est appelée plusieurs fois sur le même canvas.
function attachChartExportButtons(scope) {
    const root = scope || document;
    const canvases = root.querySelectorAll('canvas:not([data-export-attached])');

    canvases.forEach(canvas => {
        // Ignore les tout petits canvas (sparklines, mini-indicateurs…)
        if (canvas.width < 120 || canvas.height < 80) {
            canvas.dataset.exportAttached = 'skip';
            return;
        }

        // Le parent doit être positionné en relatif pour ancrer le bouton
        const parent = canvas.parentElement;
        if (!parent) return;
        if (!parent.classList.contains('relative')) {
            parent.classList.add('relative');
        }
        parent.classList.add('group');

        canvas.dataset.exportAttached = '1';

        // Nom du fichier dérivé de l'id du canvas
        const canvasId = canvas.id || 'chart';
        const label = canvasId
            .replace(/Chart$/, '')
            .replace(/([A-Z])/g, '-$1')
            .toLowerCase()
            .replace(/^-/, '')
            || 'graphique';

        // Titre optionnel à graver dans le PNG : on récupère le premier
        // <h3> ou <div> de titre trouvé dans les ancêtres proches du canvas.
        const findTitle = () => {
            let p = parent;
            for (let i = 0; i < 4 && p; i++) {
                const h = p.querySelector('h1, h2, h3, h4');
                if (h) {
                    const t = (h.textContent || '').replace(/\s+/g, ' ').trim();
                    if (t) return t;
                }
                p = p.parentElement;
            }
            return '';
        };

        // Création du bouton
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Exporter ce graphique en PNG');
        btn.className = 'absolute top-2 right-2 z-10 w-8 h-8 rounded-lg bg-gray-900/80 text-gray-300 border border-gray-700 hover:bg-gray-800 hover:text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition flex items-center justify-center shadow-lg';
        btn.title = 'Exporter en PNG';
        btn.innerHTML = '<i class="fa-solid fa-camera text-[11px]"></i>';

        // Empêche la propagation pour ne pas déclencher un onclick du parent
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            exportChartAsPNG(canvas.id, label, { title: findTitle() });
        });

        parent.appendChild(btn);
    });
}

// ---------------------------------------------------------------------
// OBSERVATION DES MUTATIONS DOM
// ---------------------------------------------------------------------
// Chart.js détruit et recrée les graphiques dans certaines situations
// (changement d'onglet, re-render). Un MutationObserver branché sur le
// body permet d'attacher les boutons aux nouveaux canvas sans avoir à
// toucher aux fonctions de rendu existantes.
let _chartExportObserver = null;

function initChartExportModule() {
    // Attache les canvas existants (dashboard si chargé)
    attachChartExportButtons();

    // Écoute les futures insertions de canvas
    if (window.MutationObserver && !_chartExportObserver) {
        const refresh = (typeof debounce === 'function')
            ? debounce(() => attachChartExportButtons(), 350)
            : () => attachChartExportButtons();

        _chartExportObserver = new MutationObserver((mutations) => {
            let hasNewCanvas = false;
            for (const m of mutations) {
                if (m.type !== 'childList') continue;
                for (const node of m.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    if (node.tagName === 'CANVAS' || node.querySelector?.('canvas')) {
                        hasNewCanvas = true;
                        break;
                    }
                }
                if (hasNewCanvas) break;
            }
            if (hasNewCanvas) refresh();
        });
        _chartExportObserver.observe(document.body, { childList: true, subtree: true });
    }
}