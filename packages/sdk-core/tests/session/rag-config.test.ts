/**
 * RAG Configuration Tests
 * Tests for RAG session configuration validation and merging
 * Max 250 lines
 */

import { describe, it, expect } from 'vitest';
import {
  validateRAGConfig,
  mergeRAGConfig,
  DEFAULT_RAG_CONFIG,
  type RAGSessionConfig,
  type PartialRAGSessionConfig
} from '../../src/session/rag-config.js';

describe('RAG Configuration', () => {
  describe('Default Configuration', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_RAG_CONFIG.enabled).toBe(false);
      expect(DEFAULT_RAG_CONFIG.topK).toBe(5);
      expect(DEFAULT_RAG_CONFIG.similarityThreshold).toBe(0.7);
      expect(DEFAULT_RAG_CONFIG.maxContextLength).toBe(2000);
      expect(DEFAULT_RAG_CONFIG.includeSources).toBe(true);
      expect(DEFAULT_RAG_CONFIG.contextTemplate).toContain('{context}');
    });
  });

  describe('Configuration Validation', () => {
    it('should pass validation when disabled', () => {
      const config: PartialRAGSessionConfig = { enabled: false };
      expect(() => validateRAGConfig(config)).not.toThrow();
    });

    it('should pass validation with vectorDbSessionId', () => {
      const config: PartialRAGSessionConfig = {
        enabled: true,
        vectorDbSessionId: 'session-123'
      };
      expect(() => validateRAGConfig(config)).not.toThrow();
    });

    it('should pass validation with databaseName', () => {
      const config: PartialRAGSessionConfig = {
        enabled: true,
        databaseName: 'my-docs'
      };
      expect(() => validateRAGConfig(config)).not.toThrow();
    });

    it('should fail validation without vectorDbSessionId or databaseName when enabled', () => {
      const config: PartialRAGSessionConfig = { enabled: true };
      expect(() => validateRAGConfig(config)).toThrow(
        'RAG config requires either vectorDbSessionId or databaseName when enabled'
      );
    });

    it('should fail validation with both vectorDbSessionId and databaseName', () => {
      const config: PartialRAGSessionConfig = {
        enabled: true,
        vectorDbSessionId: 'session-123',
        databaseName: 'my-docs'
      };
      expect(() => validateRAGConfig(config)).toThrow(
        'RAG config cannot have both vectorDbSessionId and databaseName'
      );
    });

    it('should fail validation with topK out of range (too low)', () => {
      const config: PartialRAGSessionConfig = {
        enabled: true,
        databaseName: 'my-docs',
        topK: 0
      };
      expect(() => validateRAGConfig(config)).toThrow(
        'RAG topK must be between 1 and 100'
      );
    });

    it('should fail validation with topK out of range (too high)', () => {
      const config: PartialRAGSessionConfig = {
        enabled: true,
        databaseName: 'my-docs',
        topK: 101
      };
      expect(() => validateRAGConfig(config)).toThrow(
        'RAG topK must be between 1 and 100'
      );
    });

    it('should fail validation with similarityThreshold out of range', () => {
      const config: PartialRAGSessionConfig = {
        enabled: true,
        databaseName: 'my-docs',
        similarityThreshold: 1.5
      };
      expect(() => validateRAGConfig(config)).toThrow(
        'RAG similarityThreshold must be between 0 and 1'
      );
    });

    it('should fail validation with maxContextLength too small', () => {
      const config: PartialRAGSessionConfig = {
        enabled: true,
        databaseName: 'my-docs',
        maxContextLength: 50
      };
      expect(() => validateRAGConfig(config)).toThrow(
        'RAG maxContextLength must be at least 100 tokens'
      );
    });

    it('should pass validation with all valid parameters', () => {
      const config: PartialRAGSessionConfig = {
        enabled: true,
        databaseName: 'my-docs',
        topK: 10,
        similarityThreshold: 0.8,
        maxContextLength: 3000,
        includeSources: false,
        contextTemplate: 'Custom template: {context}',
        metadataFilter: { category: 'technical' }
      };
      expect(() => validateRAGConfig(config)).not.toThrow();
    });
  });

  describe('Configuration Merging', () => {
    it('should return defaults when no config provided', () => {
      const merged = mergeRAGConfig();
      expect(merged.enabled).toBe(false);
      expect(merged.topK).toBe(5);
      expect(merged.similarityThreshold).toBe(0.7);
    });

    it('should merge partial config with defaults', () => {
      const partial: PartialRAGSessionConfig = {
        enabled: true,
        databaseName: 'my-docs',
        topK: 10
      };
      const merged = mergeRAGConfig(partial);

      expect(merged.enabled).toBe(true);
      expect(merged.databaseName).toBe('my-docs');
      expect(merged.topK).toBe(10);
      expect(merged.similarityThreshold).toBe(0.7); // From defaults
      expect(merged.maxContextLength).toBe(2000); // From defaults
    });

    it('should override all defaults', () => {
      const full: RAGSessionConfig = {
        enabled: true,
        vectorDbSessionId: 'session-123',
        topK: 15,
        similarityThreshold: 0.9,
        maxContextLength: 5000,
        includeSources: false,
        contextTemplate: 'Custom: {context}'
      };
      const merged = mergeRAGConfig(full);

      expect(merged).toEqual(full);
    });

    it('should preserve undefined optional fields', () => {
      const partial: PartialRAGSessionConfig = {
        enabled: true,
        databaseName: 'my-docs'
      };
      const merged = mergeRAGConfig(partial);

      expect(merged.vectorDbSessionId).toBeUndefined();
      expect(merged.metadataFilter).toBeUndefined();
    });

    it('should handle metadata filter', () => {
      const partial: PartialRAGSessionConfig = {
        enabled: true,
        databaseName: 'my-docs',
        metadataFilter: { documentType: 'pdf', year: 2024 }
      };
      const merged = mergeRAGConfig(partial);

      expect(merged.metadataFilter).toEqual({ documentType: 'pdf', year: 2024 });
    });
  });

  describe('Context Template', () => {
    it('should have default template with placeholders', () => {
      const merged = mergeRAGConfig();
      expect(merged.contextTemplate).toContain('{context}');
    });

    it('should allow custom template', () => {
      const custom = 'Based on docs:\n{context}\n\nSources: {sources}';
      const merged = mergeRAGConfig({ contextTemplate: custom });
      expect(merged.contextTemplate).toBe(custom);
    });
  });
});
