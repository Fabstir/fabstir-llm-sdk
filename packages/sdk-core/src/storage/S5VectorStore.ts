// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import type { S5 } from '@s5-dev/s5js';
import type { EncryptionManager } from '../managers/EncryptionManager';
import type { Vector, VectorDatabaseMetadata, FolderStats, SearchResult } from '@fabstir/sdk-core-mock';

interface DatabaseManifest {
  name: string;
  owner: string;
  description?: string;
  dimensions?: number;
  vectorCount: number;
  storageSizeBytes: number;
  created: number;
  lastAccessed: number;
  updated: number;
  chunks: ChunkMetadata[];
  chunkCount: number;
  folderPaths: string[];
  deleted?: boolean;
}

interface ChunkMetadata {
  chunkId: number;
  cid: string;
  vectorCount: number;
  sizeBytes: number;
  updatedAt: number;
}

interface VectorChunk {
  chunkId: number;
  vectors: Vector[];
}

export interface S5VectorStoreOptions {
  s5Client: S5;
  userAddress: string;
  encryptionManager: EncryptionManager;
  cacheEnabled?: boolean;
}

export class S5VectorStore {
  private readonly s5Client: S5;
  private readonly userAddress: string;
  private readonly encryptionManager: EncryptionManager;
  private readonly cacheEnabled: boolean;
  private manifestCache: Map<string, DatabaseManifest>;
  private vectorCache: Map<string, Map<string, Vector>>;

  constructor(options: S5VectorStoreOptions) {
    this.s5Client = options.s5Client;
    this.userAddress = options.userAddress;
    this.encryptionManager = options.encryptionManager;
    this.cacheEnabled = options.cacheEnabled !== false;
    this.manifestCache = new Map();
    this.vectorCache = new Map();
  }

  async createDatabase(config: { name: string; owner: string; description?: string }): Promise<VectorDatabaseMetadata> {
    if (!config.name?.trim()) throw new Error('Database name cannot be empty');
    if (await this.databaseExists(config.name)) throw new Error(`Database "${config.name}" already exists`);

    const manifest: DatabaseManifest = {
      name: config.name,
      owner: config.owner,
      description: config.description,
      vectorCount: 0,
      storageSizeBytes: 0,
      created: Date.now(),
      lastAccessed: Date.now(),
      updated: Date.now(),
      chunks: [],
      chunkCount: 0,
      folderPaths: [],
    };

    await this._saveManifest(config.name, manifest);
    return this._manifestToMetadata(manifest);
  }

  async listDatabases(): Promise<VectorDatabaseMetadata[]> {
    const databases: VectorDatabaseMetadata[] = [];
    for (const manifest of this.manifestCache.values()) {
      if (!manifest.deleted) databases.push(this._manifestToMetadata(manifest));
    }
    return databases;
  }

  async getDatabase(databaseName: string): Promise<VectorDatabaseMetadata | null> {
    const manifest = await this._loadManifest(databaseName);
    return (manifest && !manifest.deleted) ? this._manifestToMetadata(manifest) : null;
  }

  async deleteDatabase(databaseName: string): Promise<void> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) throw new Error(`Database "${databaseName}" not found`);
    manifest.deleted = true;
    await this._saveManifest(databaseName, manifest);
    this.manifestCache.delete(databaseName);
    this.vectorCache.delete(databaseName);
  }

  async databaseExists(databaseName: string): Promise<boolean> {
    const manifest = await this._loadManifest(databaseName);
    return manifest !== null && !manifest.deleted;
  }

  async addVectors(databaseName: string, vectors: Vector[]): Promise<void> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) throw new Error(`Database "${databaseName}" not found`);

    if (vectors.length > 0) {
      const firstDim = vectors[0].vector.length;
      for (const vec of vectors) {
        if (vec.vector.length !== firstDim) throw new Error('Vector dimension mismatch');
      }
      if (!manifest.dimensions) manifest.dimensions = firstDim;
      else if (manifest.dimensions !== firstDim) throw new Error('Vector dimension mismatch');
    }

    let cache = this.vectorCache.get(databaseName) || await this._loadAllVectors(databaseName, manifest);
    for (const vector of vectors) {
      cache.set(vector.id, vector);
      const folderPath = vector.metadata?.folderPath;
      if (folderPath && !manifest.folderPaths.includes(folderPath)) manifest.folderPaths.push(folderPath);
    }

    manifest.vectorCount = cache.size;
    manifest.updated = Date.now();
    await this._saveChunksBackground(databaseName, cache, manifest);
    this.vectorCache.set(databaseName, cache);
  }

  async getVector(databaseName: string, vectorId: string): Promise<Vector | null> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) return null;
    const cache = await this._loadAllVectors(databaseName, manifest);
    return cache.get(vectorId) || null;
  }

  async deleteVector(databaseName: string, vectorId: string): Promise<void> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) throw new Error(`Database "${databaseName}" not found`);
    const cache = await this._loadAllVectors(databaseName, manifest);
    cache.delete(vectorId);
    manifest.vectorCount = cache.size;
    manifest.updated = Date.now();
    await this._saveChunksBackground(databaseName, cache, manifest);
  }

  async deleteByMetadata(databaseName: string, filter: Record<string, any>): Promise<number> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) throw new Error(`Database "${databaseName}" not found`);
    const cache = await this._loadAllVectors(databaseName, manifest);
    let deletedCount = 0;
    for (const [id, vector] of cache.entries()) {
      if (this._matchesFilter(vector.metadata, filter)) {
        cache.delete(id);
        deletedCount++;
      }
    }
    manifest.vectorCount = cache.size;
    manifest.updated = Date.now();
    await this._saveChunksBackground(databaseName, cache, manifest);
    return deletedCount;
  }

  async updateMetadata(databaseName: string, vectorId: string, metadata: Record<string, any>): Promise<void> {
    const vector = await this.getVector(databaseName, vectorId);
    if (!vector) throw new Error(`Vector "${vectorId}" not found`);
    vector.metadata = { ...vector.metadata, ...metadata };
    await this.addVectors(databaseName, [vector]);
  }

  async listVectors(databaseName: string): Promise<Vector[]> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) throw new Error(`Database "${databaseName}" not found`);
    const cache = await this._loadAllVectors(databaseName, manifest);
    return Array.from(cache.values());
  }

  async getStats(databaseName: string) {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) throw new Error(`Database "${databaseName}" not found`);
    return {
      vectorCount: manifest.vectorCount,
      chunkCount: manifest.chunkCount,
      storageSizeBytes: manifest.storageSizeBytes,
      lastUpdated: manifest.updated,
    };
  }

  async getVectorDatabaseMetadata(databaseName: string): Promise<VectorDatabaseMetadata> {
    const db = await this.getDatabase(databaseName);
    if (!db) throw new Error(`Database "${databaseName}" not found`);
    return db;
  }

  async getDatabaseMetadata(databaseName: string): Promise<VectorDatabaseMetadata> {
    return await this.getVectorDatabaseMetadata(databaseName);
  }

  async updateVectorDatabaseMetadata(databaseName: string, updates: Partial<VectorDatabaseMetadata>): Promise<void> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest || manifest.deleted) throw new Error(`Database "${databaseName}" not found`);
    if (updates.description !== undefined) manifest.description = updates.description;
    if (updates.dimensions !== undefined) manifest.dimensions = updates.dimensions;
    manifest.updated = Date.now();
    await this._saveManifest(databaseName, manifest);
  }

  async addVector(databaseName: string, id: string, vector: number[], metadata?: Record<string, any>): Promise<void> {
    await this.addVectors(databaseName, [{ id, vector, metadata: metadata || {} }]);
  }

  async getVectors(databaseName: string, vectorIds: string[]): Promise<Vector[]> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) throw new Error(`Database "${databaseName}" not found`);
    const cache = await this._loadAllVectors(databaseName, manifest);
    return vectorIds.map(id => cache.get(id)).filter(v => v !== undefined) as Vector[];
  }

  // ===== FOLDER OPERATIONS (Mock SDK Parity) =====

  async listFolders(databaseName: string): Promise<string[]> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) {
      throw new Error(`Database "${databaseName}" not found`);
    }
    return manifest.folderPaths.sort();
  }

  async getAllFoldersWithCounts(databaseName: string): Promise<Array<{ path: string; fileCount: number }>> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) {
      throw new Error(`Database "${databaseName}" not found`);
    }

    const vectors = await this.listVectors(databaseName);
    const folderCounts = new Map<string, number>();

    vectors.forEach(v => {
      const folder = v.metadata?.folderPath;
      if (folder) {
        folderCounts.set(folder, (folderCounts.get(folder) || 0) + 1);
      }
    });

    manifest.folderPaths.forEach(folder => {
      if (!folderCounts.has(folder)) {
        folderCounts.set(folder, 0);
      }
    });

    return Array.from(folderCounts.entries())
      .map(([path, fileCount]) => ({ path, fileCount }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  async getFolderStatistics(databaseName: string, folderPath: string): Promise<FolderStats> {
    const vectors = await this.listVectors(databaseName);
    const folderVectors = vectors.filter(v => v.metadata?.folderPath === folderPath);

    return {
      path: folderPath,
      vectorCount: folderVectors.length,
      sizeBytes: folderVectors.length * (folderVectors[0]?.vector.length || 0) * 4,
      lastModified: Date.now(),
    };
  }

  async createFolder(databaseName: string, folderPath: string): Promise<void> {
    if (!folderPath || folderPath.trim() === '') {
      throw new Error('Folder path cannot be empty');
    }

    const manifest = await this._loadManifest(databaseName);
    if (!manifest) {
      throw new Error(`Database "${databaseName}" not found`);
    }

    if (!manifest.folderPaths.includes(folderPath)) {
      manifest.folderPaths.push(folderPath);
      manifest.updated = Date.now();
      await this._saveManifest(databaseName, manifest);
    }
  }

  async renameFolder(databaseName: string, oldPath: string, newPath: string): Promise<number> {
    const vectors = await this.listVectors(databaseName);
    const updates: Vector[] = [];

    vectors.forEach(v => {
      if (v.metadata?.folderPath === oldPath) {
        v.metadata.folderPath = newPath;
        updates.push(v);
      }
    });

    if (updates.length > 0) {
      await this.addVectors(databaseName, updates);
    }

    const manifest = await this._loadManifest(databaseName);
    if (manifest) {
      const idx = manifest.folderPaths.indexOf(oldPath);
      if (idx !== -1) {
        manifest.folderPaths[idx] = newPath;
        await this._saveManifest(databaseName, manifest);
      }
    }

    return updates.length;
  }

  async deleteFolder(databaseName: string, folderPath: string): Promise<number> {
    const vectors = await this.listVectors(databaseName);
    const toDelete: string[] = [];

    vectors.forEach(v => {
      if (v.metadata?.folderPath === folderPath) {
        toDelete.push(v.id);
      }
    });

    for (const id of toDelete) {
      await this.deleteVector(databaseName, id);
    }

    const manifest = await this._loadManifest(databaseName);
    if (manifest) {
      manifest.folderPaths = manifest.folderPaths.filter(f => f !== folderPath);
      await this._saveManifest(databaseName, manifest);
    }

    return toDelete.length;
  }

  async moveToFolder(databaseName: string, vectorId: string, targetFolder: string): Promise<void> {
    const vector = await this.getVector(databaseName, vectorId);
    if (!vector) {
      throw new Error(`Vector "${vectorId}" not found`);
    }

    vector.metadata = { ...vector.metadata, folderPath: targetFolder };
    await this.addVectors(databaseName, [vector]);
  }

  async moveFolderContents(databaseName: string, sourceFolder: string, targetFolder: string): Promise<number> {
    const vectors = await this.listVectors(databaseName);
    const toMove: Vector[] = [];

    vectors.forEach(v => {
      if (v.metadata?.folderPath === sourceFolder) {
        v.metadata.folderPath = targetFolder;
        toMove.push(v);
      }
    });

    if (toMove.length > 0) {
      await this.addVectors(databaseName, toMove);
    }

    return toMove.length;
  }

  async searchInFolder(databaseName: string, folderPath: string, queryVector: number[], k?: number, threshold?: number): Promise<SearchResult[]> {
    throw new Error('searchInFolder() requires host-side support. Use search() and filter results client-side for now.');
  }

  // ===== PRIVATE HELPERS =====

  private _getDatabaseBasePath(): string {
    return `home/vector-databases/${this.userAddress}`;
  }

  private _getManifestPath(databaseName: string): string {
    return `${this._getDatabaseBasePath()}/${databaseName}/manifest.json`;
  }

  private _getChunkPath(databaseName: string, chunkId: number): string {
    return `${this._getDatabaseBasePath()}/${databaseName}/chunk-${chunkId}.json`;
  }

  private async _loadManifest(databaseName: string): Promise<DatabaseManifest | null> {
    if (this.cacheEnabled && this.manifestCache.has(databaseName)) {
      return this.manifestCache.get(databaseName)!;
    }

    try {
      const path = this._getManifestPath(databaseName);
      const encrypted = await this.s5Client.downloadFile(path);
      if (!encrypted) return null;

      const json = await this.encryptionManager.decrypt(encrypted);
      const manifest = JSON.parse(json) as DatabaseManifest;

      if (this.cacheEnabled) {
        this.manifestCache.set(databaseName, manifest);
      }

      return manifest;
    } catch (error) {
      return null;
    }
  }

  private async _saveManifest(databaseName: string, manifest: DatabaseManifest): Promise<void> {
    const path = this._getManifestPath(databaseName);
    const json = JSON.stringify(manifest);
    const encrypted = await this.encryptionManager.encrypt(json);
    await this.s5Client.uploadFile(path, encrypted);

    if (this.cacheEnabled) {
      this.manifestCache.set(databaseName, manifest);
    }
  }

  private async _loadAllVectors(databaseName: string, manifest: DatabaseManifest): Promise<Map<string, Vector>> {
    if (this.cacheEnabled && this.vectorCache.has(databaseName)) {
      return this.vectorCache.get(databaseName)!;
    }

    const cache = new Map<string, Vector>();

    const chunkPromises = manifest.chunks.map(chunkMeta => this._loadChunk(databaseName, chunkMeta.chunkId));
    const chunks = await Promise.all(chunkPromises);

    for (const chunk of chunks) {
      if (chunk) {
        for (const vector of chunk.vectors) {
          cache.set(vector.id, vector);
        }
      }
    }

    if (this.cacheEnabled) {
      this.vectorCache.set(databaseName, cache);
    }

    return cache;
  }

  private async _loadChunk(databaseName: string, chunkId: number): Promise<VectorChunk | null> {
    try {
      const path = this._getChunkPath(databaseName, chunkId);
      const encrypted = await this.s5Client.downloadFile(path);
      if (!encrypted) return null;

      const json = await this.encryptionManager.decrypt(encrypted);
      return JSON.parse(json) as VectorChunk;
    } catch (error) {
      return null;
    }
  }

  private async _saveChunksBackground(databaseName: string, cache: Map<string, Vector>, manifest: DatabaseManifest): Promise<void> {
    const chunkSize = 10000;
    const vectors = Array.from(cache.values());
    const chunks: VectorChunk[] = [];

    for (let i = 0; i < vectors.length; i += chunkSize) {
      const chunkVectors = vectors.slice(i, i + chunkSize);
      chunks.push({ chunkId: chunks.length, vectors: chunkVectors });
    }

    const chunkPromises = chunks.map(chunk => this._saveChunk(databaseName, chunk));
    const chunkMetas = await Promise.all(chunkPromises);

    manifest.chunks = chunkMetas;
    manifest.chunkCount = chunkMetas.length;

    await this._saveManifest(databaseName, manifest);
  }

  private async _saveChunk(databaseName: string, chunk: VectorChunk): Promise<ChunkMetadata> {
    const path = this._getChunkPath(databaseName, chunk.chunkId);
    const json = JSON.stringify(chunk);
    const encrypted = await this.encryptionManager.encrypt(json);
    const cid = await this.s5Client.uploadFile(path, encrypted);

    return {
      chunkId: chunk.chunkId,
      cid: cid,
      vectorCount: chunk.vectors.length,
      sizeBytes: encrypted.byteLength,
      updatedAt: Date.now(),
    };
  }

  private _manifestToMetadata(manifest: DatabaseManifest): VectorDatabaseMetadata {
    return {
      id: manifest.name,
      name: manifest.name,
      dimensions: manifest.dimensions || 0,
      vectorCount: manifest.vectorCount,
      storageSizeBytes: manifest.storageSizeBytes,
      owner: manifest.owner,
      created: manifest.created,
      lastAccessed: manifest.lastAccessed,
      description: manifest.description,
      folderStructure: manifest.folderPaths.length > 0,
    };
  }

  private _matchesFilter(metadata: Record<string, any>, filter: Record<string, any>): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (metadata[key] !== value) {
        return false;
      }
    }
    return true;
  }
}
