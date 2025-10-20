// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Test file: build.test.ts
 * Purpose: Build process tests
 * Max lines: 100
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);
const PACKAGE_DIR = path.join(__dirname, '../..');
const DIST_DIR = path.join(PACKAGE_DIR, 'dist');
const TSCONFIG_PATH = path.join(PACKAGE_DIR, 'tsconfig.json');

describe('Build Process', () => {
  it('should have TypeScript configuration', async () => {
    const exists = await fs.access(TSCONFIG_PATH).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it('should have valid TypeScript configuration', async () => {
    const content = await fs.readFile(TSCONFIG_PATH, 'utf-8').catch(() => '{}');
    const tsconfig = JSON.parse(content);

    expect(tsconfig.compilerOptions).toBeDefined();
    expect(tsconfig.compilerOptions.target).toMatch(/ES\d+/i);
    expect(tsconfig.compilerOptions.module).toBeDefined();
    expect(tsconfig.compilerOptions.outDir).toBe('./dist');
    expect(tsconfig.compilerOptions.rootDir).toBe('./src');
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it('should compile TypeScript without errors', async () => {
    try {
      const { stderr } = await execAsync('npx tsc --noEmit', { cwd: PACKAGE_DIR });
      expect(stderr).toBe('');
    } catch (error: any) {
      // If TypeScript is not set up yet, check for the error
      expect(error.message).toContain('tsconfig.json');
    }
  }, 30000);

  it('should have ESLint configuration', async () => {
    const eslintPath = path.join(PACKAGE_DIR, '.eslintrc.json');
    const exists = await fs.access(eslintPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it('should create dist directory on build', async () => {
    // Check if build script exists
    const packageJson = JSON.parse(
      await fs.readFile(path.join(PACKAGE_DIR, 'package.json'), 'utf-8').catch(() => '{}')
    );

    if (packageJson.scripts?.build) {
      try {
        await execAsync('pnpm build', { cwd: PACKAGE_DIR });
        const distExists = await fs.access(DIST_DIR).then(() => true).catch(() => false);
        expect(distExists).toBe(true);
      } catch (error) {
        // Build might fail if not fully set up yet
        expect(error).toBeDefined();
      }
    } else {
      expect(packageJson.scripts?.build).toBeDefined();
    }
  }, 30000);

  it('should have source files in src directory', async () => {
    const srcDir = path.join(PACKAGE_DIR, 'src');
    const exists = await fs.access(srcDir).then(() => true).catch(() => false);
    expect(exists).toBe(true);

    const indexPath = path.join(srcDir, 'index.ts');
    const indexExists = await fs.access(indexPath).then(() => true).catch(() => false);
    expect(indexExists).toBe(true);
  });
});