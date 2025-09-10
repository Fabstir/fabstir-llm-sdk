import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Sub-phase 5.3: Session Job Call Builder', () => {
  const libDir = path.resolve(__dirname, '../lib');
  
  describe('Call Builder Updates', () => {
    test('should have call-builder.ts file', () => {
      const builderPath = path.join(libDir, 'call-builder.ts');
      expect(fs.existsSync(builderPath)).toBe(true);
    });

    test('should export buildCreateSessionJobWithTokenCall function', () => {
      const builderPath = path.join(libDir, 'call-builder.ts');
      const content = fs.existsSync(builderPath) ? fs.readFileSync(builderPath, 'utf8') : '';
      
      expect(content).toContain('export function buildCreateSessionJobWithTokenCall');
      expect(content).toContain('createSessionJobWithToken');
    });

    test('should have correct function parameters', () => {
      const builderPath = path.join(libDir, 'call-builder.ts');
      const content = fs.existsSync(builderPath) ? fs.readFileSync(builderPath, 'utf8') : '';
      
      expect(content).toContain('host');
      expect(content).toContain('token');
      expect(content).toContain('deposit');
      expect(content).toContain('pricePerToken');
      expect(content).toContain('duration');
      expect(content).toContain('proofInterval');
    });

    test('should use correct contract address', () => {
      const builderPath = path.join(libDir, 'call-builder.ts');
      const content = fs.existsSync(builderPath) ? fs.readFileSync(builderPath, 'utf8') : '';
      
      expect(content).toContain('0xD937c594682Fe74E6e3d06239719805C04BE804A');
      expect(content).toContain('JOB_MARKETPLACE');
    });

    test('should have USDC address constant', () => {
      const builderPath = path.join(libDir, 'call-builder.ts');
      const content = fs.existsSync(builderPath) ? fs.readFileSync(builderPath, 'utf8') : '';
      
      expect(content).toContain('USDC_ADDRESS');
      expect(content).toContain('0x036CbD53842c5426634e7929541eC2318f3dCF7e');
    });
  });

  describe('ABI Structure', () => {
    test('should have correct ABI for createSessionJobWithToken', () => {
      const builderPath = path.join(libDir, 'call-builder.ts');
      const content = fs.existsSync(builderPath) ? fs.readFileSync(builderPath, 'utf8') : '';
      
      expect(content).toContain('abi:');
      expect(content).toContain('type: \'function\'');
      expect(content).toContain('name: \'createSessionJobWithToken\'');
    });

    test('should have proper input types', () => {
      const builderPath = path.join(libDir, 'call-builder.ts');
      const content = fs.existsSync(builderPath) ? fs.readFileSync(builderPath, 'utf8') : '';
      
      expect(content).toContain('type: \'address\'');
      expect(content).toContain('type: \'uint256\'');
    });

    test('should return encoded function data', () => {
      const builderPath = path.join(libDir, 'call-builder.ts');
      const content = fs.existsSync(builderPath) ? fs.readFileSync(builderPath, 'utf8') : '';
      
      expect(content).toContain('encodeFunctionData');
      expect(content).toContain('return');
      expect(content).toContain('data');
    });
  });

  describe('Batch Call Structure', () => {
    test('should export buildSessionJobBatch function', () => {
      const builderPath = path.join(libDir, 'call-builder.ts');
      const content = fs.existsSync(builderPath) ? fs.readFileSync(builderPath, 'utf8') : '';
      
      expect(content).toContain('export function buildSessionJobBatch');
      expect(content).toContain('BatchCall[]');
    });

    test('should build approve and create calls', () => {
      const builderPath = path.join(libDir, 'call-builder.ts');
      const content = fs.existsSync(builderPath) ? fs.readFileSync(builderPath, 'utf8') : '';
      
      expect(content).toContain('buildUSDCApprovalCall');
      expect(content).toContain('buildCreateSessionJobWithTokenCall');
      expect(content).toContain('[approveCall, createCall]');
    });

    test('should have HOST_ADDRESS constant', () => {
      const builderPath = path.join(libDir, 'call-builder.ts');
      const content = fs.existsSync(builderPath) ? fs.readFileSync(builderPath, 'utf8') : '';
      
      expect(content).toContain('HOST_ADDRESS');
      expect(content).toContain('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7');
    });
  });

  describe('Parameter Validation', () => {
    test('should validate deposit amount', () => {
      const builderPath = path.join(libDir, 'call-builder.ts');
      const content = fs.existsSync(builderPath) ? fs.readFileSync(builderPath, 'utf8') : '';
      
      expect(content.includes('deposit > 0') || content.includes('deposit <= 0')).toBe(true);
    });

    test('should validate duration', () => {
      const builderPath = path.join(libDir, 'call-builder.ts');
      const content = fs.existsSync(builderPath) ? fs.readFileSync(builderPath, 'utf8') : '';
      
      expect(content.includes('duration > 0') || content.includes('duration <= 0')).toBe(true);
    });
  });
});