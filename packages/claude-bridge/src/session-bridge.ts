import 'fake-indexeddb/auto';
import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import { FabstirSDKCore, ChainRegistry, ChainId } from '@fabstir/sdk-core';
import { BridgeConfig } from './config';

export interface SendPromptResult {
  response: string;
  tokenUsage?: { llmTokens: number; vlmTokens: number; totalTokens: number };
}

export class SessionBridge {
  private config: BridgeConfig;
  private sdk?: FabstirSDKCore;
  private sessionManager?: any;
  private sessionId?: bigint;
  private queue: Array<{ execute: () => Promise<void> }> = [];
  private processing = false;

  constructor(config: BridgeConfig) {
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

    // Docker: rewrite localhost in discovered host URLs
    const localhostOverride = process.env.CLAUDE_BRIDGE_LOCALHOST_OVERRIDE;
    if (localhostOverride && this.sessionManager.setEndpointTransform) {
      this.sessionManager.setEndpointTransform((url: string) =>
        url.replace(/\blocalhost\b/g, localhostOverride)
           .replace(/\b127\.0\.0\.1\b/g, localhostOverride)
      );
      console.log(`[SessionBridge] Endpoint localhost override: ${localhostOverride}`);
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
    if (this.config.hostAddress) {
      sessionConfig.host = this.config.hostAddress;
    }
    const { sessionId } = await this.sessionManager.startSession(sessionConfig);
    this.sessionId = sessionId;
    return sessionId;
  }

  async sendPrompt(
    prompt: string,
    onToken?: (token: string) => void,
    options?: any
  ): Promise<SendPromptResult> {
    return this.enqueue(() => this.doSendPrompt(prompt, onToken, options));
  }

  private async doSendPrompt(
    prompt: string, onToken?: (token: string) => void, options?: any
  ): Promise<SendPromptResult> {
    const sessionId = await this.ensureSession();
    try {
      const response = await this.sessionManager.sendPromptStreaming(sessionId, prompt, onToken, options);
      const tokenUsage = this.sessionManager.getLastTokenUsage(sessionId);
      return { response, tokenUsage };
    } catch (err: any) {
      const code = err?.code || '';
      const msg = err?.message || '';
      const isSessionErr = code === 'SESSION_NOT_FOUND' || code === 'SESSION_NOT_ACTIVE'
        || msg.includes('SESSION_NOT_FOUND') || msg.includes('SESSION_NOT_ACTIVE');
      if (!isSessionErr) throw err;
      // Auto-recovery: clear session and retry once
      this.sessionId = undefined;
      const newId = await this.ensureSession();
      const response = await this.sessionManager.sendPromptStreaming(newId, prompt, onToken, options);
      const tokenUsage = this.sessionManager.getLastTokenUsage(newId);
      return { response, tokenUsage };
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
