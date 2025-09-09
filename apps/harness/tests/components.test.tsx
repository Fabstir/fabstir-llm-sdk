import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Sub-phase 2.6: UI Components', () => {
  const componentsDir = path.resolve(__dirname, '../components');
  const pagesDir = path.resolve(__dirname, '../pages');
  
  describe('RunButton Component', () => {
    test('should have RunButton.tsx component', () => {
      const buttonPath = path.join(componentsDir, 'RunButton.tsx');
      expect(fs.existsSync(buttonPath)).toBe(true);
    });

    test('should have onClick handler', () => {
      const buttonPath = path.join(componentsDir, 'RunButton.tsx');
      const content = fs.readFileSync(buttonPath, 'utf8');
      
      expect(content).toContain('onClick');
      expect(content).toContain('disabled');
      expect(content).toContain('loading');
    });

    test('should trigger batch calls', () => {
      const buttonPath = path.join(componentsDir, 'RunButton.tsx');
      const content = fs.readFileSync(buttonPath, 'utf8');
      
      expect(content).toContain('executeBatch');
      expect(content).toContain('buildUSDCApprovalCall');
      expect(content).toContain('buildJobCreationCall');
    });
  });

  describe('StatusDisplay Component', () => {
    test('should have StatusDisplay.tsx component', () => {
      const statusPath = path.join(componentsDir, 'StatusDisplay.tsx');
      expect(fs.existsSync(statusPath)).toBe(true);
    });

    test('should display transaction status', () => {
      const statusPath = path.join(componentsDir, 'StatusDisplay.tsx');
      const content = fs.readFileSync(statusPath, 'utf8');
      
      expect(content).toContain('status');
      expect(content).toContain('transactionHash');
      expect(content).toContain('message');
    });

    test('should handle different states', () => {
      const statusPath = path.join(componentsDir, 'StatusDisplay.tsx');
      const content = fs.readFileSync(statusPath, 'utf8');
      
      expect(content).toContain('idle');
      expect(content).toContain('pending');
      expect(content).toContain('success');
      expect(content).toContain('error');
    });
  });

  describe('Run Page Integration', () => {
    test('should have run.tsx page', () => {
      const runPath = path.join(pagesDir, 'run.tsx');
      expect(fs.existsSync(runPath)).toBe(true);
    });

    test('should import components', () => {
      const runPath = path.join(pagesDir, 'run.tsx');
      const content = fs.readFileSync(runPath, 'utf8');
      
      expect(content).toContain('import { RunButton }');
      expect(content).toContain('import { StatusDisplay }');
      expect(content).toContain('../components');
    });

    test('should use React hooks', () => {
      const runPath = path.join(pagesDir, 'run.tsx');
      const content = fs.readFileSync(runPath, 'utf8');
      
      expect(content).toContain('useState');
      expect(content).toContain('useEffect');
      expect(content).toContain('useSubAccount');
    });
  });

  describe('Loading States', () => {
    test('RunButton should show loading state', () => {
      const buttonPath = path.join(componentsDir, 'RunButton.tsx');
      const content = fs.readFileSync(buttonPath, 'utf8');
      
      expect(content).toContain('loading ?');
      expect(content).toContain('Processing...');
      expect(content).toContain('Run sponsored batch');
    });

    test('StatusDisplay should show loading indicator', () => {
      const statusPath = path.join(componentsDir, 'StatusDisplay.tsx');
      const content = fs.readFileSync(statusPath, 'utf8');
      
      expect(content).toContain('pending');
      expect(content).toContain('Submitting transaction...');
    });
  });

  describe('Result Display', () => {
    test('should show success message', () => {
      const statusPath = path.join(componentsDir, 'StatusDisplay.tsx');
      const content = fs.readFileSync(statusPath, 'utf8');
      
      expect(content).toContain('Transaction successful');
      expect(content).toContain('✓');
    });

    test('should show error message', () => {
      const statusPath = path.join(componentsDir, 'StatusDisplay.tsx');
      const content = fs.readFileSync(statusPath, 'utf8');
      
      expect(content).toContain('Transaction failed');
      expect(content).toContain('✗');
    });
  });
});