/**
 * E2E Test Helpers
 * Reusable utilities for end-to-end RAG testing
 * Max 250 lines
 */

import 'fake-indexeddb/auto';
import { VectorRAGManager } from '../../src/managers/VectorRAGManager.js';
import { DocumentManager } from '../../src/managers/DocumentManager.js';
import { PermissionManager } from '../../src/permissions/PermissionManager.js';
import { PermissionService } from '../../src/database/PermissionService.js';
import { AuditLogger } from '../../src/permissions/audit-logger.js';
import { DatabaseMetadataService } from '../../src/database/DatabaseMetadataService.js';
import type { RAGConfig } from '../../src/rag/types.js';
import type { SearchResultWithSource } from '../../src/rag/types.js';

/**
 * Test user configuration
 */
export interface TestUser {
  address: string;
  seedPhrase: string;
  vectorRAGManager?: VectorRAGManager;
  documentManager?: DocumentManager;
  permissionManager?: PermissionManager;
}

/**
 * Default test configuration
 */
export const DEFAULT_TEST_CONFIG: RAGConfig = {
  s5Portal: process.env.S5_PORTAL || 'http://localhost:5522',
  encryptAtRest: true,
  chunkSize: 10000,
  cacheSizeMb: 150
};

/**
 * Create a test user with initialized managers
 */
export async function createTestUser(
  address: string,
  seedPhrase: string,
  config: RAGConfig = DEFAULT_TEST_CONFIG
): Promise<TestUser> {
  // Shared metadata service for all managers
  const metadataService = new DatabaseMetadataService();

  // Create permission manager with required dependencies
  const permissionService = new PermissionService();
  const auditLogger = new AuditLogger();
  const permissionManager = new PermissionManager(permissionService, auditLogger);

  // Create VectorRAGManager
  const vectorRAGManager = new VectorRAGManager({
    userAddress: address,
    seedPhrase,
    config,
    metadataService,
    permissionManager
  });

  // Create DocumentManager
  const documentManager = new DocumentManager({
    userAddress: address,
    seedPhrase,
    s5Portal: config.s5Portal,
    vectorRAGManager,
    metadataService
  });

  return {
    address,
    seedPhrase,
    vectorRAGManager,
    documentManager,
    permissionManager
  };
}

/**
 * Generate deterministic test vector
 * @param seed - Seed for deterministic generation
 * @param dimensions - Vector dimensions (default: 384)
 */
export function createTestVector(seed: number, dimensions: number = 384): number[] {
  const vector: number[] = [];
  for (let i = 0; i < dimensions; i++) {
    vector.push(Math.sin(seed + i * 0.1) * 0.5 + 0.5);
  }
  return vector;
}

/**
 * Create sample document content
 */
export function createSampleDocument(
  title: string,
  topic: string,
  wordCount: number = 500
): string {
  const topics: Record<string, string[]> = {
    tech: [
      'artificial intelligence', 'machine learning', 'neural networks',
      'deep learning', 'algorithms', 'data structures', 'software engineering'
    ],
    science: [
      'quantum physics', 'molecular biology', 'chemistry',
      'research methodology', 'experimental design', 'hypothesis testing'
    ],
    business: [
      'market analysis', 'financial reports', 'business strategy',
      'revenue growth', 'customer acquisition', 'competitive advantage'
    ]
  };

  const keywords = topics[topic] || ['general', 'document', 'content'];
  const sentences: string[] = [];

  // Title
  sentences.push(`# ${title}\n\n`);

  // Generate content
  for (let i = 0; i < wordCount / 20; i++) {
    const keyword = keywords[i % keywords.length];
    sentences.push(
      `This document discusses ${keyword} in detail. ` +
      `The research shows that ${keyword} plays a crucial role. ` +
      `Further analysis of ${keyword} reveals important insights.\n\n`
    );
  }

  return sentences.join('');
}

/**
 * Cleanup all sessions for a user
 */
export async function cleanupTestUser(user: TestUser): Promise<void> {
  if (user.vectorRAGManager) {
    await user.vectorRAGManager.destroyAllSessions();
  }
}

/**
 * Create multiple test databases with sample data
 */
export async function setupTestDatabases(
  user: TestUser,
  configs: Array<{ name: string; vectorCount: number; topic: string }>
): Promise<string[]> {
  const sessionIds: string[] = [];

  for (const { name, vectorCount, topic } of configs) {
    // Create session
    const sessionId = await user.vectorRAGManager!.createSession(name);
    sessionIds.push(sessionId);

    // Add vectors with metadata
    for (let i = 0; i < vectorCount; i++) {
      const seed = name.charCodeAt(0) + i * 10;
      await user.vectorRAGManager!.addVector(
        name,
        `${name}-vec-${i}`,
        createTestVector(seed),
        {
          content: `Document ${i} about ${topic}`,
          category: topic,
          index: i,
          source: name
        }
      );
    }
  }

  return sessionIds;
}

/**
 * Assert search results contain expected properties
 */
export function assertSearchResult(
  result: SearchResultWithSource,
  expectations: {
    minScore?: number;
    expectedSources?: string[];
    requiredMetadataKeys?: string[];
  }
): void {
  // Check structure
  if (!result.id) throw new Error('Result missing id');
  // Note: vector field is optional - not all search results include the full vector
  if (typeof result.score !== 'number') throw new Error('Result missing score');
  if (!result.metadata) throw new Error('Result missing metadata');
  if (!result.sourceDatabaseName) throw new Error('Result missing sourceDatabaseName');

  // Check score threshold
  if (expectations.minScore !== undefined && result.score < expectations.minScore) {
    throw new Error(`Score ${result.score} below minimum ${expectations.minScore}`);
  }

  // Check source attribution
  if (expectations.expectedSources &&
      !expectations.expectedSources.includes(result.sourceDatabaseName)) {
    throw new Error(
      `Source ${result.sourceDatabaseName} not in expected sources: ${expectations.expectedSources}`
    );
  }

  // Check metadata keys
  if (expectations.requiredMetadataKeys) {
    for (const key of expectations.requiredMetadataKeys) {
      if (!(key in result.metadata)) {
        throw new Error(`Result metadata missing required key: ${key}`);
      }
    }
  }
}

/**
 * Assert search results are sorted by score (descending)
 */
export function assertSortedByScore(results: SearchResultWithSource[]): void {
  for (let i = 0; i < results.length - 1; i++) {
    if (results[i].score < results[i + 1].score) {
      throw new Error(
        `Results not sorted: ${results[i].score} < ${results[i + 1].score} at index ${i}`
      );
    }
  }
}

/**
 * Wait for async condition with timeout
 */
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number = 5000,
  checkIntervalMs: number = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
  }

  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

/**
 * Generate test data for document upload tests
 */
export interface SampleDocumentSet {
  name: string;
  content: string;
  metadata: Record<string, any>;
}

export function generateDocumentSet(count: number, topic: string): SampleDocumentSet[] {
  const documents: SampleDocumentSet[] = [];

  for (let i = 0; i < count; i++) {
    documents.push({
      name: `${topic}-doc-${i}.md`,
      content: createSampleDocument(`${topic} Document ${i}`, topic, 300),
      metadata: {
        topic,
        index: i,
        createdAt: Date.now(),
        type: 'markdown'
      }
    });
  }

  return documents;
}
