# Image RAG Integration Guide

## Overview

The SDK now supports **image uploads for RAG** (PNG, JPEG, WebP, GIF). Images are automatically processed through the host's OCR and image description endpoints, then chunked, embedded, and made searchable - just like text documents.

**Key Point: Zero additional code required.** If your UI already supports document upload via `DocumentManager.processDocument()`, images will "just work" when users upload them.

## What Happens When a User Uploads an Image

1. **SDK detects image type** from file extension
2. **Sends to host endpoints** (`/v1/ocr` + `/v1/describe-image`) in parallel
3. **Combines extracted text** with semantic description
4. **Chunks and embeds** the combined text
5. **Stores vectors** for RAG search

The user then asks questions about the image content, and RAG retrieves relevant chunks.

## UI Changes Required

### 1. Update File Input to Accept Images

```tsx
// BEFORE: Text documents only
<input
  type="file"
  accept=".txt,.md,.html,.pdf"
  onChange={handleFileUpload}
/>

// AFTER: Include images
<input
  type="file"
  accept=".txt,.md,.html,.pdf,.png,.jpg,.jpeg,.webp,.gif"
  onChange={handleFileUpload}
/>
```

### 2. Update Help Text

```tsx
// Update the supported formats hint
<span className="text-xs text-gray-500">
  Supported: .txt, .md, .html, .pdf, .png, .jpg, .webp, .gif (max 5MB)
</span>
```

### 3. No Changes to Upload Logic

The existing `processDocument()` call handles images automatically:

```tsx
// This EXISTING code already works for images!
const chunks = await documentManager.processDocument(file, {
  onProgress: (progress) => {
    // progress.currentStep will show:
    // - "Image processed: OCR confidence 95%" (for images)
    // - "Extracted 150 words" (for documents)
    setUploadProgress(progress);
  }
});
```

## Complete Working Example

Reference implementation: `apps/harness/pages/chat-context-rag-demo.tsx`

```tsx
const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  if (!file) return;

  // Validate file type (SDK will also validate, but good for UX)
  const validExtensions = ['txt', 'md', 'html', 'pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif'];
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!ext || !validExtensions.includes(ext)) {
    setError('Unsupported file type');
    return;
  }

  // Validate file size
  if (file.size > 5 * 1024 * 1024) {
    setError('File too large (max 5MB)');
    return;
  }

  try {
    // Process document - works for BOTH text documents AND images
    const chunks = await documentManager.processDocument(file, {
      onProgress: (progress) => {
        console.log(`${progress.stage}: ${progress.currentStep}`);
        setUploadProgress({ stage: progress.stage, percent: progress.progress });
      }
    });

    // Convert chunks to vectors for storage
    const vectors = chunks.map((chunkResult) => ({
      id: chunkResult.chunk.id,
      vector: chunkResult.embedding,
      metadata: {
        text: chunkResult.chunk.text,
        documentId: chunkResult.chunk.metadata.documentId,
        documentName: chunkResult.chunk.metadata.documentName,
        documentType: chunkResult.chunk.metadata.documentType,
        chunkIndex: chunkResult.chunk.metadata.index,
      },
    }));

    // Upload vectors to session
    const result = await sessionManager.uploadVectors(sessionId, vectors);
    console.log(`Uploaded ${result.uploaded} vectors`);

  } catch (error) {
    setError(error.message);
  }
};
```

## Supported Formats

| Format | Extension | Processing |
|--------|-----------|------------|
| PNG | `.png` | OCR + Description |
| JPEG | `.jpg`, `.jpeg` | OCR + Description |
| WebP | `.webp` | OCR + Description |
| GIF | `.gif` | OCR + Description (first frame) |
| Plain Text | `.txt` | Direct text extraction |
| Markdown | `.md` | Direct text extraction |
| HTML | `.html` | Tag stripping + text |
| PDF | `.pdf` | Client-side pdfjs extraction |

## Error Handling

The SDK provides clear error messages:

```tsx
try {
  const chunks = await documentManager.processDocument(file);
} catch (error) {
  // Possible errors:
  // - "Unsupported file format: xyz"
  // - "File too large. Maximum size is 5MB"
  // - "Image processing requires HostAdapter"
  // - "OCR model not loaded on host" (503 from host)
  // - "Image processing failed on host. OCR: [error]. Describe: [error]"

  setError(error.message);
}
```

## Progress Callback Stages

The `onProgress` callback receives different messages for images vs documents:

**For Images:**
```
extracting: "Image processed: OCR confidence 95%"
chunking: "Chunking text"
embedding: "Generating embeddings"
complete: "Processed 1 chunks"
```

**For Documents:**
```
extracting: "Extracted 1,234 words"
chunking: "Chunking text"
embedding: "Generating embeddings"
complete: "Processed 5 chunks"
```

## Best Practices

1. **Show OCR confidence** - Display the confidence percentage to users so they know extraction quality
2. **Preview extracted text** - Consider showing users what text was extracted before adding to RAG
3. **Handle low confidence** - If OCR confidence is below 50%, warn the user results may be unreliable
4. **Image size hints** - Suggest users upload clear, high-resolution images for better OCR

## Testing

1. Upload a screenshot with text (e.g., Notepad++ window)
2. Ask a question about the content
3. Verify RAG retrieves relevant chunks and LLM answers correctly

Expected console output:
```
[RAG DEBUG] Image processed: OCR confidence 95%
[RAG DEBUG] Processed 1 chunks
[RAG DEBUG] Uploaded: 1 Rejected: 0 Errors: []
[RAG] Found 1 relevant chunks
```

## Requirements

- Host node must be running v8.6.0+ with `/v1/ocr` and `/v1/describe-image` endpoints
- SDK must use `HostAdapter` as the embedding service (default for production)
- Maximum file size: 5MB (enforced by SDK)

## Questions?

Reference the working demo at `apps/harness/pages/chat-context-rag-demo.tsx` for a complete implementation.
