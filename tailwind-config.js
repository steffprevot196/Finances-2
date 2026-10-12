// =====================================================================
// tailwind-config.js — Configuration Tailwind externalisée
// ---------------------------------------------------------------------
// Ce fichier remplace le <script> inline qui était dans index.html.
// Raison : la CSP a été durcie (retrait de 'unsafe-inline' de script-src),
// ce qui bloque les scripts inline. On externalise donc la config ici.
//
// ⚠ Doit être chargé APRÈS le script Tailwind CDN et AVANT tout autre
//   script qui dépend des classes Tailwind.
// =====================================================================

tailwind.config = {
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                darkBg:       '#0b0f19',
                cardBg:       '#111827',
                cardBorder:   '#1f2937',
                accentGreen:  '#10b981',
                accentBlue:   '#3b82f6',
                accentPurple: '#8b5cf6',
                accentAmber:  '#f59e0b',
                accentRed:    '#ef4444'
            }
        }
    }
};