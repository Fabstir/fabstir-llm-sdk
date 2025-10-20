// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Test file: package.test.ts
 * Purpose: Package configuration tests
 * Max lines: 150
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

const PACKAGE_DIR = path.join(__dirname, '../..');
const PACKAGE_JSON_PATH = path.join(PACKAGE_DIR, 'package.json');

describe('Package Configuration', () => {
  let packageJson: any;

  beforeAll(async () => {
    try {
      const content = await fs.readFile(PACKAGE_JSON_PATH, 'utf-8');
      packageJson = JSON.parse(content);
    } catch (error) {
      packageJson = null;
    }
  });

  it('should have package.json file', async () => {
    const exists = await fs.access(PACKAGE_JSON_PATH).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it('should have correct package name', () => {
    expect(packageJson?.name).toBe('@fabstir/host-cli');
  });

  it('should have correct version', () => {
    expect(packageJson?.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should have bin entry for global installation', () => {
    expect(packageJson?.bin).toBeDefined();
    expect(packageJson?.bin['fabstir-host']).toBeDefined();
  });

  it('should have required dependencies', () => {
    const deps = packageJson?.dependencies || {};
    expect(deps).toHaveProperty('commander');
    expect(deps).toHaveProperty('inquirer');
    expect(deps).toHaveProperty('chalk');
    expect(deps).toHaveProperty('ethers');
    expect(deps).toHaveProperty('@fabstir/sdk-core');
    expect(deps).toHaveProperty('winston');
    expect(deps).toHaveProperty('dotenv');
  });

  it('should have required scripts', () => {
    const scripts = packageJson?.scripts || {};
    expect(scripts).toHaveProperty('build');
    expect(scripts).toHaveProperty('dev');
    expect(scripts).toHaveProperty('test');
    expect(scripts).toHaveProperty('lint');
  });

  it('should have TypeScript as dev dependency', () => {
    const devDeps = packageJson?.devDependencies || {};
    expect(devDeps).toHaveProperty('typescript');
    expect(devDeps).toHaveProperty('@types/node');
  });

  it('should have correct main entry point', () => {
    expect(packageJson?.main).toBe('dist/index.js');
  });

  it('should have correct types entry point', () => {
    expect(packageJson?.types).toBe('dist/index.d.ts');
  });

  it('should target Node.js environment', () => {
    expect(packageJson?.engines?.node).toMatch(/>=\d+/);
  });
});