import { describe, it, expect } from 'vitest';
import { convertMessages, estimateInputTokens } from '../src/converter';
import type { AnthropicMessage } from '../src/types';

describe('convertMessages', () => {
  it('single user message produces correct ChatML', () => {
    const messages: AnthropicMessage[] = [{ role: 'user', content: 'Hello' }];
    const { prompt } = convertMessages(messages);
    expect(prompt).toBe(
      '<|im_start|>user\nHello\n<|im_end|>\n<|im_start|>assistant\n'
    );
  });

  it('system prompt prepended with system tag', () => {
    const messages: AnthropicMessage[] = [{ role: 'user', content: 'Hi' }];
    const { prompt } = convertMessages(messages, 'You are helpful.');
    expect(prompt).toContain('<|im_start|>system\nYou are helpful.\n<|im_end|>\n');
    expect(prompt.indexOf('<|im_start|>system')).toBe(0);
  });

  it('multi-turn conversation preserves message order', () => {
    const messages: AnthropicMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
      { role: 'user', content: 'How are you?' },
    ];
    const { prompt } = convertMessages(messages);
    const userIdx1 = prompt.indexOf('<|im_start|>user\nHello');
    const assistantIdx = prompt.indexOf('<|im_start|>assistant\nHi there');
    const userIdx2 = prompt.indexOf('<|im_start|>user\nHow are you?');
    expect(userIdx1).toBeLessThan(assistantIdx);
    expect(assistantIdx).toBeLessThan(userIdx2);
  });

  it('content as string produces same output as content as [{type:"text", text:"..."}]', () => {
    const stringMsg: AnthropicMessage[] = [{ role: 'user', content: 'Hello' }];
    const blockMsg: AnthropicMessage[] = [
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    ];
    expect(convertMessages(stringMsg).prompt).toBe(convertMessages(blockMsg).prompt);
  });

  it('image blocks extracted to ImageAttachment[] with correct data and format', () => {
    const messages: AnthropicMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc123' } },
        ],
      },
    ];
    const { images } = convertMessages(messages);
    expect(images).toHaveLength(1);
    expect(images[0].data).toBe('abc123');
    expect(images[0].format).toBe('png');
  });

  it('mixed text + image in same message', () => {
    const messages: AnthropicMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Look at this' },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'img64' } },
        ],
      },
    ];
    const { prompt, images } = convertMessages(messages);
    expect(prompt).toContain('Look at this');
    expect(images).toHaveLength(1);
    expect(images[0].format).toBe('jpeg');
  });

  it('tool use blocks serialized as readable text', () => {
    const messages: AnthropicMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'call_1', name: 'get_weather', input: { city: 'London' } },
        ],
      },
    ];
    const { prompt } = convertMessages(messages);
    expect(prompt).toContain('[Tool Use: get_weather]');
    expect(prompt).toContain(JSON.stringify({ city: 'London' }));
  });

  it('tool result blocks serialized as readable text', () => {
    const messages: AnthropicMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'call_1', content: 'Sunny, 22C' },
        ],
      },
    ];
    const { prompt } = convertMessages(messages);
    expect(prompt).toContain('[Tool Result: call_1]');
    expect(prompt).toContain('Sunny, 22C');
  });

  it('empty messages array throws error', () => {
    expect(() => convertMessages([])).toThrow();
  });
});

describe('estimateInputTokens', () => {
  it('estimateInputTokens("hello world") returns 3', () => {
    expect(estimateInputTokens('hello world')).toBe(3);
  });
});
