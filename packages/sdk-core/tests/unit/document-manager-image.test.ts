/**
 * DocumentManager Image Processing Tests
 * Sub-phase 3.1: Add Image Detection to processDocument()
 * Sub-phase 3.2: Complete Image Processing Flow
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DocumentManager } from '../../src/managers/DocumentManager';
import { HostAdapter } from '../../src/embeddings/adapters/HostAdapter';
import { EmbeddingService } from '../../src/embeddings/EmbeddingService';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock OpenAI-style adapter (no processImage method)
class MockOpenAIAdapter extends EmbeddingService {
  protected getDefaultModel(): string {
    return 'text-embedding-ada-002';
  }

  async embedText(text: string): Promise<any> {
    return { embedding: new Array(1536).fill(0), text };
  }

  async embedBatch(texts: string[]): Promise<any> {
    return {
      embeddings: texts.map((t) => ({ embedding: new Array(1536).fill(0), text: t })),
      model: 'text-embedding-ada-002',
      provider: 'openai',
      totalTokens: 100,
      cost: 0.0001,
    };
  }
}

describe('DocumentManager Image Processing - Sub-phase 3.1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('processDocument with image detection', () => {
    it('should call embeddingService.processImage() for PNG files', async () => {
      // Mock both endpoints to succeed
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ text: 'OCR text', confidence: 0.9, processingTimeMs: 100 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ description: 'A test image', processingTimeMs: 150 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              embeddings: [{ embedding: new Array(384).fill(0), text: '[Image Description]...' }],
              model: 'all-MiniLM-L6-v2',
              totalTokens: 50,
            }),
        });

      const hostAdapter = new HostAdapter({
        hostUrl: 'http://localhost:8080',
        chainId: 84532,
      });

      const dm = new DocumentManager({ embeddingService: hostAdapter });
      await dm.initialize('test-seed', '0x123');

      const file = new File([new Uint8Array([1, 2, 3])], 'screenshot.png', { type: 'image/png' });
      const result = await dm.processDocument(file);

      // Should call /v1/ocr and /v1/describe-image
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8080/v1/ocr', expect.any(Object));
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/describe-image',
        expect.any(Object)
      );
    });

    it('should call embeddingService.processImage() for JPEG files', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ text: 'Photo text', confidence: 0.85, processingTimeMs: 120 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ description: 'A beautiful photo', processingTimeMs: 200 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              embeddings: [{ embedding: new Array(384).fill(0), text: '[Image Description]...' }],
              model: 'all-MiniLM-L6-v2',
              totalTokens: 60,
            }),
        });

      const hostAdapter = new HostAdapter({
        hostUrl: 'http://localhost:8080',
        chainId: 84532,
      });

      const dm = new DocumentManager({ embeddingService: hostAdapter });
      await dm.initialize('test-seed', '0x123');

      const file = new File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' });
      await dm.processDocument(file);

      // Should call image endpoints
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8080/v1/ocr', expect.any(Object));
    });

    it('should NOT call processImage() for PDF files', async () => {
      // Mock the embed endpoint only (PDF uses text extraction, not image processing)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            embeddings: [{ embedding: new Array(384).fill(0), text: 'PDF content' }],
            model: 'all-MiniLM-L6-v2',
            totalTokens: 100,
          }),
      });

      const hostAdapter = new HostAdapter({
        hostUrl: 'http://localhost:8080',
        chainId: 84532,
      });

      // Spy on processImage to verify it's NOT called
      const processImageSpy = vi.spyOn(hostAdapter, 'processImage');

      const dm = new DocumentManager({ embeddingService: hostAdapter });
      await dm.initialize('test-seed', '0x123');

      // Create a mock PDF file
      const pdfContent = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF magic bytes
      const file = new File([pdfContent], 'document.pdf', { type: 'application/pdf' });

      // This should throw because PDF extraction won't work with mock data
      // But processImage should NOT be called
      try {
        await dm.processDocument(file);
      } catch (e) {
        // Expected to fail (PDF parsing needs real PDF)
      }

      expect(processImageSpy).not.toHaveBeenCalled();
    });

    it('should NOT call processImage() for TXT files', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            embeddings: [{ embedding: new Array(384).fill(0), text: 'Text content' }],
            model: 'all-MiniLM-L6-v2',
            totalTokens: 50,
          }),
      });

      const hostAdapter = new HostAdapter({
        hostUrl: 'http://localhost:8080',
        chainId: 84532,
      });

      const processImageSpy = vi.spyOn(hostAdapter, 'processImage');

      const dm = new DocumentManager({ embeddingService: hostAdapter });
      await dm.initialize('test-seed', '0x123');

      const file = new File(['Hello World'], 'readme.txt', { type: 'text/plain' });
      await dm.processDocument(file);

      expect(processImageSpy).not.toHaveBeenCalled();
    });

    it('should throw if image file but embeddingService lacks processImage()', async () => {
      const openaiAdapter = new MockOpenAIAdapter({
        provider: 'openai' as any,
        apiKey: 'test-key',
      });

      const dm = new DocumentManager({ embeddingService: openaiAdapter });
      await dm.initialize('test-seed', '0x123');

      const file = new File([new Uint8Array([1, 2, 3])], 'image.png', { type: 'image/png' });

      await expect(dm.processDocument(file)).rejects.toThrow(
        'Image processing requires HostAdapter'
      );
    });
  });
});
