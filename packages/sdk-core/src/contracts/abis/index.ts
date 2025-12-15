// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Centralized ABI imports - Single source of truth for all contract ABIs
 * ABIs are stored in src/contracts/abis/
 * This prevents duplication and makes updates easier when contracts are upgraded
 *
 * NOTE: Using require() instead of import to ensure CommonJS compatibility
 * JSON arrays loaded via require() don't have .default property, which causes
 * issues with esbuild's __toESM() wrapper when bundling for CommonJS
 */

// Import all ABIs from local folder using require() for CommonJS compatibility
// Using Upgradeable versions for UUPS proxy pattern support
const JobMarketplaceABI = require('./JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json');
const HostEarningsABI = require('./HostEarningsUpgradeable-CLIENT-ABI.json');
const NodeRegistryABI = require('./NodeRegistryWithModelsUpgradeable-CLIENT-ABI.json');
const ProofSystemABI = require('./ProofSystemUpgradeable-CLIENT-ABI.json');
const ERC20ABI = require('./ERC20-ABI.json');
const BaseAccountFactoryABI = require('./BaseAccountFactory-ABI.json');
const BaseSmartAccountABI = require('./BaseSmartAccount-ABI.json');

// Export all ABIs for use throughout the application
export {
  JobMarketplaceABI,
  HostEarningsABI,
  NodeRegistryABI,
  ProofSystemABI,
  ERC20ABI,
  BaseAccountFactoryABI,
  BaseSmartAccountABI
};

// Export specific ABI fragments for common operations
export const JobMarketplaceFragments = {
  createSessionJobWithToken: 'function createSessionJobWithToken(address host, address token, uint256 deposit, uint256 pricePerToken, uint256 maxDuration, uint256 proofInterval) returns (uint256)',
  submitProofOfWork: 'function submitProofOfWork(uint256 jobId, bytes proof, uint256 tokensProven) returns (bool)',
  claimWithProof: 'function claimWithProof(uint256 jobId) returns (bool)',
  getSessionJob: 'function getSessionJob(uint256 jobId) returns (tuple(address host, address renter, uint256 deposit, uint256 pricePerToken, uint256 maxDuration, uint256 endTime, uint256 proofInterval, uint256 tokensProven, uint256 completedAt, address paymentToken, bool isCompleted))',
  withdrawTreasuryTokens: 'function withdrawTreasuryTokens(address token) returns (bool)'
};

export const HostEarningsFragments = {
  getBalance: 'function getBalance(address host, address token) returns (uint256)',
  withdrawAll: 'function withdrawAll(address token) returns (bool)',
  withdraw: 'function withdraw(uint256 amount, address token) returns (bool)'
};

export const NodeRegistryFragments = {
  registerNode: 'function registerNode(string metadata, string apiUrl, bytes32[] modelIds)',
  unregisterNode: 'function unregisterNode()',
  stake: 'function stake(uint256 amount)',
  nodes: 'function nodes(address) view returns (address operator, uint256 stakedAmount, bool active, string metadata, string apiUrl)',
  getNodeModels: 'function getNodeModels(address nodeAddress) view returns (bytes32[])',
  isActiveNode: 'function isActiveNode(address operator) view returns (bool)'
};