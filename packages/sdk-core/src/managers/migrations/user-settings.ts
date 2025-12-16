// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * UserSettings Migration System
 *
 * This module provides schema migration support for UserSettings.
 * As the UserSettings schema evolves, this system ensures backward compatibility.
 */

import {
  UserSettings,
  UserSettingsVersion,
  HostSelectionMode,
} from '../../types/settings.types';

/**
 * Migrate UserSettings to the current schema version
 *
 * @param settings - Raw settings object from S5 storage
 * @returns Migrated UserSettings object
 * @throws Error if version is missing or unsupported
 */
export function migrateUserSettings(settings: any): UserSettings {
  // Validate required fields exist
  if (!settings.version) {
    throw new Error('UserSettings missing version field');
  }

  // Check for undefined/null, but allow 0 (valid Unix timestamp)
  if (settings.lastUpdated === undefined || settings.lastUpdated === null) {
    throw new Error('UserSettings missing lastUpdated field');
  }

  // V1 → V2 migration
  if (settings.version === UserSettingsVersion.V1) {
    return migrateV1ToV2(settings);
  }

  // V2 - current version, pass through unchanged
  if (settings.version === UserSettingsVersion.V2) {
    return settings as UserSettings;
  }

  // Unknown version
  throw new Error(`Unsupported UserSettings version: ${settings.version}`);
}

/**
 * Migrate V1 settings to V2
 *
 * Adds model and host selection preferences:
 * - defaultModelId: null (no default set)
 * - hostSelectionMode: AUTO (weighted algorithm)
 * - preferredHostAddress: null (not in SPECIFIC mode)
 *
 * @param v1Settings - V1 settings object
 * @returns V2 settings with new fields added
 */
function migrateV1ToV2(v1Settings: any): UserSettings {
  return {
    ...v1Settings,
    version: UserSettingsVersion.V2,
    // Add V2 fields with defaults
    defaultModelId: null,
    hostSelectionMode: HostSelectionMode.AUTO,
    preferredHostAddress: null,
  };
}
