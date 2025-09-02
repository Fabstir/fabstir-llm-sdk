export const JobMarketplaceABI = [
  // Create session job (payable) - 5 parameters
  "function createSessionJob(address hostAddress, uint256 depositAmount, uint256 pricePerToken, uint256 maxDuration, uint256 proofInterval) payable returns (uint256)",
  
  // Complete session job - USER function (not completeJob!)
  "function completeSessionJob(uint256 jobId) external",
  
  // Submit proof of work - HOST function to prove work done
  "function submitProofOfWork(uint256 jobId, bytes ekzlProof, uint256 tokensInBatch) external returns (bool)",
  
  // Get session details
  "function sessions(uint256) view returns (uint256 depositAmount, uint256 pricePerToken, uint256 maxDuration, uint256 sessionStartTime, address assignedHost, uint8 status, uint256 provenTokens, uint256 lastProofSubmission, bytes32 aggregateProofHash, uint256 checkpointInterval, uint256 lastActivity, uint256 disputeDeadline)",
  
  // Cancel abandoned job
  "function cancelAbandonedJob(uint256 jobId) external",
  
  // Create session job with ERC20 token
  "function createSessionJobWithToken(address host, address token, uint256 deposit, uint256 pricePerToken, uint256 maxDuration, uint256 proofInterval) returns (uint256)",
  
  // Events
  "event SessionJobCreated(uint256 indexed jobId, address indexed client, address indexed host, uint256 depositAmount, uint256 pricePerToken, uint256 maxDuration)",
  "event SessionJobCompleted(uint256 indexed jobId, address indexed client, address indexed host, uint256 payment)",
  "event ProofSubmitted(uint256 indexed jobId, address indexed host, bytes32 proofHash, uint256 tokenCount)"
];