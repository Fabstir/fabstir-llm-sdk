// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Web Crypto API utilities for browser-compatible cryptography
 * Replaces Node.js crypto module
 */

/**
 * Generate random bytes using Web Crypto API
 */
export function getRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Generate random hex string
 */
export function getRandomHex(length: number): string {
  const bytes = getRandomBytes(length);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hash data using SHA-256
 */
export async function sha256(data: string | Uint8Array): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = typeof data === 'string' ? encoder.encode(data) : data as Uint8Array;

  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer as BufferSource);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash data using SHA-512
 */
export async function sha512(data: string | Uint8Array): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = typeof data === 'string' ? encoder.encode(data) : data as Uint8Array;

  const hashBuffer = await crypto.subtle.digest('SHA-512', dataBuffer as BufferSource);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * HMAC-SHA256 for message authentication
 */
export async function hmacSha256(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  
  // Import key
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  // Sign data
  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    encoder.encode(data)
  );
  
  // Convert to hex
  const signArray = Array.from(new Uint8Array(signature));
  return signArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a cryptographic key pair (for advanced use cases)
 */
export async function generateKeyPair(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  // Generate ECDSA key pair
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256'
    },
    true,
    ['sign', 'verify']
  );
  
  // Export keys to JWK format
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  
  return {
    publicKey: JSON.stringify(publicKeyJwk),
    privateKey: JSON.stringify(privateKeyJwk)
  };
}

/**
 * Derive key from password (PBKDF2)
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: string,
  iterations: number = 100000
): Promise<string> {
  const encoder = new TextEncoder();
  
  // Import password as key
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  // Derive bits
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations,
      hash: 'SHA-256'
    },
    passwordKey,
    256 // 32 bytes
  );
  
  // Convert to hex
  const keyArray = Array.from(new Uint8Array(derivedBits));
  return keyArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * AES-GCM encryption
 */
export async function encrypt(
  data: string,
  password: string
): Promise<{ encrypted: string; iv: string; salt: string }> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  // Generate random salt and IV
  const salt = getRandomHex(16);
  const iv = getRandomBytes(12);
  
  // Derive key from password
  const keyHex = await deriveKeyFromPassword(password, salt);
  const keyBytes = new Uint8Array(keyHex.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
  
  // Import key
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    'AES-GCM',
    false,
    ['encrypt']
  );
  
  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource
    },
    key,
    encoder.encode(data)
  );
  
  // Convert to base64
  const encryptedBase64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
  const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
  
  return {
    encrypted: encryptedBase64,
    iv: ivHex,
    salt
  };
}

/**
 * AES-GCM decryption
 */
export async function decrypt(
  encryptedBase64: string,
  password: string,
  ivHex: string,
  salt: string
): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  // Convert from base64
  const encrypted = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  
  // Convert IV from hex
  const iv = new Uint8Array(ivHex.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
  
  // Derive key from password
  const keyHex = await deriveKeyFromPassword(password, salt);
  const keyBytes = new Uint8Array(keyHex.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
  
  // Import key
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    'AES-GCM',
    false,
    ['decrypt']
  );
  
  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv
    },
    key,
    encrypted
  );
  
  return decoder.decode(decrypted);
}

/**
 * Convert bytes to base64
 */
export function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Convert base64 to bytes
 */
export function base64ToBytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

/**
 * Convert hex string to bytes
 */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Convert bytes to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Check if Web Crypto API is available
 */
export function isWebCryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && 
         typeof crypto.subtle !== 'undefined';
}

/**
 * Polyfill check and warning
 */
export function ensureWebCrypto(): void {
  if (!isWebCryptoAvailable()) {
    throw new Error(
      'Web Crypto API is not available. ' +
      'Please use a modern browser or ensure HTTPS is enabled.'
    );
  }
}