// Copyright (c) 2025 Fabstir — BUSL-1.1

import type { X402PaymentResponse } from './types';
import type { X402FetchClient, X402FetchBudgetTracker } from './x402Fetch';
import { x402Fetch } from './x402Fetch';

export interface X402HostClientOptions {
  hostUrl: string;
  x402Client: X402FetchClient;
  budgetTracker?: X402FetchBudgetTracker;
}

export interface InferenceRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  maxTokens?: number;
}

export interface InferenceResponse {
  text: string;
  tokensUsed: number;
  paymentResponse?: X402PaymentResponse;
}

export class X402HostClient {
  private readonly hostUrl: string;
  private readonly x402Client: X402FetchClient;
  private readonly budgetTracker?: X402FetchBudgetTracker;

  constructor(options: X402HostClientOptions) {
    this.hostUrl = options.hostUrl.replace(/\/$/, ''); // trim trailing slash
    this.x402Client = options.x402Client;
    this.budgetTracker = options.budgetTracker;
  }

  async infer(request: InferenceRequest): Promise<InferenceResponse> {
    const url = `${this.hostUrl}/v1/chat/completions`;

    const response = await x402Fetch(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          stream: request.stream ?? false,
          max_tokens: request.maxTokens,
        }),
      },
      this.x402Client,
      this.budgetTracker,
    );

    if (!response.ok) {
      throw new Error(`Host inference failed: ${response.status}`);
    }

    const data = (await response.json()) as any;

    // Parse x402 payment response if present
    let paymentResponse: X402PaymentResponse | undefined;
    const paymentHeader = response.headers.get('X-PAYMENT-RESPONSE');
    if (paymentHeader) {
      try {
        paymentResponse = JSON.parse(atob(paymentHeader)) as X402PaymentResponse;
      } catch {
        /* ignore parse errors */
      }
    }

    return {
      text: data.choices?.[0]?.message?.content ?? data.text ?? '',
      tokensUsed: data.usage?.total_tokens ?? 0,
      paymentResponse,
    };
  }

  getHostUrl(): string {
    return this.hostUrl;
  }
}
