import crypto from 'crypto';

/**
 * Generate a secure random token (32 bytes, hex-encoded)
 */
export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a token using SHA-256
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Validate a raw token against its stored hash using timing-safe comparison
 */
export function validateTokenHash(rawToken: string, storedHash: string): boolean {
  const hash = hashToken(rawToken);
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash));
  } catch {
    return false;
  }
}

/**
 * Check if a token has expired
 */
export function isExpired(expiresAt: string | Date): boolean {
  return new Date() > new Date(expiresAt);
}

/**
 * Get confirmation token expiry (48 hours from now)
 */
export function getConfirmExpiry(): string {
  return new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
}

/**
 * Get manage/preferences token expiry (1 year from now)
 */
export function getManageExpiry(): string {
  return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
}
