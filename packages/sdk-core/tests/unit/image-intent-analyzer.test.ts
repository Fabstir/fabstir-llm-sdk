import { describe, it, expect } from 'vitest';
import { analyzePromptForImageIntent, ImageIntentResult } from '../../src/utils/image-intent-analyzer';

describe('analyzePromptForImageIntent', () => {
  // ============= Intent Trigger Tests (9) =============

  describe('intent detection triggers', () => {
    it('detects "generate an image of a cat"', () => {
      const result = analyzePromptForImageIntent('generate an image of a cat');
      expect(result.isImageIntent).toBe(true);
    });

    it('detects "draw a sunset over mountains"', () => {
      const result = analyzePromptForImageIntent('draw a sunset over mountains');
      expect(result.isImageIntent).toBe(true);
    });

    it('detects "create a picture of a house"', () => {
      const result = analyzePromptForImageIntent('create a picture of a house');
      expect(result.isImageIntent).toBe(true);
    });

    it('detects "paint a landscape"', () => {
      const result = analyzePromptForImageIntent('paint a landscape');
      expect(result.isImageIntent).toBe(true);
    });

    it('detects "sketch a portrait"', () => {
      const result = analyzePromptForImageIntent('sketch a portrait');
      expect(result.isImageIntent).toBe(true);
    });

    it('detects "make an image of a dog"', () => {
      const result = analyzePromptForImageIntent('make an image of a dog');
      expect(result.isImageIntent).toBe(true);
    });

    it('detects "render a 3D scene"', () => {
      const result = analyzePromptForImageIntent('render a 3D scene');
      expect(result.isImageIntent).toBe(true);
    });

    it('detects polite prefix "please generate an image of a cat"', () => {
      const result = analyzePromptForImageIntent('please generate an image of a cat');
      expect(result.isImageIntent).toBe(true);
    });

    it('detects question form "can you draw me a cat?"', () => {
      const result = analyzePromptForImageIntent('can you draw me a cat?');
      expect(result.isImageIntent).toBe(true);
    });
  });

  // ============= False Positive Prevention Tests (7) =============

  describe('false positive prevention', () => {
    it('rejects "describe the image"', () => {
      const result = analyzePromptForImageIntent('describe the image');
      expect(result.isImageIntent).toBe(false);
    });

    it('rejects "what is in this image"', () => {
      const result = analyzePromptForImageIntent('what is in this image');
      expect(result.isImageIntent).toBe(false);
    });

    it('rejects "how to draw in CSS"', () => {
      const result = analyzePromptForImageIntent('how to draw in CSS');
      expect(result.isImageIntent).toBe(false);
    });

    it('rejects "the painting was beautiful"', () => {
      const result = analyzePromptForImageIntent('the painting was beautiful');
      expect(result.isImageIntent).toBe(false);
    });

    it('rejects "image processing algorithm"', () => {
      const result = analyzePromptForImageIntent('image processing algorithm');
      expect(result.isImageIntent).toBe(false);
    });

    it('rejects "Hello"', () => {
      const result = analyzePromptForImageIntent('Hello');
      expect(result.isImageIntent).toBe(false);
    });

    it('rejects empty string', () => {
      const result = analyzePromptForImageIntent('');
      expect(result.isImageIntent).toBe(false);
    });
  });

  // ============= Size Extraction Tests (4) =============

  describe('size extraction', () => {
    it('extracts 1024x1024 from "generate image of cat in 1024x1024"', () => {
      const result = analyzePromptForImageIntent('generate image of cat in 1024x1024');
      expect(result.isImageIntent).toBe(true);
      expect(result.extractedOptions?.size).toBe('1024x1024');
    });

    it('extracts 512x512 from "draw cat 512x512 resolution"', () => {
      const result = analyzePromptForImageIntent('draw cat 512x512 resolution');
      expect(result.isImageIntent).toBe(true);
      expect(result.extractedOptions?.size).toBe('512x512');
    });

    it('ignores invalid size 999x999', () => {
      const result = analyzePromptForImageIntent('generate image of cat in 999x999');
      expect(result.isImageIntent).toBe(true);
      expect(result.extractedOptions?.size).toBeUndefined();
    });

    it('leaves size undefined when not specified', () => {
      const result = analyzePromptForImageIntent('generate image of cat');
      expect(result.isImageIntent).toBe(true);
      expect(result.extractedOptions?.size).toBeUndefined();
    });
  });

  // ============= Steps Extraction Tests (3) =============

  describe('steps extraction', () => {
    it('extracts 20 from "generate image of cat with 20 steps"', () => {
      const result = analyzePromptForImageIntent('generate image of cat with 20 steps');
      expect(result.isImageIntent).toBe(true);
      expect(result.extractedOptions?.steps).toBe(20);
    });

    it('extracts 4 from "draw cat 4 steps"', () => {
      const result = analyzePromptForImageIntent('draw cat 4 steps');
      expect(result.isImageIntent).toBe(true);
      expect(result.extractedOptions?.steps).toBe(4);
    });

    it('leaves steps undefined when not specified', () => {
      const result = analyzePromptForImageIntent('generate image of cat');
      expect(result.isImageIntent).toBe(true);
      expect(result.extractedOptions?.steps).toBeUndefined();
    });
  });

  // ============= Clean Prompt Tests (3) =============

  describe('clean prompt generation', () => {
    it('cleans "Generate an image of a cat astronaut in 1024x1024 resolution"', () => {
      const result = analyzePromptForImageIntent('Generate an image of a cat astronaut in 1024x1024 resolution');
      expect(result.isImageIntent).toBe(true);
      expect(result.cleanPrompt).toBe('a cat astronaut');
    });

    it('cleans "draw me a sunset with 20 steps"', () => {
      const result = analyzePromptForImageIntent('draw me a sunset with 20 steps');
      expect(result.isImageIntent).toBe(true);
      expect(result.cleanPrompt).toBe('a sunset');
    });

    it('cleans "create a picture of a house"', () => {
      const result = analyzePromptForImageIntent('create a picture of a house');
      expect(result.isImageIntent).toBe(true);
      expect(result.cleanPrompt).toBe('a house');
    });
  });

  // ============= Multi-Turn Prompt Tests (5) =============

  describe('multi-turn prompt handling', () => {
    it('detects intent in User:/Assistant: format', () => {
      const prompt = 'User: Hello\nAssistant: Hi there\nUser: Generate an image of a cat';
      const result = analyzePromptForImageIntent(prompt);
      expect(result.isImageIntent).toBe(true);
      expect(result.cleanPrompt).toBe('a cat');
    });

    it('rejects non-image last turn in User:/Assistant: format', () => {
      const prompt = 'User: Hello\nAssistant: Hi there\nUser: What is 2+2?';
      const result = analyzePromptForImageIntent(prompt);
      expect(result.isImageIntent).toBe(false);
    });

    it('detects intent in Harmony format', () => {
      const prompt = '<|start|>user<|message|>Hello<|end|>\n<|start|>assistant<|channel|>final<|message|>Hi<|end|>\n<|start|>user<|message|>draw a cat<|end|>';
      const result = analyzePromptForImageIntent(prompt);
      expect(result.isImageIntent).toBe(true);
      expect(result.cleanPrompt).toBe('a cat');
    });

    it('extracts size from multi-turn User:/Assistant: prompt', () => {
      const prompt = 'User: Generate an image of a cat\nAssistant: Image generated successfully\nUser: Generate an image of a cat astronaut in 1024x1024';
      const result = analyzePromptForImageIntent(prompt);
      expect(result.isImageIntent).toBe(true);
      expect(result.extractedOptions?.size).toBe('1024x1024');
    });

    it('extracts steps and cleanPrompt from multi-turn prompt', () => {
      const prompt = 'User: Hello\nAssistant: Hi\nUser: draw a sunset with 20 steps';
      const result = analyzePromptForImageIntent(prompt);
      expect(result.isImageIntent).toBe(true);
      expect(result.extractedOptions?.steps).toBe(20);
      expect(result.cleanPrompt).toBe('a sunset');
    });
  });
});
