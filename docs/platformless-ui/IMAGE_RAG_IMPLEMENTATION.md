# Image RAG Implementation Guide

Complete guide for implementing image upload and RAG search in the production UI.

**Reference Implementation:** `apps/harness/pages/chat-context-rag-demo.tsx`

## Overview

The SDK now supports uploading images (PNG, JPEG, WebP, GIF) for RAG. Images are processed through:
1. **OCR** (`/v1/ocr`) - Extracts text from images using PaddleOCR
2. **Florence** (`/v1/describe-image`) - Generates visual descriptions of images

Both results are combined, chunked, embedded, and made searchable via RAG.

## Implementation Steps

### 1. Import Required Components

```typescript
import { DocumentManager, HostAdapter } from '@fabstir/sdk-core';
```

### 2. Initialize DocumentManager with HostAdapter

Initialize during wallet connection, after SDK managers are ready:

```typescript
// Get the host URL from session or environment
const hostUrl = process.env.NEXT_PUBLIC_HOST_URL || 'https://your-host:8443';

// Create HostAdapter (handles embeddings AND image processing)
const embeddingService = new HostAdapter({
  hostUrl: hostUrl,
  chainId: 84532,  // Base Sepolia
});

// Create DocumentManager
const documentManager = new DocumentManager({ embeddingService });

// Store in state
setDocumentManager(documentManager);
```

**Important:** When the session starts and you know the actual host URL, update the DocumentManager:

```typescript
// After session starts, update with actual host URL
const actualHostUrl = selectedHost.apiUrl; // e.g., 'https://host1.fabstir.net:8443'
const updatedEmbeddingService = new HostAdapter({
  hostUrl: actualHostUrl,
  chainId: chainId,
});
const updatedDM = new DocumentManager({ embeddingService: updatedEmbeddingService });
setDocumentManager(updatedDM);
```

### 3. Add State Variables

```typescript
// RAG State
const [documentManager, setDocumentManager] = useState<DocumentManager | null>(null);
const [uploadedDocuments, setUploadedDocuments] = useState<Array<{
  id: string;
  name: string;
  chunks: number;
}>>([]);
const [isUploadingDocument, setIsUploadingDocument] = useState(false);
const [uploadProgress, setUploadProgress] = useState<{
  stage: 'reading' | 'chunking' | 'embedding' | 'uploading';
  percent: number;
  message: string;
} | null>(null);
const [uploadError, setUploadError] = useState("");
```

### 4. Convert Chunks to Vectors Helper

The SDK returns `ChunkResult[]` which needs to be converted to the vector format expected by `uploadVectors`:

```typescript
function convertChunksToVectors(chunks: any[]): any[] {
  return chunks.map((chunkResult) => ({
    id: chunkResult.chunk.id,
    vector: chunkResult.embedding, // 384-dimensional array
    metadata: {
      text: chunkResult.chunk.text,
      documentId: chunkResult.chunk.metadata.documentId,
      documentName: chunkResult.chunk.metadata.documentName,
      documentType: chunkResult.chunk.metadata.documentType,
      chunkIndex: chunkResult.chunk.metadata.index,
      startOffset: chunkResult.chunk.metadata.startOffset,
      endOffset: chunkResult.chunk.metadata.endOffset,
    },
  }));
}
```

### 5. Implement File Upload Handler

```typescript
async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
  const file = event.target.files?.[0];
  if (!file) return;

  // Validate DocumentManager
  if (!documentManager) {
    setUploadError("DocumentManager not initialized");
    return;
  }

  // Validate active session
  if (!sessionId || !sessionManager) {
    setUploadError("No active session. Start a chat session first.");
    return;
  }

  setIsUploadingDocument(true);
  setUploadError("");

  try {
    // Validate file type
    const ext = file.name.split(".").pop()?.toLowerCase();
    const validTypes = ["txt", "md", "html", "pdf", "png", "jpg", "jpeg", "webp", "gif"];
    if (!validTypes.includes(ext || "")) {
      throw new Error(`Unsupported file type. Supported: ${validTypes.join(", ")}`);
    }

    // Validate file size (max 5 MB)
    if (file.size > 5 * 1024 * 1024) {
      throw new Error("File size must be less than 5MB");
    }

    // Process document (extract text/OCR, chunk, embed)
    addSystemMessage(`🔄 Processing: ${file.name}...`);

    const chunks = await documentManager.processDocument(file, {
      onProgress: (progress) => {
        setUploadProgress({
          stage: mapStage(progress.stage),
          percent: progress.progress,
          message: `${progress.stage}: ${progress.progress}%`,
        });
      },
    });

    // Handle empty chunks (image with no extractable content)
    if (!chunks || chunks.length === 0) {
      addSystemMessage(`⚠️ No content found in ${file.name}`);
      setUploadedDocuments(prev => [...prev, {
        id: `doc-${Date.now()}`,
        name: file.name,
        chunks: 0,
      }]);
      return;
    }

    // Convert and upload vectors to host
    const vectors = convertChunksToVectors(chunks);
    const uploadResult = await sessionManager.uploadVectors(
      sessionId.toString(),
      vectors
    );

    // Update state
    setUploadedDocuments(prev => [...prev, {
      id: chunks[0]?.chunk.metadata.documentId || `doc-${Date.now()}`,
      name: file.name,
      chunks: chunks.length,
    }]);

    addSystemMessage(`✅ Uploaded: ${file.name} (${chunks.length} chunks)`);

  } catch (error: any) {
    setUploadError(error.message);
    addSystemMessage(`❌ Upload failed: ${error.message}`);
  } finally {
    setIsUploadingDocument(false);
    setUploadProgress(null);
    event.target.value = ""; // Reset file input
  }
}
```

### 6. Implement RAG Search Before Sending Messages

Add RAG context retrieval in your `sendMessage` function:

```typescript
async function sendMessage(userMessage: string) {
  let ragContext = "";

  if (documentManager && sessionManager && sessionId) {
    try {
      // Step 1: Embed the user's query
      const embeddingResult = await documentManager.embedText(userMessage, 'query');
      const queryVector = embeddingResult.embedding;

      // Step 2: Search for similar vectors
      const searchResults = await sessionManager.searchVectors(
        sessionId.toString(),
        queryVector,
        3,    // topK - get top 3 most relevant chunks
        0.2   // threshold - similarity threshold (0-1)
      );

      // Step 3: Format RAG context with instructions
      if (searchResults.length > 0) {
        ragContext = buildRagContext(searchResults);
      }
    } catch (error) {
      console.warn("RAG search failed:", error);
      // Continue without RAG context
    }
  }

  // Prepend RAG context to user message
  const fullPrompt = ragContext ? `${ragContext}${userMessage}` : userMessage;

  // Send to LLM...
}
```

### 7. Format RAG Context with Image Instructions

**Critical for image support:** The LLM needs to know that `[Image Description]` sections contain analyzed image content:

```typescript
function buildRagContext(searchResults: any[]): string {
  // IMPORTANT: Include system instruction about image descriptions
  let context = "IMPORTANT: The following context contains information from uploaded documents. ";
  context += "Sections marked [Image Description] contain AI-analyzed descriptions of uploaded images - ";
  context += "use this information to answer questions about those images. ";
  context += "Sections marked [Extracted Text] contain OCR text from images.\n\n";

  context += "Relevant information from uploaded documents:\n\n";

  searchResults.forEach((result, idx) => {
    const text = result.text || result.metadata?.text || 'No text found';
    context += `[Document ${idx + 1}] ${text}\n\n`;
  });

  context += "---\n\n";

  return context;
}
```

### 8. Add File Upload UI Component

```tsx
<div className="border rounded p-4">
  <h3 className="font-semibold mb-2">📚 RAG Document Upload</h3>

  <input
    type="file"
    accept=".txt,.md,.html,.pdf,.png,.jpg,.jpeg,.webp,.gif"
    onChange={handleFileUpload}
    disabled={isUploadingDocument || !sessionId}
    className="block w-full text-sm"
  />

  <span className="text-xs text-gray-500">
    Supported: .txt, .md, .html, .pdf, .png, .jpg, .webp, .gif (max 5MB)
  </span>

  {uploadProgress && (
    <div className="mt-2">
      <div className="w-full bg-gray-200 rounded h-2">
        <div
          className="bg-blue-500 h-2 rounded"
          style={{ width: `${uploadProgress.percent}%` }}
        />
      </div>
      <span className="text-xs">{uploadProgress.message}</span>
    </div>
  )}

  {uploadError && (
    <p className="text-red-500 text-sm mt-1">{uploadError}</p>
  )}

  {uploadedDocuments.length > 0 && (
    <div className="mt-3">
      <h4 className="text-sm font-medium">Uploaded Documents:</h4>
      <ul className="text-sm">
        {uploadedDocuments.map((doc) => (
          <li key={doc.id}>
            {doc.name} ({doc.chunks} chunks)
          </li>
        ))}
      </ul>
    </div>
  )}
</div>
```

## Host Requirements

For image processing to work, the host must have:

1. **PaddleOCR** loaded for `/v1/ocr` endpoint
2. **Florence-2** loaded for `/v1/describe-image` endpoint
3. **Nginx body size** set to at least 10MB: `client_max_body_size 10M;`

## Error Handling

Common errors and their meanings:

| Error | Cause | Solution |
|-------|-------|----------|
| "Failed to fetch" | Request too large or network error | Check Nginx `client_max_body_size` |
| "OCR model not loaded" | PaddleOCR not running on host | Host needs to load OCR model |
| "Florence model not loaded" | Florence-2 not running on host | Host needs to load vision model |
| "No text content found" | Image has no text and no description | Normal for images without text; need Florence for descriptions |

## Testing Checklist

- [ ] Upload text file (.txt) - should create multiple chunks
- [ ] Upload screenshot with text - should extract OCR text
- [ ] Upload AI art image - should get Florence description (if loaded)
- [ ] Ask question about uploaded content - should retrieve via RAG
- [ ] Ask about image content - LLM should use `[Image Description]` context

## Example User Flow

1. User connects wallet and starts session
2. User uploads `screenshot.png` with text
3. SDK extracts text via OCR, chunks it, generates embeddings
4. Vectors uploaded to host's session memory
5. User asks "What's in the screenshot?"
6. SDK embeds query, searches vectors, finds relevant chunk
7. RAG context prepended to prompt with `[Image Description]` section
8. LLM answers using the context
