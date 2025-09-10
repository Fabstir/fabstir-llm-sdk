import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Sub-phase 5.1: Demo Page Setup', () => {
  const pagesDir = path.resolve(__dirname, '../pages');
  
  describe('USDC Demo Page', () => {
    test('should have usdc-demo.tsx file', () => {
      const demoPath = path.join(pagesDir, 'usdc-demo.tsx');
      expect(fs.existsSync(demoPath)).toBe(true);
    });

    test('should export default component', () => {
      const demoPath = path.join(pagesDir, 'usdc-demo.tsx');
      const content = fs.existsSync(demoPath) ? fs.readFileSync(demoPath, 'utf8') : '';
      
      expect(content).toContain('export default');
      expect(content).toContain('USDCDemo');
    });

    test('should have wallet connection UI', () => {
      const demoPath = path.join(pagesDir, 'usdc-demo.tsx');
      const content = fs.existsSync(demoPath) ? fs.readFileSync(demoPath, 'utf8') : '';
      
      expect(content).toContain('Connect Wallet');
      expect(content).toContain('connectWallet');
    });

    test('should display chain info', () => {
      const demoPath = path.join(pagesDir, 'usdc-demo.tsx');
      const content = fs.existsSync(demoPath) ? fs.readFileSync(demoPath, 'utf8') : '';
      
      expect(content).toContain('Base Sepolia');
      expect(content).toContain('Chain ID');
      expect(content).toContain('84532');
    });

    test('should display account info', () => {
      const demoPath = path.join(pagesDir, 'usdc-demo.tsx');
      const content = fs.existsSync(demoPath) ? fs.readFileSync(demoPath, 'utf8') : '';
      
      expect(content).toContain('account');
      expect(content).toContain('Smart Account');
      expect(content).toContain('Sub-account');
    });

    test('should use Base Account SDK', () => {
      const demoPath = path.join(pagesDir, 'usdc-demo.tsx');
      const content = fs.existsSync(demoPath) ? fs.readFileSync(demoPath, 'utf8') : '';
      
      expect(content).toContain('base-account');
      expect(content).toContain('connectWallet');
    });
  });

  describe('Index Page Navigation', () => {
    test('should have link to USDC demo', () => {
      const indexPath = path.join(pagesDir, 'index.tsx');
      const content = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
      
      expect(content).toContain('/usdc-demo');
      expect(content).toContain('USDC Demo');
    });

    test('should use Next Link component', () => {
      const indexPath = path.join(pagesDir, 'index.tsx');
      const content = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
      
      expect(content).toContain('Link');
      expect(content).toContain('next/link');
    });
  });

  describe('Page Layout', () => {
    test('should have proper title', () => {
      const demoPath = path.join(pagesDir, 'usdc-demo.tsx');
      const content = fs.existsSync(demoPath) ? fs.readFileSync(demoPath, 'utf8') : '';
      
      expect(content).toContain('USDC Session Job Demo');
    });

    test('should have description', () => {
      const demoPath = path.join(pagesDir, 'usdc-demo.tsx');
      const content = fs.existsSync(demoPath) ? fs.readFileSync(demoPath, 'utf8') : '';
      
      expect(content).toContain('gasless');
      expect(content).toContain('Coinbase Smart Wallet');
    });
  });
});