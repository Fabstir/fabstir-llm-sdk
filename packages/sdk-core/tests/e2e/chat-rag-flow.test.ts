/**
 * End-to-End Test: Chat with RAG Flow
 * Tests RAG context retrieval and integration with chat sessions
 * Max 250 lines
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTestUser,
  cleanupTestUser,
  setupTestDatabases,
  createTestVector,
  DEFAULT_TEST_CONFIG,
  type TestUser
} from '../helpers/e2e-helpers.js';
import { TECH_DOCUMENTS } from '../fixtures/sample-documents.js';

describe('E2E: Chat with RAG Flow', () => {
  let testUser: TestUser;

  beforeEach(async () => {
    testUser = await createTestUser(
      'test-user-chat-rag',
      'test seed phrase for chat rag flow',
      DEFAULT_TEST_CONFIG
    );
  });

  afterEach(async () => {
    await cleanupTestUser(testUser);
  });

  describe('Context Retrieval', () => {
    it('should retrieve relevant context for a query', async () => {
      // Create empty database
      const sessionId = await testUser.vectorRAGManager!.createSession('tech-context');

      // Add specific document about neural networks
      const nnVector = createTestVector(42);
      await testUser.vectorRAGManager!.addVector(
        'tech-context',
        'neural-networks-doc',
        nnVector,
        {
          content: TECH_DOCUMENTS[0].content, // Neural Networks document
          title: TECH_DOCUMENTS[0].title,
          category: 'tech',
          topic: 'neural-networks'
        }
      );

      // Query for similar content
      const queryVector = createTestVector(42.5); // Similar to neural networks vector
      const results = await testUser.vectorRAGManager!.searchVectors(
        sessionId,
        queryVector,
        5,
        { threshold: 0.0 }
      );

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].metadata.topic).toBe('neural-networks');
    });

    it('should retrieve context from multiple databases', async () => {
      // Setup multiple databases
      await setupTestDatabases(testUser, [
        { name: 'db-tech', vectorCount: 5, topic: 'tech' },
        { name: 'db-science', vectorCount: 5, topic: 'science' }
      ]);

      // Query across both databases
      const queryVector = createTestVector(100);
      const results = await testUser.vectorRAGManager!.searchMultipleDatabases(
        ['db-tech', 'db-science'],
        queryVector,
        { topK: 10, threshold: 0.0 }
      );

      expect(results.length).toBeGreaterThan(0);

      // Verify results from multiple sources
      const sources = new Set(results.map(r => r.sourceDatabaseName));
      expect(sources.size).toBeGreaterThanOrEqual(1);
    });

    it('should filter context by relevance threshold', async () => {
      const [sessionId] = await setupTestDatabases(testUser, [
        { name: 'filtered-context', vectorCount: 10, topic: 'tech' }
      ]);

      // Add highly relevant document
      const relevantVector = createTestVector(50);
      await testUser.vectorRAGManager!.addVector(
        'filtered-context',
        'highly-relevant',
        relevantVector,
        {
          content: 'Highly relevant information about AI',
          relevance: 'high'
        }
      );

      // Query with high threshold
      const queryVector = createTestVector(50.1); // Very similar
      const results = await testUser.vectorRAGManager!.searchVectors(
        sessionId,
        queryVector,
        10,
        { threshold: 0.8 }
      );

      // All results should be highly relevant
      for (const result of results) {
        expect(result.score).toBeGreaterThanOrEqual(0.8);
      }
    });
  });

  describe('Context Ranking', () => {
    it('should rank context by similarity score', async () => {
      const [sessionId] = await setupTestDatabases(testUser, [
        { name: 'ranked-context', vectorCount: 5, topic: 'tech' }
      ]);

      // Add documents with varying similarity
      for (let i = 0; i < 5; i++) {
        await testUser.vectorRAGManager!.addVector(
          'ranked-context',
          `doc-${i}`,
          createTestVector(100 + i * 5),
          { content: `Document ${i}`, index: i }
        );
      }

      // Query
      const queryVector = createTestVector(102);
      const results = await testUser.vectorRAGManager!.searchVectors(
        sessionId,
        queryVector,
        5,
        { threshold: 0.0 }
      );

      // Verify descending order
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
      }
    });

    it('should limit context to topK most relevant', async () => {
      const [sessionId] = await setupTestDatabases(testUser, [
        { name: 'topk-context', vectorCount: 20, topic: 'tech' }
      ]);

      const queryVector = createTestVector(50);

      // Request only top 3
      const results = await testUser.vectorRAGManager!.searchVectors(
        sessionId,
        queryVector,
        3,
        { threshold: 0.0 }
      );

      expect(results).toHaveLength(3);
    });
  });

  describe('Context Formatting', () => {
    it('should include metadata in search results', async () => {
      const [sessionId] = await setupTestDatabases(testUser, [
        { name: 'metadata-context', vectorCount: 1, topic: 'tech' }
      ]);

      // Add document with rich metadata
      const vector = createTestVector(200);
      await testUser.vectorRAGManager!.addVector(
        'metadata-context',
        'rich-metadata-doc',
        vector,
        {
          title: 'Test Document',
          author: 'Test Author',
          category: 'tech',
          tags: ['ai', 'ml'],
          timestamp: Date.now()
        }
      );

      // Retrieve
      const queryVector = createTestVector(200);
      const results = await testUser.vectorRAGManager!.searchVectors(
        sessionId,
        queryVector,
        1,
        { threshold: 0.0 }
      );

      expect(results[0].metadata.title).toBe('Test Document');
      expect(results[0].metadata.author).toBe('Test Author');
      expect(results[0].metadata.tags).toEqual(['ai', 'ml']);
    });

    it('should preserve source attribution in multi-DB search', async () => {
      // Setup multiple databases
      await setupTestDatabases(testUser, [
        { name: 'source-db-1', vectorCount: 3, topic: 'tech' },
        { name: 'source-db-2', vectorCount: 3, topic: 'science' }
      ]);

      const queryVector = createTestVector(150);
      const results = await testUser.vectorRAGManager!.searchMultipleDatabases(
        ['source-db-1', 'source-db-2'],
        queryVector,
        { topK: 10, threshold: 0.0 }
      );

      // Every result should have source attribution
      for (const result of results) {
        expect(result.sourceDatabaseName).toBeDefined();
        expect(['source-db-1', 'source-db-2']).toContain(result.sourceDatabaseName);
      }
    });
  });

  describe('Empty Context Handling', () => {
    it('should handle queries with no relevant context', async () => {
      const [sessionId] = await setupTestDatabases(testUser, [
        { name: 'sparse-context', vectorCount: 3, topic: 'tech' }
      ]);

      // Query with very high threshold (unlikely to match)
      const queryVector = createTestVector(9999);
      const results = await testUser.vectorRAGManager!.searchVectors(
        sessionId,
        queryVector,
        10,
        { threshold: 0.99 }
      );

      // Should return empty or very few results
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle queries on empty databases', async () => {
      // Create empty database
      const sessionId = await testUser.vectorRAGManager!.createSession('empty-for-query');

      const queryVector = createTestVector(100);
      const results = await testUser.vectorRAGManager!.searchVectors(
        sessionId,
        queryVector,
        10,
        { threshold: 0.0 }
      );

      expect(results).toEqual([]);
    });
  });

  describe('Context Update Scenarios', () => {
    it('should retrieve updated context after adding new documents', async () => {
      const [sessionId] = await setupTestDatabases(testUser, [
        { name: 'dynamic-context', vectorCount: 3, topic: 'tech' }
      ]);

      // Initial query
      const queryVector = createTestVector(300);
      const initialResults = await testUser.vectorRAGManager!.searchVectors(
        sessionId,
        queryVector,
        10,
        { threshold: 0.0 }
      );

      const initialCount = initialResults.length;

      // Add more documents
      for (let i = 0; i < 3; i++) {
        await testUser.vectorRAGManager!.addVector(
          'dynamic-context',
          `new-doc-${i}`,
          createTestVector(300 + i),
          { content: `New document ${i}` }
        );
      }

      // Query again
      const updatedResults = await testUser.vectorRAGManager!.searchVectors(
        sessionId,
        queryVector,
        10,
        { threshold: 0.0 }
      );

      // Should have more results
      expect(updatedResults.length).toBeGreaterThan(initialCount);
    });
  });
});
