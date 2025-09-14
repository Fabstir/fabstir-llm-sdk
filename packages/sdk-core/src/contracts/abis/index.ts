/**
 * Centralized ABI imports - Single source of truth for all contract ABIs
 * ABIs are stored in src/contracts/abis/
 * This prevents duplication and makes updates easier when contracts are upgraded
 */

// Import all ABIs from local folder
import JobMarketplaceABI from './JobMarketplaceWithModels-CLIENT-ABI.json';
import HostEarningsABI from './HostEarnings-CLIENT-ABI.json';
import NodeRegistryABI from './NodeRegistryFAB-CLIENT-ABI.json';
import NodeRegistryWithModelsABI from './NodeRegistryWithModels-CLIENT-ABI.json';
import ProofSystemABI from './ProofSystem-CLIENT-ABI.json';
import ERC20ABI from './ERC20-ABI.json';
import BaseAccountFactoryABI from './BaseAccountFactory-ABI.json';
import BaseSmartAccountABI from './BaseSmartAccount-ABI.json';

// Export all ABIs for use throughout the application
export {
  JobMarketplaceABI,
  HostEarningsABI,
  NodeRegistryABI,
  NodeRegistryWithModelsABI,
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
  registerNode: 'function registerNode(string memory url, uint256 stake) returns (bool)',
  unregisterNode: 'function unregisterNode() returns (bool)',
  getNodeInfo: 'function getNodeInfo(address node) returns (tuple(string url, uint256 stake, bool isActive))'
};