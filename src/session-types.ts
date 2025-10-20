// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import type { Message } from './storage/types';
export interface SessionParams { duration: number; maxInactivity: number; messageLimit: number; checkpointInterval: number; }
export interface SessionJob { jobId: number; client: string; status: string; params: SessionParams; checkpointCount: number; lastCheckpoint: number; currentCost: string; }
export interface Host { id: string; address: string; url: string; models: string[]; pricePerToken: string; available: boolean; }
export interface SDKConfig { contractAddress: string; discoveryUrl: string; s5SeedPhrase: string; s5PortalUrl?: string; cacheConfig?: { maxEntries?: number; ttl?: number; }; enableS5?: boolean; }
export interface Session extends SessionJob { host: Host; messages: Message[]; websocketUrl: string; tokensUsed: number; }
export interface PaymentReceipt { sessionId: number; totalTokens: number; totalCost: string; transactionHash: string; }
export type SDKEventType = 'session:created' | 'session:connected' | 'prompt:sent' | 'response:received' | 'session:completed' | 'session:error';