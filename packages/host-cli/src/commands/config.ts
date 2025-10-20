// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { Command } from 'commander';
import * as ConfigStorage from '../config/storage';
import * as ConfigManager from '../config/manager';

export function registerConfigCommand(program: Command): void {
  const config = program
    .command('config')
    .description('Manage host configuration');

  // config get <key>
  config
    .command('get <key>')
    .description('Get a configuration value')
    .action(async (key: string) => {
      try {
        const config = await ConfigStorage.loadConfig();
        if (!config) {
          console.error('❌ No configuration found. Run "fabstir-host init" first.');
          process.exit(1);
        }

        const value = getNestedValue(config, key);
        if (value === undefined) {
          console.error(`❌ Key "${key}" not found in configuration.`);
          process.exit(1);
        }

        console.log(value);
      } catch (error: any) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
      }
    });

  // config set <key> <value>
  config
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action(async (key: string, value: string) => {
      try {
        const config = await ConfigStorage.loadConfig();
        if (!config) {
          console.error('❌ No configuration found. Run "fabstir-host init" first.');
          process.exit(1);
        }

        const updated = await ConfigManager.updateConfig(config, key, value);
        await ConfigStorage.saveConfig(updated);
        console.log('✅ Configuration updated successfully.');
      } catch (error: any) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
      }
    });

  // config list
  config
    .command('list')
    .description('List all configuration values')
    .option('--json', 'Output in JSON format')
    .action(async (options) => {
      try {
        const config = await ConfigStorage.loadConfig();
        if (!config) {
          console.error('❌ No configuration found. Run "fabstir-host init" first.');
          process.exit(1);
        }

        if (options.json) {
          console.log(JSON.stringify(config, null, 2));
        } else {
          console.log('\n📋 Configuration:');
          console.log('=================');
          Object.entries(config).forEach(([key, value]) => {
            const displayValue = Array.isArray(value)
              ? value.join(', ')
              : typeof value === 'object'
              ? JSON.stringify(value)
              : value;
            console.log(`${key}: ${displayValue}`);
          });
        }
      } catch (error: any) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
      }
    });

  // config reset
  config
    .command('reset')
    .description('Reset configuration to defaults')
    .option('-f, --force', 'Force reset without confirmation')
    .action(async (options) => {
      try {
        if (!options.force) {
          const confirmed = await ConfigManager.confirmReset();
          if (!confirmed) {
            console.log('Reset cancelled.');
            return;
          }
        }

        await ConfigStorage.deleteConfig();
        console.log('✅ Configuration reset successfully.');
      } catch (error: any) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
      }
    });

  // config backup
  config
    .command('backup')
    .description('Create a backup of current configuration')
    .action(async () => {
      try {
        const backupPath = await ConfigStorage.backupConfig();
        console.log(`✅ Backup created: ${backupPath}`);
      } catch (error: any) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
      }
    });

  // config restore <path>
  config
    .command('restore <path>')
    .description('Restore configuration from backup')
    .action(async (path: string) => {
      try {
        await ConfigStorage.restoreConfig(path);
        console.log('✅ Configuration restored successfully.');
      } catch (error: any) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
      }
    });
}

function getNestedValue(obj: any, path: string): any {
  const keys = path.split('.');
  let value = obj;

  for (const key of keys) {
    if (value === null || value === undefined) {
      return undefined;
    }

    // Handle array indices
    if (/^\d+$/.test(key)) {
      value = value[parseInt(key)];
    } else {
      value = value[key];
    }
  }

  return value;
}