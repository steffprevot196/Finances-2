/**
 * Utilitaire de chiffrement / déchiffrement local via Web Crypto API (AES-GCM).
 */
const CryptoStorage = {
    async deriveKey(passphrase, salt) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            enc.encode(passphrase),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    },

    async encryptData(data, passphrase) {
        const enc = new TextEncoder();
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await this.deriveKey(passphrase, salt);

        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            enc.encode(JSON.stringify(data))
        );

        return {
            cipherText: Array.from(new Uint8Array(encrypted)),
            salt: Array.from(salt),
            iv: Array.from(iv)
        };
    },

    async decryptData(encryptedPayload, passphrase) {
        const dec = new TextDecoder();
        const salt = new Uint8Array(encryptedPayload.salt);
        const iv = new Uint8Array(encryptedPayload.iv);
        const key = await this.deriveKey(passphrase, salt);

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            new Uint8Array(encryptedPayload.cipherText)
        );

        return JSON.parse(dec.decode(decrypted));
    }
};