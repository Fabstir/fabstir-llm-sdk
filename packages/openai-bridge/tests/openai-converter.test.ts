import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { convertOpenAIMessages, estimateInputTokens } from '../src/openai-converter';
import type { OpenAIChatMessage, OpenAITool } from '../src/types';

describe('OpenAI Converter', () => {
  it('converts single user message to ChatML', async () => {
    const messages: OpenAIChatMessage[] = [{ role: 'user', content: 'Hello' }];
    const { prompt } = await convertOpenAIMessages(messages);
    expect(prompt).toContain('<|im_start|>user\nHello\n<|im_end|>');
    expect(prompt).toContain('<|im_start|>assistant\n');
  });

  it('converts system + user + assistant multi-turn', async () => {
    const messages: OpenAIChatMessage[] = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
      { role: 'user', content: 'Bye' },
    ];
    const { prompt } = await convertOpenAIMessages(messages);
    expect(prompt).toContain('<|im_start|>system\nYou are helpful.');
    expect(prompt).toContain('<|im_start|>user\nHi\n<|im_end|>');
    expect(prompt).toContain('<|im_start|>assistant\nHello!\n<|im_end|>');
    expect(prompt).toContain('<|im_start|>user\nBye\n<|im_end|>');
    expect(prompt).toMatch(/<\|im_start\|>assistant\n$/);
  });

  it('handles system message as first message', async () => {
    const messages: OpenAIChatMessage[] = [
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'What is 2+2?' },
    ];
    const { prompt } = await convertOpenAIMessages(messages);
    expect(prompt.indexOf('system')).toBeLessThan(prompt.indexOf('user'));
  });

  it('handles string content in user message', async () => {
    const messages: OpenAIChatMessage[] = [{ role: 'user', content: 'Just text' }];
    const { prompt } = await convertOpenAIMessages(messages);
    expect(prompt).toContain('Just text');
  });

  it('handles content parts array in user message', async () => {
    const messages: OpenAIChatMessage[] = [{
      role: 'user',
      content: [
        { type: 'text', text: 'Describe this image' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
      ],
    }];
    const { prompt, images } = await convertOpenAIMessages(messages);
    expect(prompt).toContain('Describe this image');
    expect(images).toHaveLength(1);
  });

  it('extracts image_url from content parts to ImageAttachment[]', async () => {
    const messages: OpenAIChatMessage[] = [{
      role: 'user',
      content: [
        { type: 'text', text: 'What is this?' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/4AAQ' } },
      ],
    }];
    const { images } = await convertOpenAIMessages(messages);
    expect(images).toHaveLength(1);
    expect(images[0].data).toBe('/9j/4AAQ');
    expect(images[0].format).toBe('jpeg');
  });

  it('handles base64 data URL in image_url', async () => {
    const messages: OpenAIChatMessage[] = [{
      role: 'user',
      content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } }],
    }];
    const { images } = await convertOpenAIMessages(messages);
    expect(images[0].data).toBe('iVBORw0KGgo=');
    expect(images[0].format).toBe('png');
  });

  it('converts assistant message with tool_calls to ChatML', async () => {
    const messages: OpenAIChatMessage[] = [{
      role: 'assistant',
      content: null,
      tool_calls: [{
        id: 'call_1',
        type: 'function',
        function: { name: 'get_weather', arguments: '{"city":"London"}' },
      }],
    }];
    const { prompt } = await convertOpenAIMessages(messages);
    expect(prompt).toContain('<|im_start|>assistant');
    expect(prompt).toContain('get_weather');
  });

  it('converts tool role message to observation block', async () => {
    const messages: OpenAIChatMessage[] = [
      { role: 'user', content: 'Weather?' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_weather', arguments: '{}' } }] },
      { role: 'tool', content: '{"temp": 20}', tool_call_id: 'c1' },
    ];
    const { prompt } = await convertOpenAIMessages(messages);
    expect(prompt).toContain('<|im_start|>observation\n{"temp": 20}\n<|im_end|>');
  });

  it('appends final assistant prompt tag', async () => {
    const messages: OpenAIChatMessage[] = [{ role: 'user', content: 'Hi' }];
    const { prompt } = await convertOpenAIMessages(messages);
    expect(prompt).toMatch(/<\|im_start\|>assistant\n$/);
  });

  it('injects tool definitions at end of system prompt', async () => {
    const tools: OpenAITool[] = [{
      type: 'function',
      function: { name: 'get_weather', description: 'Get current weather', parameters: {} },
    }];
    const messages: OpenAIChatMessage[] = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Weather?' },
    ];
    const { prompt } = await convertOpenAIMessages(messages, tools);
    expect(prompt).toContain('# Tools');
    expect(prompt).toContain('get_weather');
    expect(prompt).toContain('<tool_call>');
  });

  it('caps system prompt at 1000 chars', async () => {
    const longSystem = 'x'.repeat(2000);
    const messages: OpenAIChatMessage[] = [
      { role: 'system', content: longSystem },
      { role: 'user', content: 'Hi' },
    ];
    const { prompt } = await convertOpenAIMessages(messages);
    const systemBlock = prompt.split('<|im_end|>')[0];
    expect(systemBlock).not.toContain('x'.repeat(1001));
  });

  it('includes <tool_call> format instructions when tools provided', async () => {
    const tools: OpenAITool[] = [{
      type: 'function',
      function: { name: 'Bash', description: 'Run bash', parameters: {} },
    }];
    const messages: OpenAIChatMessage[] = [{ role: 'user', content: 'Run ls' }];
    const { prompt } = await convertOpenAIMessages(messages, tools);
    expect(prompt).toContain('Format: <tool_call>');
  });

  it('handles empty messages array (returns minimal prompt)', async () => {
    const { prompt } = await convertOpenAIMessages([]);
    expect(prompt).toContain('<|im_start|>assistant\n');
  });

  it('estimateInputTokens returns length/4', () => {
    expect(estimateInputTokens('hello world!!')).toBe(Math.ceil(13 / 4));
    expect(estimateInputTokens('')).toBe(0);
  });

  it('handles mixed text and image content parts', async () => {
    const messages: OpenAIChatMessage[] = [{
      role: 'user',
      content: [
        { type: 'text', text: 'First' },
        { type: 'image_url', image_url: { url: 'data:image/gif;base64,R0lG' } },
        { type: 'text', text: 'Second' },
      ],
    }];
    const { prompt, images } = await convertOpenAIMessages(messages);
    expect(prompt).toContain('First');
    expect(prompt).toContain('Second');
    expect(images).toHaveLength(1);
    expect(images[0].format).toBe('gif');
  });

  describe('HTTPS image URL fetching', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      globalThis.fetch = vi.fn();
    });
    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('fetches HTTPS image URL and converts to base64', async () => {
      const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
      const mockResponse = {
        ok: true,
        headers: { get: (h: string) => h === 'content-type' ? 'image/png' : null },
        arrayBuffer: () => Promise.resolve(pngBytes.buffer),
      };
      (globalThis.fetch as any).mockResolvedValue(mockResponse);

      const messages: OpenAIChatMessage[] = [{
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this' },
          { type: 'image_url', image_url: { url: 'https://example.com/photo.png' } },
        ],
      }];
      const { images } = await convertOpenAIMessages(messages);
      expect(images).toHaveLength(1);
      expect(images[0].format).toBe('png');
      expect(images[0].data).toBeTruthy();
      expect(globalThis.fetch).toHaveBeenCalledWith('https://example.com/photo.png');
    });

    it('infers format from content-type header', async () => {
      const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff]);
      const mockResponse = {
        ok: true,
        headers: { get: (h: string) => h === 'content-type' ? 'image/jpeg' : null },
        arrayBuffer: () => Promise.resolve(jpegBytes.buffer),
      };
      (globalThis.fetch as any).mockResolvedValue(mockResponse);

      const messages: OpenAIChatMessage[] = [{
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: 'https://example.com/photo.jpg' } }],
      }];
      const { images } = await convertOpenAIMessages(messages);
      expect(images).toHaveLength(1);
      expect(images[0].format).toBe('jpeg');
    });

    it('skips image when fetch fails', async () => {
      (globalThis.fetch as any).mockRejectedValue(new Error('Network error'));

      const messages: OpenAIChatMessage[] = [{
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this' },
          { type: 'image_url', image_url: { url: 'https://example.com/broken.png' } },
        ],
      }];
      const { images, prompt } = await convertOpenAIMessages(messages);
      expect(images).toHaveLength(0);
      expect(prompt).toContain('Describe this');
    });
  });
});
