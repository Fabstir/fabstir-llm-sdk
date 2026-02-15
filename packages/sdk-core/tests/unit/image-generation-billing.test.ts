import { describe, it, expect } from 'vitest';
import { parseSize, estimateGenerationUnits } from '../../src/utils/image-generation-billing';

describe('Image Generation Billing', () => {
  describe('parseSize', () => {
    it('should parse 1024x1024', () => {
      expect(parseSize('1024x1024')).toEqual({ width: 1024, height: 1024 });
    });

    it('should parse 512x512', () => {
      expect(parseSize('512x512')).toEqual({ width: 512, height: 512 });
    });

    it('should parse 1024x768', () => {
      expect(parseSize('1024x768')).toEqual({ width: 1024, height: 768 });
    });

    it('should throw on invalid format', () => {
      expect(() => parseSize('invalid')).toThrow();
    });

    it('should throw on empty string', () => {
      expect(() => parseSize('')).toThrow();
    });

    it('should throw on missing separator', () => {
      expect(() => parseSize('1024')).toThrow();
    });
  });

  describe('estimateGenerationUnits', () => {
    // Formula: (width * height / 1_048_576) * (steps / 20) * modelMultiplier

    it('256x256 with 4 steps ≈ 0.0125', () => {
      const result = estimateGenerationUnits(256, 256, 4);
      expect(result).toBeCloseTo(0.0125, 4);
    });

    it('512x512 with 4 steps = 0.05', () => {
      expect(estimateGenerationUnits(512, 512, 4)).toBeCloseTo(0.05, 4);
    });

    it('512x512 with 20 steps = 0.25', () => {
      expect(estimateGenerationUnits(512, 512, 20)).toBeCloseTo(0.25, 4);
    });

    it('1024x1024 with 4 steps = 0.2', () => {
      expect(estimateGenerationUnits(1024, 1024, 4)).toBeCloseTo(0.2, 4);
    });

    it('1024x1024 with 20 steps = 1.0', () => {
      expect(estimateGenerationUnits(1024, 1024, 20)).toBeCloseTo(1.0, 4);
    });

    it('1024x1024 with 20 steps and multiplier 2.0 = 2.0', () => {
      expect(estimateGenerationUnits(1024, 1024, 20, 2.0)).toBeCloseTo(2.0, 4);
    });
  });
});
