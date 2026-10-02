// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { SDKError } from '../types';

/** The codes a disposed manager answers: its identity is signed out (plan §26 GG1). */
const DISPOSAL_CODES = new Set(['STORAGE_MANAGER_DISPOSED', 'SESSION_GROUP_MANAGER_DISPOSED']);

/**
 * Best-effort storage stops being best-effort at a sign-out (plan §27 HH2, §28 II3): a call in flight stops at its next
 * storage step and says so — never "succeeds", or answers "nothing", with what it was doing undone.
 */
export function rethrowDisposal(error: unknown): void {
  if (error instanceof SDKError && DISPOSAL_CODES.has(error.code)) throw error;
}
