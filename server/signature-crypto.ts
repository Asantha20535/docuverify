import crypto from "crypto";

// Encryption configuration
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 16 bytes for AES
const SALT_LENGTH = 64; // 64 bytes for salt
const TAG_LENGTH = 16; // 16 bytes for GCM auth tag
const KEY_LENGTH = 32; // 32 bytes for AES-256
const ITERATIONS = 100000; // PBKDF2 iterations

// Prefix to identify encrypted signatures
const ENCRYPTED_PREFIX = "encrypted:";

/**
 * Get or generate encryption key from environment variable
 * 
 * To generate a secure key for production:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 * 
 * Set it in your .env file as:
 *   SIGNATURE_ENCRYPTION_KEY=your-generated-hex-key-here
 * 
 * In production, this MUST be set as an environment variable.
 * The key should be a 64-character hex string (32 bytes).
 */
function getEncryptionKey(): Buffer {
  const keyFromEnv = process.env.SIGNATURE_ENCRYPTION_KEY;
  
  if (!keyFromEnv) {
    // Generate a key if not set (for development only)
    // In production, this should always be set via environment variable
    console.warn("⚠️  SIGNATURE_ENCRYPTION_KEY not set. Using a default key (NOT SECURE FOR PRODUCTION)");
    console.warn("⚠️  Generate a key with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
    // Use a default key derived from a fixed string (only for development)
    return crypto.pbkdf2Sync("default-dev-key-change-in-production", "salt", ITERATIONS, KEY_LENGTH, "sha256");
  }
  
  // If key is provided as hex string (64 chars = 32 bytes), convert it
  if (keyFromEnv.length === 64 && /^[0-9a-fA-F]+$/.test(keyFromEnv)) {
    return Buffer.from(keyFromEnv, "hex");
  }
  
  // Otherwise, derive key from the provided string (less secure, but allows passphrase)
  console.warn("⚠️  SIGNATURE_ENCRYPTION_KEY should be a 64-character hex string for best security");
  return crypto.pbkdf2Sync(keyFromEnv, "signature-salt", ITERATIONS, KEY_LENGTH, "sha256");
}

/**
 * Encrypt a signature string
 * @param plaintext - The signature data (usually a data URL)
 * @returns Encrypted string with prefix "encrypted:" or original value if not a signature
 */
export function encryptSignature(plaintext: string | null | undefined): string | null {
  if (!plaintext) {
    return null;
  }
  
  // If already encrypted, return as is
  if (plaintext.startsWith(ENCRYPTED_PREFIX)) {
    return plaintext;
  }
  
  // Only encrypt actual signature data (data URLs)
  // Don't encrypt user IDs or other non-signature strings
  if (!plaintext.startsWith("data:image")) {
    return plaintext;
  }
  
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt
    let encrypted = cipher.update(plaintext, "utf8");
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    // Get authentication tag
    const tag = cipher.getAuthTag();
    
    // Combine: salt + iv + tag + encrypted data
    const combined = Buffer.concat([salt, iv, tag, encrypted]);
    
    // Encode as base64 and add prefix
    const encryptedBase64 = combined.toString("base64");
    return `${ENCRYPTED_PREFIX}${encryptedBase64}`;
  } catch (error) {
    console.error("Error encrypting signature:", error);
    throw new Error("Failed to encrypt signature");
  }
}

/**
 * Decrypt a signature string
 * @param ciphertext - The encrypted signature string
 * @returns Decrypted signature string or null if decryption fails
 */
export function decryptSignature(ciphertext: string | null | undefined): string | null {
  if (!ciphertext) {
    return null;
  }
  
  // If not encrypted, return as is (for backward compatibility)
  if (!ciphertext.startsWith(ENCRYPTED_PREFIX)) {
    return ciphertext;
  }
  
  try {
    const key = getEncryptionKey();
    
    // Remove prefix and decode base64
    const encryptedBase64 = ciphertext.substring(ENCRYPTED_PREFIX.length);
    const combined = Buffer.from(encryptedBase64, "base64");
    
    // Extract components
    let offset = 0;
    const salt = combined.subarray(offset, offset + SALT_LENGTH);
    offset += SALT_LENGTH;
    const iv = combined.subarray(offset, offset + IV_LENGTH);
    offset += IV_LENGTH;
    const tag = combined.subarray(offset, offset + TAG_LENGTH);
    offset += TAG_LENGTH;
    const encrypted = combined.subarray(offset);
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    // Decrypt
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString("utf8");
  } catch (error) {
    console.error("Error decrypting signature:", error);
    // Return null on decryption failure (could be corrupted data or wrong key)
    return null;
  }
}

/**
 * Check if a signature string is encrypted
 */
export function isEncrypted(signature: string | null | undefined): boolean {
  return signature?.startsWith(ENCRYPTED_PREFIX) ?? false;
}

