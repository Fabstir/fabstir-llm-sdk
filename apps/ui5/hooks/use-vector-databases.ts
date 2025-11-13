'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSDK } from './use-sdk';
import type { DatabaseMetadata, Vector, SearchResult, FolderStats } from '@fabstir/sdk-core-mock';

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
      setDatabases(dbs);
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
      if (!managers) throw new Error('SDK not initialized');

      const vectorRAGManager = managers.vectorRAGManager;
      await vectorRAGManager.createSession(name, options);
      await fetchDatabases(); // Refresh list
    },
    [managers, fetchDatabases]
  );

  // Get database metadata
  const getDatabase = useCallback(
    async (name: string): Promise<DatabaseMetadata> => {
      if (!managers) throw new Error('SDK not initialized');

      const vectorRAGManager = managers.vectorRAGManager;
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
      await fetchDatabases(); // Refresh list
    },
    [managers, fetchDatabases]
  );

  // Delete database
  const deleteDatabase = useCallback(
    async (name: string) => {
      if (!managers) throw new Error('SDK not initialized');

      const vectorRAGManager = managers.vectorRAGManager;
      await vectorRAGManager.deleteDatabase(name);
      await fetchDatabases(); // Refresh list
    },
    [managers, fetchDatabases]
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
      await fetchDatabases(); // Refresh to update stats
      return deletedCount;
    },
    [managers, fetchDatabases]
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
      await fetchDatabases(); // Refresh to update stats
    },
    [managers, fetchDatabases]
  );

  const addVectors = useCallback(
    async (databaseName: string, vectors: Vector[]): Promise<{ success: number; failed: number }> => {
      if (!managers) throw new Error('SDK not initialized');

      const vectorRAGManager = managers.vectorRAGManager;
      const result = await vectorRAGManager.addVectors(databaseName, vectors);
      await fetchDatabases(); // Refresh to update stats
      return result;
    },
    [managers, fetchDatabases]
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
      await vectorRAGManager.deleteVector(databaseName, vectorId);
      await fetchDatabases(); // Refresh to update stats
    },
    [managers, fetchDatabases]
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
      return await vectorRAGManager.searchVectors(databaseName, queryVector, k, threshold);
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
    isInitialized,
    error,

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
    getVectors,
    listVectors,
    deleteVector,

    // Search operations
    searchVectors,
    searchInFolder,
  };
}
