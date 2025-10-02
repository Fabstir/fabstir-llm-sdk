/**
 * Requirements validation module
 * Checks if host meets all operational requirements
 */

import {
  getETHBalance,
  getFABBalance,
  getStakingStatus,
  checkMinimumETH,
  checkMinimumFAB,
  formatETHBalance,
  formatFABBalance
} from './checker';
import { getSDK, getAuthenticatedAddress } from '../sdk/client';

/**
 * Minimum requirements for host operation
 */
export const MINIMUM_REQUIREMENTS = {
  ETH: 15000000000000000n,      // 0.015 ETH for gas
  FAB: 1000000000000000000000n, // 1000 FAB tokens
  STAKING: 1000000000000000000000n // 1000 FAB staked
};

/**
 * Requirements check result
 */
export interface RequirementsResult {
  meetsAll: boolean;
  eth: {
    hasMinimum: boolean;
    balance: bigint;
    required: bigint;
    shortfall: bigint;
  };
  fab: {
    hasMinimum: boolean;
    balance: bigint;
    required: bigint;
    shortfall: bigint;
  };
  staking: {
    isStaked: boolean;
    stakedAmount: bigint;
    requiredStake: bigint;
  };
  errors: string[];
}

/**
 * Check requirements for new registration (wallet balances only)
 */
export async function checkRegistrationRequirements(): Promise<RequirementsResult> {
  const sdk = getSDK();
  if (!sdk.isAuthenticated()) {
    throw new Error('SDK not authenticated');
  }

  const errors: string[] = [];

  // Check ETH balance for gas
  const ethCheck = await checkMinimumETH(MINIMUM_REQUIREMENTS.ETH);
  if (!ethCheck.hasMinimum) {
    errors.push(`Insufficient ETH: need ${formatETHBalance(ethCheck.shortfall, 4)}`);
  }

  // Check FAB balance for staking
  const fabCheck = await checkMinimumFAB(MINIMUM_REQUIREMENTS.FAB);
  if (!fabCheck.hasMinimum) {
    errors.push(`Insufficient FAB: need ${formatFABBalance(fabCheck.shortfall, 0)}`);
  }

  // For new registrations, we don't check staking status (staking happens during registration)
  const stakingStatus = {
    isStaked: false,
    stakedAmount: 0n,
    requiredStake: MINIMUM_REQUIREMENTS.STAKING
  };

  return {
    meetsAll: errors.length === 0,
    eth: ethCheck,
    fab: fabCheck,
    staking: stakingStatus,
    errors
  };
}

/**
 * Check all requirements at once (for existing hosts)
 */
export async function checkAllRequirements(): Promise<RequirementsResult> {
  const sdk = getSDK();
  if (!sdk.isAuthenticated()) {
    throw new Error('SDK not authenticated');
  }

  const errors: string[] = [];

  // Check ETH balance
  const ethCheck = await checkMinimumETH(MINIMUM_REQUIREMENTS.ETH);
  if (!ethCheck.hasMinimum) {
    errors.push(`Insufficient ETH: need ${formatETHBalance(ethCheck.shortfall, 4)}`);
  }

  // Check FAB balance
  const fabCheck = await checkMinimumFAB(MINIMUM_REQUIREMENTS.FAB);
  if (!fabCheck.hasMinimum) {
    errors.push(`Insufficient FAB: need ${formatFABBalance(fabCheck.shortfall, 0)}`);
  }

  // Check staking status (only for existing hosts)
  const stakingStatus = await getStakingStatus();
  if (!stakingStatus.isStaked) {
    const needed = stakingStatus.requiredStake - stakingStatus.stakedAmount;
    errors.push(`Insufficient staking: need ${formatFABBalance(needed, 0)} more`);
  }

  return {
    meetsAll: errors.length === 0,
    eth: ethCheck,
    fab: fabCheck,
    staking: stakingStatus,
    errors
  };
}

/**
 * Validate if user can operate as host
 */
export async function validateHostRequirements(detailed?: false): Promise<boolean>;
export async function validateHostRequirements(detailed: true): Promise<{ valid: boolean; reasons: string[] }>;
export async function validateHostRequirements(detailed = false): Promise<boolean | { valid: boolean; reasons: string[] }> {
  try {
    const requirements = await checkAllRequirements();

    if (detailed) {
      return {
        valid: requirements.meetsAll,
        reasons: requirements.errors
      };
    }

    return requirements.meetsAll;
  } catch (error) {
    if (detailed) {
      return {
        valid: false,
        reasons: [`Error checking requirements: ${error}`]
      };
    }
    return false;
  }
}

/**
 * Requirements status report
 */
export interface RequirementsStatus {
  timestamp: number;
  address: string;
  requirements: {
    eth: {
      hasMinimum: boolean;
      balance: bigint;
      required: bigint;
      shortfall?: bigint;
    };
    fab: {
      hasMinimum: boolean;
      balance: bigint;
      required: bigint;
      shortfall?: bigint;
    };
    staking: {
      isStaked: boolean;
      stakedAmount: bigint;
      requiredStake: bigint;
    };
  };
  canOperate: boolean;
}

/**
 * Get comprehensive requirements status
 */
export async function getRequirementsStatus(): Promise<RequirementsStatus> {
  const sdk = getSDK();
  if (!sdk.isAuthenticated()) {
    throw new Error('SDK not authenticated');
  }

  const requirements = await checkAllRequirements();

  const address = getAuthenticatedAddress();
  if (!address) {
    throw new Error('No authenticated address');
  }

  return {
    timestamp: Date.now(),
    address,
    requirements: {
      eth: {
        hasMinimum: requirements.eth.hasMinimum,
        balance: requirements.eth.balance,
        required: requirements.eth.required,
        shortfall: requirements.eth.shortfall > 0n ? requirements.eth.shortfall : undefined
      },
      fab: {
        hasMinimum: requirements.fab.hasMinimum,
        balance: requirements.fab.balance,
        required: requirements.fab.required,
        shortfall: requirements.fab.shortfall > 0n ? requirements.fab.shortfall : undefined
      },
      staking: requirements.staking
    },
    canOperate: requirements.meetsAll
  };
}

/**
 * Format requirements report for display
 */
export function formatRequirementsReport(status: RequirementsStatus): string {
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════════');
  lines.push('           Requirements Status             ');
  lines.push('═══════════════════════════════════════════');
  lines.push(`Address: ${status.address}`);
  lines.push(`Time: ${new Date(status.timestamp).toLocaleString()}`);
  lines.push('');

  // ETH requirement
  const ethStatus = status.requirements.eth.hasMinimum ? '✓' : '✗';
  lines.push(`${ethStatus} ETH Balance:`);
  lines.push(`  Current: ${formatETHBalance(status.requirements.eth.balance, 4)}`);
  lines.push(`  Required: ${formatETHBalance(status.requirements.eth.required, 4)}`);
  if (status.requirements.eth.shortfall) {
    lines.push(`  Needed: ${formatETHBalance(status.requirements.eth.shortfall, 4)}`);
  }
  lines.push('');

  // FAB requirement
  const fabStatus = status.requirements.fab.hasMinimum ? '✓' : '✗';
  lines.push(`${fabStatus} FAB Balance:`);
  lines.push(`  Current: ${formatFABBalance(status.requirements.fab.balance, 0)}`);
  lines.push(`  Required: ${formatFABBalance(status.requirements.fab.required, 0)}`);
  if (status.requirements.fab.shortfall) {
    lines.push(`  Needed: ${formatFABBalance(status.requirements.fab.shortfall, 0)}`);
  }
  lines.push('');

  // Staking requirement
  const stakingStatus = status.requirements.staking.isStaked ? '✓' : '✗';
  lines.push(`${stakingStatus} Staking:`);
  lines.push(`  Staked: ${formatFABBalance(status.requirements.staking.stakedAmount, 0)}`);
  lines.push(`  Required: ${formatFABBalance(status.requirements.staking.requiredStake, 0)}`);
  lines.push('');

  // Overall status
  lines.push('───────────────────────────────────────────');
  if (status.canOperate) {
    lines.push('✓ All requirements met - Ready to operate');
  } else {
    lines.push('✗ Requirements not met - Cannot operate');
    if (status.requirements.eth.shortfall) {
      lines.push(`  • Need ${formatETHBalance(status.requirements.eth.shortfall, 4)} more`);
    }
    if (status.requirements.fab.shortfall) {
      lines.push(`  • Need ${formatFABBalance(status.requirements.fab.shortfall, 0)} more`);
    }
    if (!status.requirements.staking.isStaked) {
      const needed = status.requirements.staking.requiredStake - status.requirements.staking.stakedAmount;
      lines.push(`  • Need to stake ${formatFABBalance(needed, 0)} more`);
    }
  }
  lines.push('═══════════════════════════════════════════');

  return lines.join('\n');
}