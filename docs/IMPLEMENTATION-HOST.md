# Implementation Plan: Host CLI Tool (@fabstir/host-cli)

## Overview

Create a professional CLI tool for Fabstir hosts to manage their nodes, wallets, and inference operations in a truly decentralized P2P network. The tool will enable hosts to run their own infrastructure without relying on centralized services or exposing private keys.

## Goal

Deliver a production-ready CLI tool that:
1. Manages host wallets securely (no private key exposure)
2. Handles registration, staking, and proof submission
3. Wraps the existing fabstir-llm-node (Rust) inference server
4. Monitors sessions and earnings
5. Provides professional tooling for host operators

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Host Machine                        │
│                                                  │
│  ┌─────────────────────────────────────────┐    │
│  │         @fabstir/host-cli               │    │
│  │                                          │    │
│  │  • CLI Commands (init, start, status)   │    │
│  │  • Wallet Management (encrypted)        │    │
│  │  • Configuration Management             │    │
│  │  • Process Management                   │    │
│  └────────────┬────────────────────────────┘    │
│               │                                  │
│               ▼                                  │
│  ┌─────────────────────────────────────────┐    │
│  │         @fabstir/sdk-core               │    │
│  │                                          │    │
│  │  • HostManager (registration, staking)  │    │
│  │  • PaymentManager (earnings, withdraw)  │    │
│  │  • Contract interactions                │    │
│  └────────────┬────────────────────────────┘    │
│               │                                  │
│               ▼                                  │
│  ┌─────────────────────────────────────────┐    │
│  │      fabstir-llm-node (Rust)            │    │
│  │                                          │    │
│  │  • LLM Inference Engine                 │    │
│  │  • WebSocket API                        │    │
│  │  • EZKL Proof Generation                │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
└─────────────────────────────────────────────────┘
```

## Development Approach: TDD Bounded Autonomy

1. Write ALL tests for a sub-phase FIRST
2. Show test failures before implementing
3. Implement minimally to pass tests
4. Strict line limits per file (enforced)
5. No modifications outside specified scope

---

## Phase 1: Foundation and Project Setup

### Sub-phase 1.1: Project Structure and Dependencies

**Goal**: Create the basic project structure and configure build tools

#### Tasks
- [x] Create packages/host-cli directory structure
- [x] Initialize package.json with proper dependencies
- [x] Configure TypeScript (tsconfig.json) for Node.js CLI
- [x] Setup build scripts (build, dev, test)
- [x] Configure ESLint and Prettier
- [x] Add commander, inquirer, chalk dependencies
- [x] Setup bin entry point for global installation
- [x] Create basic CLI entry file (src/index.ts)
- [x] Test global installation works with `npm link`

**Test Files:**
- `tests/setup/package.test.ts` (max 150 lines) - Package configuration tests
- `tests/setup/build.test.ts` (max 100 lines) - Build process tests
- `tests/setup/installation.test.ts` (max 100 lines) - Global install tests

**Implementation Files:**
- `package.json` (max 100 lines) - Package configuration
- `tsconfig.json` (max 50 lines) - TypeScript configuration
- `src/index.ts` (max 50 lines) - Entry point
- `.eslintrc.json` (max 50 lines) - Linting rules

**Success Criteria:**
- Package installs globally without errors
- TypeScript compiles successfully
- CLI runs with `fabstir-host --version`
- All dependencies resolve correctly

### Sub-phase 1.2: Basic CLI Framework

**Goal**: Implement the command structure and help system

#### Tasks
- [x] Write tests for CLI command parsing
- [x] Implement main command with version and description
- [x] Add init command placeholder
- [x] Add start command placeholder
- [x] Add status command placeholder
- [ ] Add withdraw command placeholder
- [x] Add stop command placeholder
- [x] Implement help text for all commands
- [x] Test command routing works correctly
- [x] Add error handling for unknown commands

**Test Files:**
- `tests/cli/commands.test.ts` (max 200 lines) - Command parsing tests
- `tests/cli/help.test.ts` (max 150 lines) - Help text tests
- `tests/cli/errors.test.ts` (max 150 lines) - Error handling tests

**Implementation Files:**
- `src/cli/commander.ts` (max 200 lines) - Command setup
- `src/cli/help.ts` (max 150 lines) - Help text formatting
- `src/cli/errors.ts` (max 100 lines) - Error handlers
- Update `src/index.ts` - Wire up commands

**Success Criteria:**
- All commands respond correctly
- Help text displays for each command
- Unknown commands show helpful error
- Version command shows correct version

---

## Phase 2: Wallet and Configuration Management

### Sub-phase 2.1: Secure Wallet Management

**Goal**: Implement secure wallet creation and storage

#### Tasks
- [ ] Write tests for wallet generation
- [ ] Write tests for wallet import
- [ ] Write tests for secure storage
- [ ] Implement wallet generation using ethers.js
- [ ] Implement private key import with validation
- [ ] Implement keytar integration for secure OS keychain storage
- [ ] Add encryption for wallet backup
- [ ] Implement wallet recovery from mnemonic
- [ ] Add password protection for wallet access
- [ ] Test wallet operations don't expose private keys
- [ ] Add wallet address display functionality

**Test Files:**
- `tests/wallet/generation.test.ts` (max 200 lines) - Wallet creation tests
- `tests/wallet/import.test.ts` (max 200 lines) - Import/recovery tests
- `tests/wallet/security.test.ts` (max 250 lines) - Security tests
- `tests/wallet/storage.test.ts` (max 200 lines) - Storage tests

**Implementation Files:**
- `src/wallet/manager.ts` (max 300 lines) - Wallet management
- `src/wallet/security.ts` (max 250 lines) - Encryption/decryption
- `src/wallet/storage.ts` (max 200 lines) - Keytar integration
- `src/wallet/validator.ts` (max 150 lines) - Validation logic

**Success Criteria:**
- Wallets generate with valid addresses
- Private keys never appear in logs
- Keytar stores encrypted keys securely
- Import accepts valid keys only
- Password protection works correctly

### Sub-phase 2.2: Configuration Wizard

**Goal**: Create interactive setup wizard for host configuration

#### Tasks
- [ ] Write tests for configuration flow
- [ ] Write tests for configuration validation
- [ ] Implement inquirer prompts for wallet setup
- [ ] Implement network selection (Base Mainnet/Sepolia)
- [ ] Implement RPC URL configuration
- [ ] Implement inference port configuration
- [ ] Implement public URL configuration
- [ ] Implement model selection interface
- [ ] Implement pricing configuration
- [ ] Save configuration to ~/.fabstir/config.json
- [ ] Validate configuration completeness
- [ ] Add configuration migration for updates

**Test Files:**
- `tests/config/wizard.test.ts` (max 300 lines) - Wizard flow tests
- `tests/config/validation.test.ts` (max 200 lines) - Validation tests
- `tests/config/persistence.test.ts` (max 200 lines) - Save/load tests

**Implementation Files:**
- `src/commands/init.ts` (max 400 lines) - Init command implementation
- `src/config/wizard.ts` (max 350 lines) - Interactive prompts
- `src/config/validator.ts` (max 200 lines) - Config validation
- `src/config/storage.ts` (max 200 lines) - Config persistence

**Success Criteria:**
- Wizard completes without errors
- Config saves to correct location
- Validation catches invalid inputs
- Migration handles version changes
- All required fields are collected

### Sub-phase 2.3: Configuration Management Commands

**Goal**: Implement commands to view and modify configuration

#### Tasks
- [ ] Write tests for config get command
- [ ] Write tests for config set command
- [ ] Implement `fabstir-host config get <key>`
- [ ] Implement `fabstir-host config set <key> <value>`
- [ ] Implement `fabstir-host config list`
- [ ] Implement `fabstir-host config reset`
- [ ] Add validation for configuration changes
- [ ] Implement config backup and restore
- [ ] Add environment variable override support

**Test Files:**
- `tests/config/commands.test.ts` (max 250 lines) - Config command tests
- `tests/config/backup.test.ts` (max 150 lines) - Backup/restore tests
- `tests/config/env.test.ts` (max 150 lines) - Environment override tests

**Implementation Files:**
- `src/commands/config.ts` (max 300 lines) - Config commands
- `src/config/manager.ts` (max 250 lines) - Config management
- `src/config/backup.ts` (max 150 lines) - Backup functionality
- `src/config/env.ts` (max 100 lines) - Environment handling

**Success Criteria:**
- Config get/set works correctly
- List shows all configuration
- Reset clears configuration
- Backup/restore preserves data
- Env vars override config values

---

## Phase 3: SDK Integration

### Sub-phase 3.1: SDK Initialization

**Goal**: Integrate with @fabstir/sdk-core for blockchain operations

#### Tasks
- [ ] Write tests for SDK initialization
- [ ] Write tests for authentication flow
- [ ] Import FabstirSDK from @fabstir/sdk-core
- [ ] Implement SDK initialization with config
- [ ] Implement wallet authentication
- [ ] Test manager access (HostManager, PaymentManager)
- [ ] Handle SDK initialization errors
- [ ] Add retry logic for network issues
- [ ] Implement connection status checking

**Test Files:**
- `tests/sdk/initialization.test.ts` (max 200 lines) - Init tests
- `tests/sdk/authentication.test.ts` (max 200 lines) - Auth tests
- `tests/sdk/managers.test.ts` (max 250 lines) - Manager access tests
- `tests/sdk/retry.test.ts` (max 200 lines) - Retry logic tests

**Implementation Files:**
- `src/sdk/client.ts` (max 300 lines) - SDK wrapper
- `src/sdk/auth.ts` (max 200 lines) - Authentication
- `src/sdk/retry.ts` (max 150 lines) - Retry logic
- `src/sdk/status.ts` (max 150 lines) - Connection status

**Success Criteria:**
- SDK initializes with config
- Authentication succeeds with wallet
- Managers are accessible
- Retry works on network failures
- Status reflects connection state

### Sub-phase 3.2: Balance and Requirements Checking

**Goal**: Verify host has required tokens and ETH

#### Tasks
- [ ] Write tests for balance checking
- [ ] Write tests for requirement validation
- [ ] Implement ETH balance checking
- [ ] Implement FAB token balance checking
- [ ] Implement staking status checking
- [ ] Display balance information clearly
- [ ] Check minimum requirements (0.015 ETH, 1000 FAB)
- [ ] Provide clear error messages for insufficient funds
- [ ] Add balance monitoring functionality

**Test Files:**
- `tests/balance/eth.test.ts` (max 150 lines) - ETH balance tests
- `tests/balance/fab.test.ts` (max 150 lines) - FAB balance tests
- `tests/balance/requirements.test.ts` (max 200 lines) - Requirements tests

**Implementation Files:**
- `src/balance/checker.ts` (max 250 lines) - Balance checking
- `src/balance/requirements.ts` (max 200 lines) - Requirement validation
- `src/balance/display.ts` (max 150 lines) - Balance formatting
- `src/balance/monitor.ts` (max 200 lines) - Balance monitoring

**Success Criteria:**
- Balances display correctly
- Requirements checked accurately
- Clear errors for insufficient funds
- Monitoring updates in real-time
- All token decimals handled properly

---

## Phase 4: Host Operations

### Sub-phase 4.1: Registration and Staking

**Goal**: Implement host registration and FAB token staking

#### Tasks
- [ ] Write tests for registration flow
- [ ] Write tests for staking operations
- [ ] Implement FAB token approval
- [ ] Implement host registration with metadata
- [ ] Implement API URL registration
- [ ] Implement staking transaction
- [ ] Handle registration errors
- [ ] Add transaction confirmation waiting
- [ ] Display registration success info
- [ ] Store registration state locally

**Test Files:**
- `tests/registration/flow.test.ts` (max 300 lines) - Registration flow tests
- `tests/registration/staking.test.ts` (max 250 lines) - Staking tests
- `tests/registration/errors.test.ts` (max 200 lines) - Error handling tests

**Implementation Files:**
- `src/commands/register.ts` (max 300 lines) - Register command
- `src/registration/manager.ts` (max 350 lines) - Registration logic
- `src/registration/staking.ts` (max 250 lines) - Staking operations
- `src/registration/state.ts` (max 150 lines) - State management

**Success Criteria:**
- Registration completes successfully
- FAB tokens stake correctly
- API URL registers on-chain
- Errors handled gracefully
- State persists locally

### Sub-phase 4.2: Status and Monitoring

**Goal**: Implement status checking and monitoring commands

#### Tasks
- [ ] Write tests for status command
- [ ] Write tests for earnings checking
- [ ] Implement registration status checking
- [ ] Implement staking amount display
- [ ] Implement earnings balance checking
- [ ] Implement session count tracking
- [ ] Display uptime information
- [ ] Show recent session history
- [ ] Calculate profitability metrics
- [ ] Add JSON output format option

**Test Files:**
- `tests/status/command.test.ts` (max 250 lines) - Status command tests
- `tests/status/earnings.test.ts` (max 200 lines) - Earnings tests
- `tests/status/metrics.test.ts` (max 200 lines) - Metrics tests

**Implementation Files:**
- `src/commands/status.ts` (max 300 lines) - Status command
- `src/monitoring/tracker.ts` (max 300 lines) - Monitoring logic
- `src/monitoring/metrics.ts` (max 250 lines) - Metrics calculation
- `src/monitoring/display.ts` (max 200 lines) - Display formatting

**Success Criteria:**
- Status shows all key information
- Earnings calculate correctly
- Metrics are accurate
- JSON output works
- History displays properly

### Sub-phase 4.3: Withdrawal Operations

**Goal**: Implement earnings withdrawal functionality

#### Tasks
- [ ] Write tests for withdrawal command
- [ ] Write tests for treasury withdrawal
- [ ] Implement host earnings checking
- [ ] Implement withdrawal transaction
- [ ] Display gas cost estimates
- [ ] Add withdrawal confirmation prompt
- [ ] Handle withdrawal errors
- [ ] Show transaction receipt
- [ ] Update local earning records
- [ ] Add withdrawal history tracking

**Test Files:**
- `tests/withdrawal/command.test.ts` (max 250 lines) - Withdrawal tests
- `tests/withdrawal/gas.test.ts` (max 150 lines) - Gas estimation tests
- `tests/withdrawal/history.test.ts` (max 150 lines) - History tests

**Implementation Files:**
- `src/commands/withdraw.ts` (max 300 lines) - Withdraw command
- `src/withdrawal/manager.ts` (max 300 lines) - Withdrawal logic
- `src/withdrawal/gas.ts` (max 150 lines) - Gas estimation
- `src/withdrawal/history.ts` (max 200 lines) - History tracking

**Success Criteria:**
- Withdrawals execute successfully
- Gas estimates are accurate
- Confirmation prompts work
- History tracks all withdrawals
- Errors handled gracefully

---

## Phase 5: Inference Server Integration

### Sub-phase 5.1: Process Management

**Goal**: Manage fabstir-llm-node Rust process lifecycle

#### Tasks
- [ ] Write tests for process spawning
- [ ] Write tests for process monitoring
- [ ] Check if fabstir-llm-node is installed
- [ ] Implement process spawning with child_process
- [ ] Pass configuration to Rust process
- [ ] Monitor process health
- [ ] Implement graceful shutdown
- [ ] Handle process crashes
- [ ] Add auto-restart capability
- [ ] Log process output to file

**Test Files:**
- `tests/process/spawn.test.ts` (max 250 lines) - Spawning tests
- `tests/process/monitor.test.ts` (max 200 lines) - Monitoring tests
- `tests/process/restart.test.ts` (max 200 lines) - Restart tests

**Implementation Files:**
- `src/process/manager.ts` (max 400 lines) - Process management
- `src/process/monitor.ts` (max 250 lines) - Health monitoring
- `src/process/restart.ts` (max 200 lines) - Auto-restart logic
- `src/process/logger.ts` (max 150 lines) - Process logging

**Success Criteria:**
- Process spawns correctly
- Configuration passes through
- Health checks work
- Auto-restart functions
- Logs capture output

### Sub-phase 5.2: WebSocket Integration

**Goal**: Connect to fabstir-llm-node WebSocket for session monitoring

#### Tasks
- [ ] Write tests for WebSocket connection
- [ ] Write tests for message handling
- [ ] Implement WebSocket client connection
- [ ] Handle session-request events
- [ ] Handle inference-complete events
- [ ] Track token generation
- [ ] Monitor session progress
- [ ] Handle connection drops
- [ ] Implement reconnection logic
- [ ] Queue messages during disconnection

**Test Files:**
- `tests/websocket/connection.test.ts` (max 250 lines) - Connection tests
- `tests/websocket/messages.test.ts` (max 300 lines) - Message tests
- `tests/websocket/reconnect.test.ts` (max 200 lines) - Reconnection tests

**Implementation Files:**
- `src/websocket/client.ts` (max 350 lines) - WebSocket client
- `src/websocket/handlers.ts` (max 300 lines) - Event handlers
- `src/websocket/queue.ts` (max 200 lines) - Message queue
- `src/websocket/reconnect.ts` (max 200 lines) - Reconnection logic

**Success Criteria:**
- WebSocket connects reliably
- Events handled correctly
- Token tracking accurate
- Reconnection works automatically
- No messages lost during disconnection

### Sub-phase 5.3: Proof Submission

**Goal**: Submit checkpoint proofs for completed work

#### Tasks
- [ ] Write tests for proof submission
- [ ] Write tests for checkpoint logic
- [ ] Track token accumulation per session
- [ ] Implement 100-token checkpoint threshold
- [ ] Get proof from fabstir-llm-node
- [ ] Submit proof using HostManager
- [ ] Handle proof rejection
- [ ] Retry failed submissions
- [ ] Track successful proofs
- [ ] Update earning calculations

**Test Files:**
- `tests/proof/submission.test.ts` (max 300 lines) - Submission tests
- `tests/proof/checkpoint.test.ts` (max 250 lines) - Checkpoint tests
- `tests/proof/retry.test.ts` (max 200 lines) - Retry tests

**Implementation Files:**
- `src/proof/submitter.ts` (max 350 lines) - Proof submission
- `src/proof/checkpoint.ts` (max 250 lines) - Checkpoint logic
- `src/proof/tracker.ts` (max 200 lines) - Proof tracking
- `src/proof/retry.ts` (max 200 lines) - Retry mechanism

**Success Criteria:**
- Proofs submit at correct intervals
- Checkpoint threshold works (100 tokens)
- Rejected proofs retry successfully
- Earnings update after proof
- All proofs tracked locally

---

## Phase 6: Production Features

### Sub-phase 6.1: Logging and Monitoring

**Goal**: Implement comprehensive logging system

#### Tasks
- [ ] Write tests for logging system
- [ ] Configure Winston logger
- [ ] Implement log rotation
- [ ] Add log levels (error, warn, info, debug)
- [ ] Create separate logs for different components
- [ ] Implement `fabstir-host logs` command
- [ ] Add log filtering options
- [ ] Implement log export functionality
- [ ] Add performance metrics logging
- [ ] Create daily summary reports

**Test Files:**
- `tests/logging/winston.test.ts` (max 200 lines) - Logger tests
- `tests/logging/rotation.test.ts` (max 150 lines) - Rotation tests
- `tests/logging/command.test.ts` (max 200 lines) - Log command tests

**Implementation Files:**
- `src/logging/logger.ts` (max 250 lines) - Winston setup
- `src/logging/rotation.ts` (max 150 lines) - Log rotation
- `src/commands/logs.ts` (max 250 lines) - Logs command
- `src/logging/metrics.ts` (max 200 lines) - Metrics logging

**Success Criteria:**
- Logs capture all events
- Rotation prevents disk fill
- Filtering works correctly
- Metrics track performance
- Daily summaries generate

### Sub-phase 6.2: Daemon Mode and Service Management

**Goal**: Enable running as background service

#### Tasks
- [ ] Write tests for daemon mode
- [ ] Implement --daemon flag for start command
- [ ] Create PID file management
- [ ] Implement `fabstir-host stop` command
- [ ] Add systemd service file generation
- [ ] Implement health checks
- [ ] Add automatic restart on failure
- [ ] Create uptime tracking
- [ ] Implement graceful reload
- [ ] Add service status reporting

**Test Files:**
- `tests/daemon/mode.test.ts` (max 250 lines) - Daemon mode tests
- `tests/daemon/pid.test.ts` (max 150 lines) - PID management tests
- `tests/daemon/service.test.ts` (max 200 lines) - Service tests

**Implementation Files:**
- `src/daemon/manager.ts` (max 350 lines) - Daemon management
- `src/daemon/pid.ts` (max 150 lines) - PID file handling
- `src/daemon/service.ts` (max 250 lines) - Service generation
- `src/commands/stop.ts` (max 200 lines) - Stop command

**Success Criteria:**
- Daemon mode runs in background
- PID file tracks process
- Stop command works reliably
- Service files generate correctly
- Health checks function

### Sub-phase 6.3: Error Recovery and Resilience

**Goal**: Implement comprehensive error handling and recovery

#### Tasks
- [ ] Write tests for error scenarios
- [ ] Implement network error recovery
- [ ] Add transaction retry logic
- [ ] Handle RPC endpoint failures
- [ ] Implement fallback RPC URLs
- [ ] Add circuit breaker pattern
- [ ] Store failed transactions for retry
- [ ] Implement emergency shutdown
- [ ] Add error reporting system
- [ ] Create recovery procedures documentation

**Test Files:**
- `tests/resilience/network.test.ts` (max 250 lines) - Network error tests
- `tests/resilience/transaction.test.ts` (max 250 lines) - Transaction tests
- `tests/resilience/circuit.test.ts` (max 200 lines) - Circuit breaker tests

**Implementation Files:**
- `src/resilience/recovery.ts` (max 350 lines) - Error recovery
- `src/resilience/retry.ts` (max 250 lines) - Retry strategies
- `src/resilience/circuit.ts` (max 200 lines) - Circuit breaker
- `src/resilience/fallback.ts` (max 200 lines) - Fallback logic

**Success Criteria:**
- Network errors recover automatically
- Transactions retry with backoff
- Circuit breaker prevents cascading failures
- Failed transactions persist and retry
- Emergency shutdown works cleanly

---

## Phase 7: Testing and Documentation

### Sub-phase 7.1: Integration Testing

**Goal**: Comprehensive integration tests for all features

#### Tasks
- [ ] Write end-to-end registration test
- [ ] Write session handling test
- [ ] Write proof submission test
- [ ] Write withdrawal test
- [ ] Test daemon mode operation
- [ ] Test error recovery
- [ ] Test configuration updates
- [ ] Test wallet operations
- [ ] Create test fixtures
- [ ] Add CI/CD pipeline tests

**Test Files:**
- `tests/integration/registration.test.ts` (max 400 lines) - Registration e2e
- `tests/integration/session.test.ts` (max 400 lines) - Session e2e
- `tests/integration/proof.test.ts` (max 350 lines) - Proof e2e
- `tests/integration/withdrawal.test.ts` (max 300 lines) - Withdrawal e2e

**Implementation Files:**
- `tests/fixtures/wallet.ts` (max 150 lines) - Test wallets
- `tests/fixtures/config.ts` (max 150 lines) - Test configs
- `tests/helpers/blockchain.ts` (max 200 lines) - Blockchain helpers
- `.github/workflows/test.yml` (max 100 lines) - CI pipeline

**Success Criteria:**
- All features tested end-to-end
- Tests run in CI/CD pipeline
- Coverage exceeds 80%
- Tests complete in < 5 minutes
- Fixtures simplify test setup

### Sub-phase 7.2: Documentation

**Goal**: Create comprehensive documentation for host operators

#### Tasks
- [ ] Write README.md with quick start
- [ ] Create installation guide
- [ ] Write configuration reference
- [ ] Document all commands
- [ ] Create troubleshooting guide
- [ ] Write security best practices
- [ ] Create FAQ section
- [ ] Add example configurations
- [ ] Write upgrade guide
- [ ] Create video tutorials outline

**Test Files:**
- `tests/docs/examples.test.ts` (max 200 lines) - Example validation
- `tests/docs/commands.test.ts` (max 150 lines) - Command docs tests

**Implementation Files:**
- `README.md` (max 500 lines) - Main documentation
- `docs/INSTALLATION.md` (max 300 lines) - Installation guide
- `docs/CONFIGURATION.md` (max 400 lines) - Config reference
- `docs/COMMANDS.md` (max 500 lines) - Command reference
- `docs/TROUBLESHOOTING.md` (max 300 lines) - Troubleshooting
- `docs/SECURITY.md` (max 250 lines) - Security guide

**Success Criteria:**
- Documentation is complete
- Examples work correctly
- All commands documented
- Troubleshooting covers common issues
- Security practices clear

### Sub-phase 7.3: Distribution and Release

**Goal**: Prepare for npm publication and distribution

#### Tasks
- [ ] Configure npm publication settings
- [ ] Create GitHub release workflow
- [ ] Setup automatic versioning
- [ ] Create changelog generation
- [ ] Test npm global installation
- [ ] Create Docker image
- [ ] Write distribution documentation
- [ ] Setup update notifications
- [ ] Create release notes template
- [ ] Test cross-platform compatibility

**Test Files:**
- `tests/distribution/npm.test.ts` (max 150 lines) - NPM tests
- `tests/distribution/docker.test.ts` (max 150 lines) - Docker tests
- `tests/distribution/platform.test.ts` (max 200 lines) - Platform tests

**Implementation Files:**
- `.npmignore` (max 50 lines) - NPM ignore file
- `Dockerfile` (max 100 lines) - Docker configuration
- `.github/workflows/release.yml` (max 150 lines) - Release workflow
- `scripts/release.ts` (max 200 lines) - Release script
- `CHANGELOG.md` (max 500 lines) - Change log

**Success Criteria:**
- NPM package publishes successfully
- Docker image builds and runs
- Release workflow automates process
- Works on Linux, macOS, Windows
- Update notifications work

---

## Global Success Metrics

1. **Security**: Private keys never exposed, secure storage implemented
2. **Reliability**: 99.9% uptime with auto-recovery
3. **Usability**: < 5 minutes from install to running host
4. **Performance**: < 100ms overhead for proof submission
5. **Compatibility**: Works on Linux, macOS, Windows (WSL)
6. **Code Quality**: 80%+ test coverage, all tests pass
7. **Documentation**: Complete and accurate for all features

## Risk Mitigation

1. **Private Key Security**: Use OS keychain, never log keys
2. **Process Crashes**: Auto-restart with exponential backoff
3. **Network Issues**: Multiple RPC endpoints, retry logic
4. **User Errors**: Validation, confirmation prompts, backups
5. **Upgrade Path**: Configuration migration, backward compatibility

## Timeline Estimate

- Phase 1: 4 hours (Foundation)
- Phase 2: 8 hours (Wallet & Config)
- Phase 3: 4 hours (SDK Integration)
- Phase 4: 7 hours (Host Operations)
- Phase 5: 9 hours (Server Integration)
- Phase 6: 8 hours (Production Features)
- Phase 7: 7 hours (Testing & Docs)

**Total: ~47 hours** (6-7 days of focused development)

## Implementation Notes

- Reuse existing SDK code wherever possible
- Security is paramount - never expose private keys
- Focus on professional UX for host operators
- Build for extensibility but deliver MVP first
- Test on Base Sepolia before mainnet deployment
- Follow TDD approach - tests first, then implementation
- Respect line limits to maintain code quality
- Each sub-phase should be completable independently