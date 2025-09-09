import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Sub-phase 2.3: Sub-account Management', () => {
  const harnessDir = path.resolve(__dirname, '..');
  
  describe('Sub-account Module', () => {
    test('should have sub-account.ts module', () => {
      const modulePath = path.join(harnessDir, 'lib/sub-account.ts');
      expect(fs.existsSync(modulePath)).toBe(true);
    });

    test('should export getOrCreateSubAccount function', () => {
      const modulePath = path.join(harnessDir, 'lib/sub-account.ts');
      const content = fs.readFileSync(modulePath, 'utf8');
      
      expect(content).toContain('export async function getOrCreateSubAccount');
      expect(content).toContain('wallet_getSubAccounts');
      expect(content).toContain('wallet_addSubAccount');
    });

    test('should handle sub-account detection', () => {
      const modulePath = path.join(harnessDir, 'lib/sub-account.ts');
      const content = fs.readFileSync(modulePath, 'utf8');
      
      expect(content).toContain('window.location.origin');
      expect(content).toContain('domain:');
      expect(content).toContain('subAccounts');
    });

    test('should create sub-account if missing', () => {
      const modulePath = path.join(harnessDir, 'lib/sub-account.ts');
      const content = fs.readFileSync(modulePath, 'utf8');
      
      expect(content).toContain('if (!subAccount)');
      expect(content).toContain('type: "create"');
      expect(content).toContain('wallet_addSubAccount');
    });
  });

  describe('Auto-spend Permissions', () => {
    test('should handle auto-spend configuration', () => {
      const modulePath = path.join(harnessDir, 'lib/sub-account.ts');
      const content = fs.readFileSync(modulePath, 'utf8');
      
      expect(content).toContain('autoSpend');
      expect(content).toContain('permissions');
    });

    test('should export permission helper functions', () => {
      const modulePath = path.join(harnessDir, 'lib/sub-account.ts');
      const content = fs.readFileSync(modulePath, 'utf8');
      
      expect(content).toContain('export function getAutoSpendConfig');
      expect(content).toContain('token');
      expect(content).toContain('spender');
    });
  });

  describe('Sub-account Storage', () => {
    test('should store sub-account address', () => {
      const modulePath = path.join(harnessDir, 'lib/sub-account.ts');
      const content = fs.readFileSync(modulePath, 'utf8');
      
      expect(content).toContain('let currentSubAccount');
      expect(content).toContain('address');
      expect(content).toContain('0x');
    });

    test('should export getCurrentSubAccount function', () => {
      const modulePath = path.join(harnessDir, 'lib/sub-account.ts');
      const content = fs.readFileSync(modulePath, 'utf8');
      
      expect(content).toContain('export function getCurrentSubAccount');
      expect(content).toContain('return currentSubAccount');
    });
  });

  describe('React Hook', () => {
    test('should have useSubAccount hook', () => {
      const hookPath = path.join(harnessDir, 'hooks/useSubAccount.ts');
      expect(fs.existsSync(hookPath)).toBe(true);
    });

    test('should use React hooks properly', () => {
      const hookPath = path.join(harnessDir, 'hooks/useSubAccount.ts');
      const content = fs.readFileSync(hookPath, 'utf8');
      
      expect(content).toContain('import { useState, useEffect }');
      expect(content).toContain('export function useSubAccount');
      expect(content).toContain('getOrCreateSubAccount');
    });

    test('should manage sub-account state', () => {
      const hookPath = path.join(harnessDir, 'hooks/useSubAccount.ts');
      const content = fs.readFileSync(hookPath, 'utf8');
      
      expect(content).toContain('useState<string | null>');
      expect(content).toContain('setSubAccount');
      expect(content).toContain('loading');
    });
  });

  describe('Type Definitions', () => {
    test('should have proper TypeScript types', () => {
      const modulePath = path.join(harnessDir, 'lib/sub-account.ts');
      const content = fs.readFileSync(modulePath, 'utf8');
      
      expect(content).toContain('interface');
      expect(content).toContain('SubAccount');
      expect(content).toContain('address: `0x${string}`');
    });

    test('should type auto-spend config', () => {
      const modulePath = path.join(harnessDir, 'lib/sub-account.ts');
      const content = fs.readFileSync(modulePath, 'utf8');
      
      expect(content).toContain('AutoSpendConfig');
      expect(content).toContain('limit');
    });
  });
});