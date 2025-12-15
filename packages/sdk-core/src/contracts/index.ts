// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Contract exports for browser-compatible SDK
 */

export { ContractManager } from './ContractManager';
export type { ContractAddresses } from './ContractManager';

// Export all ABIs for direct use - Using Upgradeable versions for UUPS proxy pattern
export { default as JobMarketplaceABI } from './abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json';
export { default as NodeRegistryABI } from './abis/NodeRegistryWithModelsUpgradeable-CLIENT-ABI.json';
export { default as HostEarningsABI } from './abis/HostEarningsUpgradeable-CLIENT-ABI.json';
export { default as PaymentEscrowABI } from './abis/PaymentEscrowWithEarnings-CLIENT-ABI.json';
export { default as ProofSystemABI } from './abis/ProofSystemUpgradeable-CLIENT-ABI.json';
export { default as ERC20ABI } from './abis/ERC20-ABI.json';
export { default as BaseAccountFactoryABI } from './abis/BaseAccountFactory-ABI.json';
export { default as BaseSmartAccountABI } from './abis/BaseSmartAccount-ABI.json';

// Note: DEPLOYMENT_INFO.json is for reference only and should not be imported
// All contract addresses must come from environment variables