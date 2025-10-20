// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Base SDK error class
 */
export class SDKError extends Error {
  constructor(
    message: string,
    public code?: string,
    public cause?: any
  ) {
    super(message);
    this.name = 'SDKError';
  }
}