// POST /v1/responses — full OpenAI Responses-API translation (ported from
// @fabstir/openai-bridge responses-handler.ts, Constraint 9). NOT a chat alias:
// its own inputToPrompt. Transport swapped to the delegate-aware SessionPool.
import { randomUUID } from 'crypto';
import type { SessionPool } from '../core/SessionPool';
import { createThinkStripper, stripThinkFromText } from './think-stripper';
import { ToolCallParser, normalizeToolName } from './tool-parser';
import { sendOpenAIError } from './chat-completions';

export interface ResponsesConfig {
  chainId: number;
  depositAmount: string;
  paymentToken?: string;
  /** Model used to acquire a session when the request omits `model`. */
  defaultModel?: string;
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

/** Convert Responses API input to a ChatML prompt string. */
export function inputToPrompt(input: any, instructions?: string, tools?: any[]): string {
  const parts: string[] = [];
  const systemParts: string[] = [];
  if (instructions) systemParts.push(instructions);
  if (tools && tools.length > 0) systemParts.push(formatToolsForPrompt(tools));
  if (systemParts.length > 0) parts.push(`<|im_start|>system\n${systemParts.join('\n\n')}<|im_end|>`);

  if (typeof input === 'string') {
    parts.push(`<|im_start|>user\n${input}<|im_end|>`);
  } else if (Array.isArray(input)) {
    for (const item of input) {
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
      if (item.type === 'function_call_output') {
        parts.push(`<|im_start|>observation\n${item.output || ''}<|im_end|>`);
        continue;
      }
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

/** Unwrap nested {arguments: {...}} when the model uses the single-key wrapper. */
function normalizeToolArgs(args: Record<string, any>): Record<string, any> {
  if (Object.keys(args).length === 1 && 'arguments' in args && typeof args.arguments === 'object' && args.arguments !== null) {
    return args.arguments;
  }
  return args;
}

function estimateTokens(text: string): number { return Math.max(1, Math.ceil(text.length / 4)); }
function genId(prefix: string): string { return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 24)}`; }

/** Per-request SSE event writer with an isolated sequence counter (concurrency-safe). */
function makeSse() {
  let seq = 0;
  return (eventName: string, data: any): string => {
    const payload = { type: eventName, sequence_number: seq++, ...data };
    return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  };
}

export class ResponsesHandler {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly deps: { pool: SessionPool; config: ResponsesConfig }) {}

  private enqueue<T>(model: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(model) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(fn);
    this.queues.set(model, next.catch(() => undefined));
    return next;
  }

  private async run(model: string, prompt: string, onToken?: (t: string) => void, signal?: AbortSignal, sampling?: { temperature?: number; maxTokens?: number }): Promise<{ response: string; tokensUsed: number }> {
    const { adapter, session } = await this.deps.pool.acquire(model, {
      chainId: this.deps.config.chainId,
      depositAmount: this.deps.config.depositAmount,
      paymentToken: this.deps.config.paymentToken,
    }, signal);
    try {
      const promptOpts: any = { ...sampling };
      if (signal) promptOpts.signal = signal;
      return await adapter.sendPrompt(session.sessionId, prompt, undefined, onToken, Object.keys(promptOpts).length > 0 ? promptOpts : undefined);
    } finally {
      await this.deps.pool.release(adapter, session);
    }
  }

  async handle(req: any, res: any): Promise<void> {
    const body = req.body || {};
    if (body.input === undefined) {
      return sendOpenAIError(res, 400, 'invalid_request_error', 'Missing required field: input');
    }
    const model = body.model || this.deps.config.defaultModel;
    if (!model) {
      return sendOpenAIError(res, 400, 'invalid_request_error', 'Missing required field: model');
    }
    const tools = body.tools && body.tools.length > 0 ? body.tools : undefined;
    const prompt = inputToPrompt(body.input, body.instructions, tools);
    const inputTokens = estimateTokens(prompt);
    const sampling: { temperature?: number; maxTokens?: number } = {};
    if (body.temperature != null) sampling.temperature = body.temperature;
    if (body.max_output_tokens != null) sampling.maxTokens = body.max_output_tokens;

    if (body.stream === true) await this.handleStreaming(res, model, prompt, inputTokens, tools, sampling);
    else await this.handleNonStreaming(res, model, prompt, inputTokens, tools, sampling);
  }

  private async handleNonStreaming(res: any, model: string, prompt: string, inputTokens: number, tools?: any[], sampling?: { temperature?: number; maxTokens?: number }): Promise<void> {
    try {
      const { response, tokensUsed } = await this.enqueue(model, () => this.run(model, prompt, undefined, undefined, sampling));
      const text = stripThinkFromText(response);
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
              name: normalizeToolName(evt.name, tools), arguments: JSON.stringify(normalizeToolArgs(evt.arguments)), status: 'completed',
            });
          }
        }
        if (textContent) {
          output.unshift({ type: 'message', id: genId('msg'), role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: textContent }] });
        }
      } else {
        output.push({ type: 'message', id: genId('msg'), role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }] });
      }

      res.status(200).json({
        id: genId('resp'), object: 'response', created_at: Math.floor(Date.now() / 1000), model,
        status: 'completed', output,
        usage: { input_tokens: inputTokens, output_tokens: tokensUsed, total_tokens: inputTokens + tokensUsed },
      });
    } catch (err: any) {
      sendOpenAIError(res, 500, 'server_error', err?.message || 'Internal error');
    }
  }

  private async handleStreaming(res: any, model: string, prompt: string, inputTokens: number, tools?: any[], sampling?: { temperature?: number; maxTokens?: number }): Promise<void> {
    const sse = makeSse();
    const respId = genId('resp');
    const msgId = genId('msg');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    const write = (s: string) => { res.write(s); };
    // Abort the underlying prompt if the client disconnects (no leaked spend).
    const ac = new AbortController();
    res.on?.('close', () => ac.abort());

    const respObj = { id: respId, object: 'response', created_at: Math.floor(Date.now() / 1000), model, status: 'in_progress', output: [] as any[], usage: null as any };
    write(sse('response.created', { response: { ...respObj } }));
    write(sse('response.in_progress', { response: { ...respObj } }));
    const msgItem: any = { type: 'message', id: msgId, role: 'assistant', status: 'in_progress', content: [] };
    write(sse('response.output_item.added', { output_index: 0, item: { ...msgItem } }));
    write(sse('response.content_part.added', { item_id: msgId, output_index: 0, content_index: 0, part: { type: 'output_text', text: '' } }));

    try {
      let fullText = '';
      const stripThink = createThinkStripper();
      const outputItems: any[] = [];
      let outputIndex = 1;
      const parser = tools ? new ToolCallParser() : null;

      const processEvents = (events: any[]) => {
        for (const evt of events) {
          if (evt.type === 'text' && evt.text) {
            fullText += evt.text;
            write(sse('response.output_text.delta', { item_id: msgId, output_index: 0, content_index: 0, delta: evt.text }));
          } else if (evt.type === 'tool_call') {
            const fcId = genId('fc');
            const args = JSON.stringify(normalizeToolArgs(evt.arguments));
            const fcItem = { type: 'function_call', id: fcId, call_id: genId('call'), name: normalizeToolName(evt.name, tools), arguments: '', status: 'in_progress' };
            write(sse('response.output_item.added', { output_index: outputIndex, item: { ...fcItem } }));
            write(sse('response.function_call_arguments.delta', { item_id: fcId, output_index: outputIndex, delta: args }));
            write(sse('response.function_call_arguments.done', { item_id: fcId, output_index: outputIndex, arguments: args }));
            const doneItem = { ...fcItem, arguments: args, status: 'completed' };
            write(sse('response.output_item.done', { output_index: outputIndex, item: doneItem }));
            outputItems.push(doneItem);
            outputIndex++;
          }
        }
      };

      const onToken = (token: string) => {
        const cleaned = stripThink(token);
        if (!cleaned) return;
        if (parser) processEvents(parser.feed(cleaned));
        else processEvents([{ type: 'text', text: cleaned }]);
      };
      const { tokensUsed } = await this.enqueue(model, () => this.run(model, prompt, onToken, ac.signal, sampling));
      if (parser) processEvents(parser.flush());

      write(sse('response.output_text.done', { item_id: msgId, output_index: 0, content_index: 0, text: fullText }));
      write(sse('response.content_part.done', { item_id: msgId, output_index: 0, content_index: 0, part: { type: 'output_text', text: fullText } }));
      const doneMsg = { ...msgItem, status: 'completed', content: [{ type: 'output_text', text: fullText }] };
      write(sse('response.output_item.done', { output_index: 0, item: doneMsg }));

      const usage = { input_tokens: inputTokens, output_tokens: tokensUsed, total_tokens: inputTokens + tokensUsed };
      write(sse('response.completed', { response: { ...respObj, status: 'completed', output: [doneMsg, ...outputItems], usage } }));
      res.end();
    } catch {
      write(sse('response.completed', { response: { ...respObj, status: 'failed', output: [] } }));
      res.end();
    }
  }
}
