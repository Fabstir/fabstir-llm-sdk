import { IncomingMessage, ServerResponse } from 'http';
import type { AnthropicRequest, AnthropicTool } from './types';
import { convertMessages, estimateInputTokens } from './converter';
import {
  generateMessageId,
  generateToolUseId,
  buildMessageStart,
  buildContentBlockStart,
  buildContentBlockDelta,
  buildContentBlockStop,
  buildMessageDelta,
  buildMessageStop,
  buildErrorEvent,
  buildToolUseBlockStart,
  buildInputJsonDelta,
} from './sse';
import { ToolCallParser } from './tool-parser';
import type { SessionBridge } from './session-bridge';

const DEBUG = !!process.env.BRIDGE_DEBUG;
function debug(...args: any[]) { if (DEBUG) console.log('[DEBUG]', ...args); }

// Strip model's <think>...</think> reasoning from output
const THINK_END = '</think>';
const THINK_MAX = 8000;

function createThinkStripper(): (token: string) => string {
  let done = false;
  let buf = '';
  const THINK_PREFIX = '<think';
  return (token: string) => {
    if (done) return token;
    buf += token;
    const idx = buf.indexOf(THINK_END);
    if (idx >= 0) { done = true; return buf.slice(idx + THINK_END.length); }
    // If buffer doesn't look like start of <think> block, pass through immediately
    const trimmed = buf.trimStart();
    if (trimmed.length > 0) {
      const couldBeThink = THINK_PREFIX.startsWith(trimmed) || trimmed.startsWith(THINK_PREFIX);
      if (!couldBeThink) { done = true; return buf; }
    }
    if (buf.length > THINK_MAX) { done = true; return buf; }
    return '';
  };
}

function stripThinkFromText(text: string): string {
  const idx = text.indexOf(THINK_END);
  return idx >= 0 ? text.slice(idx + THINK_END.length) : text;
}

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

  // Claude Code may send system as array of content blocks (for prompt caching)
  let systemText: string | undefined = undefined;
  if (typeof body.system === 'string') {
    systemText = body.system;
  } else if (Array.isArray(body.system)) {
    systemText = (body.system as any[]).filter(b => b.type === 'text').map(b => b.text).join('\n');
  }

  let prompt: string;
  let images: any[];
  try {
    const converted = convertMessages(body.messages, systemText, body.tools);
    prompt = converted.prompt;
    images = converted.images;
  } catch (err: any) {
    sendError(res, 400, 'invalid_request_error', err.message);
    return;
  }

  debug('Prompt sent to model:\n' + prompt.slice(0, 2000) + (prompt.length > 2000 ? '\n...[truncated]' : ''));
  if (body.tools?.length) debug('Tools count:', body.tools.length, 'names:', body.tools.map(t => t.name).join(', '));

  const inputTokens = estimateInputTokens(prompt);
  const model = body.model || 'unknown';
  const tools = body.tools && body.tools.length > 0 ? body.tools : undefined;

  const maxTokens = body.max_tokens;

  if (body.stream === true) {
    await handleStreaming(res, bridge, prompt, images, inputTokens, model, maxTokens, tools);
  } else {
    await handleNonStreaming(res, bridge, prompt, images, inputTokens, model, tools);
  }
}

async function handleNonStreaming(
  res: ServerResponse, bridge: SessionBridge, prompt: string,
  images: any[], inputTokens: number, model: string, tools?: AnthropicTool[]
): Promise<void> {
  try {
    const opts = images.length > 0 ? { images } : undefined;
    const { response, tokenUsage } = await bridge.sendPrompt(prompt, undefined, opts);
    debug('Non-streaming full response:', JSON.stringify(response));
    const cleanResponse = stripThinkFromText(response);
    const outputTokens = tokenUsage?.llmTokens || 0;

    let content: any[];
    let stopReason = 'end_turn';

    if (tools) {
      const parser = new ToolCallParser();
      const events = [...parser.feed(cleanResponse), ...parser.flush()];
      content = [];
      for (const evt of events) {
        if (evt.type === 'text' && evt.text.trim()) {
          content.push({ type: 'text', text: evt.text });
        } else if (evt.type === 'tool_call') {
          content.push({ type: 'tool_use', id: generateToolUseId(), name: evt.name, input: evt.arguments });
          stopReason = 'tool_use';
        } else if (evt.type === 'error') {
          content.push({ type: 'text', text: evt.rawContent });
        }
      }
      if (content.length === 0) content.push({ type: 'text', text: cleanResponse });
    } else {
      content = [{ type: 'text', text: cleanResponse }];
    }

    const result = {
      id: generateMessageId(), type: 'message', role: 'assistant',
      content, model, stop_reason: stopReason, stop_sequence: null,
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
  res: ServerResponse, bridge: SessionBridge, prompt: string,
  images: any[], inputTokens: number, model: string, maxTokens: number, tools?: AnthropicTool[]
): Promise<void> {
  const msgId = generateMessageId();
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.flushHeaders();
  const write = (data: string) => { debug('SSE>>>', data.replace(/\n/g, '\\n').slice(0, 200)); res.write(data); };
  write(buildMessageStart(msgId, model, inputTokens));
  write(buildContentBlockStart(0));

  try {
    const opts = images.length > 0 ? { images } : undefined;
    let hasToolUse = false;
    let blockIndex = 0;
    let textBlockOpen = true; // We just opened text block at index 0
    let outputChars = 0;
    const maxOutputChars = Math.max(1000, maxTokens * 4);
    let outputLimitReached = false;

    const stripThink = createThinkStripper();

    if (tools) {
      const parser = new ToolCallParser();
      const processEvents = (events: any[]) => {
        for (const evt of events) {
          if (evt.type === 'text') {
            if (!textBlockOpen) {
              write(buildContentBlockStart(blockIndex));
              textBlockOpen = true;
            }
            write(buildContentBlockDelta(blockIndex, evt.text));
          } else if (evt.type === 'tool_call') {
            if (textBlockOpen) {
              write(buildContentBlockStop(blockIndex));
              blockIndex++;
              textBlockOpen = false;
            }
            const toolId = generateToolUseId();
            write(buildToolUseBlockStart(blockIndex, toolId, evt.name));
            write(buildInputJsonDelta(blockIndex, JSON.stringify(evt.arguments)));
            write(buildContentBlockStop(blockIndex));
            hasToolUse = true;
            blockIndex++;
          } else if (evt.type === 'error') {
            if (!textBlockOpen) {
              write(buildContentBlockStart(blockIndex));
              textBlockOpen = true;
            }
            write(buildContentBlockDelta(blockIndex, evt.rawContent));
          }
        }
      };

      const onToken = (token: string) => {
        if (outputLimitReached) return;
        debug('Token:', JSON.stringify(token));
        const cleaned = stripThink(token);
        if (!cleaned) return;
        outputChars += cleaned.length;
        if (outputChars > maxOutputChars) {
          outputLimitReached = true;
          console.warn(`[BridgeHandler] Output limit reached (${maxOutputChars} chars), truncating stream`);
          return;
        }
        const events = parser.feed(cleaned);
        debug('Parser events:', events.map(e => e.type).join(',') || '(none)');
        processEvents(events);
      };
      const { tokenUsage } = await bridge.sendPrompt(prompt, onToken, opts);
      const flushEvents = parser.flush();
      debug('Flush events:', flushEvents.map(e => e.type).join(',') || '(none)');
      processEvents(flushEvents);
      const outputTokens = tokenUsage?.llmTokens || 0;

      if (textBlockOpen) {
        write(buildContentBlockStop(blockIndex));
      }
      write(buildMessageDelta(hasToolUse ? 'tool_use' : 'end_turn', outputTokens));
    } else {
      const onToken = (token: string) => {
        if (outputLimitReached) return;
        const cleaned = stripThink(token);
        if (!cleaned) return;
        outputChars += cleaned.length;
        if (outputChars > maxOutputChars) {
          outputLimitReached = true;
          console.warn(`[BridgeHandler] Output limit reached (${maxOutputChars} chars), truncating stream`);
          return;
        }
        write(buildContentBlockDelta(0, cleaned));
      };
      const { tokenUsage } = await bridge.sendPrompt(prompt, onToken, opts);
      const outputTokens = tokenUsage?.llmTokens || 0;
      write(buildContentBlockStop(0));
      write(buildMessageDelta('end_turn', outputTokens));
    }

    write(buildMessageStop());
    res.end();
  } catch (err: any) {
    console.error('[BridgeHandler] Streaming error:', err.stack || err);
    write(buildErrorEvent('api_error', err.message || 'Internal error'));
    res.end();
  }
}
