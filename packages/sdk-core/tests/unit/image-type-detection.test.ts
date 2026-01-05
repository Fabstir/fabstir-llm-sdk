/**
 * Image Type Detection Tests
 * Sub-phase 1.1: Extend DocumentType with Image Types
 * Sub-phase 1.2: Update detectDocumentType and add isImageType
 */

import { describe, it, expect } from 'vitest';
import { detectDocumentType, isImageType } from '../../src/documents/extractors';
import type { DocumentType, ImageProcessingResult } from '../../src/documents/types';

describe('Image Type Detection - Sub-phase 1.1', () => {
  describe('detectDocumentType with image files', () => {
    it('should detect PNG files', () => {
      expect(detectDocumentType('image.png')).toBe('png');
      expect(detectDocumentType('screenshot.PNG')).toBe('png');
      expect(detectDocumentType('path/to/file.png')).toBe('png');
    });

    it('should detect JPG files as jpeg', () => {
      expect(detectDocumentType('photo.jpg')).toBe('jpeg');
      expect(detectDocumentType('image.JPG')).toBe('jpeg');
    });

    it('should detect JPEG files', () => {
      expect(detectDocumentType('photo.jpeg')).toBe('jpeg');
      expect(detectDocumentType('image.JPEG')).toBe('jpeg');
    });

    it('should detect WebP files', () => {
      expect(detectDocumentType('image.webp')).toBe('webp');
      expect(detectDocumentType('photo.WEBP')).toBe('webp');
    });

    it('should detect GIF files', () => {
      expect(detectDocumentType('animation.gif')).toBe('gif');
      expect(detectDocumentType('image.GIF')).toBe('gif');
    });
  });

  describe('ImageProcessingResult type', () => {
    it('should have correct shape', () => {
      // Type check - this will fail compilation if interface is wrong
      const result: ImageProcessingResult = {
        description: 'A screenshot of code',
        extractedText: 'def hello():\n    print("Hello")',
        ocrConfidence: 0.95,
        combinedText: '[Image Description]\nA screenshot of code\n\n[Extracted Text]\ndef hello():\n    print("Hello")',
        processingTimeMs: 1500,
      };

      expect(result.description).toBe('A screenshot of code');
      expect(result.extractedText).toContain('def hello()');
      expect(result.ocrConfidence).toBeGreaterThan(0);
      expect(result.ocrConfidence).toBeLessThanOrEqual(1);
      expect(result.combinedText).toContain('[Image Description]');
      expect(result.combinedText).toContain('[Extracted Text]');
      expect(result.processingTimeMs).toBeGreaterThan(0);
    });
  });

  describe('DocumentType includes image types', () => {
    it('should accept image types in DocumentType', () => {
      // These assignments should compile without error
      const png: DocumentType = 'png';
      const jpeg: DocumentType = 'jpeg';
      const webp: DocumentType = 'webp';
      const gif: DocumentType = 'gif';

      expect(png).toBe('png');
      expect(jpeg).toBe('jpeg');
      expect(webp).toBe('webp');
      expect(gif).toBe('gif');
    });
  });
});

describe('Image Type Detection - Sub-phase 1.2', () => {
  describe('isImageType helper', () => {
    it('should return true for PNG type', () => {
      expect(isImageType('png')).toBe(true);
    });

    it('should return true for JPEG type', () => {
      expect(isImageType('jpeg')).toBe(true);
    });

    it('should return true for WebP type', () => {
      expect(isImageType('webp')).toBe(true);
    });

    it('should return true for GIF type', () => {
      expect(isImageType('gif')).toBe(true);
    });

    it('should return false for PDF type', () => {
      expect(isImageType('pdf')).toBe(false);
    });

    it('should return false for TXT type', () => {
      expect(isImageType('txt')).toBe(false);
    });

    it('should return false for MD type', () => {
      expect(isImageType('md')).toBe(false);
    });

    it('should return false for HTML type', () => {
      expect(isImageType('html')).toBe(false);
    });

    it('should return false for DOCX type', () => {
      expect(isImageType('docx')).toBe(false);
    });
  });
});
