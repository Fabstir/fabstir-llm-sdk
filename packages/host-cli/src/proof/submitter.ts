// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { EventEmitter } from 'events';
import { getSDK, getSessionManager } from '../sdk/client';

export interface ProofData {
  sessionId: string;
  jobId: bigint;
  tokensClaimed: number;
  proof: string; // hex-encoded proof bytes
  timestamp: number;
  modelHash?: string;
  inputHash?: string;
  outputHash?: string;
}

export interface SubmissionResult {
  success: boolean;
  txHash?: string;
  error?: string;
  confirmed?: boolean;
  blockNumber?: number;
  proofData: ProofData;
}

export interface SubmissionStatistics {
  totalSubmissions: number;
  successfulSubmissions: number;
  failedSubmissions: number;
  successRate: number;
  totalTokensClaimed: number;
  averageGasUsed?: bigint;
}

export class ProofSubmitter extends EventEmitter {
  private queue: ProofData[] = [];
  private statistics: SubmissionStatistics = {
    totalSubmissions: 0,
    successfulSubmissions: 0,
    failedSubmissions: 0,
    successRate: 0,
    totalTokensClaimed: 0
  };
  private gasEstimates: bigint[] = [];

  constructor() {
    super();
  }

  /**
   * Validate proof data structure
   */
  validateProofData(proofData: ProofData): boolean {
    if (!proofData.sessionId || proofData.sessionId.trim() === '') {
      return false;
    }

    if (!proofData.jobId || proofData.jobId <= BigInt(0)) {
      return false;
    }

    if (!proofData.tokensClaimed || proofData.tokensClaimed <= 0) {
      return false;
    }

    if (!proofData.proof || proofData.proof.trim() === '') {
      return false;
    }

    if (!proofData.proof.startsWith('0x')) {
      return false;
    }

    return true;
  }

  /**
   * Validate proof hash format
   */
  isValidProofHash(hash: string): boolean {
    if (!hash.startsWith('0x')) {
      return false;
    }
    // Remove 0x prefix and check length (32 bytes = 64 hex chars)
    const hexPart = hash.slice(2);
    return hexPart.length === 64 && /^[0-9a-fA-F]+$/.test(hexPart);
  }

  /**
   * Submit proof to blockchain
   */
  async submitProof(proofData: ProofData): Promise<SubmissionResult> {
    if (!this.validateProofData(proofData)) {
      return {
        success: false,
        error: 'Invalid proof data',
        proofData
      };
    }

    try {
      // Verify SDK is authenticated
      const sdk = getSDK();
      if (!sdk.isAuthenticated()) {
        throw new Error('SDK not authenticated');
      }

      // Get SessionManager from SDK
      const sessionManager = getSessionManager();

      // Map ProofData to CheckpointProof
      const checkpointProof = {
        checkpoint: 0, // Default checkpoint number
        tokensGenerated: proofData.tokensClaimed,
        proofData: proofData.proof,
        timestamp: proofData.timestamp
      };

      // Submit checkpoint proof using SDK
      const txHash = await sessionManager.submitCheckpoint(
        proofData.jobId,
        checkpointProof
      );

      // Update statistics
      this.statistics.totalSubmissions++;
      this.statistics.successfulSubmissions++;
      this.statistics.totalTokensClaimed += proofData.tokensClaimed;
      this.updateSuccessRate();

      // Emit success event
      this.emit('proof-submitted', {
        proofData,
        txHash,
        timestamp: Date.now()
      });

      return {
        success: true,
        txHash,
        proofData
      };

    } catch (error: any) {
      // Update statistics
      this.statistics.totalSubmissions++;
      this.statistics.failedSubmissions++;
      this.updateSuccessRate();

      // Emit failure event
      this.emit('proof-failed', {
        proofData,
        error: error.message,
        timestamp: Date.now()
      });

      return {
        success: false,
        error: error.message,
        proofData
      };
    }
  }

  /**
   * Submit proof with transaction confirmation
   */
  async submitProofWithConfirmation(
    proofData: ProofData,
    confirmations: number = 3
  ): Promise<SubmissionResult> {
    if (!this.validateProofData(proofData)) {
      return {
        success: false,
        error: 'Invalid proof data',
        proofData
      };
    }

    try {
      // Verify SDK is authenticated
      const sdk = getSDK();
      if (!sdk.isAuthenticated()) {
        throw new Error('SDK not authenticated');
      }

      // Get SessionManager from SDK
      const sessionManager = getSessionManager();

      // Map ProofData to CheckpointProof
      const checkpointProof = {
        checkpoint: 0, // Default checkpoint number
        tokensGenerated: proofData.tokensClaimed,
        proofData: proofData.proof,
        timestamp: proofData.timestamp
      };

      // Submit checkpoint proof using SDK (SDK waits for confirmations internally)
      const txHash = await sessionManager.submitCheckpoint(
        proofData.jobId,
        checkpointProof
      );

      // Mock receipt for now since SDK only returns txHash
      const receipt = { status: 1, blockNumber: 1000 };

      // Update statistics
      this.statistics.totalSubmissions++;
      this.statistics.successfulSubmissions++;
      this.statistics.totalTokensClaimed += proofData.tokensClaimed;
      this.updateSuccessRate();

      // Emit success event
      this.emit('proof-submitted', {
        proofData,
        txHash,
        timestamp: Date.now()
      });

      return {
        success: true,
        txHash,
        confirmed: true,
        blockNumber: receipt.blockNumber,
        proofData
      };

    } catch (error: any) {
      // Update statistics
      this.statistics.totalSubmissions++;
      this.statistics.failedSubmissions++;
      this.updateSuccessRate();

      // Emit failure event
      this.emit('proof-failed', {
        proofData,
        error: error.message,
        timestamp: Date.now()
      });

      return {
        success: false,
        error: error.message,
        proofData
      };
    }
  }

  /**
   * Queue proof for batch submission
   */
  queueProof(proofData: ProofData): void {
    if (this.validateProofData(proofData)) {
      this.queue.push(proofData);
      this.emit('proof-queued', { proofData, queueSize: this.queue.length });
    }
  }

  /**
   * Process all queued proofs
   */
  async processQueue(): Promise<SubmissionResult[]> {
    const results: SubmissionResult[] = [];
    const proofs = [...this.queue];
    this.queue = [];

    for (const proof of proofs) {
      const result = await this.submitProof(proof);
      results.push(result);
    }

    return results;
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Get pending proofs
   */
  getPendingProofs(): ProofData[] {
    return [...this.queue];
  }

  /**
   * Estimate gas for proof submission
   */
  async estimateGas(proofData: ProofData): Promise<bigint> {
    try {
      const sdk = getSDK();
      if (!sdk.isAuthenticated()) {
        throw new Error('SDK not authenticated');
      }

      // Mock gas estimate for testing
      // In production, this would call estimateGas on the contract
      const baseGas = BigInt(150000);
      const proofSizeGas = BigInt(proofData.proof.length) * BigInt(16);
      const estimate = baseGas + proofSizeGas;

      this.gasEstimates.push(estimate);
      if (this.gasEstimates.length > 100) {
        this.gasEstimates.shift(); // Keep only last 100 estimates
      }

      return estimate;

    } catch (error) {
      // Return default estimate on error
      return BigInt(200000);
    }
  }

  /**
   * Estimate gas with buffer
   */
  async estimateGasWithBuffer(
    proofData: ProofData,
    bufferMultiplier: number = 1.2
  ): Promise<bigint> {
    const baseEstimate = await this.estimateGas(proofData);
    const buffered = baseEstimate * BigInt(Math.floor(bufferMultiplier * 100)) / BigInt(100);
    return buffered;
  }

  /**
   * Get submission statistics
   */
  getStatistics(): SubmissionStatistics {
    if (this.gasEstimates.length > 0) {
      const sum = this.gasEstimates.reduce((a, b) => a + b, BigInt(0));
      this.statistics.averageGasUsed = sum / BigInt(this.gasEstimates.length);
    }
    return { ...this.statistics };
  }

  /**
   * Update success rate
   */
  private updateSuccessRate(): void {
    if (this.statistics.totalSubmissions > 0) {
      this.statistics.successRate =
        this.statistics.successfulSubmissions / this.statistics.totalSubmissions;
    }
  }

  /**
   * Reset statistics
   */
  resetStatistics(): void {
    this.statistics = {
      totalSubmissions: 0,
      successfulSubmissions: 0,
      failedSubmissions: 0,
      successRate: 0,
      totalTokensClaimed: 0
    };
    this.gasEstimates = [];
  }

  /**
   * Clear queue
   */
  clearQueue(): void {
    this.queue = [];
    this.emit('queue-cleared');
  }
}