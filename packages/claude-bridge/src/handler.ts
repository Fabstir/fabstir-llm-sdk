import { IncomingMessage, ServerResponse } from 'http';
import type { AnthropicRequest } from './types';
import { convertMessages, estimateInputTokens } from './converter';
import {
  generateMessageId,
  buildMessageStart,
  buildContentBlockStart,
  buildContentBlockDelta,
  buildContentBlockStop,
  buildMessageDelta,
  buildMessageStop,
  buildErrorEvent,
} from './sse';
import type { SessionBridge } from './session-bridge';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: string | Buffer) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendError(res: ServerResponse, status: number, errorType: string, message: string): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ type: 'error', error: { type: errorType, message } }));
}

export async function handleMessages(
  req: IncomingMessage,
  res: ServerResponse,
  bridge: SessionBridge
): Promise<void> {
  let body: AnthropicRequest;
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw);
  } catch {
    sendError(res, 400, 'invalid_request_error', 'Invalid JSON body');
    return;
  }

  // Validate required fields
  if (!body.messages || !Array.isArray(body.messages)) {
    sendError(res, 400, 'invalid_request_error', 'Missing required field: messages');
    return;
  }
  if (body.messages.length === 0) {
    sendError(res, 400, 'invalid_request_error', 'Messages array must not be empty');
    return;
  }
  if (!body.max_tokens || body.max_tokens <= 0) {
    sendError(res, 400, 'invalid_request_error', 'Missing or invalid required field: max_tokens');
    return;
  }

  let prompt: string;
  let images: any[];
  try {
    const converted = convertMessages(body.messages, body.system);
    prompt = converted.prompt;
    images = converted.images;
  } catch (err: any) {
    sendError(res, 400, 'invalid_request_error', err.message);
    return;
  }

  const inputTokens = estimateInputTokens(prompt);
  const model = body.model || 'unknown';

  if (body.stream === true) {
    await handleStreaming(res, bridge, prompt, images, inputTokens, model);
  } else {
    await handleNonStreaming(res, bridge, prompt, images, inputTokens, model);
  }
}

async function handleNonStreaming(
  res: ServerResponse,
  bridge: SessionBridge,
  prompt: string,
  images: any[],
  inputTokens: number,
  model: string
): Promise<void> {
  try {
    const opts = images.length > 0 ? { images } : undefined;
    const { response, tokenUsage } = await bridge.sendPrompt(prompt, undefined, opts);
    const outputTokens = tokenUsage?.llmTokens || 0;
    const result = {
      id: generateMessageId(),
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: response }],
      model,
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (err: any) {
    console.error('[BridgeHandler] Non-streaming error:', err.stack || err);
    sendError(res, 500, 'api_error', err.message || 'Internal error');
  }
}

async function handleStreaming(
  res: ServerResponse,
  bridge: SessionBridge,
  prompt: string,
  images: any[],
  inputTokens: number,
  model: string
): Promise<void> {
  const msgId = generateMessageId();
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.flushHeaders();

  res.write(buildMessageStart(msgId, model, inputTokens));
  res.write(buildContentBlockStart(0));

  try {
    const opts = images.length > 0 ? { images } : undefined;
    const onToken = (token: string) => {
      res.write(buildContentBlockDelta(0, token));
    };
    const { tokenUsage } = await bridge.sendPrompt(prompt, onToken, opts);
    const outputTokens = tokenUsage?.llmTokens || 0;

    res.write(buildContentBlockStop(0));
    res.write(buildMessageDelta('end_turn', outputTokens));
    res.write(buildMessageStop());
    res.end();
  } catch (err: any) {
    console.error('[BridgeHandler] Streaming error:', err.stack || err);
    res.write(buildErrorEvent('api_error', err.message || 'Internal error'));
    res.end();
  }
}
