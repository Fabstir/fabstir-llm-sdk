import { describe, it, expect } from 'vitest';
import { ImageGenerationError } from '../../src/errors/image-generation-errors';
import type { ImageGenerationErrorCode } from '../../src/types/image-generation.types';

describe('ImageGenerationError', () => {
  describe('basic properties', () => {
    it('should have name "ImageGenerationError"', () => {
      const error = new ImageGenerationError('Test error', 'VALIDATION_FAILED');
      expect(error.name).toBe('ImageGenerationError');
    });

    it('should store the provided error code', () => {
      const error = new ImageGenerationError('Test', 'PROMPT_BLOCKED');
      expect(error.code).toBe('PROMPT_BLOCKED');
    });

    it('should store the provided message', () => {
      const error = new ImageGenerationError('Something went wrong', 'IMAGE_GENERATION_FAILED');
      expect(error.message).toBe('Something went wrong');
    });

    it('should be instanceof Error', () => {
      const error = new ImageGenerationError('Test', 'VALIDATION_FAILED');
      expect(error).toBeInstanceOf(Error);
    });

    it('should be instanceof ImageGenerationError', () => {
      const error = new ImageGenerationError('Test', 'VALIDATION_FAILED');
      expect(error).toBeInstanceOf(ImageGenerationError);
    });
  });

  describe('isRetryable', () => {
    it('RATE_LIMIT_EXCEEDED should be retryable', () => {
      const error = new ImageGenerationError('Rate limited', 'RATE_LIMIT_EXCEEDED', 5000);
      expect(error.isRetryable).toBe(true);
      expect(error.retryAfter).toBe(5000);
    });

    it('IMAGE_GENERATION_FAILED should be retryable', () => {
      const error = new ImageGenerationError('Failed', 'IMAGE_GENERATION_FAILED');
      expect(error.isRetryable).toBe(true);
    });

    it('PROMPT_BLOCKED should not be retryable', () => {
      const error = new ImageGenerationError('Blocked', 'PROMPT_BLOCKED');
      expect(error.isRetryable).toBe(false);
    });
  });
});
