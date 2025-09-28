import { ethers } from 'ethers';
import { vi } from 'vitest';
import { ChainId } from '../../src/types/chain.types';

export function createMockProvider(chainId: number) {
  return {
    request: vi.fn().mockImplementation(async ({ method, params }: any) => {
      switch (method) {
        case 'eth_requestAccounts':
          return ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'];
        case 'eth_chainId':
          return `0x${chainId.toString(16)}`;
        case 'eth_blockNumber':
          return '0x1';
        case 'eth_getBalance':
          return '0x1000000000000000000'; // 1 ETH/BNB
        case 'wallet_switchEthereumChain':
          return null;
        case 'wallet_addEthereumChain':
          return null;
        default:
          throw new Error(`Unsupported method: ${method}`);
      }
    })
  };
}

export function createTestWallet(chainId: number) {
  const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  const provider = new ethers.JsonRpcProvider('http://localhost:8545', chainId);
  return new ethers.Wallet(privateKey, provider);
}

export function verifyContractAddress(chainId: number, contractType: string, address: string): boolean {
  // Use environment variables if available, fallback to new contract addresses
  const expectedAddresses: Record<number, Record<string, string>> = {
    [ChainId.BASE_SEPOLIA]: {
      jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE || '0xCDfbb2f1756f9F6281AeE504EBCD4883d5dafB19',
      nodeRegistry: process.env.CONTRACT_NODE_REGISTRY || '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
      proofSystem: process.env.CONTRACT_PROOF_SYSTEM || '0x2ACcc60893872A499700908889B38C5420CBcFD1',
      usdcToken: process.env.CONTRACT_USDC_TOKEN || '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
    },
    [ChainId.OPBNB_TESTNET]: {
      jobMarketplace: '0x0000000000000000000000000000000000000001',
      nodeRegistry: '0x0000000000000000000000000000000000000002',
      proofSystem: '0x0000000000000000000000000000000000000003',
      usdcToken: '0x0000000000000000000000000000000000000006'
    }
  };

  return expectedAddresses[chainId]?.[contractType] === address;
}