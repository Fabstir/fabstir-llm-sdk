import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Sub-phase 3.1: Playwright Setup', () => {
  const harnessDir = path.resolve(__dirname, '..');
  const e2eDir = path.resolve(__dirname);
  
  describe('Playwright Configuration', () => {
    test('should have playwright.config.ts', () => {
      const configPath = path.join(harnessDir, 'playwright.config.ts');
      expect(fs.existsSync(configPath)).toBe(true);
    });

    test('should configure Chrome browser', () => {
      const configPath = path.join(harnessDir, 'playwright.config.ts');
      const content = fs.readFileSync(configPath, 'utf8');
      
      expect(content).toContain('Desktop Chrome');
      expect(content).toContain('devices');
      expect(content).toContain('chromium');
    });

    test('should set base URL', () => {
      const configPath = path.join(harnessDir, 'playwright.config.ts');
      const content = fs.readFileSync(configPath, 'utf8');
      
      expect(content).toContain('baseURL');
      expect(content).toContain('http://localhost:3000');
    });

    test('should configure test directory', () => {
      const configPath = path.join(harnessDir, 'playwright.config.ts');
      const content = fs.readFileSync(configPath, 'utf8');
      
      expect(content).toContain('testDir');
      expect(content).toContain('./e2e');
    });
  });

  describe('Test Utilities', () => {
    test('should have utils.ts file', () => {
      const utilsPath = path.join(e2eDir, 'utils.ts');
      expect(fs.existsSync(utilsPath)).toBe(true);
    });

    test('should export helper functions', () => {
      const utilsPath = path.join(e2eDir, 'utils.ts');
      const content = fs.readFileSync(utilsPath, 'utf8');
      
      expect(content).toContain('export async function waitForElement');
      expect(content).toContain('export async function clickAndWait');
      expect(content).toContain('Page');
    });
  });

  describe('Package Configuration', () => {
    test('should have Playwright in devDependencies', () => {
      const packagePath = path.join(harnessDir, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      
      expect(packageJson.devDependencies).toBeDefined();
      expect(packageJson.devDependencies['@playwright/test']).toBeDefined();
    });

    test('should have e2e test script', () => {
      const packagePath = path.join(harnessDir, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      
      expect(packageJson.scripts).toBeDefined();
      expect(packageJson.scripts['test:e2e']).toBeDefined();
      expect(packageJson.scripts['test:e2e']).toContain('playwright test');
    });
  });

  describe('Web Server Configuration', () => {
    test('should configure web server', () => {
      const configPath = path.join(harnessDir, 'playwright.config.ts');
      const content = fs.readFileSync(configPath, 'utf8');
      
      expect(content).toContain('webServer');
      expect(content).toContain('command');
      expect(content).toContain('port: 3000');
    });

    test('should reuse existing server', () => {
      const configPath = path.join(harnessDir, 'playwright.config.ts');
      const content = fs.readFileSync(configPath, 'utf8');
      
      expect(content).toContain('reuseExistingServer');
      expect(content).toContain('!process.env.CI');
    });
  });

  describe('Browser Settings', () => {
    test('should set headless mode', () => {
      const configPath = path.join(harnessDir, 'playwright.config.ts');
      const content = fs.readFileSync(configPath, 'utf8');
      
      expect(content).toContain('headless');
      expect(content).toContain('true');
    });
  });
});