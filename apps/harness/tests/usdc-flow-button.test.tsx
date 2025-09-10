import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Sub-phase 5.4: USDC Flow Button Component', () => {
  const componentsDir = path.resolve(__dirname, '../components');
  
  describe('USDCFlowButton Component', () => {
    test('should have USDCFlowButton.tsx file', () => {
      const buttonPath = path.join(componentsDir, 'USDCFlowButton.tsx');
      expect(fs.existsSync(buttonPath)).toBe(true);
    });

    test('should export USDCFlowButton component', () => {
      const buttonPath = path.join(componentsDir, 'USDCFlowButton.tsx');
      const content = fs.existsSync(buttonPath) ? fs.readFileSync(buttonPath, 'utf8') : '';
      
      expect(content).toContain('export function USDCFlowButton');
      expect(content).toContain('USDCFlowButtonProps');
    });

    test('should accept required props', () => {
      const buttonPath = path.join(componentsDir, 'USDCFlowButton.tsx');
      const content = fs.existsSync(buttonPath) ? fs.readFileSync(buttonPath, 'utf8') : '';
      
      expect(content).toContain('smartAccount');
      expect(content).toContain('onSuccess');
      expect(content).toContain('onError');
    });

    test('should use buildSessionJobBatch', () => {
      const buttonPath = path.join(componentsDir, 'USDCFlowButton.tsx');
      const content = fs.existsSync(buttonPath) ? fs.readFileSync(buttonPath, 'utf8') : '';
      
      expect(content).toContain('buildSessionJobBatch');
      expect(content).toContain('../lib/call-builder');
    });
  });

  describe('Batch Execution', () => {
    test('should execute wallet_sendCalls', () => {
      const buttonPath = path.join(componentsDir, 'USDCFlowButton.tsx');
      const content = fs.existsSync(buttonPath) ? fs.readFileSync(buttonPath, 'utf8') : '';
      
      expect(content).toContain('wallet_sendCalls');
      expect(content).toContain('window.ethereum');
    });

    test('should handle approve and create calls', () => {
      const buttonPath = path.join(componentsDir, 'USDCFlowButton.tsx');
      const content = fs.existsSync(buttonPath) ? fs.readFileSync(buttonPath, 'utf8') : '';
      
      expect(content).toContain('approveCall');
      expect(content).toContain('createCall');
      expect(content).toContain('atomic');
    });

    test('should use parseUnits for USDC amounts', () => {
      const buttonPath = path.join(componentsDir, 'USDCFlowButton.tsx');
      const content = fs.existsSync(buttonPath) ? fs.readFileSync(buttonPath, 'utf8') : '';
      
      expect(content).toContain('parseUnits');
      expect(content).toContain('USDC_DECIMALS');
      expect(content).toContain('6');
    });
  });

  describe('Status Handling', () => {
    test('should track loading state', () => {
      const buttonPath = path.join(componentsDir, 'USDCFlowButton.tsx');
      const content = fs.existsSync(buttonPath) ? fs.readFileSync(buttonPath, 'utf8') : '';
      
      expect(content).toContain('loading');
      expect(content).toContain('setLoading');
      expect(content).toContain('useState');
    });

    test('should display status messages', () => {
      const buttonPath = path.join(componentsDir, 'USDCFlowButton.tsx');
      const content = fs.existsSync(buttonPath) ? fs.readFileSync(buttonPath, 'utf8') : '';
      
      expect(content).toContain('status');
      expect(content).toContain('Approving USDC');
      expect(content).toContain('Creating session');
    });

    test('should poll for transaction status', () => {
      const buttonPath = path.join(componentsDir, 'USDCFlowButton.tsx');
      const content = fs.existsSync(buttonPath) ? fs.readFileSync(buttonPath, 'utf8') : '';
      
      expect(content).toContain('wallet_getCallsStatus');
      expect(content).toContain('CONFIRMED');
    });
  });

  describe('UI Elements', () => {
    test('should render button with proper text', () => {
      const buttonPath = path.join(componentsDir, 'USDCFlowButton.tsx');
      const content = fs.existsSync(buttonPath) ? fs.readFileSync(buttonPath, 'utf8') : '';
      
      expect(content).toContain('<button');
      expect(content).toContain('Create Session Job');
      expect(content).toContain('disabled={loading');
    });

    test('should show transaction result', () => {
      const buttonPath = path.join(componentsDir, 'USDCFlowButton.tsx');
      const content = fs.existsSync(buttonPath) ? fs.readFileSync(buttonPath, 'utf8') : '';
      
      expect(content).toContain('sessionId');
      expect(content).toContain('txHash');
    });
  });
});