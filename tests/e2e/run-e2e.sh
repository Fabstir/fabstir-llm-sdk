#!/bin/bash
echo "Starting E2E Test Environment..."

# Start services
node test-services/discovery-server.js &
DISCOVERY_PID=$!
node test-services/ws-servers.js &
WS_PID=$!

sleep 3

echo "Running E2E tests..."
npx vitest run tests/e2e/full-session-flow.test.ts --reporter=verbose

# Cleanup
kill $DISCOVERY_PID $WS_PID
echo "E2E test complete"
