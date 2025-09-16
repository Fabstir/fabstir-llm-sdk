import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

describe('CLI Command Parsing', () => {
  const cliPath = path.join(__dirname, '../../dist/index.js');

  it('should display help when no command provided', () => {
    const output = execSync(`node ${cliPath}`, { encoding: 'utf8' });
    expect(output).toContain('Usage:');
    expect(output).toContain('Commands:');
    expect(output).toContain('Options:');
  });

  it('should handle init command', () => {
    const output = execSync(`node ${cliPath} init`, { encoding: 'utf8' });
    expect(output).toContain('Init command - to be implemented');
  });

  it('should handle start command', () => {
    const output = execSync(`node ${cliPath} start`, { encoding: 'utf8' });
    expect(output).toContain('Start command - to be implemented');
  });

  it('should handle stop command', () => {
    const output = execSync(`node ${cliPath} stop`, { encoding: 'utf8' });
    expect(output).toContain('Stop command - to be implemented');
  });

  it('should handle status command', () => {
    const output = execSync(`node ${cliPath} status`, { encoding: 'utf8' });
    expect(output).toContain('Status command - to be implemented');
  });

  it('should show error for unknown command', () => {
    try {
      execSync(`node ${cliPath} unknown`, { encoding: 'utf8' });
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.stderr || error.stdout).toContain("error: unknown command 'unknown'");
    }
  });

  it('should display version with --version flag', () => {
    const output = execSync(`node ${cliPath} --version`, { encoding: 'utf8' });
    expect(output.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should display help with --help flag', () => {
    const output = execSync(`node ${cliPath} --help`, { encoding: 'utf8' });
    expect(output).toContain('Usage:');
    expect(output).toContain('fabstir-host');
  });
});