// POST /v1/chat/completions handler (non-streaming).
// Bypasses orchestrate() (Constraint 1): convert → acquire(model) → per-model queue
// → SessionAdapter.sendPrompt(renderedChatML) → strip <think> → OpenAI response.
// Streaming (4.3) and tool-calls (4.4) extend this module.
import type { SessionPool } from '../core/SessionPool';
import type { OpenAIChatRequest } from './types';
import { convertOpenAIMessages, estimateInputTokens } from './converter';
import { generateMessageId, generateToolCallId, buildContentDelta, buildToolCallDelta } from './sse';
import { stripThinkFromText } from './think-stripper';
import { streamChatCompletion } from './streaming';
import { ToolCallParser, ParserEvent } from './tool-parser';

export interface ChatHandlerConfig {
  chainId: number;
  depositAmount: string;
  paymentToken?: string;
}

export interface ChatDeps {
  pool: SessionPool;
  config: ChatHandlerConfig;
}

export function sendOpenAIError(res: any, status: number, type: string, message: string): void {
  res.status(status).json({ error: { message, type } });
}

export class ChatCompletionsHandler {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly deps: ChatDeps) {}

  /** Serialize work per model so requests share one warm session (one at a time). */
  private enqueue<T>(model: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(model) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(fn);
    this.queues.set(model, next.catch(() => undefined));
    return next;
  }

  /** Acquire a (warm) session for the model, run the prompt, release back to the pool. */
  private async run(
    model: string, prompt: string, opts: any,
    onToken?: (t: string) => void, signal?: AbortSignal,
  ): Promise<{ response: string; tokensUsed: number }> {
    const { adapter, session } = await this.deps.pool.acquire(model, {
      chainId: this.deps.config.chainId,
      depositAmount: this.deps.config.depositAmount,
      paymentToken: this.deps.config.paymentToken,
    }, signal);
    try {
      // Feed the converter-rendered ChatML directly (NOT SessionAdapter's System: concat).
      return await adapter.sendPrompt(session.sessionId, prompt, undefined, onToken, signal ? { ...opts, signal } : opts);
    } finally {
      await this.deps.pool.release(adapter, session);
    }
  }

  async handle(req: any, res: any): Promise<void> {
    const body = req.body as OpenAIChatRequest;
    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
      return sendOpenAIError(res, 400, 'invalid_request_error', 'Missing required field: messages');
    }
    if (!body.model) {
      return sendOpenAIError(res, 400, 'invalid_request_error', 'Missing required field: model');
    }

    const tools = body.tools && body.tools.length > 0 ? body.tools : undefined;
    const { prompt, images } = await convertOpenAIMessages(body.messages, tools);
    const inputTokens = estimateInputTokens(prompt);
    const model = body.model;
    const opts = images.length > 0 ? { images } : undefined;

    const run = (onToken: any, signal: any) =>
      this.enqueue(model, () => this.run(model, prompt, opts, onToken, signal))
        .then(({ tokensUsed }) => ({ tokensUsed, inputTokens }));

    if (body.stream === true) {
      if (tools) {
        const parser = new ToolCallParser();
        const state = { toolCallIndex: 0, hasToolUse: false };
        const emit = (events: ParserEvent[], write: (d: string) => void, msgId: string, m: string) => {
          for (const evt of events) {
            if (evt.type === 'text' && evt.text) write(buildContentDelta(msgId, m, evt.text));
            else if (evt.type === 'tool_call') {
              write(buildToolCallDelta(msgId, m, state.toolCallIndex, generateToolCallId(), evt.name));
              write(buildToolCallDelta(msgId, m, state.toolCallIndex, undefined, undefined, JSON.stringify(evt.arguments)));
              state.hasToolUse = true; state.toolCallIndex++;
            }
          }
        };
        await streamChatCompletion({
          res, req, model, run,
          onCleanToken: (cleaned, write, msgId, m) => emit(parser.feed(cleaned), write, msgId, m),
          finalize: (write, msgId, m) => { emit(parser.flush(), write, msgId, m); return { finishReason: state.hasToolUse ? 'tool_calls' : 'stop' }; },
        });
      } else {
        await streamChatCompletion({ res, req, model, run });
      }
      return;
    }

    try {
      const { response, tokensUsed } = await this.enqueue(model, () => this.run(model, prompt, opts));
      const clean = stripThinkFromText(response);
      const message: any = { role: 'assistant', content: clean };
      let finishReason = 'stop';

      if (tools) {
        const parser = new ToolCallParser();
        const events = [...parser.feed(clean), ...parser.flush()];
        const textParts: string[] = [];
        const toolCalls: any[] = [];
        for (const evt of events) {
          if (evt.type === 'text' && evt.text.trim()) textParts.push(evt.text);
          else if (evt.type === 'tool_call') {
            toolCalls.push({ id: generateToolCallId(), type: 'function', function: { name: evt.name, arguments: JSON.stringify(evt.arguments) } });
            finishReason = 'tool_calls';
          }
        }
        message.content = textParts.length > 0 ? textParts.join('') : null;
        if (toolCalls.length > 0) message.tool_calls = toolCalls;
      }

      res.status(200).json({
        id: generateMessageId(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, message, finish_reason: finishReason }],
        usage: { prompt_tokens: inputTokens, completion_tokens: tokensUsed, total_tokens: inputTokens + tokensUsed },
      });
    } catch (err: any) {
      sendOpenAIError(res, 500, 'server_error', err?.message || 'Internal error');
    }
  }
}
