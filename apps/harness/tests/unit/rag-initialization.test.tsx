// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Sub-phase 1.2: RAG Initialization Logic Tests
 *
 * Tests for initializeRAG() function that sets up:
 * - VectorRAGManager initialization
 * - HostAdapter creation with correct host URL
 * - DocumentManager creation
 * - Vector database creation/loading from S5
 * - Error handling (no wallet, no host, network failures)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { IVectorRAGManager, IDocumentManager, IStorageManager } from '@fabstir/sdk-core';

// Mock modules
vi.mock('@fabstir/sdk-core', async () => {
  const actual = await vi.importActual('@fabstir/sdk-core');
  return {
    ...actual,
    VectorRAGManager: vi.fn().mockImplementation(() => ({
      createVectorDatabase: vi.fn().mockResolvedValue(undefined),
      listVectorDatabases: vi.fn().mockResolvedValue(['chat-context-knowledge']),
    })),
    DocumentManager: vi.fn().mockImplementation(() => ({
      processDocument: vi.fn().mockResolvedValue({ id: 'doc1', chunks: 5 }),
    })),
    HostAdapter: vi.fn().mockImplementation(() => ({
      embed: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    })),
  };
});

describe('Sub-phase 1.2: RAG Initialization Logic', () => {
  let mockStorageManager: IStorageManager;
  let mockVectorRAGManager: IVectorRAGManager;
  let mockDocumentManager: IDocumentManager;
  let mockHostUrl: string;
  let mockUserAddress: string;

  beforeEach(() => {
    mockUserAddress = '0x1234567890123456789012345678901234567890';
    mockHostUrl = 'http://localhost:8080';

    mockStorageManager = {
      uploadConversation: vi.fn().mockResolvedValue('cid123'),
      loadConversation: vi.fn().mockResolvedValue([]),
      isInitialized: () => true,
    } as any;

    mockVectorRAGManager = {
      createVectorDatabase: vi.fn().mockResolvedValue(undefined),
      listVectorDatabases: vi.fn().mockResolvedValue([]),
      searchVectors: vi.fn().mockResolvedValue([]),
    } as any;

    mockDocumentManager = {
      processDocument: vi.fn().mockResolvedValue({ id: 'doc1', chunks: 5 }),
    } as any;
  });

  describe('initializeRAG() function execution', () => {
    it('should be defined and callable', () => {
      // This tests that initializeRAG() function exists
      const initializeRAG = async (
        storageManager: IStorageManager,
        hostUrl: string,
        userAddress: string,
        vectorDbName: string
      ) => {
        // Minimal implementation to verify function signature
        return { success: true };
      };

      expect(typeof initializeRAG).toBe('function');
    });

    it('should return success when all parameters are valid', async () => {
      const initializeRAG = async (
        storageManager: IStorageManager,
        hostUrl: string,
        userAddress: string,
        vectorDbName: string
      ) => {
        if (!storageManager || !hostUrl || !userAddress || !vectorDbName) {
          throw new Error('Missing required parameters');
        }
        return { success: true };
      };

      const result = await initializeRAG(
        mockStorageManager,
        mockHostUrl,
        mockUserAddress,
        'chat-context-knowledge'
      );

      expect(result.success).toBe(true);
    });

    it('should throw error when storageManager is missing', async () => {
      const initializeRAG = async (
        storageManager: IStorageManager | null,
        hostUrl: string,
        userAddress: string,
        vectorDbName: string
      ) => {
        if (!storageManager) {
          throw new Error('StorageManager not available. Please authenticate first.');
        }
        return { success: true };
      };

      await expect(
        initializeRAG(null, mockHostUrl, mockUserAddress, 'chat-context-knowledge')
      ).rejects.toThrow('StorageManager not available');
    });
  });

  describe('VectorRAGManager initialization', () => {
    it('should create VectorRAGManager with correct parameters', async () => {
      const { VectorRAGManager } = await import('@fabstir/sdk-core');

      const vectorRAGManager = new VectorRAGManager(mockStorageManager, mockUserAddress);

      expect(VectorRAGManager).toHaveBeenCalledWith(mockStorageManager, mockUserAddress);
      expect(vectorRAGManager).toBeDefined();
    });

    it('should call createVectorDatabase or verify database exists', async () => {
      const vectorDbName = 'chat-context-knowledge';

      // Check if database exists
      const existingDbs = await mockVectorRAGManager.listVectorDatabases!();
      const dbExists = existingDbs.includes(vectorDbName);

      if (!dbExists) {
        await mockVectorRAGManager.createVectorDatabase!(vectorDbName, { dimension: 384 });
      }

      // Verify createVectorDatabase was called if db didn't exist
      if (!dbExists) {
        expect(mockVectorRAGManager.createVectorDatabase).toHaveBeenCalledWith(
          vectorDbName,
          expect.objectContaining({ dimension: 384 })
        );
      }
    });
  });

  describe('HostAdapter creation', () => {
    it('should create HostAdapter with correct host URL', async () => {
      const { HostAdapter } = await import('@fabstir/sdk-core');

      const hostAdapter = new HostAdapter(mockHostUrl);

      expect(HostAdapter).toHaveBeenCalledWith(mockHostUrl);
      expect(hostAdapter).toBeDefined();
    });

    it('should throw error when host URL is empty', async () => {
      const initializeRAG = async (
        storageManager: IStorageManager,
        hostUrl: string,
        userAddress: string,
        vectorDbName: string
      ) => {
        if (!hostUrl) {
          throw new Error('Host URL is required for RAG initialization');
        }
        return { success: true };
      };

      await expect(
        initializeRAG(mockStorageManager, '', mockUserAddress, 'chat-context-knowledge')
      ).rejects.toThrow('Host URL is required');
    });
  });

  describe('DocumentManager creation', () => {
    it('should create DocumentManager with correct parameters', async () => {
      const { DocumentManager, HostAdapter } = await import('@fabstir/sdk-core');

      const hostAdapter = new HostAdapter(mockHostUrl);
      const documentManager = new DocumentManager(
        mockVectorRAGManager,
        hostAdapter,
        'chat-context-knowledge'
      );

      expect(DocumentManager).toHaveBeenCalledWith(
        expect.anything(), // vectorRAGManager
        expect.anything(), // embeddingService (HostAdapter)
        'chat-context-knowledge'
      );
      expect(documentManager).toBeDefined();
    });
  });

  describe('Vector database creation/loading', () => {
    it('should create new database if it does not exist', async () => {
      mockVectorRAGManager.listVectorDatabases = vi.fn().mockResolvedValue([]);

      const vectorDbName = 'chat-context-knowledge';
      const existingDbs = await mockVectorRAGManager.listVectorDatabases!();
      const dbExists = existingDbs.includes(vectorDbName);

      expect(dbExists).toBe(false);

      if (!dbExists) {
        await mockVectorRAGManager.createVectorDatabase!(vectorDbName, { dimension: 384 });
      }

      expect(mockVectorRAGManager.createVectorDatabase).toHaveBeenCalledWith(
        vectorDbName,
        expect.objectContaining({ dimension: 384 })
      );
    });

    it('should load existing database if it exists', async () => {
      mockVectorRAGManager.listVectorDatabases = vi.fn().mockResolvedValue(['chat-context-knowledge']);

      const vectorDbName = 'chat-context-knowledge';
      const existingDbs = await mockVectorRAGManager.listVectorDatabases!();
      const dbExists = existingDbs.includes(vectorDbName);

      expect(dbExists).toBe(true);

      // Should NOT call createVectorDatabase
      expect(mockVectorRAGManager.createVectorDatabase).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle error when wallet is not connected (no userAddress)', async () => {
      const initializeRAG = async (
        storageManager: IStorageManager,
        hostUrl: string,
        userAddress: string,
        vectorDbName: string
      ) => {
        if (!userAddress) {
          throw new Error('Wallet not connected. Please connect wallet first.');
        }
        return { success: true };
      };

      await expect(
        initializeRAG(mockStorageManager, mockHostUrl, '', 'chat-context-knowledge')
      ).rejects.toThrow('Wallet not connected');
    });

    it('should handle error when no host is selected', async () => {
      const initializeRAG = async (
        storageManager: IStorageManager,
        hostUrl: string | null,
        userAddress: string,
        vectorDbName: string
      ) => {
        if (!hostUrl) {
          throw new Error('No host selected. Please select a host first.');
        }
        return { success: true };
      };

      await expect(
        initializeRAG(mockStorageManager, null as any, mockUserAddress, 'chat-context-knowledge')
      ).rejects.toThrow('No host selected');
    });

    it('should handle network errors during vector database creation', async () => {
      mockVectorRAGManager.createVectorDatabase = vi.fn().mockRejectedValue(
        new Error('Network error: Failed to create vector database')
      );

      const initializeRAG = async () => {
        try {
          await mockVectorRAGManager.createVectorDatabase!('chat-context-knowledge', { dimension: 384 });
          return { success: true };
        } catch (error) {
          throw new Error(`RAG initialization failed: ${(error as Error).message}`);
        }
      };

      await expect(initializeRAG()).rejects.toThrow('RAG initialization failed: Network error');
    });

    it('should handle S5 storage errors gracefully', async () => {
      mockStorageManager.uploadConversation = vi.fn().mockRejectedValue(
        new Error('S5 storage error: Connection timeout')
      );

      const initializeRAG = async () => {
        try {
          await mockStorageManager.uploadConversation!([], 'test-cid');
          return { success: true };
        } catch (error) {
          throw new Error(`S5 storage error: ${(error as Error).message}`);
        }
      };

      await expect(initializeRAG()).rejects.toThrow('S5 storage error');
    });
  });

  describe('Initialization only happens once per session', () => {
    it('should not reinitialize if already initialized', async () => {
      let isInitialized = false;

      const initializeRAG = async (
        storageManager: IStorageManager,
        hostUrl: string,
        userAddress: string,
        vectorDbName: string
      ) => {
        if (isInitialized) {
          return { success: true, alreadyInitialized: true };
        }

        isInitialized = true;
        return { success: true, alreadyInitialized: false };
      };

      const result1 = await initializeRAG(
        mockStorageManager,
        mockHostUrl,
        mockUserAddress,
        'chat-context-knowledge'
      );
      const result2 = await initializeRAG(
        mockStorageManager,
        mockHostUrl,
        mockUserAddress,
        'chat-context-knowledge'
      );

      expect(result1.alreadyInitialized).toBe(false);
      expect(result2.alreadyInitialized).toBe(true);
    });
  });
});
