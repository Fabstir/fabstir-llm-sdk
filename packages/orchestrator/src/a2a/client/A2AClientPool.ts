import type { A2AAgentCard } from '../types';
import type { SubTaskResult } from '../../types';

interface DelegateOptions {
  streaming?: boolean;
  signal?: AbortSignal;
}

export class A2AClientPool {
  private readonly cardCache = new Map<string, A2AAgentCard>();

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
    // Ensure we have the agent card
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

    const response = await fetch(`${agentUrl}/a2a/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options?.signal,
    });

    if (!response.ok) {
      throw new Error(`A2A delegation failed: ${response.status}`);
    }

    const data = (await response.json()) as any;
    const artifacts = data.result?.artifacts ?? [];
    const textParts: string[] = [];

    for (const artifact of artifacts) {
      for (const part of artifact.parts ?? []) {
        if (part.type === 'text' && part.text) {
          textParts.push(part.text);
        }
      }
    }

    return {
      taskId: body.params.id,
      model: `external:${agentUrl}`,
      summary: textParts.join(' '),
      artifacts,
    };
  }
}
