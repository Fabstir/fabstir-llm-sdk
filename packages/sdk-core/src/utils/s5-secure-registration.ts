// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Secure S5 Portal Registration
 *
 * This module provides secure backend-mediated S5 portal registration
 * that keeps the master token server-side only.
 *
 * Flow:
 * 1. Client generates seed and gets pubKey from S5 identity
 * 2. Backend gets challenge from portal (with master token)
 * 3. Client signs challenge with S5 identity
 * 4. Backend completes registration (with master token)
 * 5. Client stores credentials for future use
 */

// Challenge type constants (also exported from S5.js)
export const CHALLENGE_TYPE_REGISTER = 1;
export const CHALLENGE_TYPE_LOGIN = 2;

/**
 * Options for secure S5 registration
 */
export interface SecureRegistrationOptions {
  /** Backend API URL for registration proxy (e.g., '/api/s5' or 'https://api.example.com/s5') */
  backendUrl: string;
  /** Portal host for challenge message (e.g., 's5.platformlessai.ai') */
  portalHost: string;
  /** Portal URL for credential storage (e.g., 'https://s5.platformlessai.ai') */
  portalUrl: string;
}

/**
 * Register on S5 portal using secure backend-mediated flow.
 * Master token stays server-side, only signatures are sent from client.
 *
 * @param s5 - S5 instance with identity initialized
 * @param options - Registration options
 * @returns The auth token for S5 uploads
 * @throws Error if registration fails
 */
export async function registerS5WithBackend(
  s5: any,
  options: SecureRegistrationOptions
): Promise<string> {
  const { backendUrl, portalHost, portalUrl } = options;

  if (!s5.identity) {
    throw new Error('S5 identity not initialized. Call recoverIdentityFromSeedPhrase() first.');
  }

  console.log('[S5 Secure Registration] Starting backend-mediated registration...');

  // 1. Generate random seed for this portal (purpose-specific keypair)
  const seedBytes = new Uint8Array(32);
  crypto.getRandomValues(seedBytes);
  const seed = base64UrlEncode(seedBytes);

  // 2. Get public key from S5 identity using the new API
  const pubKey = await s5.getSigningPublicKey(seed);
  console.log(`[S5 Secure Registration] Got pubKey: ${pubKey.substring(0, 20)}...`);

  // 3. Request challenge from backend (backend adds master token)
  console.log('[S5 Secure Registration] Requesting challenge from backend...');
  const challengeRes = await fetch(`${backendUrl}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pubKey }),
  });

  if (!challengeRes.ok) {
    const errorText = await challengeRes.text();
    throw new Error(`Failed to get challenge: ${challengeRes.status} - ${errorText}`);
  }

  const { challenge } = await challengeRes.json();
  if (!challenge) {
    throw new Error('No challenge received from backend');
  }
  console.log('[S5 Secure Registration] Got challenge from backend');

  // 4. Format and sign the challenge message (per S5 portal spec)
  const challengeBytes = base64UrlDecode(challenge);

  // Hash the portal host for the message
  const portalHostHash = await hashBlake3(new TextEncoder().encode(portalHost), s5);

  // Build message: [challengeType, ...challenge, ...portalHostHash]
  const message = new Uint8Array([
    CHALLENGE_TYPE_REGISTER,
    ...challengeBytes,
    ...portalHostHash
  ]);

  // Sign with S5 identity using the new API
  // Note: s5.sign() returns a base64url STRING, not bytes
  const signature = await s5.sign(message, seed);
  const response = base64UrlEncode(message);
  console.log('[S5 Secure Registration] Challenge signed');

  // 5. Complete registration via backend (backend adds master token)
  console.log('[S5 Secure Registration] Completing registration...');
  const completeRes = await fetch(`${backendUrl}/register-complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pubKey,
      response,
      signature,
      label: 'fabstir-sdk',
    }),
  });

  if (!completeRes.ok) {
    const errorText = await completeRes.text();
    throw new Error(`Registration failed: ${completeRes.status} - ${errorText}`);
  }

  const { authToken } = await completeRes.json();
  if (!authToken) {
    throw new Error('No authToken received from backend');
  }
  console.log('[S5 Secure Registration] Got authToken');

  // 6. Set auth token for immediate use (S5.js beta.33+)
  s5.setPortalAuth(portalUrl, authToken);
  console.log('[S5 Secure Registration] Auth token set for immediate use');

  // 7. Persist credentials for future sessions (optional - may fail if already exists)
  try {
    await s5.storePortalCredentials(portalUrl, seed, authToken);
    console.log('[S5 Secure Registration] Credentials persisted for future sessions');
  } catch (err: any) {
    // "User already has an account" is fine - setPortalAuth already worked
    if (err?.message?.includes('already has an account')) {
      console.log('[S5 Secure Registration] Account already exists, using current auth token');
    } else {
      // Log other errors but don't fail - we already have the auth token
      console.warn('[S5 Secure Registration] Could not persist credentials:', err?.message);
    }
  }

  return authToken;
}

/**
 * Hash data using BLAKE3 via S5's crypto API
 */
async function hashBlake3(data: Uint8Array, s5: any): Promise<Uint8Array> {
  // Use S5's crypto implementation
  if (s5.crypto && s5.crypto.hashBlake3) {
    return s5.crypto.hashBlake3(data);
  }
  // Fallback: import from noble/hashes
  const { blake3 } = await import('@noble/hashes/blake3');
  return blake3(data);
}

/**
 * Encode bytes to base64url (no padding)
 */
function base64UrlEncode(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Decode base64url to bytes
 */
function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)));
}
