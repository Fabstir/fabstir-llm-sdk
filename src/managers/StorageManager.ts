import { ethers } from 'ethers';
import { S5 } from '@s5-dev/s5js';
import AuthManager from './AuthManager';

export default class StorageManager {
  static readonly DEFAULT_S5_PORTAL = 'wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p';
  static readonly SEED_MESSAGE = 'Generate S5 seed for Fabstir LLM';
  static readonly REGISTRY_PREFIX = 'fabstir-llm';
  static readonly CONVERSATION_PATH = 'home/conversations';
  
  private s5Client?: any;
  private userSeed?: string;
  private userAddress?: string;
  private initialized = false;

  constructor(private s5PortalUrl: string = StorageManager.DEFAULT_S5_PORTAL) {}

  async initialize(authManager: AuthManager): Promise<void> {
    try {
      this.userSeed = authManager.getS5Seed();
      this.userAddress = authManager.getUserAddress();
      this.s5Client = await S5.create({ initialPeers: [this.s5PortalUrl] });
      await this.s5Client.recoverIdentityFromSeedPhrase(this.userSeed);
      try {
        await this.s5Client.registerOnNewPortal('https://s5.vup.cx');
      } catch (error) {
        console.debug('Portal registration failed, continuing');
      }
      await this.s5Client.fs.ensureIdentityInitialized();
      this.initialized = true;
    } catch (error: any) {
      throw new Error(`Failed to initialize StorageManager: ${error.message}`);
    }
  }

  async storeData(key: string, data: any, metadata?: Record<string, any>): Promise<string> {
    if (!this.initialized) throw new Error('StorageManager not initialized');
    try {
      const dataPath = `${StorageManager.CONVERSATION_PATH}/${this.userAddress}/${key}.json`;
      const storageData = {
        data,
        metadata: { ...metadata, timestamp: Date.now(), version: '1.0', userAddress: this.userAddress }
      };
      await this.s5Client.fs.put(dataPath, storageData);
      const pathMetadata = await this.s5Client.fs.getMetadata(dataPath);
      if (!pathMetadata?.cid) throw new Error('Failed to get CID after storage');
      return pathMetadata.cid;
    } catch (error: any) {
      throw new Error(`Failed to store data: ${error.message}`);
    }
  }

  async retrieveData(key: string): Promise<any> {
    if (!this.initialized) throw new Error('StorageManager not initialized');
    try {
      const dataPath = `${StorageManager.CONVERSATION_PATH}/${this.userAddress}/${key}.json`;
      const retrievedData = await this.s5Client.fs.get(dataPath);
      if (!retrievedData) return null;
      return retrievedData.data || retrievedData;
    } catch (error: any) {
      throw new Error(`Failed to retrieve data: ${error.message}`);
    }
  }

  async listUserData(): Promise<Array<{ key: string; cid: string; timestamp: number }>> {
    if (!this.initialized) throw new Error('StorageManager not initialized');
    try {
      const userPath = `${StorageManager.CONVERSATION_PATH}/${this.userAddress}`;
      const files = await this.s5Client.fs.list(userPath) || [];
      const items = [];
      for (const file of files) {
        const metadata = await this.s5Client.fs.getMetadata(file.path);
        if (metadata?.type === 'file' && metadata?.cid) {
          const key = file.path.split('/').pop()?.replace('.json', '') || '';
          items.push({
            key,
            cid: metadata.cid,
            timestamp: metadata.timestamp || Date.now()
          });
        }
      }
      return items;
    } catch (error: any) {
      throw new Error(`Failed to list user data: ${error.message}`);
    }
  }

  isInitialized(): boolean { return this.initialized; }
}