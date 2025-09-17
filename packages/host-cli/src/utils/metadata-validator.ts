export class MetadataValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetadataValidationError';
  }
}

const MAX_METADATA_SIZE = 10 * 1024; // 10KB limit
const SENSITIVE_KEYS = ['privateKey', 'private_key', 'apiKey', 'api_key', 'secret', 'password', 'token'];

export interface HostMetadata {
  name: string;
  description: string;
  location?: string;
  costPerToken?: number;
  minJobDeposit?: number;
  supportedFeatures?: string[];
  performance?: {
    avgResponseTime?: number;
    uptime?: number;
  };
  contact?: {
    email?: string;
    discord?: string;
    telegram?: string;
  };
  website?: string;
  [key: string]: any;
}

export function validateRequiredFields(metadata: any): void {
  if (!metadata || typeof metadata !== 'object') {
    throw new MetadataValidationError('Invalid metadata structure');
  }

  if (!metadata.name || typeof metadata.name !== 'string') {
    throw new MetadataValidationError('Missing required field: name');
  }

  if (metadata.name.trim() === '') {
    throw new MetadataValidationError('Required field name cannot be empty');
  }

  if (!metadata.description || typeof metadata.description !== 'string') {
    throw new MetadataValidationError('Missing required field: description');
  }

  if (metadata.description.trim() === '') {
    throw new MetadataValidationError('Required field description cannot be empty');
  }
}

export function validateSize(metadata: any): void {
  const jsonStr = JSON.stringify(metadata);
  const sizeInBytes = new TextEncoder().encode(jsonStr).length;

  if (sizeInBytes > MAX_METADATA_SIZE) {
    throw new MetadataValidationError(
      `Metadata exceeds maximum size of ${MAX_METADATA_SIZE} bytes (current: ${sizeInBytes} bytes)`
    );
  }
}

export function sanitizeMetadata(metadata: any): any {
  if (!metadata || typeof metadata !== 'object') {
    return metadata;
  }

  const sanitized = { ...metadata };

  // Remove sensitive fields
  for (const key of Object.keys(sanitized)) {
    if (SENSITIVE_KEYS.some(sensitive => key.toLowerCase().includes(sensitive))) {
      delete sanitized[key];
    } else if (typeof sanitized[key] === 'string') {
      // Trim whitespace from strings
      sanitized[key] = sanitized[key].trim();
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeMetadata(sanitized[key]);
    }
  }

  return sanitized;
}

export function mergeMetadata(existing: any, updates: any): any {
  const merged = { ...existing };

  for (const key of Object.keys(updates)) {
    if (updates[key] === undefined) {
      continue;
    }

    if (Array.isArray(updates[key])) {
      // Replace arrays completely
      merged[key] = updates[key];
    } else if (typeof updates[key] === 'object' && updates[key] !== null &&
               typeof merged[key] === 'object' && merged[key] !== null &&
               !Array.isArray(merged[key])) {
      // Deep merge objects
      merged[key] = mergeMetadata(merged[key], updates[key]);
    } else {
      // Replace primitive values
      merged[key] = updates[key];
    }
  }

  return merged;
}

function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function validateMetadata(metadata: any): HostMetadata {
  if (!metadata || typeof metadata !== 'object') {
    throw new MetadataValidationError('Invalid metadata structure');
  }

  // Sanitize first
  const sanitized = sanitizeMetadata(metadata);

  // Validate required fields
  validateRequiredFields(sanitized);

  // Validate size
  validateSize(sanitized);

  // Validate optional fields if present
  if (sanitized.contact?.email && !validateEmail(sanitized.contact.email)) {
    throw new MetadataValidationError('Invalid email format');
  }

  if (sanitized.website && !validateUrl(sanitized.website)) {
    throw new MetadataValidationError('Invalid URL format');
  }

  if (sanitized.costPerToken !== undefined &&
      (typeof sanitized.costPerToken !== 'number' || sanitized.costPerToken < 0)) {
    throw new MetadataValidationError('costPerToken must be a positive number');
  }

  if (sanitized.minJobDeposit !== undefined &&
      (typeof sanitized.minJobDeposit !== 'number' || sanitized.minJobDeposit < 0)) {
    throw new MetadataValidationError('minJobDeposit must be a positive number');
  }

  if (sanitized.performance?.uptime !== undefined) {
    const uptime = sanitized.performance.uptime;
    if (typeof uptime !== 'number' || uptime < 0 || uptime > 100) {
      throw new MetadataValidationError('uptime must be a number between 0 and 100');
    }
  }

  return sanitized as HostMetadata;
}