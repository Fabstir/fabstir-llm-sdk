import { IncomingMessage, ServerResponse } from 'http';
import type { OpenAIChatRequest } from './types';
import { convertOpenAIMessages, estimateInputTokens } from './openai-converter';
import {
  generateMessageId, generateToolCallId,
  buildRoleDelta, buildContentDelta, buildToolCallDelta, buildFinishDelta, buildDoneEvent,
} from './openai-sse';
import { ToolCallParser } from './tool-parser';
import { createThinkStripper, stripThinkFromText } from './think-stripper';
import type { SessionBridge } from './session-bridge';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: string | Buffer) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendError(res: ServerResponse, status: number, type: string, message: string): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { message, type } }));
}

export async function handleChatCompletions(
  req: IncomingMessage, res: ServerResponse, bridge: SessionBridge
): Promise<void> {
  let body: OpenAIChatRequest;
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw);
  } catch {
    sendError(res, 400, 'invalid_request_error', 'Invalid JSON body');
    return;
  }

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    sendError(res, 400, 'invalid_request_error', 'Missing required field: messages');
    return;
  }
  if (!body.model) {
    sendError(res, 400, 'invalid_request_error', 'Missing required field: model');
    return;
  }

  // Circuit breaker: reject immediately with 503 before starting SSE
  if ((bridge as any).isCircuitOpen?.()) {
    const reason = (bridge as any).getCircuitError?.() || 'persistent session errors';
    sendError(res, 503, 'server_error', `Circuit breaker open: ${reason}. Retry later.`);
    return;
  }

  const tools = body.tools && body.tools.length > 0 ? body.tools : undefined;
  const { prompt, images } = await convertOpenAIMessages(body.messages, tools);
  const inputTokens = estimateInputTokens(prompt);
  const model = body.model;
  const opts = images.length > 0 ? { images } : undefined;

  if (body.stream === true) {
    await handleStreaming(res, bridge, prompt, opts, inputTokens, model, tools);
  } else {
    await handleNonStreaming(res, bridge, prompt, opts, inputTokens, model, tools);
  }
}

async function handleStreaming(
  res: ServerResponse, bridge: SessionBridge, prompt: string,
  opts: any, inputTokens: number, model: string, tools?: any[]
): Promise<void> {
  const msgId = generateMessageId();
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.flushHeaders();
  const write = (data: string) => { res.write(data); };
  write(buildRoleDelta(msgId, model));

  try {
    let hasToolUse = false;
    const stripThink = createThinkStripper();

    if (tools) {
      const parser = new ToolCallParser();
      let toolCallIndex = 0;

      const processEvents = (events: any[]) => {
        for (const evt of events) {
          if (evt.type === 'text' && evt.text) {
            write(buildContentDelta(msgId, model, evt.text));
          } else if (evt.type === 'tool_call') {
            const tcId = generateToolCallId();
            write(buildToolCallDelta(msgId, model, toolCallIndex, tcId, evt.name));
            write(buildToolCallDelta(msgId, model, toolCallIndex, undefined, undefined, JSON.stringify(evt.arguments)));
            hasToolUse = true;
            toolCallIndex++;
          }
        }
      };

      const onToken = (token: string) => {
        const cleaned = stripThink(token);
        if (!cleaned) return;
        processEvents(parser.feed(cleaned));
      };
      await bridge.sendPrompt(prompt, onToken, opts);
      processEvents(parser.flush());
    } else {
      const onToken = (token: string) => {
        const cleaned = stripThink(token);
        if (!cleaned) return;
        write(buildContentDelta(msgId, model, cleaned));
      };
      await bridge.sendPrompt(prompt, onToken, opts);
    }

    write(buildFinishDelta(msgId, model, hasToolUse ? 'tool_calls' : 'stop'));
    write(buildDoneEvent());
    res.end();
  } catch (err: any) {
    console.error(`[${new Date().toISOString()}] Streaming error: ${err.message || err}`);
    write(buildFinishDelta(msgId, model, 'stop'));
    write(buildDoneEvent());
    res.end();
  }
}

async function handleNonStreaming(
  res: ServerResponse, bridge: SessionBridge, prompt: string,
  opts: any, inputTokens: number, model: string, tools?: any[]
): Promise<void> {
  try {
    const { response, tokenUsage } = await bridge.sendPrompt(prompt, undefined, opts);
    const cleanResponse = stripThinkFromText(response);
    const outputTokens = tokenUsage?.llmTokens || 0;
    let content: string | null = cleanResponse;
    let toolCalls: any[] | undefined;
    let finishReason = 'stop';

    if (tools) {
      const parser = new ToolCallParser();
      const events = [...parser.feed(cleanResponse), ...parser.flush()];
      const textParts: string[] = [];
      toolCalls = [];
      for (const evt of events) {
        if (evt.type === 'text' && evt.text.trim()) textParts.push(evt.text);
        else if (evt.type === 'tool_call') {
          toolCalls.push({
            id: generateToolCallId(), type: 'function',
            function: { name: evt.name, arguments: JSON.stringify(evt.arguments) },
          });
          finishReason = 'tool_calls';
        }
      }
      content = textParts.length > 0 ? textParts.join('') : null;
      if (toolCalls.length === 0) toolCalls = undefined;
    }

    const message: any = { role: 'assistant', content };
    if (toolCalls) message.tool_calls = toolCalls;

    const result = {
      id: generateMessageId(), object: 'chat.completion' as const,
      created: Math.floor(Date.now() / 1000), model,
      choices: [{ index: 0, message, finish_reason: finishReason }],
      usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (err: any) {
    sendError(res, 500, 'server_error', err.message || 'Internal error');
  }
}
