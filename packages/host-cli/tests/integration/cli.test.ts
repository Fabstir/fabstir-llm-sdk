// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for CLI Integration (Sub-phase 3.2)
 * TDD: These tests are written FIRST and should FAIL until implementation is complete
 */

import { describe, test, expect } from 'vitest';
import { execSync } from 'child_process';
import * as path from 'path';

// Path to the CLI entry point
const CLI_PATH = path.join(__dirname, '../../src/index.ts');

describe('CLI Integration - Serve Command', () => {
  test('should show serve command in help output', () => {
    // Run fabstir-host --help
    const output = execSync(`npx tsx ${CLI_PATH} --help`, {
      encoding: 'utf8',
      cwd: path.join(__dirname, '../..')
    });

    // Should show serve command in help
    expect(output).toContain('serve');
    expect(output).toContain('Start management API server');
  });

  test('should show serve command options in serve help', () => {
    // Run fabstir-host serve --help
    const output = execSync(`npx tsx ${CLI_PATH} serve --help`, {
      encoding: 'utf8',
      cwd: path.join(__dirname, '../..')
    });

    // Should show command description
    expect(output).toContain('Start management API server for browser control');

    // Should show port option
    expect(output).toContain('-p, --port');

    // Should show API key option
    expect(output).toContain('--api-key');

    // Should show CORS option
    expect(output).toContain('--cors');
  });

  test('should register serve command in program', () => {
    // Run fabstir-host --help to see all commands
    const output = execSync(`npx tsx ${CLI_PATH} --help`, {
      encoding: 'utf8',
      cwd: path.join(__dirname, '../..')
    });

    // Get all command lines from output
    const commandSection = output.split('Commands:')[1];
    expect(commandSection).toBeDefined();

    // Should include serve command in the commands list
    expect(commandSection).toContain('serve');

    // Verify serve appears in the correct section (not in options)
    const optionsSection = output.split('Options:')[1].split('Commands:')[0];
    expect(optionsSection).not.toContain('serve [options]');
  });
});
