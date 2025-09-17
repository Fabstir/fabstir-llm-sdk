import { describe, it, expect } from 'vitest';
import {
  validateMetadata,
  validateSize,
  validateRequiredFields,
  sanitizeMetadata,
  mergeMetadata,
  MetadataValidationError
} from '../../src/utils/metadata-validator';

describe('Metadata Validator', () => {
  describe('validateRequiredFields', () => {
    it('should pass with all required fields', () => {
      const metadata = {
        name: 'Test Host',
        description: 'Test description'
      };

      expect(() => validateRequiredFields(metadata)).not.toThrow();
    });

    it('should fail without name field', () => {
      const metadata = {
        description: 'Test description'
      };

      expect(() => validateRequiredFields(metadata))
        .toThrow(MetadataValidationError);
    });

    it('should fail without description field', () => {
      const metadata = {
        name: 'Test Host'
      };

      expect(() => validateRequiredFields(metadata))
        .toThrow(MetadataValidationError);
    });

    it('should fail with empty name', () => {
      const metadata = {
        name: '',
        description: 'Test'
      };

      expect(() => validateRequiredFields(metadata))
        .toThrow('name cannot be empty');
    });
  });

  describe('validateSize', () => {
    it('should pass for metadata under 10KB', () => {
      const metadata = {
        name: 'Test',
        description: 'Description',
        extra: 'data'.repeat(100)
      };

      expect(() => validateSize(metadata)).not.toThrow();
    });

    it('should fail for metadata over 10KB', () => {
      const metadata = {
        name: 'Test',
        description: 'x'.repeat(11000)
      };

      expect(() => validateSize(metadata))
        .toThrow('exceeds maximum size');
    });

    it('should calculate size correctly for nested objects', () => {
      const metadata = {
        name: 'Test',
        description: 'Desc',
        nested: {
          deep: {
            value: 'x'.repeat(10000)
          }
        }
      };

      expect(() => validateSize(metadata))
        .toThrow('exceeds maximum size');
    });
  });

  describe('sanitizeMetadata', () => {
    it('should remove private keys', () => {
      const metadata = {
        name: 'Test',
        description: 'Desc',
        privateKey: '0x1234567890',
        private_key: 'secret',
        apiKey: 'token'
      };

      const sanitized = sanitizeMetadata(metadata);

      expect(sanitized.privateKey).toBeUndefined();
      expect(sanitized.private_key).toBeUndefined();
      expect(sanitized.apiKey).toBeUndefined();
      expect(sanitized.name).toBe('Test');
    });

    it('should remove sensitive nested fields', () => {
      const metadata = {
        name: 'Test',
        config: {
          privateKey: 'secret',
          publicData: 'ok'
        }
      };

      const sanitized = sanitizeMetadata(metadata);

      expect(sanitized.config.privateKey).toBeUndefined();
      expect(sanitized.config.publicData).toBe('ok');
    });

    it('should trim whitespace from strings', () => {
      const metadata = {
        name: '  Test Host  ',
        description: '  Description  '
      };

      const sanitized = sanitizeMetadata(metadata);

      expect(sanitized.name).toBe('Test Host');
      expect(sanitized.description).toBe('Description');
    });
  });

  describe('mergeMetadata', () => {
    it('should merge new fields with existing', () => {
      const existing = {
        name: 'Old Name',
        description: 'Old Desc',
        extra: 'field'
      };

      const updates = {
        name: 'New Name',
        newField: 'value'
      };

      const merged = mergeMetadata(existing, updates);

      expect(merged.name).toBe('New Name');
      expect(merged.description).toBe('Old Desc');
      expect(merged.extra).toBe('field');
      expect(merged.newField).toBe('value');
    });

    it('should deep merge nested objects', () => {
      const existing = {
        name: 'Host',
        config: {
          a: 1,
          b: 2
        }
      };

      const updates = {
        config: {
          b: 3,
          c: 4
        }
      };

      const merged = mergeMetadata(existing, updates);

      expect(merged.config.a).toBe(1);
      expect(merged.config.b).toBe(3);
      expect(merged.config.c).toBe(4);
    });

    it('should replace arrays completely', () => {
      const existing = {
        name: 'Host',
        models: ['model1', 'model2']
      };

      const updates = {
        models: ['model3']
      };

      const merged = mergeMetadata(existing, updates);

      expect(merged.models).toEqual(['model3']);
    });
  });

  describe('validateMetadata', () => {
    it('should pass valid metadata', () => {
      const metadata = {
        name: 'Valid Host',
        description: 'Valid description',
        location: 'US-East',
        costPerToken: 0.0001
      };

      expect(() => validateMetadata(metadata)).not.toThrow();
    });

    it('should validate and sanitize', () => {
      const metadata = {
        name: '  Valid Host  ',
        description: 'Valid description',
        privateKey: 'should-be-removed'
      };

      const result = validateMetadata(metadata);

      expect(result.name).toBe('Valid Host');
      expect(result.privateKey).toBeUndefined();
    });

    it('should fail validation for invalid JSON structure', () => {
      const metadata = null;

      expect(() => validateMetadata(metadata as any))
        .toThrow('Invalid metadata structure');
    });

    it('should validate email format if present', () => {
      const metadata = {
        name: 'Host',
        description: 'Desc',
        contact: {
          email: 'invalid-email'
        }
      };

      expect(() => validateMetadata(metadata))
        .toThrow('Invalid email format');
    });

    it('should validate URL format if present', () => {
      const metadata = {
        name: 'Host',
        description: 'Desc',
        website: 'not-a-url'
      };

      expect(() => validateMetadata(metadata))
        .toThrow('Invalid URL format');
    });
  });
});