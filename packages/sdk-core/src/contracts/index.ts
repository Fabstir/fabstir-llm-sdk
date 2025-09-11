/**
 * Contract exports for browser-compatible SDK
 */

export { ContractManager } from './ContractManager';
export type { ContractAddresses } from './ContractManager';

// Export all ABIs for direct use
export { default as JobMarketplaceABI } from './abis/JobMarketplaceFABWithS5-CLIENT-ABI.json';
export { default as NodeRegistryABI } from './abis/NodeRegistryFAB-CLIENT-ABI.json';
export { default as HostEarningsABI } from './abis/HostEarnings-CLIENT-ABI.json';
export { default as PaymentEscrowABI } from './abis/PaymentEscrowWithEarnings-CLIENT-ABI.json';
export { default as ProofSystemABI } from './abis/ProofSystem-CLIENT-ABI.json';
export { default as ERC20ABI } from './abis/ERC20-ABI.json';
export { default as BaseAccountFactoryABI } from './abis/BaseAccountFactory-ABI.json';
export { default as BaseSmartAccountABI } from './abis/BaseSmartAccount-ABI.json';

// Export deployment info
export { default as DEPLOYMENT_INFO } from './abis/DEPLOYMENT_INFO.json';