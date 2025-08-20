/**
 * Backward compatibility wrapper for FabstirSDK
 * Maps old FabstirSDK interface to new FabstirSDKHeadless
 */

import { FabstirSDKHeadless, HeadlessSDKConfig } from "./fabstir-sdk-headless.js";
import { ethers } from "ethers";

// Extended config that accepts old-style configuration
export interface FabstirConfig extends HeadlessSDKConfig {
  provider?: ethers.providers.Provider;
  signer?: ethers.Signer;
}

/**
 * Backward-compatible FabstirSDK class
 * This is a wrapper around FabstirSDKHeadless that maintains the old API
 */
export class FabstirSDK extends FabstirSDKHeadless {
  constructor(config: FabstirConfig = {}) {
    // Pass config to headless SDK
    super(config);
    
    // Handle old-style signer in config
    if (config.signer) {
      // Set signer immediately if provided in config
      this.setSigner(config.signer).catch(err => {
        console.error('Failed to set signer from config:', err);
      });
    }
    // Handle old-style provider in config
    else if (config.provider) {
      // Try to connect with provider
      this.connect(config.provider).catch(err => {
        console.error('Failed to connect provider from config:', err);
      });
    }
  }
  
  // The rest of the methods are inherited from FabstirSDKHeadless
  // No additional implementation needed as the headless SDK
  // already has all the necessary methods
}