// src/shared/lib/crypto.ts
// AES-256-GCM encryption for sensitive data at rest (e.g., Gmail OAuth refresh tokens).
// ENCRYPTION_KEY must be a 64-character hex string (256 bits / 32 bytes).

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

/**
 * Encrypts plaintext using AES-256-GCM.
 * Returns format: iv:authTag:encrypted (all hex strings).
 */
export function encrypt(text: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts AES-256-GCM encrypted data.
 * Format expected: iv:authTag:encrypted (all hex strings).
 */
export function decrypt(encryptedData: string, key: Buffer): string {
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format: expected iv:authTag:encrypted');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH} bytes, got ${iv.length}`);
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Returns the ENCRYPTION_KEY as a Buffer (32 bytes).
 * Throws if the key is missing or invalid.
 */
export function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }
  if (key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  if (!/^[a-fA-F0-9]+$/.test(key)) {
    throw new Error('ENCRYPTION_KEY must contain only hex characters');
  }
  return Buffer.from(key, 'hex');
}

/**
 * Generates a new random 256-bit ENCRYPTION_KEY.
 * Useful for initial setup: openssl rand -hex 32
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}