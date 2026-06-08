import { describe, it, expect } from 'vitest';
import { convertOpenAIMessages, estimateInputTokens } from '../../src/openai/converter';

describe('converter: messages → ChatML (4.1)', () => {
  it('merges system messages into one system block and ends with an assistant primer', async () => {
    const { prompt } = await convertOpenAIMessages([
      { role: 'system', content: 'A' },
      { role: 'system', content: 'B' },
      { role: 'user', content: 'hi' },
    ]);
    expect(prompt).toContain('<|im_start|>system\nA\n\nB\n<|im_end|>');
    expect(prompt).toContain('<|im_start|>user\nhi\n<|im_end|>');
    expect(prompt.endsWith('<|im_start|>assistant\n')).toBe(true);
  });

  it('renders tools as a native-JSON <tool_call> instruction block in the system message', async () => {
    const { prompt } = await convertOpenAIMessages(
      [{ role: 'user', content: 'go' }],
      [{ type: 'function', function: { name: 'Bash', description: 'run a command', parameters: { required: ['command'] } } }],
    );
    expect(prompt).toContain('# Tools');
    expect(prompt).toContain('Bash');
    expect(prompt).toContain('<tool_call>');
    // Native JSON instructions (not the per-arg XML the model can't emit cleanly)
    expect(prompt).toContain('<tool_call>{"name":');
    expect(prompt).toContain('"arguments"');
    expect(prompt).not.toContain('<arg_key>');
  });

  it('round-trips assistant tool_calls as native JSON and role:tool → observation', async () => {
    const { prompt } = await convertOpenAIMessages([
      { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'Bash', arguments: '{"command":"ls"}' } }] },
      { role: 'tool', content: 'file1\nfile2', tool_call_id: 'c1' },
    ]);
    expect(prompt).toContain('<tool_call>{"name":"Bash","arguments":{"command":"ls"}}</tool_call>');
    expect(prompt).toContain('<|im_start|>observation\nfile1\nfile2\n<|im_end|>');
  });

  it('extracts a base64 data-URI image from user content', async () => {
    const { images } = await convertOpenAIMessages([
      { role: 'user', content: [
        { type: 'text', text: 'look' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,ABC123' } },
      ] },
    ]);
    expect(images).toEqual([{ data: 'ABC123', format: 'png' }]);
  });

  it('estimateInputTokens ≈ length/4', () => {
    expect(estimateInputTokens('abcd')).toBe(1);
    expect(estimateInputTokens('abcde')).toBe(2);
  });
});
