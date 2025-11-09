/**
 * VectorRAGManagerMock
 *
 * Mock implementation of IVectorRAGManager for UI development
 * Manages vector databases with folder hierarchy
 */

import type {
  IVectorRAGManager,
  Vector,
  SearchResult,
  DatabaseMetadata,
  FolderStats
} from '../types';
import { MockStorage } from '../storage/MockStorage';
import { generateMockVectorDatabases } from '../fixtures/mockData';

export class VectorRAGManagerMock implements IVectorRAGManager {
  private storage: MockStorage;
  private vectorStorage: MockStorage;
  private userAddress: string;

  constructor(userAddress: string) {
    this.userAddress = userAddress;
    this.storage = new MockStorage(`vector-dbs-${userAddress}`);
    this.vectorStorage = new MockStorage(`vectors-${userAddress}`);

    // Initialize with mock data if empty
    if (this.storage.size() === 0) {
      console.log('[Mock] Initializing vector databases with mock data');
      generateMockVectorDatabases().forEach(db => {
        this.storage.set(db.name, db);
        // Initialize empty vector array for each DB
        this.vectorStorage.set(db.name, []);
      });
    }
  }

  async createSession(
    databaseName: string,
    options?: { dimensions?: number; folderStructure?: boolean }
  ): Promise<void> {
    await this.delay(400);

    // Check if database already exists
    if (this.storage.has(databaseName)) {
      throw new Error(`[Mock] Database already exists: ${databaseName}`);
    }

    const db: DatabaseMetadata = {
      name: databaseName,
      dimensions: options?.dimensions || 384,
      vectorCount: 0,
      storageSizeBytes: 0,
      owner: this.userAddress,
      created: Date.now(),
      lastAccessed: Date.now(),
      description: '',
      folderStructure: options?.folderStructure !== false
    };

    this.storage.set(databaseName, db);
    this.vectorStorage.set(databaseName, []);

    console.log('[Mock] Created vector database:', databaseName);
  }

  async listDatabases(): Promise<DatabaseMetadata[]> {
    await this.delay(300);
    return this.storage.getAll();
  }

  async getDatabaseMetadata(databaseName: string): Promise<DatabaseMetadata> {
    await this.delay(200);

    const db = this.storage.get<DatabaseMetadata>(databaseName);
    if (!db) {
      throw new Error(`[Mock] Database not found: ${databaseName}`);
    }

    return db;
  }

  async updateDatabaseMetadata(
    databaseName: string,
    updates: Partial<DatabaseMetadata>
  ): Promise<void> {
    await this.delay(300);

    const db = this.storage.get<DatabaseMetadata>(databaseName);
    if (!db) {
      throw new Error(`[Mock] Database not found: ${databaseName}`);
    }

    const updated = { ...db, ...updates };
    this.storage.set(databaseName, updated);

    console.log('[Mock] Updated database metadata:', databaseName);
  }

  async deleteDatabase(databaseName: string): Promise<void> {
    await this.delay(600);

    if (!this.storage.has(databaseName)) {
      throw new Error(`[Mock] Database not found: ${databaseName}`);
    }

    this.storage.delete(databaseName);
    this.vectorStorage.delete(databaseName);

    console.log('[Mock] Deleted vector database:', databaseName);
  }

  async addVector(
    databaseName: string,
    id: string,
    vector: number[],
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.delay(150);

    const vectors = this.vectorStorage.get<Vector[]>(databaseName) || [];

    // Check for duplicate ID
    if (vectors.some(v => v.id === id)) {
      throw new Error(`[Mock] Vector with ID ${id} already exists`);
    }

    vectors.push({
      id,
      vector,
      metadata: metadata || {}
    });

    this.vectorStorage.set(databaseName, vectors);

    // Update database metadata
    const db = this.storage.get<DatabaseMetadata>(databaseName);
    if (db) {
      db.vectorCount = vectors.length;
      db.storageSizeBytes = vectors.length * vector.length * 4; // Rough estimate
      db.lastAccessed = Date.now();
      this.storage.set(databaseName, db);
    }

    console.log(`[Mock] Added vector ${id} to ${databaseName}`);
  }

  async addVectors(
    databaseName: string,
    vectors: Vector[]
  ): Promise<{ success: number; failed: number }> {
    await this.delay(vectors.length * 50);

    let success = 0;
    let failed = 0;

    for (const vector of vectors) {
      try {
        await this.addVector(databaseName, vector.id, vector.vector, vector.metadata);
        success++;
      } catch (error) {
        failed++;
        console.error(`[Mock] Failed to add vector ${vector.id}:`, error);
      }
    }

    console.log(`[Mock] Added ${success} vectors, ${failed} failed`);
    return { success, failed };
  }

  async getVectors(
    databaseName: string,
    vectorIds: string[]
  ): Promise<Vector[]> {
    await this.delay(200);

    const vectors = this.vectorStorage.get<Vector[]>(databaseName) || [];
    return vectors.filter(v => vectorIds.includes(v.id));
  }

  async deleteVector(databaseName: string, vectorId: string): Promise<void> {
    await this.delay(200);

    const vectors = this.vectorStorage.get<Vector[]>(databaseName) || [];
    const filtered = vectors.filter(v => v.id !== vectorId);

    if (filtered.length === vectors.length) {
      throw new Error(`[Mock] Vector ${vectorId} not found`);
    }

    this.vectorStorage.set(databaseName, filtered);

    // Update database metadata
    const db = this.storage.get<DatabaseMetadata>(databaseName);
    if (db) {
      db.vectorCount = filtered.length;
      db.lastAccessed = Date.now();
      this.storage.set(databaseName, db);
    }

    console.log(`[Mock] Deleted vector ${vectorId}`);
  }

  async searchVectors(
    databaseName: string,
    queryVector: number[],
    k?: number,
    threshold?: number
  ): Promise<SearchResult[]> {
    await this.delay(300);

    const vectors = this.vectorStorage.get<Vector[]>(databaseName) || [];
    const topK = k || 5;
    const minScore = threshold || 0.7;

    // Mock search results with decreasing scores
    const results: SearchResult[] = [];
    const count = Math.min(topK, vectors.length);

    for (let i = 0; i < count; i++) {
      const score = 0.95 - (i * 0.08);
      if (score >= minScore && vectors[i]) {
        results.push({
          id: vectors[i].id,
          score,
          metadata: vectors[i].metadata || {}
        });
      }
    }

    console.log(`[Mock] Found ${results.length} vectors (threshold: ${minScore})`);
    return results;
  }

  async listFolders(databaseName: string): Promise<string[]> {
    await this.delay(200);

    const vectors = this.vectorStorage.get<Vector[]>(databaseName) || [];
    const folders = new Set<string>();

    vectors.forEach(v => {
      if (v.metadata?.folderPath) {
        folders.add(v.metadata.folderPath);
      }
    });

    return Array.from(folders).sort();
  }

  async getFolderStatistics(
    databaseName: string,
    folderPath: string
  ): Promise<FolderStats> {
    await this.delay(250);

    const vectors = this.vectorStorage.get<Vector[]>(databaseName) || [];
    const folderVectors = vectors.filter(v => v.metadata?.folderPath === folderPath);

    return {
      path: folderPath,
      vectorCount: folderVectors.length,
      sizeBytes: folderVectors.length * 384 * 4, // Rough estimate
      lastModified: Date.now()
    };
  }

  async moveToFolder(
    databaseName: string,
    vectorId: string,
    targetFolder: string
  ): Promise<void> {
    await this.delay(200);

    const vectors = this.vectorStorage.get<Vector[]>(databaseName) || [];
    const vector = vectors.find(v => v.id === vectorId);

    if (!vector) {
      throw new Error(`[Mock] Vector ${vectorId} not found`);
    }

    vector.metadata = {
      ...vector.metadata,
      folderPath: targetFolder
    };

    this.vectorStorage.set(databaseName, vectors);
    console.log(`[Mock] Moved vector ${vectorId} to ${targetFolder}`);
  }

  async searchInFolder(
    databaseName: string,
    folderPath: string,
    queryVector: number[],
    k?: number,
    threshold?: number
  ): Promise<SearchResult[]> {
    await this.delay(350);

    const vectors = this.vectorStorage.get<Vector[]>(databaseName) || [];
    const folderVectors = vectors.filter(v => v.metadata?.folderPath === folderPath);

    // Simulate search within folder
    const topK = k || 5;
    const minScore = threshold || 0.7;
    const results: SearchResult[] = [];
    const count = Math.min(topK, folderVectors.length);

    for (let i = 0; i < count; i++) {
      const score = 0.95 - (i * 0.08);
      if (score >= minScore && folderVectors[i]) {
        results.push({
          id: folderVectors[i].id,
          score,
          metadata: folderVectors[i].metadata || {}
        });
      }
    }

    console.log(`[Mock] Found ${results.length} vectors in folder ${folderPath}`);
    return results;
  }

  async moveFolderContents(
    databaseName: string,
    sourceFolder: string,
    targetFolder: string
  ): Promise<number> {
    await this.delay(400);

    const vectors = this.vectorStorage.get<Vector[]>(databaseName) || [];
    let movedCount = 0;

    vectors.forEach(v => {
      if (v.metadata?.folderPath === sourceFolder) {
        v.metadata.folderPath = targetFolder;
        movedCount++;
      }
    });

    this.vectorStorage.set(databaseName, vectors);
    console.log(`[Mock] Moved ${movedCount} vectors from ${sourceFolder} to ${targetFolder}`);

    return movedCount;
  }

  // Helper Methods

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
