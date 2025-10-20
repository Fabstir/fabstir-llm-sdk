// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Sub-phase 2.1: Next.js Bootstrap', () => {
  const harnessDir = path.resolve(__dirname, '..');
  
  describe('Package Configuration', () => {
    test('should have package.json with Next.js dependencies', () => {
      const packagePath = path.join(harnessDir, 'package.json');
      expect(fs.existsSync(packagePath)).toBe(true);
      
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      expect(packageJson.name).toBe('harness');
      expect(packageJson.private).toBe(true);
      
      // Next.js dependencies
      expect(packageJson.dependencies).toBeDefined();
      expect(packageJson.dependencies.next).toBeDefined();
      expect(packageJson.dependencies.react).toBeDefined();
      expect(packageJson.dependencies['react-dom']).toBeDefined();
    });

    test('should have Next.js scripts', () => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(harnessDir, 'package.json'), 'utf8')
      );
      
      expect(packageJson.scripts).toBeDefined();
      expect(packageJson.scripts.dev).toBe('next dev -p 3000');
      expect(packageJson.scripts.build).toBe('next build');
      expect(packageJson.scripts.start).toBe('next start -p 3000');
    });

    test('should depend on parent SDK', () => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(harnessDir, 'package.json'), 'utf8')
      );
      
      expect(packageJson.dependencies['@fabstir/llm-sdk']).toBe('workspace:*');
    });
  });

  describe('Next.js Configuration', () => {
    test('should have next.config.js', () => {
      const configPath = path.join(harnessDir, 'next.config.js');
      expect(fs.existsSync(configPath)).toBe(true);
      
      const config = fs.readFileSync(configPath, 'utf8');
      expect(config).toContain('nextConfig');
      expect(config).toContain('reactStrictMode');
    });

    test('should be configured for Base Sepolia', () => {
      const configPath = path.join(harnessDir, 'next.config.js');
      const config = fs.readFileSync(configPath, 'utf8');
      
      // Should have environment variables for Base Sepolia
      expect(config).toContain('NEXT_PUBLIC_CHAIN_ID');
      expect(config).toContain('84532'); // Base Sepolia chain ID
    });
  });

  describe('Pages Structure', () => {
    test('should have _app.tsx', () => {
      const appPath = path.join(harnessDir, 'pages/_app.tsx');
      expect(fs.existsSync(appPath)).toBe(true);
      
      const content = fs.readFileSync(appPath, 'utf8');
      expect(content).toContain('import type { AppProps }');
      expect(content).toContain('function MyApp');
    });

    test('should have index.tsx', () => {
      const indexPath = path.join(harnessDir, 'pages/index.tsx');
      expect(fs.existsSync(indexPath)).toBe(true);
      
      const content = fs.readFileSync(indexPath, 'utf8');
      expect(content).toContain('export default');
      expect(content).toContain('Fabstir Harness');
    });
  });

  describe('TypeScript Configuration', () => {
    test('should have tsconfig.json extending base', () => {
      const tsconfigPath = path.join(harnessDir, 'tsconfig.json');
      expect(fs.existsSync(tsconfigPath)).toBe(true);
      
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
      expect(tsconfig.extends).toBe('../../tsconfig.base.json');
      expect(tsconfig.compilerOptions).toBeDefined();
      expect(tsconfig.compilerOptions.jsx).toBe('preserve');
    });
  });

  describe('Development Server', () => {
    test('should have port configuration', () => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(harnessDir, 'package.json'), 'utf8')
      );
      
      // Dev server on port 3000
      expect(packageJson.scripts.dev).toContain('3000');
      expect(packageJson.scripts.start).toContain('3000');
    });
  });
});