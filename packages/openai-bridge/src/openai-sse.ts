import { randomUUID } from 'crypto';

export function generateMessageId(): string {
  return 'chatcmpl-' + randomUUID();
}

function chunk(id: string, model: string, delta: any, finishReason: string | null = null): string {
  const data = {
    id, object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000), model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
  return `data: ${JSON.stringify(data)}\n\n`;
}

export function buildRoleDelta(id: string, model: string): string {
  return chunk(id, model, { role: 'assistant' });
}

export function buildContentDelta(id: string, model: string, content: string): string {
  return chunk(id, model, { content });
}

export function buildToolCallDelta(
  id: string, model: string, toolCallIndex: number,
  toolCallId?: string, functionName?: string, argumentChunk?: string
): string {
  const tc: any = { index: toolCallIndex };
  if (toolCallId) {
    tc.id = toolCallId;
    tc.type = 'function';
    tc.function = { name: functionName || '' };
  } else {
    tc.function = { arguments: argumentChunk || '' };
  }
  return chunk(id, model, { tool_calls: [tc] });
}

export function buildFinishDelta(id: string, model: string, finishReason: string): string {
  return chunk(id, model, {}, finishReason);
}

export function buildDoneEvent(): string {
  return 'data: [DONE]\n\n';
}

export function generateToolCallId(): string {
  return 'call_' + randomUUID().replace(/-/g, '').slice(0, 24);
}
