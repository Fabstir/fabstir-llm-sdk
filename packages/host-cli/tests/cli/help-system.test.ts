// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

describe('Help System', () => {
  const cliPath = path.join(__dirname, '../../dist/index.js');

  it('should show help when no arguments provided', () => {
    const output = execSync(`node ${cliPath}`, { encoding: 'utf8' });
    expect(output).toContain('Usage:');
    expect(output).toContain('fabstir-host');
  });

  it('should show global help with --help', () => {
    const output = execSync(`node ${cliPath} --help`, { encoding: 'utf8' });
    expect(output).toContain('CLI tool for managing Fabstir host nodes');
    expect(output).toContain('Commands:');
  });

  it('should show global help with -h', () => {
    const output = execSync(`node ${cliPath} -h`, { encoding: 'utf8' });
    expect(output).toContain('CLI tool for managing Fabstir host nodes');
  });

  it('should show command-specific help for init', () => {
    const output = execSync(`node ${cliPath} init --help`, { encoding: 'utf8' });
    expect(output).toContain('Initialize host configuration');
  });

  it('should show command-specific help for start', () => {
    const output = execSync(`node ${cliPath} start --help`, { encoding: 'utf8' });
    expect(output).toContain('Start the host node');
  });

  it('should show command-specific help for stop', () => {
    const output = execSync(`node ${cliPath} stop --help`, { encoding: 'utf8' });
    expect(output).toContain('Stop the host node');
  });

  it('should show command-specific help for status', () => {
    const output = execSync(`node ${cliPath} status --help`, { encoding: 'utf8' });
    expect(output).toContain('Check host status');
  });

  it('should display usage pattern', () => {
    const output = execSync(`node ${cliPath} --help`, { encoding: 'utf8' });
    expect(output).toContain('Usage:');
    expect(output).toContain('[options]');
    expect(output).toContain('[command]');
  });
});