export interface ContractConfig {
  address: string;
  abi: any[];
  chainId: number;
}

export interface EventFilter {
  jobId?: number;
  fromBlock?: number;
  toBlock?: number | 'latest';
}

export interface DecodedEvent {
  name: string;
  args: Record<string, any>;
  blockNumber: number;
}

export interface GasEstimate {
  gasLimit: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}