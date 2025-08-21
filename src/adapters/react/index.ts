// src/adapters/react/index.ts
export { useSDK, useSDKWithState, useSDKWithWagmi, default } from './use-sdk.js';

// Re-export types that React users might need
export type { HeadlessConfig } from '../../sdk-headless.js';
export type { JobRequest, JobResponse, DiscoveredNode } from '../../types.js';
export { JobStatus } from '../../types.js';
export { ErrorCode } from '../../errors.js';