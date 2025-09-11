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
      
      // Check minimum length
      if (proofHex.length < 128) {
        return false;
      }
      
      // Try to decode
      const proofBytes = this.hexToBytes(proofHex);
      if (!proofBytes || proofBytes.length === 0) {
        return false;
      }
      
      // Try to parse as JSON (for mock proofs)
      try {
        const proofJson = new TextDecoder().decode(proofBytes);
        const proofData = JSON.parse(proofJson);
        
        // Check for required fields
        if (proofData.a && proofData.b && proofData.c) {
          return true;
        }
      } catch {
        // Not JSON, might be binary proof
        // Just check it has reasonable structure
        return proofBytes.length >= 256;
      }
      
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
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    
    return bytes;
  }
}