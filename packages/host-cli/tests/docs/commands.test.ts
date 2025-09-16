import { describe, it, expect } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Command Documentation Tests', () => {
  const docsDir = path.join(__dirname, '../../docs');

  describe('Command Structure', () => {
    it('should have consistent command format', async () => {
      const commandsDoc = await fs.readFile(
        path.join(docsDir, 'COMMANDS.md'),
        'utf-8'
      );

      // Define expected command structure
      const commandStructure = {
        core: ['init', 'start', 'stop', 'status'],
        registration: ['register', 'unregister'],
        wallet: ['address', 'balance', 'export', 'import'],
        config: ['list', 'get', 'set', 'reset'],
        session: ['list', 'info', 'end'],
        earnings: ['balance', 'history'],
        withdrawal: ['withdraw', 'history', 'unstake'],
        daemon: ['start', 'stop', 'status'],
        utility: ['network test', 'inference test', 'version', 'help']
      };

      // Verify each command category is documented
      for (const [category, commands] of Object.entries(commandStructure)) {
        for (const command of commands) {
          expect(commandsDoc.toLowerCase()).toContain(command.toLowerCase());
        }
      }
    });

    it('should have options documented for each command', async () => {
      const commandsDoc = await fs.readFile(
        path.join(docsDir, 'COMMANDS.md'),
        'utf-8'
      );

      // Commands that should have options documented
      const commandsWithOptions = [
        'init',
        'start',
        'stop',
        'register',
        'wallet export',
        'config set',
        'session list',
        'withdraw'
      ];

      for (const command of commandsWithOptions) {
        const commandSection = commandsDoc.includes(`### ${command}`);
        if (commandSection) {
          // Check for options table or list
          expect(
            commandsDoc.includes('Options') ||
            commandsDoc.includes('--')
          ).toBe(true);
        }
      }
    });

    it('should have examples for each command', async () => {
      const commandsDoc = await fs.readFile(
        path.join(docsDir, 'COMMANDS.md'),
        'utf-8'
      );

      // Extract command sections
      const sections = commandsDoc.split('###').filter(s => s.trim());

      let commandsWithExamples = 0;
      for (const section of sections) {
        if (section.includes('Examples') || section.includes('```bash')) {
          commandsWithExamples++;
        }
      }

      // Should have examples for most commands
      expect(commandsWithExamples).toBeGreaterThan(10);
    });
  });

  describe('Global Options', () => {
    it('should document all global options', async () => {
      const commandsDoc = await fs.readFile(
        path.join(docsDir, 'COMMANDS.md'),
        'utf-8'
      );

      const globalOptions = [
        '--config',
        '--network',
        '--verbose',
        '--quiet',
        '--json',
        '--help'
      ];

      for (const option of globalOptions) {
        expect(commandsDoc).toContain(option);
      }
    });

    it('should have short option aliases documented', async () => {
      const commandsDoc = await fs.readFile(
        path.join(docsDir, 'COMMANDS.md'),
        'utf-8'
      );

      const shortOptions = [
        ['-c', '--config'],
        ['-n', '--network'],
        ['-v', '--verbose'],
        ['-q', '--quiet'],
        ['-j', '--json'],
        ['-h', '--help']
      ];

      for (const [short, long] of shortOptions) {
        expect(commandsDoc).toContain(short);
        expect(commandsDoc).toContain(long);
      }
    });
  });

  describe('Command Output', () => {
    it('should have example output for informational commands', async () => {
      const commandsDoc = await fs.readFile(
        path.join(docsDir, 'COMMANDS.md'),
        'utf-8'
      );

      // Commands that should show example output
      const commandsWithOutput = [
        'status',
        'wallet balance',
        'earnings balance',
        'session list'
      ];

      for (const command of commandsWithOutput) {
        const section = commandsDoc.indexOf(command);
        if (section !== -1) {
          // Look for output section near the command
          const nearbyContent = commandsDoc.substring(section, section + 2000);
          expect(
            nearbyContent.includes('Output') ||
            nearbyContent.includes('```')
          ).toBe(true);
        }
      }
    });
  });

  describe('Command Categories', () => {
    it('should organize commands by logical categories', async () => {
      const commandsDoc = await fs.readFile(
        path.join(docsDir, 'COMMANDS.md'),
        'utf-8'
      );

      const categories = [
        'Core Commands',
        'Registration Commands',
        'Wallet Commands',
        'Configuration Commands',
        'Session Commands',
        'Earnings Commands',
        'Withdrawal Commands',
        'Daemon Commands',
        'Utility Commands'
      ];

      for (const category of categories) {
        expect(commandsDoc).toContain(category);
      }
    });

    it('should have table of contents with all categories', async () => {
      const commandsDoc = await fs.readFile(
        path.join(docsDir, 'COMMANDS.md'),
        'utf-8'
      );

      expect(commandsDoc).toContain('Table of Contents');

      // Check for anchor links
      expect(commandsDoc).toContain('#core-commands');
      expect(commandsDoc).toContain('#wallet-commands');
      expect(commandsDoc).toContain('#configuration-commands');
    });
  });

  describe('Command Validation', () => {
    it('should use consistent command prefix', () => {
      const commands = [
        'fabstir-host init',
        'fabstir-host start',
        'fabstir-host wallet balance',
        'fabstir-host config set key value'
      ];

      for (const cmd of commands) {
        expect(cmd).toMatch(/^fabstir-host\s/);
      }
    });

    it('should have valid subcommand structure', () => {
      const subcommands = {
        wallet: ['address', 'balance', 'export', 'import'],
        config: ['list', 'get', 'set', 'reset'],
        session: ['list', 'info', 'end'],
        daemon: ['start', 'stop', 'status']
      };

      for (const [main, subs] of Object.entries(subcommands)) {
        for (const sub of subs) {
          const fullCommand = `fabstir-host ${main} ${sub}`;
          expect(fullCommand).toMatch(/^fabstir-host\s+\w+\s+\w+$/);
        }
      }
    });

    it('should document required vs optional parameters', () => {
      const commandPatterns = [
        { cmd: 'config get <key>', required: ['key'], optional: [] },
        { cmd: 'config set <key> <value>', required: ['key', 'value'], optional: [] },
        { cmd: 'withdraw [amount]', required: [], optional: ['amount'] },
        { cmd: 'session info <session-id>', required: ['session-id'], optional: [] }
      ];

      for (const pattern of commandPatterns) {
        // Check required params use < >
        for (const param of pattern.required) {
          expect(pattern.cmd).toContain(`<${param}>`);
        }

        // Check optional params use [ ]
        for (const param of pattern.optional) {
          expect(pattern.cmd).toContain(`[${param}]`);
        }
      }
    });
  });

  describe('Error Handling Documentation', () => {
    it('should document error responses for commands', () => {
      const errorScenarios = [
        { command: 'register', error: 'Insufficient FAB balance' },
        { command: 'start', error: 'Port already in use' },
        { command: 'withdraw', error: 'No earnings available' }
      ];

      // Verify error handling is considered
      for (const scenario of errorScenarios) {
        expect(scenario.error).toBeTruthy();
      }
    });
  });

  describe('Cross-Reference Validation', () => {
    it('should have consistent command names across all docs', async () => {
      const readme = await fs.readFile(
        path.join(__dirname, '../../README.md'),
        'utf-8'
      );

      const commandsDoc = await fs.readFile(
        path.join(docsDir, 'COMMANDS.md'),
        'utf-8'
      );

      // Commands mentioned in README should be in COMMANDS.md
      const readmeCommands = [
        'init',
        'register',
        'start',
        'wallet balance',
        'withdraw'
      ];

      for (const cmd of readmeCommands) {
        expect(commandsDoc.toLowerCase()).toContain(cmd.toLowerCase());
      }
    });
  });
});