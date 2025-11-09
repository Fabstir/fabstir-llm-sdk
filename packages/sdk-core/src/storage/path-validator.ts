/**
 * Path Validator
 * Validates and normalizes folder paths for RAG storage
 * Max 200 lines
 */

/**
 * Maximum folder nesting depth
 */
export const MAX_FOLDER_DEPTH = 10;

/**
 * Validation result
 */
export interface PathValidationResult {
  valid: boolean;
  error?: string;
  normalized?: string;
}

/**
 * Folder name validation rules
 * - Alphanumeric characters (a-z, A-Z, 0-9)
 * - Hyphens, underscores, periods, parentheses, spaces
 * - No special characters: / \ : * ? " < > |
 */
const VALID_NAME_PATTERN = /^[a-zA-Z0-9\-_.() ]+$/;

/**
 * Invalid path patterns
 */
const INVALID_PATTERNS = [
  /\.\./,       // Parent directory references
  /\/\//,       // Double slashes (after normalization)
  /^\.$/,       // Current directory
  /^\.\.$/,     // Parent directory
];

/**
 * Normalize a folder path
 * - Remove leading/trailing whitespace
 * - Convert multiple leading slashes to single slash
 * - Remove trailing slashes (except root)
 * - Ensure path starts with /
 *
 * @param path - Path to normalize
 * @returns Normalized path
 */
export function normalizePath(path: string): string {
  if (!path) {
    return '/';
  }

  // Trim whitespace
  let normalized = path.trim();

  // Replace multiple leading slashes with single slash
  normalized = normalized.replace(/^\/+/, '/');

  // Remove trailing slashes (unless it's the root path)
  if (normalized !== '/') {
    normalized = normalized.replace(/\/+$/, '');
  }

  // Ensure path starts with /
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }

  return normalized;
}

/**
 * Validate a folder name (single component, not a path)
 *
 * @param name - Folder name to validate
 * @returns Validation result
 */
export function validateFolderName(name: string): PathValidationResult {
  if (!name || name.trim() === '') {
    return {
      valid: false,
      error: 'Folder name cannot be empty'
    };
  }

  const trimmed = name.trim();

  // Check for invalid characters
  if (!VALID_NAME_PATTERN.test(trimmed)) {
    return {
      valid: false,
      error: 'Invalid folder name: contains special characters'
    };
  }

  // Check for reserved names
  if (trimmed === '.' || trimmed === '..') {
    return {
      valid: false,
      error: 'Invalid folder name: reserved name'
    };
  }

  // Check length (reasonable limit)
  if (trimmed.length > 255) {
    return {
      valid: false,
      error: 'Folder name too long (max 255 characters)'
    };
  }

  return {
    valid: true,
    normalized: trimmed
  };
}

/**
 * Validate a full folder path
 *
 * @param path - Path to validate
 * @returns Validation result
 */
export function validatePath(path: string): PathValidationResult {
  if (!path || path.trim() === '') {
    return {
      valid: false,
      error: 'Path is required'
    };
  }

  // Normalize first
  const normalized = normalizePath(path);

  // Root path is always valid
  if (normalized === '/') {
    return {
      valid: true,
      normalized
    };
  }

  // Check for invalid patterns
  for (const pattern of INVALID_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        valid: false,
        error: 'Invalid path: contains invalid pattern'
      };
    }
  }

  // Split into components and validate each
  const parts = normalized.split('/').filter(p => p.length > 0);

  // Check depth
  if (parts.length > MAX_FOLDER_DEPTH) {
    return {
      valid: false,
      error: 'Maximum folder depth exceeded'
    };
  }

  // Validate each component
  for (const part of parts) {
    const result = validateFolderName(part);
    if (!result.valid) {
      return {
        valid: false,
        error: `Invalid folder name "${part}": ${result.error}`
      };
    }
  }

  return {
    valid: true,
    normalized
  };
}

/**
 * Get parent path of a folder
 *
 * @param path - Folder path
 * @returns Parent path, or null if path is root
 */
export function getParentPath(path: string): string | null {
  const normalized = normalizePath(path);

  if (normalized === '/') {
    return null;
  }

  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash === 0) {
    return '/';
  }

  return normalized.substring(0, lastSlash);
}

/**
 * Get all ancestor paths of a folder (from root to parent)
 *
 * @param path - Folder path
 * @returns Array of ancestor paths
 */
export function getAncestorPaths(path: string): string[] {
  const normalized = normalizePath(path);

  if (normalized === '/') {
    return [];
  }

  const ancestors: string[] = ['/'];
  const parts = normalized.split('/').filter(p => p.length > 0);

  let current = '';
  for (let i = 0; i < parts.length - 1; i++) {
    current += '/' + parts[i];
    ancestors.push(current);
  }

  return ancestors;
}

/**
 * Join path components
 *
 * @param base - Base path
 * @param parts - Path parts to join
 * @returns Joined path
 */
export function joinPath(base: string, ...parts: string[]): string {
  const normalized = normalizePath(base);
  const joined = parts.join('/');

  if (normalized === '/') {
    return normalizePath('/' + joined);
  }

  return normalizePath(normalized + '/' + joined);
}

/**
 * Extract folder name from path
 *
 * @param path - Folder path
 * @returns Folder name
 */
export function getFolderName(path: string): string {
  const normalized = normalizePath(path);

  if (normalized === '/') {
    return '';
  }

  const parts = normalized.split('/').filter(p => p.length > 0);
  return parts[parts.length - 1] || '';
}

/**
 * Check if path is a subpath of another path
 *
 * @param childPath - Potential child path
 * @param parentPath - Potential parent path
 * @returns True if childPath is under parentPath
 */
export function isSubPath(childPath: string, parentPath: string): boolean {
  const normalizedChild = normalizePath(childPath);
  const normalizedParent = normalizePath(parentPath);

  if (normalizedParent === '/') {
    return normalizedChild !== '/';
  }

  return normalizedChild.startsWith(normalizedParent + '/');
}
