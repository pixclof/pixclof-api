/**
 * API key helpers — generate and hash agent API keys.
 * Keys are shown to the user once at creation; only the hash is persisted.
 */
import crypto from 'node:crypto';

/**
 * Generate a fresh agent API key.
 * Format: "pxc_" + 32 hex chars (16 random bytes).
 * @returns {string}
 */
export function generateApiKey() {
  return 'pxc_' + crypto.randomBytes(16).toString('hex');
}

/**
 * Hash an API key for storage / lookup.
 * @param {string} key - Plaintext API key.
 * @returns {string} SHA-256 hex digest.
 */
export function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Verify a plaintext API key against a stored hash.
 * Uses a constant-time comparison to avoid leaking timing information.
 * @param {string} plainKey  - Plaintext API key supplied by the caller.
 * @param {string} hashedKey - SHA-256 hex digest stored for the agent.
 * @returns {boolean} true if the key matches the hash.
 */
export function verifyApiKey(plainKey, hashedKey) {
  if (typeof plainKey !== 'string' || typeof hashedKey !== 'string') {
    return false;
  }
  const candidate = Buffer.from(hashApiKey(plainKey), 'hex');
  const stored = Buffer.from(hashedKey, 'hex');
  if (candidate.length !== stored.length) return false;
  return crypto.timingSafeEqual(candidate, stored);
}
