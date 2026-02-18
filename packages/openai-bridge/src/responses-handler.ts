import { IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { createThinkStripper, stripThinkFromText } from './think-stripper';
import { ToolCallParser } from './tool-parser';
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

function formatToolsForPrompt(tools: any[]): string {
  const lines = ['# Tools'];
  for (const t of tools) {
    const name = t.name || t.function?.name || '';
    const desc = (t.description || t.function?.description || '').split('\n')[0]?.slice(0, 80);
    const params = t.parameters?.required?.join(', ') || t.function?.parameters?.required?.join(', ') || '';
    lines.push(`- ${name}: ${desc}${params ? ` [${params}]` : ''}`);
  }
  lines.push('');
  lines.push('IMPORTANT: To perform actions, you MUST output <tool_call> tags.');
  lines.push('Format: <tool_call>ToolName<arg_key>param</arg_key><arg_value>value</arg_value></tool_call>');
  lines.push('Example: <tool_call>Bash<arg_key>command</arg_key><arg_value>npm install</arg_value></tool_call>');
  return lines.join('\n');
}

/** Convert Responses API input to ChatML prompt string */
function inputToPrompt(input: any, instructions?: string, tools?: any[]): string {
  const parts: string[] = [];
  const systemParts: string[] = [];
  if (instructions) systemParts.push(instructions);
  if (tools && tools.length > 0) systemParts.push(formatToolsForPrompt(tools));
  if (systemParts.length > 0) parts.push(`<|im_start|>system\n${systemParts.join('\n\n')}<|im_end|>`);

  if (typeof input === 'string') {
    parts.push(`<|im_start|>user\n${input}<|im_end|>`);
  } else if (Array.isArray(input)) {
    for (const item of input) {
      // Function call from previous assistant turn
      if (item.type === 'function_call') {
        let argsObj: Record<string, any> = {};
        if (typeof item.arguments === 'string') {
          try { argsObj = JSON.parse(item.arguments); } catch { argsObj = {}; }
        } else if (item.arguments && typeof item.arguments === 'object') {
          argsObj = item.arguments;
        }
        const argParts = Object.entries(argsObj)
          .map(([k, v]) => `<arg_key>${k}</arg_key><arg_value>${typeof v === 'string' ? v : JSON.stringify(v)}</arg_value>`)
          .join('');
        parts.push(`<|im_start|>assistant\n<tool_call>${item.name}${argParts}</tool_call><|im_end|>`);
        continue;
      }
      // Function call output (tool result)
      if (item.type === 'function_call_output') {
        parts.push(`<|im_start|>observation\n${item.output || ''}<|im_end|>`);
        continue;
      }
      // Regular message
      const role = item.role || 'user';
      let text = '';
      if (typeof item.content === 'string') {
        text = item.content;
      } else if (Array.isArray(item.content)) {
        text = item.content
          .filter((p: any) => p.type === 'input_text' || p.type === 'text' || p.type === 'output_text')
          .map((p: any) => p.text)
          .join('');
      }
      if (text) parts.push(`<|im_start|>${role}\n${text}<|im_end|>`);
    }
  }
  parts.push('<|im_start|>assistant\n');
  return parts.join('\n');
}

/** Unwrap nested {arguments: {...}} when model uses single-key wrapper format */
function normalizeToolArgs(args: Record<string, any>): Record<string, any> {
  if (Object.keys(args).length === 1 && 'arguments' in args && typeof args.arguments === 'object' && args.arguments !== null) {
    return args.arguments;
  }
  return args;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function genId(prefix: string): string { return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 24)}`; }

let seqCounter = 0;

function sseEvent(eventName: string, data: any): string {
  const payload = { type: eventName, sequence_number: seqCounter++, ...data };
  return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function handleResponses(
  req: IncomingMessage, res: ServerResponse, bridge: SessionBridge,
): Promise<void> {
  seqCounter = 0;
  let body: any;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    sendError(res, 400, 'invalid_request_error', 'Invalid JSON body');
    return;
  }

  if (body.input === undefined && body.input !== '') {
    sendError(res, 400, 'invalid_request_error', 'Missing required field: input');
    return;
  }

  // Circuit breaker: reject immediately with 503 before starting SSE
  if ((bridge as any).isCircuitOpen?.()) {
    const reason = (bridge as any).getCircuitError?.() || 'persistent session errors';
    sendError(res, 503, 'server_error', `Circuit breaker open: ${reason}. Retry later.`);
    return;
  }

  const model = body.model || 'unknown';
  const tools = body.tools && body.tools.length > 0 ? body.tools : undefined;
  const prompt = inputToPrompt(body.input, body.instructions, tools);
  const inputTokens = estimateTokens(prompt);

  if (body.stream === true) {
    await handleStreaming(res, bridge, prompt, inputTokens, model, tools);
  } else {
    await handleNonStreaming(res, bridge, prompt, inputTokens, model, tools);
  }
}

async function handleNonStreaming(
  res: ServerResponse, bridge: SessionBridge, prompt: string,
  inputTokens: number, model: string, tools?: any[],
): Promise<void> {
  try {
    const { response, tokenUsage } = await bridge.sendPrompt(prompt);
    const text = stripThinkFromText(response);
    const outputTokens = tokenUsage?.llmTokens || 0;
    const respId = genId('resp');

    const output: any[] = [];
    if (tools) {
      const parser = new ToolCallParser();
      const events = [...parser.feed(text), ...parser.flush()];
      let textContent = '';
      for (const evt of events) {
        if (evt.type === 'text' && evt.text.trim()) textContent += evt.text;
        else if (evt.type === 'tool_call') {
          output.push({
            type: 'function_call', id: genId('fc'), call_id: genId('call'),
            name: evt.name, arguments: JSON.stringify(normalizeToolArgs(evt.arguments)), status: 'completed',
          });
        }
      }
      if (textContent) {
        output.unshift({
          type: 'message', id: genId('msg'), role: 'assistant', status: 'completed',
          content: [{ type: 'output_text', text: textContent }],
        });
      }
    } else {
      output.push({
        type: 'message', id: genId('msg'), role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text }],
      });
    }

    const result = {
      id: respId, object: 'response' as const,
      created_at: Math.floor(Date.now() / 1000), model,
      status: 'completed', output,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (err: any) {
    sendError(res, 500, 'server_error', err.message || 'Internal error');
  }
}

async function handleStreaming(
  res: ServerResponse, bridge: SessionBridge, prompt: string,
  inputTokens: number, model: string, tools?: any[],
): Promise<void> {
  const respId = genId('resp');
  const msgId = genId('msg');

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.flushHeaders();
  const write = (s: string) => { res.write(s); };

  const respObj = {
    id: respId, object: 'response' as const, created_at: Math.floor(Date.now() / 1000),
    model, status: 'in_progress' as string, output: [] as any[], usage: null as any,
  };

  write(sseEvent('response.created', { response: { ...respObj } }));
  write(sseEvent('response.in_progress', { response: { ...respObj } }));

  // Text output item setup
  const msgItem: any = { type: 'message', id: msgId, role: 'assistant', status: 'in_progress', content: [] };
  write(sseEvent('response.output_item.added', { output_index: 0, item: { ...msgItem } }));
  write(sseEvent('response.content_part.added', {
    item_id: msgId, output_index: 0, content_index: 0, part: { type: 'output_text', text: '' },
  }));

  try {
    let fullText = '';
    const stripThink = createThinkStripper();
    const outputItems: any[] = [];
    let outputIndex = 1; // 0 is the text message

    if (tools) {
      const parser = new ToolCallParser();

      const processEvents = (parserEvents: any[]) => {
        for (const evt of parserEvents) {
          if (evt.type === 'text' && evt.text) {
            fullText += evt.text;
            write(sseEvent('response.output_text.delta', {
              item_id: msgId, output_index: 0, content_index: 0, delta: evt.text,
            }));
          } else if (evt.type === 'tool_call') {
            const fcId = genId('fc');
            const callId = genId('call');
            const args = JSON.stringify(normalizeToolArgs(evt.arguments));
            const fcItem = {
              type: 'function_call', id: fcId, call_id: callId,
              name: evt.name, arguments: '', status: 'in_progress',
            };
            write(sseEvent('response.output_item.added', { output_index: outputIndex, item: { ...fcItem } }));
            write(sseEvent('response.function_call_arguments.delta', {
              item_id: fcId, output_index: outputIndex, delta: args,
            }));
            write(sseEvent('response.function_call_arguments.done', {
              item_id: fcId, output_index: outputIndex, arguments: args,
            }));
            const doneItem = { ...fcItem, arguments: args, status: 'completed' };
            write(sseEvent('response.output_item.done', { output_index: outputIndex, item: doneItem }));
            outputItems.push(doneItem);
            outputIndex++;
          }
        }
      };

      const onToken = (token: string) => {
        const cleaned = stripThink(token);
        if (!cleaned) return;
        processEvents(parser.feed(cleaned));
      };
      const { tokenUsage } = await bridge.sendPrompt(prompt, onToken);
      processEvents(parser.flush());

      // Close text message
      write(sseEvent('response.output_text.done', { item_id: msgId, output_index: 0, content_index: 0, text: fullText }));
      write(sseEvent('response.content_part.done', { item_id: msgId, output_index: 0, content_index: 0, part: { type: 'output_text', text: fullText } }));
      const doneMsg = { ...msgItem, status: 'completed', content: [{ type: 'output_text', text: fullText }] };
      write(sseEvent('response.output_item.done', { output_index: 0, item: doneMsg }));

      const usage = { input_tokens: inputTokens, output_tokens: tokenUsage?.llmTokens || 0, total_tokens: inputTokens + (tokenUsage?.llmTokens || 0) };
      const completedResp = { ...respObj, status: 'completed', output: [doneMsg, ...outputItems], usage };
      write(sseEvent('response.completed', { response: completedResp }));
    } else {
      const onToken = (token: string) => {
        const cleaned = stripThink(token);
        if (!cleaned) return;
        fullText += cleaned;
        write(sseEvent('response.output_text.delta', {
          item_id: msgId, output_index: 0, content_index: 0, delta: cleaned,
        }));
      };
      const { tokenUsage } = await bridge.sendPrompt(prompt, onToken);
      const outputTokens = tokenUsage?.llmTokens || 0;

      write(sseEvent('response.output_text.done', { item_id: msgId, output_index: 0, content_index: 0, text: fullText }));
      write(sseEvent('response.content_part.done', { item_id: msgId, output_index: 0, content_index: 0, part: { type: 'output_text', text: fullText } }));
      const doneItem = { ...msgItem, status: 'completed', content: [{ type: 'output_text', text: fullText }] };
      write(sseEvent('response.output_item.done', { output_index: 0, item: doneItem }));

      const usage = { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: inputTokens + outputTokens };
      write(sseEvent('response.completed', { response: { ...respObj, status: 'completed', output: [doneItem], usage } }));
    }
    res.end();
  } catch (err: any) {
    console.error(`[${new Date().toISOString()}] Responses streaming error: ${err.message || err}`);
    write(sseEvent('response.completed', { response: { ...respObj, status: 'failed', output: [] } }));
    res.end();
  }
}
