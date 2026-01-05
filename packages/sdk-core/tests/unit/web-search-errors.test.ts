/**
 * @fileoverview Tests for WebSearchError class
 * Sub-phase 3.1: Add WebSearchError Class
 *
 * Tests that the WebSearchError class correctly handles error codes
 * and identifies retryable vs non-retryable errors.
 */

import { describe, it, expect } from 'vitest';
import { WebSearchError } from '../../src/errors/web-search-errors';
import type { WebSearchErrorCode } from '../../src/types/web-search.types';

describe('WebSearchError', () => {
  describe('basic properties', () => {
    it('should have correct name property', () => {
      const error = new WebSearchError('Test error', 'provider_error');
      expect(error.name).toBe('WebSearchError');
    });

    it('should have code property with correct type', () => {
      const error = new WebSearchError('Test error', 'rate_limited');
      expect(error.code).toBe('rate_limited');
      expect(error.message).toBe('Test error');
    });

    it('should accept optional retryAfter', () => {
      const error = new WebSearchError('Rate limited', 'rate_limited', 30);
      expect(error.retryAfter).toBe(30);
    });
  });

  describe('isRetryable', () => {
    it('should return true for retryable error codes', () => {
      const retryableCodes: WebSearchErrorCode[] = [
        'rate_limited',
        'timeout',
        'provider_error',
      ];

      for (const code of retryableCodes) {
        const error = new WebSearchError('Error', code);
        expect(error.isRetryable).toBe(true);
      }
    });

    it('should return false for non-retryable error codes', () => {
      const nonRetryableCodes: WebSearchErrorCode[] = [
        'search_disabled',
        'invalid_query',
        'no_providers',
      ];

      for (const code of nonRetryableCodes) {
        const error = new WebSearchError('Error', code);
        expect(error.isRetryable).toBe(false);
      }
    });
  });

  describe('inheritance', () => {
    it('should be an instance of Error', () => {
      const error = new WebSearchError('Test', 'timeout');
      expect(error).toBeInstanceOf(Error);
    });

    it('should be catchable as Error', () => {
      try {
        throw new WebSearchError('Test error', 'provider_error');
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect((e as WebSearchError).code).toBe('provider_error');
      }
    });
  });
});
