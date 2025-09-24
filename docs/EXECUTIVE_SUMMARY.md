# Fabstir LLM Marketplace - Executive Summary

## Vision
**Democratizing AI access through a decentralized, peer-to-peer marketplace for Large Language Model inference**

## Overview

Fabstir is building the infrastructure for a decentralized AI economy where anyone can monetize their GPU resources by providing LLM inference services, and users can access AI capabilities without relying on centralized providers. Our marketplace creates a trustless, efficient, and censorship-resistant platform for AI services.

## The Problem

### Current AI Market Challenges

1. **Centralization Risks**
   - Single points of failure (OpenAI, Anthropic, Google)
   - Censorship and content restrictions
   - Data privacy concerns
   - Service availability dependencies

2. **High Barriers to Entry**
   - Expensive API costs for developers
   - Limited access to cutting-edge models
   - Geographic restrictions
   - KYC/compliance requirements

3. **Underutilized Resources**
   - Millions of consumer GPUs sitting idle
   - Data centers with spare capacity
   - No easy way to monetize GPU resources
   - Inefficient resource allocation

4. **Lack of Model Diversity**
   - Limited selection from major providers
   - Difficult to access specialized models
   - No marketplace for custom fine-tuned models
   - Innovation bottlenecked by gatekeepers

## Our Solution

### The Fabstir P2P LLM Marketplace

A decentralized marketplace that connects GPU providers directly with users needing AI inference, using blockchain for payments and cryptographic proofs for verification.

### Key Components

1. **Decentralized Infrastructure**
   - Peer-to-peer network (libp2p)
   - No central servers required
   - Automatic failover and redundancy
   - Global distribution

2. **Blockchain Settlement**
   - Smart contracts on Base (Ethereum L2)
   - USDC stablecoin payments
   - Automated escrow and distribution
   - Transparent pricing

3. **Cryptographic Verification**
   - EZKL proofs for inference verification
   - Checkpoint-based validation
   - Trustless computation
   - Fraud prevention

4. **Developer-Friendly SDK**
   - Browser-compatible (@fabstir/sdk-core)
   - Simple integration
   - Gasless transactions
   - Real-time streaming

## How It Works

### For Users (Clients)

1. **Connect Wallet** - Use any Ethereum wallet (Coinbase Smart Wallet recommended)
2. **Deposit USDC** - Minimum $1 to start a session
3. **Select Model** - Choose from approved models
4. **Send Prompts** - Get responses in real-time
5. **Pay for Usage** - Only pay for tokens consumed

### For GPU Providers (Hosts)

1. **Register Node** - Specify hardware and capabilities
2. **List Models** - Declare supported models
3. **Set Pricing** - Competitive token pricing
4. **Serve Requests** - Automatic job matching
5. **Earn Revenue** - 90% of payments, settlement on session completion

### Technical Flow

```
Client → Smart Contract → Host Discovery → P2P Connection → Inference → Proof → Payment
```

## Technology Stack

### Core Technologies

- **Blockchain**: Base (Ethereum L2) for low-cost, fast transactions
- **Payments**: USDC stablecoin for price stability
- **Networking**: libp2p for peer-to-peer communication
- **Storage**: S5 Network for decentralized data persistence
- **Proofs**: EZKL for cryptographic inference verification
- **Smart Wallets**: Base Account Kit for gasless transactions

### Architecture Highlights

- **Session-Based Model**: Long-running conversations with checkpoints
- **Streaming Responses**: Real-time token generation
- **Context Preservation**: Full conversation history maintained
- **Auto-Scaling**: Dynamic host discovery and load balancing
- **Fault Tolerance**: Automatic failover and session recovery

## Business Model

### Revenue Streams

1. **Transaction Fees**
   - 10% treasury fee on all transactions
   - Sustainable protocol development funding
   - Community governance treasury

2. **Model Curation**
   - Premium model listings
   - Verification services
   - Quality assurance

3. **Enterprise Services**
   - Private networks
   - SLA guarantees
   - Custom integrations

### Token Economics

- **FAB Token** (Future)
  - Governance rights
  - Staking for hosts
  - Priority access
  - Fee discounts

- **USDC Payments**
  - Stable pricing
  - No volatility risk
  - Wide acceptance
  - Easy accounting

## Market Opportunity

### Total Addressable Market

- **Global AI Market**: $500B+ by 2024
- **LLM API Market**: $10B+ growing 35% annually
- **GPU Cloud Market**: $7B+ growing 40% annually
- **Decentralized Compute**: $2B+ emerging market

### Target Segments

1. **Developers & Startups**
   - Need affordable AI access
   - Want model flexibility
   - Require privacy/control

2. **GPU Owners**
   - Gamers with idle GPUs
   - Small data centers
   - Crypto miners pivoting

3. **Enterprise Clients**
   - Data sovereignty requirements
   - Compliance needs
   - Custom model deployment

4. **Researchers & Academics**
   - Experimental models
   - Budget constraints
   - Open access needs

## Competitive Advantages

### 1. **True Decentralization**
- No single point of failure
- Censorship resistant
- Global accessibility
- Community owned

### 2. **Cost Efficiency**
- 85-95% lower transaction costs than traditional systems
- No middleman fees
- Direct peer-to-peer pricing
- Competitive marketplace dynamics

### 3. **Innovation Enablement**
- Open model ecosystem
- Permissionless innovation
- Custom model support
- Rapid deployment

### 4. **Superior Economics**
- Instant settlement
- No payment delays
- Transparent pricing
- Fair revenue distribution (90% to hosts, 10% to treasury)

### 5. **Technical Innovation**
- Cryptographic proof verification
- Gasless transactions
- Session-based efficiency
- Real-time streaming

## Current Status

### Completed Milestones

✅ **Core Infrastructure**
- Smart contracts deployed on Base Sepolia
- P2P networking layer operational
- SDK browser compatibility achieved
- WebSocket streaming implemented

✅ **Payment System**
- USDC integration complete
- Session-based payments working
- Gasless transactions via Base Account Kit
- Automatic payment distribution

✅ **Proof System**
- EZKL integration functional
- Checkpoint verification working
- 64-byte minimum proof validation
- Rate limiting (10 tokens/second)

✅ **Developer Tools**
- Browser-compatible SDK (@fabstir/sdk-core)
- Comprehensive API documentation
- Working demo applications
- Integration test suite

### In Development

🚧 **User Interface**
- Professional web application
- Mobile-responsive design
- Wallet integration improvements
- User dashboard

🚧 **Model Governance**
- Expanded model registry
- Community curation system
- Quality metrics
- Reputation system

🚧 **Network Growth**
- Host onboarding tools
- Automated model deployment
- Performance monitoring
- Network statistics dashboard

## Roadmap

### Q4 2025 - Beta Launch
- [ ] Public beta on Base Sepolia
- [ ] 10+ verified models
- [ ] 50+ active hosts
- [ ] Web application launch

### Q1 2026 - Mainnet Preparation
- [ ] Security audits
- [ ] Base mainnet deployment
- [ ] FAB token launch
- [ ] Enterprise partnerships

### Q2 2026 - Scale Phase
- [ ] 100+ models available
- [ ] 1,000+ hosts
- [ ] Mobile applications
- [ ] API gateway service

### Q3 2026 - Ecosystem Expansion
- [ ] Cross-chain support
- [ ] Model training marketplace
- [ ] Data marketplace integration
- [ ] DAO governance launch

## Use Cases

### Current Applications

1. **Conversational AI**
   - Chatbots and assistants
   - Customer support
   - Educational tutoring
   - Creative writing

2. **Content Generation**
   - Article writing
   - Code generation
   - Translation services
   - Summarization

3. **Research & Analysis**
   - Data analysis
   - Research assistance
   - Document processing
   - Information extraction

### Future Applications

1. **Specialized Models**
   - Medical diagnosis assistance
   - Legal document analysis
   - Financial modeling
   - Scientific research

2. **Real-time Services**
   - Live translation
   - Voice assistants
   - Gaming NPCs
   - Interactive education

3. **Enterprise Solutions**
   - Private model deployment
   - Compliance-ready systems
   - Custom fine-tuning
   - Hybrid cloud integration

## Investment Highlights

### Why Fabstir?

1. **First Mover Advantage**
   - First production-ready P2P LLM marketplace
   - Proven technology stack
   - Working implementation

2. **Network Effects**
   - More hosts → better availability
   - More users → higher revenue for hosts
   - More models → greater user value
   - Virtuous growth cycle

3. **Defensible Moat**
   - Cryptographic verification technology
   - Network effects
   - Developer ecosystem
   - Model curation expertise

4. **Scalable Business Model**
   - Low operational costs
   - Automated operations
   - Global market reach
   - Multiple revenue streams

5. **Aligned Incentives**
   - Hosts earn 90% of revenue (10% to treasury)
   - Users get competitive pricing
   - Protocol captures sustainable fees
   - Community governance model

## Gas Payment Responsibilities

### Economic Design

The marketplace uses a hybrid gas payment model:

| Operation | Who Pays | Gas Cost | Rationale |
|-----------|----------|----------|-----------|
| Session Creation | User | ~200k gas | User initiates service |
| Checkpoint Proofs | Host | ~30k gas each | Host secures payment |
| Session Completion | User | ~100k gas | User triggers settlement |

### Automatic Settlement Innovation

The system now features **gasless session ending for users** through automatic settlement:
- When users end a session, they simply close the WebSocket connection
- The host node (v5+) automatically detects disconnection and calls `completeSessionJob()`
- Hosts pay the gas for settlement (they're incentivized to get their payment)
- Users receive their refund without paying any gas fees
- This eliminates the previous incentive misalignment completely

## Technical Specifications

### Contract Addresses (Base Sepolia)

```
JobMarketplace: 0x1273E6358aa52Bb5B160c34Bf2e617B745e4A944
ProofSystem: 0x2ACcc60893872A499700908889B38C5420CBcFD1
NodeRegistry: 0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218
HostEarnings: 0x908962e8c6CE72610021586f85ebDE09aAc97776
ModelRegistry: 0x92b2De840bB2171203011A6dBA928d855cA8183E
USDC Token: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
FAB Token: 0xC78949004B4EB6dEf2D66e49Cd81231472612D62
```

### SDK Requirements

All 7 contract addresses must be provided - no fallbacks or defaults.

## Risk Mitigation

### Technical Risks
- **Mitigation**: Extensive testing, gradual rollout, failover systems

### Regulatory Risks
- **Mitigation**: Decentralized architecture, compliance tools, geographic flexibility

### Competition Risks
- **Mitigation**: First mover advantage, network effects, continuous innovation

### Adoption Risks
- **Mitigation**: Developer-friendly tools, competitive pricing, superior UX

## Team & Governance

### Core Development
- Experienced blockchain developers
- AI/ML expertise
- Distributed systems engineers
- Open-source contributors

### Advisory Network
- Blockchain industry veterans
- AI researchers
- Business development experts
- Legal and compliance advisors

### Community Governance
- Progressive decentralization
- Token holder voting
- Grant programs
- Ecosystem fund

## Call to Action

### For Investors
- Join us in building the decentralized AI infrastructure
- Ground floor opportunity in emerging market
- Contact: investors@fabstir.com

### For Developers
- Start building with our SDK today
- Access cutting-edge models affordably
- Documentation: https://docs.fabstir.com

### For GPU Providers
- Monetize your idle hardware
- Join the network as a host
- Setup guide: https://fabstir.com/host

### For Partners
- Integrate Fabstir into your platform
- White-label solutions available
- Contact: partnerships@fabstir.com

## Conclusion

Fabstir is positioned to become the foundational infrastructure for decentralized AI services. By solving the critical problems of centralization, cost, and accessibility in the AI market, we're enabling a new era of permissionless innovation and global access to artificial intelligence.

The convergence of blockchain technology, cryptographic proofs, and distributed computing creates a unique opportunity to build a more open, efficient, and equitable AI ecosystem. With our technology operational and ready for scale, Fabstir is poised to capture significant value in the rapidly growing AI market.

---

## Key Metrics

| Metric | Current (Testnet) | Target (Year 1) |
|--------|------------------|-----------------|
| Active Hosts | 10+ | 1,000+ |
| Available Models | 5 | 100+ |
| Monthly Transactions | 1,000+ | 1,000,000+ |
| Total Value Locked | $10,000 | $10,000,000 |
| SDK Integrations | 5 | 500+ |
| Average Response Time | <2s | <1s |
| Cost vs Centralized | 80% lower | 90% lower |

## Contact Information

- **Website**: https://fabstir.com
- **Documentation**: https://docs.fabstir.com
- **GitHub**: https://github.com/fabstir
- **Discord**: https://discord.gg/fabstir
- **Twitter**: @FabstirNetwork
- **Email**: info@fabstir.com

---

*"Democratizing AI, One Inference at a Time"*

**© 2025 Fabstir Network. Building the Future of Decentralized AI.**