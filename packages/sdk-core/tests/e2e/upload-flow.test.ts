/**
 * End-to-End Test: Document Upload Flow
 * Tests complete workflow from document upload to vector storage
 * Max 250 lines
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTestUser,
  cleanupTestUser,
  createTestVector,
  DEFAULT_TEST_CONFIG,
  type TestUser
} from '../helpers/e2e-helpers.js';
import {
  TECH_DOCUMENTS,
  SCIENCE_DOCUMENTS,
  BUSINESS_DOCUMENTS,
  getAllSampleDocuments
} from '../fixtures/sample-documents.js';

describe('E2E: Document Upload Flow', () => {
  let testUser: TestUser;
  const testDbName = 'e2e-upload-test-db';

  beforeEach(async () => {
    // Create test user with all managers
    testUser = await createTestUser(
      'test-user-upload',
      'test seed phrase for upload flow',
      DEFAULT_TEST_CONFIG
    );
  });

  afterEach(async () => {
    // Clean up all sessions
    await cleanupTestUser(testUser);
  });

  describe('Single Document Upload', () => {
    it('should upload and embed a single document', async () => {
      // Create vector database session
      const sessionId = await testUser.vectorRAGManager!.createSession(testDbName);
      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');

      // Get sample document
      const doc = TECH_DOCUMENTS[0]; // Neural Networks document
      const content = doc.content;

      // For E2E test, we simulate embedding by chunking text and creating vectors
      // In real app, DocumentManager would call EmbeddingService
      const chunkSize = 500;
      const chunks = [];
      for (let i = 0; i < content.length; i += chunkSize) {
        chunks.push(content.substring(i, i + chunkSize));
      }

      expect(chunks.length).toBeGreaterThan(0);

      // Add each chunk as a vector
      for (let i = 0; i < chunks.length; i++) {
        const vector = createTestVector(i + 100); // Unique seed per chunk
        await testUser.vectorRAGManager!.addVector(
          testDbName,
          `${doc.title}-chunk-${i}`,
          vector,
          {
            documentTitle: doc.title,
            chunkIndex: i,
            chunkText: chunks[i],
            ...doc.metadata
          }
        );
      }

      // Verify vectors were added
      const stats = testUser.vectorRAGManager!.getDatabaseStats(testDbName);
      expect(stats).not.toBeNull();
      expect(stats!.vectorCount).toBe(chunks.length);
      expect(stats!.databaseName).toBe(testDbName);
    });

    it('should handle large documents with multiple chunks', async () => {
      const sessionId = await testUser.vectorRAGManager!.createSession(testDbName);

      // Create a large document (simulate 5000 word document)
      const largeContent = Array(100)
        .fill('This is a test paragraph with multiple sentences. ')
        .join('');

      const chunkSize = 200; // Characters
      let chunkCount = 0;

      for (let i = 0; i < largeContent.length; i += chunkSize) {
        const chunk = largeContent.substring(i, i + chunkSize);
        const vector = createTestVector(i);

        await testUser.vectorRAGManager!.addVector(
          testDbName,
          `large-doc-chunk-${chunkCount}`,
          vector,
          {
            documentTitle: 'Large Test Document',
            chunkIndex: chunkCount,
            chunkText: chunk
          }
        );

        chunkCount++;
      }

      expect(chunkCount).toBeGreaterThan(10); // Should have many chunks

      // Verify all chunks stored
      const stats = testUser.vectorRAGManager!.getDatabaseStats(testDbName);
      expect(stats).not.toBeNull();
      expect(stats!.vectorCount).toBe(chunkCount);
    });
  });

  describe('Batch Document Upload', () => {
    it('should upload multiple documents in batch', async () => {
      const sessionId = await testUser.vectorRAGManager!.createSession(testDbName);

      // Upload all tech documents
      let totalChunks = 0;

      for (const doc of TECH_DOCUMENTS) {
        const chunks = doc.content.split('\n\n'); // Split by paragraph

        for (let i = 0; i < chunks.length; i++) {
          if (chunks[i].trim().length === 0) continue;

          const vector = createTestVector(totalChunks);
          await testUser.vectorRAGManager!.addVector(
            testDbName,
            `${doc.title}-chunk-${i}`,
            vector,
            {
              documentTitle: doc.title,
              chunkIndex: i,
              chunkText: chunks[i],
              ...doc.metadata
            }
          );

          totalChunks++;
        }
      }

      expect(totalChunks).toBeGreaterThan(TECH_DOCUMENTS.length); // More chunks than documents

      // Verify storage
      const stats = testUser.vectorRAGManager!.getDatabaseStats(testDbName);
      expect(stats).not.toBeNull();
      expect(stats!.vectorCount).toBe(totalChunks);
    });

    it('should organize documents by category', async () => {
      const sessionId = await testUser.vectorRAGManager!.createSession(testDbName);

      // Upload documents from different categories
      const allDocs = getAllSampleDocuments();
      const docsByCategory: Record<string, number> = {
        tech: 0,
        science: 0,
        business: 0
      };

      for (const doc of allDocs) {
        const category = doc.metadata.category;
        const vector = createTestVector(docsByCategory[category] || 0);

        await testUser.vectorRAGManager!.addVector(
          testDbName,
          `${doc.title}-main`,
          vector,
          {
            documentTitle: doc.title,
            ...doc.metadata
          }
        );

        docsByCategory[category] = (docsByCategory[category] || 0) + 1;
      }

      // Verify all categories have documents
      expect(docsByCategory.tech).toBeGreaterThan(0);
      expect(docsByCategory.science).toBeGreaterThan(0);
      expect(docsByCategory.business).toBeGreaterThan(0);

      // Verify total count
      const stats = testUser.vectorRAGManager!.getDatabaseStats(testDbName);
      expect(stats).not.toBeNull();
      const totalUploaded = docsByCategory.tech + docsByCategory.science + docsByCategory.business;
      expect(stats!.vectorCount).toBe(totalUploaded);
    });
  });

  describe('Metadata Tracking', () => {
    it('should preserve document metadata after upload', async () => {
      const sessionId = await testUser.vectorRAGManager!.createSession(testDbName);
      const doc = SCIENCE_DOCUMENTS[0]; // Quantum Computing

      // Upload document with metadata
      const vector = createTestVector(999);
      await testUser.vectorRAGManager!.addVector(
        testDbName,
        'quantum-doc',
        vector,
        {
          documentTitle: doc.title,
          ...doc.metadata
        }
      );

      // Search to retrieve the document
      const queryVector = createTestVector(999); // Same as uploaded
      const results = await testUser.vectorRAGManager!.searchVectors(
        sessionId,
        queryVector,
        1,
        { threshold: 0.0 }
      );

      expect(results).toHaveLength(1);
      expect(results[0].metadata.documentTitle).toBe(doc.title);
      expect(results[0].metadata.topic).toBe(doc.metadata.topic);
      expect(results[0].metadata.category).toBe(doc.metadata.category);
      expect(results[0].metadata.tags).toEqual(doc.metadata.tags);
    });

    it('should track upload timestamps', async () => {
      const sessionId = await testUser.vectorRAGManager!.createSession(testDbName);
      const now = Date.now();

      const vector = createTestVector(123);
      await testUser.vectorRAGManager!.addVector(
        testDbName,
        'timestamped-doc',
        vector,
        {
          documentTitle: 'Test Document',
          uploadedAt: now
        }
      );

      // Retrieve and verify timestamp
      const queryVector = createTestVector(123);
      const results = await testUser.vectorRAGManager!.searchVectors(
        sessionId,
        queryVector,
        1,
        { threshold: 0.0 }
      );

      expect(results[0].metadata.uploadedAt).toBe(now);
    });
  });

  describe('Error Handling', () => {
    it('should reject empty database name', async () => {
      await expect(
        testUser.vectorRAGManager!.createSession('')
      ).rejects.toThrow('Database name cannot be empty');
    });

    it('should reject duplicate document IDs', async () => {
      const sessionId = await testUser.vectorRAGManager!.createSession(testDbName);

      const vector1 = createTestVector(1);
      await testUser.vectorRAGManager!.addVector(
        testDbName,
        'duplicate-id',
        vector1,
        { content: 'First version' }
      );

      // Add again with same ID (should error - Fabstir Vector DB doesn't allow duplicates)
      const vector2 = createTestVector(2);
      await expect(
        testUser.vectorRAGManager!.addVector(
          testDbName,
          'duplicate-id',
          vector2,
          { content: 'Second version' }
        )
      ).rejects.toThrow(/already exists/);

      // Verify still only one vector
      const stats = testUser.vectorRAGManager!.getDatabaseStats(testDbName);
      expect(stats).not.toBeNull();
      expect(stats!.vectorCount).toBe(1);
    });
  });
});
