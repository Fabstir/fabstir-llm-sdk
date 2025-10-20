// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, test, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Sub-phase 2.2: Base Account SDK Integration', () => {
  const harnessDir = path.resolve(__dirname, '..');
  
  describe('Base Account SDK Package', () => {
    test('should have @base-org/account in dependencies', () => {
      const packagePath = path.join(harnessDir, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      
      expect(packageJson.dependencies).toBeDefined();
      expect(packageJson.dependencies['@base-org/account']).toBeDefined();
      expect(packageJson.dependencies['@base-org/account']).toMatch(/^\^2\.\d+\.\d+$/);
    });

    test('should have viem for blockchain interactions', () => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(harnessDir, 'package.json'), 'utf8')
      );
      
      expect(packageJson.dependencies.viem).toBeDefined();
    });
  });

  describe('SDK Initialization Module', () => {
    test('should have base-account.ts module', () => {
      const modulePath = path.join(harnessDir, 'lib/base-account.ts');
      expect(fs.existsSync(modulePath)).toBe(true);
    });

    test('should export createSDK function', () => {
      const modulePath = path.join(harnessDir, 'lib/base-account.ts');
      const content = fs.readFileSync(modulePath, 'utf8');
      
      expect(content).toContain('export function createSDK');
      expect(content).toContain('createBaseAccountSDK');
      expect(content).toContain('base.constants.CHAIN_IDS.base_sepolia');
    });

    test('should configure SDK for Base Sepolia', () => {
      const modulePath = path.join(harnessDir, 'lib/base-account.ts');
      const content = fs.readFileSync(modulePath, 'utf8');
      
      expect(content).toContain('appName');
      expect(content).toContain('appChainIds');
      expect(content).toContain('84532'); // Base Sepolia chain ID
    });
  });

  describe('Provider Management', () => {
    test('should have provider.ts module', () => {
      const providerPath = path.join(harnessDir, 'lib/provider.ts');
      expect(fs.existsSync(providerPath)).toBe(true);
    });

    test('should export getProvider function', () => {
      const providerPath = path.join(harnessDir, 'lib/provider.ts');
      const content = fs.readFileSync(providerPath, 'utf8');
      
      expect(content).toContain('export function getProvider');
      expect(content).toContain('sdk.getProvider()');
    });

    test('should handle provider singleton', () => {
      const providerPath = path.join(harnessDir, 'lib/provider.ts');
      const content = fs.readFileSync(providerPath, 'utf8');
      
      expect(content).toContain('let provider');
      expect(content).toContain('if (!provider)');
    });
  });

  describe('Connection Handling', () => {
    test('should export connection functions', () => {
      const basePath = path.join(harnessDir, 'lib/base-account.ts');
      const content = fs.readFileSync(basePath, 'utf8');
      
      expect(content).toContain('export async function connectWallet');
      expect(content).toContain('eth_requestAccounts');
    });

    test('should export connection status check', () => {
      const basePath = path.join(harnessDir, 'lib/base-account.ts');
      const content = fs.readFileSync(basePath, 'utf8');
      
      expect(content).toContain('export function isConnected');
      expect(content).toContain('return');
      expect(content).toContain('boolean');
    });

    test('should handle Base Sepolia chain switching', () => {
      const basePath = path.join(harnessDir, 'lib/base-account.ts');
      const content = fs.readFileSync(basePath, 'utf8');
      
      expect(content).toContain('wallet_switchEthereumChain');
      expect(content).toContain('0x14a34'); // Base Sepolia hex chain ID
    });
  });

  describe('Type Definitions', () => {
    test('should have type definitions for SDK', () => {
      const content = fs.readFileSync(
        path.join(harnessDir, 'lib/base-account.ts'), 
        'utf8'
      );
      
      expect(content).toContain('import type');
      expect(content).toContain('ReturnType<typeof createBaseAccountSDK>');
    });
  });
});