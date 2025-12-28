/**
 * Document Text Extractors
 * Browser-compatible text extraction for various document formats
 * Max 300 lines
 */

import type { DocumentType, ExtractionResult } from './types.js';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker for browser environment
// Text extraction works without canvas - canvas is only needed for rendering
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

/**
 * Extract text from a file
 *
 * @param file - File to extract text from
 * @param type - Document type
 * @returns Extraction result with text and metadata
 */
export async function extractText(
  file: File,
  type: DocumentType
): Promise<ExtractionResult> {
  const startTime = Date.now();

  let text: string;

  switch (type) {
    case 'pdf':
      text = await extractFromPDF(file);
      break;
    case 'docx':
      throw new Error('DOCX processing is not supported in this environment. Please use .txt, .md, or .html files.');
    case 'txt':
    case 'md':
      text = await extractFromPlainText(file);
      break;
    case 'html':
      text = await extractFromHTML(file);
      break;
    default:
      throw new Error(`Unsupported document type: ${type}`);
  }

  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;

  return {
    text,
    metadata: {
      extractedAt: Date.now(),
      characterCount: text.length,
      wordCount
    }
  };
}

// DOCX extraction requires mammoth.js which has server-side dependencies
// For DOCX processing, implement a separate backend endpoint or use mammoth in Node.js

/**
 * Extract text from plain text file
 *
 * @param file - Text file
 * @returns Extracted text
 */
async function extractFromPlainText(file: File): Promise<string> {
  try {
    const text = await file.text();
    return text;
  } catch (error) {
    throw new Error(`Failed to extract text: ${(error as Error).message}`);
  }
}

/**
 * Extract text from HTML file
 *
 * @param file - HTML file
 * @returns Extracted text (HTML tags removed)
 */
async function extractFromHTML(file: File): Promise<string> {
  try {
    const html = await file.text();

    // Remove HTML tags and extract text content
    // Use DOMParser in browser, regex as fallback
    if (typeof DOMParser !== 'undefined') {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      return doc.body.textContent || '';
    } else {
      // Fallback: simple regex-based HTML stripping
      return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
  } catch (error) {
    throw new Error(`Failed to extract text from HTML: ${(error as Error).message}`);
  }
}

/**
 * Sanitize text to remove invalid Unicode characters
 * Removes lone surrogates, null bytes, and other problematic characters
 * that cause JSON serialization to fail
 *
 * @param text - Raw text that may contain invalid characters
 * @returns Sanitized text safe for JSON serialization
 */
function sanitizeText(text: string): string {
  // Remove lone surrogates (unpaired high/low surrogates)
  // High surrogates: \uD800-\uDBFF, Low surrogates: \uDC00-\uDFFF
  // A lone surrogate is a high surrogate not followed by a low surrogate,
  // or a low surrogate not preceded by a high surrogate
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);

    // Check if this is a high surrogate
    if (code >= 0xD800 && code <= 0xDBFF) {
      // Check if next char is a low surrogate
      if (i + 1 < text.length) {
        const nextCode = text.charCodeAt(i + 1);
        if (nextCode >= 0xDC00 && nextCode <= 0xDFFF) {
          // Valid surrogate pair - keep both
          result += text[i] + text[i + 1];
          i++; // Skip the next character
          continue;
        }
      }
      // Lone high surrogate - replace with replacement character
      result += '\uFFFD';
      continue;
    }

    // Check if this is a lone low surrogate
    if (code >= 0xDC00 && code <= 0xDFFF) {
      // Lone low surrogate - replace with replacement character
      result += '\uFFFD';
      continue;
    }

    // Remove null bytes and other control characters (except newline, tab, carriage return)
    if (code === 0 || (code < 32 && code !== 9 && code !== 10 && code !== 13)) {
      continue;
    }

    result += text[i];
  }

  return result;
}

/**
 * Extract text from PDF file using pdfjs-dist
 * Text-only extraction (no canvas required)
 *
 * @param file - PDF file
 * @returns Extracted text from all pages
 */
async function extractFromPDF(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const textParts: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      textParts.push(pageText);
    }

    const rawText = textParts.join('\n\n');

    // Sanitize text to remove invalid Unicode characters
    // PDFs can contain malformed surrogates that break JSON serialization
    return sanitizeText(rawText);
  } catch (error) {
    throw new Error(`Failed to extract text from PDF: ${(error as Error).message}`);
  }
}

/**
 * Detect document type from file name
 *
 * @param fileName - File name with extension
 * @returns Document type
 */
export function detectDocumentType(fileName: string): DocumentType {
  const ext = fileName.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'txt':
      return 'txt';
    case 'md':
    case 'markdown':
      return 'md';
    case 'html':
    case 'htm':
      return 'html';
    case 'pdf':
      return 'pdf';
    case 'docx':
      return 'docx';
    default:
      throw new Error(`Unsupported file format: ${ext}`);
  }
}

/**
 * Validate file size (max 50MB)
 *
 * @param file - File to validate
 */
export function validateFileSize(file: File): void {
  const MAX_SIZE = 50 * 1024 * 1024; // 50MB

  if (file.size === 0) {
    throw new Error('File is empty');
  }

  if (file.size > MAX_SIZE) {
    throw new Error(`File size exceeds maximum (50MB): ${file.size} bytes`);
  }
}

/**
 * Extract text from ArrayBuffer (for S5-stored documents)
 *
 * @param buffer - ArrayBuffer containing document data
 * @param type - Document type
 * @param fileName - Original file name
 * @returns Extraction result
 */
export async function extractTextFromBuffer(
  buffer: ArrayBuffer,
  type: DocumentType,
  fileName: string
): Promise<ExtractionResult> {
  // Convert ArrayBuffer to File object
  const blob = new Blob([buffer]);
  const file = new File([blob], fileName, {
    type: getMimeType(type)
  });

  return extractText(file, type);
}

/**
 * Get MIME type for document type
 *
 * @param type - Document type
 * @returns MIME type
 */
function getMimeType(type: DocumentType): string {
  switch (type) {
    case 'txt':
      return 'text/plain';
    case 'md':
      return 'text/markdown';
    case 'html':
      return 'text/html';
    case 'pdf':
      return 'application/pdf';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Cache for extracted text (to avoid re-extraction)
 */
class ExtractionCache {
  private cache = new Map<string, ExtractionResult>();
  private maxSize = 100;

  set(documentId: string, result: ExtractionResult): void {
    // Simple LRU: remove oldest if at max size
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(documentId, result);
  }

  get(documentId: string): ExtractionResult | undefined {
    return this.cache.get(documentId);
  }

  has(documentId: string): boolean {
    return this.cache.has(documentId);
  }

  clear(): void {
    this.cache.clear();
  }
}

export const extractionCache = new ExtractionCache();
