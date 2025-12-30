/**
 * HostAdapter Image Processing Tests
 * Sub-phase 2.1: Base64 Conversion Utility
 * Sub-phase 2.2: callOcrEndpoint()
 * Sub-phase 2.3: callDescribeEndpoint()
 * Sub-phase 2.4: processImage()
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HostAdapter } from '../../src/embeddings/adapters/HostAdapter';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('HostAdapter Image Processing - Sub-phase 2.1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('arrayBufferToBase64', () => {
    it('should convert small buffer to valid base64', () => {
      const adapter = new HostAdapter({
        hostUrl: 'http://localhost:8080',
        chainId: 84532,
      });

      // Create a simple test buffer with known bytes
      const testBytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const buffer = testBytes.buffer;

      // Access private method via any
      const base64 = (adapter as any).arrayBufferToBase64(buffer);

      // "Hello" in base64 is "SGVsbG8="
      expect(base64).toBe('SGVsbG8=');
      // Verify it can be decoded back
      expect(atob(base64)).toBe('Hello');
    });

    it('should handle empty buffer', () => {
      const adapter = new HostAdapter({
        hostUrl: 'http://localhost:8080',
        chainId: 84532,
      });

      const emptyBuffer = new ArrayBuffer(0);
      const base64 = (adapter as any).arrayBufferToBase64(emptyBuffer);

      expect(base64).toBe('');
    });

    it('should handle binary data (image bytes)', () => {
      const adapter = new HostAdapter({
        hostUrl: 'http://localhost:8080',
        chainId: 84532,
      });

      // PNG magic bytes: 0x89 0x50 0x4E 0x47
      const pngMagicBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const buffer = pngMagicBytes.buffer;

      const base64 = (adapter as any).arrayBufferToBase64(buffer);

      // Verify it's valid base64 (doesn't throw on decode)
      expect(() => atob(base64)).not.toThrow();

      // Verify we can decode it back to original bytes
      const decoded = atob(base64);
      expect(decoded.charCodeAt(0)).toBe(0x89);
      expect(decoded.charCodeAt(1)).toBe(0x50);
      expect(decoded.charCodeAt(2)).toBe(0x4E);
      expect(decoded.charCodeAt(3)).toBe(0x47);
    });
  });
});

describe('HostAdapter Image Processing - Sub-phase 2.2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('callOcrEndpoint', () => {
    it('should send correct request format to /v1/ocr', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ text: 'Hello World', confidence: 0.95, processingTimeMs: 150 }),
      });

      const adapter = new HostAdapter({
        hostUrl: 'http://localhost:8080',
        chainId: 84532,
      });

      await (adapter as any).callOcrEndpoint('dGVzdA==', 'png');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/ocr',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"image":"dGVzdA=="'),
        })
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.image).toBe('dGVzdA==');
      expect(callBody.format).toBe('png');
      expect(callBody.language).toBe('en');
      expect(callBody.chainId).toBe(84532);
    });

    it('should return text and confidence on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ text: 'Extracted text', confidence: 0.92, processingTimeMs: 200 }),
      });

      const adapter = new HostAdapter({
        hostUrl: 'http://localhost:8080',
        chainId: 84532,
      });

      const result = await (adapter as any).callOcrEndpoint('base64data', 'jpeg');

      expect(result.text).toBe('Extracted text');
      expect(result.confidence).toBe(0.92);
      expect(result.processingTimeMs).toBe(200);
    });

    it('should throw on 503 (model not loaded)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ message: 'Model not loaded' }),
      });

      const adapter = new HostAdapter({
        hostUrl: 'http://localhost:8080',
        chainId: 84532,
      });

      await expect((adapter as any).callOcrEndpoint('base64data', 'png')).rejects.toThrow(
        'OCR model not loaded on host'
      );
    });

    it('should throw on 400 with error message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: 'Invalid image format' }),
      });

      const adapter = new HostAdapter({
        hostUrl: 'http://localhost:8080',
        chainId: 84532,
      });

      await expect((adapter as any).callOcrEndpoint('base64data', 'png')).rejects.toThrow(
        'OCR failed (400): Invalid image format'
      );
    });

    it('should handle empty OCR result gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ text: '', confidence: 0, processingTimeMs: 50 }),
      });

      const adapter = new HostAdapter({
        hostUrl: 'http://localhost:8080',
        chainId: 84532,
      });

      const result = await (adapter as any).callOcrEndpoint('base64data', 'png');

      expect(result.text).toBe('');
      expect(result.confidence).toBe(0);
      expect(result.processingTimeMs).toBe(50);
    });
  });
});

describe('HostAdapter Image Processing - Sub-phase 2.3', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('callDescribeEndpoint', () => {
    it('should send correct request format to /v1/describe-image', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ description: 'A cat sitting on a couch', processingTimeMs: 250 }),
      });

      const adapter = new HostAdapter({
        hostUrl: 'http://localhost:8080',
        chainId: 84532,
      });

      await (adapter as any).callDescribeEndpoint('dGVzdA==', 'png');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/describe-image',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"image":"dGVzdA=="'),
        })
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.image).toBe('dGVzdA==');
      expect(callBody.format).toBe('png');
      expect(callBody.detail).toBe('detailed');
      expect(callBody.chainId).toBe(84532);
    });

    it('should return description on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ description: 'A beautiful sunset over mountains', processingTimeMs: 300 }),
      });

      const adapter = new HostAdapter({
        hostUrl: 'http://localhost:8080',
        chainId: 84532,
      });

      const result = await (adapter as any).callDescribeEndpoint('base64data', 'jpeg');

      expect(result.description).toBe('A beautiful sunset over mountains');
      expect(result.processingTimeMs).toBe(300);
    });

    it('should throw on 503 (model not loaded)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ message: 'Model not loaded' }),
      });

      const adapter = new HostAdapter({
        hostUrl: 'http://localhost:8080',
        chainId: 84532,
      });

      await expect((adapter as any).callDescribeEndpoint('base64data', 'png')).rejects.toThrow(
        'Florence vision model not loaded on host'
      );
    });

    it('should throw on 400 with error message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: 'Invalid image data' }),
      });

      const adapter = new HostAdapter({
        hostUrl: 'http://localhost:8080',
        chainId: 84532,
      });

      await expect((adapter as any).callDescribeEndpoint('base64data', 'png')).rejects.toThrow(
        'Image description failed (400): Invalid image data'
      );
    });

    it('should handle empty description gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ description: '', processingTimeMs: 100 }),
      });

      const adapter = new HostAdapter({
        hostUrl: 'http://localhost:8080',
        chainId: 84532,
      });

      const result = await (adapter as any).callDescribeEndpoint('base64data', 'png');

      expect(result.description).toBe('');
      expect(result.processingTimeMs).toBe(100);
    });
  });
});

describe('HostAdapter Image Processing - Sub-phase 2.4', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('processImage', () => {
    it('should call both OCR and describe endpoints', async () => {
      // Mock both endpoints to succeed
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ text: 'OCR text', confidence: 0.9, processingTimeMs: 100 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ description: 'A test image', processingTimeMs: 150 }),
        });

      const adapter = new HostAdapter({
        hostUrl: 'http://localhost:8080',
        chainId: 84532,
      });

      const file = new File([new Uint8Array([1, 2, 3])], 'test.png', { type: 'image/png' });
      await adapter.processImage(file);

      // Both endpoints should be called
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:8080/v1/ocr');
      expect(mockFetch.mock.calls[1][0]).toBe('http://localhost:8080/v1/describe-image');
    });

    it('should combine results with correct format', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ text: 'def hello():', confidence: 0.95, processingTimeMs: 100 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ description: 'A code snippet', processingTimeMs: 200 }),
        });

      const adapter = new HostAdapter({
        hostUrl: 'http://localhost:8080',
        chainId: 84532,
      });

      const file = new File([new Uint8Array([1, 2, 3])], 'code.png', { type: 'image/png' });
      const result = await adapter.processImage(file);

      expect(result.extractedText).toBe('def hello():');
      expect(result.description).toBe('A code snippet');
      expect(result.ocrConfidence).toBe(0.95);
      expect(result.combinedText).toContain('[Image Description]');
      expect(result.combinedText).toContain('A code snippet');
      expect(result.combinedText).toContain('[Extracted Text]');
      expect(result.combinedText).toContain('def hello():');
      expect(result.processingTimeMs).toBe(300); // 100 + 200
    });

    it('should work when only OCR succeeds', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ text: 'Only OCR text', confidence: 0.85, processingTimeMs: 120 }),
        })
        .mockRejectedValueOnce(new Error('Describe endpoint failed'));

      const adapter = new HostAdapter({
        hostUrl: 'http://localhost:8080',
        chainId: 84532,
      });

      const file = new File([new Uint8Array([1, 2, 3])], 'image.jpg', { type: 'image/jpeg' });
      const result = await adapter.processImage(file);

      expect(result.extractedText).toBe('Only OCR text');
      expect(result.description).toBe('');
      expect(result.ocrConfidence).toBe(0.85);
      expect(result.combinedText).toContain('[Extracted Text]');
      expect(result.combinedText).toContain('Only OCR text');
    });

    it('should work when only describe succeeds', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('OCR endpoint failed'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ description: 'A beautiful landscape', processingTimeMs: 180 }),
        });

      const adapter = new HostAdapter({
        hostUrl: 'http://localhost:8080',
        chainId: 84532,
      });

      const file = new File([new Uint8Array([1, 2, 3])], 'photo.webp', { type: 'image/webp' });
      const result = await adapter.processImage(file);

      expect(result.extractedText).toBe('');
      expect(result.description).toBe('A beautiful landscape');
      expect(result.ocrConfidence).toBe(0);
      expect(result.combinedText).toContain('[Image Description]');
      expect(result.combinedText).toContain('A beautiful landscape');
    });

    it('should throw when BOTH endpoints fail', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('OCR failed'))
        .mockRejectedValueOnce(new Error('Describe failed'));

      const adapter = new HostAdapter({
        hostUrl: 'http://localhost:8080',
        chainId: 84532,
      });

      const file = new File([new Uint8Array([1, 2, 3])], 'bad.gif', { type: 'image/gif' });

      await expect(adapter.processImage(file)).rejects.toThrow('Image processing failed on host');
    });

    it('should return correct ImageProcessingResult shape', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ text: 'text', confidence: 0.88, processingTimeMs: 50 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ description: 'desc', processingTimeMs: 70 }),
        });

      const adapter = new HostAdapter({
        hostUrl: 'http://localhost:8080',
        chainId: 84532,
      });

      const file = new File([new Uint8Array([1, 2, 3])], 'test.png', { type: 'image/png' });
      const result = await adapter.processImage(file);

      // Verify ImageProcessingResult shape
      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('extractedText');
      expect(result).toHaveProperty('ocrConfidence');
      expect(result).toHaveProperty('combinedText');
      expect(result).toHaveProperty('processingTimeMs');
      expect(typeof result.description).toBe('string');
      expect(typeof result.extractedText).toBe('string');
      expect(typeof result.ocrConfidence).toBe('number');
      expect(typeof result.combinedText).toBe('string');
      expect(typeof result.processingTimeMs).toBe('number');
    });
  });
});
