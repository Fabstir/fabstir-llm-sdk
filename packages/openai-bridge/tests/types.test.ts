import { describe, it, expect } from 'vitest';
import type {
  OpenAIChatMessage,
  OpenAIChatRequest,
  OpenAIContentPart,
  OpenAIToolCall,
  OpenAITool,
  OpenAIChatCompletionChunk,
  OpenAIChatCompletion,
  OpenAIChoice,
  OpenAIUsage,
  OpenAIImageRequest,
  OpenAIImageResponse,
  OpenAIErrorResponse,
} from '../src/types';
import { OPENAI_FINISH_REASONS } from '../src/types';

describe('OpenAI Types', () => {
  it('OpenAIChatRequest accepts minimal request (model + messages)', () => {
    const req: OpenAIChatRequest = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
    };
    expect(req.model).toBe('gpt-4');
    expect(req.messages).toHaveLength(1);
  });

  it('OpenAIChatRequest accepts full request with tools and streaming', () => {
    const tool: OpenAITool = {
      type: 'function',
      function: { name: 'get_weather', description: 'Get weather', parameters: { type: 'object' } },
    };
    const req: OpenAIChatRequest = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Weather?' }],
      tools: [tool],
      stream: true,
      max_tokens: 1024,
      temperature: 0.7,
      top_p: 0.9,
      stop: ['\n'],
      tool_choice: 'auto',
    };
    expect(req.stream).toBe(true);
    expect(req.tools).toHaveLength(1);
    expect(req.max_tokens).toBe(1024);
  });

  it('OpenAIChatMessage accepts string content', () => {
    const msg: OpenAIChatMessage = { role: 'user', content: 'Hello' };
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('Hello');
  });

  it('OpenAIChatMessage accepts content parts array (text + image_url)', () => {
    const parts: OpenAIContentPart[] = [
      { type: 'text', text: 'What is this?' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
    ];
    const msg: OpenAIChatMessage = { role: 'user', content: parts };
    expect(Array.isArray(msg.content)).toBe(true);
    expect((msg.content as OpenAIContentPart[])).toHaveLength(2);
  });

  it('OpenAIChatMessage accepts tool_calls array', () => {
    const toolCall: OpenAIToolCall = {
      id: 'call_123',
      type: 'function',
      function: { name: 'get_weather', arguments: '{"city":"London"}' },
    };
    const msg: OpenAIChatMessage = {
      role: 'assistant',
      content: null,
      tool_calls: [toolCall],
    };
    expect(msg.tool_calls).toHaveLength(1);
    expect(msg.tool_calls![0].function.name).toBe('get_weather');
  });

  it('OpenAIChatMessage accepts tool role with tool_call_id', () => {
    const msg: OpenAIChatMessage = {
      role: 'tool',
      content: '{"temp": 20}',
      tool_call_id: 'call_123',
    };
    expect(msg.role).toBe('tool');
    expect(msg.tool_call_id).toBe('call_123');
  });

  it('OpenAIImageRequest accepts minimal request (prompt only)', () => {
    const req: OpenAIImageRequest = { prompt: 'A cat in space' };
    expect(req.prompt).toBe('A cat in space');
    expect(req.n).toBeUndefined();
  });

  it('OpenAIImageRequest accepts full request (size, quality, n)', () => {
    const req: OpenAIImageRequest = {
      prompt: 'A mountain',
      model: 'dall-e-3',
      n: 2,
      size: '1024x1024',
      quality: 'hd',
      style: 'vivid',
      response_format: 'b64_json',
    };
    expect(req.n).toBe(2);
    expect(req.quality).toBe('hd');
  });

  it('OpenAIImageResponse has correct shape with b64_json', () => {
    const res: OpenAIImageResponse = {
      created: 1234567890,
      data: [{ b64_json: 'base64data', revised_prompt: 'A cat in space' }],
    };
    expect(res.data).toHaveLength(1);
    expect(res.data[0].b64_json).toBe('base64data');
  });

  it('OpenAIChatCompletionChunk has choices with delta', () => {
    const chunk: OpenAIChatCompletionChunk = {
      id: 'chatcmpl-123',
      object: 'chat.completion.chunk',
      created: 1234567890,
      model: 'gpt-4',
      choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }],
    };
    expect(chunk.choices[0].delta.content).toBe('Hello');
    expect(chunk.object).toBe('chat.completion.chunk');
  });

  it('OpenAIChatCompletion has choices with message and usage', () => {
    const usage: OpenAIUsage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 };
    const choice: OpenAIChoice = {
      index: 0,
      message: { role: 'assistant', content: 'Hi there' },
      finish_reason: 'stop',
    };
    const completion: OpenAIChatCompletion = {
      id: 'chatcmpl-456',
      object: 'chat.completion',
      created: 1234567890,
      model: 'gpt-4',
      choices: [choice],
      usage,
    };
    expect(completion.choices[0].message.content).toBe('Hi there');
    expect(completion.usage.total_tokens).toBe(30);
  });

  it('OpenAIErrorResponse has error with message and type', () => {
    const err: OpenAIErrorResponse = {
      error: { message: 'Invalid model', type: 'invalid_request_error', code: 'model_not_found' },
    };
    expect(err.error.type).toBe('invalid_request_error');
    expect(err.error.code).toBe('model_not_found');
  });

  it('OPENAI_FINISH_REASONS has correct values', () => {
    expect(OPENAI_FINISH_REASONS.STOP).toBe('stop');
    expect(OPENAI_FINISH_REASONS.TOOL_CALLS).toBe('tool_calls');
    expect(OPENAI_FINISH_REASONS.LENGTH).toBe('length');
  });
});
