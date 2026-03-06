/**
 * StorageManager with AES-GCM Encrypted Storage for sensitive data.
 *
 * Architecture:
 * - Non-sensitive data (settings, theme, cache): plaintext localStorage (getLocal/setLocal)
 * - Sensitive data (accounts, keys): AES-GCM encrypted localStorage (encryptAndStore/decryptAndRetrieve)
 * - Password verification: PBKDF2 hash stored, plaintext NEVER stored
 * - Decrypted keys exist ONLY in memory during active session
 *
 * Crypto flow:
 *   password → PBKDF2 (100k iterations, SHA-256) → AES-GCM key
 *   AES-GCM key + random IV → encrypt(JSON) → base64 ciphertext stored in localStorage
 */

// --- Crypto Helpers (Web Crypto API) ---

const PBKDF2_ITERATIONS = 100_000;
const SALT_KEY = "arfhe_salt";
const PASS_HASH_KEY = "arfhe_pass_hash";

/** Generate a random salt (16 bytes) */
function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

/** Generate a random IV for AES-GCM (12 bytes) */
function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(12));
}

/** Derive an AES-GCM CryptoKey from a password + salt using PBKDF2 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Hash a password for verification (NOT for encryption — separate purpose) */
async function hashPassword(password: string, salt: Uint8Array): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  return arrayBufferToBase64(bits as ArrayBuffer);
}

/** AES-GCM encrypt */
async function aesEncrypt(key: CryptoKey, plaintext: string): Promise<string> {
  const encoder = new TextEncoder();
  const iv = generateIV();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    encoder.encode(plaintext)
  );

  // Prepend IV (12 bytes) to ciphertext for storage
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return arrayBufferToBase64(combined.buffer as ArrayBuffer);
}

/** AES-GCM decrypt */
async function aesDecrypt(key: CryptoKey, encryptedBase64: string): Promise<string> {
  const combined = base64ToUint8Array(encryptedBase64);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plainBuffer);
}

/** Uint8Array / ArrayBuffer → base64 */
function arrayBufferToBase64(buffer: ArrayBuffer | ArrayBufferLike): string {
  const bytes = new Uint8Array(buffer as ArrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** base64 → Uint8Array */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}


// --- StorageManager ---

class StorageManager {
  /** In-memory AES key — only exists while wallet is unlocked */
  private _cryptoKey: CryptoKey | null = null;

  /**
   * Retrieves a value from local storage by key (plaintext — non-sensitive)
   */
  getLocal<T>(key: string): T | null {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Error getting local storage item for key "${key}":`, error);
      return null;
    }
  }

  /**
   * Retrieves a value from session storage by key
   */
  getSession<T>(key: string): T | null {
    try {
      const value = sessionStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Error getting session storage item for key "${key}":`, error);
      return null;
    }
  }

  /**
   * Sets a value in local storage (plaintext — non-sensitive)
   */
  setLocal<T>(key: string, value: T): boolean {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Error setting local storage item for key "${key}":`, error);
      return false;
    }
  }

  /**
   * Sets a value in session storage
   */
  setSession<T>(key: string, value: T): boolean {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Error setting session storage item for key "${key}":`, error);
      return false;
    }
  }

  /**
   * Removes a value from local storage
   */
  removeLocal(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Error removing local storage item for key "${key}":`, error);
    }
  }

  /**
   * Removes a value from session storage
   */
  removeSession(key: string): void {
    try {
      sessionStorage.removeItem(key);
    } catch (error) {
      console.error(`Error removing session storage item for key "${key}":`, error);
    }
  }

  // ============================
  // Encrypted Storage Methods
  // ============================

  /**
   * Initialize encryption with a password.
   * - First time: generates salt, stores password hash, derives AES key
   * - Subsequent: loads salt, verifies password, derives AES key
   * @returns true if password is correct (or newly set), false if wrong password
   */
  async initEncryption(password: string): Promise<boolean> {
    try {
      const existingSaltB64 = localStorage.getItem(SALT_KEY);

      if (existingSaltB64) {
        // Existing wallet — verify password
        const salt = base64ToUint8Array(existingSaltB64);
        const expectedHash = localStorage.getItem(PASS_HASH_KEY);
        const actualHash = await hashPassword(password, salt);

        if (actualHash !== expectedHash) {
          console.warn("[StorageManager] ❌ Incorrect password");
          return false;
        }

        // Password correct — derive key
        this._cryptoKey = await deriveKey(password, salt);
        console.log("[StorageManager] 🔓 Encryption initialized (existing wallet)");
        return true;
      } else {
        // New wallet — create salt and store hash
        const salt = generateSalt();
        const saltB64 = arrayBufferToBase64(salt.buffer as ArrayBuffer);
        localStorage.setItem(SALT_KEY, saltB64);

        const passHash = await hashPassword(password, salt);
        localStorage.setItem(PASS_HASH_KEY, passHash);

        this._cryptoKey = await deriveKey(password, salt);
        console.log("[StorageManager] 🔐 Encryption initialized (new wallet)");
        return true;
      }
    } catch (error) {
      console.error("[StorageManager] Encryption init failed:", error);
      return false;
    }
  }

  /**
   * Check if a password has been set (salt exists in storage)
   */
  hasPassword(): boolean {
    return localStorage.getItem(SALT_KEY) !== null && localStorage.getItem(PASS_HASH_KEY) !== null;
  }

  /**
   * Check if encryption is currently unlocked (key in memory)
   */
  isUnlocked(): boolean {
    return this._cryptoKey !== null;
  }

  /**
   * Lock the wallet: clear the AES key from memory
   */
  lock(): void {
    this._cryptoKey = null;
    console.log("[StorageManager] 🔒 Wallet locked — encryption key cleared from memory");
  }

  /**
   * Change password: re-encrypt all sensitive data with new password
   */
  async changePassword(oldPassword: string, newPassword: string): Promise<boolean> {
    // Verify old password first
    const existingSaltB64 = localStorage.getItem(SALT_KEY);
    if (!existingSaltB64) return false;

    const oldSalt = base64ToUint8Array(existingSaltB64);
    const expectedHash = localStorage.getItem(PASS_HASH_KEY);
    const actualHash = await hashPassword(oldPassword, oldSalt);
    if (actualHash !== expectedHash) return false;

    // Decrypt with old key
    const oldKey = await deriveKey(oldPassword, oldSalt);
    const sensitiveKeys = this.getSensitiveKeys();
    const decryptedData: Record<string, any> = {};

    for (const key of sensitiveKeys) {
      const encrypted = localStorage.getItem(`enc_${key}`);
      if (encrypted) {
        try {
          const plaintext = await aesDecrypt(oldKey, encrypted);
          decryptedData[key] = JSON.parse(plaintext);
        } catch (e) {
          console.error(`[StorageManager] Failed to decrypt ${key} during password change:`, e);
        }
      }
    }

    // Generate new salt and re-encrypt
    const newSalt = generateSalt();
    const newSaltB64 = arrayBufferToBase64(newSalt.buffer as ArrayBuffer);
    localStorage.setItem(SALT_KEY, newSaltB64);

    const newPassHash = await hashPassword(newPassword, newSalt);
    localStorage.setItem(PASS_HASH_KEY, newPassHash);

    const newKey = await deriveKey(newPassword, newSalt);
    this._cryptoKey = newKey;

    for (const [key, value] of Object.entries(decryptedData)) {
      const encrypted = await aesEncrypt(newKey, JSON.stringify(value));
      localStorage.setItem(`enc_${key}`, encrypted);
    }

    console.log("[StorageManager] 🔑 Password changed — all sensitive data re-encrypted");
    return true;
  }

  /**
   * Encrypt and store sensitive data.
   * Requires initEncryption() to have been called first.
   */
  async encryptAndStore<T>(key: string, value: T): Promise<boolean> {
    if (!this._cryptoKey) {
      console.error("[StorageManager] Cannot encrypt: wallet is locked (no key in memory)");
      return false;
    }

    try {
      const plaintext = JSON.stringify(value);
      const encrypted = await aesEncrypt(this._cryptoKey, plaintext);
      localStorage.setItem(`enc_${key}`, encrypted);

      // Track which keys are encrypted
      const tracked = this.getSensitiveKeys();
      if (!tracked.includes(key)) {
        tracked.push(key);
        localStorage.setItem("arfhe_enc_keys", JSON.stringify(tracked));
      }

      return true;
    } catch (error) {
      console.error(`[StorageManager] Encrypt failed for "${key}":`, error);
      return false;
    }
  }

  /**
   * Decrypt and retrieve sensitive data.
   * Requires initEncryption() to have been called first.
   */
  async decryptAndRetrieve<T>(key: string): Promise<T | null> {
    if (!this._cryptoKey) {
      console.error("[StorageManager] Cannot decrypt: wallet is locked (no key in memory)");
      return null;
    }

    try {
      const encrypted = localStorage.getItem(`enc_${key}`);
      if (!encrypted) return null;

      const plaintext = await aesDecrypt(this._cryptoKey, encrypted);
      return JSON.parse(plaintext) as T;
    } catch (error) {
      console.error(`[StorageManager] Decrypt failed for "${key}":`, error);
      return null;
    }
  }

  /**
   * Remove encrypted data
   */
  removeEncrypted(key: string): void {
    localStorage.removeItem(`enc_${key}`);
    const tracked = this.getSensitiveKeys();
    const updated = tracked.filter(k => k !== key);
    localStorage.setItem("arfhe_enc_keys", JSON.stringify(updated));
  }

  /**
   * Get list of keys that are stored encrypted
   */
  private getSensitiveKeys(): string[] {
    try {
      const raw = localStorage.getItem("arfhe_enc_keys");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /**
   * Migration helper: Check if unencrypted accounts exist and need migration.
   * Called once during the first login after the encryption update.
   */
  hasUnencryptedAccounts(): boolean {
    try {
      const raw = localStorage.getItem("accounts");
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Migrate plaintext accounts to encrypted storage.
   * Requires initEncryption() to have been called first.
   */
  async migrateToEncrypted(): Promise<boolean> {
    if (!this._cryptoKey) return false;

    try {
      // Read plaintext accounts
      const raw = localStorage.getItem("accounts");
      if (!raw) return false;
      const accounts = JSON.parse(raw);

      // Read plaintext active index
      const activeRaw = localStorage.getItem("active");
      const active = activeRaw ? JSON.parse(activeRaw) : -1;

      // Store encrypted
      await this.encryptAndStore("accounts", accounts);
      await this.encryptAndStore("active", active);

      // Remove plaintext originals
      localStorage.removeItem("accounts");
      localStorage.removeItem("active");

      // Remove plaintext password (replaced by PBKDF2 hash)
      localStorage.removeItem("passwd");

      console.log("[StorageManager] ✅ Migration complete — plaintext keys removed");
      return true;
    } catch (error) {
      console.error("[StorageManager] Migration failed:", error);
      return false;
    }
  }
}

export default StorageManager;