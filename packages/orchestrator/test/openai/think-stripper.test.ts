import { describe, it, expect } from 'vitest';
import { createThinkStripper, stripThinkFromText } from '../../src/openai/think-stripper';

describe('think-stripper (4.1)', () => {
  it('createThinkStripper removes <think>…</think> across chunk boundaries', () => {
    const strip = createThinkStripper();
    const chunks = ['<thi', 'nk>reason', 'ing</thi', 'nk>hel', 'lo'];
    const out = chunks.map(strip).join('');
    expect(out).toBe('hello');
  });

  it('passes through text that is not a think block', () => {
    const strip = createThinkStripper();
    expect(strip('Hello world')).toBe('Hello world');
  });

  it('emits content after </think> even when think and content arrive together', () => {
    const strip = createThinkStripper();
    expect(strip('<think>x</think>answer')).toBe('answer');
  });

  it('stripThinkFromText returns text after </think>, or unchanged when absent', () => {
    expect(stripThinkFromText('<think>reasoning</think>final')).toBe('final');
    expect(stripThinkFromText('no think here')).toBe('no think here');
  });
});
