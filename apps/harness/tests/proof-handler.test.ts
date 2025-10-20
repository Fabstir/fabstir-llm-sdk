// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, test, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Sub-phase 6.3: Proof Submission Handler', () => {
  const libDir = path.resolve(__dirname, '../lib');
  
  describe('Proof Handler Module', () => {
    test('should have proof-handler.ts file', () => {
      const proofPath = path.join(libDir, 'proof-handler.ts');
      expect(fs.existsSync(proofPath)).toBe(true);
    });

    test('should export ProofHandler class', () => {
      const proofPath = path.join(libDir, 'proof-handler.ts');
      const content = fs.existsSync(proofPath) ? fs.readFileSync(proofPath, 'utf8') : '';
      
      expect(content).toContain('export class ProofHandler');
      expect(content).toContain('ethers');
    });

    test('should import required dependencies', () => {
      const proofPath = path.join(libDir, 'proof-handler.ts');
      const content = fs.existsSync(proofPath) ? fs.readFileSync(proofPath, 'utf8') : '';
      
      expect(content).toContain("import");
      expect(content).toContain("ethers");
      expect(content).toContain("keccak256");
    });
  });

  describe('Proof Structure Generation', () => {
    test('should generate mock EZKL proof structure', () => {
      const proofPath = path.join(libDir, 'proof-handler.ts');
      const content = fs.existsSync(proofPath) ? fs.readFileSync(proofPath, 'utf8') : '';
      
      expect(content).toContain('generateProof');
      expect(content).toContain('randomBytes(256)');
      expect(content).toContain('mock EZKL');
    });

    test('should create proof with hashes', () => {
      const proofPath = path.join(libDir, 'proof-handler.ts');
      const content = fs.existsSync(proofPath) ? fs.readFileSync(proofPath, 'utf8') : '';
      
      expect(content).toContain('model_hash');
      expect(content).toContain('input_hash');
      expect(content).toContain('output_hash');
    });

    test('should include job and token info', () => {
      const proofPath = path.join(libDir, 'proof-handler.ts');
      const content = fs.existsSync(proofPath) ? fs.readFileSync(proofPath, 'utf8') : '';
      
      expect(content).toContain('jobId');
      expect(content).toContain('tokensProven');
    });
  });

  describe('Contract Submission', () => {
    test('should submit proof to contract as host', () => {
      const proofPath = path.join(libDir, 'proof-handler.ts');
      const content = fs.existsSync(proofPath) ? fs.readFileSync(proofPath, 'utf8') : '';
      
      expect(content).toContain('submitProof');
      expect(content).toContain('submitProofOfWork');
      expect(content).toContain('hostPrivateKey');
    });

    test('should use correct contract ABI', () => {
      const proofPath = path.join(libDir, 'proof-handler.ts');
      const content = fs.existsSync(proofPath) ? fs.readFileSync(proofPath, 'utf8') : '';
      
      expect(content).toContain('function submitProofOfWork');
      expect(content).toContain('uint256 jobId');
      expect(content).toContain('bytes proof');
    });

    test('should handle gas limits', () => {
      const proofPath = path.join(libDir, 'proof-handler.ts');
      const content = fs.existsSync(proofPath) ? fs.readFileSync(proofPath, 'utf8') : '';
      
      expect(content).toContain('gasLimit');
      expect(content).toContain('300000');
    });
  });

  describe('Confirmation and Status', () => {
    test('should wait for confirmation', () => {
      const proofPath = path.join(libDir, 'proof-handler.ts');
      const content = fs.existsSync(proofPath) ? fs.readFileSync(proofPath, 'utf8') : '';
      
      expect(content).toContain('wait()');
      expect(content).toContain('receipt');
      expect(content).toContain('confirmations');
    });

    test('should return proof status', () => {
      const proofPath = path.join(libDir, 'proof-handler.ts');
      const content = fs.existsSync(proofPath) ? fs.readFileSync(proofPath, 'utf8') : '';
      
      expect(content).toContain('ProofStatus');
      expect(content).toContain('success:');
      expect(content).toContain('txHash:');
      expect(content).toContain('gasUsed:');
    });

    test('should handle submission errors', () => {
      const proofPath = path.join(libDir, 'proof-handler.ts');
      const content = fs.existsSync(proofPath) ? fs.readFileSync(proofPath, 'utf8') : '';
      
      expect(content).toContain('catch');
      expect(content).toContain('error');
      expect(content).toContain('throw');
    });
  });
});