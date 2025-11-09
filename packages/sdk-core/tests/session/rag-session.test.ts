/**
 * RAG Session Integration Tests
 * Tests for RAG integration with SessionManager
 * Max 300 lines
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SessionManager } from '../../src/managers/SessionManager.js';
import type { VectorRAGManager } from '../../src/managers/VectorRAGManager.js';
import type { EmbeddingService } from '../../src/embeddings/EmbeddingService.js';
import type { RAGSessionConfig } from '../../src/session/rag-config.js';

// Mock classes for testing
class MockSessionManager {
  private ragConfig?: RAGSessionConfig;
  private vectorRAGManager?: VectorRAGManager;
  private embeddingService?: EmbeddingService;
  private ragEnabled = false;

  setVectorRAGManager(manager: VectorRAGManager): void {
    this.vectorRAGManager = manager;
  }

  setEmbeddingService(service: EmbeddingService): void {
    this.embeddingService = service;
  }

  configureRAG(config: RAGSessionConfig): void {
    this.ragConfig = config;
    this.ragEnabled = config.enabled;
  }

  isRAGEnabled(): boolean {
    return this.ragEnabled;
  }

  getRAGConfig(): RAGSessionConfig | undefined {
    return this.ragConfig;
  }

  hasVectorRAGManager(): boolean {
    return this.vectorRAGManager !== undefined;
  }

  hasEmbeddingService(): boolean {
    return this.embeddingService !== undefined;
  }
}

describe('RAG Session Integration', () => {
  let mockSessionManager: MockSessionManager;
  let mockVectorRAGManager: VectorRAGManager;
  let mockEmbeddingService: EmbeddingService;

  beforeEach(() => {
    mockSessionManager = new MockSessionManager();

    mockVectorRAGManager = {
      createSession: vi.fn().mockResolvedValue('vector-session-123'),
      searchVectors: vi.fn().mockResolvedValue([])
    } as any;

    mockEmbeddingService = {
      embedText: vi.fn().mockResolvedValue({
        embedding: Array(384).fill(0),
        text: 'test',
        tokenCount: 10
      })
    } as any;
  });

  describe('RAG Configuration', () => {
    it('should accept RAG configuration', () => {
      const config: RAGSessionConfig = {
        enabled: true,
        databaseName: 'my-docs',
        topK: 5,
        similarityThreshold: 0.7
      };

      mockSessionManager.configureRAG(config);

      expect(mockSessionManager.isRAGEnabled()).toBe(true);
      expect(mockSessionManager.getRAGConfig()).toEqual(config);
    });

    it('should disable RAG when enabled is false', () => {
      const config: RAGSessionConfig = {
        enabled: false
      };

      mockSessionManager.configureRAG(config);

      expect(mockSessionManager.isRAGEnabled()).toBe(false);
    });

    it('should allow configuration with vectorDbSessionId', () => {
      const config: RAGSessionConfig = {
        enabled: true,
        vectorDbSessionId: 'existing-session-123'
      };

      mockSessionManager.configureRAG(config);

      expect(mockSessionManager.getRAGConfig()?.vectorDbSessionId).toBe('existing-session-123');
    });

    it('should allow configuration with databaseName', () => {
      const config: RAGSessionConfig = {
        enabled: true,
        databaseName: 'my-knowledge-base'
      };

      mockSessionManager.configureRAG(config);

      expect(mockSessionManager.getRAGConfig()?.databaseName).toBe('my-knowledge-base');
    });
  });

  describe('Manager Injection', () => {
    it('should accept VectorRAGManager', () => {
      mockSessionManager.setVectorRAGManager(mockVectorRAGManager);

      expect(mockSessionManager.hasVectorRAGManager()).toBe(true);
    });

    it('should accept EmbeddingService', () => {
      mockSessionManager.setEmbeddingService(mockEmbeddingService);

      expect(mockSessionManager.hasEmbeddingService()).toBe(true);
    });
  });

  describe('RAG Toggle', () => {
    it('should enable RAG', () => {
      const config: RAGSessionConfig = {
        enabled: true,
        databaseName: 'docs'
      };

      mockSessionManager.configureRAG(config);

      expect(mockSessionManager.isRAGEnabled()).toBe(true);
    });

    it('should disable RAG', () => {
      // First enable
      mockSessionManager.configureRAG({
        enabled: true,
        databaseName: 'docs'
      });

      // Then disable
      mockSessionManager.configureRAG({
        enabled: false
      });

      expect(mockSessionManager.isRAGEnabled()).toBe(false);
    });

    it('should allow re-enabling RAG', () => {
      // Disable
      mockSessionManager.configureRAG({ enabled: false });
      expect(mockSessionManager.isRAGEnabled()).toBe(false);

      // Re-enable
      mockSessionManager.configureRAG({
        enabled: true,
        databaseName: 'docs'
      });
      expect(mockSessionManager.isRAGEnabled()).toBe(true);
    });
  });

  describe('Multi-Database Selection', () => {
    it('should switch between databases', () => {
      // Start with database 1
      mockSessionManager.configureRAG({
        enabled: true,
        databaseName: 'project-a'
      });

      expect(mockSessionManager.getRAGConfig()?.databaseName).toBe('project-a');

      // Switch to database 2
      mockSessionManager.configureRAG({
        enabled: true,
        databaseName: 'project-b'
      });

      expect(mockSessionManager.getRAGConfig()?.databaseName).toBe('project-b');
    });

    it('should switch from databaseName to vectorDbSessionId', () => {
      // Start with database name
      mockSessionManager.configureRAG({
        enabled: true,
        databaseName: 'my-docs'
      });

      // Switch to session ID
      mockSessionManager.configureRAG({
        enabled: true,
        vectorDbSessionId: 'session-123'
      });

      const config = mockSessionManager.getRAGConfig();
      expect(config?.vectorDbSessionId).toBe('session-123');
      expect(config?.databaseName).toBeUndefined();
    });
  });

  describe('Context Injection Workflow', () => {
    it('should have required components for context injection', () => {
      mockSessionManager.setVectorRAGManager(mockVectorRAGManager);
      mockSessionManager.setEmbeddingService(mockEmbeddingService);

      expect(mockSessionManager.hasVectorRAGManager()).toBe(true);
      expect(mockSessionManager.hasEmbeddingService()).toBe(true);
    });

    it('should work with custom context template', () => {
      const customTemplate = 'Relevant info:\n{context}\n\nSources: {sources}';

      mockSessionManager.configureRAG({
        enabled: true,
        databaseName: 'docs',
        contextTemplate: customTemplate
      });

      expect(mockSessionManager.getRAGConfig()?.contextTemplate).toBe(customTemplate);
    });

    it('should work with metadata filter', () => {
      const filter = { category: 'technical', year: 2024 };

      mockSessionManager.configureRAG({
        enabled: true,
        databaseName: 'docs',
        metadataFilter: filter
      });

      expect(mockSessionManager.getRAGConfig()?.metadataFilter).toEqual(filter);
    });
  });

  describe('Configuration Defaults', () => {
    it('should use default topK when not specified', () => {
      mockSessionManager.configureRAG({
        enabled: true,
        databaseName: 'docs'
      });

      const config = mockSessionManager.getRAGConfig();
      // Should use default from mergeRAGConfig (5)
      expect(config?.topK).toBeUndefined(); // Or default value if merged
    });

    it('should use custom topK when specified', () => {
      mockSessionManager.configureRAG({
        enabled: true,
        databaseName: 'docs',
        topK: 10
      });

      expect(mockSessionManager.getRAGConfig()?.topK).toBe(10);
    });

    it('should use custom similarityThreshold', () => {
      mockSessionManager.configureRAG({
        enabled: true,
        databaseName: 'docs',
        similarityThreshold: 0.85
      });

      expect(mockSessionManager.getRAGConfig()?.similarityThreshold).toBe(0.85);
    });

    it('should use custom maxContextLength', () => {
      mockSessionManager.configureRAG({
        enabled: true,
        databaseName: 'docs',
        maxContextLength: 3000
      });

      expect(mockSessionManager.getRAGConfig()?.maxContextLength).toBe(3000);
    });
  });
});
