// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Registration error handling module
 * Provides comprehensive error handling for registration process
 */

/**
 * Error codes for registration errors
 */
export enum ErrorCode {
  // Balance errors
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  INSUFFICIENT_GAS = 'INSUFFICIENT_GAS',

  // Registration errors
  ALREADY_REGISTERED = 'ALREADY_REGISTERED',
  REGISTRATION_FAILED = 'REGISTRATION_FAILED',
  REQUIREMENTS_NOT_MET = 'REQUIREMENTS_NOT_MET',

  // Validation errors
  INVALID_API_URL = 'INVALID_API_URL',
  INVALID_MODELS = 'INVALID_MODELS',
  INVALID_METADATA = 'INVALID_METADATA',
  INVALID_CONFIG = 'INVALID_CONFIG',
  VALIDATION_FAILED = 'VALIDATION_FAILED',

  // Staking errors
  STAKE_TOO_LOW = 'STAKE_TOO_LOW',
  STAKING_FAILED = 'STAKING_FAILED',
  APPROVAL_FAILED = 'APPROVAL_FAILED',
  ALLOWANCE_CHECK_FAILED = 'ALLOWANCE_CHECK_FAILED',

  // Withdrawal errors
  NO_STAKE_TO_WITHDRAW = 'NO_STAKE_TO_WITHDRAW',
  WITHDRAWAL_NOT_ALLOWED = 'WITHDRAWAL_NOT_ALLOWED',
  WITHDRAWAL_FAILED = 'WITHDRAWAL_FAILED',

  // Transaction errors
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  CONTRACT_REVERT = 'CONTRACT_REVERT',
  GAS_ESTIMATION_FAILED = 'GAS_ESTIMATION_FAILED',
  NONCE_ERROR = 'NONCE_ERROR',

  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONTRACT_NOT_FOUND = 'CONTRACT_NOT_FOUND',
  RPC_ERROR = 'RPC_ERROR',

  // Status errors
  STATUS_CHECK_FAILED = 'STATUS_CHECK_FAILED',

  // Generic errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Registration error class
 */
export class RegistrationError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: any;
  public readonly retryable: boolean;
  public readonly severity: 'low' | 'medium' | 'high' | 'critical';

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
    details?: any
  ) {
    super(message);
    this.name = 'RegistrationError';
    this.code = code;
    this.details = details;
    this.retryable = isRetryableError(code);
    this.severity = getErrorSeverity(code);
  }

  /**
   * Get detailed error message
   */
  getDetailedMessage(): string {
    let message = this.message;

    if (this.details) {
      if (this.details.transactionHash) {
        message += `\nTransaction: ${this.details.transactionHash}`;
      }
      if (this.details.reason) {
        message += `\nReason: ${this.details.reason}`;
      }
      if (this.details.required && this.details.available) {
        message += `\nRequired: ${this.details.required}, Available: ${this.details.available}`;
      }
    }

    return message;
  }
}

/**
 * Check if error is retryable
 */
function isRetryableError(code: ErrorCode): boolean {
  const retryableCodes = [
    ErrorCode.NETWORK_ERROR,
    ErrorCode.RPC_ERROR,
    ErrorCode.GAS_ESTIMATION_FAILED,
    ErrorCode.NONCE_ERROR,
    ErrorCode.TRANSACTION_FAILED // Sometimes retryable
  ];

  return retryableCodes.includes(code);
}

/**
 * Get error severity
 */
function getErrorSeverity(code: ErrorCode): 'low' | 'medium' | 'high' | 'critical' {
  switch (code) {
    case ErrorCode.CONTRACT_NOT_FOUND:
    case ErrorCode.CONTRACT_REVERT:
      return 'critical';

    case ErrorCode.INSUFFICIENT_BALANCE:
    case ErrorCode.REGISTRATION_FAILED:
    case ErrorCode.STAKING_FAILED:
      return 'high';

    case ErrorCode.NETWORK_ERROR:
    case ErrorCode.TRANSACTION_FAILED:
      return 'medium';

    default:
      return 'low';
  }
}

/**
 * Error statistics tracking
 */
const errorStats: Record<ErrorCode, number> = {} as Record<ErrorCode, number>;

/**
 * Handle registration error
 */
export function handleRegistrationError(error: any): {
  code: ErrorCode;
  message: string;
  resolution: string;
  retryable: boolean;
} {
  let registrationError: RegistrationError;

  // Convert to RegistrationError if needed
  if (error instanceof RegistrationError) {
    registrationError = error;
  } else {
    // Try to determine error type
    const code = determineErrorCode(error);
    registrationError = new RegistrationError(
      error.message || 'Unknown error',
      code,
      { originalError: error }
    );
  }

  // Track error occurrence
  errorStats[registrationError.code] = (errorStats[registrationError.code] || 0) + 1;

  // Log error if severe
  if (registrationError.severity === 'critical' || registrationError.severity === 'high') {
    console.error(`[Registration Error] ${registrationError.code}: ${registrationError.message}`);
  }

  return {
    code: registrationError.code,
    message: registrationError.getDetailedMessage(),
    resolution: getErrorResolution(registrationError.code),
    retryable: registrationError.retryable
  };
}

/**
 * Determine error code from generic error
 */
function determineErrorCode(error: any): ErrorCode {
  const message = error.message?.toLowerCase() || '';

  if (message.includes('insufficient') && message.includes('balance')) {
    return ErrorCode.INSUFFICIENT_BALANCE;
  }
  if (message.includes('already registered')) {
    return ErrorCode.ALREADY_REGISTERED;
  }
  if (message.includes('network') || message.includes('timeout')) {
    return ErrorCode.NETWORK_ERROR;
  }
  if (message.includes('revert')) {
    return ErrorCode.CONTRACT_REVERT;
  }
  if (message.includes('nonce')) {
    return ErrorCode.NONCE_ERROR;
  }
  if (message.includes('gas')) {
    return ErrorCode.GAS_ESTIMATION_FAILED;
  }

  return ErrorCode.UNKNOWN_ERROR;
}

/**
 * Get error resolution suggestion
 */
function getErrorResolution(code: ErrorCode): string {
  switch (code) {
    case ErrorCode.INSUFFICIENT_BALANCE:
      return 'Please acquire more FAB tokens before attempting registration.';

    case ErrorCode.INSUFFICIENT_GAS:
      return 'Please add ETH to your wallet for gas fees.';

    case ErrorCode.ALREADY_REGISTERED:
      return 'You are already registered. Use update commands to modify your registration.';

    case ErrorCode.INVALID_API_URL:
      return 'Please provide a valid URL format (e.g., https://api.example.com).';

    case ErrorCode.INVALID_MODELS:
      return 'Please provide valid model names (alphanumeric with - _ . only).';

    case ErrorCode.STAKE_TOO_LOW:
      return 'Increase stake amount to meet the minimum requirement of 1000 FAB.';

    case ErrorCode.NETWORK_ERROR:
      return 'Network issue detected. Please retry the operation.';

    case ErrorCode.CONTRACT_NOT_FOUND:
      return 'Contract not found. Please check your network configuration.';

    case ErrorCode.APPROVAL_FAILED:
      return 'Token approval failed. Please try approving tokens manually first.';

    case ErrorCode.NONCE_ERROR:
      return 'Transaction nonce issue. Please retry after a moment.';

    default:
      return 'Please review the error details and try again.';
  }
}

/**
 * Get user-friendly error message
 */
export function getErrorMessage(code: ErrorCode): string {
  switch (code) {
    case ErrorCode.INSUFFICIENT_BALANCE:
      return 'You have insufficient FAB token balance.';

    case ErrorCode.ALREADY_REGISTERED:
      return 'You are already registered as a host.';

    case ErrorCode.INVALID_MODELS:
      return 'Invalid model configuration provided.';

    case ErrorCode.STAKE_TOO_LOW:
      return 'Stake amount is below the minimum required.';

    case ErrorCode.NETWORK_ERROR:
      return 'Network connection error occurred.';

    case ErrorCode.TRANSACTION_FAILED:
      return 'Transaction failed to execute.';

    default:
      return `Registration error: ${code}`;
  }
}

/**
 * Attempt error recovery
 */
export async function recoverFromError(
  error: RegistrationError,
  options: {
    maxRetries?: number;
    retryDelay?: number;
  } = {}
): Promise<{
  attempted: boolean;
  success?: boolean;
  reason?: string;
}> {
  // Check if error is retryable
  if (!error.retryable) {
    return {
      attempted: false,
      reason: 'Error is not retryable'
    };
  }

  // For now, just return that recovery was attempted
  // In a real implementation, this would retry the operation
  return {
    attempted: true,
    success: false,
    reason: 'Recovery mechanism not fully implemented'
  };
}

/**
 * Get error statistics
 */
export function getErrorStatistics(): Record<ErrorCode, number> {
  return { ...errorStats };
}

/**
 * Get error summary
 */
export function getErrorSummary(errors: RegistrationError[]): {
  total: number;
  byCode: Record<ErrorCode, number>;
  retryable: number;
} {
  const byCode: Record<ErrorCode, number> = {} as Record<ErrorCode, number>;
  let retryable = 0;

  for (const error of errors) {
    byCode[error.code] = (byCode[error.code] || 0) + 1;
    if (error.retryable) {
      retryable++;
    }
  }

  return {
    total: errors.length,
    byCode,
    retryable
  };
}