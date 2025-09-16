import { ethers } from 'ethers';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Load contract ABI from file
 */
export async function loadContractABI(contractName: string): Promise<any> {
  const abiPath = path.join(
    __dirname,
    '../../src/contracts/abis',
    `${contractName}.json`
  );

  try {
    const abiContent = await fs.readFile(abiPath, 'utf-8');
    const abi = JSON.parse(abiContent);
    return abi.abi || abi;
  } catch (error) {
    throw new Error(`Failed to load ABI for ${contractName}: ${error}`);
  }
}

/**
 * Get contract instance
 */
export async function getContract(
  contractName: string,
  contractAddress: string,
  signerOrProvider: ethers.Signer | ethers.Provider
): Promise<ethers.Contract> {
  const abi = await loadContractABI(contractName);
  return new ethers.Contract(contractAddress, abi, signerOrProvider);
}

/**
 * Check if host is registered in NodeRegistry
 */
export async function isHostRegistered(
  nodeRegistryAddress: string,
  hostAddress: string,
  provider: ethers.Provider
): Promise<boolean> {
  const nodeRegistry = await getContract(
    'NodeRegistry',
    nodeRegistryAddress,
    provider
  );

  try {
    const nodeInfo = await nodeRegistry.getNode(hostAddress);
    return nodeInfo.isActive || false;
  } catch (error) {
    return false;
  }
}

/**
 * Get host's staking balance
 */
export async function getStakingBalance(
  nodeRegistryAddress: string,
  hostAddress: string,
  provider: ethers.Provider
): Promise<bigint> {
  const nodeRegistry = await getContract(
    'NodeRegistry',
    nodeRegistryAddress,
    provider
  );

  try {
    const nodeInfo = await nodeRegistry.getNode(hostAddress);
    return BigInt(nodeInfo.stakedAmount || 0);
  } catch (error) {
    return BigInt(0);
  }
}

/**
 * Get FAB token balance
 */
export async function getFABBalance(
  fabTokenAddress: string,
  address: string,
  provider: ethers.Provider
): Promise<bigint> {
  const fabToken = await getContract('FABToken', fabTokenAddress, provider);

  try {
    const balance = await fabToken.balanceOf(address);
    return BigInt(balance.toString());
  } catch (error) {
    return BigInt(0);
  }
}

/**
 * Get USDC balance
 */
export async function getUSDCBalance(
  usdcAddress: string,
  address: string,
  provider: ethers.Provider
): Promise<bigint> {
  const usdc = await getContract('MockUSDC', usdcAddress, provider);

  try {
    const balance = await usdc.balanceOf(address);
    return BigInt(balance.toString());
  } catch (error) {
    return BigInt(0);
  }
}

/**
 * Wait for blocks to be mined
 */
export async function waitForBlocks(
  provider: ethers.Provider,
  blocks: number
): Promise<void> {
  const startBlock = await provider.getBlockNumber();
  const targetBlock = startBlock + blocks;

  while (await provider.getBlockNumber() < targetBlock) {
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

/**
 * Format token amount for display
 */
export function formatTokenAmount(
  amount: bigint,
  decimals: number = 18
): string {
  return ethers.formatUnits(amount, decimals);
}