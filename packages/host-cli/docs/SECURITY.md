# Security Best Practices

## Table of Contents
- [Key Management](#key-management)
- [Network Security](#network-security)
- [Operational Security](#operational-security)
- [Smart Contract Security](#smart-contract-security)
- [System Security](#system-security)
- [Monitoring and Alerts](#monitoring-and-alerts)
- [Incident Response](#incident-response)
- [Security Checklist](#security-checklist)

## Key Management

### Private Key Security

#### DO ✅
- **Use hardware wallets** for production mainnet deployments
- **Use OS keychain** (keytar) for key storage
- **Encrypt private keys** at rest
- **Use environment variables** for CI/CD
- **Rotate keys** periodically
- **Keep backups** in secure, offline storage

#### DON'T ❌
- Store private keys in plain text files
- Commit private keys to version control
- Share private keys via email/chat
- Use the same key for testing and production
- Log or display private keys

### Secure Key Storage Options

1. **OS Keychain (Recommended)**
```bash
# Configure keytar storage
fabstir-host config set wallet.keystore keytar

# Verify keychain is used
fabstir-host config get wallet.keystore
```

2. **Hardware Wallet**
```bash
# Use hardware wallet (Ledger/Trezor)
fabstir-host init --hardware-wallet

# Sign transactions externally
fabstir-host config set wallet.signExternal true
```

3. **Environment Variables (CI/CD)**
```bash
# Use environment variable
export FABSTIR_PRIVATE_KEY=0x...

# Never log the key
echo "Key loaded: ${FABSTIR_PRIVATE_KEY:0:10}..."
```

4. **Encrypted File Storage**
```bash
# Encrypt wallet backup
openssl enc -aes-256-cbc -salt -in wallet.json -out wallet.enc

# Decrypt when needed
openssl enc -aes-256-cbc -d -in wallet.enc -out wallet.json
```

### Multi-Signature Setup

For high-value operations, use multi-sig:

```bash
# Configure multi-sig
fabstir-host config set wallet.multisig.enabled true
fabstir-host config set wallet.multisig.threshold 2
fabstir-host config set wallet.multisig.signers '["0x...", "0x..."]'
```

---

## Network Security

### Firewall Configuration

#### Linux (UFW)
```bash
# Allow only necessary ports
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 8083/tcp  # Host WebSocket
sudo ufw enable

# Limit connection rate
sudo ufw limit 8083/tcp
```

#### iptables Rules
```bash
# Rate limiting
iptables -A INPUT -p tcp --dport 8083 -m state --state NEW -m recent --set
iptables -A INPUT -p tcp --dport 8083 -m state --state NEW -m recent --update --seconds 60 --hitcount 10 -j DROP

# DDoS protection
iptables -A INPUT -p tcp --dport 8083 -m connlimit --connlimit-above 50 -j REJECT
```

### SSL/TLS Configuration

1. **Enable HTTPS/WSS**
```bash
# Generate SSL certificate
certbot certonly --standalone -d your-domain.com

# Configure SSL
fabstir-host config set host.ssl.enabled true
fabstir-host config set host.ssl.cert /etc/letsencrypt/live/your-domain.com/fullchain.pem
fabstir-host config set host.ssl.key /etc/letsencrypt/live/your-domain.com/privkey.pem
```

2. **SSL Best Practices**
```bash
# Use strong ciphers only
fabstir-host config set host.ssl.ciphers "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256"

# Enable HSTS
fabstir-host config set host.ssl.hsts true

# Disable SSL v3 and TLS 1.0/1.1
fabstir-host config set host.ssl.minVersion "TLSv1.2"
```

### RPC Security

1. **Use private RPC endpoints**
```bash
# Don't use public RPCs for production
fabstir-host config set network.rpcUrl "https://your-private-rpc.com"

# Use authentication if available
fabstir-host config set network.rpcAuth "Bearer YOUR_TOKEN"
```

2. **RPC Request Validation**
```bash
# Enable request validation
fabstir-host config set network.validateResponses true

# Set timeout to prevent hanging
fabstir-host config set network.rpcTimeout 10000
```

---

## Operational Security

### Access Control

1. **User Permissions**
```bash
# Run as non-root user
useradd -m -s /bin/bash fabstir
su - fabstir

# Set proper file permissions
chmod 700 ~/.fabstir
chmod 600 ~/.fabstir/config.json
chmod 600 ~/.fabstir/wallet.json
```

2. **API Authentication**
```bash
# Enable API authentication
fabstir-host config set api.auth.enabled true
fabstir-host config set api.auth.type jwt

# Generate API key
fabstir-host api generate-key
```

### Logging and Auditing

1. **Secure Logging**
```bash
# Configure secure logging
fabstir-host config set logging.level info
fabstir-host config set logging.sanitize true  # Remove sensitive data

# Rotate logs
fabstir-host config set logging.maxSize 10M
fabstir-host config set logging.maxFiles 10

# Send logs to secure storage
fabstir-host config set logging.remote "syslog://secure-log-server.com"
```

2. **Audit Trail**
```bash
# Enable audit logging
fabstir-host config set audit.enabled true
fabstir-host config set audit.events '["register", "withdraw", "config_change"]'

# Review audit logs
fabstir-host audit review --since "7 days ago"
```

### Session Security

1. **Session Limits**
```bash
# Set session limits
fabstir-host config set host.maxConcurrent 10
fabstir-host config set host.sessionTimeout 3600000  # 1 hour

# Enable session validation
fabstir-host config set host.validateSessions true
```

2. **Rate Limiting**
```bash
# Configure rate limits
fabstir-host config set rateLimit.enabled true
fabstir-host config set rateLimit.maxRequests 100
fabstir-host config set rateLimit.window 60000  # per minute
```

---

## Smart Contract Security

### Transaction Validation

1. **Gas Price Limits**
```bash
# Set maximum gas price
fabstir-host config set network.maxGasPrice 100  # Gwei

# Enable gas estimation validation
fabstir-host config set network.validateGasEstimate true
```

2. **Transaction Monitoring**
```bash
# Monitor pending transactions
fabstir-host monitor transactions --alert-on-fail

# Set transaction timeout
fabstir-host config set network.txTimeout 300000  # 5 minutes
```

### Contract Interaction

1. **Verify Contract Addresses**
```bash
# Always verify contract addresses
fabstir-host network verify-contracts

# Enable contract validation
fabstir-host config set contracts.validateAddresses true
```

2. **Slippage Protection**
```bash
# Set slippage tolerance
fabstir-host config set trading.maxSlippage 0.01  # 1%

# Enable MEV protection
fabstir-host config set network.mevProtection true
```

---

## System Security

### Server Hardening

1. **OS Updates**
```bash
# Keep system updated
sudo apt update && sudo apt upgrade -y

# Enable automatic security updates
sudo apt install unattended-upgrades
sudo dpkg-reconfigure unattended-upgrades
```

2. **Process Isolation**
```bash
# Use systemd isolation
cat > /etc/systemd/system/fabstir-host.service << EOF
[Service]
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
NoNewPrivileges=yes
ReadWritePaths=/home/fabstir/.fabstir
EOF
```

### Docker Security

1. **Secure Container**
```dockerfile
# Use non-root user
FROM node:18-alpine
RUN addgroup -g 1001 -S fabstir && \
    adduser -u 1001 -S fabstir -G fabstir
USER fabstir

# Read-only filesystem
VOLUME ["/data"]
ENV FABSTIR_CONFIG_PATH=/data/config.json
```

2. **Container Limits**
```bash
# Run with resource limits
docker run \
  --memory="2g" \
  --cpus="2" \
  --read-only \
  --security-opt=no-new-privileges \
  fabstir/host-cli
```

### Dependency Security

1. **Regular Updates**
```bash
# Check for vulnerabilities
npm audit

# Update dependencies
npm update

# Fix vulnerabilities
npm audit fix
```

2. **Lock File Verification**
```bash
# Verify package integrity
npm ci

# Check package signatures
npm install --verify-signatures
```

---

## Monitoring and Alerts

### Health Monitoring

1. **Setup Monitoring**
```bash
# Enable health checks
fabstir-host monitor enable

# Configure alerts
fabstir-host monitor config --email security@example.com
fabstir-host monitor config --webhook https://alerts.example.com

# Set thresholds
fabstir-host monitor set --failed-sessions 5 --alert
fabstir-host monitor set --error-rate 0.1 --alert
```

2. **Security Events**
```bash
# Monitor security events
fabstir-host monitor events \
  --watch "failed_auth" \
  --watch "config_change" \
  --watch "large_withdrawal" \
  --alert
```

### Metrics Collection

```bash
# Enable metrics
fabstir-host config set metrics.enabled true
fabstir-host config set metrics.endpoint "https://metrics.example.com"

# Security metrics
fabstir-host metrics security --export
```

---

## Incident Response

### Preparation

1. **Emergency Contacts**
```bash
# Configure emergency contacts
fabstir-host config set security.contacts.email "security@example.com"
fabstir-host config set security.contacts.phone "+1234567890"
```

2. **Backup Strategy**
```bash
# Automated backups
0 */6 * * * fabstir-host backup --encrypt

# Off-site backup
fabstir-host backup --remote s3://secure-backup-bucket
```

### Detection

1. **Anomaly Detection**
```bash
# Enable anomaly detection
fabstir-host security anomaly-detection enable

# Set baseline
fabstir-host security baseline create

# Alert on deviations
fabstir-host security alert --deviation 50
```

### Response

1. **Emergency Shutdown**
```bash
# Immediate shutdown
fabstir-host emergency stop

# Disable withdrawals
fabstir-host security freeze withdrawals

# Revoke sessions
fabstir-host session revoke --all
```

2. **Key Rotation**
```bash
# Generate new wallet
fabstir-host wallet rotate

# Update registration
fabstir-host register --update-key

# Notify users
fabstir-host notify "Key rotation in progress"
```

### Recovery

1. **Post-Incident**
```bash
# Generate incident report
fabstir-host security report --incident

# Review logs
fabstir-host logs analyze --security

# Update security measures
fabstir-host security harden
```

---

## Security Checklist

### Daily Tasks
- [ ] Review error logs for anomalies
- [ ] Check active session count
- [ ] Verify wallet balance
- [ ] Monitor gas prices
- [ ] Check system resources

### Weekly Tasks
- [ ] Review security logs
- [ ] Check for software updates
- [ ] Verify backup integrity
- [ ] Test emergency procedures
- [ ] Review access logs

### Monthly Tasks
- [ ] Rotate API keys
- [ ] Update dependencies
- [ ] Security audit
- [ ] Test incident response
- [ ] Review firewall rules

### Quarterly Tasks
- [ ] Full security assessment
- [ ] Penetration testing
- [ ] Key rotation consideration
- [ ] Policy review
- [ ] Training update

---

## Security Configuration Template

```json
{
  "security": {
    "wallet": {
      "keystore": "keytar",
      "requirePassword": true,
      "passwordMinLength": 12
    },
    "network": {
      "ssl": {
        "enabled": true,
        "minVersion": "TLSv1.2"
      },
      "firewall": {
        "enabled": true,
        "whitelist": []
      }
    },
    "session": {
      "maxConcurrent": 10,
      "timeout": 3600000,
      "requireAuth": true
    },
    "monitoring": {
      "enabled": true,
      "alertThreshold": {
        "errorRate": 0.05,
        "responseTime": 5000
      }
    },
    "audit": {
      "enabled": true,
      "logLevel": "info",
      "retention": 90
    }
  }
}
```

---

## Resources

### Security Tools
- [OWASP](https://owasp.org) - Web application security
- [Slither](https://github.com/crytic/slither) - Smart contract analyzer
- [MythX](https://mythx.io) - Security analysis platform

### Documentation
- [Ethereum Security Best Practices](https://consensys.github.io/smart-contract-best-practices/)
- [Node.js Security Checklist](https://github.com/goldbergyoni/nodebestpractices#6-security-best-practices)

### Emergency Contacts
- Security Team: security@fabstir.com
- Bug Bounty: bounty@fabstir.com
- Emergency Hotline: Available to registered hosts

---

## Remember

> **Security is not a one-time setup but an ongoing process. Stay vigilant, keep systems updated, and always follow the principle of least privilege.**