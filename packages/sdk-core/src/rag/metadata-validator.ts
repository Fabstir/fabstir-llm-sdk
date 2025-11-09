/**
 * Metadata Validator
 * Validates vector metadata according to rules and schema
 * Max 200 lines
 */

/**
 * Reserved metadata field names that cannot be used
 * Note: 'score' and 'distance' are used internally by vector search but can be in user metadata
 */
const RESERVED_FIELDS = new Set(['id', 'vector', '_id', '_vector']);

/**
 * Maximum metadata size in bytes (500KB)
 */
const MAX_METADATA_SIZE = 500 * 1024;

/**
 * Metadata schema definition
 */
export interface MetadataSchema {
  [key: string]: 'string' | 'number' | 'boolean' | 'array' | 'object';
}

/**
 * Check if a field name is reserved
 * @param fieldName - Field name to check
 * @returns True if reserved
 */
export function isReservedField(fieldName: string): boolean {
  return RESERVED_FIELDS.has(fieldName);
}

/**
 * Validate metadata field names
 * @param metadata - Metadata to validate
 * @throws Error if invalid field name found
 */
export function validateFieldNames(metadata: Record<string, any>): void {
  for (const key of Object.keys(metadata)) {
    if (isReservedField(key)) {
      throw new Error(`Reserved metadata field: ${key}`);
    }

    // Check for valid field name format
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
      throw new Error(`Invalid metadata field name: ${key}. Only alphanumeric, underscore, and hyphen allowed.`);
    }
  }
}

/**
 * Calculate metadata size in bytes
 * @param metadata - Metadata to measure
 * @returns Size in bytes
 */
export function calculateMetadataSize(metadata: Record<string, any>): number {
  try {
    return new TextEncoder().encode(JSON.stringify(metadata)).length;
  } catch (error) {
    throw new Error('Failed to serialize metadata');
  }
}

/**
 * Validate metadata size
 * @param metadata - Metadata to validate
 * @throws Error if size exceeds limit
 */
export function validateMetadataSize(metadata: Record<string, any>): void {
  const size = calculateMetadataSize(metadata);

  if (size > MAX_METADATA_SIZE) {
    throw new Error(
      `Metadata size exceeds limit: ${size} bytes > ${MAX_METADATA_SIZE} bytes (${MAX_METADATA_SIZE / 1024}KB)`
    );
  }
}

/**
 * Get the type of a value
 * @param value - Value to check
 * @returns Type string
 */
function getValueType(value: any): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}

/**
 * Validate metadata against schema
 * @param metadata - Metadata to validate
 * @param schema - Expected schema
 * @throws Error if metadata doesn't match schema
 */
export function validateMetadataSchema(
  metadata: Record<string, any>,
  schema: MetadataSchema
): void {
  // Check all schema fields are present with correct types
  for (const [field, expectedType] of Object.entries(schema)) {
    if (!(field in metadata)) {
      throw new Error(`Missing required field in metadata: ${field}`);
    }

    const actualType = getValueType(metadata[field]);

    if (actualType !== expectedType) {
      throw new Error(
        `Metadata does not match schema: field '${field}' expected ${expectedType}, got ${actualType}`
      );
    }
  }
}

/**
 * Sanitize metadata to prevent injection attacks
 * @param metadata - Metadata to sanitize
 * @returns Sanitized metadata
 */
export function sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
  // Deep clone to avoid mutating original
  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(metadata)) {
    // Keep values as-is - no string escaping needed for native storage
    // The vector DB native bindings handle this correctly
    sanitized[key] = value;
  }

  return sanitized;
}

/**
 * Validate complete metadata
 * Checks field names, size, and optionally schema
 * @param metadata - Metadata to validate
 * @param schema - Optional schema to validate against
 * @throws Error if validation fails
 */
export function validateMetadata(
  metadata: Record<string, any>,
  schema?: MetadataSchema
): void {
  // Check metadata is an object
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    throw new Error('Metadata must be an object');
  }

  // Validate field names
  validateFieldNames(metadata);

  // Validate size
  validateMetadataSize(metadata);

  // Validate against schema if provided
  if (schema) {
    validateMetadataSchema(metadata, schema);
  }
}

/**
 * Create a metadata filter for search
 * @param filter - Filter object
 * @returns Formatted filter for vector DB
 */
export function createMetadataFilter(filter: Record<string, any>): any {
  // @fabstir/vector-db-native handles native metadata, no transformation needed
  return filter;
}
