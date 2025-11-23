/**
 * Embedding Generation Utilities
 *
 * Utilities for generating embeddings via host node's /v1/embed endpoint
 * and storing them in S5VectorStore.
 */

/**
 * Chunk text into smaller pieces for embedding generation
 *
 * @param text - Full document text
 * @param chunkSize - Max characters per chunk (default: 1000)
 * @param overlap - Characters to overlap between chunks (default: 200)
 * @returns Array of text chunks
 */
export function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end);

    // Only add non-empty chunks
    if (chunk.trim().length > 0) {
      chunks.push(chunk);
    }

    // Move start position, accounting for overlap
    start += chunkSize - overlap;
  }

  return chunks;
}

/**
 * Call host's /v1/embed endpoint to generate embeddings
 *
 * @param hostUrl - Host node URL (e.g., "http://81.150.166.91:8080")
 * @param texts - Array of texts to embed (max 96 texts, max 8192 chars each)
 * @param chainId - Blockchain chain ID (default: 84532 for Base Sepolia)
 * @returns Embedding results with vectors
 */
export async function generateEmbeddings(
  hostUrl: string,
  texts: string[],
  chainId: number = 84532
): Promise<{
  embeddings: Array<{
    embedding: number[];
    text: string;
    tokenCount: number;
  }>;
  model: string;
  totalTokens: number;
}> {
  // Validate inputs
  if (texts.length === 0) {
    throw new Error('No texts provided for embedding generation');
  }
  if (texts.length > 96) {
    throw new Error(`Too many texts: ${texts.length} (max 96 per request)`);
  }

  // Validate text lengths
  for (let i = 0; i < texts.length; i++) {
    if (texts[i].length > 8192) {
      throw new Error(`Text ${i} too long: ${texts[i].length} chars (max 8192)`);
    }
    if (texts[i].trim().length === 0) {
      throw new Error(`Text ${i} is empty or whitespace-only`);
    }
  }

  // Construct endpoint URL
  const embedUrl = `${hostUrl}/v1/embed`;

  console.debug(`[EmbeddingUtils] Calling ${embedUrl} with ${texts.length} texts`);

  // Make HTTP POST request
  const response = await fetch(embedUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      texts: texts,
      model: 'all-MiniLM-L6-v2',
      chainId: chainId,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding generation failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const result = await response.json();

  // Validate response
  if (!result.embeddings || !Array.isArray(result.embeddings)) {
    throw new Error('Invalid response: missing embeddings array');
  }

  // Validate embedding dimensions (should be 384)
  for (let i = 0; i < result.embeddings.length; i++) {
    const embedding = result.embeddings[i].embedding;
    if (!Array.isArray(embedding) || embedding.length !== 384) {
      throw new Error(`Invalid embedding ${i}: expected 384 dimensions, got ${embedding?.length || 0}`);
    }
  }

  console.debug(`[EmbeddingUtils] ✅ Generated ${result.embeddings.length} embeddings (${result.totalTokens} tokens)`);

  return result;
}

/**
 * Batch texts into groups of max 96 for API limits
 *
 * @param texts - All text chunks
 * @returns Array of batches, each with max 96 texts
 */
export function batchTexts(texts: string[]): string[][] {
  const batches: string[][] = [];
  const batchSize = 96;

  for (let i = 0; i < texts.length; i += batchSize) {
    batches.push(texts.slice(i, i + batchSize));
  }

  return batches;
}

/**
 * Generate embeddings for a document with automatic chunking and batching
 *
 * @param hostUrl - Host node URL
 * @param documentText - Full document text
 * @param documentId - Document identifier for vector IDs
 * @param chainId - Blockchain chain ID
 * @param metadata - Additional metadata to include with each vector (fileName, fileSize, etc.)
 * @returns Array of vectors ready for S5VectorStore
 */
export async function generateDocumentEmbeddings(
  hostUrl: string,
  documentText: string,
  documentId: string,
  chainId: number = 84532,
  metadata: {
    fileName: string;
    fileSize?: number;
    folderPath?: string;
    createdAt?: number;
  } = { fileName: 'unknown' }
): Promise<Array<{
  id: string;
  vector: number[];
  metadata: {
    text: string;
    chunkIndex: number;
    documentId: string;
    tokenCount: number;
    fileName: string;
    fileSize?: number;
    folderPath?: string;
    createdAt?: number;
  };
}>> {
  // Step 1: Chunk the document
  console.log('🔧 [EmbeddingUtils] Starting embedding generation with metadata:', {
    fileName: metadata.fileName,
    fileSize: metadata.fileSize,
    folderPath: metadata.folderPath,
    documentLength: documentText.length
  });
  console.debug(`[EmbeddingUtils] Chunking document (${documentText.length} chars)...`);
  const chunks = chunkText(documentText, 1000, 200);
  console.debug(`[EmbeddingUtils] Created ${chunks.length} chunks`);

  // Step 2: Batch chunks into groups of 96
  const batches = batchTexts(chunks);
  console.debug(`[EmbeddingUtils] Split into ${batches.length} batches`);

  // Step 3: Generate embeddings for each batch
  const allVectors: Array<{
    id: string;
    vector: number[];
    metadata: {
      text: string;
      chunkIndex: number;
      documentId: string;
      tokenCount: number;
      fileName: string;
      fileSize?: number;
      folderPath?: string;
      createdAt?: number;
    };
  }> = [];

  let chunkIndex = 0;

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    console.debug(`[EmbeddingUtils] Processing batch ${batchIdx + 1}/${batches.length} (${batch.length} chunks)...`);

    const result = await generateEmbeddings(hostUrl, batch, chainId);

    // Convert embeddings to vector format
    for (let i = 0; i < result.embeddings.length; i++) {
      const embedding = result.embeddings[i];
      allVectors.push({
        id: `${documentId}-chunk-${chunkIndex}`,
        vector: embedding.embedding,
        metadata: {
          text: embedding.text,
          chunkIndex: chunkIndex,
          documentId: documentId,
          tokenCount: embedding.tokenCount,
          // CRITICAL: Include fileName and other metadata for UI display
          fileName: metadata.fileName,
          fileSize: metadata.fileSize,
          folderPath: metadata.folderPath || '/',
          createdAt: metadata.createdAt || Date.now(),
        },
      });
      chunkIndex++;
    }
  }

  console.log(`🔧 [EmbeddingUtils] ✅ Generated ${allVectors.length} vectors total. First vector metadata:`, {
    id: allVectors[0]?.id,
    fileName: allVectors[0]?.metadata.fileName,
    fileSize: allVectors[0]?.metadata.fileSize,
    folderPath: allVectors[0]?.metadata.folderPath,
    hasVectorArray: !!allVectors[0]?.vector,
    vectorLength: allVectors[0]?.vector?.length || 0
  });

  return allVectors;
}
