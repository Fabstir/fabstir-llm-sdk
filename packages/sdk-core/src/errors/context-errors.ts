// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Context limit error for TOKEN_LIMIT_EXCEEDED responses from node.
 * Follows the same pattern as WebSearchError.
 */

export class ContextLimitError extends Error {
  public readonly code: 'TOKEN_LIMIT_EXCEEDED';
  public readonly promptTokens: number;
  public readonly contextWindowSize: number;
  public readonly excess: number;

  constructor(message: string, promptTokens: number, contextWindowSize: number) {
    super(message);
    this.name = 'ContextLimitError';
    this.code = 'TOKEN_LIMIT_EXCEEDED';
    this.promptTokens = promptTokens;
    this.contextWindowSize = contextWindowSize;
    this.excess = promptTokens - contextWindowSize;
    Object.setPrototypeOf(this, ContextLimitError.prototype);
  }
}
