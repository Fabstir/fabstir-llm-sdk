import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

describe('Error Handling', () => {
  const cliPath = path.join(__dirname, '../../dist/index.js');

  it('should show error for unknown command', () => {
    try {
      execSync(`node ${cliPath} unknown`, { encoding: 'utf8', stdio: 'pipe' });
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      const output = error.stderr || error.stdout || '';
      expect(output).toContain("error: unknown command 'unknown'");
    }
  });

  it('should suggest help for unknown command', () => {
    try {
      execSync(`node ${cliPath} unknowncmd`, { encoding: 'utf8', stdio: 'pipe' });
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      const output = error.stderr || error.stdout || '';
      expect(output).toContain('unknowncmd');
    }
  });

  it('should handle invalid options gracefully', () => {
    try {
      execSync(`node ${cliPath} --invalid-option`, { encoding: 'utf8', stdio: 'pipe' });
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      const output = error.stderr || error.stdout || '';
      expect(output).toContain("error: unknown option '--invalid-option'");
    }
  });

  it('should handle command with invalid option', () => {
    try {
      execSync(`node ${cliPath} init --invalid`, { encoding: 'utf8', stdio: 'pipe' });
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      const output = error.stderr || error.stdout || '';
      expect(output).toContain("error: unknown option '--invalid'");
    }
  });

  it('should exit with non-zero code for errors', () => {
    try {
      execSync(`node ${cliPath} unknown`, { encoding: 'utf8', stdio: 'pipe' });
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.status).toBeGreaterThan(0);
    }
  });
});