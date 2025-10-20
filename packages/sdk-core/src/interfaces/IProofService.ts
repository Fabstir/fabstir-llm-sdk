// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Proof Service Interface - Browser-compatible interface for proof operations
 * Actual proof generation happens in sdk-node
 */

export interface ProofRequest {
  sessionId: string;
  jobId: string | bigint;
  tokensUsed: number;
  modelHash?: string;
  inputHash?: string;
  outputHash?: string;
  timestamp?: number;
}

export interface ProofResult {
  proof: string; // Hex-encoded proof data
  publicInputs?: string[];
  verified: boolean;
  timestamp: number;
  proofType: 'ezkl'; // Only real proof types allowed
}

export interface ProofStatus {
  sessionId: string;
  status: 'pending' | 'generating' | 'ready' | 'submitted' | 'verified' | 'failed';
  progress?: number;
  error?: string;
}

export interface IProofService {
  /**
   * Request proof generation (async - happens on server)
   */
  requestProof(request: ProofRequest): Promise<string>; // Returns proof ID
  
  /**
   * Get proof status
   */
  getProofStatus(proofId: string): Promise<ProofStatus>;
  
  /**
   * Get proof result once ready
   */
  getProofResult(proofId: string): Promise<ProofResult>;
  
  /**
   * Verify a proof (can be done in browser for simple proofs)
   */
  verifyProof(proof: string, publicInputs?: string[]): Promise<boolean>;
  
  /**
   * Submit proof to blockchain
   */
  submitProofToChain(
    proof: string,
    sessionId: string | bigint,
    jobId: string | bigint
  ): Promise<string>; // Returns transaction hash
  
  /**
   * Check if proof service is available
   */
  isAvailable(): boolean;
}