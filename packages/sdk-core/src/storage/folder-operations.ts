/**
 * Folder Operations
 * Virtual folder hierarchy management for RAG storage
 * Max 400 lines
 */

import {
  validatePath,
  validateFolderName,
  normalizePath,
  getParentPath,
  getAncestorPaths,
  getFolderName,
  isSubPath
} from './path-validator.js';

/**
 * Folder metadata
 */
export interface FolderMetadata {
  createdAt: number;
  lastModified: number;
  fileCount: number;
  folderCount: number;
  totalSize: number;
  totalSizeFormatted?: string;
}

/**
 * Folder node in hierarchy
 */
export interface FolderNode {
  name: string;
  path: string;
  type: 'folder';
  metadata: FolderMetadata;
  children: Map<string, FolderNode>;
  files: Map<string, number>; // fileName -> size
}

/**
 * Folder list item
 */
export interface FolderListItem {
  name: string;
  path: string;
  type: 'folder';
  createdAt?: number;
  lastModified?: number;
  fileCount?: number;
  folderCount?: number;
  totalSize?: number;
}

/**
 * Virtual folder hierarchy manager
 * Stores folder structure in memory and persists to S5
 */
export class FolderHierarchy {
  private databases: Map<string, FolderNode>;

  constructor() {
    this.databases = new Map();
  }

  /**
   * Create a folder
   */
  createFolder(databaseName: string, path: string): void {
    // Validate database name
    if (!databaseName || databaseName.trim() === '') {
      throw new Error('Database name is required');
    }

    // Validate and normalize path
    const validation = validatePath(path);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const normalizedPath = validation.normalized!;

    // Cannot create root
    if (normalizedPath === '/') {
      throw new Error('Root folder already exists');
    }

    // Get or create database root
    const root = this.getOrCreateRoot(databaseName);

    // Check if folder already exists
    if (this.findFolder(root, normalizedPath)) {
      throw new Error('Folder already exists');
    }

    // Create parent folders if needed
    const parentPath = getParentPath(normalizedPath);
    if (parentPath && parentPath !== '/') {
      // Only create parent if it doesn't exist
      if (!this.findFolder(root, parentPath)) {
        this.createFolder(databaseName, parentPath);
      }
    }

    // Create the folder
    const folderName = getFolderName(normalizedPath);
    const parent = parentPath ? this.findFolder(root, parentPath) : root;

    if (!parent) {
      throw new Error('Parent folder not found');
    }

    const now = Date.now();
    const newFolder: FolderNode = {
      name: folderName,
      path: normalizedPath,
      type: 'folder',
      metadata: {
        createdAt: now,
        lastModified: now,
        fileCount: 0,
        folderCount: 0,
        totalSize: 0
      },
      children: new Map(),
      files: new Map()
    };

    parent.children.set(folderName, newFolder);

    // Update parent metadata
    this.updateParentMetadata(databaseName, normalizedPath, 'folderAdded');
  }

  /**
   * Delete a folder
   */
  deleteFolder(databaseName: string, path: string, recursive: boolean = false, options?: { deleteVectors?: boolean }): void {
    // Validate path
    const validation = validatePath(path);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const normalizedPath = validation.normalized!;

    // Cannot delete root without recursive flag
    if (normalizedPath === '/') {
      if (!recursive) {
        throw new Error('Cannot delete root folder');
      }
      // Clear entire database on recursive root delete
      this.databases.delete(databaseName);
      return;
    }

    const root = this.databases.get(databaseName);
    if (!root) {
      throw new Error('Database not found');
    }

    const folder = this.findFolder(root, normalizedPath);
    if (!folder) {
      throw new Error('Folder not found');
    }

    // Check if folder is empty
    if (!recursive && folder.children.size > 0) {
      throw new Error('Folder not empty');
    }

    // Remove from parent
    const parentPath = getParentPath(normalizedPath);
    const parent = parentPath ? this.findFolder(root, parentPath) : root;

    if (parent) {
      parent.children.delete(folder.name);

      // Update parent metadata
      this.updateParentMetadata(databaseName, normalizedPath, 'folderRemoved');
    }
  }

  /**
   * Move a folder to a new parent
   */
  moveFolder(databaseName: string, sourcePath: string, destPath: string): void {
    // Validate paths
    const sourceValidation = validatePath(sourcePath);
    const destValidation = validatePath(destPath);

    if (!sourceValidation.valid) {
      throw new Error(`Invalid source path: ${sourceValidation.error}`);
    }
    if (!destValidation.valid) {
      throw new Error(`Invalid destination path: ${destValidation.error}`);
    }

    const normalizedSource = sourceValidation.normalized!;
    const normalizedDest = destValidation.normalized!;

    // Cannot move to itself
    if (normalizedSource === normalizedDest) {
      throw new Error('Cannot move folder to itself');
    }

    // Cannot move to subfolder of itself
    if (isSubPath(normalizedDest, normalizedSource)) {
      throw new Error('Cannot move folder to its own subfolder');
    }

    const root = this.databases.get(databaseName);
    if (!root) {
      throw new Error('Database not found');
    }

    const sourceFolder = this.findFolder(root, normalizedSource);
    if (!sourceFolder) {
      throw new Error('Source folder not found');
    }

    // Check if destination already exists
    if (this.findFolder(root, normalizedDest)) {
      throw new Error('Destination folder already exists');
    }

    // Create destination parent if needed
    const destParentPath = getParentPath(normalizedDest);
    if (destParentPath && destParentPath !== '/') {
      // Only create if it doesn't exist
      if (!this.findFolder(root, destParentPath)) {
        this.createFolder(databaseName, destParentPath);
      }
    }

    // Remove from source parent
    const sourceParentPath = getParentPath(normalizedSource);
    const sourceParent = sourceParentPath ? this.findFolder(root, sourceParentPath) : root;
    if (sourceParent) {
      sourceParent.children.delete(sourceFolder.name);
    }

    // Add to destination parent
    const destParent = destParentPath ? this.findFolder(root, destParentPath) : root;
    if (!destParent) {
      throw new Error('Destination parent not found');
    }

    const destName = getFolderName(normalizedDest);
    sourceFolder.name = destName;
    sourceFolder.path = normalizedDest;
    sourceFolder.metadata.lastModified = Date.now();

    destParent.children.set(destName, sourceFolder);

    // Update all child paths recursively
    this.updateChildPaths(sourceFolder, normalizedDest);

    // Update parent metadata
    this.updateParentMetadata(databaseName, normalizedSource, 'folderRemoved');
    this.updateParentMetadata(databaseName, normalizedDest, 'folderAdded');
  }

  /**
   * Rename a folder
   */
  renameFolder(databaseName: string, path: string, newName: string): void {
    // Validate path
    const validation = validatePath(path);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const normalizedPath = validation.normalized!;

    // Cannot rename root
    if (normalizedPath === '/') {
      throw new Error('Cannot rename root folder');
    }

    // Validate new name
    const nameValidation = validateFolderName(newName);
    if (!nameValidation.valid) {
      throw new Error(nameValidation.error);
    }

    const root = this.databases.get(databaseName);
    if (!root) {
      throw new Error('Database not found');
    }

    const folder = this.findFolder(root, normalizedPath);
    if (!folder) {
      throw new Error('Folder not found');
    }

    const parentPath = getParentPath(normalizedPath);
    const parent = parentPath ? this.findFolder(root, parentPath) : root;

    if (!parent) {
      throw new Error('Parent folder not found');
    }

    // Check if new name conflicts
    if (parent.children.has(newName)) {
      throw new Error('Folder with new name already exists');
    }

    // Remove old name
    parent.children.delete(folder.name);

    // Update folder
    const newPath = parentPath ? `${parentPath}/${newName}` : `/${newName}`;
    folder.name = newName;
    folder.path = newPath;
    folder.metadata.lastModified = Date.now();

    // Add with new name
    parent.children.set(newName, folder);

    // Update all child paths recursively
    this.updateChildPaths(folder, newPath);
  }

  /**
   * List folder contents
   */
  listFolder(databaseName: string, path: string, options?: { limit?: number; cursor?: string }): FolderListItem[] | { items: FolderListItem[]; cursor?: string } {
    const validation = validatePath(path);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const normalizedPath = validation.normalized!;

    const root = this.databases.get(databaseName);
    if (!root) {
      // Return empty array for new database
      return [];
    }

    const folder = normalizedPath === '/' ? root : this.findFolder(root, normalizedPath);
    if (!folder) {
      throw new Error('Folder not found');
    }

    const items: FolderListItem[] = Array.from(folder.children.values()).map(child => ({
      name: child.name,
      path: child.path,
      type: child.type,
      createdAt: child.metadata.createdAt,
      lastModified: child.metadata.lastModified,
      fileCount: child.metadata.fileCount,
      folderCount: child.metadata.folderCount,
      totalSize: child.metadata.totalSize
    }));

    // Handle pagination
    if (options?.limit) {
      const start = options.cursor ? parseInt(options.cursor, 10) : 0;
      const end = start + options.limit;
      const paginated = items.slice(start, end);

      return {
        items: paginated,
        cursor: end < items.length ? end.toString() : undefined
      };
    }

    return items;
  }

  /**
   * Get folder metadata
   */
  getFolderMetadata(databaseName: string, path: string, options?: { recursive?: boolean; formatSize?: boolean }): FolderMetadata {
    const validation = validatePath(path);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const normalizedPath = validation.normalized!;

    const root = this.databases.get(databaseName);
    if (!root) {
      throw new Error('Database not found');
    }

    const folder = normalizedPath === '/' ? root : this.findFolder(root, normalizedPath);
    if (!folder) {
      throw new Error('Folder not found');
    }

    let metadata = { ...folder.metadata };

    // Calculate recursive counts if requested
    if (options?.recursive) {
      const recursiveCounts = this.getRecursiveCounts(folder);
      metadata.fileCount = recursiveCounts.fileCount;
      metadata.folderCount = recursiveCounts.folderCount;
      metadata.totalSize = recursiveCounts.totalSize;
    }

    // Format size if requested
    if (options?.formatSize) {
      metadata.totalSizeFormatted = this.formatSize(metadata.totalSize);
    }

    return metadata;
  }

  /**
   * Add file to folder (update metadata)
   *
   * @param databaseName - Database name
   * @param path - Folder path
   * @param file - File info (name, size)
   */
  addFileToFolder(databaseName: string, path: string, file: { name: string; size: number }): void {
    const validation = validatePath(path);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const normalizedPath = validation.normalized!;
    const root = this.databases.get(databaseName);
    if (!root) {
      throw new Error('Database not found');
    }

    const folder = normalizedPath === '/' ? root : this.findFolder(root, normalizedPath);
    if (!folder) {
      throw new Error('Folder not found');
    }

    // Store file info
    folder.files.set(file.name, file.size);

    // Update folder metadata
    folder.metadata.fileCount++;
    folder.metadata.totalSize += file.size;
    folder.metadata.lastModified = Date.now();

    // Update parent metadata
    this.updateParentMetadata(databaseName, normalizedPath, 'fileAdded', file.size);
  }

  /**
   * Remove file from folder (update metadata)
   *
   * @param databaseName - Database name
   * @param path - Folder path
   * @param fileName - File name
   */
  removeFileFromFolder(databaseName: string, path: string, fileName: string, fileSize?: number): void {
    const validation = validatePath(path);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const normalizedPath = validation.normalized!;
    const root = this.databases.get(databaseName);
    if (!root) {
      throw new Error('Database not found');
    }

    const folder = normalizedPath === '/' ? root : this.findFolder(root, normalizedPath);
    if (!folder) {
      throw new Error('Folder not found');
    }

    // Get file size from stored files
    const actualFileSize = fileSize || folder.files.get(fileName) || 0;

    // Remove file from map
    folder.files.delete(fileName);

    // Update folder metadata
    folder.metadata.fileCount = Math.max(0, folder.metadata.fileCount - 1);
    folder.metadata.totalSize = Math.max(0, folder.metadata.totalSize - actualFileSize);
    folder.metadata.lastModified = Date.now();

    // Update parent metadata
    this.updateParentMetadata(databaseName, normalizedPath, 'fileRemoved', actualFileSize);
  }

  /**
   * Clear database hierarchy (for testing/cleanup)
   *
   * @param databaseName - Database name
   */
  clearDatabase(databaseName: string): void {
    this.databases.delete(databaseName);
  }

  /**
   * Serialize hierarchy to object (for CBOR encoding by S5)
   */
  serialize(databaseName: string): any {
    const root = this.databases.get(databaseName);
    if (!root) {
      return { version: 1, folders: {} };
    }

    return {
      version: 1,
      folders: this.serializeNode(root)
    };
  }

  /**
   * Deserialize hierarchy from object (CBOR decoded by S5)
   */
  deserialize(databaseName: string, data: any): void {
    try {
      const root = this.getOrCreateRoot(databaseName);

      if (data.folders) {
        this.deserializeNode(root, data.folders);
      }
    } catch (error) {
      throw new Error(`Failed to deserialize hierarchy: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get or create database root
   * @private
   */
  private getOrCreateRoot(databaseName: string): FolderNode {
    let root = this.databases.get(databaseName);
    if (!root) {
      const now = Date.now();
      root = {
        name: '',
        path: '/',
        type: 'folder',
        metadata: {
          createdAt: now,
          lastModified: now,
          fileCount: 0,
          folderCount: 0,
          totalSize: 0
        },
        children: new Map(),
        files: new Map()
      };
      this.databases.set(databaseName, root);
    }
    return root;
  }

  /**
   * Find a folder by path
   * @private
   */
  private findFolder(root: FolderNode, path: string): FolderNode | null {
    if (path === '/') {
      return root;
    }

    const parts = path.split('/').filter(p => p.length > 0);
    let current: FolderNode | null = root;

    for (const part of parts) {
      if (!current) {
        return null;
      }
      current = current.children.get(part) || null;
    }

    return current;
  }

  /**
   * Update parent metadata after folder changes
   * @private
   */
  private updateParentMetadata(databaseName: string, folderPath: string, change: 'folderAdded' | 'folderRemoved' | 'fileAdded' | 'fileRemoved' | 'sizeChanged', sizeChange?: number): void {
    const ancestors = getAncestorPaths(folderPath);
    const root = this.databases.get(databaseName);

    if (!root) {
      return;
    }

    const now = Date.now();

    for (const ancestorPath of ancestors) {
      const ancestor = this.findFolder(root, ancestorPath);
      if (ancestor) {
        ancestor.metadata.lastModified = now;

        if (change === 'folderAdded') {
          ancestor.metadata.folderCount++;
        } else if (change === 'folderRemoved') {
          ancestor.metadata.folderCount = Math.max(0, ancestor.metadata.folderCount - 1);
        }
        // Note: fileCount and totalSize are NOT propagated to parents
        // They are calculated recursively when needed via getRecursiveCounts
      }
    }
  }

  /**
   * Update child paths recursively after move/rename
   * @private
   */
  private updateChildPaths(folder: FolderNode, newParentPath: string): void {
    for (const child of folder.children.values()) {
      child.path = `${newParentPath}/${child.name}`;
      this.updateChildPaths(child, child.path);
    }
  }

  /**
   * Get recursive counts for folder
   * @private
   */
  private getRecursiveCounts(folder: FolderNode): { fileCount: number; folderCount: number; totalSize: number } {
    let fileCount = folder.metadata.fileCount;
    let folderCount = folder.children.size;
    let totalSize = folder.metadata.totalSize;

    for (const child of folder.children.values()) {
      const childCounts = this.getRecursiveCounts(child);
      fileCount += childCounts.fileCount;
      folderCount += childCounts.folderCount;
      totalSize += childCounts.totalSize;
    }

    return { fileCount, folderCount, totalSize };
  }

  /**
   * Serialize folder node
   * @private
   */
  private serializeNode(node: FolderNode): any {
    const obj: any = {
      name: node.name,
      path: node.path,
      metadata: node.metadata,
      children: {},
      files: Object.fromEntries(node.files)  // Convert Map to object
    };

    for (const [name, child] of node.children.entries()) {
      obj.children[name] = this.serializeNode(child);
    }

    return obj;
  }

  /**
   * Deserialize folder node
   * @private
   */
  private deserializeNode(parent: FolderNode, data: any): void {
    if (data.children) {
      for (const [name, rawChildData] of Object.entries(data.children)) {
        const childData = rawChildData as any;
        const child: FolderNode = {
          name: childData.name,
          path: childData.path,
          type: 'folder',
          metadata: childData.metadata,
          children: new Map(),
          files: new Map()
        };

        // Restore files map if it exists
        if (childData.files) {
          for (const [fileName, fileSize] of Object.entries(childData.files)) {
            child.files.set(fileName, fileSize as number);
          }
        }

        parent.children.set(name, child);
        this.deserializeNode(child, childData);
      }
    }
  }

  /**
   * Format size in human-readable units
   * @private
   */
  private formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}
