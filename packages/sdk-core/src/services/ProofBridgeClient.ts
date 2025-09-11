/**
 * Proof Bridge Client - Browser client for proof generation service
 * Communicates with sdk-node for heavy proof generation
 */

import { IProofService, ProofRequest, ProofResult, ProofStatus } from '../interfaces/IProofService';
import { SDKError } from '../types';
import { ProofVerifier } from './ProofVerifier';

export class ProofBridgeClient implements IProofService {
  private endpoint?: string;
  private connected = false;
  private pendingProofs = new Map<string, ProofStatus>();
  private verifier = new ProofVerifier();
  
  constructor(private contractManager?: any) {}
  
  /**
   * Connect to proof service endpoint
   */
  async connect(endpoint: string): Promise<void> {
    this.endpoint = endpoint;
    
    // Test connection
    try {
      const response = await fetch(`${endpoint}/health`);
      if (!response.ok) {
        throw new Error('Proof service not healthy');
      }
      this.connected = true;
    } catch (error) {
      throw new SDKError('Failed to connect to proof service', 'PROOF_SERVICE_UNAVAILABLE', { error });
    }
  }
  
  async requestProof(request: ProofRequest): Promise<string> {
    if (!this.connected) {
      throw new SDKError('Not connected to proof service', 'PROOF_SERVICE_NOT_CONNECTED');
    }
    
    const proofId = this.generateProofId(request);
    
    // Check if already pending
    if (this.pendingProofs.has(proofId)) {
      return proofId;
    }
    
    // Mark as pending
    this.pendingProofs.set(proofId, {
      sessionId: request.sessionId,
      status: 'pending',
      progress: 0
    });
    
    try {
      // Request proof generation from server
      const response = await fetch(`${this.endpoint}/proof/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
      });
      
      if (!response.ok) {
        throw new Error(`Proof generation failed: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // Update status
      this.pendingProofs.set(proofId, {
        sessionId: request.sessionId,
        status: 'generating',
        progress: 10
      });
      
      // Start polling for status
      this.pollProofStatus(proofId);
      
      return result.proofId || proofId;
      
    } catch (error) {
      this.pendingProofs.delete(proofId);
      throw new SDKError('Failed to request proof', 'PROOF_REQUEST_FAILED', { error });
    }
  }
  
  async getProofStatus(proofId: string): Promise<ProofStatus> {
    // Check local cache
    if (this.pendingProofs.has(proofId)) {
      return this.pendingProofs.get(proofId)!;
    }
    
    if (!this.connected) {
      throw new SDKError('Not connected to proof service', 'PROOF_SERVICE_NOT_CONNECTED');
    }
    
    try {
      const response = await fetch(`${this.endpoint}/proof/status/${proofId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to get proof status: ${response.statusText}`);
      }
      
      const status = await response.json();
      
      // Update local cache
      if (status) {
        this.pendingProofs.set(proofId, status);
      }
      
      return status;
      
    } catch (error) {
      throw new SDKError('Failed to get proof status', 'PROOF_STATUS_FAILED', { error });
    }
  }
  
  async getProofResult(proofId: string): Promise<ProofResult> {
    if (!this.connected) {
      throw new SDKError('Not connected to proof service', 'PROOF_SERVICE_NOT_CONNECTED');
    }
    
    try {
      const response = await fetch(`${this.endpoint}/proof/result/${proofId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to get proof result: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // Verify the proof structure locally
      const verified = await this.verifier.verifyProofStructure(result.proof);
      result.verified = verified;
      
      return result;
      
    } catch (error) {
      throw new SDKError('Failed to get proof result', 'PROOF_RESULT_FAILED', { error });
    }
  }
  
  async verifyProof(proof: string, publicInputs?: string[]): Promise<boolean> {
    // Basic verification in browser
    const structureValid = await this.verifier.verifyProofStructure(proof);
    
    if (!structureValid) {
      return false;
    }
    
    if (publicInputs) {
      return this.verifier.verifyPublicInputs(proof, publicInputs);
    }
    
    return true;
  }
  
  async submitProofToChain(
    proof: string,
    sessionId: string | bigint,
    jobId: string | bigint
  ): Promise<string> {
    if (!this.contractManager) {
      throw new SDKError('Contract manager not initialized', 'CONTRACT_NOT_INITIALIZED');
    }
    
    try {
      // Get the proof system contract
      const proofSystem = await this.contractManager.getProofSystemContract();
      
      // Submit proof to blockchain
      const tx = await proofSystem.submitProof(
        jobId,
        sessionId,
        proof
      );
      
      // Wait for confirmation
      const receipt = await tx.wait();
      
      // Update status
      const proofId = this.generateProofIdFromSession(sessionId.toString());
      if (this.pendingProofs.has(proofId)) {
        const status = this.pendingProofs.get(proofId)!;
        status.status = 'submitted';
        this.pendingProofs.set(proofId, status);
      }
      
      return receipt.transactionHash;
      
    } catch (error) {
      throw new SDKError('Failed to submit proof to chain', 'PROOF_SUBMISSION_FAILED', { error });
    }
  }
  
  isAvailable(): boolean {
    return this.connected;
  }
  
  private generateProofId(request: ProofRequest): string {
    const data = `${request.sessionId}-${request.jobId}-${request.tokensUsed}-${Date.now()}`;
    return btoa(data).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
  }
  
  private generateProofIdFromSession(sessionId: string): string {
    return btoa(sessionId).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
  }
  
  private async pollProofStatus(proofId: string): Promise<void> {
    const maxAttempts = 60; // 5 minutes with 5 second intervals
    let attempts = 0;
    
    const poll = async () => {
      if (attempts >= maxAttempts) {
        const status = this.pendingProofs.get(proofId);
        if (status) {
          status.status = 'failed';
          status.error = 'Proof generation timeout';
          this.pendingProofs.set(proofId, status);
        }
        return;
      }
      
      try {
        const status = await this.getProofStatus(proofId);
        
        if (status.status === 'ready' || status.status === 'verified' || status.status === 'failed') {
          // Final state reached
          return;
        }
        
        // Continue polling
        attempts++;
        setTimeout(poll, 5000);
        
      } catch (error) {
        console.error('Error polling proof status:', error);
        attempts++;
        setTimeout(poll, 5000);
      }
    };
    
    // Start polling after a delay
    setTimeout(poll, 2000);
  }
}