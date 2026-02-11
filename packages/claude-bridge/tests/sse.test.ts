import { describe, it, expect } from 'vitest';
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
} from '../src/sse';

/** Parse an SSE string into { event, data } where data is parsed JSON */
function parseSSE(sse: string): { event: string; data: any } {
  const lines = sse.split('\n');
  const eventLine = lines.find((l) => l.startsWith('event: '));
  const dataLine = lines.find((l) => l.startsWith('data: '));
  return {
    event: eventLine!.replace('event: ', ''),
    data: JSON.parse(dataLine!.replace('data: ', '')),
  };
}

describe('SSE Event Builder', () => {
  it('generateMessageId returns string starting with "msg_"', () => {
    const id = generateMessageId();
    expect(typeof id).toBe('string');
    expect(id.startsWith('msg_')).toBe(true);
    expect(id.length).toBeGreaterThan(4);

    // Each call returns a unique id
    const id2 = generateMessageId();
    expect(id2).not.toBe(id);
  });

  it('buildMessageStart produces correct JSON shape with usage.input_tokens', () => {
    const sse = buildMessageStart('msg_abc123', 'glm-4', 42);
    const { event, data } = parseSSE(sse);

    expect(event).toBe('message_start');
    expect(data.type).toBe('message_start');
    expect(data.message.id).toBe('msg_abc123');
    expect(data.message.type).toBe('message');
    expect(data.message.role).toBe('assistant');
    expect(data.message.content).toEqual([]);
    expect(data.message.model).toBe('glm-4');
    expect(data.message.stop_reason).toBeNull();
    expect(data.message.stop_sequence).toBeNull();
    expect(data.message.usage.input_tokens).toBe(42);
    expect(data.message.usage.output_tokens).toBe(1);
  });

  it('buildContentBlockStart has index and content_block with type "text"', () => {
    const sse = buildContentBlockStart(0);
    const { event, data } = parseSSE(sse);

    expect(event).toBe('content_block_start');
    expect(data.type).toBe('content_block_start');
    expect(data.index).toBe(0);
    expect(data.content_block.type).toBe('text');
    expect(data.content_block.text).toBe('');
  });

  it('buildContentBlockDelta wraps text in delta.type: "text_delta"', () => {
    const sse = buildContentBlockDelta(0, 'hello');
    const { event, data } = parseSSE(sse);

    expect(event).toBe('content_block_delta');
    expect(data.type).toBe('content_block_delta');
    expect(data.index).toBe(0);
    expect(data.delta.type).toBe('text_delta');
    expect(data.delta.text).toBe('hello');
  });

  it('buildContentBlockStop has correct index', () => {
    const sse = buildContentBlockStop(2);
    const { event, data } = parseSSE(sse);

    expect(event).toBe('content_block_stop');
    expect(data.type).toBe('content_block_stop');
    expect(data.index).toBe(2);
  });

  it('buildMessageDelta has stop_reason and usage.output_tokens', () => {
    const sse = buildMessageDelta('end_turn', 55);
    const { event, data } = parseSSE(sse);

    expect(event).toBe('message_delta');
    expect(data.type).toBe('message_delta');
    expect(data.delta.stop_reason).toBe('end_turn');
    expect(data.delta.stop_sequence).toBeNull();
    expect(data.usage.output_tokens).toBe(55);
  });

  it('buildMessageStop has type: "message_stop"', () => {
    const sse = buildMessageStop();
    const { event, data } = parseSSE(sse);

    expect(event).toBe('message_stop');
    expect(data.type).toBe('message_stop');
  });

  it('buildErrorEvent produces correct error shape', () => {
    const sse = buildErrorEvent('api_error', 'Something went wrong');
    const { event, data } = parseSSE(sse);

    expect(event).toBe('error');
    expect(data.type).toBe('error');
    expect(data.error.type).toBe('api_error');
    expect(data.error.message).toBe('Something went wrong');
  });

  it('all events end with double newline \\n\\n', () => {
    const events = [
      buildMessageStart('msg_test', 'model', 10),
      buildContentBlockStart(0),
      buildContentBlockDelta(0, 'hi'),
      buildContentBlockStop(0),
      buildMessageDelta('end_turn', 5),
      buildMessageStop(),
      buildErrorEvent('api_error', 'oops'),
    ];

    for (const evt of events) {
      expect(evt.endsWith('\n\n')).toBe(true);
      // Should not end with more than two newlines
      expect(evt.endsWith('\n\n\n')).toBe(false);
    }
  });

  it('generateToolUseId returns string starting with "toolu_"', () => {
    const id = generateToolUseId();
    expect(typeof id).toBe('string');
    expect(id.startsWith('toolu_')).toBe(true);
    expect(id.length).toBeGreaterThan(6);

    const id2 = generateToolUseId();
    expect(id2).not.toBe(id);
  });

  it('buildToolUseBlockStart produces content_block_start with tool_use type, id, and name', () => {
    const sse = buildToolUseBlockStart(1, 'toolu_abc', 'get_weather');
    const { event, data } = parseSSE(sse);

    expect(event).toBe('content_block_start');
    expect(data.type).toBe('content_block_start');
    expect(data.index).toBe(1);
    expect(data.content_block.type).toBe('tool_use');
    expect(data.content_block.id).toBe('toolu_abc');
    expect(data.content_block.name).toBe('get_weather');
    expect(data.content_block.input).toEqual({});
  });

  it('buildInputJsonDelta produces content_block_delta with input_json_delta type', () => {
    const sse = buildInputJsonDelta(1, '{"city":');
    const { event, data } = parseSSE(sse);

    expect(event).toBe('content_block_delta');
    expect(data.type).toBe('content_block_delta');
    expect(data.index).toBe(1);
    expect(data.delta.type).toBe('input_json_delta');
    expect(data.delta.partial_json).toBe('{"city":');
  });

  it('buildMessageDelta with stop_reason "tool_use" works', () => {
    const sse = buildMessageDelta('tool_use', 42);
    const { event, data } = parseSSE(sse);

    expect(event).toBe('message_delta');
    expect(data.delta.stop_reason).toBe('tool_use');
    expect(data.usage.output_tokens).toBe(42);
  });
});
