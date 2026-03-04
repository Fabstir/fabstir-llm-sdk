import type { A2AAgentCard } from '../types';
import type { SubTaskResult } from '../../types';
import type { X402PaymentHandler } from '../../x402/client/X402PaymentHandler';
import type { X402BudgetTracker } from '../../x402/client/X402BudgetTracker';

interface DelegateOptions {
  streaming?: boolean;
  signal?: AbortSignal;
}

interface A2AClientPoolOptions {
  paymentHandler?: X402PaymentHandler;
  budgetTracker?: X402BudgetTracker;
}

export class A2AClientPool {
  private readonly cardCache = new Map<string, A2AAgentCard>();
  private readonly paymentHandler?: X402PaymentHandler;
  private readonly budgetTracker?: X402BudgetTracker;

  constructor(options?: A2AClientPoolOptions) {
    this.paymentHandler = options?.paymentHandler;
    this.budgetTracker = options?.budgetTracker;
  }

  async discover(agentUrl: string): Promise<A2AAgentCard> {
    const cached = this.cardCache.get(agentUrl);
    if (cached) return cached;

    const response = await fetch(`${agentUrl}/.well-known/agent.json`);
    if (!response.ok) {
      throw new Error(`Failed to discover agent at ${agentUrl}: ${response.status}`);
    }
    const card = (await response.json()) as A2AAgentCard;
    this.cardCache.set(agentUrl, card);
    return card;
  }

  async delegate(
    agentUrl: string,
    prompt: string,
    options?: DelegateOptions,
  ): Promise<SubTaskResult> {
    await this.discover(agentUrl);

    const body = {
      jsonrpc: '2.0',
      method: options?.streaming ? 'tasks/sendSubscribe' : 'tasks/send',
      params: {
        id: crypto.randomUUID(),
        message: {
          role: 'user',
          parts: [{ type: 'text', text: prompt }],
        },
      },
    };

    const fetchOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' } as Record<string, string>,
      body: JSON.stringify(body),
      signal: options?.signal,
    };

    const response = await fetch(`${agentUrl}/a2a/jsonrpc`, fetchOptions);

    if (response.status === 402) {
      if (!this.paymentHandler) {
        throw new Error('x402 payment required but no handler configured');
      }
      const requirements = await this.paymentHandler.parseRequirements(response);
      const req = requirements.accepts[0];
      this.budgetTracker?.checkBudget(req.maxAmountRequired);
      const paymentHeader = await this.paymentHandler.createPaymentHeader(req);

      const retryResponse = await fetch(`${agentUrl}/a2a/jsonrpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-PAYMENT': paymentHeader },
        body: JSON.stringify(body),
        signal: options?.signal,
      });

      if (!retryResponse.ok) {
        throw new Error(`x402 payment retry failed: ${retryResponse.status}`);
      }
      this.budgetTracker?.recordSpend(req.maxAmountRequired);
      return this.parseResult(retryResponse, body.params.id, agentUrl);
    }

    if (!response.ok) {
      throw new Error(`A2A delegation failed: ${response.status}`);
    }

    return this.parseResult(response, body.params.id, agentUrl);
  }

  private async parseResult(response: { json(): Promise<any> }, taskId: string, agentUrl: string): Promise<SubTaskResult> {
    const data = (await response.json()) as any;
    const artifacts = data.result?.artifacts ?? [];
    const textParts: string[] = [];
    for (const artifact of artifacts) {
      for (const part of artifact.parts ?? []) {
        if (part.type === 'text' && part.text) textParts.push(part.text);
      }
    }
    return { taskId, model: `external:${agentUrl}`, summary: textParts.join(' '), artifacts };
  }
}
