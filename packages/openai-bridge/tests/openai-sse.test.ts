import { describe, it, expect } from 'vitest';
import {
  generateMessageId,
  buildRoleDelta,
  buildContentDelta,
  buildToolCallDelta,
  buildFinishDelta,
  buildDoneEvent,
} from '../src/openai-sse';

describe('OpenAI SSE Builder', () => {
  it('buildRoleDelta emits delta with role: "assistant"', () => {
    const event = buildRoleDelta('chatcmpl-1', 'gpt-4');
    const parsed = JSON.parse(event.replace('data: ', '').trim());
    expect(parsed.choices[0].delta.role).toBe('assistant');
    expect(parsed.id).toBe('chatcmpl-1');
    expect(parsed.object).toBe('chat.completion.chunk');
  });

  it('buildContentDelta emits delta with content string', () => {
    const event = buildContentDelta('chatcmpl-1', 'gpt-4', 'Hello');
    const parsed = JSON.parse(event.replace('data: ', '').trim());
    expect(parsed.choices[0].delta.content).toBe('Hello');
  });

  it('buildContentDelta includes correct id, model, created timestamp', () => {
    const before = Math.floor(Date.now() / 1000);
    const event = buildContentDelta('chatcmpl-2', 'my-model', 'text');
    const after = Math.floor(Date.now() / 1000);
    const parsed = JSON.parse(event.replace('data: ', '').trim());
    expect(parsed.id).toBe('chatcmpl-2');
    expect(parsed.model).toBe('my-model');
    expect(parsed.created).toBeGreaterThanOrEqual(before);
    expect(parsed.created).toBeLessThanOrEqual(after);
  });

  it('buildToolCallDelta first call includes id, type, function name', () => {
    const event = buildToolCallDelta('chatcmpl-1', 'gpt-4', 0, 'call_abc', 'get_weather');
    const parsed = JSON.parse(event.replace('data: ', '').trim());
    const tc = parsed.choices[0].delta.tool_calls[0];
    expect(tc.index).toBe(0);
    expect(tc.id).toBe('call_abc');
    expect(tc.type).toBe('function');
    expect(tc.function.name).toBe('get_weather');
  });

  it('buildToolCallDelta subsequent calls include only arguments chunk', () => {
    const event = buildToolCallDelta('chatcmpl-1', 'gpt-4', 0, undefined, undefined, '{"city"');
    const parsed = JSON.parse(event.replace('data: ', '').trim());
    const tc = parsed.choices[0].delta.tool_calls[0];
    expect(tc.id).toBeUndefined();
    expect(tc.function.arguments).toBe('{"city"');
  });

  it('buildFinishDelta emits finish_reason: "stop" for text completion', () => {
    const event = buildFinishDelta('chatcmpl-1', 'gpt-4', 'stop');
    const parsed = JSON.parse(event.replace('data: ', '').trim());
    expect(parsed.choices[0].finish_reason).toBe('stop');
    expect(parsed.choices[0].delta).toEqual({});
  });

  it('buildFinishDelta emits finish_reason: "tool_calls" for tool use', () => {
    const event = buildFinishDelta('chatcmpl-1', 'gpt-4', 'tool_calls');
    const parsed = JSON.parse(event.replace('data: ', '').trim());
    expect(parsed.choices[0].finish_reason).toBe('tool_calls');
  });

  it('buildDoneEvent returns "data: [DONE]" line', () => {
    const event = buildDoneEvent();
    expect(event).toContain('data: [DONE]');
  });

  it('generateMessageId starts with "chatcmpl-"', () => {
    const id = generateMessageId();
    expect(id).toMatch(/^chatcmpl-/);
  });

  it('all events end with double newline', () => {
    expect(buildRoleDelta('id', 'model')).toMatch(/\n\n$/);
    expect(buildContentDelta('id', 'model', 'x')).toMatch(/\n\n$/);
    expect(buildFinishDelta('id', 'model', 'stop')).toMatch(/\n\n$/);
    expect(buildDoneEvent()).toMatch(/\n\n$/);
  });
});
