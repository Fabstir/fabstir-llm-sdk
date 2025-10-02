/**
 * Host Registration Manager
 * Handles the complete registration flow for hosts
 */

import { getSDK, getAuthenticatedAddress } from '../sdk/client';
import { checkAllRequirements } from '../balance/requirements';
import { approveTokens, stakeTokens, StakingConfig } from './staking';
import { saveRegistrationState, loadRegistrationState } from './state';
import { RegistrationError, ErrorCode, handleRegistrationError } from './errors';
import { ethers } from 'ethers';

/**
 * Registration configuration
 */
export interface RegistrationConfig {
  apiUrl: string;
  models: string[];
  metadata?: {
    name?: string;
    description?: string;
    [key: string]: any;
  };
  stakeAmount?: bigint;
  gasLimit?: number;
  gasPrice?: bigint;
  onProgress?: (message: string) => void;
}

/**
 * Registration status
 */
export interface RegistrationStatus {
  isRegistered: boolean;
  hostAddress: string | null;
  stakedAmount: bigint;
  apiUrl?: string;
  models?: string[];
  registrationBlock?: number;
  isActive?: boolean;
}

/**
 * Registration info
 */
export interface RegistrationInfo {
  hostAddress: string;
  apiUrl: string;
  models: string[];
  stakedAmount: bigint;
  registrationBlock: number;
  isActive: boolean;
  metadata?: Record<string, any>;
}

/**
 * Validate registration requirements
 */
export async function validateRegistrationRequirements(): Promise<{
  canRegister: boolean;
  requirements: any;
  errors: string[];
}> {
  try {
    // Check balance requirements (wallet balances only, not staking status)
    const { checkRegistrationRequirements } = await import('../balance/requirements');
    const requirements = await checkRegistrationRequirements();

    if (!requirements.meetsAll) {
      return {
        canRegister: false,
        requirements,
        errors: requirements.errors
      };
    }

    // Check if already registered
    const status = await checkRegistrationStatus();
    if (status.isRegistered) {
      return {
        canRegister: false,
        requirements,
        errors: ['Host is already registered']
      };
    }

    return {
      canRegister: true,
      requirements,
      errors: []
    };
  } catch (error: any) {
    throw new RegistrationError(
      `Failed to validate requirements: ${error.message}`,
      ErrorCode.VALIDATION_FAILED,
      { originalError: error }
    );
  }
}

/**
 * Check registration status
 */
export async function checkRegistrationStatus(): Promise<RegistrationStatus> {
  const sdk = getSDK();
  if (!sdk.isAuthenticated()) {
    throw new Error('SDK not authenticated');
  }

  const address = getAuthenticatedAddress();
  if (!address) {
    throw new Error('No authenticated address');
  }

  try {
    const hostManager = sdk.getHostManager();

    // Try to get host info directly
    let hostInfo: any;
    try {
      // Try to get host info/status directly
      hostInfo = await hostManager.getHostInfo?.(address) ||
                 await hostManager.getHostStatus?.(address);
    } catch (error) {
      // Error getting host info
      console.debug('Error getting host info:', error);
      return {
        isRegistered: false,
        hostAddress: null,
        stakedAmount: 0n
      };
    }

    // Check if registered based on hostInfo
    if (!hostInfo || !hostInfo.isRegistered) {
      return {
        isRegistered: false,
        hostAddress: null,
        stakedAmount: 0n
      };
    }

    return {
      isRegistered: true,
      hostAddress: address,
      stakedAmount: hostInfo.stake || hostInfo.stakedAmount || 0n,
      apiUrl: hostInfo.apiUrl || hostInfo.endpoint,
      models: hostInfo.models || hostInfo.supportedModels,
      isActive: hostInfo.active !== false
    };
  } catch (error: any) {
    throw new RegistrationError(
      `Failed to check registration status: ${error.message}`,
      ErrorCode.STATUS_CHECK_FAILED,
      { originalError: error }
    );
  }
}

/**
 * Get registration information
 */
export async function getRegistrationInfo(): Promise<RegistrationInfo | null> {
  const status = await checkRegistrationStatus();

  if (!status.isRegistered) {
    return null;
  }

  // Load saved state for additional info
  const savedState = await loadRegistrationState();

  return {
    hostAddress: status.hostAddress!,
    apiUrl: status.apiUrl || '',
    models: status.models || [],
    stakedAmount: status.stakedAmount,
    registrationBlock: savedState?.registrationBlock || 0,
    isActive: status.isActive || false,
    metadata: savedState?.metadata
  };
}

/**
 * Register as a host
 */
export async function registerHost(config: RegistrationConfig): Promise<{
  success: boolean;
  transactionHash: string;
  hostInfo: RegistrationInfo;
}> {
  const sdk = getSDK();
  if (!sdk.isAuthenticated()) {
    throw new Error('SDK not authenticated');
  }

  const address = getAuthenticatedAddress();
  if (!address) {
    throw new Error('No authenticated address');
  }

  try {
    // Validate requirements
    config.onProgress?.('Checking requirements...');
    const validation = await validateRegistrationRequirements();

    if (!validation.canRegister) {
      throw new RegistrationError(
        'Cannot register: ' + validation.errors.join(', '),
        ErrorCode.REQUIREMENTS_NOT_MET,
        { errors: validation.errors }
      );
    }

    // Validate configuration
    validateRegistrationConfig(config);

    // Set default stake amount
    const stakeAmount = config.stakeAmount || 1000000000000000000000n; // 1000 FAB

    // Approve tokens
    config.onProgress?.('Approving FAB tokens...');
    const approvalResult = await approveTokens(stakeAmount);

    if (!approvalResult.success && !approvalResult.skipped) {
      throw new RegistrationError(
        'Token approval failed',
        ErrorCode.APPROVAL_FAILED,
        { result: approvalResult }
      );
    }

    // Prepare staking config
    const stakingConfig: StakingConfig = {
      amount: stakeAmount,
      models: config.models,
      apiUrl: config.apiUrl,
      metadata: config.metadata,
      gasLimit: config.gasLimit,
      gasPrice: config.gasPrice
    };

    // Execute staking and registration
    config.onProgress?.('Registering host and staking tokens...');
    const stakingResult = await stakeTokens(stakingConfig);

    if (!stakingResult.success) {
      throw new RegistrationError(
        'Registration failed',
        ErrorCode.REGISTRATION_FAILED,
        { result: stakingResult }
      );
    }

    // Save registration state
    await saveRegistrationState({
      hostAddress: address,
      apiUrl: config.apiUrl,
      models: config.models,
      stakedAmount: stakeAmount,
      registrationBlock: stakingResult.blockNumber || 0,
      transactionHash: stakingResult.transactionHash,
      metadata: config.metadata,
      timestamp: Date.now()
    });

    // Get final host info
    const hostInfo = await getRegistrationInfo();

    if (!hostInfo) {
      throw new Error('Failed to retrieve host information after registration');
    }

    config.onProgress?.('Registration complete!');

    return {
      success: true,
      transactionHash: stakingResult.transactionHash,
      hostInfo
    };
  } catch (error: any) {
    // Handle and enhance error
    if (error instanceof RegistrationError) {
      throw error;
    }

    throw new RegistrationError(
      `Registration failed: ${error.message}`,
      ErrorCode.REGISTRATION_FAILED,
      { originalError: error }
    );
  }
}

/**
 * Validate registration configuration
 */
function validateRegistrationConfig(config: RegistrationConfig): void {
  // Validate API URL
  if (!config.apiUrl || config.apiUrl.trim() === '') {
    throw new RegistrationError(
      'API URL is required',
      ErrorCode.INVALID_API_URL
    );
  }

  try {
    const url = new URL(config.apiUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Invalid protocol');
    }
  } catch {
    throw new RegistrationError(
      'Invalid API URL format',
      ErrorCode.INVALID_API_URL,
      { provided: config.apiUrl }
    );
  }

  // Validate models
  if (!config.models || config.models.length === 0) {
    throw new RegistrationError(
      'At least one model is required',
      ErrorCode.INVALID_MODELS
    );
  }

  // Validate model names (allow repo/file or repo:file formats)
  const validModelPattern = /^[a-zA-Z0-9-_./: ]+$/;
  for (const model of config.models) {
    if (!model || !validModelPattern.test(model)) {
      throw new RegistrationError(
        `Invalid model name: ${model}`,
        ErrorCode.INVALID_MODELS,
        { invalidModel: model }
      );
    }
  }

  // Validate metadata if provided
  if (config.metadata) {
    if (config.metadata.name && config.metadata.name.length > 255) {
      throw new RegistrationError(
        'Metadata name is too long (max 255 characters)',
        ErrorCode.INVALID_METADATA
      );
    }

    if (config.metadata.description && config.metadata.description.length > 1000) {
      throw new RegistrationError(
        'Metadata description is too long (max 1000 characters)',
        ErrorCode.INVALID_METADATA
      );
    }
  }
}