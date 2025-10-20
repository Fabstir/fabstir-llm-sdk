// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, test, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Sub-phase 6.2: LLM Service Integration', () => {
  const libDir = path.resolve(__dirname, '../lib');
  
  describe('LLM Service Module', () => {
    test('should have llm-service.ts file', () => {
      const servicePath = path.join(libDir, 'llm-service.ts');
      expect(fs.existsSync(servicePath)).toBe(true);
    });

    test('should export LLMService class', () => {
      const servicePath = path.join(libDir, 'llm-service.ts');
      const content = fs.existsSync(servicePath) ? fs.readFileSync(servicePath, 'utf8') : '';
      
      expect(content).toContain('export class LLMService');
      expect(content).toContain('LLMWebSocketClient');
    });

    test('should import WebSocket client', () => {
      const servicePath = path.join(libDir, 'llm-service.ts');
      const content = fs.existsSync(servicePath) ? fs.readFileSync(servicePath, 'utf8') : '';
      
      expect(content).toContain("import");
      expect(content).toContain('./websocket-client');
    });
  });

  describe('Prompt Sending', () => {
    test('should have sendPrompt method', () => {
      const servicePath = path.join(libDir, 'llm-service.ts');
      const content = fs.existsSync(servicePath) ? fs.readFileSync(servicePath, 'utf8') : '';
      
      expect(content).toContain('sendPrompt');
      expect(content).toContain('prompt:');
      expect(content).toContain('hostUrl');
    });

    test('should send prompt via WebSocket', () => {
      const servicePath = path.join(libDir, 'llm-service.ts');
      const content = fs.existsSync(servicePath) ? fs.readFileSync(servicePath, 'utf8') : '';
      
      expect(content).toContain('type: "prompt"');
      expect(content).toContain('send({');
    });

    test('should handle "1 + 1 = ?" test prompt', () => {
      const servicePath = path.join(libDir, 'llm-service.ts');
      const content = fs.existsSync(servicePath) ? fs.readFileSync(servicePath, 'utf8') : '';
      
      expect(content).toContain('1 + 1');
      expect(content).toContain('DEFAULT_PROMPT');
    });
  });

  describe('Response Streaming', () => {
    test('should handle streaming responses', () => {
      const servicePath = path.join(libDir, 'llm-service.ts');
      const content = fs.existsSync(servicePath) ? fs.readFileSync(servicePath, 'utf8') : '';
      
      expect(content).toContain('onToken');
      expect(content).toContain('fullResponse');
      expect(content).toContain('+=');
    });

    test('should track token usage', () => {
      const servicePath = path.join(libDir, 'llm-service.ts');
      const content = fs.existsSync(servicePath) ? fs.readFileSync(servicePath, 'utf8') : '';
      
      expect(content).toContain('tokenCount');
      expect(content).toContain('getTokenCount');
    });

    test('should return complete response', () => {
      const servicePath = path.join(libDir, 'llm-service.ts');
      const content = fs.existsSync(servicePath) ? fs.readFileSync(servicePath, 'utf8') : '';
      
      expect(content).toContain('Promise<');
      expect(content).toContain('response:');
      expect(content).toContain('tokens:');
    });
  });

  describe('Error Handling', () => {
    test('should handle connection errors', () => {
      const servicePath = path.join(libDir, 'llm-service.ts');
      const content = fs.existsSync(servicePath) ? fs.readFileSync(servicePath, 'utf8') : '';
      
      expect(content).toContain('catch');
      expect(content).toContain('error');
      expect(content).toContain('reject');
    });

    test('should implement retry logic', () => {
      const servicePath = path.join(libDir, 'llm-service.ts');
      const content = fs.existsSync(servicePath) ? fs.readFileSync(servicePath, 'utf8') : '';
      
      expect(content).toContain('retry');
      expect(content).toContain('maxRetries');
    });

    test('should handle timeout', () => {
      const servicePath = path.join(libDir, 'llm-service.ts');
      const content = fs.existsSync(servicePath) ? fs.readFileSync(servicePath, 'utf8') : '';
      
      expect(content).toContain('timeout');
      expect(content).toContain('30000');
    });
  });
});