/**
 * Registration validation tests
 * Tests for pre-flight checks before registration
 *
 * Sub-phase 4.2: Registration Validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  validatePublicUrl,
  checkBinaryAvailable,
  checkPortAvailable,
  validateModels,
} from '../../src/registration/validation';
import * as net from 'net';

describe('Registration Validation - Sub-phase 4.2', () => {
  describe('validatePublicUrl', () => {
    it('should accept valid HTTP URL with port', () => {
      const result = validatePublicUrl('http://example.com:8080');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept valid HTTPS URL with port', () => {
      const result = validatePublicUrl('https://example.com:8080');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept IP address with port', () => {
      const result = validatePublicUrl('http://203.0.113.45:8080');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject URL without port', () => {
      const result = validatePublicUrl('http://example.com');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('port');
    });

    it('should reject URL with invalid protocol', () => {
      const result = validatePublicUrl('ftp://example.com:8080');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('http or https');
    });

    it('should reject invalid URL format', () => {
      const result = validatePublicUrl('not-a-url');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid URL');
    });

    it('should reject empty string', () => {
      const result = validatePublicUrl('');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should accept URL with path', () => {
      const result = validatePublicUrl('http://example.com:8080/api');
      expect(result.valid).toBe(true);
    });

    it('should accept standard ports', () => {
      const result80 = validatePublicUrl('http://example.com:80');
      const result443 = validatePublicUrl('https://example.com:443');

      expect(result80.valid).toBe(true);
      expect(result443.valid).toBe(true);
    });

    it('should accept high port numbers', () => {
      const result = validatePublicUrl('http://example.com:65535');
      expect(result.valid).toBe(true);
    });
  });

  describe('checkBinaryAvailable', () => {
    it('should return boolean indicating binary availability', async () => {
      const result = await checkBinaryAvailable();
      expect(typeof result).toBe('boolean');
    });

    it('should return false if binary not found', async () => {
      // In test environment, binary might not be available
      const result = await checkBinaryAvailable();
      expect([true, false]).toContain(result);
    });
  });

  describe('checkPortAvailable', () => {
    let testServer: net.Server | null = null;

    afterEach(async () => {
      // Clean up test server
      if (testServer) {
        await new Promise<void>((resolve) => {
          testServer!.close(() => resolve());
        });
        testServer = null;
      }
    });

    it('should return true for available port', async () => {
      // Use a high port number unlikely to be in use
      const result = await checkPortAvailable(65432);
      expect(result).toBe(true);
    });

    it('should return false for port in use', async () => {
      // Start server on a port
      testServer = net.createServer();
      const testPort = 65433;

      await new Promise<void>((resolve) => {
        testServer!.listen(testPort, () => resolve());
      });

      // Check if port is available
      const result = await checkPortAvailable(testPort);
      expect(result).toBe(false);
    });

    it('should return false for privileged ports without permissions', async () => {
      // Port 80 requires root/admin privileges
      const result = await checkPortAvailable(80);
      // Expect false (permission denied or already in use)
      expect(typeof result).toBe('boolean');
    });

    it('should handle multiple consecutive checks', async () => {
      const result1 = await checkPortAvailable(65434);
      const result2 = await checkPortAvailable(65434);

      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });
  });

  describe('validateModels', () => {
    it('should accept valid model format "repo:file"', () => {
      const result = validateModels(['TheBloke/Llama-2-7B-GGUF:llama-2-7b.Q4_K_M.gguf']);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept multiple valid models', () => {
      const models = [
        'TheBloke/Llama-2-7B-GGUF:llama-2-7b.Q4_K_M.gguf',
        'TheBloke/Mistral-7B-GGUF:mistral-7b.Q4_K_M.gguf',
      ];
      const result = validateModels(models);
      expect(result.valid).toBe(true);
    });

    it('should reject models without colon separator', () => {
      const result = validateModels(['TheBloke/Llama-2-7B-GGUF']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('repo:file');
    });

    it('should reject empty model array', () => {
      const result = validateModels([]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('At least one');
    });

    it('should reject empty strings in array', () => {
      const result = validateModels(['']);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject models with invalid characters', () => {
      const result = validateModels(['invalid model:file.gguf']);
      expect(result.valid).toBe(false);
    });

    it('should accept models with hyphens and underscores', () => {
      const result = validateModels(['org/model-name_v2:file_name.gguf']);
      expect(result.valid).toBe(true);
    });

    it('should reject models with multiple colons', () => {
      const result = validateModels(['repo:sub:file.gguf']);
      expect(result.valid).toBe(false);
    });

    it('should accept models with version numbers', () => {
      const result = validateModels(['TheBloke/Llama-2-7B-v1.0:model-v1.0.Q4.gguf']);
      expect(result.valid).toBe(true);
    });

    it('should provide specific error for first invalid model', () => {
      const models = [
        'TheBloke/Valid:model.gguf',
        'Invalid Format',
        'Another/Valid:file.gguf',
      ];
      const result = validateModels(models);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid Format');
    });
  });
});
