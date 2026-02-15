/**
 * @fileoverview Type compilation tests for image generation types
 * Sub-phase 1.1: Image Generation Types
 *
 * These tests verify that all image generation types compile correctly
 * and have the expected interface shapes.
 */

import { describe, it, expect } from 'vitest';
import {
  ALLOWED_IMAGE_SIZES,
  isValidImageSize,
} from '../../src/types/image-generation.types';
import type {
  ImageGenerationOptions,
  ImageGenerationResult,
  SafetyInfo,
  BillingInfo,
} from '../../src/types/image-generation.types';

describe('Image Generation Types', () => {
  describe('ALLOWED_IMAGE_SIZES', () => {
    it('should contain exactly 6 entries', () => {
      expect(ALLOWED_IMAGE_SIZES).toHaveLength(6);
    });

    it('should include 1024x1024', () => {
      expect(ALLOWED_IMAGE_SIZES).toContain('1024x1024');
    });

    it('should include 768x1024 (portrait)', () => {
      expect(ALLOWED_IMAGE_SIZES).toContain('768x1024');
    });
  });

  describe('isValidImageSize', () => {
    it('should return true for 512x512', () => {
      expect(isValidImageSize('512x512')).toBe(true);
    });

    it('should return true for 1024x768', () => {
      expect(isValidImageSize('1024x768')).toBe(true);
    });

    it('should return false for 800x600', () => {
      expect(isValidImageSize('800x600')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidImageSize('')).toBe(false);
    });

    it('should return false for 1024 (no separator)', () => {
      expect(isValidImageSize('1024')).toBe(false);
    });
  });

  describe('ImageGenerationOptions', () => {
    it('should accept all optional fields', () => {
      const options: ImageGenerationOptions = {
        model: 'stable-diffusion-xl',
        size: '1024x1024',
        steps: 30,
        seed: 42,
        negativePrompt: 'blurry',
        guidanceScale: 7.5,
        safetyLevel: 'moderate',
        chainId: 84532,
      };
      expect(options.model).toBe('stable-diffusion-xl');
      expect(options.size).toBe('1024x1024');
      expect(options.steps).toBe(30);
      expect(options.seed).toBe(42);
      expect(options.negativePrompt).toBe('blurry');
      expect(options.guidanceScale).toBe(7.5);
      expect(options.safetyLevel).toBe('moderate');
      expect(options.chainId).toBe(84532);
    });
  });

  describe('ImageGenerationResult', () => {
    it('should have required shape', () => {
      const safety: SafetyInfo = {
        promptSafe: true,
        outputSafe: true,
        safetyLevel: 'strict',
      };
      const billing: BillingInfo = {
        generationUnits: 10,
        modelMultiplier: 1.5,
        megapixels: 1.05,
        steps: 30,
      };
      const result: ImageGenerationResult = {
        image: 'base64data',
        model: 'stable-diffusion-xl',
        size: '1024x1024',
        steps: 30,
        seed: 42,
        processingTimeMs: 5000,
        safety,
        billing,
        provider: 'host-1',
        chainId: 84532,
        chainName: 'Base Sepolia',
        nativeToken: 'ETH',
      };
      expect(result.image).toBe('base64data');
      expect(result.safety.promptSafe).toBe(true);
      expect(result.billing.generationUnits).toBe(10);
      expect(result.chainId).toBe(84532);
    });
  });
});
