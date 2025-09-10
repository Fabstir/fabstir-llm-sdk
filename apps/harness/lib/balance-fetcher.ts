const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e', HOST_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7', TREASURY_ADDRESS = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
export async function fetchUSDCBalance(address: string): Promise<bigint> {
  if (!window.ethereum) throw new Error('No provider found');
  const data = '0x70a08231' + address.slice(2).padStart(64, '0');
  const result = await window.ethereum.request({
    method: 'eth_call', params: [{ to: USDC_ADDRESS, data }, 'latest'] });
  return BigInt(result as string);
}
export async function fetchAllBalances(smartAccount: string) {
  const [smart, host, treasury] = await Promise.all([
    fetchUSDCBalance(smartAccount), fetchUSDCBalance(HOST_ADDRESS), fetchUSDCBalance(TREASURY_ADDRESS)
  ]);
  return { smartBalance: smart, hostBalance: host, treasuryBalance: treasury };
}
export { HOST_ADDRESS, TREASURY_ADDRESS, USDC_ADDRESS };