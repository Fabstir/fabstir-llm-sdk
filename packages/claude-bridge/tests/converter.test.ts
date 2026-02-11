import { describe, it, expect } from 'vitest';
import { convertMessages, estimateInputTokens } from '../src/converter';
import type { AnthropicMessage, AnthropicTool } from '../src/types';

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

  it('tool use blocks serialized as raw JSON', () => {
    const messages: AnthropicMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'call_1', name: 'get_weather', input: { city: 'London' } },
        ],
      },
    ];
    const { prompt } = convertMessages(messages);
    expect(prompt).toContain('"name":"get_weather"');
    expect(prompt).toContain('"arguments"');
    expect(prompt).toContain('"city":"London"');
  });

  it('tool result blocks formatted as observation', () => {
    const messages: AnthropicMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'call_1', content: 'Sunny, 22C' },
        ],
      },
    ];
    const { prompt } = convertMessages(messages);
    expect(prompt).toContain('<|im_start|>observation');
    expect(prompt).toContain('Sunny, 22C');
  });

  it('empty messages array throws error', () => {
    expect(() => convertMessages([])).toThrow();
  });

  it('convertMessages with tools injects tool definitions into system prompt', () => {
    const messages: AnthropicMessage[] = [{ role: 'user', content: 'Hello' }];
    const tools: AnthropicTool[] = [
      { name: 'get_weather', description: 'Get weather info', input_schema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } },
    ];
    const { prompt } = convertMessages(messages, undefined, tools);
    expect(prompt).toContain('<|im_start|>system\n');
    expect(prompt).toContain('get_weather');
    expect(prompt).toContain('Get weather info');
    expect(prompt).toContain('[city]');
  });

  it('convertMessages with tools includes Available Tools header', () => {
    const messages: AnthropicMessage[] = [{ role: 'user', content: 'Hello' }];
    const tools: AnthropicTool[] = [
      { name: 'read_file', description: 'Read a file', input_schema: { type: 'object' } },
    ];
    const { prompt } = convertMessages(messages, undefined, tools);
    expect(prompt).toContain('# Tools');
    expect(prompt).toContain('- read_file:');
  });

  it('convertMessages with tools preserves existing system prompt before tools', () => {
    const messages: AnthropicMessage[] = [{ role: 'user', content: 'Hello' }];
    const tools: AnthropicTool[] = [
      { name: 'get_weather', description: 'Get weather info', input_schema: { type: 'object' } },
    ];
    const { prompt } = convertMessages(messages, 'You are helpful.', tools);
    expect(prompt).toContain('You are helpful.');
    expect(prompt).toContain('get_weather');
    // System prompt comes before tools (tools at end for recency bias)
    expect(prompt.indexOf('You are helpful.')).toBeLessThan(prompt.indexOf('get_weather'));
  });

  it('tool prompt includes format example with <tool_call> tags', () => {
    const messages: AnthropicMessage[] = [{ role: 'user', content: 'Hello' }];
    const tools: AnthropicTool[] = [
      { name: 'Bash', description: 'Run a command', input_schema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } },
    ];
    const { prompt } = convertMessages(messages, undefined, tools);
    expect(prompt).toContain('<tool_call>');
    expect(prompt).toContain('<arg_key>');
    expect(prompt).toContain('<arg_value>');
    expect(prompt).toContain('IMPORTANT');
  });

  it('convertMessages with tools includes required params in brackets', () => {
    const messages: AnthropicMessage[] = [{ role: 'user', content: 'Hello' }];
    const tools: AnthropicTool[] = [
      { name: 'get_weather', description: 'Get weather info', input_schema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } },
    ];
    const { prompt } = convertMessages(messages, undefined, tools);
    expect(prompt).toContain('- get_weather: Get weather info [city]');
  });

  it('system prompt capped at 1000 chars', () => {
    const messages: AnthropicMessage[] = [{ role: 'user', content: 'Hello' }];
    const longSystem = 'A'.repeat(5000);
    const { prompt } = convertMessages(messages, longSystem);
    // System block should contain at most 1000 chars of the original system text
    expect(prompt).toContain('A'.repeat(1000));
    expect(prompt).not.toContain('A'.repeat(1001));
  });

  it('convertMessages with empty tools array produces no tool injection', () => {
    const messages: AnthropicMessage[] = [{ role: 'user', content: 'Hello' }];
    const withEmpty = convertMessages(messages, undefined, []);
    const withNone = convertMessages(messages, undefined);
    expect(withEmpty.prompt).toBe(withNone.prompt);
  });

  it('convertMessages with multiple tools includes all tool definitions', () => {
    const messages: AnthropicMessage[] = [{ role: 'user', content: 'Hello' }];
    const tools: AnthropicTool[] = [
      { name: 'read_file', description: 'Read a file', input_schema: { type: 'object' } },
      { name: 'write_file', description: 'Write a file', input_schema: { type: 'object' } },
      { name: 'list_dir', description: 'List directory', input_schema: { type: 'object' } },
    ];
    const { prompt } = convertMessages(messages, undefined, tools);
    expect(prompt).toContain('read_file');
    expect(prompt).toContain('write_file');
    expect(prompt).toContain('list_dir');
  });
});

describe('estimateInputTokens', () => {
  it('estimateInputTokens("hello world") returns 3', () => {
    expect(estimateInputTokens('hello world')).toBe(3);
  });
});
