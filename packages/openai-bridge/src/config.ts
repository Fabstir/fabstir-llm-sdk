export interface OpenAIBridgeConfig {
  port: number;
  privateKey: string;
  rpcUrl?: string;
  hostAddress?: string;
  modelName: string;
  chainId: number;
  depositAmount: string;
  pricePerToken: number;
  proofInterval: number;
  duration: number;
  apiKey?: string;
  localhostOverride?: string;
}

export const DEFAULT_PORT = 3457;
export const DEFAULT_CHAIN_ID = 84532;
export const DEFAULT_DEPOSIT_AMOUNT = '0.0002';
export const DEFAULT_PRICE_PER_TOKEN = 5000;
export const DEFAULT_PROOF_INTERVAL = 100;
export const DEFAULT_DURATION = 86400;

export function validateConfig(config: Partial<OpenAIBridgeConfig>): OpenAIBridgeConfig {
  if (!config.privateKey) {
    throw new Error('Missing required config: privateKey');
  }
  if (!config.modelName) {
    throw new Error('Missing required config: modelName');
  }

  return {
    port: config.port ?? DEFAULT_PORT,
    privateKey: config.privateKey,
    rpcUrl: config.rpcUrl,
    hostAddress: config.hostAddress ?? undefined,
    modelName: config.modelName,
    chainId: config.chainId ?? DEFAULT_CHAIN_ID,
    depositAmount: config.depositAmount ?? DEFAULT_DEPOSIT_AMOUNT,
    pricePerToken: config.pricePerToken ?? DEFAULT_PRICE_PER_TOKEN,
    proofInterval: config.proofInterval ?? DEFAULT_PROOF_INTERVAL,
    duration: config.duration ?? DEFAULT_DURATION,
    apiKey: config.apiKey,
    localhostOverride: config.localhostOverride,
  };
}

export function loadConfigFromEnv(): Partial<OpenAIBridgeConfig> {
  const config: Partial<OpenAIBridgeConfig> = {};
  if (process.env.OPENAI_BRIDGE_PORT) config.port = parseInt(process.env.OPENAI_BRIDGE_PORT, 10);
  if (process.env.OPENAI_BRIDGE_PRIVATE_KEY) config.privateKey = process.env.OPENAI_BRIDGE_PRIVATE_KEY;
  if (process.env.OPENAI_BRIDGE_HOST) config.hostAddress = process.env.OPENAI_BRIDGE_HOST;
  if (process.env.OPENAI_BRIDGE_MODEL) config.modelName = process.env.OPENAI_BRIDGE_MODEL;
  if (process.env.OPENAI_BRIDGE_RPC_URL) config.rpcUrl = process.env.OPENAI_BRIDGE_RPC_URL;
  if (process.env.OPENAI_BRIDGE_CHAIN_ID) config.chainId = parseInt(process.env.OPENAI_BRIDGE_CHAIN_ID, 10);
  if (process.env.OPENAI_BRIDGE_DEPOSIT) config.depositAmount = process.env.OPENAI_BRIDGE_DEPOSIT;
  if (process.env.OPENAI_BRIDGE_API_KEY) config.apiKey = process.env.OPENAI_BRIDGE_API_KEY;
  return config;
}
