# Platformless AI - Executive Summary

## Vision

**AI infrastructure where no company sits between you and AI models - trustless, private, and sovereign by design**

*"We don't trust, we verify."*

Platformless AI represents the right architecture for how the world should interact with LLMs and AI models. A truly ground-breaking infrastructure for the ages - where users are sovereign and in complete control of their data, able to decide what AI and AI agents can access, and share securely with other users on their own terms.

## Core Principles: Trustless by Design

| Principle | Technology | Guarantee |
|-----------|------------|-----------|
| **Proof of Storage** | Sia Network | Data persisted and retrievable without central servers |
| **Proof of Computation** | STARK Proofs (Risc0 zkVM) | Mathematical certainty that inference ran correctly |
| **Content Integrity** | Blake3 Content Addressing | Cryptographic guarantee content is not tampered with |
| **Communication Privacy** | XChaCha20-Poly1305 + Forward Secrecy | End-to-end encryption; past sessions remain secure even if keys compromised |
| **Full Transparency** | Open Source | Every line of code auditable by anyone |
| **User Sovereignty** | Wallet-Based Identity | You control your data, your keys, your AI access |

## Overview

Platformless AI is building decentralized AI infrastructure that eliminates the platform middleman. Unlike traditional AI services, there's no centralized company that can censor prompts, access your data, or revoke your access. Smart contracts coordinate, P2P connections deliver inference, and cryptographic proofs verify computation - all without requiring trust in a central authority.

Our marketplace connects GPU providers directly with users through blockchain-based settlement, end-to-end encryption, and mathematical proof of computation. This creates a trustless, censorship-resistant, and privacy-preserving platform for AI services.

## The Problem

### Current AI Market Challenges

1. **Platform Control & Censorship**

   - Centralized platforms (OpenAI, Anthropic, Google) control access
   - Content filtering based on platform policies
   - Risk of deplatforming or access revocation
   - No recourse if terms change
   - Training on user data without consent

2. **Data Privacy & IP Concerns**

   - Proprietary data sent to third-party servers
   - No end-to-end encryption guarantees
   - IP leakage risk for enterprises
   - Compliance issues (GDPR, HIPAA, financial regulations)
   - Trust-based security (no cryptographic guarantees)

3. **Vendor Lock-In & Economics**

   - 300-750x markup over compute costs
   - Subscription models and rate limits
   - API key dependencies (can be revoked)
   - Limited model selection
   - Geographic restrictions

4. **Enterprise Compliance Gaps**
   - Cannot meet data sovereignty requirements
   - No immutable audit trails
   - Insufficient for ISO 27001, ISO 42001, SOC 2 compliance
   - GDPR/HIPAA violations from third-party data handling
   - Single points of failure

## Our Solution

### Platformless AI: Infrastructure Without the Platform

A decentralized marketplace where smart contracts handle coordination, P2P connections deliver inference, and cryptographic proofs verify computation - no company in the middle.

### Core Architecture

1. **Decentralized Infrastructure**

   - Direct WebSocket connections (user ↔ GPU provider)
   - Smart contracts for job assignment (Base L2, opBNB)
   - No central servers or APIs to trust
   - Global distribution with automatic failover
   - Multi-chain support for resilience

2. **End-to-End Encryption (Default)**

   - XChaCha20-Poly1305 AEAD encryption
   - Forward secrecy via ephemeral session keys
   - ECDSA signatures for sender authentication
   - Zero-knowledge architecture (hosts process encrypted payloads)
   - Only you and the GPU provider hold keys

3. **Cryptographic Verification**

   - STARK proofs via Risc0 zkVM
   - ~221KB proofs generated per 1,000 tokens
   - Off-chain storage on S5 (Sia network)
   - Only 32-byte hash + CID submitted on-chain (737x size reduction)
   - Mathematical certainty of computation

4. **Decentralized Storage**

   - Enhanced S5.js (Sia Foundation grant funded)
   - All conversations encrypted before storage
   - STARK proofs persisted on Sia network
   - No centralized databases or servers
   - Content-addressed, verifiable storage

5. **Multi-Chain Settlement**

   - Base L2 (primary) - fast, cheap transactions
   - opBNB Testnet (secondary) - alternative chain
   - ETH, USDC, FAB token payments
   - Automated escrow and distribution
   - Immutable on-chain audit trails

6. **Developer-Friendly SDK**
   - Browser-compatible (@fabstir/sdk-core)
   - 13 specialized managers (Auth, Payment, Session, Host, Storage, Model, Treasury, Client, Encryption, VectorRAG, Document, SessionGroup, Permission)
   - Real-time streaming responses
   - Simple integration (5 lines to start)
   - Open source and auditable

7. **Host Operator Tools**
   - Host CLI (`@fabstir/host-cli`) for server management
   - TUI dashboard for headless servers (status, logs, earnings, pricing)
   - Setup wizard for guided host onboarding
   - Model discovery and download with verification
   - Earnings tracking and withdrawal

8. **Video Transcoding Marketplace** (Post-MVP)
   - Decentralized video/audio format conversion
   - GPU-accelerated transcoding (h264, AV1, AAC, Opus)
   - GOP-based STARK proofs verify quality (PSNR, SSIM metrics)
   - Privacy-preserving (encrypted uploads via S5 + Blake3)
   - Competitive pricing vs. AWS MediaConvert, Mux, Cloudflare Stream
   - Same trustless infrastructure as LLM inference

## How It Works

### For Users (Clients)

1. **Connect Wallet** - Any Ethereum wallet (MetaMask, Coinbase Wallet, Rainbow)
2. **Automatic Encryption** - SDK generates session keys, encrypts all messages
3. **Select Model** - Browse available models and GPU providers
4. **Deposit Funds** - Minimum deposit (e.g., $1 USDC) into smart contract escrow
5. **Send Prompts** - Real-time encrypted inference with streaming responses
6. **Automatic Settlement** - Pay only for tokens used, unused deposit refunded

### For GPU Providers (Hosts)

1. **Register Node** - Specify hardware, stake FAB tokens, list supported models
2. **Set Pricing** - Competitive per-token pricing (marketplace dynamics)
3. **Serve Requests** - Automatic job matching via smart contracts
4. **Process Encrypted Payloads** - Generate inference without seeing prompts
5. **Submit Proofs** - Generate STARK proofs, upload to S5, submit hash on-chain
6. **Earn Revenue** - 90% of payments, 10% treasury fee, instant settlement

### For Video Transcoding (Post-MVP)

1. **Upload Video** - Upload to S5 with Blake3 encryption, get CID
2. **Select Format** - Choose output codec (h264/AV1), resolution (720p/1080p/4K), quality tier
3. **Find Host** - Browse transcode providers by price, supported formats, hardware acceleration
4. **Create Job** - Specify format requirements, deposit USDC based on video duration
5. **Monitor Progress** - Real-time progress updates via WebSocket (GOP-by-GOP)
6. **Verify Quality** - Spot-check random GOPs, validate PSNR/SSIM metrics against spec
7. **Download Output** - Retrieve transcoded video from S5, encrypted with your keys

**Transcode Flow**:
```
Upload to S5 → Create Job → Host Downloads → GPU Transcode → GOP Proofs
→ Upload Output to S5 → Submit Proof Hash On-Chain → Payment Release
```

### Technical Flow

```
Client Wallet → Smart Contract → Host Discovery → P2P WebSocket (encrypted)
→ Inference (GPU) → STARK Proof → S5 Storage → Hash On-Chain → Payment Release
```

## Technology Stack

### Core Technologies

- **Blockchain**: Base L2 (Ethereum), opBNB Testnet - low-cost, fast settlement
- **Payments**: ETH, USDC, FAB tokens - multi-token support
- **Encryption**: XChaCha20-Poly1305 AEAD, ECDH key exchange, ECDSA signatures
- **Proofs**: Risc0 zkVM STARK proofs - cryptographic verification
- **Storage**: Enhanced S5.js (Sia network) - decentralized, verifiable persistence
- **Networking**: WebSocket P2P - direct client-to-host connections
- **Smart Contracts**: JobMarketplace, NodeRegistry, ProofSystem, HostEarnings, ModelRegistry

### Architecture Highlights

- **Session-Based Model**: Long-running encrypted conversations with checkpoints
- **Forward Secrecy**: Ephemeral keys per session, discarded after use
- **Streaming Responses**: Real-time token generation with low latency
- **Proof Checkpoints**: Every 1,000 tokens, STARK proof generated and verified
- **Automatic Failover**: Session recovery if host disconnects
- **Multi-Host Isolation**: Each host has unique encryption keys

### Security & Compliance

**Implemented**:

- ✅ End-to-end encryption by default (XChaCha20-Poly1305)
- ✅ Zero-knowledge architecture (hosts cannot read prompts/responses)
- ✅ Immutable audit trails (all transactions on-chain)
- ✅ GDPR-compliant data handling (encrypted, user-controlled)
- ✅ Forward secrecy (ephemeral session keys)
- ✅ Sender authentication (ECDSA signatures)

**In Progress** (Enterprise Compliance):

- 🔄 ISO 27001 (Information Security Management)
- 🔄 ISO 42001 (AI Management Systems)
- 🔄 SOC 2 Type 2 audit readiness
- 🔄 HIPAA compliance architecture validation

## Business Model

### Revenue Streams

1. **Transaction Fees**

   - 10% treasury fee on all inference payments
   - 90% goes directly to GPU providers
   - Sustainable protocol development funding
   - Community governance treasury

2. **Model Curation & Governance**

   - Premium model verification
   - Quality assurance services
   - Curated model listings
   - Specialized model hosting

3. **Enterprise Services**
   - Private node deployments
   - Dedicated compute capacity
   - SLA guarantees
   - Custom compliance packages
   - White-label solutions

### Token Economics

- **FAB Token**

  - Host staking requirement (minimum 100 FAB)
  - Governance rights (model approvals, protocol upgrades)
  - Fee discounts (use FAB for payments)
  - Higher stake = higher job priority

- **Multi-Token Payments**
  - ETH (native, gas-efficient)
  - USDC (stablecoin, preferred for pricing)
  - FAB (platform token, fee discounts)
  - Users choose payment token

## Market Opportunity

### Total Addressable Market

- **Global AI Market**: $400B+ by 2025, growing 35% annually
- **LLM API Market**: $7B+ in 2024, 37% CAGR
- **Video Transcoding Market**: $1.8B+ by 2027, 17% CAGR (Post-MVP expansion)
- **Enterprise AI Security**: $22B+ market (compliance, privacy)
- **Decentralized Compute**: $8B+ emerging market

### Target Segments

1. **Enterprises & Financial Institutions**

   - Trading firms (strategy protection, real-time analysis)
   - Investment banks (client portfolio analysis, compliance)
   - Law firms (attorney-client privilege, document review)
   - Healthcare (HIPAA compliance, patient diagnostics)
   - Web3 companies (avoid centralized AI irony)

2. **Developers & Startups**

   - Privacy-first applications
   - Censorship-resistant apps
   - Custom model deployment
   - Budget-conscious builders

3. **GPU Providers**

   - Gamers with idle RTX 3060+ GPUs
   - AI-focused data centers with spare capacity
   - Cloud GPU providers looking to diversify revenue
   - Crypto miners pivoting to AI compute
   - Render farms that already have GPUs for VFX/animation
   - Geographic diversity (global participation)

4. **Researchers & Academics**
   - Experimental models
   - Controversial research (no censorship)
   - Budget constraints
   - Open access requirements

5. **Content Creators & Media Companies** (Post-MVP)
   - YouTubers, streamers, indie filmmakers (affordable transcoding)
   - Media companies (privacy-preserving video processing)
   - NFT marketplaces (video NFT optimization)
   - Decentralized video platforms (LBRY, Odysee, PeerTube)
   - Animation studios, VFX houses (render farms diversifying into transcoding)
   - Censorship-resistant content distribution

## Competitive Advantages

### 1. **True Platformlessness**

- No company controls access (smart contracts coordinate)
- No API keys to revoke (wallet-based access)
- No terms of service to change (immutable protocol)
- No censorship (no gatekeeper)
- No single point of failure (distributed infrastructure)

### 2. **Cryptographic Security**

- End-to-end encryption by default (not optional)
- Zero-knowledge architecture (hosts process encrypted payloads)
- Forward secrecy (past sessions remain secure if keys compromised)
- STARK proofs (mathematical certainty of computation)
- Sender authentication (ECDSA signatures)

### 3. **Enterprise Compliance Ready**

- ISO 27001, ISO 42001, SOC 2 preparation underway
- GDPR-compliant by design (encrypted, user-controlled data)
- HIPAA-ready architecture (no third-party data exposure)
- Immutable audit trails (blockchain-based)
- Data sovereignty (choose geographic regions for compute)

### 4. **Efficient Economics**

- No platform markup (direct P2P pricing)
- Transparent pricing (all rates visible on-chain)
- Instant settlement (no payment delays)
- Fair distribution (90% to hosts, 10% protocol fee)
- Competitive marketplace (providers compete on price/quality)

### 5. **Technical Innovation**

- Off-chain proof storage (221KB proofs on S5, 32-byte hash on-chain)
- Multi-chain support (Base, opBNB, future chains)
- Enhanced S5.js integration (Sia Foundation grant funded)
- Real-time streaming (low-latency inference)
- Session-based efficiency (context preservation)
- RAG infrastructure (vector DB, document management, Claude Projects-style organization)
- Host-side embedding generation (privacy-preserving, no external API calls)
- Intelligent host selection (weighted scoring algorithm)

## Current Status

### Completed (MVP Ready)

✅ **Core Infrastructure**

- Smart contracts deployed on Base Sepolia, opBNB Testnet
- Multi-chain support operational
- WebSocket P2P connections working
- Production nodes running live inference with SSL
- SDK browser compatibility achieved
- **fabstir-platformless-ui deployed and operational** (November 2025)

✅ **End-to-End Encryption**

- XChaCha20-Poly1305 AEAD implementation complete
- Forward secrecy via ephemeral keys
- ECDSA signature authentication
- Session key management
- Encryption enabled by default (Phase 6.2)

✅ **Proof System**

- STARK proof generation via Risc0 zkVM
- ~221KB proofs stored on S5 (Sia network)
- 32-byte hash + CID on-chain (737x reduction)
- GPU-accelerated proof generation (0.2-2.3s)
- Checkpoint verification working (every 1,000 tokens)

✅ **Payment System**

- Multi-token support (ETH, USDC, FAB)
- Multi-chain payments (Base, opBNB)
- Session-based escrow and settlement
- Automatic refunds for unused deposits
- 90%/10% host/protocol revenue split

✅ **Storage Layer**

- Enhanced S5.js integration complete
- All conversations encrypted before storage
- STARK proofs persisted on Sia network
- Decentralized, content-addressed storage
- No centralized databases

✅ **Developer Tools**

- Browser-compatible SDK (@fabstir/sdk-core v1.6.0)
- 13 specialized managers (modular architecture)
- Comprehensive API documentation
- Working demo applications (apps/harness)
- Integration test suite (7/7 encryption tests passing)

✅ **Host Operator Tools**

- Host CLI package (@fabstir/host-cli) for server management
- TUI dashboard for headless server monitoring (status, logs, earnings)
- Interactive setup wizard for guided host onboarding
- Model discovery with blockchain validation and download verification
- Pricing management (update rates via CLI or TUI)
- Earnings tracking and withdrawal commands

✅ **Marketplace Pricing**

- Host-controlled minimum pricing (contract-enforced)
- Price discovery via SDK HostManager
- Intelligent host selection (weighted algorithm: stake, price, uptime, latency)
- User preference persistence (selection mode, default model)

✅ **RAG Infrastructure**

- VectorRAGManager for host-side vector database operations
- DocumentManager for document chunking and embedding
- SessionGroupManager for Claude Projects-style organization
- PermissionManager for access control
- Host-side embedding via `/v1/embed` endpoint

### In Deployment

🚀 **Production Deployment** (Q1 2026)

- Public beta on Base Sepolia
- Enterprise beta program
- Web application (platformlessai.org)
- UI5 with Base Account Kit integration
- Network monitoring dashboard

🚀 **Compliance & Security**

- ISO 27001 preparation
- ISO 42001 (AI-specific) preparation
- SOC 2 Type 2 audit readiness
- Security audit (smart contracts)
- Penetration testing

## Roadmap

### Q4 2025 - Infrastructure Complete ✅

- [x] MVP complete (production-ready)
- [x] 13 SDK managers implemented
- [x] Host CLI with TUI dashboard
- [x] Setup wizard for host onboarding
- [x] Marketplace pricing (host-controlled, contract-enforced)
- [x] RAG infrastructure (vector DB, document management)
- [x] End-to-end encryption by default

### Q1 2026 - Public Beta Launch

- [ ] Public beta on Base Sepolia
- [ ] Enterprise beta program launch
- [ ] Web application live (platformlessai.org)
- [ ] 10+ verified models
- [ ] 20+ active hosts
- [ ] UI5 production deployment

### Q2 2026 - Enterprise Adoption

- [ ] ISO 27001, SOC 2 certification complete
- [ ] 3-5 enterprise pilot customers
- [ ] Base mainnet deployment
- [ ] Enhanced host pricing discovery
- [ ] Mobile-responsive UI improvements

### Q3 2026 - Scale & Expansion

- [ ] 50+ models available
- [ ] 100+ active hosts
- [ ] 1,000+ monthly active users
- [ ] API gateway service (REST abstraction)
- [ ] Model governance DAO launch

### Q4 2026 - Ecosystem Growth

- [ ] Additional L2 chains (Arbitrum, Optimism, Polygon)
- [ ] RAG/vector database marketplace
- [ ] Model training marketplace
- [ ] 500+ hosts, 5,000+ users
- [ ] Institutional partnerships

## Use Cases

### Enterprise Use Cases

1. **Financial Services**

   - Algorithmic trading analysis (no strategy leakage)
   - Client portfolio analysis (compliance-ready)
   - Market sentiment analysis (real-time)
   - Fraud detection (data sovereignty)

2. **Healthcare**

   - Patient diagnostics (HIPAA-compliant)
   - Medical research (privacy-preserving)
   - Clinical decision support (encrypted data)
   - Insurance claim processing (secure)

3. **Legal**

   - Contract review and analysis (attorney-client privilege)
   - Case law research (confidential)
   - Document summarization (IP protection)
   - Due diligence (data security)

4. **Media & Entertainment**
   - Script generation (no IP theft)
   - Creative content generation (proprietary)
   - Translation services (confidential)
   - Voiceover generation (privacy)

### Developer Use Cases

1. **Privacy-First Applications**

   - Encrypted messaging with AI features
   - Private personal assistants
   - Confidential data analysis
   - Censorship-resistant content platforms

2. **DeFi & Web3**

   - Smart contract auditing (pre-release security)
   - Market analysis (alpha protection)
   - Community moderation (uncensorable)
   - Decentralized social media AI features

3. **Research & Education**
   - Controversial research (no censorship)
   - Academic paper analysis
   - Educational tutoring
   - Language learning

## Investment Highlights

### Why Platformless AI?

1. **First-Mover Advantage in Trustless AI**

   - First production-ready platformless AI infrastructure
   - MVP complete with real nodes, real proofs, real encryption
   - Working implementation, not vaporware
   - Technical moat (cryptographic verification, multi-chain, encryption)

2. **Network Effects**

   - More hosts → better availability, lower prices
   - More users → higher revenue for hosts, attracts more hosts
   - More models → greater user value, attracts more users
   - Virtuous growth cycle with strong lock-in

3. **Regulatory Tailwinds**

   - EU AI Act, US AI executive orders increasing compliance burden
   - GDPR enforcement intensifying (€1B+ fines)
   - Data sovereignty requirements growing
   - Platformless AI positioned as compliance-by-design solution

4. **Defensible Moat**

   - Cryptographic verification technology (STARK proofs)
   - End-to-end encryption architecture (forward secrecy)
   - Network effects (first mover in platformless AI)
   - Enhanced S5.js integration (Sia Foundation grant funded)
   - Developer ecosystem and SDK adoption

5. **Scalable Business Model**

   - Near-zero marginal cost (automated operations)
   - Global market reach (no geographic restrictions)
   - Multiple revenue streams (fees, enterprise, curation)
   - Sustainable economics (10% treasury fee sufficient)

6. **Aligned Incentives**
   - Hosts earn 90% (incentivized to provide quality service)
   - Users pay fair market rates (competitive pricing)
   - Protocol captures sustainable 10% fee
   - Community governance (token holder alignment)

## Technical Specifications

### Smart Contract Architecture

**Core Contracts**:

- **JobMarketplace**: Job creation, assignment, payment escrow, settlement
- **NodeRegistry**: Host registration, model listings, public key storage
- **ProofSystem**: STARK proof hash + CID verification
- **HostEarnings**: Accumulated earnings tracking, withdrawal management
- **ModelRegistry**: Model approvals, governance, quality control

**Contract Addresses**:
See `.env.test` for current deployed addresses on Base Sepolia and opBNB Testnet. Addresses are updated with each contract deployment and should never be hardcoded.

### SDK Architecture

**13 Specialized Managers**:

1. **AuthManager**: Wallet authentication, S5 seed generation
2. **PaymentManagerMultiChain**: Deposits, withdrawals, multi-chain, multi-token
3. **SessionManager**: WebSocket sessions, encryption, streaming
4. **HostManager**: Registration, pricing, earnings, public key retrieval
5. **StorageManager**: Encrypted conversation storage (S5), user settings
6. **ModelManager**: Model registry, governance, approvals
7. **TreasuryManager**: Platform fee management, governance funds
8. **ClientManager**: Client reputation, usage tracking
9. **EncryptionManager**: End-to-end encryption, key exchange, forward secrecy
10. **VectorRAGManager**: Host-side vector database operations via WebSocket
11. **DocumentManager**: Document chunking, embedding, upload
12. **SessionGroupManager**: Claude Projects-style session organization
13. **PermissionManager**: Access control for groups and vector databases

### Encryption Specifications

- **Algorithm**: XChaCha20-Poly1305 AEAD (Authenticated Encryption with Associated Data)
- **Key Exchange**: Ephemeral-static ECDH on secp256k1
- **Signatures**: ECDSA secp256k1 (same as Ethereum)
- **Key Derivation**: HKDF-SHA256
- **Session Keys**: Random 32 bytes, ephemeral (forward secrecy)
- **Libraries**: @noble/secp256k1, @noble/ciphers (audited, production-grade)

### Proof Specifications

- **Proof System**: Risc0 zkVM STARK proofs
- **Proof Size**: ~221KB per checkpoint (1,000 tokens)
- **Storage**: S5 decentralized network (Sia)
- **On-Chain Data**: 32-byte hash + CID (~300 bytes total)
- **Size Reduction**: 737x (221KB → 300 bytes)
- **Generation Time**: 0.2-2.3s (GPU-accelerated with CUDA)
- **Verification**: Anyone can retrieve from S5 and verify hash

## Risk Mitigation

### Technical Risks

- **Risk**: Smart contract vulnerabilities
- **Mitigation**: Security audits, gradual rollout, bug bounty program, immutable core logic

### Regulatory Risks

- **Risk**: AI regulation, data privacy laws
- **Mitigation**: Compliance-by-design (ISO 27001, ISO 42001, SOC 2), decentralized architecture, legal counsel

### Competition Risks

- **Risk**: Centralized platforms improve privacy, other decentralized projects
- **Mitigation**: First mover advantage, network effects, continuous innovation, technical moat

### Adoption Risks

- **Risk**: Crypto wallet barrier, complexity
- **Mitigation**: Developer-friendly SDK, comprehensive docs, enterprise onboarding support, fiat on-ramps (future)

### Market Risks

- **Risk**: AI market consolidation, regulatory crackdown
- **Mitigation**: Multi-chain support, geographic diversity, compliance readiness, open-source ethos

## Team & Governance

### Core Development

- Experienced blockchain developers (Ethereum, smart contracts)
- AI/ML expertise (GGUF models, inference optimization)
- Distributed systems engineers (P2P, libp2p, WebSocket)
- Cryptography specialists (STARK proofs, encryption)
- Open-source contributors (Sia Foundation grant recipient)

### Grants & Funding

- **Sia Foundation Grant**: Enhanced S5.js development (completed)
- **Base Ecosystem Support**: Contract deployment, developer relations
- Seeking: Seed round for team expansion, security audits, marketing

### Community Governance

- Progressive decentralization roadmap
- FAB token holder voting (model approvals, protocol upgrades)
- Grant programs for ecosystem development
- Transparent treasury management

## Call to Action

### For Investors

- **Opportunity**: Ground floor in platformless AI infrastructure (new category)
- **Stage**: Infrastructure complete, deploying to production Q1 2026
- **Contact**: investors@fabstir.com
- **Ask**: Seed round to scale team, audits, enterprise sales

### For Enterprise Customers

- **Beta Program**: Limited spots for Q1 2026 enterprise beta
- **Benefits**: Early access, custom compliance support, dedicated integration help
- **Contact**: enterprise@fabstir.com or DM on LinkedIn
- **Industries**: Financial services, healthcare, legal, media & entertainment

### For Developers

- **Get Started**: SDK available now (@fabstir/sdk-core)
- **Documentation**: https://docs.platformless.org (comprehensive API reference)
- **GitHub**: https://github.com/fabstir-llm-marketplace (open source)
- **Community**: Discord for real-time support

### For GPU Providers

- **Requirements**: RTX 3060+ (8GB VRAM), Docker, stable internet
- **Earnings**: 90% of inference payments, set your own pricing
- **Setup**: Interactive setup wizard via Host CLI (`fabstir-host setup`)
- **Tools**: TUI dashboard for monitoring, earnings, pricing updates
- **Documentation**: See `docs/HOST_OPERATOR_GUIDE.md`
- **Contact**: hosts@fabstir.com or join Discord #hosting

### For Partners

- **Integration**: White-label solutions, API partnerships
- **Opportunities**: Model providers, infrastructure partners, compliance consultants
- **Contact**: partnerships@fabstir.com

## Conclusion

Platformless AI represents a fundamental shift in AI infrastructure - from platform-centric to protocol-centric. By eliminating the centralized middleman through smart contracts, cryptographic proofs, and end-to-end encryption, we're building AI infrastructure that cannot censor, cannot spy, and cannot be shut down.

**We don't trust, we verify.** Every component of our stack is designed around this principle:
- **Sia's proof of storage** ensures your data persists without trusting any company
- **STARK proofs** mathematically verify computation happened correctly
- **Blake3 content addressing** guarantees content integrity and tamper-proof storage
- **XChaCha20-Poly1305 encryption with forward secrecy** protects all communication
- **Open source** means full transparency - every line auditable

Our infrastructure is complete and production-ready, with fabstir-platformless-ui deployed and operational. The SDK now includes 13 specialized managers, a comprehensive Host CLI with TUI dashboard, marketplace pricing, and full RAG infrastructure. With cryptographic security, compliance-by-design architecture, and sustainable economics, Platformless AI is positioned to capture significant enterprise and developer adoption as AI regulation tightens and privacy concerns intensify.

The convergence of blockchain technology, zero-knowledge cryptography, and decentralized storage creates a unique opportunity to build AI infrastructure that respects user sovereignty, protects intellectual property, and enables permissionless innovation. Users are sovereign - in complete control of their data, able to decide what AI and AI agents can access, and share securely with others on their own terms.

With first-mover advantage in the platformless AI category, we're poised to become foundational infrastructure for the next generation of AI applications. This is ground-breaking infrastructure for the ages.

---

## Key Metrics

| Metric               | Current (Q4 2025) | Target Q2 2026 | Target Q4 2026 |
| -------------------- | ----------------- | -------------- | -------------- |
| Active Hosts         | 5-10              | 50+            | 100+           |
| Available Models     | 5                 | 20+            | 50+            |
| Monthly Sessions     | 100+              | 1,000+         | 10,000+        |
| Enterprise Customers | 0                 | 3-5 pilots     | 10-20 paying   |
| Total Value Locked   | $5,000            | $100,000       | $1,000,000     |
| SDK Version          | v1.6.0            | v2.0+          | v2.5+          |
| SDK Managers         | 13                | 15+            | 18+            |
| Avg Response Time    | <2s               | <1.5s          | <1s            |
| Encryption Default   | 100%              | 100%           | 100%           |

## Contact Information

- **Website**: https://platformlessai.org
- **Documentation**: https://docs.platformlessai.org (coming soon)
- **GitHub**: https://github.com/fabstir-llm-marketplace
- **Discord**: https://discord.gg/fabstir
- **Twitter**: @PlatformlessAI (coming soon)
- **LinkedIn**: Search "Platformless AI"
- **Email**:
  - General: info@fabstir.com
  - Investors: investors@fabstir.com
  - Enterprise: enterprise@fabstir.com
  - Support: support@fabstir.com

---

_"We Don't Trust, We Verify - AI Infrastructure for the Ages"_

**Trustless by Design** | **Sia Proof of Storage** | **STARK Proof of Computation** | **Blake3 Content Integrity** | **XChaCha20 Encryption** | **Open Source**

**Built by Fabstir | Powered by Sia Storage | Secured by STARK Proofs**

**© 2025-2026 Platformless AI. Ground-breaking Infrastructure for the Ages.**
