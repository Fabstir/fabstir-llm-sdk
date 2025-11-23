'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useWallet } from '@/hooks/use-wallet';
import { Upload, File, X, ArrowLeft, CheckCircle } from 'lucide-react';

interface VectorDatabase {
  id: string;
  name: string;
  description?: string;
  documentCount: number;
  created: number;
  updated: number;
}

interface Document {
  id: string;
  name: string;
  size: number;
  uploaded: number;
  folderPath?: string;
}

/**
 * Upload Documents Page
 *
 * Upload documents to a vector database
 */
export default function UploadDocumentsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isConnected } = useWallet();

  const databaseId = params.id as string;
  const returnTo = searchParams.get('returnTo');
  const folderPath = searchParams.get('folder') || '/';

  const [database, setDatabase] = useState<VectorDatabase | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Load database details
  useEffect(() => {
    if (!isConnected) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const stored = localStorage.getItem('mock_vector_databases');
      if (stored) {
        const databases: VectorDatabase[] = JSON.parse(stored);
        const found = databases.find(db => db.id === databaseId);
        if (found) {
          setDatabase(found);
        } else {
          setError('Database not found');
        }
      } else {
        setError('No databases found');
      }
    } catch (err) {
      console.error('Failed to load database:', err);
      setError('Failed to load database');
    } finally {
      setLoading(false);
    }
  }, [isConnected, databaseId]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    console.debug('[Upload] handleFileSelect called');
    const files = event.target.files;
    console.debug('[Upload] files from event:', files);
    if (files) {
      const fileArray = Array.from(files);
      console.debug('[Upload] Setting selectedFiles to:', fileArray);
      setSelectedFiles(fileArray);
      setError(null);
      setSuccess(false);
    } else {
      console.debug('[Upload] No files in event');
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    console.debug('[Upload] handleUpload called!');
    console.debug('[Upload] selectedFiles.length:', selectedFiles.length);
    console.debug('[Upload] selectedFiles:', selectedFiles);

    if (selectedFiles.length === 0) {
      console.debug('[Upload] ERROR: No files selected');
      setError('Please select at least one file');
      return;
    }

    console.debug('[Upload] Validation passed, starting upload...');

    try {
      setUploading(true);
      setError(null);
      setSuccess(false);

      // Simulate upload delay
      await new Promise(resolve => setTimeout(resolve, 1500));

      console.debug('[Upload] Starting document upload for database:', databaseId);
      console.debug('[Upload] Selected files:', selectedFiles.length, selectedFiles.map(f => f.name));

      // Create mock files with folder support
      const filesKey = `mock_vector_db_files_${databaseId}`;
      const existingFiles = localStorage.getItem(filesKey);
      const currentFiles: Document[] = existingFiles ? JSON.parse(existingFiles) : [];
      console.debug('[Upload] Existing files:', currentFiles.length);

      const newFiles: Document[] = selectedFiles.map(file => ({
        id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        size: file.size,
        uploaded: Date.now(),
        folderPath: folderPath,
      }));
      console.debug('[Upload] New files created:', newFiles.length);

      const updatedFiles = [...currentFiles, ...newFiles];
      console.debug('[Upload] Total files after upload:', updatedFiles.length);
      console.debug('[Upload] Saving to localStorage with key:', filesKey);
      localStorage.setItem(filesKey, JSON.stringify(updatedFiles));

      // Verify it was saved
      const verification = localStorage.getItem(filesKey);
      console.debug('[Upload] Verification - files saved:', verification ? JSON.parse(verification).length : 0);

      // Update database document count
      const stored = localStorage.getItem('mock_vector_databases');
      if (stored) {
        const databases: VectorDatabase[] = JSON.parse(stored);
        const updated = databases.map(db =>
          db.id === databaseId
            ? { ...db, documentCount: updatedFiles.length, updated: Date.now() }
            : db
        );
        localStorage.setItem('mock_vector_databases', JSON.stringify(updated));
        console.debug('[Upload] Updated database document count to:', updatedFiles.length);

        const updatedDb = updated.find(db => db.id === databaseId);
        if (updatedDb) {
          setDatabase(updatedDb);
        }
      }

      setSuccess(true);
      setSelectedFiles([]);
    } catch (err) {
      console.error('Failed to upload documents:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload documents');
    } finally {
      setUploading(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Connect Your Wallet</h2>
          <p className="text-muted-foreground mb-6">
            Please connect your wallet to upload documents
          </p>
          <Link href="/" className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 inline-block">
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (error && !database) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Database Not Found</h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Link href="/vector-databases" className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 inline-block">
            Back to Databases
          </Link>
        </div>
      </div>
    );
  }

  if (!database) {
    return null;
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <Link
          href={`/vector-databases/${databaseId}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {database.name}
        </Link>

        <h1 className="text-3xl font-bold tracking-tight mb-2">Upload Documents</h1>
        <p className="text-muted-foreground">
          Upload documents to {database.name}. Supported formats: PDF, TXT, MD, DOCX
        </p>
        <p className="text-sm text-gray-600 mt-2">
          Files will be uploaded to: <span className="font-mono font-medium">{folderPath === '/' ? 'All Files (root)' : folderPath}</span>
        </p>
      </div>

      {/* Success Message */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-md p-4 flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <div>
            <p className="font-medium text-green-900">Upload successful!</p>
            <p className="text-sm text-green-700">Your documents have been processed and embedded.</p>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Upload Area */}
      <div className="bg-white rounded-lg border p-8">
        <label className="cursor-pointer block">
          <input
            type="file"
            multiple
            accept=".pdf,.txt,.md,.docx"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="text-center">
            <div className="mx-auto w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-4 transition-all hover:bg-blue-100">
              <Upload className="h-12 w-12 text-blue-600" />
            </div>

            <h3 className="text-lg font-semibold mb-2">Choose files to upload</h3>
            <p className="text-sm text-gray-600 mb-6">
              Click anywhere or select button below to choose documents
            </p>

            <span className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors inline-block font-medium">
              Select Files
            </span>

            <p className="mt-4 text-xs text-gray-500">
              Supported formats: PDF, TXT, MD, DOCX (Max 10MB per file)
            </p>
          </div>
        </label>

        {/* Selected Files */}
        {selectedFiles.length > 0 && (
          <div className="mt-8 space-y-3">
            <h4 className="font-medium">Selected Files ({selectedFiles.length})</h4>
            {selectedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
              >
                <div className="flex items-center gap-3">
                  <File className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="font-medium text-sm">{file.name}</p>
                    <p className="text-xs text-gray-500">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleRemoveFile(index)}
                  className="text-gray-400 hover:text-red-600 transition-colors"
                  disabled={uploading}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            ))}

            <div className="flex gap-3 pt-4">
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {uploading ? 'Uploading...' : 'Upload Documents'}
              </button>
              <button
                onClick={() => setSelectedFiles([])}
                disabled={uploading}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Info Panel */}
      <div className="rounded-lg border bg-card p-6">
        <h3 className="font-semibold mb-3">How Document Upload Works</h3>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            1. <strong>Upload:</strong> Your documents are securely uploaded to S5 decentralized storage
          </p>
          <p>
            2. <strong>Processing:</strong> Documents are chunked into smaller segments for efficient retrieval
          </p>
          <p>
            3. <strong>Embedding:</strong> Each chunk is converted to vector embeddings using AI models
          </p>
          <p>
            4. <strong>Storage:</strong> Embeddings are stored in your vector database for semantic search
          </p>
          <p>
            5. <strong>RAG:</strong> When you chat, relevant chunks are automatically retrieved to enhance AI responses
          </p>
        </div>
      </div>
    </div>
  );
}
