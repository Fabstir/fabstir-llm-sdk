// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * S5 Seed Derivation Utility
 *
 * Provides deterministic S5 seed phrase generation from wallet signatures
 * with caching support to eliminate repeated signing popups.
 *
 * IMPORTANT: Uses @noble/hashes blake3 - same as S5.js
 */

import { ethers } from 'ethers';
// Use the CORRECT S5.js wordlist - must be exactly 1024 words!
import { wordlist as s5Wordlist } from './s5-wordlist-correct';
import { blake3 } from '@noble/hashes/blake3';

// S5 constants (matching S5.js implementation)
const SEED_LENGTH = 16; // S5 uses 16 bytes of entropy
const SEED_WORDS_LENGTH = 13; // 13 words provide the entropy
const CHECKSUM_WORDS_LENGTH = 2; // 2 words for checksum
const PHRASE_LENGTH = SEED_WORDS_LENGTH + CHECKSUM_WORDS_LENGTH; // 15 total
const LAST_WORD_INDEX = 12; // Index of the 13th word (0-based)
// AUDIT REMEDIATION: Updated seed message and cache version for fresh S5 identity
export const SEED_MESSAGE = 'Generate S5 seed for Fabstir LLM SDK v2.1 beta';
export const SEED_DOMAIN_SEPARATOR = 'fabstir-s5-seed-v2.1'; // For address-based derivation (Base Account Kit)
const CACHE_PREFIX = 'fabstir_s5_seed_';
const CACHE_VERSION = 'v4'; // Bumped for AUDIT remediation - invalidates old cached seeds

/**
 * Derives deterministic entropy from a wallet signature
 * @param signature - The signature from wallet signing
 * @returns 16 bytes of entropy for S5 seed generation
 */
export async function deriveEntropyFromSignature(signature: string): Promise<Uint8Array> {
  // Use Web Crypto API for consistent hashing
  const encoder = new TextEncoder();
  const data = encoder.encode(signature);

  // Hash the signature to get deterministic entropy
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const fullHash = new Uint8Array(hashBuffer);

  // S5 needs exactly 16 bytes of entropy
  return fullHash.slice(0, SEED_LENGTH);
}

/**
 * Derives deterministic entropy from a wallet ADDRESS
 *
 * This is the PREFERRED method for MetaMask/WalletConnect because:
 * 1. Wallet addresses are ALWAYS deterministic (same wallet = same address)
 * 2. No signature popup required
 * 3. Survives browser data clear
 * 4. Works across devices (same wallet = same seed)
 *
 * Formula: SHA256(address.toLowerCase() + SEED_DOMAIN_SEPARATOR + chainId)
 *
 * @param address - The wallet address (checksummed or lowercase)
 * @param chainId - The chain ID for domain separation
 * @returns 16 bytes of entropy for S5 seed generation
 */
export async function deriveEntropyFromAddress(address: string, chainId: number): Promise<Uint8Array> {
  // Normalize address to lowercase for case-insensitivity
  const normalizedAddress = address.toLowerCase();

  // Combine: address + domain separator + chainId
  const encoder = new TextEncoder();
  const data = encoder.encode(normalizedAddress + SEED_DOMAIN_SEPARATOR + chainId.toString());

  // Hash to get deterministic entropy
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const fullHash = new Uint8Array(hashBuffer);

  // S5 needs exactly 16 bytes of entropy
  return fullHash.slice(0, SEED_LENGTH);
}

/**
 * Generate S5 seed phrase deterministically from a wallet ADDRESS
 *
 * This is the RECOMMENDED method for MetaMask/WalletConnect/Base Account Kit.
 * The generated seed will be identical across:
 * - Browser sessions (survives localStorage/IndexedDB clear)
 * - Different browsers
 * - Different devices (same wallet address = same seed)
 *
 * @param address - The wallet address
 * @param chainId - The chain ID for domain separation
 * @returns A valid S5 seed phrase (15 words)
 */
export async function generateS5SeedFromAddress(address: string, chainId: number): Promise<string> {
  console.log('[S5 Seed] Deriving S5 seed deterministically from address...');

  const entropy = await deriveEntropyFromAddress(address, chainId);
  const seedPhrase = entropyToS5Phrase(entropy);

  const words = seedPhrase.split(' ').slice(0, 3).join(' ');
  console.log('[S5 Seed] Address-based seed generated (first 3 words):', words + '...');

  return seedPhrase;
}

/**
 * Domain separator for deterministic S5 seed derivation from private key
 * Changing this will generate different seeds - keep stable!
 */
const S5_SEED_DERIVATION_DOMAIN = 'fabstir-s5-seed-from-private-key-v1';

/**
 * Derives S5 seed DETERMINISTICALLY from a private key
 *
 * This is the preferred method when the private key is available because:
 * 1. It's 100% deterministic - same private key ALWAYS produces same S5 seed
 * 2. No wallet popup required
 * 3. Works across browser sessions (survives localStorage clear)
 * 4. Works across devices (same key = same seed)
 *
 * Uses HKDF-like derivation: SHA256(domain || privateKey)
 *
 * @param privateKey - The wallet's private key (hex string with or without 0x prefix)
 * @returns 16 bytes of entropy for S5 seed generation
 */
export async function deriveEntropyFromPrivateKey(privateKey: string): Promise<Uint8Array> {
  // Normalize private key (remove 0x prefix if present)
  const normalizedKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;

  // Validate it's a valid hex string of correct length (32 bytes = 64 hex chars)
  if (!/^[0-9a-fA-F]{64}$/.test(normalizedKey)) {
    throw new Error('Invalid private key format - must be 32 bytes hex');
  }

  // Combine domain separator with private key for HKDF-like derivation
  // This ensures the derived seed is specific to Fabstir S5 usage
  const encoder = new TextEncoder();
  const domainBytes = encoder.encode(S5_SEED_DERIVATION_DOMAIN);
  const keyBytes = new Uint8Array(normalizedKey.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));

  // Concatenate domain + key
  const combined = new Uint8Array(domainBytes.length + keyBytes.length);
  combined.set(domainBytes);
  combined.set(keyBytes, domainBytes.length);

  // Hash to get deterministic entropy
  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  const fullHash = new Uint8Array(hashBuffer);

  // S5 needs exactly 16 bytes of entropy
  return fullHash.slice(0, SEED_LENGTH);
}

/**
 * Generate S5 seed phrase deterministically from a private key
 *
 * This is the RECOMMENDED method when the private key is available.
 * The generated seed will be identical across:
 * - Browser sessions
 * - Different browsers
 * - Different devices
 * - After clearing browser data
 *
 * @param privateKey - The wallet's private key (hex string)
 * @returns A valid S5 seed phrase (15 words)
 */
export async function generateS5SeedFromPrivateKey(privateKey: string): Promise<string> {
  console.log('[S5 Seed] Deriving S5 seed deterministically from private key...');

  const entropy = await deriveEntropyFromPrivateKey(privateKey);
  const seedPhrase = entropyToS5Phrase(entropy);

  const words = seedPhrase.split(' ').slice(0, 3).join(' ');
  console.log('[S5 Seed] Deterministic seed generated (first 3 words):', words + '...');

  return seedPhrase;
}

/**
 * Converts seed words (10-bit values) to seed bytes (8-bit array)
 * Matches S5.js seedWordsToSeed implementation
 */
function seedWordsToSeed(seedWords: Uint16Array): Uint8Array {
  if (seedWords.length !== SEED_WORDS_LENGTH) {
    throw new Error(`Input seed words should be length '${SEED_WORDS_LENGTH}', was '${seedWords.length}'`);
  }

  const bytes = new Uint8Array(SEED_LENGTH);
  let curByte = 0;
  let curBit = 0;

  for (let i = 0; i < SEED_WORDS_LENGTH; i++) {
    const word = seedWords[i];
    let wordBits = 10;
    if (i === SEED_WORDS_LENGTH - 1) {
      wordBits = 8; // Last word only uses 8 bits
    }

    // Iterate over the bits of the 10- or 8-bit word
    for (let j = 0; j < wordBits; j++) {
      const bitSet = (word & (1 << (wordBits - j - 1))) > 0;

      if (bitSet) {
        bytes[curByte] |= 1 << (8 - curBit - 1);
      }

      curBit += 1;
      if (curBit >= 8) {
        curByte += 1;
        curBit = 0;
      }
    }
  }

  return bytes;
}

/**
 * Converts entropy to seed words (10-bit values)
 * Must exactly match the inverse of S5.js seedWordsToSeed
 * Total: 12 words × 10 bits + 1 word × 8 bits = 128 bits
 */
function entropyToSeedWords(entropy: Uint8Array): Uint16Array {
  if (entropy.length !== SEED_LENGTH) {
    throw new Error(`Entropy must be ${SEED_LENGTH} bytes`);
  }

  const seedWords = new Uint16Array(SEED_WORDS_LENGTH);
  let bitOffset = 0;

  for (let i = 0; i < SEED_WORDS_LENGTH; i++) {
    let wordBits = 10;
    if (i === SEED_WORDS_LENGTH - 1) { // Use SEED_WORDS_LENGTH - 1, not LAST_WORD_INDEX
      wordBits = 8; // Last word only 8 bits
    }

    let word = 0;
    for (let j = 0; j < wordBits; j++) {
      const byteIndex = Math.floor(bitOffset / 8);
      const bitIndex = bitOffset % 8;

      if (byteIndex < entropy.length) {
        const bitSet = (entropy[byteIndex] & (1 << (7 - bitIndex))) > 0;
        if (bitSet) {
          word |= 1 << (wordBits - j - 1);
        }
      }

      bitOffset++;
    }

    seedWords[i] = word;
  }

  return seedWords;
}

/**
 * Generate checksum words from seed using Blake3 hash
 * Exactly matches S5.js implementation from seed_phrase.ts
 */
function generateChecksumWords(seed: Uint8Array): Uint16Array {
  // Use Blake3 hash as required by S5.js
  const h = blake3(seed);

  // Convert hash to checksum words (exact S5.js logic)
  let word1 = h[0] << 8;
  word1 += h[1];
  word1 >>= 6;

  let word2 = h[1] << 10;
  word2 &= 0xffff;
  word2 += h[2] << 2;
  word2 >>= 6;

  return new Uint16Array([word1, word2]);
}

/**
 * Converts entropy bytes to S5 seed phrase format
 * This creates a deterministic mapping from entropy to a valid S5 phrase
 * Now uses Blake3 checksums for full S5.js compatibility
 *
 * @param entropy - 16 bytes of entropy
 * @returns A valid S5 seed phrase with Blake3 checksums
 */
export function entropyToS5Phrase(entropy: Uint8Array): string {
  if (entropy.length !== SEED_LENGTH) {
    throw new Error(`Entropy must be ${SEED_LENGTH} bytes, got ${entropy.length}`);
  }

  console.log('[S5 Phrase Generation] Starting with entropy:',
    Array.from(entropy).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // Convert entropy to seed words
  const seedWords = entropyToSeedWords(entropy);

  // Convert seed words back to seed bytes (required for checksum)
  const seedBytes = seedWordsToSeed(seedWords);
  console.log('[S5 Phrase Generation] Seed bytes for checksum:',
    Array.from(seedBytes).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // Generate Blake3 checksum words (S5.js requirement)
  const checksumWords = generateChecksumWords(seedBytes);

  // Build the phrase
  const phraseWords: string[] = [];

  // Add seed words
  for (let i = 0; i < SEED_WORDS_LENGTH; i++) {
    phraseWords.push(s5Wordlist[seedWords[i]]);
  }

  // Add checksum words
  for (let i = 0; i < CHECKSUM_WORDS_LENGTH; i++) {
    phraseWords.push(s5Wordlist[checksumWords[i]]);
  }

  const phrase = phraseWords.join(' ');
  console.log('[S5 Phrase Generation] Final phrase (first 3 words):',
    phraseWords.slice(0, 3).join(' ') + '...');

  return phrase;
}

/**
 * Get the cache key for a wallet address
 */
function getCacheKey(walletAddress: string): string {
  return `${CACHE_PREFIX}${walletAddress.toLowerCase()}_${CACHE_VERSION}`;
}

/**
 * Get cached seed for a wallet address
 * @param walletAddress - The wallet address to check
 * @returns The cached seed phrase or null if not found
 */
export function getCachedSeed(walletAddress: string): string | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null; // No localStorage in Node.js or SSR
  }
  
  try {
    const cacheKey = getCacheKey(walletAddress);
    const cached = localStorage.getItem(cacheKey);
    
    if (cached) {
      // Parse the cached data
      const data = JSON.parse(cached);
      
      // Check if cache is still valid (could add expiry later)
      if (data.version === CACHE_VERSION && data.seed) {
        return data.seed;
      } else {
      }
    } else {
    }
  } catch (error) {
    console.warn('Failed to read cached S5 seed:', error);
  }
  
  return null;
}

/**
 * Cache a seed for a wallet address
 * @param walletAddress - The wallet address to cache for
 * @param seed - The seed phrase to cache
 */
export function cacheSeed(walletAddress: string, seed: string): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return; // No localStorage in Node.js or SSR
  }

  try {
    const cacheKey = getCacheKey(walletAddress);
    const words = seed.split(' ').slice(0, 3).join(' ');
    console.log('[cacheSeed] Writing to cache key:', cacheKey);
    console.log('[cacheSeed] Seed (first 3 words):', words);
    const data = {
      version: CACHE_VERSION,
      seed,
      timestamp: Date.now(),
      walletAddress: walletAddress.toLowerCase()
    };
    
    localStorage.setItem(cacheKey, JSON.stringify(data));
  } catch (error) {
    console.warn('Failed to cache S5 seed:', error);
  }
}

/**
 * Clear cached seed for a wallet address
 * @param walletAddress - The wallet address to clear cache for
 */
export function clearCachedSeed(walletAddress: string): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  
  try {
    const cacheKey = getCacheKey(walletAddress);
    localStorage.removeItem(cacheKey);
  } catch (error) {
    console.warn('Failed to clear cached S5 seed:', error);
  }
}

/**
 * Verify that a cached seed is still valid for the wallet
 * This is a lightweight check - for full verification, regenerate and compare
 * 
 * @param walletAddress - The wallet address to verify
 * @param cachedSeed - The cached seed to verify
 * @returns True if the seed appears valid for this wallet
 */
export async function verifyCachedSeed(
  walletAddress: string,
  cachedSeed: string
): Promise<boolean> {
  try {
    // Basic validation - check it's a valid S5 phrase format
    const words = cachedSeed.trim().split(' ');
    if (words.length !== 15) {
      return false; // S5 phrases are always 15 words
    }
    
    // Could add more validation here:
    // - Check words are in S5 wordlist
    // - Verify checksum words
    // - etc.
    
    return true;
  } catch (error) {
    console.warn('Failed to verify cached seed:', error);
    return false;
  }
}

/**
 * Generate or retrieve a deterministic S5 seed for a wallet
 * This is the main entry point for the SDK
 * 
 * @param signer - The wallet signer
 * @param forceRegenerate - Force regeneration even if cached
 * @returns The S5 seed phrase
 */
export async function getOrGenerateS5Seed(
  signer: ethers.Signer,
  forceRegenerate = false
): Promise<string> {
  const walletAddress = await signer.getAddress();
  console.log('[getOrGenerateS5Seed] Wallet address:', walletAddress.toLowerCase());

  // Check cache first (unless forced to regenerate)
  if (!forceRegenerate) {
    const cached = getCachedSeed(walletAddress);

    if (cached) {
      const words = cached.split(' ').slice(0, 3).join(' ');
      console.log('[getOrGenerateS5Seed] Found cached seed (first 3 words):', words);
      const isValid = await verifyCachedSeed(walletAddress, cached);

      if (isValid) {
        console.log('[getOrGenerateS5Seed] Returning cached seed');
        return cached;
      }
      console.log('[getOrGenerateS5Seed] Cached seed failed validation');
    } else {
      console.log('[getOrGenerateS5Seed] No cached seed found');
    }
  }

  // Generate new seed deterministically
  console.log('[getOrGenerateS5Seed] Generating new seed via signature...');

  // Sign message to get deterministic entropy
  const signature = await signer.signMessage(SEED_MESSAGE);

  // Derive entropy from signature
  const entropy = await deriveEntropyFromSignature(signature);

  // Convert to S5 phrase
  const seedPhrase = entropyToS5Phrase(entropy);
  const words = seedPhrase.split(' ').slice(0, 3).join(' ');
  console.log('[getOrGenerateS5Seed] Generated new seed (first 3 words):', words);

  // Cache for future use
  console.log('[getOrGenerateS5Seed] Caching new seed for:', walletAddress.toLowerCase());
  cacheSeed(walletAddress, seedPhrase);

  return seedPhrase;
}

/**
 * Generate S5 seed without caching (for testing or one-time use)
 * @param signer - The wallet signer
 * @returns The S5 seed phrase
 */
export async function generateS5SeedWithoutCache(
  signer: ethers.Signer
): Promise<string> {
  const signature = await signer.signMessage(SEED_MESSAGE);
  const entropy = await deriveEntropyFromSignature(signature);
  return entropyToS5Phrase(entropy);
}

/**
 * Check if a seed is cached for a wallet
 * @param walletAddress - The wallet address to check
 * @returns True if a seed is cached
 */
export function hasCachedSeed(walletAddress: string): boolean {
  return getCachedSeed(walletAddress) !== null;
}

/**
 * Export all cached seeds (for backup/debugging)
 * @returns Map of wallet addresses to seeds
 */
export function exportAllCachedSeeds(): Map<string, string> {
  const seeds = new Map<string, string>();
  
  if (typeof window === 'undefined' || !window.localStorage) {
    return seeds;
  }
  
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        if (data.walletAddress && data.seed) {
          seeds.set(data.walletAddress, data.seed);
        }
      }
    }
  } catch (error) {
    console.warn('Failed to export cached seeds:', error);
  }
  
  return seeds;
}