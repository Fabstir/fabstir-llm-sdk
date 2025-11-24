'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSDK } from './use-sdk';

// TODO: Import proper types from @fabstir/sdk-core when available
// For now, define minimal types needed
export interface DatabaseMetadata {
  name: string;
  description?: string;
  vectorCount: number;  // Count of vectors from ready documents only
  storageSizeBytes: number;
  lastAccessed: number;
  createdAt?: number;
  dimensions?: number;
  pendingDocuments?: DocumentMetadata[];  // Documents awaiting embeddings
  readyDocuments?: DocumentMetadata[];     // Documents with embeddings complete
}

export interface Vector {
  id: string;
  vector: number[];  // Changed from "values" to match SDK (@fabstir/sdk-core)
  values?: number[]; // Keep for backward compatibility during transition
  metadata?: Record<string, any>;
}

export interface SearchResult {
  id: string;
  score: number;
  metadata?: Record<string, any>;
}

export interface FolderStats {
  totalFiles: number;
  totalSize: number;
}

export interface DocumentMetadata {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  folderPath: string;
  s5Cid: string;  // S5 storage CID for document content
  createdAt: number;
  embeddingStatus: 'pending' | 'processing' | 'ready' | 'failed';
  embeddingProgress?: number;  // 0-100 percentage
  embeddingError?: string;
  vectorCount?: number;
  lastEmbeddingAttempt?: number;
}

export interface EmbeddingProgress {
  sessionId: string;
  databaseName: string;
  documentId: string;
  fileName: string;
  totalChunks: number;
  processedChunks: number;
  percentage: number;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  error?: string;
}

/**
 * Hook for managing vector databases
 * Provides CRUD operations for databases, folders, and vectors
 */
export function useVectorDatabases() {
  const { managers, isInitialized } = useSDK();
  const [databases, setDatabases] = useState<DatabaseMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all databases
  const fetchDatabases = useCallback(async () => {
    if (!isInitialized || !managers) {
      setDatabases([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const vectorRAGManager = managers.vectorRAGManager;
      const dbs = await vectorRAGManager.listDatabases();

      // Transform SDK's DatabaseMetadata (with databaseName) to UI's format (with name)
      const transformedDbs = dbs.map(db => ({
        ...db,
        name: db.databaseName  // Map databaseName to name for UI compatibility
      }));

      setDatabases(transformedDbs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch databases');
      console.error('Failed to fetch databases:', err);
    } finally {
      setIsLoading(false);
    }
  }, [managers, isInitialized]);

  // Initial fetch
  useEffect(() => {
    fetchDatabases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized, managers]);

  // Create database
  const createDatabase = useCallback(
    async (name: string, options?: { dimensions?: number; folderStructure?: boolean; description?: string }) => {
      console.debug(`[use-vector-databases] 🚀 createDatabase() called with:`, { name, options });

      try {
        if (!managers) {
          console.error('[use-vector-databases] ❌ Error: SDK not initialized');
          throw new Error('SDK not initialized');
        }
        console.debug('[use-vector-databases] ✅ Managers available:', !!managers);

        const vectorRAGManager = managers.vectorRAGManager;
        console.debug('[use-vector-databases] ✅ VectorRAGManager obtained:', !!vectorRAGManager);

        // Create a RAG session which internally creates the vector database via S5VectorStore
        console.debug(`[use-vector-databases] 📝 About to call createSession("${name}")...`);
        const sessionId = await vectorRAGManager.createSession(name, {
          description: options?.description,
          dimensions: options?.dimensions
        });
        console.debug(`[use-vector-databases] ✅ Session/database created with ID: ${sessionId}`);

        console.debug('[use-vector-databases] 🔄 Refreshing database list...');
        await fetchDatabases(); // Refresh list
        console.debug('[use-vector-databases] ✅ Database list refreshed');
      } catch (error) {
        console.error('[use-vector-databases] ❌ Error in createDatabase:', error);
        console.error('[use-vector-databases] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        throw error; // Re-throw to show in UI
      }
    },
    [managers, fetchDatabases]
  );

  // Get database metadata
  const getDatabase = useCallback(
    async (name: string): Promise<DatabaseMetadata> => {
      console.debug(`[useVectorDatabases] getDatabase called, managers:`, !!managers);
      if (!managers) {
        console.error('[useVectorDatabases] ❌ getDatabase: managers is null!');
        throw new Error('SDK not initialized');
      }

      const vectorRAGManager = managers.vectorRAGManager;
      console.debug('[useVectorDatabases] ✅ About to call getDatabaseMetadata');
      return await vectorRAGManager.getDatabaseMetadata(name);
    },
    [managers]
  );

  // Update database metadata
  const updateDatabase = useCallback(
    async (name: string, updates: Partial<DatabaseMetadata>) => {
      if (!managers) throw new Error('SDK not initialized');

      const vectorRAGManager = managers.vectorRAGManager;
      await vectorRAGManager.updateDatabaseMetadata(name, updates);

      // Optimistic UI update - merge updates into local state immediately
      setDatabases(prevDbs =>
        prevDbs.map(db =>
          db.name === name
            ? {
                ...db,
                ...updates,
                lastAccessed: Date.now()
              }
            : db
        )
      );

      // NOTE: Caller must NOT rely on immediate S5 consistency.
      // S5 will sync in background. Don't call fetchDatabases() immediately.
      // See: /workspace/tests-ui5/S5_WRITE_READ_ANTI_PATTERN_AUDIT.md
    },
    [managers]
  );

  // Delete database
  const deleteDatabase = useCallback(
    async (name: string) => {
      if (!managers) throw new Error('SDK not initialized');

      const vectorRAGManager = managers.vectorRAGManager;
      const storageManager = managers.storageManager;
      const userAddress = managers.authManager.getUserAddress();
      const s5 = storageManager.s5Client;

      if (!s5) {
        throw new Error('S5 storage not initialized');
      }

      // Step 1: Delete from SDK's in-memory metadata service
      await vectorRAGManager.deleteDatabase(name);

      // Step 2: Delete from S5 storage
      // CRITICAL: SDK's deleteDatabase() only removes from in-memory cache, not S5!
      // We must manually delete the entire database folder from S5 storage.
      // Path format: home/vector-databases/{userAddress}/{databaseName}/
      const databasePath = `home/vector-databases/${userAddress}/${name}`;

      try {
        // Delete manifest.json
        const manifestPath = `${databasePath}/manifest.json`;
        await s5.fs.delete(manifestPath);
        console.debug(`[deleteDatabase] ✅ Deleted manifest: ${manifestPath}`);
      } catch (error) {
        console.warn(`[deleteDatabase] Failed to delete manifest (may not exist):`, error);
      }

      try {
        // Delete vectors (if they exist)
        const vectorsPath = `${databasePath}/vectors`;
        await s5.fs.delete(vectorsPath);
        console.debug(`[deleteDatabase] ✅ Deleted vectors: ${vectorsPath}`);
      } catch (error) {
        console.warn(`[deleteDatabase] Failed to delete vectors (may not exist):`, error);
      }

      try {
        // Delete documents folder (if it exists)
        const documentsPath = `${databasePath}/documents`;
        await s5.fs.delete(documentsPath);
        console.debug(`[deleteDatabase] ✅ Deleted documents: ${documentsPath}`);
      } catch (error) {
        console.warn(`[deleteDatabase] Failed to delete documents (may not exist):`, error);
      }

      // Step 3: Clear SDK's vectorStore cache
      // CRITICAL: Without this, the cache will still contain the database and it will
      // reappear on page refresh when initialize() loads from cache instead of S5.
      if (managers.vectorRAGManager?.vectorStore) {
        console.debug(`[deleteDatabase] Invalidating cache for: ${name}`);

        const vectorStore = managers.vectorRAGManager.vectorStore as any;
        if (vectorStore.manifestCache) {
          vectorStore.manifestCache.delete(name);
          console.debug(`[deleteDatabase] ✅ Cleared cache entry for: ${name}`);
        }
      }

      // Step 4: Optimistic UI update - remove from local state immediately
      setDatabases(prevDbs => prevDbs.filter(db => db.name !== name));

      console.debug(`[deleteDatabase] ✅ Successfully deleted database "${name}" from all locations`);

      // NOTE: Caller must NOT rely on immediate S5 consistency.
      // S5 will sync in background. Don't call fetchDatabases() immediately.
      // See: /workspace/tests-ui5/S5_WRITE_READ_ANTI_PATTERN_AUDIT.md
    },
    [managers]
  );

  // Folder operations
  const listFolders = useCallback(
    async (databaseName: string): Promise<string[]> => {
      if (!managers) throw new Error('SDK not initialized');

      const vectorRAGManager = managers.vectorRAGManager;
      return await vectorRAGManager.listFolders(databaseName);
    },
    [managers]
  );

  const getFolderStats = useCallback(
    async (databaseName: string, folderPath: string): Promise<FolderStats> => {
      if (!managers) throw new Error('SDK not initialized');

      const vectorRAGManager = managers.vectorRAGManager;
      return await vectorRAGManager.getFolderStatistics(databaseName, folderPath);
    },
    [managers]
  );

  const moveToFolder = useCallback(
    async (databaseName: string, vectorId: string, targetFolder: string) => {
      if (!managers) throw new Error('SDK not initialized');

      const vectorRAGManager = managers.vectorRAGManager;
      await vectorRAGManager.moveToFolder(databaseName, vectorId, targetFolder);
    },
    [managers]
  );

  const moveFolderContents = useCallback(
    async (databaseName: string, sourceFolder: string, targetFolder: string): Promise<number> => {
      if (!managers) throw new Error('SDK not initialized');

      const vectorRAGManager = managers.vectorRAGManager;
      return await vectorRAGManager.moveFolderContents(databaseName, sourceFolder, targetFolder);
    },
    [managers]
  );

  const createFolder = useCallback(
    async (databaseName: string, folderPath: string): Promise<void> => {
      if (!managers) throw new Error('SDK not initialized');

      const vectorRAGManager = managers.vectorRAGManager;
      await vectorRAGManager.createFolder(databaseName, folderPath);
    },
    [managers]
  );

  const renameFolder = useCallback(
    async (databaseName: string, oldPath: string, newPath: string): Promise<number> => {
      if (!managers) throw new Error('SDK not initialized');

      const vectorRAGManager = managers.vectorRAGManager;
      return await vectorRAGManager.renameFolder(databaseName, oldPath, newPath);
    },
    [managers]
  );

  const deleteFolder = useCallback(
    async (databaseName: string, folderPath: string): Promise<number> => {
      if (!managers) throw new Error('SDK not initialized');

      const vectorRAGManager = managers.vectorRAGManager;
      const deletedCount = await vectorRAGManager.deleteFolder(databaseName, folderPath);

      // Optimistic UI update - update stats immediately
      setDatabases(prevDbs =>
        prevDbs.map(db =>
          db.name === databaseName
            ? {
                ...db,
                vectorCount: Math.max(0, (db.vectorCount || 0) - deletedCount),
                lastAccessed: Date.now()
              }
            : db
        )
      );

      return deletedCount;
      // NOTE: Caller must handle folder tree updates separately.
      // S5 will sync in background. Don't call fetchDatabases() immediately.
      // See: /workspace/tests-ui5/S5_WRITE_READ_ANTI_PATTERN_AUDIT.md
    },
    [managers]
  );

  const getAllFoldersWithCounts = useCallback(
    async (databaseName: string): Promise<Array<{ path: string; fileCount: number }>> => {
      if (!managers) throw new Error('SDK not initialized');

      const vectorRAGManager = managers.vectorRAGManager;
      return await vectorRAGManager.getAllFoldersWithCounts(databaseName);
    },
    [managers]
  );

  // Vector operations
  const addVector = useCallback(
    async (databaseName: string, id: string, vector: number[], metadata?: Record<string, any>) => {
      if (!managers) throw new Error('SDK not initialized');

      const vectorRAGManager = managers.vectorRAGManager;
      await vectorRAGManager.addVector(databaseName, id, vector, metadata);

      // Optimistic UI update - increment vectorCount and update stats
      setDatabases(prevDbs =>
        prevDbs.map(db =>
          db.name === databaseName
            ? {
                ...db,
                vectorCount: (db.vectorCount || 0) + 1,
                storageSizeBytes: (db.storageSizeBytes || 0) + (vector.length * 4), // Approximate size
                lastAccessed: Date.now()
              }
            : db
        )
      );

      // NOTE: Caller must NOT rely on immediate S5 consistency.
      // S5 will sync in background. Don't call fetchDatabases() immediately.
      // See: /workspace/tests-ui5/S5_WRITE_READ_ANTI_PATTERN_AUDIT.md
    },
    [managers]
  );

  const addVectors = useCallback(
    async (databaseName: string, vectors: Vector[]): Promise<{ success: number; failed: number }> => {
      if (!managers) throw new Error('SDK not initialized');

      const vectorRAGManager = managers.vectorRAGManager;

      //  NOTE: The SDK has a bug where createSession() always tries to create the database,
      // which fails if it already exists in S5 storage. As a workaround, we use the
      // SDK's addVector() convenience method which calls vectorStore.addVector() directly.

      let success = 0;
      let failed = 0;

      for (const vector of vectors) {
        try {
          await vectorRAGManager.addVector(
            databaseName,
            vector.id,
            vector.values,
            vector.metadata
          );
          success++;
        } catch (error) {
          console.error(`Failed to add vector ${vector.id}:`, error);
          failed++;
        }
      }

      // Update local state with actual vector count instead of stale S5 metadata
      // Load actual vectors to get real count (metadata is never updated after creation)
      const allVectors = await vectorRAGManager.getAllVectors(databaseName);
      setDatabases(prev =>
        prev.map(db =>
          db.databaseName === databaseName
            ? { ...db, vectorCount: allVectors.length }
            : db
        )
      );

      return { success, failed };
    },
    [managers]
  );

  const addPendingDocument = useCallback(
    async (databaseName: string, docMetadata: DocumentMetadata): Promise<void> => {
      if (!managers) throw new Error('SDK not initialized');

      const storageManager = managers.storageManager;
      const s5 = storageManager.s5Client;
      const userAddress = managers.authManager.getUserAddress();

      if (!s5) {
        throw new Error('S5 storage not initialized');
      }

      // Load existing database metadata from S5
      // IMPORTANT: Must match SDK path structure: home/vector-databases/{userAddress}/{dbName}/manifest.json
      const metadataPath = `home/vector-databases/${userAddress}/${databaseName}/manifest.json`;
      let metadata: DatabaseMetadata;

      try {
        const existingMetadata = await s5.fs.get(metadataPath);
        if (existingMetadata) {
          metadata = typeof existingMetadata === 'string'
            ? JSON.parse(existingMetadata)
            : existingMetadata;
        } else {
          // If metadata doesn't exist, create new structure
          metadata = {
            databaseName: databaseName,  // SDK expects "databaseName", not "name"
            type: 'vector' as const,     // SDK requires database type
            owner: userAddress,           // SDK requires owner address
            vectorCount: 0,
            storageSizeBytes: 0,
            lastAccessedAt: Date.now(),  // SDK expects "lastAccessedAt", not "lastAccessed"
            createdAt: Date.now(),
            dimensions: 384,
            pendingDocuments: [],
            readyDocuments: []
          };
        }
      } catch (error) {
        console.error('Failed to load metadata, creating new:', error);
        metadata = {
          databaseName: databaseName,  // SDK expects "databaseName", not "name"
          type: 'vector' as const,     // SDK requires database type
          owner: userAddress,           // SDK requires owner address
          vectorCount: 0,
          storageSizeBytes: 0,
          lastAccessedAt: Date.now(),  // SDK expects "lastAccessedAt", not "lastAccessed"
          createdAt: Date.now(),
          dimensions: 384,
          pendingDocuments: [],
          readyDocuments: []
        };
      }

      // Initialize arrays if they don't exist (backward compatibility)
      if (!metadata.pendingDocuments) {
        metadata.pendingDocuments = [];
      }
      if (!metadata.readyDocuments) {
        metadata.readyDocuments = [];
      }

      // Append to pendingDocuments array
      metadata.pendingDocuments.push(docMetadata);
      metadata.lastAccessedAt = Date.now();

      // Save updated metadata to S5
      await s5.fs.put(metadataPath, metadata);

      // CRITICAL: Invalidate SDK cache to prevent stale reads on next page load
      // The SDK's S5VectorStore caches manifests, so writing directly to S5 doesn't update the cache
      // We need to clear the cache and force re-initialization
      if (managers.vectorRAGManager?.vectorStore) {
        console.debug('[addPendingDocument] Invalidating cache for:', databaseName);

        // Access the private manifestCache and delete this database's entry
        // This forces the next getDatabaseMetadata() call to reload from S5
        const vectorStore = managers.vectorRAGManager.vectorStore as any;
        if (vectorStore.manifestCache) {
          vectorStore.manifestCache.delete(databaseName);
          console.debug('[addPendingDocument] ✅ Cleared cache entry for:', databaseName);
        }
      }

      // NOTE: Caller must handle UI updates optimistically to avoid S5 P2P propagation delay.
      // Do NOT call fetchDatabases() here - it reads from S5 immediately after write,
      // which returns stale data due to P2P network propagation time.
      // See: /workspace/tests-ui5/S5_WRITE_READ_ANTI_PATTERN_AUDIT.md
    },
    [managers]
  );

  const getVectors = useCallback(
    async (databaseName: string, vectorIds: string[]): Promise<Vector[]> => {
      if (!managers) throw new Error('SDK not initialized');

      const vectorRAGManager = managers.vectorRAGManager;
      return await vectorRAGManager.getVectors(databaseName, vectorIds);
    },
    [managers]
  );

  const listVectors = useCallback(
    async (databaseName: string): Promise<Vector[]> => {
      if (!managers) throw new Error('SDK not initialized');

      const vectorRAGManager = managers.vectorRAGManager;
      return await vectorRAGManager.listVectors(databaseName);
    },
    [managers]
  );

  const deleteVector = useCallback(
    async (databaseName: string, vectorId: string) => {
      if (!managers) throw new Error('SDK not initialized');

      const vectorRAGManager = managers.vectorRAGManager;

      // Get or create session for this database (VectorRAGManager requires sessionId)
      const sessionId = await vectorRAGManager.getOrCreateSessionId(databaseName);

      // Delete the vector (deleteVectors expects an array)
      await vectorRAGManager.deleteVectors(sessionId, [vectorId]);

      // NOTE: Caller must handle UI updates optimistically to avoid S5 P2P propagation delay.
      // Do NOT call fetchDatabases() here - it reads from S5 immediately after write,
      // which returns stale data due to P2P network propagation time.
      // See: /workspace/tests-ui5/S5_WRITE_READ_ANTI_PATTERN_AUDIT.md
    },
    [managers]
  );

  const deleteVectorsByFileName = useCallback(
    async (databaseName: string, fileName: string) => {
      if (!managers) throw new Error('SDK not initialized');

      const vectorRAGManager = managers.vectorRAGManager;

      // Get or create session for this database (VectorRAGManager requires sessionId)
      const sessionId = await vectorRAGManager.getOrCreateSessionId(databaseName);

      // Delete all vectors with matching fileName metadata
      const deletedCount = await vectorRAGManager.deleteByMetadata(sessionId, { fileName });

      console.debug(`[useVectorDatabases] Deleted ${deletedCount} vectors for file "${fileName}"`);

      // NOTE: Caller must handle UI updates optimistically to avoid S5 P2P propagation delay.
      // Do NOT call fetchDatabases() here - it reads from S5 immediately after write,
      // which returns stale data due to P2P network propagation time.
      // See: /workspace/tests-ui5/S5_WRITE_READ_ANTI_PATTERN_AUDIT.md

      return deletedCount;
    },
    [managers]
  );

  // Search operations
  const searchVectors = useCallback(
    async (
      databaseName: string,
      queryVector: number[],
      k?: number,
      threshold?: number
    ): Promise<SearchResult[]> => {
      if (!managers) throw new Error('SDK not initialized');

      const vectorRAGManager = managers.vectorRAGManager;

      // NOTE: The SDK has a bug where createSession() always tries to create the database,
      // which fails if it already exists in S5 storage. As a workaround, we use the
      // SDK's searchInFolder() method with root path to search the entire database
      // without requiring session creation.

      // Use searchInFolder with root path as workaround
      return await vectorRAGManager.searchInFolder(
        databaseName,
        '/',  // Root folder path to search entire database
        queryVector,
        k,
        threshold
      );
    },
    [managers]
  );

  const searchInFolder = useCallback(
    async (
      databaseName: string,
      folderPath: string,
      queryVector: number[],
      k?: number,
      threshold?: number
    ): Promise<SearchResult[]> => {
      if (!managers) throw new Error('SDK not initialized');

      const vectorRAGManager = managers.vectorRAGManager;
      return await vectorRAGManager.searchInFolder(databaseName, folderPath, queryVector, k, threshold);
    },
    [managers]
  );

  return {
    // State
    databases,
    isLoading,
    isInitialized: isInitialized && !!managers,  // Both SDK initialized AND managers ready
    error,
    managers,  // Expose managers for direct access

    // Database operations
    createDatabase,
    getDatabase,
    updateDatabase,
    deleteDatabase,
    refreshDatabases: fetchDatabases,

    // Folder operations
    listFolders,
    getFolderStats,
    moveToFolder,
    moveFolderContents,
    createFolder,
    renameFolder,
    deleteFolder,
    getAllFoldersWithCounts,

    // Vector operations
    addVector,
    addVectors,
    addPendingDocument,
    getVectors,
    listVectors,
    deleteVector,
    deleteVectorsByFileName,

    // Search operations
    searchVectors,
    searchInFolder,
  };
}
