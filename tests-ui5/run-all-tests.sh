#!/bin/bash
#
# Run all UI5 automated tests
#
# Tests use real blockchain (Base Sepolia), real S5 storage, and real WebSocket connections.
# Tests may take 15-30 minutes to complete due to blockchain transaction confirmations.
#
# Prerequisites:
# 1. UI5 must be running: cd /workspace/apps/ui5 && pnpm dev --port 3002
# 2. MetaMask or Base Account Kit wallet must be configured
# 3. .env.local must have valid contract addresses
# 4. Test account must have testnet ETH for gas fees
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
FAILED_FILES=()

# Create screenshots directory
mkdir -p /workspace/test-screenshots

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}UI5 Automated Test Suite${NC}"
echo -e "${BLUE}Production SDK with Real Blockchain${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if UI5 is running
echo -e "${YELLOW}Checking if UI5 is running on port 3002...${NC}"
if ! curl -s http://localhost:3002 > /dev/null 2>&1; then
  echo -e "${RED}❌ UI5 is not running on port 3002${NC}"
  echo -e "${YELLOW}Please start UI5 first:${NC}"
  echo -e "  cd /workspace/apps/ui5 && pnpm dev --port 3002"
  exit 1
fi
echo -e "${GREEN}✅ UI5 is running${NC}"
echo ""

# Test files in execution order
TEST_FILES=(
  "test-vector-db-phase2.cjs"
  "test-vector-db-phase2-2.cjs"
  "test-vector-db-phase2-4.cjs"
  "test-link-database-phase3-4.cjs"
  "test-remove-document-phase3-5.cjs"
  "test-chat-operations.cjs"
  "test-navigation-phase5.cjs"
  "test-error-handling-phase6.cjs"
)

# Run each test file
for test_file in "${TEST_FILES[@]}"; do
  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}Running: $test_file${NC}"
  echo -e "${BLUE}========================================${NC}"

  if node "$test_file"; then
    PASSED_TESTS=$((PASSED_TESTS + 1))
    echo -e "${GREEN}✅ PASSED: $test_file${NC}"
  else
    FAILED_TESTS=$((FAILED_TESTS + 1))
    FAILED_FILES+=("$test_file")
    echo -e "${RED}❌ FAILED: $test_file${NC}"
  fi

  echo ""

  # Wait between tests to let blockchain settle
  if [ $TOTAL_TESTS -lt ${#TEST_FILES[@]} ]; then
    echo -e "${YELLOW}Waiting 5 seconds before next test...${NC}"
    sleep 5
  fi
done

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Total tests: ${TOTAL_TESTS}"
echo -e "${GREEN}Passed: ${PASSED_TESTS}${NC}"

if [ $FAILED_TESTS -gt 0 ]; then
  echo -e "${RED}Failed: ${FAILED_TESTS}${NC}"
  echo ""
  echo -e "${RED}Failed test files:${NC}"
  for failed_file in "${FAILED_FILES[@]}"; do
    echo -e "  ${RED}- $failed_file${NC}"
  done
  echo ""
  echo -e "${YELLOW}Check screenshots in /workspace/test-screenshots/${NC}"
  exit 1
else
  echo -e "${GREEN}Failed: 0${NC}"
  echo ""
  echo -e "${GREEN}🎉 All tests passed!${NC}"
  echo -e "${YELLOW}Screenshots saved to /workspace/test-screenshots/${NC}"
  exit 0
fi
