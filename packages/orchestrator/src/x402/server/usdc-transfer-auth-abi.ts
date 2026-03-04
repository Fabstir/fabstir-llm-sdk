// Minimal ABI fragment for EIP-3009 transferWithAuthorization (USDC)
export const TRANSFER_WITH_AUTHORIZATION_ABI = [
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)',
];
