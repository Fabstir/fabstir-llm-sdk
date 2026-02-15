import { randomUUID } from 'crypto';

export function generateMessageId(): string {
  return 'msg_' + randomUUID();
}

function sseEvent(event: string, data: object): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function buildMessageStart(msgId: string, model: string, inputTokens: number): string {
  return sseEvent('message_start', {
    type: 'message_start',
    message: {
      id: msgId,
      type: 'message',
      role: 'assistant',
      content: [],
      model,
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: inputTokens, output_tokens: 1 },
    },
  });
}

export function buildContentBlockStart(index: number): string {
  return sseEvent('content_block_start', {
    type: 'content_block_start',
    index,
    content_block: { type: 'text', text: '' },
  });
}

export function buildContentBlockDelta(index: number, text: string): string {
  return sseEvent('content_block_delta', {
    type: 'content_block_delta',
    index,
    delta: { type: 'text_delta', text },
  });
}

export function buildContentBlockStop(index: number): string {
  return sseEvent('content_block_stop', {
    type: 'content_block_stop',
    index,
  });
}

export function buildMessageDelta(stopReason: string, outputTokens: number): string {
  return sseEvent('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: outputTokens },
  });
}

export function buildMessageStop(): string {
  return sseEvent('message_stop', {
    type: 'message_stop',
  });
}

export function buildErrorEvent(errorType: string, message: string): string {
  return sseEvent('error', {
    type: 'error',
    error: { type: errorType, message },
  });
}

export function generateToolUseId(): string {
  return 'toolu_' + randomUUID();
}

export function buildToolUseBlockStart(index: number, id: string, name: string): string {
  return sseEvent('content_block_start', {
    type: 'content_block_start',
    index,
    content_block: { type: 'tool_use', id, name, input: {} },
  });
}

export function buildInputJsonDelta(index: number, partialJson: string): string {
  return sseEvent('content_block_delta', {
    type: 'content_block_delta',
    index,
    delta: { type: 'input_json_delta', partial_json: partialJson },
  });
}
