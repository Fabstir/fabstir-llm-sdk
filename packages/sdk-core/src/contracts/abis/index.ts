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
// AUDIT-F3: All session creation functions now require proofTimeoutWindow parameter
export const JobMarketplaceFragments = {
  // Session creation functions (AUDIT-F3: added proofTimeoutWindow)
  createSessionJob: 'function createSessionJob(address host, uint256 pricePerToken, uint256 maxDuration, uint256 proofInterval, uint256 proofTimeoutWindow) payable returns (uint256)',
  createSessionJobForModel: 'function createSessionJobForModel(address host, bytes32 modelId, uint256 pricePerToken, uint256 maxDuration, uint256 proofInterval, uint256 proofTimeoutWindow) payable returns (uint256)',
  createSessionJobWithToken: 'function createSessionJobWithToken(address host, address token, uint256 deposit, uint256 pricePerToken, uint256 maxDuration, uint256 proofInterval, uint256 proofTimeoutWindow) returns (uint256)',
  createSessionJobForModelWithToken: 'function createSessionJobForModelWithToken(address host, bytes32 modelId, address token, uint256 deposit, uint256 pricePerToken, uint256 maxDuration, uint256 proofInterval, uint256 proofTimeoutWindow) returns (uint256)',
  createSessionFromDeposit: 'function createSessionFromDeposit(address host, address paymentToken, uint256 deposit, uint256 pricePerToken, uint256 maxDuration, uint256 proofInterval, uint256 proofTimeoutWindow) returns (uint256)',
  // AUDIT-F5: New function for model-specific deposit sessions
  createSessionFromDepositForModel: 'function createSessionFromDepositForModel(bytes32 modelId, address host, address paymentToken, uint256 deposit, uint256 pricePerToken, uint256 maxDuration, uint256 proofInterval, uint256 proofTimeoutWindow) returns (uint256)',
  // Proof functions - Feb 2026: signature removed (auth via msg.sender == session.host)
  submitProofOfWork: 'function submitProofOfWork(uint256 jobId, uint256 tokensClaimed, bytes32 proofHash, string proofCID, string deltaCID)',
  getSessionJob: 'function getSessionJob(uint256 jobId) returns (tuple(address host, address renter, uint256 deposit, uint256 pricePerToken, uint256 maxDuration, uint256 endTime, uint256 proofInterval, uint256 tokensProven, uint256 completedAt, address paymentToken, bool isCompleted))',
  withdrawTreasuryTokens: 'function withdrawTreasuryTokens(address token) returns (bool)',
  // View functions (getProofSubmission now returns deltaCID)
  getProofSubmission: 'function getProofSubmission(uint256 sessionId, uint256 proofIndex) view returns (bytes32 proofHash, uint256 tokensClaimed, uint256 timestamp, bool verified, string deltaCID)',
  getLockedBalanceNative: 'function getLockedBalanceNative(address account) view returns (uint256)',
  getLockedBalanceToken: 'function getLockedBalanceToken(address account, address token) view returns (uint256)',
  getTotalBalanceNative: 'function getTotalBalanceNative(address account) view returns (uint256)',
  getTotalBalanceToken: 'function getTotalBalanceToken(address account, address token) view returns (uint256)',
  // Timeout constants (AUDIT-F3)
  MIN_PROOF_TIMEOUT: 'function MIN_PROOF_TIMEOUT() view returns (uint256)',
  MAX_PROOF_TIMEOUT: 'function MAX_PROOF_TIMEOUT() view returns (uint256)',
  DEFAULT_PROOF_TIMEOUT: 'function DEFAULT_PROOF_TIMEOUT() view returns (uint256)',
  // V2 Direct Payment Delegation - Feb 2026
  authorizeDelegate: 'function authorizeDelegate(address delegate, bool authorized)',
  isDelegateAuthorized: 'function isDelegateAuthorized(address depositor, address delegate) view returns (bool)',
  createSessionForModelAsDelegate: 'function createSessionForModelAsDelegate(address payer, bytes32 modelId, address host, address paymentToken, uint256 amount, uint256 pricePerToken, uint256 maxDuration, uint256 proofInterval, uint256 proofTimeoutWindow) returns (uint256)',
  // Early cancellation fee - Feb 2026
  minTokensFee: 'function minTokensFee() view returns (uint256)'
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