import { EventEmitter } from 'events';
import { MessageHandler } from '../websocket/handlers';
import { CheckpointTracker } from './checkpoint';
import { ProofSubmitter } from './submitter';
import { ProofTracker } from './tracker';
import { ProofRetryManager } from './retry';

export interface ProofSystemConfig {
  checkpointThreshold?: number;
  autoSubmit?: boolean;
  maxRetries?: number;
  retryDelay?: number;
}

export interface ProofIntegrationEvents {
  'proof-ready': (data: any) => void;
  'proof-submitted': (data: any) => void;
  'proof-failed': (data: any) => void;
  'checkpoint-reached': (data: any) => void;
}

/**
 * Integrates WebSocket message handling with proof submission
 */
export class ProofIntegration extends EventEmitter {
  private messageHandler: MessageHandler;
  private checkpointTracker: CheckpointTracker;
  private proofSubmitter: ProofSubmitter;
  private proofTracker: ProofTracker;
  private retryManager: ProofRetryManager;
  private config: ProofSystemConfig;

  constructor(
    messageHandler: MessageHandler,
    config?: ProofSystemConfig
  ) {
    super();
    this.messageHandler = messageHandler;
    this.config = {
      checkpointThreshold: 100,
      autoSubmit: true,
      maxRetries: 3,
      retryDelay: 1000,
      ...config
    };

    // Initialize components
    this.checkpointTracker = new CheckpointTracker({
      threshold: this.config.checkpointThreshold,
      autoSubmit: this.config.autoSubmit
    });

    this.proofSubmitter = new ProofSubmitter();
    this.proofTracker = new ProofTracker();

    this.retryManager = new ProofRetryManager({
      submitFn: (proof) => this.proofSubmitter.submitProof(proof),
      maxAttempts: this.config.maxRetries,
      initialDelay: this.config.retryDelay
    });

    this.setupEventHandlers();
  }

  /**
   * Setup event handlers for WebSocket messages
   */
  private setupEventHandlers(): void {
    // Listen for inference-complete events with proof data
    this.messageHandler.on('inference-complete', async (message) => {
      await this.handleInferenceComplete(message);
    });

    // Listen for progress events to track token accumulation
    this.messageHandler.on('progress', (message) => {
      if (message.sessionId && message.tokensGenerated) {
        this.checkpointTracker.addTokens(message.sessionId, message.tokensGenerated);
      }
    });

    // Listen for session-end events
    this.messageHandler.on('session-end', (message) => {
      this.handleSessionEnd(message);
    });

    // Listen for checkpoint events from tracker
    this.checkpointTracker.on('checkpoint-reached', async (data) => {
      await this.handleCheckpointReached(data);
    });

    // Listen for auto-submit events
    this.checkpointTracker.on('auto-submit', async (data) => {
      if (this.config.autoSubmit) {
        await this.submitCheckpointProof(data);
      }
    });

    // Listen for proof submission events
    this.proofSubmitter.on('proof-submitted', async (data) => {
      await this.handleProofSubmitted(data);
    });

    this.proofSubmitter.on('proof-failed', async (data) => {
      await this.handleProofFailed(data);
    });

    // Setup retry manager
    this.retryManager.on('retry-exhausted', (data) => {
      console.error('Proof retry exhausted:', data);
      this.emit('proof-exhausted', data);
    });
  }

  /**
   * Handle inference complete message with proof
   */
  private async handleInferenceComplete(message: any): Promise<void> {
    if (!message.proof) {
      console.warn('Inference complete without proof:', message.sessionId);
      return;
    }

    // Extract proof data from message
    const proofData = {
      sessionId: message.sessionId,
      jobId: BigInt(message.jobId || 0),
      tokensClaimed: message.tokensUsed || message.tokensGenerated || 0,
      proof: this.extractProofBytes(message.proof),
      timestamp: Date.now(),
      modelHash: message.proof.model_hash,
      inputHash: message.proof.input_hash,
      outputHash: message.proof.output_hash
    };

    // Track tokens for checkpoint
    if (proofData.tokensClaimed > 0) {
      this.checkpointTracker.addTokens(
        proofData.sessionId,
        proofData.tokensClaimed
      );
    }

    // Store proof for later submission at checkpoint
    this.emit('proof-ready', proofData);
  }

  /**
   * Handle checkpoint reached event
   */
  private async handleCheckpointReached(data: any): Promise<void> {
    console.log(`Checkpoint reached for session ${data.sessionId}: ${data.tokenCount} tokens`);
    this.emit('checkpoint-reached', data);

    if (this.config.autoSubmit) {
      await this.submitCheckpointProof(data);
    }
  }

  /**
   * Submit proof for checkpoint
   */
  private async submitCheckpointProof(data: any): Promise<void> {
    // Get the session stats from message handler
    const sessionStats = this.messageHandler.getSessionStats(data.sessionId);
    if (!sessionStats) {
      console.error('No session stats found for:', data.sessionId);
      return;
    }

    // Create proof data for submission
    const proofData = {
      sessionId: data.sessionId,
      jobId: BigInt(data.jobId || this.extractJobId(data.sessionId)),
      tokensClaimed: data.tokenCount,
      proof: await this.generateCheckpointProof(data),
      timestamp: Date.now()
    };

    try {
      // Submit proof to blockchain
      const result = await this.proofSubmitter.submitProof(proofData);

      if (result.success) {
        // Mark checkpoint as processed
        this.checkpointTracker.markCheckpointProcessed(
          data.sessionId,
          data.checkpoint
        );

        // Track in history
        await this.proofTracker.addProof({
          ...proofData,
          checkpoint: data.checkpoint,
          txHash: result.txHash,
          status: 'submitted'
        });
      } else {
        // Add to retry queue
        this.retryManager.addToRetryQueue(proofData);
      }
    } catch (error) {
      console.error('Failed to submit checkpoint proof:', error);
      // Add to retry queue
      this.retryManager.addToRetryQueue(proofData);
    }
  }

  /**
   * Handle successful proof submission
   */
  private async handleProofSubmitted(data: any): Promise<void> {
    console.log('Proof submitted successfully:', data.txHash);

    // Update proof tracker
    const sessionStats = this.checkpointTracker.getSessionStatistics(data.proofData.sessionId);
    if (sessionStats) {
      await this.proofTracker.updateProofStatus(
        data.proofData.sessionId,
        sessionStats.checkpoints,
        'confirmed',
        { txHash: data.txHash }
      );
    }

    this.emit('proof-submitted', data);
  }

  /**
   * Handle failed proof submission
   */
  private async handleProofFailed(data: any): Promise<void> {
    console.error('Proof submission failed:', data.error);

    // Add to retry queue
    this.retryManager.addToRetryQueue(data.proofData, 1);

    this.emit('proof-failed', data);
  }

  /**
   * Handle session end
   */
  private handleSessionEnd(message: any): void {
    // Submit any remaining tokens as final checkpoint
    const remaining = this.checkpointTracker.getRemainingTokens(message.sessionId);
    if (remaining > 0) {
      console.log(`Session ended with ${remaining} remaining tokens`);
      // Could submit final proof here if needed
    }

    // Generate session summary
    const summary = this.generateSessionSummary(message.sessionId);
    this.emit('session-summary', summary);
  }

  /**
   * Extract proof bytes from proof data
   */
  private extractProofBytes(proof: any): string {
    if (typeof proof === 'string') {
      return proof;
    }

    if (proof.proof_data) {
      return proof.proof_data;
    }

    // Generate simple proof hash if no proof data
    const data = JSON.stringify(proof);
    return '0x' + Buffer.from(data).toString('hex');
  }

  /**
   * Extract job ID from session ID
   */
  private extractJobId(sessionId: string): number {
    // Try to extract numeric job ID from session ID
    const match = sessionId.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  }

  /**
   * Generate checkpoint proof
   */
  private async generateCheckpointProof(data: any): Promise<string> {
    // In production, this would request proof from fabstir-llm-node
    // For now, generate a mock proof
    const proofData = {
      sessionId: data.sessionId,
      checkpoint: data.checkpoint,
      tokens: data.tokenCount,
      timestamp: Date.now()
    };

    return '0x' + Buffer.from(JSON.stringify(proofData)).toString('hex');
  }

  /**
   * Generate session summary
   */
  private generateSessionSummary(sessionId: string): any {
    const checkpointStats = this.checkpointTracker.getSessionStatistics(sessionId);
    const sessionStats = this.messageHandler.getSessionStats(sessionId);
    const proofs = this.proofTracker.getSessionProofs(sessionId);

    return {
      sessionId,
      checkpointStats,
      sessionStats,
      proofs: proofs.length,
      successfulProofs: proofs.filter(p => p.status === 'confirmed').length,
      failedProofs: proofs.filter(p => p.status === 'failed').length,
      pendingProofs: proofs.filter(p => p.status === 'pending').length
    };
  }

  /**
   * Start automatic retry processing
   */
  startAutoRetry(interval?: number): void {
    this.retryManager.startAutoRetry(interval || 30000);
  }

  /**
   * Stop automatic retry processing
   */
  stopAutoRetry(): void {
    this.retryManager.stopAutoRetry();
  }

  /**
   * Get statistics
   */
  getStatistics(): any {
    return {
      checkpoint: this.checkpointTracker.getStatistics(),
      submission: this.proofSubmitter.getStatistics(),
      tracker: this.proofTracker.getSummary(),
      retry: this.retryManager.getStatistics()
    };
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    this.stopAutoRetry();
    this.retryManager.stop();
    await this.proofTracker.saveHistory();
    this.removeAllListeners();
  }
}