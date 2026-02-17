import { describe, it, expect } from 'vitest';
import { createThinkStripper, stripThinkFromText } from '../src/think-stripper';

describe('ThinkStripper', () => {
  describe('streaming (createThinkStripper)', () => {
    it('passes through text without think tags', () => {
      const strip = createThinkStripper();
      expect(strip('Hello')).toBe('Hello');
      expect(strip(' world')).toBe(' world');
    });

    it('strips <think>reasoning</think> prefix', () => {
      const strip = createThinkStripper();
      const result = strip('<think>some reasoning</think>Actual response');
      expect(result).toBe('Actual response');
    });

    it('returns null for tokens inside think block', () => {
      const strip = createThinkStripper();
      expect(strip('<think>')).toBe('');
      expect(strip('reasoning')).toBe('');
      expect(strip(' more')).toBe('');
    });

    it('returns text after </think> close', () => {
      const strip = createThinkStripper();
      strip('<think>');
      strip('reasoning');
      const result = strip('</think>Hello');
      expect(result).toBe('Hello');
      // subsequent tokens pass through
      expect(strip(' there')).toBe(' there');
    });

    it('early detection skips non-think content immediately', () => {
      const strip = createThinkStripper();
      // Content that doesn't start with <think — should pass through immediately
      expect(strip('Hello')).toBe('Hello');
      expect(strip(' world')).toBe(' world');
    });
  });

  describe('non-streaming (stripThinkFromText)', () => {
    it('strips think block from complete text', () => {
      expect(stripThinkFromText('<think>reasoning stuff</think>Actual answer')).toBe('Actual answer');
    });

    it('returns unchanged text without think block', () => {
      expect(stripThinkFromText('No thinking here')).toBe('No thinking here');
    });

    it('handles empty string', () => {
      expect(stripThinkFromText('')).toBe('');
    });
  });
});
