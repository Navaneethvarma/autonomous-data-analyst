import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for AES-GCM

/**
 * Derives a 32-byte key suitable for AES-256 from the environment or fallback secret.
 */
function getDerivedKey(): Buffer {
  const masterSecret = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET || 'autonomous-data-analyst-default-secret-key-salt-32';
  return crypto.createHash('sha256').update(masterSecret).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Output format: ivHex:tagHex:ciphertextHex
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return '';
  const key = getDerivedKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]).toString('hex');
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext}`;
}

/**
 * Decrypts an AES-256-GCM encrypted string (format: ivHex:tagHex:ciphertextHex).
 */
export function decryptSecret(encryptedPayload: string): string {
  if (!encryptedPayload) return '';
  const parts = encryptedPayload.split(':');
  if (parts.length !== 3 || !parts[0] || !parts[1] || parts[2] === undefined) {
    throw new Error('Invalid encrypted payload format: expected iv:tag:ciphertext');
  }

  const ivHex = parts[0];
  const tagHex = parts[1];
  const ciphertextHex = parts[2];

  const key = getDerivedKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ciphertextBuf = Buffer.from(ciphertextHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertextBuf),
    decipher.final(),
  ]).toString('utf8');

  return decrypted;
}

/**
 * Recursively sanitizes/redacts sensitive keys from objects before serialization or logging.
 */
const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /credential/i,
  /api[_-]?key/i,
  /auth/i,
  /private/i,
];

export function redactSensitiveData<T = any>(val: T): T {
  if (val === null || val === undefined) return val;
  if (typeof val === 'string') {
    // Redact Bearer tokens, passwords in URLs
    return val
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
      .replace(/:\/\/([^:]+):([^@]+)@/g, '://$1:***@') as unknown as T;
  }
  if (Array.isArray(val)) {
    return val.map(item => redactSensitiveData(item)) as unknown as T;
  }
  if (typeof val === 'object') {
    const copy: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (SENSITIVE_KEY_PATTERNS.some(pat => pat.test(k))) {
        copy[k] = '[REDACTED]';
      } else {
        copy[k] = redactSensitiveData(v);
      }
    }
    return copy as T;
  }
  return val;
}
