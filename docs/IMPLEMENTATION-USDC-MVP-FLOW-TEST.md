
  Complete Plan for USDC MVP Flow Test

  Core Requirements:

  - [ ] Use USDC for payments, ETH only for gas
  - [ ] NO MOCKS - [ ] everything must be production-ready
  - [ ] Real fabstir-llm-node integration for EZKL proofs
  - [ ] Complete payment flow with withdrawals
  - [ ] Test passes only when ALL parties receive their funds

  Phase 1: Rename and Clean Up Test

  1. Rename test file
    - [x] tests/e2e/base-account-mvp-flow.test.ts → tests/e2e/usdc-mvp-flow.test.ts
    - [x] Update test description from "Base Account Kit MVP Flow" to "USDC MVP Flow"
    - [x] Remove all SmartWalletManager references (not needed for EOA approach)
    - [x] Remove any mock EZKL proof generation code

  Phase 2: Fix Session Completion

  2. Debug why completeSessionJob is failing
    - [ ] Add logging to check job state before completion
    - [ ] Verify job ID matches the created session
    - [ ] Check if sufficient proofs have been submitted
    - [ ] Ensure caller (user) has permission to complete
  3. Fix the completion transaction
    - [ ] May need to wait longer after proof submission
    - [ ] Check if job requires minimum proven tokens
    - [ ] Verify contract state requirements for completion

  Phase 3: Implement Real LLM Node Integration

  4. Connect to fabstir-llm-node for real EZKL proofs
    - [ ] Fix WebSocket connection to TEST_HOST_1_URL
    - [ ] Implement proper session initialization handshake
    - [ ] Handle real EZKL proof events from the node
    - [ ] Remove simulated proof submission code
  5. Implement real inference flow
    - [ ] Send actual prompts to LLM node
    - [ ] Receive and display LLM responses
    - [ ] Track token usage from real responses
    - [ ] Let node submit proofs at checkpoint intervals

  Phase 4: Payment Distribution & Verification

  6. Fix payment distribution after session completion
    - [ ] Ensure completeSessionJob triggers payments
    - [ ] Or implement claimWithProof if needed
    - [ ] Track payment events from contract
  7. Implement withdrawal functionality
    - [ ] Add host withdrawal from accumulated earnings
    - [ ] Add treasury withdrawal from accumulated fees
    - [ ] Both should call contract withdrawal functions
  8. Add comprehensive balance verification
    - [ ] Before: Record all initial balances
    - [ ] After completion: Verify escrow released
    - [ ] After withdrawal: Verify final balances
    - [ ] Host should receive 90% (1.8 USDC from 2.0 deposit)
    - [ ] Treasury should receive 10% (0.2 USDC)
    - [ ] User should receive unused USDC

  Phase 5: Test Success Criteria

  9. Test passes ONLY when:
    - [ ] Session created with USDC deposit
    - [ ] Real LLM responds to prompts
    - [ ] Real EZKL proofs submitted by node
    - [ ] Session completes successfully
    - [ ] Payments distributed to accumulation accounts
    - [ ] Host withdraws and receives 90% payment
    - [ ] Treasury withdraws and receives 10% fee
    - [ ] User receives refund of unused USDC
    - [ ] All balances match expected values

  Implementation Order:

  1. Start with fixing session completion (current blocker)
  2. Then add withdrawal functionality (missing piece)
  3. Then integrate real LLM node (for production readiness)
  4. Finally add comprehensive verification (for test reliability)

  Key Changes from Current State:

  - [ ] Remove all mock code and SmartWallet references
  - [ ] Add real WebSocket connection to fabstir-llm-node
  - [ ] Implement withdrawal functions for host/treasury
  - [ ] Add proper wait times for blockchain confirmations
  - [ ] Add detailed balance tracking and verification

  Expected Test Flow:

  1. Setup: Fund EOA with USDC and ETH
  2. Create session with 2 USDC deposit
  3. Connect to real LLM node via WebSocket
  4. Send prompts and receive real responses
  5. Node submits EZKL proofs at checkpoints
  6. Complete session when done
  7. Verify payments in accumulation accounts
  8. Host withdraws accumulated earnings
  9. Treasury withdraws accumulated fees
  10. Verify all final balances correct

  This plan ensures a production-ready test that validates the entire USDC payment flow without any mocks or shortcuts.