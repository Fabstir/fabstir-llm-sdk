/**
 * Folder Utilities
 * Helper functions for virtual folder management
 */

/**
 * Validate folder path
 * @param folderPath - Folder path to validate
 * @throws Error if path is invalid
 */
export function validateFolderPath(folderPath: string | undefined): void {
  // Allow undefined (will default to root)
  if (folderPath === undefined) {
    return;
  }

  // Empty path
  if (folderPath === '') {
    throw new Error('Folder path cannot be empty');
  }

  // Must start with /
  if (!folderPath.startsWith('/')) {
    throw new Error('Folder path must start with /');
  }

  // Root is valid
  if (folderPath === '/') {
    return;
  }

  // Cannot end with / (except for root)
  if (folderPath.endsWith('/')) {
    throw new Error('Folder path cannot end with /');
  }

  // Cannot contain double slashes
  if (folderPath.includes('//')) {
    throw new Error('Folder path cannot contain double slashes');
  }
}

/**
 * Normalize folder path (add default root if missing)
 * @param folderPath - Folder path or undefined
 * @returns Normalized folder path
 */
export function normalizeFolderPath(folderPath: string | undefined): string {
  return folderPath || '/';
}

/**
 * Extract unique folder paths from metadata records
 * @param metadataRecords - Array of metadata objects
 * @returns Sorted array of unique folder paths
 */
export function extractFolderPaths(metadataRecords: Array<{ folderPath?: string }>): string[] {
  const paths = new Set<string>();

  for (const record of metadataRecords) {
    const path = normalizeFolderPath(record.folderPath);
    paths.add(path);
  }

  return Array.from(paths).sort();
}

/**
 * Check if folder path matches filter
 * @param folderPath - Folder path to check
 * @param filterPath - Filter path
 * @returns True if folder matches filter
 */
export function matchesFolderPath(folderPath: string | undefined, filterPath: string): boolean {
  const normalized = normalizeFolderPath(folderPath);
  return normalized === filterPath;
}
