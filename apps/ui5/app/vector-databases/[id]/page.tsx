'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useWallet } from '@/hooks/use-wallet';
import { useVectorDatabases, type DatabaseMetadata, type Vector } from '@/hooks/use-vector-databases';
import { FolderTree, FolderNode } from '@/components/vector-databases/folder-tree';
import { FileBrowser, FileItem } from '@/components/vector-databases/file-browser';
import { FolderActions } from '@/components/vector-databases/folder-actions';
import { FileDetailsModal } from '@/components/vector-databases/file-details-modal';
import { UploadDocumentModal } from '@/components/vector-databases/upload-document-modal';
import { VectorSearchPanel, SearchResult } from '@/components/vector-databases/vector-search-panel';
import { Database, ArrowLeft, Upload, FolderPlus, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

/**
 * Vector Database Detail Page
 *
 * View database details and manage vectors
 */
export default function VectorDatabaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isConnected } = useWallet();
  const { managers, getDatabase, listVectors, deleteVector, addVectors, addPendingDocument, isInitialized, createFolder, renameFolder, deleteFolder, getAllFoldersWithCounts, searchVectors } = useVectorDatabases();

  const databaseName = decodeURIComponent(params.id as string);

  const [database, setDatabase] = useState<DatabaseMetadata | null>(null);
  const [vectors, setVectors] = useState<Vector[]>([]);
  const [foldersWithCounts, setFoldersWithCounts] = useState<Array<{ path: string; fileCount: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Folder and file management state
  const [selectedPath, setSelectedPath] = useState<string>('/');
  const [folderAction, setFolderAction] = useState<{
    action: 'create' | 'rename' | 'delete';
    folder?: FolderNode | null;
    parentPath?: string;
  } | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // Load database and vectors - useCallback to allow calling from handlers
  // NOTE: managers is NOT in dependency array to avoid infinite loop (it's an object that changes reference)
  // Instead, we check managers availability inside the function
  const loadData = useCallback(async () => {
    // Re-check managers on each call (handles case where managers becomes available)
    if (!isConnected || !isInitialized || !managers) {
      console.log(`[Page] Skipping loadData: isConnected=${isConnected}, isInitialized=${isInitialized}, managers=${!!managers}`);
      return;
    }

    console.log(`[Page] Loading data for database: ${databaseName}`);

    try {
      setIsLoading(true);
      setError(null);

      console.log('[Page] About to call getDatabaseMetadata...');
      // Get database metadata directly from vectorRAGManager
      const vectorRAGManager = managers.vectorRAGManager;
      const db = await vectorRAGManager.getDatabaseMetadata(databaseName);
      console.log('[Page] ✅ getDatabaseMetadata succeeded:', db.databaseName);
      setDatabase(db);

      // Get all vectors from database
      const dbVectors = await vectorRAGManager.listVectors(databaseName);
      console.log('[Page] ✅ listVectors succeeded, count:', dbVectors.length);
      setVectors(dbVectors);

      // Get folders with counts (includes empty folders)
      if (db?.folderStructure) {
        const folders = await vectorRAGManager.getAllFoldersWithCounts(databaseName);
        console.log('[Page] ✅ getAllFoldersWithCounts succeeded, count:', folders.length);
        setFoldersWithCounts(folders);
      }
    } catch (err) {
      console.error('[Page] ❌ Failed to load database:', err);
      setError(err instanceof Error ? err.message : 'Failed to load database');
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, isInitialized, databaseName]); // managers checked in function, not in deps

  // Load data when component mounts or dependencies change
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Build folder tree from folders with counts
  const folderTree = useMemo((): FolderNode[] => {
    if (!database?.folderStructure) return [];

    const pathMap = new Map<string, FolderNode>();

    // Initialize folders from foldersWithCounts (includes empty folders)
    foldersWithCounts.forEach(({ path, fileCount }) => {
      if (path === '/') return;

      const parts = path.split('/').filter(Boolean);
      let currentPath = '';

      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;

        if (!pathMap.has(currentPath)) {
          pathMap.set(currentPath, {
            id: currentPath,
            name: part,
            path: currentPath,
            children: [],
            fileCount: 0,
          });
        }
      });

      // Set file count for the final folder
      const folder = pathMap.get(path);
      if (folder) {
        folder.fileCount = fileCount;
      }
    });

    // Build tree structure
    const rootFolders: FolderNode[] = [];
    pathMap.forEach((folder) => {
      const parentPath = folder.path.substring(0, folder.path.lastIndexOf('/')) || '/';
      if (parentPath === '/') {
        rootFolders.push(folder);
      } else {
        const parent = pathMap.get(parentPath);
        if (parent) {
          parent.children.push(folder);
        }
      }
    });

    return rootFolders;
  }, [foldersWithCounts, database?.folderStructure]);

  // Convert vectors + pending/ready documents to FileItem format (Sub-phase 6.1)
  const fileItems = useMemo((): FileItem[] => {
    const items: FileItem[] = [];

    // Add ready documents from vectors
    const vectorsByDoc = new Map<string, Vector[]>();
    vectors.forEach((vector) => {
      const fileName = vector.metadata?.fileName || vector.id;
      if (!vectorsByDoc.has(fileName)) {
        vectorsByDoc.set(fileName, []);
      }
      vectorsByDoc.get(fileName)!.push(vector);
    });

    // Create FileItems from grouped vectors (ready documents)
    vectorsByDoc.forEach((docVectors, fileName) => {
      const firstVector = docVectors[0];
      items.push({
        id: firstVector.id,
        name: fileName,
        size: docVectors.reduce((sum, v) => sum + v.values.length * 4, 0),
        uploaded: firstVector.metadata?.createdAt || Date.now(),
        folderPath: firstVector.metadata?.folderPath || '/',
        vectorCount: docVectors.length,
        embeddingStatus: 'ready',
      });
    });

    // Add pending documents from database metadata
    if (database?.pendingDocuments) {
      database.pendingDocuments.forEach((doc: any) => {
        items.push({
          id: doc.id,
          name: doc.fileName,
          size: doc.fileSize || 0,
          uploaded: doc.createdAt || Date.now(),
          folderPath: doc.folderPath || '/',
          vectorCount: 0,
          embeddingStatus: doc.embeddingStatus || 'pending',
          embeddingProgress: doc.embeddingProgress,
          embeddingError: doc.embeddingError,
        });
      });
    }

    return items;
  }, [vectors, database]);

  const handleDeleteVector = async (vectorId: string) => {
    try {
      await deleteVector(databaseName, vectorId);
      await loadData(); // Refresh
    } catch (err) {
      console.error('Failed to delete vector:', err);
      alert('Failed to delete vector');
    }
  };

  // Folder action handlers
  const handleFolderAction = (action: 'create' | 'rename' | 'delete', folder: FolderNode) => {
    setFolderAction({ action, folder });
  };

  const handleFolderConfirm = async (folderName: string, path?: string) => {
    if (!folderAction) return;

    try {
      if (folderAction.action === 'create') {
        // Create new folder at parent path
        const parentPath = path || folderAction.parentPath || '/';
        const fullPath = parentPath === '/' ? `/${folderName}` : `${parentPath}/${folderName}`;
        await createFolder(databaseName, fullPath);
        console.log('Created folder:', fullPath);
      } else if (folderAction.action === 'rename' && folderAction.folder) {
        // Rename existing folder
        const oldPath = folderAction.folder.path;
        const parentPath = oldPath.split('/').slice(0, -1).join('/') || '/';
        const newPath = parentPath === '/' ? `/${folderName}` : `${parentPath}/${folderName}`;
        const updatedCount = await renameFolder(databaseName, oldPath, newPath);
        console.log(`Renamed folder ${oldPath} to ${newPath} (${updatedCount} vectors updated)`);
      } else if (folderAction.action === 'delete' && folderAction.folder) {
        // Delete folder and all its contents
        const deletedCount = await deleteFolder(databaseName, folderAction.folder.path);
        console.log(`Deleted folder ${folderAction.folder.path} (${deletedCount} vectors removed)`);
      }

      setFolderAction(null);
      await loadData(); // Reload to reflect changes
    } catch (err) {
      console.error('Failed to perform folder action:', err);
      alert(err instanceof Error ? err.message : 'Failed to perform folder action');
    }
  };

  // File handlers
  const handleFileClick = (file: FileItem) => {
    setSelectedFile(file);
  };

  // Sub-phase 6.3: Retry failed document embedding
  const handleFileRetry = async (file: FileItem) => {
    // Show message - actual retry logic would require an active session
    alert(
      `Retry embedding for "${file.name}"?\n\n` +
      `To regenerate embeddings for this document:\n` +
      `1. Start a chat session in a linked session group\n` +
      `2. Embeddings will be generated automatically for all pending/failed documents\n\n` +
      `Note: Individual document retry will be available in future updates.`
    );

    // TODO: In future, implement single-document retry
    // This would require:
    // 1. Active session check (if no session, show "Start session first" message)
    // 2. Reset document status to 'pending'
    // 3. Trigger embedding generation for this specific document
    // 4. Update progress UI
  };

  const handleFileDelete = async (fileId: string) => {
    await handleDeleteVector(fileId);
  };

  // Upload handler
  const handleUploadDocuments = async (files: File[], folderPath?: string) => {
    console.log('[Page] 🚀 DEFERRED EMBEDDINGS: handleUploadDocuments called with:', { fileCount: files.length, folderPath });

    if (!managers) {
      console.error('[Page] ❌ Cannot upload - managers not initialized');
      return;
    }

    const storageManager = managers.storageManager;
    const s5 = storageManager?.s5Client;

    if (!s5) {
      console.error('[Page] ❌ Cannot upload - S5 storage not initialized');
      return;
    }

    // Upload each document to S5 storage WITHOUT generating embeddings
    for (const file of files) {
      try {
        console.log(`[Page] 📄 Uploading document to S5: ${file.name}`);

        // Read file content
        const fileContent = await file.text();

        // Generate unique document ID
        const documentId = `${file.name}-${Date.now()}`;

        // Upload document content to S5
        const { uploadDocumentToS5 } = await import('@/lib/s5-utils');
        const s5Cid = await uploadDocumentToS5(s5, fileContent, databaseName, documentId);

        console.log(`[Page] ✅ Document uploaded to S5: ${s5Cid}`);

        // Create DocumentMetadata with "pending" embedding status
        const docMetadata: import('@/hooks/use-vector-databases').DocumentMetadata = {
          id: documentId,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          folderPath: folderPath || selectedPath,
          s5Cid: s5Cid,
          createdAt: Date.now(),
          embeddingStatus: 'pending',
          embeddingProgress: 0
        };

        // Add to pendingDocuments array (no vector generation)
        await addPendingDocument(databaseName, docMetadata);

        console.log(`[Page] ✅ Document metadata saved with status: pending`);
      } catch (error) {
        console.error(`[Page] ❌ Failed to upload ${file.name}:`, error);
      }
    }

    // Reload data to show new documents with "pending embeddings" badge
    await loadData();
    console.log('[Page] ✅ DEFERRED EMBEDDINGS: Upload complete - documents shown with "pending" status');
  };

  // Vector search handler
  const handleVectorSearch = async (queryVector: number[], k?: number, threshold?: number): Promise<SearchResult[]> => {
    return await searchVectors(databaseName, queryVector, k, threshold);
  };

  // Not connected state
  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Database className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Not Connected</h2>
          <p className="text-gray-600">Please connect your wallet to view this database</p>
        </div>
      </div>
    );
  }

  // SDK initialization check - wait for SDK to be ready
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Initializing...</p>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-purple-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Error state
  if (error || !database) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <Link
          href="/vector-databases"
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Databases
        </Link>

        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <Database className="h-12 w-12 text-red-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Database Not Found</h3>
          <p className="text-gray-600">{error || 'The requested database could not be found'}</p>
        </div>
      </div>
    );
  }

  // Format storage size
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Back Button */}
      <Link
        href="/vector-databases"
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Databases
      </Link>

      {/* Database Header */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 rounded-lg">
              <Database className="h-8 w-8 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{database.databaseName}</h1>
              {database.description && (
                <p className="text-gray-600 mt-1">{database.description}</p>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-6">
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Vectors</p>
            <p className="text-2xl font-bold text-gray-900">{database.vectorCount.toLocaleString()}</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Dimensions</p>
            <p className="text-2xl font-bold text-gray-900">{database.dimensions}</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Storage</p>
            <p className="text-2xl font-bold text-gray-900">{formatSize(database.storageSizeBytes)}</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Last Updated</p>
            <p className="text-xl font-bold text-gray-900">
              {formatDistanceToNow(database.lastAccessedAt, { addSuffix: true })}
            </p>
          </div>
        </div>
      </div>

      {/* Sub-phase 6.2: Info Banner for Pending Documents */}
      {database.pendingDocuments && database.pendingDocuments.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-yellow-900 mb-1">
                {database.pendingDocuments.length} {database.pendingDocuments.length === 1 ? 'document' : 'documents'} pending embeddings
              </h3>
              <p className="text-sm text-yellow-800">
                Start a chat session to generate embeddings for these documents and enable semantic search.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Vector Search Panel */}
      <VectorSearchPanel
        databaseName={database.databaseName}
        dimensions={database.dimensions || 384}
        onSearch={handleVectorSearch}
      />

      {/* Vectors Section with Folder Tree and File Browser */}
      <div className="bg-white rounded-lg border">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Documents ({database.vectorCount.toLocaleString()})
            </h2>
            <div className="flex items-center gap-2">
              {database.folderStructure && (
                <button
                  onClick={() => setFolderAction({ action: 'create', parentPath: selectedPath })}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm"
                >
                  <FolderPlus className="h-4 w-4" />
                  New Folder
                </button>
              )}
              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors text-sm"
              >
                <Upload className="h-4 w-4" />
                Upload Documents
              </button>
            </div>
          </div>
        </div>

        {database.folderStructure ? (
          <div className="grid grid-cols-12 divide-x divide-gray-200" style={{ height: '600px' }}>
            {/* Folder Tree (Left Sidebar) */}
            <div className="col-span-3 overflow-auto p-4">
              <div className="mb-4">
                <button
                  onClick={() => setSelectedPath('/')}
                  className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                    selectedPath === '/' ? 'bg-blue-50 text-blue-900' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium">Root</span>
                  </div>
                </button>
              </div>
              <FolderTree
                folders={folderTree}
                selectedPath={selectedPath}
                onFolderSelect={setSelectedPath}
                onFolderAction={handleFolderAction}
              />
            </div>

            {/* File Browser (Right Panel) */}
            <div className="col-span-9">
              <FileBrowser
                files={fileItems}
                currentPath={selectedPath}
                onFileClick={handleFileClick}
                onFileDelete={handleFileDelete}
                onFileRetry={handleFileRetry}
              />
            </div>
          </div>
        ) : (
          // Simple file list (no folder structure)
          <div style={{ height: '600px' }}>
            <FileBrowser
              files={fileItems}
              currentPath="/"
              onFileClick={handleFileClick}
              onFileDelete={handleFileDelete}
              onFileRetry={handleFileRetry}
            />
          </div>
        )}
      </div>

      {/* Modals */}
      <FolderActions
        isOpen={folderAction !== null}
        onClose={() => setFolderAction(null)}
        action={folderAction?.action || 'create'}
        folder={folderAction?.folder}
        parentPath={folderAction?.parentPath}
        onConfirm={handleFolderConfirm}
      />

      <FileDetailsModal
        isOpen={selectedFile !== null}
        onClose={() => setSelectedFile(null)}
        file={selectedFile}
      />

      <UploadDocumentModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        databaseName={database.databaseName}
        onUpload={handleUploadDocuments}
        initialFolderPath={selectedPath}
      />

      {/* Info Panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Database Information</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-600">Owner</p>
            <p className="text-gray-900 font-mono text-xs">{database.owner}</p>
          </div>
          <div>
            <p className="text-gray-600">Created</p>
            <p className="text-gray-900">{new Date(database.created).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-gray-600">Folder Structure</p>
            <p className="text-gray-900">{database.folderStructure ? 'Enabled' : 'Disabled'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
