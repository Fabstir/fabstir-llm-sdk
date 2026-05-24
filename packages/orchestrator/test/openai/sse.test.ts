import { describe, it, expect } from 'vitest';
import {
  buildRoleDelta, buildContentDelta, buildToolCallDelta, buildFinishDelta,
  buildDoneEvent, generateMessageId, generateToolCallId,
} from '../../src/openai/sse';

function parse(line: string) {
  return JSON.parse(line.replace(/^data: /, '').trim());
}

describe('openai sse delta builders (4.1)', () => {
  it('role delta has assistant role and chunk object', () => {
    const d = parse(buildRoleDelta('id1', 'm'));
    expect(d.object).toBe('chat.completion.chunk');
    expect(d.choices[0].delta.role).toBe('assistant');
  });

  it('content delta carries content', () => {
    expect(parse(buildContentDelta('id1', 'm', 'hi')).choices[0].delta.content).toBe('hi');
  });

  it('tool-call delta with id emits id/type/function.name; without id emits arguments', () => {
    const head = parse(buildToolCallDelta('id1', 'm', 0, 'call_x', 'Bash'));
    expect(head.choices[0].delta.tool_calls[0]).toMatchObject({ index: 0, id: 'call_x', type: 'function', function: { name: 'Bash' } });
    const arg = parse(buildToolCallDelta('id1', 'm', 0, undefined, undefined, '{"a":1}'));
    expect(arg.choices[0].delta.tool_calls[0].function.arguments).toBe('{"a":1}');
  });

  it('finish delta carries finish_reason; done event is [DONE]', () => {
    expect(parse(buildFinishDelta('id1', 'm', 'stop')).choices[0].finish_reason).toBe('stop');
    expect(buildDoneEvent()).toBe('data: [DONE]\n\n');
  });

  it('id generators have OpenAI-compatible prefixes', () => {
    expect(generateMessageId()).toMatch(/^chatcmpl-/);
    expect(generateToolCallId()).toMatch(/^call_/);
  });
});
