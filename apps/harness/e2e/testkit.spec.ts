import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Sub-phase 3.2: OnchainTestKit Integration', () => {
  const harnessDir = path.resolve(__dirname, '..');
  const e2eDir = path.resolve(__dirname);
  
  describe('OnchainTestKit Package', () => {
    test('should have OnchainTestKit in dependencies', () => {
      const packagePath = path.join(harnessDir, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      
      expect(packageJson.devDependencies).toBeDefined();
      expect(packageJson.devDependencies['@coinbase/onchaintestkit']).toBeDefined();
      expect(packageJson.devDependencies['@coinbase/onchaintestkit']).toMatch(/^\^0\.\d+\.\d+$/);
    });
  });

  describe('TestKit Setup Module', () => {
    test('should have testkit-setup.ts file', () => {
      const setupPath = path.join(e2eDir, 'testkit-setup.ts');
      expect(fs.existsSync(setupPath)).toBe(true);
    });

    test('should export initialization function', () => {
      const setupPath = path.join(e2eDir, 'testkit-setup.ts');
      const content = fs.readFileSync(setupPath, 'utf8');
      
      expect(content).toContain('export async function initializeTestKit');
      expect(content).toContain('OnchainTestKit');
      expect(content).toContain('import');
    });

    test('should configure Coinbase wallet', () => {
      const setupPath = path.join(e2eDir, 'testkit-setup.ts');
      const content = fs.readFileSync(setupPath, 'utf8');
      
      expect(content).toContain('wallets:');
      expect(content).toContain('coinbase:');
      expect(content).toContain('page');
    });
  });

  describe('Wallet Automation Module', () => {
    test('should have wallet-automation.ts file', () => {
      const automationPath = path.join(e2eDir, 'wallet-automation.ts');
      expect(fs.existsSync(automationPath)).toBe(true);
    });

    test('should handle wallet connection', () => {
      const automationPath = path.join(e2eDir, 'wallet-automation.ts');
      const content = fs.readFileSync(automationPath, 'utf8');
      
      expect(content).toContain('export async function connectWallet');
      expect(content).toContain('kit.connect');
      expect(content).toContain('await');
    });

    test('should handle transaction approval', () => {
      const automationPath = path.join(e2eDir, 'wallet-automation.ts');
      const content = fs.readFileSync(automationPath, 'utf8');
      
      expect(content).toContain('export async function approveTransaction');
      expect(content).toContain('approve');
      expect(content).toContain('confirmation');
    });

    test('should handle modal interactions', () => {
      const automationPath = path.join(e2eDir, 'wallet-automation.ts');
      const content = fs.readFileSync(automationPath, 'utf8');
      
      expect(content).toContain('modal');
      expect(content).toContain('waitForSelector');
      expect(content).toContain('click');
    });
  });

  describe('Test Configuration', () => {
    test('should update playwright config for OnchainTestKit', () => {
      const configPath = path.join(harnessDir, 'playwright.config.ts');
      const content = fs.readFileSync(configPath, 'utf8');
      
      expect(content).toContain('viewport:');
      expect(content).toContain('permissions:');
    });
  });

  describe('Helper Functions', () => {
    test('should provide cleanup function', () => {
      const setupPath = path.join(e2eDir, 'testkit-setup.ts');
      const content = fs.readFileSync(setupPath, 'utf8');
      
      expect(content).toContain('export async function cleanupTestKit');
      expect(content).toContain('destroy');
    });

    test('should provide wallet state checks', () => {
      const automationPath = path.join(e2eDir, 'wallet-automation.ts');
      const content = fs.readFileSync(automationPath, 'utf8');
      
      expect(content).toContain('export function isWalletConnected');
      expect(content).toContain('connected');
      expect(content).toContain('boolean');
    });
  });
});