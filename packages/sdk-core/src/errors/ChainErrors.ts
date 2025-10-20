// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Error thrown when attempting to use an unsupported blockchain
 */
export class UnsupportedChainError extends Error {
  public readonly chainId: number;
  public readonly supportedChains: number[];

  constructor(chainId: number, supportedChains: number[]) {
    super(
      `Chain ID ${chainId} is not supported. Supported chains: ${supportedChains.join(', ')}`
    );
    this.name = 'UnsupportedChainError';
    this.chainId = chainId;
    this.supportedChains = supportedChains;
    Object.setPrototypeOf(this, UnsupportedChainError.prototype);
  }
}

/**
 * Error thrown when expected chain doesn't match actual chain
 */
export class ChainMismatchError extends Error {
  public readonly expectedChainId: number;
  public readonly actualChainId: number;
  public readonly operation: string;

  constructor(expectedChainId: number, actualChainId: number, operation: string) {
    super(
      `Chain mismatch during ${operation}: expected chain ${expectedChainId} but connected to chain ${actualChainId}`
    );
    this.name = 'ChainMismatchError';
    this.expectedChainId = expectedChainId;
    this.actualChainId = actualChainId;
    this.operation = operation;
    Object.setPrototypeOf(this, ChainMismatchError.prototype);
  }
}

/**
 * Error thrown when deposit balance is insufficient for operation
 */
export class InsufficientDepositError extends Error {
  public readonly required: string;
  public readonly available: string;
  public readonly chainId: number;

  constructor(required: string, available: string, chainId: number) {
    super(
      `Insufficient deposit on chain ${chainId}: required ${required} but only ${available} available`
    );
    this.name = 'InsufficientDepositError';
    this.required = required;
    this.available = available;
    this.chainId = chainId;
    Object.setPrototypeOf(this, InsufficientDepositError.prototype);
  }
}

/**
 * Error thrown when node and SDK are on different chains
 */
export class NodeChainMismatchError extends Error {
  public readonly nodeChainId: number;
  public readonly sdkChainId: number;

  constructor(nodeChainId: number, sdkChainId: number) {
    super(
      `Node is on chain ${nodeChainId} but SDK is configured for chain ${sdkChainId}`
    );
    this.name = 'NodeChainMismatchError';
    this.nodeChainId = nodeChainId;
    this.sdkChainId = sdkChainId;
    Object.setPrototypeOf(this, NodeChainMismatchError.prototype);
  }
}

/**
 * Error thrown when deposit account is not available for wallet type
 */
export class DepositAccountNotAvailableError extends Error {
  public readonly walletType: string;

  constructor(walletType: string) {
    super(`Deposit account not available for wallet type: ${walletType}`);
    this.name = 'DepositAccountNotAvailableError';
    this.walletType = walletType;
    Object.setPrototypeOf(this, DepositAccountNotAvailableError.prototype);
  }
}