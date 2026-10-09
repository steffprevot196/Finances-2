/**
 * Assainit les données pour prévenir l'injection de formules Excel / CSV.
 */
const DataSanitizer = {
    sanitizeCell(value) {
        if (typeof value !== 'string') return value;
        const trimmed = value.trim();
        if (/^[=+@\-].*/.test(trimmed)) {
            return `'${trimmed}`;
        }
        return trimmed;
    },

    sanitizeObject(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        const cleaned = {};
        for (const [key, val] of Object.entries(obj)) {
            cleaned[key] = typeof val === 'string' ? this.sanitizeCell(val) : val;
        }
        return cleaned;
    }
};