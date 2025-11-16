/**
 * S5 Storage Utilities
 *
 * Helper functions for uploading and retrieving documents from S5 storage
 */

/**
 * S5 Client interface (subset of @julesl23/s5js)
 * This represents the s5Client from StorageManager
 */
interface S5Client {
  fs: {
    put(path: string, data: string | Uint8Array, options?: { mediaType?: string; timestamp?: number }): Promise<void>;
    get(path: string): Promise<string | Uint8Array | undefined>;
  };
}

/**
 * Upload document content to S5 storage
 *
 * @param s5 - S5 client instance (from StorageManager.s5Client)
 * @param fileContent - File content (text or binary)
 * @param databaseName - Vector database name
 * @param documentId - Unique document identifier
 * @returns S5 CID (path) for later retrieval
 */
export async function uploadDocumentToS5(
  s5: S5Client,
  fileContent: string | Uint8Array,
  databaseName: string,
  documentId: string
): Promise<string> {
  // Path format: home/vector-databases/{databaseName}/documents/{documentId}.txt
  const path = `home/vector-databases/${databaseName}/documents/${documentId}.txt`;

  await s5.fs.put(path, fileContent);

  return path;
}

/**
 * Retrieve document content from S5 storage
 *
 * @param s5 - S5 client instance (from StorageManager.s5Client)
 * @param s5Cid - S5 CID (path) returned from uploadDocumentToS5
 * @returns Document content (automatically decoded: CBOR → JSON → UTF-8 → raw bytes)
 */
export async function getDocumentFromS5(
  s5: S5Client,
  s5Cid: string
): Promise<string | Uint8Array | undefined> {
  return await s5.fs.get(s5Cid);
}

/**
 * Alias for getDocumentFromS5 - used in deferred embeddings workflow
 *
 * @param s5 - S5 client instance (from StorageManager.s5Client)
 * @param s5Path - S5 path to document
 * @returns Document content as string or Uint8Array
 */
export async function downloadFromS5(
  s5: S5Client,
  s5Path: string
): Promise<string | Uint8Array | undefined> {
  return await getDocumentFromS5(s5, s5Path);
}
