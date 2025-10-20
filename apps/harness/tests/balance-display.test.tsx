// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Sub-phase 5.2: Balance Display Component', () => {
  const componentsDir = path.resolve(__dirname, '../components');
  const libDir = path.resolve(__dirname, '../lib');
  
  describe('BalanceDisplay Component', () => {
    test('should have BalanceDisplay.tsx file', () => {
      const displayPath = path.join(componentsDir, 'BalanceDisplay.tsx');
      expect(fs.existsSync(displayPath)).toBe(true);
    });

    test('should export BalanceDisplay component', () => {
      const displayPath = path.join(componentsDir, 'BalanceDisplay.tsx');
      const content = fs.existsSync(displayPath) ? fs.readFileSync(displayPath, 'utf8') : '';
      
      expect(content).toContain('export function BalanceDisplay');
      expect(content).toContain('BalanceDisplayProps');
    });

    test('should display Smart Account balance', () => {
      const displayPath = path.join(componentsDir, 'BalanceDisplay.tsx');
      const content = fs.existsSync(displayPath) ? fs.readFileSync(displayPath, 'utf8') : '';
      
      expect(content).toContain('Smart Account');
      expect(content).toContain('smartBalance');
    });

    test('should display Host balance', () => {
      const displayPath = path.join(componentsDir, 'BalanceDisplay.tsx');
      const content = fs.existsSync(displayPath) ? fs.readFileSync(displayPath, 'utf8') : '';
      
      expect(content).toContain('Host');
      expect(content).toContain('hostBalance');
    });

    test('should display Treasury balance', () => {
      const displayPath = path.join(componentsDir, 'BalanceDisplay.tsx');
      const content = fs.existsSync(displayPath) ? fs.readFileSync(displayPath, 'utf8') : '';
      
      expect(content).toContain('Treasury');
      expect(content).toContain('treasuryBalance');
    });

    test('should format USDC with proper decimals', () => {
      const displayPath = path.join(componentsDir, 'BalanceDisplay.tsx');
      const content = fs.existsSync(displayPath) ? fs.readFileSync(displayPath, 'utf8') : '';
      
      expect(content).toContain('formatUnits');
      expect(content).toContain('USDC_DECIMALS');
      expect(content).toContain('6');
    });
  });

  describe('Balance Fetcher Library', () => {
    test('should have balance-fetcher.ts file', () => {
      const fetcherPath = path.join(libDir, 'balance-fetcher.ts');
      expect(fs.existsSync(fetcherPath)).toBe(true);
    });

    test('should export fetchUSDCBalance function', () => {
      const fetcherPath = path.join(libDir, 'balance-fetcher.ts');
      const content = fs.existsSync(fetcherPath) ? fs.readFileSync(fetcherPath, 'utf8') : '';
      
      expect(content).toContain('export async function fetchUSDCBalance');
      expect(content).toContain('address');
    });

    test('should use USDC contract address', () => {
      const fetcherPath = path.join(libDir, 'balance-fetcher.ts');
      const content = fs.existsSync(fetcherPath) ? fs.readFileSync(fetcherPath, 'utf8') : '';
      
      expect(content).toContain('USDC_ADDRESS');
      expect(content).toContain('0x036CbD53842c5426634e7929541eC2318f3dCF7e');
    });

    test('should use ERC20 balanceOf method', () => {
      const fetcherPath = path.join(libDir, 'balance-fetcher.ts');
      const content = fs.existsSync(fetcherPath) ? fs.readFileSync(fetcherPath, 'utf8') : '';
      
      expect(content).toContain('balanceOf');
      expect(content).toContain('0x70a08231');
    });
  });

  describe('Component Features', () => {
    test('should have refresh functionality', () => {
      const displayPath = path.join(componentsDir, 'BalanceDisplay.tsx');
      const content = fs.existsSync(displayPath) ? fs.readFileSync(displayPath, 'utf8') : '';
      
      expect(content).toContain('refreshBalances');
      expect(content).toContain('useEffect');
    });

    test('should show loading state', () => {
      const displayPath = path.join(componentsDir, 'BalanceDisplay.tsx');
      const content = fs.existsSync(displayPath) ? fs.readFileSync(displayPath, 'utf8') : '';
      
      expect(content).toContain('loading');
      expect(content).toContain('Loading balances');
    });
  });
});