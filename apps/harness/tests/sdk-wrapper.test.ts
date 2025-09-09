import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Sub-phase 2.4: SDK Wrapper Integration', () => {
  const harnessDir = path.resolve(__dirname, '..');
  
  describe('SDK Wrapper Module', () => {
    test('should have sdk-wrapper.ts module', () => {
      const wrapperPath = path.join(harnessDir, 'lib/sdk-wrapper.ts');
      expect(fs.existsSync(wrapperPath)).toBe(true);
    });

    test('should import @fabstir/llm-sdk', () => {
      const wrapperPath = path.join(harnessDir, 'lib/sdk-wrapper.ts');
      const content = fs.readFileSync(wrapperPath, 'utf8');
      
      expect(content).toContain("from '@fabstir/llm-sdk'");
      expect(content).toContain('BaseAccountWallet');
    });

    test('should create FabstirHarnessSDK class', () => {
      const wrapperPath = path.join(harnessDir, 'lib/sdk-wrapper.ts');
      const content = fs.readFileSync(wrapperPath, 'utf8');
      
      expect(content).toContain('export class FabstirHarnessSDK');
      expect(content).toContain('constructor');
      expect(content).toContain('private');
    });
  });

  describe('BaseAccountWallet Integration', () => {
    test('should integrate BaseAccountWallet', () => {
      const wrapperPath = path.join(harnessDir, 'lib/sdk-wrapper.ts');
      const content = fs.readFileSync(wrapperPath, 'utf8');
      
      expect(content).toContain('BaseAccountWallet');
      expect(content).toContain('sendSponsoredCalls');
      expect(content).toContain('getCallsStatus');
    });

    test('should wrap wallet methods', () => {
      const wrapperPath = path.join(harnessDir, 'lib/sdk-wrapper.ts');
      const content = fs.readFileSync(wrapperPath, 'utf8');
      
      expect(content).toContain('async sendBatchCalls');
      expect(content).toContain('from: string');
      expect(content).toContain('calls: Array');
    });
  });

  describe('Browser Compatibility', () => {
    test('should handle browser environment', () => {
      const wrapperPath = path.join(harnessDir, 'lib/sdk-wrapper.ts');
      const content = fs.readFileSync(wrapperPath, 'utf8');
      
      expect(content).toContain('window');
      expect(content).toContain('provider');
      expect(content).toContain('ethereum');
    });

    test('should export initialization function', () => {
      const wrapperPath = path.join(harnessDir, 'lib/sdk-wrapper.ts');
      const content = fs.readFileSync(wrapperPath, 'utf8');
      
      expect(content).toContain('export async function initializeSDK');
      expect(content).toContain('connectWallet');
      expect(content).toContain('getOrCreateSubAccount');
    });
  });

  describe('Type Definitions', () => {
    test('should have types.ts file', () => {
      const typesPath = path.join(harnessDir, 'lib/types.ts');
      expect(fs.existsSync(typesPath)).toBe(true);
    });

    test('should define batch call types', () => {
      const typesPath = path.join(harnessDir, 'lib/types.ts');
      const content = fs.readFileSync(typesPath, 'utf8');
      
      expect(content).toContain('export interface BatchCall');
      expect(content).toContain('to: `0x${string}`');
      expect(content).toContain('data: `0x${string}`');
      expect(content).toContain('value?');
    });

    test('should define SDK config types', () => {
      const typesPath = path.join(harnessDir, 'lib/types.ts');
      const content = fs.readFileSync(typesPath, 'utf8');
      
      expect(content).toContain('export interface SDKConfig');
      expect(content).toContain('chainId');
      expect(content).toContain('rpcUrl');
    });
  });

  describe('Unified Interface', () => {
    test('should export unified SDK interface', () => {
      const wrapperPath = path.join(harnessDir, 'lib/sdk-wrapper.ts');
      const content = fs.readFileSync(wrapperPath, 'utf8');
      
      expect(content).toContain('export default');
      expect(content).toContain('getInstance');
      expect(content).toContain('singleton');
    });

    test('should provide helper functions', () => {
      const wrapperPath = path.join(harnessDir, 'lib/sdk-wrapper.ts');
      const content = fs.readFileSync(wrapperPath, 'utf8');
      
      expect(content).toContain('export function buildUSDCApproval');
      expect(content).toContain('export function buildJobCreation');
      expect(content).toContain('encodeFunctionData');
    });
  });
});