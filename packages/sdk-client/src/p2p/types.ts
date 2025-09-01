export interface P2PMessage {
  type: 'prompt' | 'response' | 'error' | 'complete';
  index: number;
  content: string;
  timestamp?: number;
}

export interface ConnectionOptions {
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
}

export type ResponseHandler = (message: P2PMessage) => void;
export type ErrorHandler = (error: Error) => void;

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting'
}