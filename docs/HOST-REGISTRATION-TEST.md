# Host Registration and Staking Test

## Overview
This e2e test demonstrates the complete lifecycle of a host node in the Fabstir LLM marketplace:
1. Register as a host
2. Stake FAB tokens
3. Unstake FAB tokens  
4. Unregister as a host

## Test File
`tests/e2e/host-registration-staking.test.ts`

## Requirements

### Account Configuration
The test uses the following environment variables from `.env.test`:
- `TEST_HOST_2_ADDRESS`: The host address to register
- `TEST_HOST_2_PRIVATE_KEY`: Private key for signing transactions
- `CONTRACT_FAB_TOKEN`: FAB token contract address
- `CONTRACT_NODE_REGISTRY`: Node Registry contract address

### Funding Requirements
For the test to execute all operations successfully:

1. **ETH Balance**: ~0.1 ETH for gas fees
   - Registration: ~0.03 ETH
   - FAB Approval: ~0.01 ETH
   - Staking: ~0.03 ETH
   - Unstaking: ~0.02 ETH
   - Unregistration: ~0.02 ETH

2. **FAB Token Balance**: 1000+ FAB tokens for staking
   - The test attempts to stake 1000 FAB (DEFAULT_STAKE_AMOUNT)

### Current Test Account Status
- Address: `0x20f2A5FCDf271A5E6b04383C2915Ea980a50948c`
- FAB Balance: 1100 FAB ✅
- ETH Balance: ~0.03 ETH ❌ (needs ~0.1 ETH)

## Test Output

### When Fully Funded
The test displays:
1. **Initial Status**: Registration status, FAB balance, ETH balance
2. **Registration**: Transaction hash, block number, gas used, event details
3. **Staking**: Approval tx, stake tx, updated balances
4. **Unstaking**: Unstake tx, tokens returned to wallet
5. **Unregistration**: Unregister tx, final status

### When Underfunded
The test gracefully handles insufficient funds:
- Shows warning messages
- Continues in read-only mode
- Displays what operations would be performed

## Running the Test

```bash
# Run the test
npm test tests/e2e/host-registration-staking.test.ts

# Fund the test account first (if needed)
# Send ~0.1 ETH to TEST_HOST_2_ADDRESS on Base Sepolia
```

## Sample Output (Successful Run)

```
🔧 Setting up Host Registration Test

Host Address: 0x20f2A5FCDf271A5E6b04383C2915Ea980a50948c
FAB Token: 0xC78949004B4EB6dEf2D66e49Cd81231472612D62
Node Registry: 0x87516C13Ea2f99de598665e14cab64E191A0f8c4
Stake Amount: 1000 FAB

📊 Initial Status:
   Registration Status: ❌ Not Registered
   FAB Token Balance: 1100.0 FAB
   ETH Balance: 0.1 ETH

═══════════════════════════════════════════
STEP 1: REGISTER AS HOST
═══════════════════════════════════════════

Registering host with capabilities...
📝 Registration Transaction: 0x123...
✅ Registration Confirmed in Block: 30761648
   Gas Used: 125000
   Event: NodeRegistered
   Node Address: 0x20f2A5FCDf271A5E6b04383C2915Ea980a50948c
   Capabilities: llama-2-7b,llama-2-13b,inference

📊 After Registration:
   Registration Status: ✅ Registered
   Capabilities: llama-2-7b,llama-2-13b,inference
   Price Per Token: 1000000000000000
   Staked Amount: 0.0 FAB
   Active: Yes

[... continues with staking, unstaking, unregistration ...]
```

## Contract Interactions

### Node Registry Contract Methods
```solidity
// Registration
function registerNode(string capabilities, uint256 pricePerToken) external

// Staking
function stake(uint256 amount) external
function unstake(uint256 amount) external

// Unregistration
function unregisterNode() external

// Views
function isNodeRegistered(address nodeAddress) view returns (bool)
function getNode(address nodeAddress) view returns (NodeInfo)
```

### FAB Token Contract Methods
```solidity
// Approval for staking
function approve(address spender, uint256 amount) returns (bool)

// Views
function balanceOf(address account) view returns (uint256)
function allowance(address owner, address spender) view returns (uint256)
```

## Events Emitted

The test captures and displays these events:
- `NodeRegistered(address indexed nodeAddress, string capabilities, uint256 pricePerToken)`
- `Staked(address indexed nodeAddress, uint256 amount)`
- `Unstaked(address indexed nodeAddress, uint256 amount)`
- `NodeUnregistered(address indexed nodeAddress)`
- `Approval(address indexed owner, address indexed spender, uint256 value)`

## Error Handling

The test handles common errors:
- **Insufficient ETH**: Shows warning, continues in read-only mode
- **Insufficient FAB**: Shows warning, skips staking
- **Already Registered**: Notes and continues
- **Not Registered**: Skips operations requiring registration
- **Transaction Failures**: Logs errors with transaction details

## Next Steps

To run the full test successfully:
1. Fund `TEST_HOST_2_ADDRESS` with ~0.1 ETH on Base Sepolia
2. Ensure the account has 1000+ FAB tokens
3. Run the test: `npm test tests/e2e/host-registration-staking.test.ts`

The test will then execute all four stages of the host lifecycle, providing detailed transaction information and status updates at each step.