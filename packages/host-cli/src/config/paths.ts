/**
 * Configuration paths module
 * Provides centralized path management for the host CLI
 */

import * as path from 'path';
import * as os from 'os';

/**
 * Get the configuration directory for the host CLI
 */
export function getConfigDir(): string {
  const configDir = process.env.FABSTIR_CONFIG_DIR ||
                   path.join(os.homedir(), '.fabstir', 'host');
  return configDir;
}

/**
 * Get the data directory for host operations
 */
export function getDataDir(): string {
  const dataDir = process.env.FABSTIR_DATA_DIR ||
                 path.join(os.homedir(), '.fabstir', 'host', 'data');
  return dataDir;
}

/**
 * Get the logs directory
 */
export function getLogsDir(): string {
  const logsDir = process.env.FABSTIR_LOGS_DIR ||
                 path.join(os.homedir(), '.fabstir', 'host', 'logs');
  return logsDir;
}

/**
 * Get the cache directory
 */
export function getCacheDir(): string {
  const cacheDir = process.env.FABSTIR_CACHE_DIR ||
                  path.join(os.homedir(), '.fabstir', 'host', 'cache');
  return cacheDir;
}

/**
 * Get the temporary files directory
 */
export function getTempDir(): string {
  return process.env.FABSTIR_TEMP_DIR || os.tmpdir();
}