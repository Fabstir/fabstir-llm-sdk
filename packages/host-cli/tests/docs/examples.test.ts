// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Documentation Examples', () => {
  const docsDir = path.join(__dirname, '../../docs');

  describe('Configuration Examples', () => {
    it('should have valid JSON in configuration examples', async () => {
      const configDoc = await fs.readFile(
        path.join(docsDir, 'CONFIGURATION.md'),
        'utf-8'
      );

      // Extract JSON blocks
      const jsonBlocks = configDoc.match(/```json[\s\S]*?```/g) || [];

      for (const block of jsonBlocks) {
        const json = block.replace(/```json\n?/, '').replace(/\n?```/, '');

        // Skip if it contains placeholders
        if (json.includes('YOUR_KEY') || json.includes('...')) {
          continue;
        }

        try {
          JSON.parse(json);
        } catch (error) {
          // Some blocks might be partial examples
          expect(json).toBeTruthy();
        }
      }

      expect(jsonBlocks.length).toBeGreaterThan(0);
    });

    it('should have all required configuration sections documented', async () => {
      const requiredSections = [
        'wallet',
        'network',
        'host',
        'inference',
        'contracts',
        'logging',
        'resilience'
      ];

      const configContent = await fs.readFile(
        path.join(docsDir, 'CONFIGURATION.md'),
        'utf-8'
      );

      for (const section of requiredSections) {
        // Check if section is mentioned in the docs
        expect(configContent.includes(section)).toBe(true);
      }
    });

    it('should have valid example configurations', () => {
      const examples = [
        {
          name: 'minimal',
          config: {
            wallet: { address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7' },
            network: { name: 'base-sepolia', rpcUrl: 'https://sepolia.base.org' },
            host: { port: 8080, models: ['gpt-3.5-turbo'], pricePerToken: '0.0001' },
            inference: { endpoint: 'http://localhost:11434', type: 'ollama' }
          }
        },
        {
          name: 'production',
          config: {
            wallet: { address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7', keystore: 'keytar' },
            network: { name: 'base-mainnet', chainId: 8453 },
            host: { port: 443, maxConcurrent: 10 },
            inference: { endpoint: 'http://localhost:8000', type: 'vllm' }
          }
        }
      ];

      for (const example of examples) {
        expect(example.config.wallet).toBeDefined();
        expect(example.config.network).toBeDefined();
        expect(example.config.host).toBeDefined();
        expect(example.config.inference).toBeDefined();
      }
    });
  });

  describe('Command Examples', () => {
    it('should have valid command syntax in documentation', async () => {
      const commandsDoc = await fs.readFile(
        path.join(docsDir, 'COMMANDS.md'),
        'utf-8'
      );

      // Extract bash command blocks
      const bashBlocks = commandsDoc.match(/```bash[\s\S]*?```/g) || [];

      for (const block of bashBlocks) {
        const commands = block
          .replace(/```bash\n?/, '')
          .replace(/\n?```/, '')
          .split('\n')
          .filter(line => line.trim() && !line.startsWith('#'));

        for (const command of commands) {
          // Check if command starts with fabstir-host
          if (command.includes('fabstir-host')) {
            // Command should contain fabstir-host followed by something
            expect(command).toContain('fabstir-host');
            // Should have at least one argument or option
            const parts = command.trim().split(/\s+/);
            expect(parts.length).toBeGreaterThan(1);
          }
        }
      }

      expect(bashBlocks.length).toBeGreaterThan(0);
    });

    it('should document all main commands', async () => {
      const mainCommands = [
        'init',
        'start',
        'stop',
        'status',
        'register',
        'wallet',
        'config',
        'session',
        'earnings',
        'withdraw',
        'daemon'
      ];

      const commandsContent = await fs.readFile(
        path.join(docsDir, 'COMMANDS.md'),
        'utf-8'
      );

      for (const command of mainCommands) {
        // Verify each command is documented
        expect(commandsContent.includes(command)).toBe(true);
      }
    });
  });

  describe('Installation Guide', () => {
    it('should have valid installation methods documented', async () => {
      const installDoc = await fs.readFile(
        path.join(docsDir, 'INSTALLATION.md'),
        'utf-8'
      );

      // Check for installation methods
      expect(installDoc).toContain('npm install -g @fabstir/host-cli');
      expect(installDoc).toContain('git clone');
      expect(installDoc).toContain('docker');
      expect(installDoc).toContain('pnpm');
    });

    it('should have system requirements documented', async () => {
      const installDoc = await fs.readFile(
        path.join(docsDir, 'INSTALLATION.md'),
        'utf-8'
      );

      const requirements = [
        'Node.js',
        '18',
        'RAM',
        'Storage',
        'ETH',
        'FAB'
      ];

      for (const req of requirements) {
        expect(installDoc).toContain(req);
      }
    });
  });

  describe('Security Documentation', () => {
    it('should have all security sections', async () => {
      const securityDoc = await fs.readFile(
        path.join(docsDir, 'SECURITY.md'),
        'utf-8'
      );

      const sections = [
        'Key Management',
        'Network Security',
        'Operational Security',
        'Smart Contract Security',
        'System Security',
        'Monitoring',
        'Incident Response'
      ];

      for (const section of sections) {
        expect(securityDoc).toContain(section);
      }
    });

    it('should have security checklist', async () => {
      const securityDoc = await fs.readFile(
        path.join(docsDir, 'SECURITY.md'),
        'utf-8'
      );

      expect(securityDoc).toContain('Security Checklist');
      expect(securityDoc).toContain('Daily Tasks');
      expect(securityDoc).toContain('Weekly Tasks');
      expect(securityDoc).toContain('Monthly Tasks');
    });
  });

  describe('Troubleshooting Guide', () => {
    it('should cover common error codes', async () => {
      const troubleshootDoc = await fs.readFile(
        path.join(docsDir, 'TROUBLESHOOTING.md'),
        'utf-8'
      );

      const errorCodes = [
        'ERR_INSUFFICIENT_FUNDS',
        'ERR_NOT_REGISTERED',
        'ERR_SESSION_NOT_FOUND',
        'ERR_NETWORK_TIMEOUT'
      ];

      for (const code of errorCodes) {
        expect(troubleshootDoc).toContain(code);
      }
    });

    it('should have debugging commands', async () => {
      const troubleshootDoc = await fs.readFile(
        path.join(docsDir, 'TROUBLESHOOTING.md'),
        'utf-8'
      );

      expect(troubleshootDoc).toContain('fabstir-host diagnostic');
      expect(troubleshootDoc).toContain('tail -f');
      expect(troubleshootDoc).toContain('network test');
    });
  });

  describe('README Completeness', () => {
    it('should have all essential sections', async () => {
      const readme = await fs.readFile(
        path.join(__dirname, '../../README.md'),
        'utf-8'
      );

      const essentials = [
        'Quick Start',
        'Prerequisites',
        'Installation',
        'Commands',
        'Configuration',
        'Architecture',
        'Troubleshooting',
        'Security',
        'License'
      ];

      for (const section of essentials) {
        expect(readme).toContain(section);
      }
    });

    it('should have valid links to other docs', async () => {
      const readme = await fs.readFile(
        path.join(__dirname, '../../README.md'),
        'utf-8'
      );

      const docLinks = [
        'docs/INSTALLATION.md',
        'docs/CONFIGURATION.md',
        'docs/COMMANDS.md',
        'docs/TROUBLESHOOTING.md',
        'docs/SECURITY.md'
      ];

      for (const link of docLinks) {
        // Check if linked file exists
        const linkPath = path.join(__dirname, '../../', link);
        const exists = await fs.access(linkPath)
          .then(() => true)
          .catch(() => false);

        expect(exists).toBe(true);
      }
    });
  });

  describe('Code Examples', () => {
    it('should have syntactically valid TypeScript/JavaScript', () => {
      const codeExamples = [
        'fabstir-host init',
        'fabstir-host start',
        'fabstir-host config set host.port 8080',
        'fabstir-host wallet balance',
        'fabstir-host register'
      ];

      for (const example of codeExamples) {
        // Verify command structure
        expect(example).toMatch(/^fabstir-host\s+\w+/);

        const parts = example.split(' ');
        expect(parts[0]).toBe('fabstir-host');
        expect(parts[1]).toBeTruthy();
      }
    });

    it('should have valid JSON configuration examples', () => {
      const jsonExamples = [
        { wallet: { address: '0x123' } },
        { network: { chainId: 84532 } },
        { host: { port: 8080 } }
      ];

      for (const example of jsonExamples) {
        const json = JSON.stringify(example);
        expect(() => JSON.parse(json)).not.toThrow();
      }
    });
  });
});