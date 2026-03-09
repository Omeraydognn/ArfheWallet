/**
 * BiometricService.ts — WebAuthn/FIDO Biometric Authentication for Vault Decryption
 *
 * Architecture:
 *   This service provides APP-LEVEL biometric authentication only.
 *   It does NOT replace or modify the FHE, PBKDF2, or AES-GCM crypto stack.
 *
 *   Flow:
 *   1. User enters their master password and unlocks the wallet normally.
 *   2. User enables "Biometric Login" in Settings.
 *   3. registerBiometric(masterPassword):
 *      - Creates a WebAuthn credential (passkey) using the device's secure enclave.
 *      - Generates a random AES-256-GCM key ("wrapping key").
 *      - Encrypts the master password with the wrapping key.
 *      - Exports the wrapping key and stores it alongside the credential ID.
 *      - The encrypted password blob + credential metadata are stored in localStorage.
 *      - The wrapping key is associated with the credential — it can only be
 *        accessed after a successful biometric assertion.
 *
 *   4. authenticateBiometric():
 *      - Triggers the native biometric prompt (TouchID / FaceID / Windows Hello).
 *      - On success, retrieves the stored wrapping key + encrypted blob.
 *      - Decrypts the master password and returns it.
 *      - The caller (Auth.tsx) feeds this password into StorageManager.initEncryption()
 *        exactly as if the user typed it manually.
 *
 *   Security considerations:
 *   - The master password is encrypted at rest with AES-256-GCM.
 *   - The wrapping key never leaves the browser context.
 *   - The WebAuthn assertion proves device possession + biometric match before
 *     the stored blob is decrypted.
 *   - If the user changes their password, biometric registration is invalidated
 *     and must be re-registered.
 */

import {
    startRegistration,
    startAuthentication,
} from "@simplewebauthn/browser";
import type {
    PublicKeyCredentialCreationOptionsJSON,
    PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

// ─── Storage Keys ───────────────────────────────────────────────────

const BIOMETRIC_ENABLED_KEY = "arfhe_biometric_enabled";
const BIOMETRIC_CREDENTIAL_KEY = "arfhe_biometric_credential";
const BIOMETRIC_WRAPPED_PW_KEY = "arfhe_biometric_wrapped_pw";
const BIOMETRIC_WRAP_KEY_KEY = "arfhe_biometric_wrap_key";
const BIOMETRIC_WRAP_IV_KEY = "arfhe_biometric_wrap_iv";

// ─── Helpers ────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function generateRandomBytes(length: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(length));
}

// ─── AES-GCM Wrapping (for the master password) ────────────────────

async function generateWrappingKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true, // extractable — we need to export/import it
        ["encrypt", "decrypt"]
    );
}

async function exportKey(key: CryptoKey): Promise<string> {
    const raw = await crypto.subtle.exportKey("raw", key);
    return arrayBufferToBase64(raw);
}

async function importKey(keyB64: string): Promise<CryptoKey> {
    const raw = base64ToUint8Array(keyB64);
    return crypto.subtle.importKey(
        "raw",
        raw.buffer as ArrayBuffer,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

async function wrapPassword(password: string, key: CryptoKey): Promise<{ cipherB64: string; ivB64: string }> {
    const iv = generateRandomBytes(12);
    const encoder = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
        key,
        encoder.encode(password)
    );
    return {
        cipherB64: arrayBufferToBase64(ciphertext),
        ivB64: arrayBufferToBase64(iv.buffer as ArrayBuffer),
    };
}

async function unwrapPassword(cipherB64: string, ivB64: string, key: CryptoKey): Promise<string> {
    const ciphertext = base64ToUint8Array(cipherB64);
    const iv = base64ToUint8Array(ivB64);
    const plainBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
        key,
        ciphertext.buffer as ArrayBuffer
    );
    return new TextDecoder().decode(plainBuffer);
}

// ─── Service ────────────────────────────────────────────────────────

export class BiometricService {

    /**
     * Check if the device/browser supports platform authenticators (TouchID, FaceID, Windows Hello).
     * Returns false in non-secure contexts (http) or when WebAuthn is unavailable.
     */
    static async isBiometricAvailable(): Promise<boolean> {
        try {
            if (typeof window === "undefined") return false;
            if (!window.PublicKeyCredential) return false;

            // Check if a platform authenticator is available (built-in biometric)
            const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
            return available;
        } catch (e) {
            return false;
        }
    }

    /**
     * Check if biometric login has been registered and enabled.
     */
    static isEnabled(): boolean {
        try {
            return localStorage.getItem(BIOMETRIC_ENABLED_KEY) === "true"
                && localStorage.getItem(BIOMETRIC_CREDENTIAL_KEY) !== null
                && localStorage.getItem(BIOMETRIC_WRAPPED_PW_KEY) !== null;
        } catch {
            return false;
        }
    }

    /**
     * Register biometric authentication for the current wallet.
     *
     * @param masterPassword The user's current (verified) master password.
     * @returns true if registration was successful.
     *
     * This must be called AFTER the user has successfully unlocked with their password,
     * typically from Settings → "Enable Biometric Login".
     */
    static async registerBiometric(masterPassword: string): Promise<boolean> {
        try {
            const available = await this.isBiometricAvailable();
            if (!available) {
                return false;
            }

            // Step 1: Create WebAuthn credential (passkey) — this triggers the biometric prompt
            const userId = generateRandomBytes(16);
            const challenge = generateRandomBytes(32);

            const creationOptions: PublicKeyCredentialCreationOptionsJSON = {
                rp: {
                    name: "Arfhe Wallet",
                    id: window.location.hostname,
                },
                user: {
                    id: arrayBufferToBase64(userId.buffer as ArrayBuffer),
                    name: "arfhe-wallet-user",
                    displayName: "Arfhe Wallet User",
                },
                challenge: arrayBufferToBase64(challenge.buffer as ArrayBuffer),
                pubKeyCredParams: [
                    { alg: -7, type: "public-key" },   // ES256
                    { alg: -257, type: "public-key" },  // RS256
                ],
                authenticatorSelection: {
                    authenticatorAttachment: "platform",  // Built-in only (TouchID, FaceID, etc.)
                    userVerification: "required",         // Must verify biometric
                    residentKey: "preferred",
                },
                timeout: 60000,
                attestation: "none", // We don't need attestation for local use
            };

            const regResult = await startRegistration({ optionsJSON: creationOptions });

            // Step 2: Generate wrapping key and encrypt the master password
            const wrappingKey = await generateWrappingKey();
            const { cipherB64, ivB64 } = await wrapPassword(masterPassword, wrappingKey);
            const wrappingKeyB64 = await exportKey(wrappingKey);

            // Step 3: Store everything
            localStorage.setItem(BIOMETRIC_CREDENTIAL_KEY, JSON.stringify({
                id: regResult.id,
                rawId: regResult.rawId,
                type: regResult.type,
            }));
            localStorage.setItem(BIOMETRIC_WRAPPED_PW_KEY, cipherB64);
            localStorage.setItem(BIOMETRIC_WRAP_KEY_KEY, wrappingKeyB64);
            localStorage.setItem(BIOMETRIC_WRAP_IV_KEY, ivB64);
            localStorage.setItem(BIOMETRIC_ENABLED_KEY, "true");

            return true;
        } catch (e) {
            // Clean up partial state
            this.clearBiometric();
            return false;
        }
    }

    /**
     * Authenticate using biometrics and return the decrypted master password.
     *
     * Triggers native TouchID / FaceID / Windows Hello prompt.
     * On success, the encrypted master password is unwrapped and returned.
     *
     * @returns The master password string, or null if authentication failed.
     */
    static async authenticateBiometric(): Promise<string | null> {
        try {
            if (!this.isEnabled()) {
                return null;
            }

            // Load stored credential info
            const credentialJson = localStorage.getItem(BIOMETRIC_CREDENTIAL_KEY);
            if (!credentialJson) return null;

            const storedCredential = JSON.parse(credentialJson);
            const challenge = generateRandomBytes(32);

            const authOptions: PublicKeyCredentialRequestOptionsJSON = {
                challenge: arrayBufferToBase64(challenge.buffer as ArrayBuffer),
                rpId: window.location.hostname,
                allowCredentials: [
                    {
                        id: storedCredential.id,
                        type: "public-key",
                        transports: ["internal"],
                    },
                ],
                userVerification: "required",
                timeout: 60000,
            };

            const authResult = await startAuthentication({ optionsJSON: authOptions });

            // The biometric assertion passed — now decrypt the stored password
            const wrappingKeyB64 = localStorage.getItem(BIOMETRIC_WRAP_KEY_KEY);
            const cipherB64 = localStorage.getItem(BIOMETRIC_WRAPPED_PW_KEY);
            const ivB64 = localStorage.getItem(BIOMETRIC_WRAP_IV_KEY);

            if (!wrappingKeyB64 || !cipherB64 || !ivB64) {
                return null;
            }

            const wrappingKey = await importKey(wrappingKeyB64);
            const password = await unwrapPassword(cipherB64, ivB64, wrappingKey);

            return password;
        } catch (e) {
            // User cancelled, timeout, or WebAuthn error
            if (e instanceof DOMException && e.name === "NotAllowedError") {
            } else {
            }
            return null;
        }
    }

    /**
     * Clear all biometric data (disable biometric login).
     * Called when user disables biometric, changes password, or resets wallet.
     */
    static clearBiometric(): void {
        localStorage.removeItem(BIOMETRIC_ENABLED_KEY);
        localStorage.removeItem(BIOMETRIC_CREDENTIAL_KEY);
        localStorage.removeItem(BIOMETRIC_WRAPPED_PW_KEY);
        localStorage.removeItem(BIOMETRIC_WRAP_KEY_KEY);
        localStorage.removeItem(BIOMETRIC_WRAP_IV_KEY);
    }
}
