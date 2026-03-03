import type { FabstirSDKCore } from '@fabstir/sdk-core';
import type { OrchestratorSession, SessionAdapterConfig } from '../types';

export interface PromptOptions {
  signal?: AbortSignal;
  onTokenUsage?: (usage: { totalTokens: number }) => void;
  [key: string]: any;
}

export class SessionAdapter {
  private readonly sdk: FabstirSDKCore;

  constructor(sdk: FabstirSDKCore) {
    this.sdk = sdk;
  }

  async createSession(
    model: string,
    config: SessionAdapterConfig,
  ): Promise<OrchestratorSession> {
    const sessionManager = this.sdk.getSessionManager();
    const sessionConfig = {
      modelId: model,
      host: '',
      chainId: config.chainId,
      depositAmount: config.depositAmount,
      encryption: config.encryption ?? true,
      paymentToken: config.paymentToken,
      paymentMethod: 'deposit' as const,
      pricePerToken: 0,
      proofInterval: 100,
      duration: 3600,
    };

    const { sessionId, jobId } = await sessionManager.startSession(sessionConfig);
    return { sessionId, jobId, model, chainId: config.chainId };
  }

  async sendPrompt(
    sessionId: bigint,
    prompt: string,
    systemPrompt?: string,
    onToken?: (token: string) => void,
    options?: PromptOptions,
  ): Promise<{ response: string; tokensUsed: number }> {
    const sessionManager = this.sdk.getSessionManager();
    const combinedPrompt = systemPrompt
      ? `System: ${systemPrompt}\n\n${prompt}`
      : prompt;

    let tokensUsed = 0;
    const enrichedOptions: PromptOptions = {
      ...options,
      onTokenUsage: (usage: { totalTokens: number }) => {
        tokensUsed = usage.totalTokens;
        options?.onTokenUsage?.(usage);
      },
    };

    const response = await sessionManager.sendPromptStreaming(
      sessionId,
      combinedPrompt,
      onToken,
      enrichedOptions,
    );

    if (tokensUsed === 0) {
      tokensUsed = Math.ceil(response.length / 4);
    }

    return { response, tokensUsed };
  }

  async endSession(sessionId: bigint): Promise<void> {
    const sessionManager = this.sdk.getSessionManager();
    await sessionManager.endSession(sessionId);
  }

  getSDK(): FabstirSDKCore {
    return this.sdk;
  }
}
