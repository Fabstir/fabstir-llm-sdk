import { describe, it, expect } from 'vitest';
import type {
  AnthropicRequest,
  AnthropicMessage,
  ContentBlock,
  ImageSource,
  AnthropicResponse,
  Usage,
  AnthropicError,
} from '../src/types';

describe('Anthropic API Types', () => {
  it('AnthropicRequest has required fields: model, max_tokens, messages', () => {
    const req: AnthropicRequest = {
      model: 'claude-3-opus-20240229',
      max_tokens: 1024,
      messages: [{ role: 'user', content: 'Hello' }],
    };
    expect(req.model).toBe('claude-3-opus-20240229');
    expect(req.max_tokens).toBe(1024);
    expect(req.messages).toHaveLength(1);
  });

  it('AnthropicRequest has optional fields: system, temperature, stream', () => {
    const req: AnthropicRequest = {
      model: 'claude-3-opus-20240229',
      max_tokens: 1024,
      messages: [{ role: 'user', content: 'Hello' }],
      system: 'You are helpful.',
      temperature: 0.7,
      stream: true,
    };
    expect(req.system).toBe('You are helpful.');
    expect(req.temperature).toBe(0.7);
    expect(req.stream).toBe(true);
  });

  it('AnthropicMessage content supports string form', () => {
    const msg: AnthropicMessage = { role: 'user', content: 'Hello' };
    expect(typeof msg.content).toBe('string');
  });

  it('AnthropicMessage content supports ContentBlock[] form', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', text: 'Hello' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc123' } },
    ];
    const msg: AnthropicMessage = { role: 'user', content: blocks };
    expect(Array.isArray(msg.content)).toBe(true);
    expect((msg.content as ContentBlock[]).length).toBe(2);
  });

  it('ImageSource has type "base64", media_type, data fields', () => {
    const src: ImageSource = { type: 'base64', media_type: 'image/png', data: 'abc123' };
    expect(src.type).toBe('base64');
    expect(src.media_type).toBe('image/png');
    expect(src.data).toBe('abc123');
  });

  it('AnthropicResponse has id, type "message", role, content[], model, stop_reason, usage', () => {
    const res: AnthropicResponse = {
      id: 'msg_123',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello back' }],
      model: 'claude-3-opus-20240229',
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    expect(res.id).toBe('msg_123');
    expect(res.type).toBe('message');
    expect(res.role).toBe('assistant');
    expect(res.content).toHaveLength(1);
    expect(res.model).toBe('claude-3-opus-20240229');
    expect(res.stop_reason).toBe('end_turn');
    expect(res.usage).toBeDefined();
  });

  it('Usage has input_tokens and output_tokens as numbers', () => {
    const usage: Usage = { input_tokens: 42, output_tokens: 17 };
    expect(typeof usage.input_tokens).toBe('number');
    expect(typeof usage.output_tokens).toBe('number');
  });

  it('AnthropicError has type "error" and nested error object with type and message', () => {
    const err: AnthropicError = {
      type: 'error',
      error: { type: 'invalid_request_error', message: 'Missing required field' },
    };
    expect(err.type).toBe('error');
    expect(err.error.type).toBe('invalid_request_error');
    expect(err.error.message).toBe('Missing required field');
  });

  it('stream defaults to false when absent from request', () => {
    const req: AnthropicRequest = {
      model: 'claude-3-opus-20240229',
      max_tokens: 1024,
      messages: [{ role: 'user', content: 'Hello' }],
    };
    expect(req.stream ?? false).toBe(false);
  });
});
