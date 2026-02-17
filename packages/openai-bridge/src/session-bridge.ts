import 'fake-indexeddb/auto';
import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import { FabstirSDKCore, ChainRegistry, ChainId } from '@fabstir/sdk-core';
import { OpenAIBridgeConfig } from './config';

export interface SendPromptResult {
  response: string;
  tokenUsage?: { llmTokens: number; vlmTokens: number; totalTokens: number };
}

export class SessionBridge {
  private config: OpenAIBridgeConfig;
  private sdk?: FabstirSDKCore;
  private sessionManager?: any;
  private sessionId?: bigint;
  private queue: Array<{ execute: () => Promise<void> }> = [];
  private processing = false;
  private lastResetTime = 0;
  private consecutiveFailures = 0;
  private circuitError: string | null = null;
  private circuitOpenTime = 0;
  private static RESET_COOLDOWN_MS = 5000;
  private static CIRCUIT_OPEN_MS = 60000;
  private static CIRCUIT_THRESHOLD = 2;

  constructor(config: OpenAIBridgeConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    const chain = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
    this.sdk = new FabstirSDKCore({
      chainId: this.config.chainId,
      rpcUrl: this.config.rpcUrl || chain.rpcUrl,
      contractAddresses: { ...chain.contracts },
      mode: 'production' as const,
    });
    await this.sdk.authenticate('privatekey', { privateKey: this.config.privateKey });
    this.sessionManager = this.sdk.getSessionManager();

    const localhostOverride = this.config.localhostOverride || process.env.OPENAI_BRIDGE_LOCALHOST_OVERRIDE;
    if (localhostOverride && this.sessionManager.setEndpointTransform) {
      this.sessionManager.setEndpointTransform((url: string) =>
        url.replace(/\blocalhost\b/g, localhostOverride).replace(/\b127\.0\.0\.1\b/g, localhostOverride)
      );
    }
  }

  async ensureSession(): Promise<bigint> {
    if (this.sessionId !== undefined) return this.sessionId;
    const sessionConfig: Record<string, any> = {
      chainId: this.config.chainId,
      modelId: this.config.modelName,
      paymentMethod: 'deposit' as const,
      depositAmount: this.config.depositAmount,
      pricePerToken: this.config.pricePerToken,
      proofInterval: this.config.proofInterval,
      duration: this.config.duration,
      encryption: true,
    };
    if (this.config.hostAddress) sessionConfig.host = this.config.hostAddress;
    const { sessionId } = await this.sessionManager.startSession(sessionConfig);
    this.sessionId = sessionId;
    return sessionId;
  }

  async sendPrompt(prompt: string, onToken?: (token: string) => void, options?: any): Promise<SendPromptResult> {
    return this.enqueue(() => this.doSendPrompt(prompt, onToken, options));
  }

  private static isRecoverableSessionError(err: any): boolean {
    const code = err?.code || '';
    const msg = err?.message || '';
    return code === 'SESSION_NOT_FOUND' || code === 'SESSION_NOT_ACTIVE'
      || msg.includes('SESSION_NOT_FOUND') || msg.includes('SESSION_NOT_ACTIVE')
      || msg.includes('decrypt') || msg.includes('aead') || msg.includes('Decryption failed');
  }

  private async doSendPrompt(prompt: string, onToken?: (token: string) => void, options?: any): Promise<SendPromptResult> {
    // Circuit breaker: if open, reject immediately
    if (this.isCircuitOpen()) {
      throw new Error(`Circuit breaker open (${this.circuitError}). Will retry after ${Math.ceil((SessionBridge.CIRCUIT_OPEN_MS - (Date.now() - this.circuitOpenTime)) / 1000)}s.`);
    }

    // Cooldown: if we recently reset due to a persistent error, fail fast
    const now = Date.now();
    if (this.sessionId === undefined && this.lastResetTime > 0 && now - this.lastResetTime < SessionBridge.RESET_COOLDOWN_MS) {
      throw new Error('Session recovery cooldown active — last reset was too recent (decryption/session error). Retry in a few seconds.');
    }

    const sessionId = await this.ensureSession();
    try {
      const response = await this.sessionManager.sendPromptStreaming(sessionId, prompt, onToken, options);
      const tokenUsage = this.sessionManager.getLastTokenUsage(sessionId);
      this.consecutiveFailures = 0;
      this.circuitError = null;
      return { response, tokenUsage };
    } catch (err: any) {
      if (!SessionBridge.isRecoverableSessionError(err)) throw err;
      this.consecutiveFailures++;
      console.error(`[${new Date().toISOString()}] Recoverable session error, resetting: ${err.message}`);
      this.sessionId = undefined;
      this.lastResetTime = Date.now();
      try {
        const newId = await this.ensureSession();
        const response = await this.sessionManager.sendPromptStreaming(newId, prompt, onToken, options);
        const tokenUsage = this.sessionManager.getLastTokenUsage(newId);
        this.consecutiveFailures = 0;
        this.circuitError = null;
        return { response, tokenUsage };
      } catch (retryErr: any) {
        // Recovery also failed — open circuit breaker
        this.consecutiveFailures++;
        this.circuitError = retryErr?.message || 'Unknown error';
        this.circuitOpenTime = Date.now();
        this.sessionId = undefined;
        console.error(`[${new Date().toISOString()}] Circuit breaker OPEN after ${this.consecutiveFailures} failures. Will block requests for ${SessionBridge.CIRCUIT_OPEN_MS / 1000}s.`);
        throw retryErr;
      }
    }
  }

  async shutdown(): Promise<void> {
    if (this.sessionId !== undefined && this.sessionManager) {
      try { await this.sessionManager.endSession(this.sessionId); } catch { /* best-effort */ }
      this.sessionId = undefined;
    }
    this.sdk = undefined;
    this.sessionManager = undefined;
  }

  async resetSession(): Promise<bigint> {
    this.sessionId = undefined;
    return this.ensureSession();
  }

  isCircuitOpen(): boolean {
    if (this.consecutiveFailures < SessionBridge.CIRCUIT_THRESHOLD) return false;
    if (Date.now() - this.circuitOpenTime > SessionBridge.CIRCUIT_OPEN_MS) {
      // Half-open: allow one retry
      this.consecutiveFailures = 0;
      this.circuitError = null;
      return false;
    }
    return true;
  }

  getCircuitError(): string | null { return this.circuitError; }

  getSessionManager(): any { return this.sessionManager; }
  getSessionId(): bigint | undefined { return this.sessionId; }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        execute: async () => { try { resolve(await fn()); } catch (e) { reject(e); } },
      });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      await item.execute();
    }
    this.processing = false;
  }
}
