// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, test, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Sub-phase 6.5: S5 Conversation Store', () => {
  const libDir = path.resolve(__dirname, '../lib');
  
  describe('S5 Storage Module', () => {
    test('should have s5-storage.ts file', () => {
      const s5Path = path.join(libDir, 's5-storage.ts');
      expect(fs.existsSync(s5Path)).toBe(true);
    });

    test('should export S5ConversationStore class', () => {
      const s5Path = path.join(libDir, 's5-storage.ts');
      const content = fs.existsSync(s5Path) ? fs.readFileSync(s5Path, 'utf8') : '';
      
      expect(content).toContain('export class S5ConversationStore');
      expect(content).toContain('S5');
    });

    test('should import S5 dependencies', () => {
      const s5Path = path.join(libDir, 's5-storage.ts');
      const content = fs.existsSync(s5Path) ? fs.readFileSync(s5Path, 'utf8') : '';
      
      expect(content).toContain("import");
      expect(content).toContain("@s5-dev/s5js");
    });
  });

  describe('S5 Initialization', () => {
    test('should initialize S5 with seed phrase', () => {
      const s5Path = path.join(libDir, 's5-storage.ts');
      const content = fs.existsSync(s5Path) ? fs.readFileSync(s5Path, 'utf8') : '';
      
      expect(content).toContain('initializeS5');
      expect(content).toContain('seedPhrase');
      expect(content).toContain('portalUrl');
    });

    test('should handle S5 connection', () => {
      const s5Path = path.join(libDir, 's5-storage.ts');
      const content = fs.existsSync(s5Path) ? fs.readFileSync(s5Path, 'utf8') : '';
      
      expect(content).toContain('S5.new');
      expect(content).toContain('connect');
    });
  });

  describe('Conversation Storage', () => {
    test('should save prompts and responses', () => {
      const s5Path = path.join(libDir, 's5-storage.ts');
      const content = fs.existsSync(s5Path) ? fs.readFileSync(s5Path, 'utf8') : '';
      
      expect(content).toContain('saveConversation');
      expect(content).toContain('prompt');
      expect(content).toContain('response');
    });

    test('should create conversation metadata', () => {
      const s5Path = path.join(libDir, 's5-storage.ts');
      const content = fs.existsSync(s5Path) ? fs.readFileSync(s5Path, 'utf8') : '';
      
      expect(content).toContain('metadata');
      expect(content).toContain('timestamp');
      expect(content).toContain('jobId');
    });

    test('should upload to S5 network', () => {
      const s5Path = path.join(libDir, 's5-storage.ts');
      const content = fs.existsSync(s5Path) ? fs.readFileSync(s5Path, 'utf8') : '';
      
      expect(content).toContain('uploadJson');
      expect(content).toContain('cid');
    });
  });

  describe('Error Handling', () => {
    test('should handle storage errors', () => {
      const s5Path = path.join(libDir, 's5-storage.ts');
      const content = fs.existsSync(s5Path) ? fs.readFileSync(s5Path, 'utf8') : '';
      
      expect(content).toContain('try');
      expect(content).toContain('catch');
      expect(content).toContain('error');
    });

    test('should handle missing seed phrase', () => {
      const s5Path = path.join(libDir, 's5-storage.ts');
      const content = fs.existsSync(s5Path) ? fs.readFileSync(s5Path, 'utf8') : '';
      
      expect(content).toContain('if (!seedPhrase)');
      expect(content).toContain('throw');
    });

    test('should return storage result', () => {
      const s5Path = path.join(libDir, 's5-storage.ts');
      const content = fs.existsSync(s5Path) ? fs.readFileSync(s5Path, 'utf8') : '';
      
      expect(content).toContain('StorageResult');
      expect(content).toContain('success');
      expect(content).toContain('cid');
    });
  });
});