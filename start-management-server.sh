#!/bin/bash
# Start Management Server for Fabstir Host
# Launches HTTP + WebSocket server for browser-based node control

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 Checking prerequisites..."

# Check if container is running
if ! docker ps | grep -q fabstir-host-test; then
  echo -e "${RED}❌ Error: Container 'fabstir-host-test' is not running${NC}"
  echo ""
  echo "Start the container first:"
  echo "  ./start-fabstir-docker.sh"
  exit 1
fi

echo -e "${GREEN}✅ Container is running${NC}"

# Start management server
echo ""
echo "🚀 Starting management server on port 3001..."
docker exec -d fabstir-host-test sh -c 'cd /app && node --require /app/polyfills.js dist/index.js serve --port 3001'

# Wait for server to initialize
echo "⏳ Waiting for server to start..."
sleep 3

# Verify server is running
echo "🔍 Verifying health endpoint..."
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
  echo ""
  echo -e "${GREEN}✅ Management server started successfully${NC}"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "${YELLOW}📍 Management API:${NC} http://localhost:3001"
  echo -e "${YELLOW}🌐 Browser UI:${NC}     http://localhost:3000/node-management-enhanced"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "To stop the server:"
  echo "  docker exec fabstir-host-test pkill -f 'dist/index.js serve'"
  echo ""
else
  echo ""
  echo -e "${RED}❌ Failed to start management server${NC}"
  echo ""
  echo "Troubleshooting steps:"
  echo "  1. Check if port 3001 is already in use:"
  echo "     lsof -i :3001"
  echo ""
  echo "  2. Check container logs:"
  echo "     docker logs fabstir-host-test"
  echo ""
  echo "  3. Check server process:"
  echo "     docker exec fabstir-host-test ps aux | grep serve"
  echo ""
  echo "  4. Try starting manually:"
  echo "     docker exec -it fabstir-host-test sh -c 'cd /app && node --require /app/polyfills.js dist/index.js serve --port 3001'"
  echo ""
  exit 1
fi
