// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Unit tests for SDK exports verification
 * Tests that RAG classes are exported from main SDK index
 * Part of Phase 1, Sub-phase 1.1: Remove Separate RAG Export Path
 */

import { describe, it, expect } from 'vitest';

describe('SDK Exports - RAG Classes', () => {
  it('should export VectorRAGManager from main SDK', async () => {
    const sdk = await import('../../src/index');
    expect(sdk.VectorRAGManager).toBeDefined();
    expect(typeof sdk.VectorRAGManager).toBe('function'); // Constructor function
  });

  it('should export DocumentManager from main SDK', async () => {
    const sdk = await import('../../src/index');
    expect(sdk.DocumentManager).toBeDefined();
    expect(typeof sdk.DocumentManager).toBe('function'); // Constructor function
  });

  it('should export HostAdapter from main SDK', async () => {
    const sdk = await import('../../src/index');
    expect(sdk.HostAdapter).toBeDefined();
    expect(typeof sdk.HostAdapter).toBe('function'); // Constructor function
  });

  it('should export IVectorRAGManager interface type from main SDK', async () => {
    const sdk = await import('../../src/index');
    // TypeScript interfaces don't exist at runtime, but they should be in the types
    // We verify this by checking the package exports the VectorRAGManager constructor
    expect(sdk.VectorRAGManager).toBeDefined();
  });

  it('should export IDocumentManager interface type from main SDK', async () => {
    const sdk = await import('../../src/index');
    // TypeScript interfaces don't exist at runtime, but they should be in the types
    // We verify this by checking the package exports the DocumentManager constructor
    expect(sdk.DocumentManager).toBeDefined();
  });

  it('should export IEmbeddingService interface type from main SDK', async () => {
    const sdk = await import('../../src/index');
    // TypeScript interfaces don't exist at runtime
    // We verify by checking HostAdapter (which implements IEmbeddingService) is exported
    expect(sdk.HostAdapter).toBeDefined();
  });

  it('should NOT export RAG classes from /rag submodule (path should not exist)', async () => {
    // After cleanup, @fabstir/sdk-core/rag should not exist
    let errorThrown = false;
    try {
      await import('../../dist/rag/index.mjs');
    } catch (error) {
      errorThrown = true;
      expect(error).toBeDefined();
    }
    // We expect this import to fail after cleanup
    // Note: This test will initially fail because dist/rag/index.mjs exists
    // It will pass after we delete src/rag/ and rebuild
    expect(errorThrown).toBe(true);
  });

  it('should allow importing RAG classes directly from @fabstir/sdk-core', async () => {
    // This is the preferred import pattern after cleanup
    const { VectorRAGManager, DocumentManager, HostAdapter } = await import('../../src/index');

    expect(VectorRAGManager).toBeDefined();
    expect(DocumentManager).toBeDefined();
    expect(HostAdapter).toBeDefined();

    expect(typeof VectorRAGManager).toBe('function');
    expect(typeof DocumentManager).toBe('function');
    expect(typeof HostAdapter).toBe('function');
  });

  it('should verify all RAG exports are constructors (not empty objects)', async () => {
    const { VectorRAGManager, DocumentManager, HostAdapter } = await import('../../src/index');

    // These should be constructor functions, NOT empty objects {}
    // This was the bug with the separate /rag export path
    expect(VectorRAGManager).not.toEqual({});
    expect(DocumentManager).not.toEqual({});
    expect(HostAdapter).not.toEqual({});

    // Verify they have prototype properties (characteristic of constructors)
    expect(VectorRAGManager.prototype).toBeDefined();
    expect(DocumentManager.prototype).toBeDefined();
    expect(HostAdapter.prototype).toBeDefined();
  });

  it('should verify VectorRAGManager has expected methods', async () => {
    const { VectorRAGManager } = await import('../../src/index');

    // Check constructor has current methods (client-side native bindings)
    expect(VectorRAGManager.prototype.addVectors).toBeDefined();
    expect(VectorRAGManager.prototype.searchVectors).toBeDefined();
    expect(VectorRAGManager.prototype.deleteVectors).toBeDefined();

    // TODO Phase 3: After refactoring to use SessionManager WebSocket, verify:
    // - uploadVectors() method (delegates to SessionManager)
    // - search() method (delegates to SessionManager)
  });

  it('should verify DocumentManager has expected methods', async () => {
    const { DocumentManager } = await import('../../src/index');

    // Check constructor has expected methods on prototype
    expect(DocumentManager.prototype.processDocument).toBeDefined();
  });

  it('should verify HostAdapter has expected methods', async () => {
    const { HostAdapter } = await import('../../src/index');

    // Check constructor has current methods
    expect(HostAdapter.prototype.embedText).toBeDefined();
    expect(HostAdapter.prototype.embedBatch).toBeDefined();

    // TODO Phase 3: Verify method names match final API after refactoring
  });
});
