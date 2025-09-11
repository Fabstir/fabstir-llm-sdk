# Node Registration Harness Page Implementation Plan

## Overview

Create `/workspace/apps/harness/pages/node-registration.tsx` that allows hosts to register/unregister with the NodeRegistry contract, stake/unstake FAB tokens, and view comprehensive node information.

## Key Components

### 1. Page Structure

- Header with page title and description
- Two-column layout:
  - Left: Registration/Management controls
  - Right: Node information display
- Status messages area at bottom

### 2. Host Registration Section

- **Host selector dropdown**: TEST_HOST_1 and TEST_HOST_2 (using TEST_USER_1 as second host)
- **Metadata input field**: For entering node capabilities (e.g., "llama-2-7b,gpt-4,inference,base-sepolia")
- **Register button**: Registers host with DEFAULT_STAKE_AMOUNT (1000 FAB)
- **Unregister button**: Unregisters and returns staked FAB tokens
- **Update Metadata button**: Updates node metadata
- **Add Stake button**: Adds additional stake (optional amount input)

### 3. Node Information Display

For each host, display:
- **Account Address**: Host wallet address
- **Registration Status**: Registered/Not Registered
- **Active Status**: Active/Inactive (boolean from contract)
- **Staked Amount**: FAB tokens staked (from contract)
- **USDC Balance**: Current USDC balance
- **FAB Balance**: Current FAB token balance
- **Metadata**: Raw metadata string from contract
- **Parsed Models**: Extracted model names from metadata
- **Node Endpoint**: URL if available in metadata

### 4. Live Node Metrics (when host is registered)

Query the node's API endpoints to display:
- **Online Status**: Online/Offline based on API availability
- **Available Models**: From `/v1/models` endpoint
- **Node Metrics**: From `/metrics` endpoint:
  - Uptime
  - Total requests
  - Active connections
  - GPU utilization
  - Memory usage
  - Average response time
  - Total tokens generated

### 5. Accumulated Earnings Section

- Display USDC earnings from HostEarnings contract
- Withdraw earnings button

## Technical Implementation

### Using FabstirSDK and HostManager

```typescript
// Initialize SDK
const sdk = new FabstirSDK({
  rpcUrl: RPC_URL,
  contractAddresses: {
    jobMarketplace: CONTRACT_JOB_MARKETPLACE,
    nodeRegistry: CONTRACT_NODE_REGISTRY,
    fabToken: CONTRACT_FAB_TOKEN,
    // other addresses...
  }
});

// Authenticate with host private key
await sdk.authenticate(selectedHostPrivateKey);

// Get HostManager
const hostManager = sdk.getHostManager();

// Register host
await hostManager.registerHost({
  metadata: inputMetadata,
  stakeAmount: "1000" // DEFAULT_STAKE_AMOUNT
});

// Get host info
const hostInfo = await hostManager.getHostInfo(hostAddress);

// Query node capabilities (if online)
const capabilities = await hostManager.queryNodeCapabilities(hostAddress);

// Check accumulated earnings
const earnings = await hostManager.checkAccumulatedEarnings(USDC_ADDRESS);

// Withdraw earnings
await hostManager.withdrawEarnings(USDC_ADDRESS);
```

### Features Not Yet Exposed in SDK/HostManager

These features are available in the contracts but not exposed through FabstirSDK:
1. **List all active nodes** - NodeRegistry has `activeNodesList` array
2. **Get total staked amount across all nodes** - Would need to iterate activeNodesList
3. **Historical registration events** - Available via contract events
4. **Batch operations** - Register multiple hosts at once

## File Structure

```
/workspace/apps/harness/pages/node-registration.tsx
```

## Key Dependencies

- `@s5-dev/s5js` - For potential future metadata storage
- `ethers` - Blockchain interactions
- React hooks for state management
- FabstirSDK with HostManager

## Environment Variables Used

- `CONTRACT_NODE_REGISTRY` - NodeRegistry contract address
- `CONTRACT_FAB_TOKEN` - FAB token for staking
- `CONTRACT_USDC_TOKEN` - For balance checks
- `CONTRACT_HOST_EARNINGS` - For earnings withdrawal
- `DEFAULT_STAKE_AMOUNT` - 1000 FAB tokens
- `TEST_HOST_1_ADDRESS/PRIVATE_KEY` - First test host
- `TEST_USER_1_ADDRESS/PRIVATE_KEY` - Using as second test host
- `RPC_URL_BASE_SEPOLIA` - RPC endpoint

## UI Layout Mockup

```
┌─────────────────────────────────────────────────┐
│     Node Registration & Management              │
├─────────────────────────────────────────────────┤
│                                                 │
│ ┌─────────────────┐ ┌─────────────────────────┐│
│ │ Registration    │ │ Node Information        ││
│ │                 │ │                         ││
│ │ Host: [Dropdown]│ │ Address: 0x4594...     ││
│ │                 │ │ Status: ✅ Registered   ││
│ │ Metadata:       │ │ Active: true            ││
│ │ [___________]   │ │ Staked: 1000 FAB       ││
│ │                 │ │ USDC: $125.50          ││
│ │ [Register]      │ │ FAB: 5000              ││
│ │ [Unregister]    │ │                        ││
│ │ [Update Meta]   │ │ Models:                ││
│ │                 │ │ • llama-2-7b           ││
│ │ Add Stake:      │ │ • gpt-4                ││
│ │ [____] FAB      │ │                        ││
│ │ [Add Stake]     │ │ Node Status: 🟢 Online  ││
│ │                 │ │                        ││
│ │ Earnings:       │ │ Metrics:               ││
│ │ USDC: $45.20    │ │ • Uptime: 24h          ││
│ │ [Withdraw]      │ │ • Requests: 1,234      ││
│ │                 │ │ • GPU: 75%             ││
│ └─────────────────┘ └─────────────────────────┘│
│                                                 │
│ Status: Ready                                   │
└─────────────────────────────────────────────────┘
```

## Implementation Steps

1. Create the React component with state management
2. Initialize FabstirSDK with proper configuration
3. Implement host switching logic
4. Add registration/unregistration functions
5. Implement host info display
6. Add live node metrics fetching
7. Implement earnings display and withdrawal
8. Add error handling and loading states
9. Style with consistent UI patterns from other harness pages

## Code Structure Example

```typescript
import React, { useState, useEffect } from 'react';
import { FabstirSDK } from '@fabstir/fabstir-llm-sdk';
import { ethers } from 'ethers';

const NodeRegistration: React.FC = () => {
  // State management
  const [selectedHost, setSelectedHost] = useState<'host1' | 'host2'>('host1');
  const [metadata, setMetadata] = useState('');
  const [hostInfo, setHostInfo] = useState<any>(null);
  const [nodeMetrics, setNodeMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  
  // Initialize SDK
  const initSDK = async (privateKey: string) => {
    const sdk = new FabstirSDK({
      rpcUrl: process.env.RPC_URL_BASE_SEPOLIA,
      contractAddresses: {
        jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE,
        nodeRegistry: process.env.CONTRACT_NODE_REGISTRY,
        fabToken: process.env.CONTRACT_FAB_TOKEN,
        hostEarnings: process.env.CONTRACT_HOST_EARNINGS,
        usdcToken: process.env.CONTRACT_USDC_TOKEN,
      }
    });
    
    await sdk.authenticate(privateKey);
    return sdk;
  };
  
  // Registration functions
  const registerHost = async () => {
    setLoading(true);
    try {
      const privateKey = selectedHost === 'host1' 
        ? process.env.TEST_HOST_1_PRIVATE_KEY 
        : process.env.TEST_USER_1_PRIVATE_KEY;
        
      const sdk = await initSDK(privateKey);
      const hostManager = sdk.getHostManager();
      
      await hostManager.registerHost({
        metadata: metadata || 'llama-2-7b,gpt-4,inference,base-sepolia',
        stakeAmount: process.env.DEFAULT_STAKE_AMOUNT
      });
      
      setStatus('✅ Host registered successfully');
      await refreshHostInfo();
    } catch (error: any) {
      setStatus(`❌ Registration failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  // ... additional functions
  
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* UI implementation */}
    </main>
  );
};

export default NodeRegistration;
```

## Error Handling

- Check FAB token balance before registration
- Verify host is not already registered
- Handle network errors gracefully
- Show clear error messages to user
- Implement retry logic for failed transactions

## Testing Considerations

1. Test with both TEST_HOST_1 and TEST_USER_1 accounts
2. Verify FAB token approval and staking
3. Test metadata updates
4. Verify earnings withdrawal
5. Test online/offline node detection
6. Check error handling for insufficient balances

This implementation will provide a comprehensive interface for node registration and management using the existing FabstirSDK and HostManager infrastructure.