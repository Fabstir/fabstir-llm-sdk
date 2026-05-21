// SSE streaming for /v1/chat/completions: OpenAI chat.completion.chunk deltas via
// sse.ts, piped through the think-stripper, terminated by [DONE]. Client disconnect
// aborts the underlying prompt. Tool-call buffering (4.4) plugs into onToken.
import {
  generateMessageId, buildRoleDelta, buildContentDelta, buildFinishDelta, buildDoneEvent,
} from './sse';
import { createThinkStripper } from './think-stripper';

export interface StreamParams {
  res: any;
  req?: any;
  model: string;
  /** Runs the prompt, streaming raw tokens to onToken; resolves with token usage. */
  run: (onToken: (token: string) => void, signal: AbortSignal) => Promise<{ tokensUsed: number; inputTokens: number }>;
  /** Optional per-token transform AFTER think-strip (4.4 tool parsing); defaults to a content delta. */
  onCleanToken?: (cleaned: string, write: (data: string) => void, msgId: string, model: string) => void;
  /** Optional finalizer before the finish delta (4.4 flushes a buffered tool call). */
  finalize?: (write: (data: string) => void, msgId: string, model: string) => { finishReason: string };
}

function usageChunk(id: string, model: string, inputTokens: number, completionTokens: number): string {
  const data = {
    id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model,
    choices: [],
    usage: { prompt_tokens: inputTokens, completion_tokens: completionTokens, total_tokens: inputTokens + completionTokens },
  };
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function streamChatCompletion(params: StreamParams): Promise<void> {
  const { res, req, model, run, onCleanToken, finalize } = params;
  const msgId = generateMessageId();
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const write = (data: string) => { res.write(data); };
  write(buildRoleDelta(msgId, model));

  const stripThink = createThinkStripper();
  const ac = new AbortController();
  if (req?.on) req.on('close', () => ac.abort());

  try {
    const { tokensUsed, inputTokens } = await run((token) => {
      const cleaned = stripThink(token);
      if (!cleaned) return;
      if (onCleanToken) onCleanToken(cleaned, write, msgId, model);
      else write(buildContentDelta(msgId, model, cleaned));
    }, ac.signal);

    const finishReason = finalize ? finalize(write, msgId, model).finishReason : 'stop';
    if (tokensUsed > 0) write(usageChunk(msgId, model, inputTokens, tokensUsed));
    write(buildFinishDelta(msgId, model, finishReason));
    write(buildDoneEvent());
    res.end();
  } catch {
    write(buildFinishDelta(msgId, model, 'stop'));
    write(buildDoneEvent());
    res.end();
  }
}
