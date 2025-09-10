import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Sub-phase 6.7: Integration & Playwright Test', () => {
  const pagesDir = path.resolve(__dirname, '../pages');
  const e2eDir = path.resolve(__dirname, '../e2e');
  
  describe('Demo Page Integration', () => {
    test('should add E2ETestFlow to demo page', () => {
      const demoPath = path.join(pagesDir, 'usdc-demo.tsx');
      const content = fs.existsSync(demoPath) ? fs.readFileSync(demoPath, 'utf8') : '';
      
      expect(content).toContain('E2ETestFlow');
      expect(content).toContain('../components/E2ETestFlow');
    });

    test('should pass required props to E2ETestFlow', () => {
      const demoPath = path.join(pagesDir, 'usdc-demo.tsx');
      const content = fs.existsSync(demoPath) ? fs.readFileSync(demoPath, 'utf8') : '';
      
      expect(content).toContain('smartAccount={smartAccount}');
      expect(content).toContain('jobId=');
    });

    test('should show E2E test when connected', () => {
      const demoPath = path.join(pagesDir, 'usdc-demo.tsx');
      const content = fs.existsSync(demoPath) ? fs.readFileSync(demoPath, 'utf8') : '';
      
      expect(content).toContain('connected && <E2ETestFlow');
    });
  });

  describe('Playwright Test File', () => {
    test('should have full-flow.spec.ts file', () => {
      const specPath = path.join(e2eDir, 'full-flow.spec.ts');
      expect(fs.existsSync(specPath)).toBe(true);
    });

    test('should import playwright test', () => {
      const specPath = path.join(e2eDir, 'full-flow.spec.ts');
      const content = fs.existsSync(specPath) ? fs.readFileSync(specPath, 'utf8') : '';
      
      expect(content).toContain('@playwright/test');
      expect(content).toContain('test(');
      expect(content).toContain('expect(');
    });

    test('should click E2E test button', () => {
      const specPath = path.join(e2eDir, 'full-flow.spec.ts');
      const content = fs.existsSync(specPath) ? fs.readFileSync(specPath, 'utf8') : '';
      
      expect(content).toContain('Run E2E Test');
      expect(content).toContain('click()');
    });
  });

  describe('Gasless Verification', () => {
    test('should verify gasless execution', () => {
      const specPath = path.join(e2eDir, 'full-flow.spec.ts');
      const content = fs.existsSync(specPath) ? fs.readFileSync(specPath, 'utf8') : '';
      
      expect(content).toContain('0 ETH');
      expect(content).toContain('gasless');
    });

    test('should assert all steps complete', () => {
      const specPath = path.join(e2eDir, 'full-flow.spec.ts');
      const content = fs.existsSync(specPath) ? fs.readFileSync(specPath, 'utf8') : '';
      
      expect(content).toContain('Sending prompt');
      expect(content).toContain('Submitting proof');
      expect(content).toContain('Processing payment');
      expect(content).toContain('Saving to S5');
    });

    test('should verify final results', () => {
      const specPath = path.join(e2eDir, 'full-flow.spec.ts');
      const content = fs.existsSync(specPath) ? fs.readFileSync(specPath, 'utf8') : '';
      
      expect(content).toContain('Test Results');
      expect(content).toContain('toBeVisible()');
    });
  });
});