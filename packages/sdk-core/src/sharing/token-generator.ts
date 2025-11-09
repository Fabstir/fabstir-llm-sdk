/**
 * Token Generator
 * Generates secure random tokens for access control
 * Max 200 lines
 */

/**
 * Generate a secure random token
 * @param length Token length in bytes (default 32)
 * @returns Hexadecimal token string
 */
export function generateSecureToken(length: number = 32): string {
  // Use crypto.randomBytes if available (Node.js), otherwise crypto.getRandomValues (browser)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    // Browser environment
    const buffer = new Uint8Array(length);
    crypto.getRandomValues(buffer);
    return Array.from(buffer)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } else if (typeof require !== 'undefined') {
    // Node.js environment
    try {
      const cryptoModule = require('crypto');
      return cryptoModule.randomBytes(length).toString('hex');
    } catch (error) {
      // Fallback to Math.random if crypto module not available
      return fallbackToken(length);
    }
  } else {
    // Fallback
    return fallbackToken(length);
  }
}

/**
 * Fallback token generator using Math.random
 * Less secure, only for environments without crypto support
 * @param length Token length in bytes
 * @returns Hexadecimal token string
 */
function fallbackToken(length: number): string {
  const chars = '0123456789abcdef';
  let token = '';
  for (let i = 0; i < length * 2; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

/**
 * Generate a unique ID for invitations/tokens
 * Format: prefix + timestamp + random
 * @param prefix Prefix for the ID (e.g., 'inv', 'tok')
 * @returns Unique ID string
 */
export function generateUniqueId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Validate token format
 * @param token Token to validate
 * @returns true if token has valid format
 */
export function isValidTokenFormat(token: string): boolean {
  // Token should be hexadecimal string of at least 32 characters
  return /^[0-9a-f]{32,}$/.test(token);
}

/**
 * Hash token for storage
 * Simple hash to avoid storing plain tokens
 * @param token Token to hash
 * @returns Hashed token
 */
export function hashToken(token: string): string {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}
