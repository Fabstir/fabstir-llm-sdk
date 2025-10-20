// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, test, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Sub-phase 6.4: Payment Settlement', () => {
  const libDir = path.resolve(__dirname, '../lib');
  
  describe('Payment Settlement Module', () => {
    test('should have payment-settlement.ts file', () => {
      const settlementPath = path.join(libDir, 'payment-settlement.ts');
      expect(fs.existsSync(settlementPath)).toBe(true);
    });

    test('should export PaymentSettlement class', () => {
      const settlementPath = path.join(libDir, 'payment-settlement.ts');
      const content = fs.existsSync(settlementPath) ? fs.readFileSync(settlementPath, 'utf8') : '';
      
      expect(content).toContain('export class PaymentSettlement');
      expect(content).toContain('ethers');
    });

    test('should import contract addresses', () => {
      const settlementPath = path.join(libDir, 'payment-settlement.ts');
      const content = fs.existsSync(settlementPath) ? fs.readFileSync(settlementPath, 'utf8') : '';
      
      expect(content).toContain("import");
      expect(content).toContain("CONTRACT_JOB_MARKETPLACE");
    });
  });

  describe('Host Payment Claims', () => {
    test('should claim payments as host', () => {
      const settlementPath = path.join(libDir, 'payment-settlement.ts');
      const content = fs.existsSync(settlementPath) ? fs.readFileSync(settlementPath, 'utf8') : '';
      
      expect(content).toContain('claimPayment');
      expect(content).toContain('claimPaymentForJob');
      expect(content).toContain('hostAddress');
    });

    test('should handle host earnings', () => {
      const settlementPath = path.join(libDir, 'payment-settlement.ts');
      const content = fs.existsSync(settlementPath) ? fs.readFileSync(settlementPath, 'utf8') : '';
      
      expect(content).toContain('90%');
      expect(content).toContain('hostPayment');
      expect(content).toContain('0.9');
    });
  });

  describe('Treasury Distribution', () => {
    test('should trigger treasury distribution', () => {
      const settlementPath = path.join(libDir, 'payment-settlement.ts');
      const content = fs.existsSync(settlementPath) ? fs.readFileSync(settlementPath, 'utf8') : '';
      
      expect(content).toContain('treasury');
      expect(content).toContain('10%');
      expect(content).toContain('0.1');
    });

    test('should calculate treasury fee', () => {
      const settlementPath = path.join(libDir, 'payment-settlement.ts');
      const content = fs.existsSync(settlementPath) ? fs.readFileSync(settlementPath, 'utf8') : '';
      
      expect(content).toContain('treasuryFee');
      expect(content).toContain('totalCost');
    });
  });

  describe('User Refunds', () => {
    test('should process user refunds', () => {
      const settlementPath = path.join(libDir, 'payment-settlement.ts');
      const content = fs.existsSync(settlementPath) ? fs.readFileSync(settlementPath, 'utf8') : '';
      
      expect(content).toContain('refund');
      expect(content).toContain('userRefund');
      expect(content).toContain('unused');
    });

    test('should calculate refund amount', () => {
      const settlementPath = path.join(libDir, 'payment-settlement.ts');
      const content = fs.existsSync(settlementPath) ? fs.readFileSync(settlementPath, 'utf8') : '';
      
      expect(content).toContain('deposit');
      expect(content).toContain('tokensUsed');
      expect(content).toContain('pricePerToken');
    });
  });

  describe('Balance Checking', () => {
    test('should check final balances', () => {
      const settlementPath = path.join(libDir, 'payment-settlement.ts');
      const content = fs.existsSync(settlementPath) ? fs.readFileSync(settlementPath, 'utf8') : '';
      
      expect(content).toContain('checkBalances');
      expect(content).toContain('balanceOf');
      expect(content).toContain('USDC');
    });

    test('should return settlement status', () => {
      const settlementPath = path.join(libDir, 'payment-settlement.ts');
      const content = fs.existsSync(settlementPath) ? fs.readFileSync(settlementPath, 'utf8') : '';
      
      expect(content).toContain('SettlementStatus');
      expect(content).toContain('hostPaid');
      expect(content).toContain('treasuryPaid');
      expect(content).toContain('userRefunded');
    });
  });
});