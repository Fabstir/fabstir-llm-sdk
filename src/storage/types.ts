export interface Message {
  id: string;
  sessionId: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  tokenCount?: number;
}

export interface StorageConfig {
  seedPhrase: string;
  portalUrl?: string;
}

export interface AccessGrant {
  sessionId: number;
  grantedTo: string;
  timestamp: number;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface CacheConfig {
  maxEntries?: number;
  defaultTTL?: number;
}