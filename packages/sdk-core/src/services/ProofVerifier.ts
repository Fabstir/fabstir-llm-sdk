/**
 * Proof Verifier - Browser-compatible proof verification
 * Can verify simple proofs without heavy computation
 */

import { SDKError } from '../types';

export class ProofVerifier {
  /**
   * Verify a proof structure (basic validation)
   * Full verification happens on-chain or in sdk-node
   */
  async verifyProofStructure(proof: string): Promise<boolean> {
    try {
      // Remove 0x prefix if present
      const proofHex = proof.startsWith('0x') ? proof.slice(2) : proof;

      // Check minimum length (real proofs are at least 512 hex chars = 256 bytes)
      if (proofHex.length < 512) {
        return false;
      }

      // Detect mock proofs (all zeros)
      if (proofHex === '00'.repeat(256)) {
        return false;
      }

      // Detect proofs with too many consecutive zeros (likely mock)
      const consecutiveZeros = proofHex.match(/(00)+/g);
      if (consecutiveZeros) {
        const maxConsecutive = Math.max(...consecutiveZeros.map(z => z.length));
        if (maxConsecutive >= 128) { // 64 bytes of zeros is suspicious
          return false;
        }
      }

      // Detect repeating patterns (sign of mock/test data)
      const patterns = ['deed', 'dead', 'beef', 'cafe', '1234', 'abcd', 'ffff', '0000'];
      for (const pattern of patterns) {
        const regex = new RegExp(`(${pattern}){8,}`, 'i');
        if (regex.test(proofHex)) {
          return false;
        }
      }

      // Try to decode
      const proofBytes = this.hexToBytes(proofHex);
      if (!proofBytes || proofBytes.length < 256) {
        return false;
      }

      // Calculate entropy (real proofs should have high entropy)
      const entropy = this.calculateEntropy(proofBytes);
      if (entropy < 3.0) { // Low entropy suggests mock data
        return false;
      }

      // Valid proof structure
      return true;

    } catch (error) {
      console.error('Proof structure verification failed:', error);
      return false;
    }
  }
  
  /**
   * Verify proof inputs match expected values
   */
  verifyPublicInputs(
    proof: string,
    expectedInputs: string[]
  ): boolean {
    try {
      const proofHex = proof.startsWith('0x') ? proof.slice(2) : proof;
      const proofBytes = this.hexToBytes(proofHex);
      const proofJson = new TextDecoder().decode(proofBytes);
      const proofData = JSON.parse(proofJson);
      
      if (!proofData.public) {
        return false;
      }
      
      // Compare public inputs
      return JSON.stringify(proofData.public) === JSON.stringify(expectedInputs);
      
    } catch {
      // If we can't parse, assume inputs don't match
      return false;
    }
  }
  
  /**
   * Extract public inputs from proof
   */
  extractPublicInputs(proof: string): string[] | null {
    try {
      const proofHex = proof.startsWith('0x') ? proof.slice(2) : proof;
      const proofBytes = this.hexToBytes(proofHex);
      const proofJson = new TextDecoder().decode(proofBytes);
      const proofData = JSON.parse(proofJson);
      
      return proofData.public || null;
      
    } catch {
      return null;
    }
  }
  
  /**
   * Calculate proof hash for caching/identification
   */
  async getProofHash(proof: string): Promise<string> {
    const proofHex = proof.startsWith('0x') ? proof.slice(2) : proof;
    const proofBytes = this.hexToBytes(proofHex);
    
    // Use Web Crypto API for hashing
    const hashBuffer = await crypto.subtle.digest('SHA-256', proofBytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return '0x' + hashHex;
  }
  
  private hexToBytes(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) {
      throw new SDKError('Invalid hex string', 'INVALID_HEX');
    }

    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      const byte = parseInt(hex.substr(i * 2, 2), 16);
      if (isNaN(byte)) {
        throw new SDKError('Invalid hex character', 'INVALID_HEX');
      }
      bytes[i] = byte;
    }

    return bytes;
  }

  /**
   * Calculate Shannon entropy of bytes to detect mock data
   */
  private calculateEntropy(bytes: Uint8Array): number {
    const freqMap = new Map<number, number>();

    // Count byte frequencies
    for (const byte of bytes) {
      freqMap.set(byte, (freqMap.get(byte) || 0) + 1);
    }

    // Calculate entropy
    let entropy = 0;
    const total = bytes.length;

    for (const freq of freqMap.values()) {
      const p = freq / total;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    return entropy;
  }
}