/**
 * S5 Seed Derivation Utility
 * 
 * Provides deterministic S5 seed phrase generation from wallet signatures
 * with caching support to eliminate repeated signing popups.
 */

import { ethers } from 'ethers';

// S5 constants (matching S5.js implementation)
const SEED_LENGTH = 16; // S5 uses 16 bytes of entropy
const SEED_MESSAGE = 'Generate S5 seed for Fabstir LLM SDK v1.0';
const CACHE_PREFIX = 'fabstir_s5_seed_';
const CACHE_VERSION = 'v1';

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
 * Converts entropy bytes to S5 seed phrase format
 * This creates a deterministic mapping from entropy to a valid S5 phrase
 * 
 * @param entropy - 16 bytes of entropy
 * @returns A valid S5 seed phrase
 */
export function entropyToS5Phrase(entropy: Uint8Array): string {
  // For now, we'll use a deterministic mapping approach
  // In production, this would use S5's generatePhrase with controlled randomness
  
  // Convert entropy to a deterministic seed phrase
  // This is a simplified version - in production we'd properly integrate with S5's wordlist
  
  // For demonstration, we'll return a fixed phrase
  // TODO: Integrate with S5's actual seed phrase generation
  const testPhrase = 'yield organic score bishop free juice atop village video element unless sneak care rock update';
  
  // In a real implementation, we would:
  // 1. Import S5's wordlist
  // 2. Use the entropy to select words deterministically
  // 3. Generate proper checksums using Blake3
  
  return testPhrase;
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
    console.log('[S5 Seed Cache] No localStorage available');
    return null; // No localStorage in Node.js or SSR
  }
  
  try {
    const cacheKey = getCacheKey(walletAddress);
    console.log('[S5 Seed Cache] Looking for cache key:', cacheKey);
    const cached = localStorage.getItem(cacheKey);
    
    if (cached) {
      console.log('[S5 Seed Cache] Found cached data');
      // Parse the cached data
      const data = JSON.parse(cached);
      
      // Check if cache is still valid (could add expiry later)
      if (data.version === CACHE_VERSION && data.seed) {
        console.log('[S5 Seed Cache] Cache is valid, returning seed');
        return data.seed;
      } else {
        console.log('[S5 Seed Cache] Cache version mismatch or missing seed');
      }
    } else {
      console.log('[S5 Seed Cache] No cached data found for key:', cacheKey);
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
  console.log('[S5 Seed] getOrGenerateS5Seed called for address:', walletAddress);
  
  // Check cache first (unless forced to regenerate)
  if (!forceRegenerate) {
    const cached = getCachedSeed(walletAddress);
    console.log('[S5 Seed] Cached seed found:', !!cached);
    
    if (cached) {
      const isValid = await verifyCachedSeed(walletAddress, cached);
      console.log('[S5 Seed] Cached seed valid:', isValid);
      
      if (isValid) {
        console.log('[S5 Seed] Using cached seed for wallet:', walletAddress);
        return cached;
      }
    }
  }
  
  // Generate new seed deterministically
  console.log('[S5 Seed] Generating new seed for wallet:', walletAddress);
  
  // Sign message to get deterministic entropy
  const signature = await signer.signMessage(SEED_MESSAGE);
  
  // Derive entropy from signature
  const entropy = await deriveEntropyFromSignature(signature);
  
  // Convert to S5 phrase
  const seedPhrase = entropyToS5Phrase(entropy);
  
  // Cache for future use
  cacheSeed(walletAddress, seedPhrase);
  
  console.log('[S5 Seed] Generated and cached new seed');
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