// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import { FabstirLLMSDK } from '../src/fabstir-llm-sdk';

describe('FabstirLLMSDK Basic Tests', () => {
  it('should export FabstirLLMSDK class', () => {
    expect(FabstirLLMSDK).toBeDefined();
    expect(typeof FabstirLLMSDK).toBe('function');
  });

  it('should have submitJob method', () => {
    expect(FabstirLLMSDK.prototype.submitJob).toBeDefined();
    expect(typeof FabstirLLMSDK.prototype.submitJob).toBe('function');
  });

  it('should have connect method', () => {
    expect(FabstirLLMSDK.prototype.connect).toBeDefined();
    expect(typeof FabstirLLMSDK.prototype.connect).toBe('function');
  });

  it('should have disconnect method', () => {
    expect(FabstirLLMSDK.prototype.disconnect).toBeDefined();
    expect(typeof FabstirLLMSDK.prototype.disconnect).toBe('function');
  });

  it('should have getJobStatus method', () => {
    expect(FabstirLLMSDK.prototype.getJobStatus).toBeDefined();
    expect(typeof FabstirLLMSDK.prototype.getJobStatus).toBe('function');
  });
});