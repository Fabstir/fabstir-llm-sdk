/**
 * UserSettings Migration System
 *
 * This module provides schema migration support for UserSettings.
 * As the UserSettings schema evolves, this system ensures backward compatibility.
 */

import { UserSettings, UserSettingsVersion } from '../../types/settings.types';

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

  if (!settings.lastUpdated) {
    throw new Error('UserSettings missing lastUpdated field');
  }

  // Currently only V1 exists - pass through unchanged
  if (settings.version === UserSettingsVersion.V1) {
    return settings as UserSettings;
  }

  // Future migrations will be added here as new versions are introduced
  // Example for V2 migration:
  // if (settings.version === UserSettingsVersion.V1) {
  //   return migrateV1toV2(settings);
  // }
  // if (settings.version === UserSettingsVersion.V2) {
  //   return settings as UserSettings;
  // }

  // Unknown version
  throw new Error(`Unsupported UserSettings version: ${settings.version}`);
}

/**
 * Example V1 → V2 migration (for future use)
 *
 * function migrateV1toV2(v1Settings: any): UserSettings {
 *   return {
 *     ...v1Settings,
 *     version: UserSettingsVersion.V2,
 *     // Add new V2 fields with defaults
 *     newV2Field: 'default-value',
 *   };
 * }
 */
