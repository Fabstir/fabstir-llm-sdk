import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Sub-phase 5.5: Integration & Polish', () => {
  const pagesDir = path.resolve(__dirname, '../pages');
  
  describe('Component Integration', () => {
    test('should import BalanceDisplay component', () => {
      const demoPath = path.join(pagesDir, 'usdc-demo.tsx');
      const content = fs.existsSync(demoPath) ? fs.readFileSync(demoPath, 'utf8') : '';
      
      expect(content).toContain('BalanceDisplay');
      expect(content).toContain('../components/BalanceDisplay');
    });

    test('should import USDCFlowButton component', () => {
      const demoPath = path.join(pagesDir, 'usdc-demo.tsx');
      const content = fs.existsSync(demoPath) ? fs.readFileSync(demoPath, 'utf8') : '';
      
      expect(content).toContain('USDCFlowButton');
      expect(content).toContain('../components/USDCFlowButton');
    });

    test('should pass smartAccount to components', () => {
      const demoPath = path.join(pagesDir, 'usdc-demo.tsx');
      const content = fs.existsSync(demoPath) ? fs.readFileSync(demoPath, 'utf8') : '';
      
      expect(content).toContain('<BalanceDisplay smartAccount={');
      expect(content).toContain('<USDCFlowButton smartAccount={');
    });
  });

  describe('Error Handling', () => {
    test('should handle connection errors', () => {
      const demoPath = path.join(pagesDir, 'usdc-demo.tsx');
      const content = fs.existsSync(demoPath) ? fs.readFileSync(demoPath, 'utf8') : '';
      
      expect(content).toContain('onError');
      expect(content).toContain('console.error');
    });

    test('should display error messages', () => {
      const demoPath = path.join(pagesDir, 'usdc-demo.tsx');
      const content = fs.existsSync(demoPath) ? fs.readFileSync(demoPath, 'utf8') : '';
      
      expect(content).toContain('errorMessage');
      expect(content).toContain('setErrorMessage');
    });
  });

  describe('Gasless Verification', () => {
    test('should track ETH balance', () => {
      const demoPath = path.join(pagesDir, 'usdc-demo.tsx');
      const content = fs.existsSync(demoPath) ? fs.readFileSync(demoPath, 'utf8') : '';
      
      expect(content).toContain('ethBalance');
      expect(content).toContain('getEthBalance');
    });

    test('should display gasless status', () => {
      const demoPath = path.join(pagesDir, 'usdc-demo.tsx');
      const content = fs.existsSync(demoPath) ? fs.readFileSync(demoPath, 'utf8') : '';
      
      expect(content).toContain('Gasless');
      expect(content).toContain('0 ETH spent');
    });
  });

  describe('Session Job Display', () => {
    test('should handle success callback', () => {
      const demoPath = path.join(pagesDir, 'usdc-demo.tsx');
      const content = fs.existsSync(demoPath) ? fs.readFileSync(demoPath, 'utf8') : '';
      
      expect(content).toContain('onSuccess');
      expect(content).toContain('sessionId');
    });

    test('should display session job ID', () => {
      const demoPath = path.join(pagesDir, 'usdc-demo.tsx');
      const content = fs.existsSync(demoPath) ? fs.readFileSync(demoPath, 'utf8') : '';
      
      expect(content).toContain('lastSessionId');
      expect(content).toContain('Session Job Created');
    });

    test('should refresh balances on success', () => {
      const demoPath = path.join(pagesDir, 'usdc-demo.tsx');
      const content = fs.existsSync(demoPath) ? fs.readFileSync(demoPath, 'utf8') : '';
      
      expect(content).toContain('onBalanceUpdate');
      expect(content).toContain('refreshBalances');
    });
  });

  describe('UI Polish', () => {
    test('should have proper layout structure', () => {
      const demoPath = path.join(pagesDir, 'usdc-demo.tsx');
      const content = fs.existsSync(demoPath) ? fs.readFileSync(demoPath, 'utf8') : '';
      
      expect(content).toContain('display: \'grid\'');
      expect(content).toContain('gap');
    });

    test('should show connected state properly', () => {
      const demoPath = path.join(pagesDir, 'usdc-demo.tsx');
      const content = fs.existsSync(demoPath) ? fs.readFileSync(demoPath, 'utf8') : '';
      
      expect(content).toContain('connected &&');
      expect(content).toContain('!connected');
    });
  });
});