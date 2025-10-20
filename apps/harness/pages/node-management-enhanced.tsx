// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Node Management Enhanced - Multi-Chain & Multi-Wallet Support
 *
 * Features:
 * - Multi-chain: Base Sepolia, opBNB Testnet
 * - Multi-wallet: MetaMask, Private Key (Base Account Kit temporarily disabled due to build issues)
 * - Dynamic node discovery from blockchain
 * - Test host management (TEST_HOST_1, TEST_HOST_2)
 *
 * NO HARDCODED HOSTS OR URLS!
 */

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { ethers } from 'ethers';

// Dynamically import the actual component to avoid SSR issues
const NodeManagementComponent = dynamic(
  () => import('../components/NodeManagementClient'),
  {
    ssr: false,
    loading: () => <div style={{ padding: '20px' }}>Loading Node Management...</div>
  }
);

const NodeManagementEnhanced: React.FC = () => {
  return <NodeManagementComponent />;
};

export default NodeManagementEnhanced;