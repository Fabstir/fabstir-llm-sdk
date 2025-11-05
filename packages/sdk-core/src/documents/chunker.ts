/**
 * Document Chunking
 * Smart text chunking with overlap for RAG processing
 * Max 250 lines
 */

import type { DocumentChunk, ChunkingOptions, ChunkMetadata, DocumentType } from './types.js';

/**
 * Default chunking options
 */
const DEFAULT_OPTIONS: Required<ChunkingOptions> = {
  chunkSize: 500, // tokens
  overlap: 50, // tokens
  splitBySentence: false,
  splitByParagraph: false
};

/**
 * Token estimation: 1 word ≈ 1.3 tokens
 * For chunk size of 500 tokens ≈ 385 words
 * For overlap of 50 tokens ≈ 38 words
 */
const WORDS_PER_TOKEN = 0.77; // 1 / 1.3

/**
 * Chunk a document's text into smaller pieces
 *
 * @param text - Text to chunk
 * @param documentId - Document ID
 * @param documentName - Document name
 * @param documentType - Document type
 * @param options - Chunking options
 * @returns Array of document chunks
 */
export function chunkText(
  text: string,
  documentId: string,
  documentName: string,
  documentType: DocumentType,
  options?: ChunkingOptions
): DocumentChunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Validate options
  validateOptions(opts);

  // Convert token counts to word counts
  const chunkWordCount = Math.floor(opts.chunkSize * WORDS_PER_TOKEN);
  const overlapWordCount = Math.floor(opts.overlap * WORDS_PER_TOKEN);

  // Handle short documents
  if (text.length === 0) {
    throw new Error('Cannot chunk empty text');
  }

  const words = text.split(/\s+/).filter(w => w.length > 0);

  if (words.length <= chunkWordCount) {
    // Document is shorter than chunk size, return as single chunk
    return [
      createChunk(text, 0, documentId, documentName, documentType, 0, text.length)
    ];
  }

  // Perform chunking based on strategy
  if (opts.splitByParagraph) {
    return chunkByParagraph(text, documentId, documentName, documentType, chunkWordCount, overlapWordCount);
  } else if (opts.splitBySentence) {
    return chunkBySentence(text, documentId, documentName, documentType, chunkWordCount, overlapWordCount);
  } else {
    return chunkByWords(text, documentId, documentName, documentType, chunkWordCount, overlapWordCount);
  }
}

/**
 * Chunk text by word count with overlap
 */
function chunkByWords(
  text: string,
  documentId: string,
  documentName: string,
  documentType: DocumentType,
  chunkWordCount: number,
  overlapWordCount: number
): DocumentChunk[] {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const chunks: DocumentChunk[] = [];
  let chunkIndex = 0;
  let startWordIdx = 0;

  console.log('[CHUNKER DEBUG] Starting chunkByWords');
  console.log(`[CHUNKER DEBUG] Text length: ${text.length} chars, ${words.length} words`);
  console.log(`[CHUNKER DEBUG] Chunk size: ${chunkWordCount} words, Overlap: ${overlapWordCount} words`);

  let iterationCount = 0;
  while (startWordIdx < words.length) {
    iterationCount++;
    console.log(`[CHUNKER DEBUG] Iteration ${iterationCount}: startWordIdx=${startWordIdx}/${words.length}`);

    // Take chunkWordCount words
    const endWordIdx = Math.min(startWordIdx + chunkWordCount, words.length);
    const chunkWords = words.slice(startWordIdx, endWordIdx);
    const chunkText = chunkWords.join(' ');

    console.log(`[CHUNKER DEBUG] Chunk ${chunkIndex}: ${chunkWords.length} words (${chunkText.length} chars)`);

    // Calculate character offsets
    const approxOffset = startWordIdx === 0 ? 0 : getApproximateOffset(text, startWordIdx);
    console.log(`[CHUNKER DEBUG] Searching for "${chunkWords[0]}" starting at offset ${approxOffset}`);

    const indexOfStart = performance.now();
    let startOffset = text.indexOf(chunkWords[0], approxOffset);
    const indexOfTime = performance.now() - indexOfStart;

    // If word not found from approxOffset, search from beginning
    if (startOffset === -1) {
      console.log(`[CHUNKER DEBUG] Word not found at approxOffset, searching from start`);
      startOffset = text.indexOf(chunkWords[0]);
    }

    // If still not found, use approximate offset as fallback
    if (startOffset === -1) {
      console.log(`[CHUNKER DEBUG] Word still not found, using approxOffset as fallback`);
      startOffset = approxOffset;
    }

    console.log(`[CHUNKER DEBUG] indexOf took ${indexOfTime.toFixed(2)}ms, found at ${startOffset}`);

    const endOffset = startOffset + chunkText.length;

    chunks.push(createChunk(chunkText, chunkIndex, documentId, documentName, documentType, startOffset, endOffset));

    chunkIndex++;

    // Move to next chunk with overlap
    startWordIdx = endWordIdx - overlapWordCount;

    console.log(`[CHUNKER DEBUG] Next startWordIdx: ${startWordIdx}`);

    // If we've reached the end of the document, break
    if (endWordIdx >= words.length) {
      console.log('[CHUNKER DEBUG] Breaking: reached end of document');
      break;
    }

    // If overlap would cause infinite loop (chunk too small), break
    if (startWordIdx >= endWordIdx) {
      console.log('[CHUNKER DEBUG] Breaking: overlap would cause infinite loop');
      break;
    }

    // Safety check to prevent infinite loops
    if (iterationCount > 1000) {
      console.error('[CHUNKER DEBUG] ERROR: Too many iterations (>1000), breaking to prevent hang');
      break;
    }
  }

  console.log(`[CHUNKER DEBUG] Chunking complete: ${chunks.length} chunks created in ${iterationCount} iterations`);
  return chunks;
}

/**
 * Chunk text by sentence boundaries
 */
function chunkBySentence(
  text: string,
  documentId: string,
  documentName: string,
  documentType: DocumentType,
  chunkWordCount: number,
  overlapWordCount: number
): DocumentChunk[] {
  // Split by sentence boundaries
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: DocumentChunk[] = [];
  let chunkIndex = 0;
  let currentChunk: string[] = [];
  let currentWordCount = 0;
  let startOffset = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();
    const sentenceWords = sentence.split(/\s+/).length;

    // Add sentence to current chunk
    currentChunk.push(sentence);
    currentWordCount += sentenceWords;

    // If chunk is large enough, create chunk
    if (currentWordCount >= chunkWordCount || i === sentences.length - 1) {
      const chunkText = currentChunk.join(' ');
      const endOffset = startOffset + chunkText.length;

      chunks.push(createChunk(chunkText, chunkIndex, documentId, documentName, documentType, startOffset, endOffset));

      chunkIndex++;

      // Prepare next chunk with overlap
      const overlapSentences = Math.max(1, Math.floor(overlapWordCount / 10)); // Rough estimate
      currentChunk = currentChunk.slice(-overlapSentences);
      currentWordCount = currentChunk.reduce((sum, s) => sum + s.split(/\s+/).length, 0);
      startOffset = endOffset - currentChunk.join(' ').length;
    }
  }

  return chunks;
}

/**
 * Chunk text by paragraph boundaries
 */
function chunkByParagraph(
  text: string,
  documentId: string,
  documentName: string,
  documentType: DocumentType,
  chunkWordCount: number,
  overlapWordCount: number
): DocumentChunk[] {
  // Split by double newlines (paragraphs)
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
  const chunks: DocumentChunk[] = [];
  let chunkIndex = 0;
  let currentChunk: string[] = [];
  let currentWordCount = 0;
  let startOffset = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i].trim();
    const paragraphWords = paragraph.split(/\s+/).length;

    // Add paragraph to current chunk
    currentChunk.push(paragraph);
    currentWordCount += paragraphWords;

    // If chunk is large enough, create chunk
    if (currentWordCount >= chunkWordCount || i === paragraphs.length - 1) {
      const chunkText = currentChunk.join('\n\n');
      const endOffset = startOffset + chunkText.length;

      chunks.push(createChunk(chunkText, chunkIndex, documentId, documentName, documentType, startOffset, endOffset));

      chunkIndex++;

      // Prepare next chunk with overlap (keep last paragraph)
      if (overlapWordCount > 0 && i < paragraphs.length - 1) {
        currentChunk = [currentChunk[currentChunk.length - 1]];
        currentWordCount = currentChunk[0].split(/\s+/).length;
        startOffset = endOffset - currentChunk[0].length;
      } else {
        currentChunk = [];
        currentWordCount = 0;
        startOffset = endOffset;
      }
    }
  }

  return chunks;
}

/**
 * Create a document chunk with metadata
 */
function createChunk(
  text: string,
  index: number,
  documentId: string,
  documentName: string,
  documentType: DocumentType,
  startOffset: number,
  endOffset: number
): DocumentChunk {
  const chunkId = `${documentId}_chunk_${index}`;

  const metadata: ChunkMetadata = {
    documentId,
    documentName,
    documentType,
    index,
    startOffset,
    endOffset,
    tokenCount: estimateTokens(text)
  };

  return {
    id: chunkId,
    text,
    metadata
  };
}

/**
 * Estimate token count from text
 */
function estimateTokens(text: string): number {
  const words = text.split(/\s+/).filter(w => w.length > 0).length;
  return Math.ceil(words * 1.3); // 1 word ≈ 1.3 tokens
}

/**
 * Get approximate character offset for word index
 */
function getApproximateOffset(text: string, wordIdx: number): number {
  // Rough estimate: average word length is 5 chars + 1 space
  return wordIdx * 6;
}

/**
 * Validate chunking options
 */
function validateOptions(options: Required<ChunkingOptions>): void {
  if (options.chunkSize <= 0) {
    throw new Error('Invalid chunk size: must be greater than 0');
  }

  if (options.overlap < 0) {
    throw new Error('Invalid overlap size: must be non-negative');
  }

  if (options.overlap >= options.chunkSize) {
    throw new Error('Overlap cannot exceed chunk size');
  }
}
