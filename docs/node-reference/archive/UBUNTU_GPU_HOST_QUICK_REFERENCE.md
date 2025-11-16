# Ubuntu GPU Host - Quick Reference

**Quick commands for managing your Fabstir LLM Node**

---

## Essential Paths

```bash
# Node directory
cd ~/fabstir/fabstir-llm-node

# Models directory
cd ~/fabstir/fabstir-llm-node/models

# Configuration files
nano ~/fabstir/fabstir-llm-node/.env
nano ~/fabstir/fabstir-llm-node/.env.contracts
```

---

## Container Management

```bash
# Start node
cd ~/fabstir/fabstir-llm-node
docker compose -f docker-compose.prod.yml up -d

# Stop node
docker compose -f docker-compose.prod.yml down

# Restart node
docker compose -f docker-compose.prod.yml restart

# View logs (live)
docker compose -f docker-compose.prod.yml logs -f

# View last 100 lines of logs
docker logs llm-node-prod-1 --tail 100

# Check container status
docker compose -f docker-compose.prod.yml ps

# Rebuild and restart
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Health & Monitoring

```bash
# Health check
curl -s http://localhost:8080/health | jq '.'

# Version check
curl -s http://localhost:8080/v1/version | jq -r '.build'

# Full version info
curl -s http://localhost:8080/v1/version | jq '.'

# GPU status
nvidia-smi

# GPU status (watch mode - updates every second)
watch -n 1 nvidia-smi

# Container resource usage
docker stats llm-node-prod-1 --no-stream

# Container resource usage (watch mode)
docker stats llm-node-prod-1
```

---

## Logs & Debugging

```bash
# Follow all logs
docker compose -f docker-compose.prod.yml logs -f

# Search for errors
docker logs llm-node-prod-1 2>&1 | grep -i error

# Check model loaded
docker logs llm-node-prod-1 2>&1 | grep -i "model loaded"

# Check embedding model
docker logs llm-node-prod-1 2>&1 | grep -i "embedding model"

# Check WebSocket server
docker logs llm-node-prod-1 2>&1 | grep -i "websocket"

# Check session activity
docker logs llm-node-prod-1 2>&1 | grep -E "(session_init|prompt|response)"

# View only today's logs
docker logs llm-node-prod-1 --since $(date +%Y-%m-%d) 2>&1 | less

# View last 15 minutes
docker logs llm-node-prod-1 --since 15m 2>&1 | less
```

---

## Testing

```bash
# Test health endpoint locally
curl http://localhost:8080/health

# Test health endpoint externally (from Windows PC)
curl http://YOUR_SERVER_IP:8080/health

# Test version endpoint
curl http://localhost:8080/v1/version | jq

# Test WebSocket endpoint (should return 426 Upgrade Required)
curl -i http://localhost:8080/ws

# Install wscat for WebSocket testing
sudo npm install -g wscat

# Test WebSocket connection
wscat -c ws://localhost:8080/ws
```

---

## Configuration Updates

```bash
# Edit main configuration
nano ~/fabstir/fabstir-llm-node/.env

# Edit contract addresses
nano ~/fabstir/fabstir-llm-node/.env.contracts

# After editing, restart to apply changes
cd ~/fabstir/fabstir-llm-node
docker compose -f docker-compose.prod.yml restart

# View active configuration (verify env vars loaded)
docker exec llm-node-prod-1 env | grep -E "(MODEL|PORT|CHAIN|HOST_PRIVATE_KEY)"
```

---

## Firewall Management

```bash
# Check firewall status
sudo ufw status

# Check firewall status with rule numbers
sudo ufw status numbered

# Allow port
sudo ufw allow PORT/tcp

# Delete rule by number
sudo ufw delete RULE_NUMBER

# Disable firewall (not recommended)
sudo ufw disable

# Enable firewall
sudo ufw enable
```

---

## Model Management

```bash
# List models
ls -lh ~/fabstir/fabstir-llm-node/models/

# Check model in container
docker exec llm-node-prod-1 ls -lh /app/models/

# Download new model
cd ~/fabstir/fabstir-llm-node/models
wget [MODEL_URL]

# Verify model checksum
sha256sum MODEL_FILE.gguf

# Switch model (update .env, then restart)
nano ~/fabstir/fabstir-llm-node/.env
# Change MODEL_PATH and MODEL_NAME
docker compose -f ~/fabstir/fabstir-llm-node/docker-compose.prod.yml restart
```

---

## Container Shell Access

```bash
# Open bash shell in container
docker exec -it llm-node-prod-1 bash

# Once inside container:
pwd                    # Show current directory
ls -la                 # List files
env | grep MODEL       # Check environment variables
nvidia-smi             # Check GPU
exit                   # Exit container shell
```

---

## Backup & Restore

```bash
# Backup configuration
mkdir -p ~/fabstir-backups
cp ~/fabstir/fabstir-llm-node/.env ~/fabstir-backups/.env.$(date +%Y%m%d)
cp ~/fabstir/fabstir-llm-node/.env.contracts ~/fabstir-backups/.env.contracts.$(date +%Y%m%d)
cp ~/fabstir/fabstir-llm-node/docker-compose.prod.yml ~/fabstir-backups/docker-compose.prod.yml.$(date +%Y%m%d)

# List backups
ls -lh ~/fabstir-backups/

# Restore configuration (example)
cp ~/fabstir-backups/.env.20250108 ~/fabstir/fabstir-llm-node/.env
```

---

## System Information

```bash
# Check Ubuntu version
lsb_release -a

# Check NVIDIA driver version
nvidia-smi --query-gpu=driver_version --format=csv,noheader

# Check CUDA version
nvcc --version

# Check Docker version
docker --version

# Check Docker Compose version
docker compose version

# Check disk space
df -h

# Check memory usage
free -h

# Check CPU usage
top -bn1 | head -20

# Check network interfaces
ip addr show

# Get public IP
curl -4 ifconfig.me

# Check open ports
sudo ss -tulpn | grep LISTEN
```

---

## Quick Diagnostics

```bash
# One-liner to check if everything is working
echo "=== Health ===" && \
curl -s http://localhost:8080/health | jq '.' && \
echo "=== Version ===" && \
curl -s http://localhost:8080/v1/version | jq -r '.build' && \
echo "=== Container ===" && \
docker ps | grep llm-node && \
echo "=== GPU ===" && \
nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv

# Check all critical services
echo "Container: $(docker ps | grep llm-node-prod-1 | wc -l)/1 running"
echo "Health: $(curl -s http://localhost:8080/health | jq -r '.status')"
echo "Version: $(curl -s http://localhost:8080/v1/version | jq -r '.version')"
echo "Firewall: $(sudo ufw status | grep -c active) active"
```

---

## Troubleshooting Quick Fixes

```bash
# Container won't start
docker compose -f ~/fabstir/fabstir-llm-node/docker-compose.prod.yml logs | tail -50

# Port already in use
sudo ss -tulpn | grep -E ':(8080|9000)'
# Kill conflicting process if safe to do so

# GPU not detected
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi

# Reset everything (CAUTION: destroys data)
cd ~/fabstir/fabstir-llm-node
docker compose -f docker-compose.prod.yml down -v
docker compose -f docker-compose.prod.yml up -d --build

# View Docker daemon logs
sudo journalctl -u docker -f

# Restart Docker daemon
sudo systemctl restart docker
```

---

## Performance Monitoring

```bash
# Real-time GPU monitoring
watch -n 1 "nvidia-smi && echo '---' && docker stats llm-node-prod-1 --no-stream"

# Log GPU metrics to file
while true; do
  nvidia-smi --query-gpu=timestamp,utilization.gpu,memory.used --format=csv >> ~/gpu-metrics.log
  sleep 60
done

# Monitor network traffic
sudo iftop -i eth0

# Monitor disk I/O
iostat -x 1
```

---

## Updates & Maintenance

```bash
# Pull latest code
cd ~/fabstir/fabstir-llm-node
git pull

# Rebuild container with latest code
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build

# Update Ubuntu packages
sudo apt update && sudo apt upgrade -y

# Update NVIDIA driver (CAUTION: test first)
sudo apt update && sudo apt install --only-upgrade nvidia-driver-580

# Clean up Docker resources
docker system prune -a
```

---

## Emergency Commands

```bash
# Force stop container
docker stop -t 0 llm-node-prod-1

# Force remove container
docker rm -f llm-node-prod-1

# View all Docker containers (including stopped)
docker ps -a

# Remove all stopped containers
docker container prune

# Remove unused Docker images
docker image prune -a

# Check systemd journal for critical errors
sudo journalctl -p err -n 100

# Reboot server (last resort)
sudo reboot
```

---

## Security Checks

```bash
# Check for exposed private keys (should return nothing!)
grep -r "0x[a-f0-9]\{64\}" ~/fabstir/fabstir-llm-node/ --exclude-dir=.git --exclude=*.md

# Verify .env is not tracked by git
cd ~/fabstir/fabstir-llm-node
git status .env
# Should say "not staged" or "untracked"

# Check file permissions
ls -la ~/fabstir/fabstir-llm-node/.env*
# Should NOT be world-readable (no rw-rw-r--)

# Audit open ports
sudo ss -tulpn | grep LISTEN

# Check recent login attempts
sudo lastlog
```

---

## Useful Aliases (Optional)

Add these to `~/.bashrc` for convenience:

```bash
# Edit .bashrc
nano ~/.bashrc

# Add these lines at the end:
alias fabstir-logs='docker logs llm-node-prod-1 -f'
alias fabstir-health='curl -s http://localhost:8080/health | jq'
alias fabstir-version='curl -s http://localhost:8080/v1/version | jq -r .build'
alias fabstir-restart='cd ~/fabstir/fabstir-llm-node && docker compose -f docker-compose.prod.yml restart'
alias fabstir-stop='cd ~/fabstir/fabstir-llm-node && docker compose -f docker-compose.prod.yml down'
alias fabstir-start='cd ~/fabstir/fabstir-llm-node && docker compose -f docker-compose.prod.yml up -d'
alias fabstir-status='docker ps | grep llm-node && curl -s http://localhost:8080/health | jq && nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv'

# Save and reload
source ~/.bashrc

# Now you can use:
fabstir-logs      # View logs
fabstir-health    # Check health
fabstir-version   # Check version
fabstir-restart   # Restart node
```

---

## Key Contract Addresses (Base Sepolia)

```
JobMarketplace:  0xc6D44D7f2DfA8fdbb1614a8b6675c78D3cfA376E
NodeRegistry:    0xDFFDecDfa0CF5D6cbE299711C7e4559eB16F42D6
HostEarnings:    0x908962e8c6CE72610021586f85ebDE09aAc97776
ModelRegistry:   0x92b2De840bB2171203011A6dBA928d855cA8183E
USDC Token:      0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

---

## Important URLs

```
Local Health:    http://localhost:8080/health
Local Version:   http://localhost:8080/v1/version
Local WebSocket: ws://localhost:8080/ws

External Health:    http://YOUR_SERVER_IP:8080/health
External Version:   http://YOUR_SERVER_IP:8080/v1/version
External WebSocket: ws://YOUR_SERVER_IP:8080/ws

Base Sepolia RPC:   https://base-sepolia.g.alchemy.com/v2/1pZoccdtgU8CMyxXzE3l_ghnBBaJABMR
Base Sepolia Explorer: https://sepolia.basescan.org/
```

---

## Support Resources

```
Main Setup Guide:     docs/node-reference/UBUNTU_GPU_HOST_SETUP.md
Deployment Docs:      docs/node-reference/DEPLOYMENT.md
Troubleshooting:      docs/node-reference/TROUBLESHOOTING.md
API Reference:        docs/node-reference/API.md
SDK Integration:      docs/node-reference/SDK_INTEGRATION_NOTES.md

GitHub Repository:    https://github.com/fabstir/fabstir-llm-node
GitHub Issues:        https://github.com/fabstir/fabstir-llm-node/issues
```

---

**Pro Tip**: Keep this file open in a second terminal window while following the main setup guide!

```bash
# Split terminal in tmux (if you use tmux)
tmux new -s fabstir
Ctrl+B then "     # Split horizontal
Ctrl+B then arrow keys  # Navigate between panes

# In one pane: Follow the setup guide
# In other pane: Run commands and monitor logs
```
