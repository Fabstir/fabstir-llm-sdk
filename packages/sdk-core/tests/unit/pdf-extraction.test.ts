/**
 * PDF Extraction Tests
 * Tests for extractFromPDF() function using pdfjs-dist
 *
 * Sub-phase 7.1: Implement PDF Text Extraction
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pdfjs-dist before importing extractors
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  version: '3.11.174',
  getDocument: vi.fn(),
}));

import { extractText, extractTextFromBuffer, detectDocumentType } from '../../src/documents/extractors';
import * as pdfjsLib from 'pdfjs-dist';

describe('PDF Extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('detectDocumentType', () => {
    it('should detect PDF files correctly', () => {
      expect(detectDocumentType('document.pdf')).toBe('pdf');
      expect(detectDocumentType('report.PDF')).toBe('pdf');
      expect(detectDocumentType('path/to/file.pdf')).toBe('pdf');
    });
  });

  describe('extractText with PDF', () => {
    it('should extract text from single-page PDF', async () => {
      // Mock PDF.js response for single page
      const mockTextContent = {
        items: [
          { str: 'Hello' },
          { str: ' ' },
          { str: 'World' },
          { str: '!' },
        ],
      };

      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue(mockTextContent),
      };

      const mockPdf = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage),
      };

      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdf),
      });

      // Create a mock PDF file
      const pdfContent = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF magic bytes
      const file = new File([pdfContent], 'test.pdf', { type: 'application/pdf' });

      const result = await extractText(file, 'pdf');

      expect(result.text).toBe('Hello   World !');
      expect(result.metadata.wordCount).toBeGreaterThan(0);
      expect(pdfjsLib.getDocument).toHaveBeenCalled();
      expect(mockPdf.getPage).toHaveBeenCalledWith(1);
    });

    it('should extract text from multi-page PDF', async () => {
      // Mock PDF.js response for multiple pages
      const mockPage1TextContent = {
        items: [{ str: 'Page 1 content' }],
      };
      const mockPage2TextContent = {
        items: [{ str: 'Page 2 content' }],
      };
      const mockPage3TextContent = {
        items: [{ str: 'Page 3 content' }],
      };

      const mockPage1 = { getTextContent: vi.fn().mockResolvedValue(mockPage1TextContent) };
      const mockPage2 = { getTextContent: vi.fn().mockResolvedValue(mockPage2TextContent) };
      const mockPage3 = { getTextContent: vi.fn().mockResolvedValue(mockPage3TextContent) };

      const mockPdf = {
        numPages: 3,
        getPage: vi.fn()
          .mockResolvedValueOnce(mockPage1)
          .mockResolvedValueOnce(mockPage2)
          .mockResolvedValueOnce(mockPage3),
      };

      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdf),
      });

      const pdfContent = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
      const file = new File([pdfContent], 'multipage.pdf', { type: 'application/pdf' });

      const result = await extractText(file, 'pdf');

      // Pages should be joined with double newlines
      expect(result.text).toContain('Page 1 content');
      expect(result.text).toContain('Page 2 content');
      expect(result.text).toContain('Page 3 content');
      expect(result.text).toBe('Page 1 content\n\nPage 2 content\n\nPage 3 content');
      expect(mockPdf.getPage).toHaveBeenCalledTimes(3);
    });

    it('should handle corrupted PDF with descriptive error', async () => {
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.reject(new Error('Invalid PDF structure')),
      });

      const pdfContent = new Uint8Array([0x00, 0x00, 0x00, 0x00]); // Invalid content
      const file = new File([pdfContent], 'corrupted.pdf', { type: 'application/pdf' });

      await expect(extractText(file, 'pdf')).rejects.toThrow('Failed to extract text from PDF');
      await expect(extractText(file, 'pdf')).rejects.toThrow('Invalid PDF structure');
    });

    it('should return empty string for PDF with no text (scanned images)', async () => {
      // Mock PDF with empty text content (like a scanned document)
      const mockTextContent = {
        items: [], // No text items
      };

      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue(mockTextContent),
      };

      const mockPdf = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage),
      };

      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdf),
      });

      const pdfContent = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
      const file = new File([pdfContent], 'scanned.pdf', { type: 'application/pdf' });

      const result = await extractText(file, 'pdf');

      expect(result.text).toBe('');
      expect(result.metadata.wordCount).toBe(0);
    });

    it('should handle PDF with mixed content (text and whitespace)', async () => {
      const mockTextContent = {
        items: [
          { str: 'Title' },
          { str: '' },  // Empty string
          { str: '  ' }, // Whitespace
          { str: 'Body text here' },
        ],
      };

      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue(mockTextContent),
      };

      const mockPdf = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage),
      };

      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdf),
      });

      const pdfContent = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
      const file = new File([pdfContent], 'mixed.pdf', { type: 'application/pdf' });

      const result = await extractText(file, 'pdf');

      expect(result.text).toContain('Title');
      expect(result.text).toContain('Body text here');
    });
  });

  describe('extractTextFromBuffer with PDF', () => {
    it('should extract text from PDF ArrayBuffer', async () => {
      const mockTextContent = {
        items: [{ str: 'Buffer PDF content' }],
      };

      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue(mockTextContent),
      };

      const mockPdf = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage),
      };

      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdf),
      });

      const pdfContent = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
      const buffer = pdfContent.buffer;

      const result = await extractTextFromBuffer(buffer, 'pdf', 'document.pdf');

      expect(result.text).toBe('Buffer PDF content');
      expect(result.metadata.wordCount).toBeGreaterThan(0);
    });
  });

  describe('Text Sanitization (Unicode Surrogates)', () => {
    it('should sanitize lone surrogate characters for JSON compatibility', async () => {
      // Create text with a lone high surrogate (invalid Unicode)
      // \uD800 is a high surrogate that should be followed by a low surrogate
      const textWithLoneSurrogate = 'Hello \uD800 World';

      const mockTextContent = {
        items: [{ str: textWithLoneSurrogate }],
      };

      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue(mockTextContent),
      };

      const mockPdf = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage),
      };

      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdf),
      });

      const pdfContent = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
      const file = new File([pdfContent], 'surrogate.pdf', { type: 'application/pdf' });

      const result = await extractText(file, 'pdf');

      // The lone surrogate should be replaced with replacement character
      expect(result.text).toContain('Hello');
      expect(result.text).toContain('World');
      expect(result.text).toContain('\uFFFD'); // Replacement character

      // Verify the text can be serialized to JSON without error
      expect(() => JSON.stringify(result.text)).not.toThrow();
    });

    it('should preserve valid surrogate pairs (emoji)', async () => {
      // \uD83D\uDE00 is the 😀 emoji (valid surrogate pair)
      const textWithEmoji = 'Hello 😀 World';

      const mockTextContent = {
        items: [{ str: textWithEmoji }],
      };

      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue(mockTextContent),
      };

      const mockPdf = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage),
      };

      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdf),
      });

      const pdfContent = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
      const file = new File([pdfContent], 'emoji.pdf', { type: 'application/pdf' });

      const result = await extractText(file, 'pdf');

      // Valid surrogate pairs (emoji) should be preserved
      expect(result.text).toBe('Hello 😀 World');
      expect(() => JSON.stringify(result.text)).not.toThrow();
    });

    it('should remove null bytes and control characters', async () => {
      // Text with null byte and control characters
      const textWithNullBytes = 'Hello\x00World\x01Test\x02End';

      const mockTextContent = {
        items: [{ str: textWithNullBytes }],
      };

      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue(mockTextContent),
      };

      const mockPdf = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage),
      };

      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdf),
      });

      const pdfContent = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
      const file = new File([pdfContent], 'nullbytes.pdf', { type: 'application/pdf' });

      const result = await extractText(file, 'pdf');

      // Null bytes and control characters should be removed
      expect(result.text).toBe('HelloWorldTestEnd');
      expect(result.text).not.toContain('\x00');
      expect(() => JSON.stringify(result.text)).not.toThrow();
    });
  });
});
