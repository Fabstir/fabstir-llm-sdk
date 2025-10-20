// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { Command } from 'commander';
import * as ConfigWizard from '../config/wizard';
import * as ConfigStorage from '../config/storage';
import * as ConfigValidator from '../config/validator';

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize host configuration')
    .option('-f, --force', 'Overwrite existing configuration')
    .action(async (options) => {
      try {
        // Check if config already exists
        if (!options.force && await ConfigStorage.configExists()) {
          console.error('❌ Configuration already exists. Use --force to overwrite.');
          process.exit(1);
        }

        // Run configuration wizard
        const config = await ConfigWizard.runWizard();

        // Validate configuration
        const validation = ConfigValidator.validateConfig(config);
        if (!validation.isValid) {
          console.error('❌ Configuration validation failed:');
          validation.errors.forEach(error => console.error(`  - ${error}`));
          process.exit(1);
        }

        // Save configuration
        await ConfigStorage.saveConfig(config);
        console.log('\n✅ Configuration saved successfully!');
        console.log(`📁 Config location: ${ConfigStorage.getConfigPath()}`);

      } catch (error: any) {
        console.error('❌ Error during initialization:', error.message);
        process.exit(1);
      }
    });
}