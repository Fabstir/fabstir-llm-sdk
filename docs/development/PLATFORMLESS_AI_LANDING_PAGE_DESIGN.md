# Platformless AI Landing Page - Design Specification

**Version**: 1.0
**Date**: October 16, 2025
**Target URL**: platformlessai.com
**Framework**: Next.js + Shadcn UI
**Deployment**: Vercel (free tier)

---

## 📐 Page Layout Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          HEADER                                  │
│  [Logo]                                        [GitHub] [Docs]   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                       HERO SECTION                               │
│                                                                  │
│            [Platformless AI Logo/Title]                         │
│            AI Without the Platform                              │
│                                                                  │
│     Trustless. Private. Censorship-Resistant.                   │
│                                                                  │
│              [Join Waitlist Button]                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   VALUE PROPOSITION SECTION                      │
│                                                                  │
│              What is Platformless AI?                           │
│                                                                  │
│    [Two-column comparison: Traditional AI vs Platformless AI]   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  HOW CAN WE HELP? (FAQ Section)                 │
│                                                                  │
│         [Search bar: "Start typing your question..."]           │
│                                                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐               │
│  │  General   │  │   Users    │  │  Hosting   │               │
│  │    FAQ     │  │            │  │            │               │
│  │            │  │            │  │            │               │
│  │ • Q1       │  │ • Q1       │  │ • Q1       │               │
│  │ • Q2       │  │ • Q2       │  │ • Q2       │               │
│  │ • Q3       │  │ • Q3       │  │ • Q3       │               │
│  │ • Q4       │  │ • Q4       │  │ • Q4       │               │
│  │ • Q5       │  │ • Q5       │  │ • Q5       │               │
│  └────────────┘  └────────────┘  └────────────┘               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│               FAQ ANSWER DISPLAY AREA                            │
│                                                                  │
│  [Selected question's detailed answer appears here]             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   ARCHITECTURE DIAGRAM                           │
│                                                                  │
│              How Platformless AI Works                          │
│                                                                  │
│         [Architecture diagram image]                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                          FOOTER                                  │
│                                                                  │
│  Built by Fabstir  |  [GitHub]  |  [Docs]  |  [Discord]        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎨 Design System

### Brand Identity

**Logo Assets** (from Fabstir branding):
- `favicon-16x16.png` (16x16 favicon)
- `favicon-32x32.png` (32x32 favicon)
- `android-chrome-192x192.png` (192x192 logo)
- `android-chrome-512x512.png` (512x512 logo)

Use these for:
- Header logo (use 192x192 or 512x512, scaled appropriately)
- Favicons (16x16, 32x32)
- Social sharing images (512x512)

### Color Palette (Fabstir Brand Colors)

**Primary Colors**:
- **Primary Purple**: `#540074` - Main brand color, use for CTAs, primary buttons, key highlights
- **Primary Light**: `#9d50bc` - Lighter purple for hover states, secondary elements
- **Primary Dark**: `#260048` - Very dark purple for deep backgrounds, dark mode panels
- **Primary Content**: `#ea97ff` - Light purple for text on dark purple backgrounds

**Secondary Colors** (Pink Accents):
- **Secondary Pink**: `#e458b9` - Secondary accent color for highlights, badges
- **Secondary Light**: `#ffa5ff` - Light pink for hover states, subtle accents
- **Secondary Dark**: `#af1e89` - Dark pink for strong accents, active states
- **Secondary Content**: `#fff4ff` - Very light pink for text on pink backgrounds

**Utility Colors**:
- **Success Green**: `#48a437` - Checkmarks, success states (✅)
- **Warning Yellow**: `#a6a23a` - Warning states, caution indicators
- **Error Red**: `#a93a2a` - X marks in comparison table (❌), error states
- **Success Content**: `#002300` - Text on success backgrounds
- **Warning Content**: `#272000` - Text on warning backgrounds
- **Error Content**: `#330000` - Text on error backgrounds

**Neutrals (Dark Mode)** - Primary theme for landing page:
- **Background**: `#1a1a1d` - Main background color (matches manifest theme)
- **Foreground**: `#e6e6e9` - Primary text color (light gray)
- **Border**: `#3e3e40` - Borders, dividers, card outlines
- **Copy**: `#ababae` - Body text, secondary content
- **Copy Light**: `#c5c5c8` - Lighter text, muted content
- **Copy Lighter**: `#e1e1e4` - Lightest text, very muted content

**Neutrals (Light Mode)** - For future light theme variant:
- **Background**: `#a653f6` - Light mode background (purple-tinted)
- **Foreground**: `#ababae` - Light mode foreground
- **Border**: `#d1d1d4` - Light borders
- **Copy**: `#4e4e51` - Dark text on light background
- **Copy Light**: `#6a6a6d` - Medium dark text
- **Copy Lighter**: `#86868a` - Medium gray text

### Color Usage Guide

**Hero Section**:
- Main heading: Gradient from `#540074` (primary purple) to `#e458b9` (secondary pink)
- Background: `#1a1a1d` (dark background)
- Body text: `#e6e6e9` (foreground)

**Buttons**:
- Primary CTA: Background `#540074` (primary purple), text `#ea97ff` (primary content)
- Hover: Background `#9d50bc` (primary light)
- Active: Background `#260048` (primary dark)

**FAQ Comparison Cards**:
- Traditional AI (left): Red X marks using `#a93a2a` (error red)
- Platformless AI (right): Green checkmarks using `#48a437` (success green)
- Cards: Background slightly lighter than `#1a1a1d`, border `#3e3e40`

**Links**:
- Default: `#9d50bc` (primary light)
- Hover: `#e458b9` (secondary pink)
- Visited: `#af1e89` (secondary dark)

### Typography

**Headings**:
- **H1 (Hero Title)**: `text-6xl` (60px), font-weight: 800, line-height: tight
- **H2 (Section Titles)**: `text-4xl` (36px), font-weight: 700
- **H3 (FAQ Questions)**: `text-xl` (20px), font-weight: 600
- **Body**: `text-base` (16px), font-weight: 400, line-height: relaxed

**Font Family**: `Inter` or `system-ui` (clean, modern sans-serif)

### Spacing

- **Section Padding**: `py-16` (64px top/bottom)
- **Container Max Width**: `max-w-7xl` (1280px)
- **Card Padding**: `p-6` (24px)
- **Element Spacing**: `space-y-4` (16px between elements)

### Components (Shadcn UI)

Use these Shadcn UI components:
- **Button**: Primary CTA style
- **Card**: For FAQ columns
- **Accordion**: For FAQ answer display
- **Input**: For search bar
- **Badge**: For "Coming Soon" tag

---

## 📝 Section-by-Section Content

---

### 1. HEADER

**Layout**:
```
┌──────────────────────────────────────────────────────────┐
│ [Logo: "Platformless AI"]              [GitHub] [Docs]   │
└──────────────────────────────────────────────────────────┘
```

**Content**:
- **Logo Text**: "Platformless AI" (use the existing Fabstir logo, or stylized text logo)
- **Right Navigation**:
  - GitHub link → `https://github.com/fabstir-llm-marketplace` (opens in new tab)
  - Docs → "Coming Soon" badge (grayed out or disabled)

**Design Notes**:
- Sticky header (stays at top when scrolling)
- Background: Slightly transparent `#1a1a1d` with blur effect (`backdrop-blur-md`)
- Height: `h-16` (64px)
- Border bottom: Thin line using `#3e3e40` (neutrals border)
- Logo: Use `android-chrome-192x192.png` or `android-chrome-512x512.png`, scaled to 32-40px height
- Link colors: `#9d50bc` (primary light), hover `#e458b9` (secondary pink)

---

### 2. HERO SECTION

**Layout**:
```
┌─────────────────────────────────────────────────────┐
│                                                      │
│              🌐 Platformless AI                     │
│                                                      │
│           AI Without the Platform                   │
│                                                      │
│    Trustless. Private. Censorship-Resistant.        │
│                                                      │
│            [Join Waitlist Button]                   │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**Content**:

**Main Heading** (H1):
```
Platformless AI
```

**Subheading** (H2):
```
AI Without the Platform
```

**Tagline** (Body text):
```
Trustless. Private. Censorship-Resistant.
```

**CTA Button**:
```
[Join Waitlist]
```
- Opens a modal/form to collect email
- Form fields: Name, Email, "I'm interested as: [User/Developer/GPU Provider]"
- Submit button: "Get Early Access"

**Design Notes**:
- Text-align: center
- Vertical padding: `py-24` (96px top/bottom)
- Main heading: Gradient text effect from `#540074` (primary purple) to `#e458b9` (secondary pink)
- Subheading: `#e6e6e9` (foreground) light gray color
- Tagline: Slightly smaller, separated by centered dots, color `#c5c5c8` (copy light)
- Button: Large, background `#540074` (primary purple), text `#ea97ff` (primary content), hover scale effect + color shift to `#9d50bc` (primary light)
- Optional: Subtle animated background (gradient mesh with purple/pink hues)

---

### 3. VALUE PROPOSITION SECTION

**Layout**:
```
┌──────────────────────────────────────────────────────┐
│              What is Platformless AI?                │
│                                                       │
│  ┌────────────────────┐  ┌─────────────────────┐   │
│  │ Traditional AI      │  │ Platformless AI     │   │
│  │ Platforms           │  │                     │   │
│  │                     │  │                     │   │
│  │ ✗ Item 1           │  │ ✓ Item 1            │   │
│  │ ✗ Item 2           │  │ ✓ Item 2            │   │
│  │ ✗ Item 3           │  │ ✓ Item 3            │   │
│  │ ✗ Item 4           │  │ ✓ Item 4            │   │
│  └────────────────────┘  └─────────────────────┘   │
│                                                       │
└──────────────────────────────────────────────────────┘
```

**Content**:

**Section Title** (H2):
```
What is Platformless AI?
```

**Intro Paragraph**:
```
Platformless AI is a decentralized peer-to-peer network for accessing AI models
without trusting a centralized company. Unlike OpenAI, Anthropic, or Google,
there's no platform that can censor your prompts, access your data, or deplatform you.
```

**Two-Column Comparison**:

**Left Column: "Traditional AI Platforms"**
```
❌ Trust the company with your data
❌ Accept their terms and censorship rules
❌ Pay their markup prices
❌ Risk deplatforming
```

**Right Column: "Platformless AI"**
```
✅ End-to-end encryption (your data, your keys)
✅ Smart contract payments (trustless settlement)
✅ P2P model access (no platform gatekeepers)
✅ Open source (verify everything)
```

**Bottom Text**:
```
Built by Fabstir, powered by Base L2, secured by STARK proofs.
```

**Design Notes**:
- Background: Slightly lighter than main background (use `#260048` dark purple for subtle distinction)
- Two columns: Equal width, side-by-side on desktop, stacked on mobile
- Left column: Red X marks using `#a93a2a` (error red), slightly desaturated
- Right column: Green checkmarks using `#48a437` (success green), highlighted
- Cards: Border `#3e3e40` (neutrals border), subtle shadow, hover effect with border color shift to `#9d50bc` (primary light)
- Bottom text: Small, `#ababae` (copy) color, centered

---

### 4. FAQ SECTION

**Layout**:
```
┌────────────────────────────────────────────────────────┐
│                 How can we help?                       │
│                                                         │
│  Search our knowledge base for answers to all your     │
│  questions about Platformless AI                       │
│                                                         │
│     [🔍  Start typing your question...]                │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │ General  │  │  Users   │  │ Hosting  │            │
│  │   FAQ    │  │          │  │          │            │
│  └──────────┘  └──────────┘  └──────────┘            │
│                                                         │
└────────────────────────────────────────────────────────┘
```

**Content**:

**Section Title** (H2):
```
How can we help?
```

**Subtitle**:
```
Search our knowledge base for answers to all your questions about Platformless AI
```

**Search Bar**:
```
Placeholder: "Start typing your question..."
```

**Three FAQ Columns**:

---

#### **Column 1: General FAQ**

1. **What is Platformless AI?**
2. **Why "platformless"?**
3. **How does it work?**
4. **Is my data private?**
5. **What makes this different from OpenAI/Anthropic?**

---

#### **Column 2: Users**

1. **How do I start using Platformless AI?**
2. **What AI models are available?**
3. **Is this cheaper than OpenAI/Anthropic?**
4. **Do I need crypto/wallet to use this?**
5. **What if I need help or have issues?**

---

#### **Column 3: Hosting**

1. **How do I become a GPU provider?**
2. **What hardware do I need?**
3. **How do I get paid for hosting models?**
4. **What are the staking requirements?**
5. **How are payments settled?**

---

**Design Notes**:
- Three equal-width columns (on desktop, stacked on mobile)
- Each column: Card with border `#3e3e40` (neutrals border), padding `p-6`
- Column heading: Bold, larger font, color `#ea97ff` (primary content)
- Question links: Clickable, color `#9d50bc` (primary light), hover underline with color shift to `#e458b9` (secondary pink)
- Clicking a question scrolls to/expands the answer below
- Search bar: Full width, icon on left, rounded corners, background `#260048` (primary dark), text `#e6e6e9` (foreground), border `#3e3e40`

---

### 5. FAQ ANSWERS (Below the columns)

**Layout**:
```
┌──────────────────────────────────────────────────┐
│  [Expanded answer appears here when question     │
│   is clicked]                                    │
│                                                   │
│  Question text appears as heading                │
│  Answer text below in paragraph format           │
│                                                   │
│  [Back to questions ↑]                           │
└──────────────────────────────────────────────────┘
```

**Full FAQ Content**:

---

### **GENERAL FAQ**

---

#### **Q1: What is Platformless AI?**

**Answer**:

Platformless AI is a decentralized peer-to-peer network for accessing AI models without trusting a centralized company.

When you use traditional AI platforms like OpenAI, Anthropic, or Google, you're forced to:
- Trust them with your private data
- Accept their content moderation policies
- Pay their markup prices
- Hope they don't ban your account

Platformless AI eliminates these risks through:

**End-to-End Encryption**: Your prompts and responses are encrypted on your device before being sent. GPU providers, storage nodes, and blockchain observers cannot read your content. Only you hold the decryption keys.

**Smart Contract Payments**: Jobs are assigned and payments are settled automatically via smart contracts on Base L2. No platform takes a cut. No middleman can freeze your funds.

**P2P Model Access**: Connect directly to GPU providers running open-weight models. No centralized platform decides which models you can access or what you can ask them.

**Open Source**: All code is auditable on GitHub. You can verify exactly how encryption works, how payments are processed, and how your data is handled.

**Censorship-Resistant**: No single entity can deplatform you, filter your prompts, or alter your results. The network operates without central control.

Think of it as "Uber for AI" but truly decentralized - no company in the middle, just smart contracts coordinating between users and GPU providers.

---

#### **Q2: Why "platformless"?**

**Answer**:

The word "platformless" captures what makes this approach fundamentally different from traditional AI services.

**The Problem with Platforms**:

Every major AI service today (OpenAI, Anthropic, Google, etc.) is a **platform** - a centralized company that sits between you and the AI models. This creates several problems:

**Trust Requirement**: You must trust the platform won't misuse your data, leak your prompts, or train models on your private conversations.

**Censorship**: Platforms decide what questions you can ask and what answers you receive. They filter "unsafe" content based on their policies, not yours.

**Single Point of Failure**: If the platform goes down, changes its terms, raises prices, or bans your account - you have no recourse.

**Markup Pricing**: Platforms add significant margins on top of compute costs because they're businesses seeking profit.

**Deplatforming Risk**: Your access can be revoked at any time, for any reason, with no appeal process.

**Why "Platformless" Works**:

Platformless AI replaces the centralized platform with:
- **Smart contracts** for coordination (trustless, automated, censorship-resistant)
- **P2P connections** for model access (direct provider-to-user)
- **End-to-end encryption** for privacy (no intermediary can read your data)
- **Decentralized storage** for conversation history (S5 network, not company servers)

The **infrastructure is platformless** - no company controls it, no middleman extracts rent, no gatekeeper decides who can participate.

You still access it via this website (platformlessai.com), but that's just documentation and a UI. The actual AI inference happens peer-to-peer, payments happen via smart contracts, and data storage is decentralized.

**The Paradox Explained**:

"Wait, isn't platformlessai.com itself a platform?"

The website is centralized (DNS, hosting), but it's just a **window into the platformless infrastructure**. If this website disappeared tomorrow, you could still:
- Use the open-source SDK directly
- Deploy your own UI
- Access the same smart contracts and P2P network
- Run your own node

The platform (this website) is **replaceable and optional**. The infrastructure (smart contracts, P2P nodes, encryption) is **platformless and permanent**.

---

#### **Q3: How does it work?**

**Answer**:

Platformless AI coordinates AI inference through smart contracts, peer-to-peer networking, and cryptographic proofs. Here's the end-to-end flow:

**1. Discovery Phase**:
- You browse available models and GPU providers via the SDK
- Smart contracts track which providers are online and their pricing
- You select a model (e.g., TinyLlama, Mistral, etc.) and price point

**2. Payment & Job Creation**:
- You deposit funds (ETH, USDC, or FAB tokens) into a smart contract escrow
- A "job" is created on-chain with your payment, selected model, and encrypted session ID
- Smart contracts assign your job to an available GPU provider

**3. Encrypted Session Initialization**:
- Your device generates a unique encryption key for this session
- The GPU provider's public key is retrieved from the blockchain
- A secure encrypted channel is established (XChaCha20-Poly1305 AEAD)

**4. Inference Request**:
- Your prompt is encrypted on your device before leaving
- Encrypted prompt is sent directly to the GPU provider via WebSocket (P2P)
- Provider receives encrypted data but **cannot read it**

**5. Model Inference**:
- Provider decrypts the prompt using the shared session key
- Model generates a response (e.g., 500 tokens)
- Response is encrypted before being sent back

**6. Proof of Work**:
- Every 1000 tokens, the provider generates a **STARK proof** proving computation occurred
- Proof (~221KB) is stored on **S5 decentralized storage**
- Only the proof hash (32 bytes) is submitted to the blockchain

**7. Payment Settlement**:
- Smart contract verifies the proof hash matches the S5-stored proof
- Payment is automatically released from escrow to the provider
- Any remaining deposit is returned to you

**8. Storage**:
- Your encrypted conversation is stored on **S5** (decentralized storage, like IPFS)
- You can retrieve it later using your private key
- No centralized server stores your data

**Key Technologies**:
- **Base L2**: Ethereum Layer 2 for fast, cheap transactions
- **Smart Contracts**: JobMarketplace, NodeRegistry, ProofSystem (trustless coordination)
- **STARK Proofs**: Risc0 zkVM generates cryptographic proofs of computation
- **S5 Storage**: Decentralized content-addressed storage (powered by Sia)
- **XChaCha20-Poly1305**: Military-grade authenticated encryption
- **WebSocket**: Real-time bidirectional communication for streaming responses

**What You Don't Need**:
- ❌ No account signup
- ❌ No email/phone verification
- ❌ No KYC
- ❌ No API keys (that can be revoked)
- ❌ No credit card

**What You Do Need**:
- ✅ Ethereum wallet (MetaMask, WalletConnect, etc.)
- ✅ Small amount of ETH on Base L2 (for gas fees)
- ✅ Payment tokens (ETH, USDC, or FAB)

---

#### **Q4: Is my data private?**

**Answer**:

**Yes - end-to-end encryption by default.** Your prompts and responses are encrypted before leaving your device, and only you hold the decryption keys.

**What "End-to-End Encryption" Means**:

Traditional AI platforms see everything you send them in plaintext:
- Your prompts (input)
- Model responses (output)
- Conversation history
- Usage patterns

They claim to protect your data, but you must **trust them** to keep that promise.

Platformless AI uses **cryptographic end-to-end encryption** where:
- Encryption happens **on your device** (not the server)
- Only **you** have the decryption key
- GPU providers, storage nodes, and blockchain observers see **only encrypted data**

**Encryption Details**:

**Algorithm**: XChaCha20-Poly1305 AEAD (Authenticated Encryption with Associated Data)
- Same encryption used by Signal, WireGuard, and Zcash
- Immune to timing attacks, prevents tampering
- Includes authentication (proves data wasn't modified in transit)

**Key Exchange**: Ephemeral-Static ECDH (Elliptic Curve Diffie-Hellman)
- Your device generates a unique encryption key for each session
- Keys are exchanged using the GPU provider's public key (from blockchain)
- Even if long-term keys are compromised, past sessions remain secure (forward secrecy)

**Session Keys**: Fresh keys for every conversation
- Generated randomly (32 bytes of entropy)
- Stored in memory only (never written to disk)
- Discarded when session ends

**What This Protects Against**:

✅ **Eavesdropping**: Network intermediaries (ISPs, VPN providers) see encrypted data
✅ **Data Leaks**: Even if S5 storage is breached, conversations are encrypted
✅ **Malicious Nodes**: GPU providers cannot read your prompts
✅ **Blockchain Analysis**: On-chain data shows only hashes, not content
✅ **Subpoenas/Warrants**: No plaintext data exists to hand over

**What This Doesn't Protect**:

❌ **Your Device**: If your device is compromised (malware, keylogger), encryption can't help
❌ **GPU Provider Metadata**: Providers know your IP address, session duration, token count
❌ **Blockchain Metadata**: Transaction history (job IDs, payment amounts) is public

**Comparison to Other Services**:

| Service | Data Privacy | Trust Model |
|---------|--------------|-------------|
| **OpenAI/Anthropic** | No E2E encryption | Trust the company |
| **Local LLMs** | Fully private | Trust yourself |
| **Platformless AI** | E2E encrypted | Cryptographic proofs (trustless) |

**Verifying Encryption**:

You can verify encryption is working by:
1. Inspecting WebSocket traffic (browser DevTools) - you'll see encrypted messages
2. Checking S5 storage - conversation data is ciphertext
3. Reviewing blockchain transactions - only hashes are submitted
4. Auditing the open-source code on GitHub

**Performance Impact**:

Encryption overhead is negligible:
- Session initialization: ~10ms (one-time)
- Per-message encryption: <1ms
- Per-message decryption: <1ms

Compare this to model inference (500ms - 5sec) and network latency (20-100ms). The security benefits far outweigh the minimal performance cost.

---

#### **Q5: What makes this different from OpenAI/Anthropic?**

**Answer**:

The fundamental difference is **who controls your AI experience**: a centralized company vs. trustless smart contracts.

**Detailed Comparison**:

| Feature | Traditional Platforms (OpenAI, Anthropic) | Platformless AI |
|---------|-------------------------------------------|----------------|
| **Data Privacy** | Company sees all prompts/responses | End-to-end encrypted, only you have keys |
| **Censorship** | Platform filters "unsafe" content | Censorship-resistant, no gatekeeper |
| **Account Control** | Can ban/suspend your account anytime | Wallet-based access, no accounts to ban |
| **Pricing** | Platform sets prices + markup | Competitive P2P pricing, no middleman |
| **Model Access** | Limited to platform's approved models | Any open-weight model providers host |
| **Data Storage** | Company servers (terms can change) | S5 decentralized storage (you control) |
| **API Keys** | Can be revoked, rate-limited | No API keys (wallet-based auth) |
| **Trust Model** | Must trust company promises | Cryptographic proofs (trustless) |
| **Verification** | Closed source, can't verify claims | Open source, audit everything |
| **Deplatforming** | One email and you're banned | Impossible to deplatform |
| **Content Policy** | Must accept their terms | No terms to accept |
| **Intermediary** | Company sits between you and models | Peer-to-peer direct access |
| **Single Point of Failure** | Platform down = service unavailable | Decentralized (no single point of failure) |

**Real-World Scenarios Where This Matters**:

**Scenario 1: Political/Sensitive Research**
- **Traditional Platform**: Your prompts about controversial topics may be flagged, filtered, or reported.
- **Platformless AI**: End-to-end encryption means no one can see what you're researching.

**Scenario 2: Business/Proprietary Data**
- **Traditional Platform**: Your company's confidential data is sent to OpenAI servers in plaintext.
- **Platformless AI**: Data is encrypted before leaving your infrastructure. GPU providers cannot access it.

**Scenario 3: Terms Change**
- **Traditional Platform**: OpenAI changes pricing, adds usage restrictions, or discontinues a feature. You have no choice but to accept.
- **Platformless AI**: Smart contracts enforce terms. Providers can't unilaterally change the agreement.

**Scenario 4: Account Termination**
- **Traditional Platform**: Your account is banned (false positive, policy change, etc.). You lose access to all conversation history.
- **Platformless AI**: Wallet-based access means no "account" to ban. Your encrypted history is stored on S5 under your control.

**Who Should Use Platformless AI?**

✅ **Privacy-conscious users**: Journalists, lawyers, healthcare professionals
✅ **Researchers**: Sensitive topics, controversial questions
✅ **Businesses**: Proprietary data that can't be sent to third parties
✅ **Developers**: Building on open protocols without vendor lock-in
✅ **Crypto natives**: Already have wallets, value trustlessness
✅ **Censorship targets**: Regions with internet restrictions

**Who Might Prefer Traditional Platforms?**

- **Non-technical users**: No wallet, no crypto, just want to chat
- **Enterprise SLAs**: Need 99.9% uptime guarantees, support contracts
- **Frontier models**: OpenAI o1, Claude Opus (not yet available decentralized)
- **Zero crypto involvement**: Don't want to acquire ETH/USDC

**Bottom Line**:

Traditional platforms optimize for **convenience and ease of use**.
Platformless AI optimizes for **privacy, censorship-resistance, and trustlessness**.

If you're comfortable trusting OpenAI/Anthropic with your data, traditional platforms may be simpler. But if you value privacy, sovereignty, and open infrastructure - Platformless AI is the only option that delivers on those promises with cryptographic guarantees.

---

### **USERS FAQ**

---

#### **Q1: How do I start using Platformless AI?**

**Answer**:

Platformless AI is currently in **beta**. Here's how to get started once it launches:

**Step 1: Get a Crypto Wallet**

You'll need an Ethereum-compatible wallet to interact with smart contracts:

**Browser Wallets** (easiest for beginners):
- **MetaMask**: Most popular, browser extension
- **Rainbow Wallet**: Mobile-first, great UX
- **Coinbase Wallet**: If you already use Coinbase

**Download**: Visit metamask.io and install the browser extension
**Setup**: Create a new wallet, **securely store your seed phrase** (12/24 words)
**⚠️ Critical**: Never share your seed phrase with anyone. This is your master password.

**Step 2: Get ETH on Base L2**

You need a small amount of ETH on Base L2 (Ethereum Layer 2) for:
- Gas fees (transaction costs, ~$0.01 per transaction)
- Payments to GPU providers (or use USDC/FAB tokens)

**Option A - Bridge from Ethereum Mainnet**:
1. Visit bridge.base.org
2. Connect your wallet
3. Bridge ETH from Ethereum mainnet → Base L2
4. Wait ~5 minutes for confirmation

**Option B - Buy Directly on Base**:
1. Use Coinbase (supports Base natively)
2. Buy ETH or USDC
3. Withdraw to your wallet on Base L2 network

**Option C - Use a Faucet (Testnet Only)**:
- For Base Sepolia testnet: Visit faucet.quicknode.com
- Get free test ETH to experiment (not real money)

**Step 3: Visit Platformless AI**

Once you have a wallet and ETH on Base:
1. Go to **platformlessai.com**
2. Click **"Connect Wallet"**
3. Approve the connection (this doesn't cost anything)

**Step 4: Browse Models & Providers**

The UI will show:
- Available models (TinyLlama, Mistral, etc.)
- GPU providers (location, uptime, pricing)
- Estimated cost per 1000 tokens

Select a model and provider based on:
- **Price**: Lower cost per token
- **Latency**: Geographic proximity (lower ping)
- **Reputation**: Host uptime, completed jobs

**Step 5: Start a Conversation**

1. Deposit funds into escrow (e.g., $1 worth of ETH/USDC)
2. Start chatting with the AI model
3. Responses stream in real-time (like ChatGPT)
4. Encryption happens automatically (you don't have to do anything)

**Step 6: Your Conversations are Saved**

All conversations are:
- Encrypted with your wallet's key
- Stored on S5 decentralized storage
- Accessible anytime you reconnect your wallet

**Developer Path**:

If you're a developer, you can use the SDK directly:

```bash
npm install @fabstir/sdk-core
```

See docs at **docs.platformlessai.com** (coming soon) or GitHub README.

**Beta Access**:

We're currently in private beta. To get early access:
1. Join the waitlist on this page
2. Join our Discord/Telegram community
3. Follow updates on Twitter/X

**When does it launch?**

Public beta: **Q1 2025** (targeting January/February)

**What if I need help?**

- Discord: Real-time community support
- GitHub Issues: Bug reports, feature requests
- Documentation: Comprehensive guides at docs.platformlessai.com

---

#### **Q2: What AI models are available?**

**Answer**:

Platformless AI supports **open-weight models** in GGUF format that GPU providers choose to host. Unlike closed platforms (OpenAI, Anthropic), model availability is determined by the decentralized marketplace, not a single company.

**Currently Available Models** (Beta):

**Small/Fast Models**:
- **TinyLlama 1.1B**: Ultra-fast, cheap, good for simple tasks
- **TinyVicuna 1B**: Similar performance, optimized for chat

**These are primarily for testing during beta. Larger models will be added as the network scales.**

**Coming Soon** (Post-Beta):

**7B Parameter Models**:
- **Mistral 7B**: High-quality open model, excellent reasoning
- **Llama 3 8B**: Meta's latest, strong performance
- **Gemma 7B**: Google's open model

**13B+ Parameter Models**:
- **Llama 3 70B**: Approaching GPT-4 level quality
- **Mixtral 8x7B**: Mixture-of-experts model (efficient)

**Specialized Models**:
- **Code models**: CodeLlama, StarCoder
- **Multilingual**: BLOOM, mGPT
- **Uncensored variants**: Versions without RLHF safety tuning

**Why GGUF Format?**

GGUF (GPT-Generated Unified Format) is optimized for:
- ✅ Efficient CPU/GPU inference
- ✅ Quantization (4-bit, 5-bit, 8-bit)
- ✅ Fast loading times
- ✅ Cross-platform compatibility

Most open models can be converted to GGUF using `llama.cpp` tools.

**Model Governance**:

Models must be **approved** by the ModelRegistry smart contract before providers can host them. This prevents:
- ❌ Malicious models (malware, data exfiltration)
- ❌ Copyright-infringing models
- ❌ Models pretending to be others (fake "GPT-4")

Approval process:
1. Community proposes a model (model name + hash)
2. Governance vote (FAB token holders)
3. If approved, model is added to registry
4. Providers can stake and host it

**How Providers Choose Models**:

GPU providers select models based on:
- **Demand**: Popular models earn more
- **Hardware**: Larger models need more VRAM
- **Profitability**: Balance compute cost vs. market pricing

**What You CAN'T Access** (Yet):

❌ **Closed models**: GPT-4, Claude Opus, Gemini Pro (API-only)
❌ **Very large models**: 100B+ parameter models (hardware limitations)
❌ **Proprietary models**: OpenAI's, Anthropic's models (not open)

**Future: Multi-Modal Models**:

Planned support for:
- **Image generation**: Stable Diffusion, FLUX
- **Vision models**: LLaVA, GPT-4 Vision clones
- **Audio/TTS**: Whisper, Bark, Coqui TTS

**How to Request a Model**:

1. Check if the model exists in GGUF format
2. Propose it via governance forum
3. Community votes on approval
4. Once approved, providers can host it

**Search for Models**:

In the UI, you can filter by:
- **Size**: 1B, 7B, 13B, 70B parameters
- **Type**: Chat, code, multilingual
- **Quantization**: 4-bit, 8-bit, full precision
- **Provider**: Which hosts are running it

**Pricing by Model Size** (Market-Determined Rates):

Larger models cost more per token due to higher compute requirements. GPU providers set their own prices:

- **1B models**: ~$0.10 - $0.30 per 1M tokens (input) / ~$0.40 - $1.00 (output)
- **7B models**: ~$0.50 - $1.50 per 1M tokens (input) / ~$2.00 - $5.00 (output)
- **70B models**: ~$2.00 - $5.00 per 1M tokens (input) / ~$8.00 - $15.00 (output)

**Realistic Pricing Expectations**: Platformless AI will be **10-30% more expensive** than subsidized providers like Groq or Together AI, but offers unique value through privacy, censorship-resistance, and trustless verification that centralized platforms cannot provide.

---

#### **Q3: Is this cheaper than OpenAI/Anthropic?**

**Answer**:

**Platformless AI offers competitive pricing**, but the real value comes from what centralized platforms can't provide:

**Value-Added Features**:
- ✅ **Privacy**: End-to-end encryption (they can't read your prompts)
- ✅ **Censorship-Resistance**: No content filtering, no banned topics
- ✅ **Trustless Verification**: Cryptographic proofs of computation
- ✅ **No Account Lock-In**: Wallet-based access, can't be banned
- ✅ **Transparent Pricing**: See exactly what GPU providers charge
- ✅ **Open Source**: Audit everything, no black boxes

**Honest Price Comparison** (October 2025 Market Rates):

| Service | Price per 1M Tokens | Notes |
|---------|---------------------|-------|
| **OpenAI GPT-4o** | $2.50 / $10.00 | Premium flagship model |
| **Claude Sonnet 4.5** | $3.00 / $15.00 | Premium intelligence |
| **Claude Haiku 4.5** | $1.00 / $5.00 | Fast, lightweight |
| **Gemini 2.5 Flash** | $0.30 / $2.50 | Google's competitive tier |
| **Groq Llama 3.1 8B** | $0.05 / $0.08 | Open-source infrastructure |
| **Together AI (7B)** | $0.30 - $0.90 | Open-source marketplace |
| **Platformless AI (7B)** | ~$0.50 - $1.50* | *Market-determined by GPU providers |
| **Platformless AI (70B)** | ~$2.00 - $5.00* | *Competitive with mid-tier providers |

***Pricing is set by GPU providers in marketplace, not by platform. Expect similar rates to other open-source infrastructure providers.**

**Why You Won't Get the Cheapest Price**:

Platformless AI likely won't beat Groq, Together AI, or AWS Bedrock on pure cost:
- ❌ No VC subsidies (competitors operate at a loss for market share)
- ❌ Smaller scale than centralized infrastructure (no volume discounts)
- ❌ GPU providers set their own prices (marketplace dynamics)
- ❌ Network fee adds 10% to all payments

**Why You Might Choose Platformless AI Anyway**:

The value proposition isn't about being cheapest—it's about what you **can't buy** from centralized platforms:
- ✅ **Privacy**: End-to-end encryption (they literally can't read your prompts)
- ✅ **Censorship-Resistance**: No content filtering, no banned topics
- ✅ **No Account Lock-In**: Wallet-based, can't be deplatformed
- ✅ **Trustless Verification**: Cryptographic proofs of computation
- ✅ **Transparent Pricing**: See exactly what GPU providers charge
- ✅ **No Terms Changes**: Smart contracts are immutable code

**Centralized platforms have real advantages:**
- Lower prices (economies of scale, VC funding)
- Better performance (optimized infrastructure)
- Easier to use (no crypto wallet needed)
- More reliable (24/7 support teams)

**The Real Question**: Would you pay a **moderate premium** (10-30% more) for privacy and censorship-resistance?

**Use Cases Where Platformless AI Excels**:

**1. Sensitive Business Use**:
- Trading firms (strategy protection)
- Healthcare (HIPAA compliance)
- Legal (attorney-client privilege)
- **Value**: Privacy worth premium vs centralized platforms

**2. Controversial/Censored Content**:
- Research on sensitive topics
- Politically controversial discussions
- Adult content generation
- **Value**: Censorship-resistance unavailable elsewhere

**3. Trustless Verification Needs**:
- Auditable AI decisions (legal compliance)
- Provable computation for disputes
- Regulatory compliance (ISO 27001, SOC 2)
- **Value**: Cryptographic proofs no centralized platform offers

**Additional Costs**:

**Gas Fees** (Base L2):
- Job creation: ~$0.01 per session
- Proof verification: ~$0.005 per checkpoint
- Total: ~$0.02 per session (negligible)

**Network Fee** (10%):
- Goes to protocol treasury for ongoing development
- Hosts earn 90% of all payments
- Already included in provider pricing

**No Hidden Fees**:
- ❌ No subscription required
- ❌ No minimum spend
- ❌ No rate limits (pay-per-use)
- ❌ No API key fees

**Prepaid vs. Pay-As-You-Go**:

You can:
- **Deposit funds once**: Use until balance depleted
- **Top up as needed**: No commitment
- **Automatic refunds**: Unused deposit returned

**Price Discovery**:

Providers set their own pricing based on:
- Hardware costs (GPU depreciation, electricity)
- Competitive landscape (undercut rivals)
- Demand (popular models cost more)

Users choose providers by price, creating **market-driven pricing**.

**Will Prices Stay Low?**

Market forces will keep prices competitive:
- ✅ Low barriers to entry (anyone can be a provider)
- ✅ No platform lock-in (users switch providers easily)
- ✅ Transparent pricing (all rates visible on-chain)

As GPU hardware becomes cheaper (Moore's Law), prices will likely **decrease further over time**.

**Quality vs. Price**:

Cheaper doesn't mean worse:
- **Same models**: Open-weight models perform identically wherever they run
- **Same quality**: 7B Mistral on Platformless AI = 7B Mistral anywhere else
- **Lower overhead**: Decentralization reduces waste, not quality

---

#### **Q4: Do I need crypto/wallet to use this?**

**Answer**:

**Yes, currently.** Platformless AI requires:
1. An Ethereum-compatible wallet (MetaMask, Rainbow, etc.)
2. ETH or USDC on Base L2 (for payments and gas fees)

**Why a Wallet is Required**:

**Authentication**: Your wallet is your identity. No usernames, passwords, or accounts to manage.

**Payments**: Smart contracts need to know where to deduct funds from and refund unused deposits.

**Encryption Keys**: Your wallet's private key is used to generate encryption keys for securing conversations.

**Proof of Ownership**: Only you can access your encrypted conversation history (tied to your wallet).

**Do I Need to Be a "Crypto Expert"?**

**No.** Basic wallet usage is similar to using Venmo or PayPal:
1. Install MetaMask (5 minutes)
2. Buy $10-20 of ETH on Coinbase
3. Withdraw to your MetaMask wallet on Base L2
4. Connect wallet to Platformless AI

Most users learn this in **under 30 minutes**.

**Future: Fiat On-Ramp**:

We're exploring integrations to make this easier:
- **Credit card purchases**: Buy ETH/USDC directly in the UI (via Moonpay, Ramp)
- **Gasless transactions**: Smart wallets that sponsor gas fees
- **Email-based wallets**: Privy, Magic Link (wallet in the background)

These are planned for **post-MVP** but not yet available.

**What About Privacy?**

Crypto wallets are **pseudonymous**:
- Your wallet address (e.g., `0xABC123...`) is public on the blockchain
- It's not directly tied to your real identity (no KYC)
- However, if you buy crypto on Coinbase (KYC exchange), your address can be linked to you

**For maximum privacy**:
1. Buy crypto with cash (LocalBitcoins, Bitcoin ATM)
2. Use a privacy coin (Monero) to swap for ETH
3. Create a fresh wallet for Platformless AI (not used elsewhere)

**Can I Use This Without Touching Crypto?**

**Not yet.** The architecture fundamentally relies on:
- Smart contracts (requires on-chain transactions)
- Wallet-based encryption (requires private key)
- Trustless payments (requires blockchain settlement)

If you're uncomfortable with crypto, traditional AI platforms (OpenAI, Anthropic) may be more suitable for now.

**Beta Testing Without Real Funds**:

You can experiment on **Base Sepolia testnet** (fake ETH):
1. Get free test ETH from faucet
2. Connect to testnet in MetaMask
3. Try Platformless AI without risking real money

**Help for Beginners**:

We provide guides for:
- Setting up MetaMask step-by-step
- Buying your first crypto on Coinbase
- Bridging to Base L2
- Troubleshooting common wallet issues

Join our Discord for live support from the community.

---

#### **Q5: What if I need help or have issues?**

**Answer**:

Platformless AI is open-source and community-driven. Here's how to get help:

**1. Documentation** (First Stop)

**docs.platformlessai.com** (coming soon)
- Getting started guide
- Troubleshooting common issues
- SDK API reference
- FAQ (extended version of this page)

**2. Discord Community** (Real-Time Help)

Join our Discord server:
- **#support channel**: Ask questions, get help from community
- **#general**: Discuss the project, share experiences
- **#developers**: Technical discussions, SDK help
- **#hosting**: For GPU providers

Typical response time: **Under 1 hour** (during active hours)

**3. GitHub Issues** (Bug Reports)

If you encounter a bug or want to request a feature:
- Visit: github.com/fabstir-llm-marketplace
- Open an issue with:
  - What you tried to do
  - What happened (include error messages)
  - Your browser/OS version
  - Transaction hash (if on-chain issue)

**4. Email Support** (For Sensitive Issues)

For privacy-sensitive issues or security concerns:
- support@fabstir.com
- Response time: 24-48 hours

**5. Community Forum** (Async Discussions)

For longer-form discussions:
- forum.platformlessai.com (coming soon)
- Topics: governance, model proposals, feature requests

**Common Issues & Quick Fixes**:

**Issue: "Wallet won't connect"**
- ✅ Make sure you're on Base L2 network (not Ethereum mainnet)
- ✅ Try refreshing the page
- ✅ Disable other wallet extensions (conflicts)

**Issue: "Transaction failed"**
- ✅ Check you have enough ETH for gas (~$0.02)
- ✅ Try increasing gas limit in MetaMask (advanced settings)
- ✅ Wait 30 seconds and retry

**Issue: "Model not responding"**
- ✅ Check GPU provider status (may be offline)
- ✅ Try a different provider
- ✅ Check Discord for network status updates

**Issue: "Conversations not loading"**
- ✅ Verify you're connected with the same wallet
- ✅ Check S5 network status
- ✅ Try exporting conversations (backup feature)

**What We DON'T Have** (vs. Traditional Platforms):

❌ Phone support (too centralized)
❌ Live chat (no company to staff it)
❌ SLA guarantees (decentralized = no central authority)
❌ Refund department (smart contracts are immutable)

**What We DO Have**:

✅ Transparent on-chain data (verify everything yourself)
✅ Open-source code (audit, fork, fix bugs yourself)
✅ Active community (hundreds of users helping each other)
✅ Developer-friendly (SDK, docs, examples)

**Emergency Situations**:

**Security Issue**: Report privately to security@fabstir.com (bug bounty available)

**Smart Contract Bug**: Contact core team immediately on Discord (ping `@core-team`)

**Lost Funds**: Check blockchain explorer (BaseScan) to trace your transaction. Funds may be in escrow (refundable).

**When to Expect a Response**:

| Channel | Response Time | Best For |
|---------|---------------|----------|
| **Discord #support** | <1 hour | Urgent help, quick questions |
| **GitHub Issues** | 1-3 days | Bug reports, feature requests |
| **Email** | 24-48 hours | Private/sensitive issues |
| **Forum** | 1-7 days | Long-form discussions |

**Contributing**:

If you figure out a solution to an issue:
- Share it on Discord (help others)
- Open a Pull Request on GitHub (improve docs)
- Write a blog post (earn community kudos)

Platformless AI is **community-driven** - your contributions make the platform better for everyone.

---

### **HOSTING FAQ**

---

#### **Q1: How do I become a GPU provider?**

**Answer**:

Becoming a GPU provider (host) on Platformless AI allows you to monetize your spare GPU compute by running AI models for users. Here's the complete process:

**Prerequisites**:

**Hardware Requirements**:
- **GPU**: NVIDIA GPU with ≥8GB VRAM (RTX 3060 minimum, RTX 4090 ideal)
- **RAM**: ≥16GB system RAM (32GB+ recommended)
- **Storage**: ≥100GB free SSD space (for models)
- **Internet**: Stable connection with ≥50 Mbps upload speed
- **OS**: Linux (Ubuntu 22.04+ recommended) or Windows with WSL2

**Software Requirements**:
- **Docker**: For running the Fabstir LLM Node
- **CUDA Drivers**: NVIDIA CUDA 12.0+ for GPU acceleration
- **Ethereum Wallet**: With private key (for signing transactions)

**Step-by-Step Setup**:

**1. Install Fabstir LLM Node**

```bash
# Download the node software
wget https://github.com/fabstir-llm-marketplace/releases/fabstir-llm-node-v8.1.2.tar.gz

# Verify checksum (security)
sha256sum fabstir-llm-node-v8.1.2.tar.gz
# Should match: 31b4b28eb07fa761d8edba9af075f4fc230b5e5d47bdc3432a71c29feb23da9f

# Extract
tar -xzf fabstir-llm-node-v8.1.2.tar.gz
cd fabstir-llm-node
```

**2. Download AI Model**

Choose a model to host (based on your GPU):

```bash
# For 8GB VRAM (TinyLlama)
wget https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf

# For 16GB VRAM (Mistral 7B)
wget https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf

# For 24GB+ VRAM (Llama 3 70B)
wget https://huggingface.co/TheBloke/Llama-3-70B-Instruct-GGUF/resolve/main/llama-3-70b-instruct.Q4_K_M.gguf
```

**3. Configure Environment**

Create `.env` file with your settings:

```bash
# Your wallet private key (KEEP SECRET!)
HOST_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE

# Your wallet address (public)
HOST_ADDRESS=0xYOUR_WALLET_ADDRESS_HERE

# Model configuration
MODEL_PATH=./models/mistral-7b-instruct-v0.2.Q4_K_M.gguf
MODEL_NAME=TheBloke/Mistral-7B-Instruct-v0.2-GGUF:mistral-7b-instruct-v0.2.Q4_K_M.gguf

# Pricing (in smallest unit: 100 = $0.0001 per token)
PRICE_PER_1K_TOKENS=2000  # $0.002 per 1K tokens

# Base L2 RPC endpoint
RPC_URL=https://sepolia.base.org
CHAIN_ID=84532

# Contract addresses (from .env.test)
CONTRACT_JOB_MARKETPLACE=0xYOUR_CONTRACT_ADDRESS
CONTRACT_NODE_REGISTRY=0xYOUR_REGISTRY_ADDRESS

# Node configuration
NODE_PORT=8080
WS_PORT=8080
```

**4. Register Your Host On-Chain**

Use the Host CLI tool to register:

```bash
# Register with staking (requires FAB tokens)
./fabstir-host-cli register \
  --model "TheBloke/Mistral-7B-Instruct-v0.2-GGUF:mistral-7b-instruct-v0.2.Q4_K_M.gguf" \
  --stake 100 \
  --price 2000

# This will:
# 1. Stake 100 FAB tokens (refundable when you unregister)
# 2. Set your price to $0.002 per 1K tokens
# 3. Register your public key on-chain
# 4. Make you visible in the marketplace
```

**5. Start the Node**

```bash
# Run in Docker (recommended)
docker run -d \
  --gpus all \
  --name fabstir-node \
  --env-file .env \
  -p 8080:8080 \
  fabstir-llm-node:latest

# Or run directly (if you built from source)
./fabstir-llm-node
```

**6. Verify Node is Running**

Check health endpoint:

```bash
curl http://localhost:8080/health
# Should return: {"status":"healthy","version":"v8.1.2","model":"Mistral-7B"}
```

Check on-chain status:

```bash
./fabstir-host-cli status
# Should show: "Status: Active, Jobs Completed: 0, Earnings: 0 USDC"
```

**7. Monitor Your Node**

Watch logs for incoming jobs:

```bash
docker logs -f fabstir-node
```

You'll see:
- `📥 New job received: jobId=12345`
- `🔐 Generating STARK proof...`
- `✅ Job completed, earning 0.15 USDC`

**8. Withdraw Earnings**

Accumulated earnings are automatically deposited to your wallet via smart contracts. You can withdraw anytime:

```bash
./fabstir-host-cli withdraw --amount 10.0
# Withdraws 10 USDC to your wallet (minus gas fee)
```

**Ongoing Maintenance**:

- **Keep node running**: Use Docker restart policies or systemd
- **Monitor uptime**: Downtime reduces your reputation score
- **Update models**: Add more models to increase job opportunities
- **Upgrade software**: Install new node versions when released

**Expected Earnings**:

Depends on:
- **GPU specs**: Faster GPUs complete jobs quicker (more jobs per hour)
- **Model size**: Larger models earn more per token (but fewer jobs)
- **Uptime**: 99%+ uptime gets priority job assignment
- **Pricing**: Competitive pricing attracts more users

**Example**:
- **RTX 4090 running Mistral 7B**
- **95% uptime**
- **Pricing: $0.002 per 1K tokens**
- **Estimated earnings**: $50-200/month (depending on network demand)

**Risks**:

- **Staked tokens**: If you misbehave (fake proofs, go offline without unregistering), you can be slashed (lose stake)
- **Electricity costs**: GPU power consumption (~300W for RTX 4090)
- **Hardware depreciation**: GPU wear and tear

**Support**:

Join **Discord #hosting channel** for help with:
- Setup issues
- Performance optimization
- Earnings questions
- Hardware recommendations

---

#### **Q2: What hardware do I need?**

**Answer**:

GPU requirements vary by model size. Here's a comprehensive breakdown:

**Minimum Specifications** (Entry-Level):

**GPU**: NVIDIA RTX 3060 (12GB VRAM)
- Can run: 1B-3B parameter models (TinyLlama, Vicuna 1B)
- Performance: ~50 tokens/sec
- Estimated earnings: $20-50/month

**System RAM**: 16GB DDR4
**Storage**: 100GB SSD (for models + proofs)
**Internet**: 50 Mbps upload (consistent, low latency)
**Power Supply**: 650W (to handle GPU load)

**Recommended Specifications** (Mid-Tier):

**GPU**: NVIDIA RTX 4070 Ti (12GB VRAM) or RTX 3090 (24GB VRAM)
- Can run: 7B-13B parameter models (Mistral 7B, Llama 3 8B)
- Performance: ~150 tokens/sec
- Estimated earnings: $100-300/month

**System RAM**: 32GB DDR4/DDR5
**Storage**: 500GB NVMe SSD (faster proof generation)
**Internet**: 100 Mbps upload
**Power Supply**: 850W

**Optimal Specifications** (High-End):

**GPU**: NVIDIA RTX 4090 (24GB VRAM) or A100 (40GB VRAM)
- Can run: 13B-70B parameter models (Llama 3 70B, Mixtral 8x7B)
- Performance: ~300 tokens/sec (RTX 4090), ~500 tokens/sec (A100)
- Estimated earnings: $300-1000/month

**System RAM**: 64GB+ DDR5
**Storage**: 1TB+ NVMe SSD (multiple models)
**Internet**: 500 Mbps+ upload (gigabit fiber ideal)
**Power Supply**: 1000W+ (dual PSU for A100)

**GPU Comparison Table**:

| GPU Model | VRAM | Max Model Size | Tokens/Sec | Power Draw | Est. Monthly Earnings |
|-----------|------|----------------|------------|------------|-----------------------|
| **RTX 3060** | 12GB | 3B (Q4) | ~50 | 170W | $20-50 |
| **RTX 3070** | 8GB | 3B (Q4) | ~60 | 220W | $25-60 |
| **RTX 3080** | 10GB | 7B (Q4) | ~100 | 320W | $50-120 |
| **RTX 3090** | 24GB | 13B (Q4) | ~120 | 350W | $70-180 |
| **RTX 4070 Ti** | 12GB | 7B (Q4) | ~150 | 285W | $80-200 |
| **RTX 4080** | 16GB | 13B (Q4) | ~200 | 320W | $120-300 |
| **RTX 4090** | 24GB | 70B (Q4) | ~300 | 450W | $200-600 |
| **A100** | 40GB | 70B (Q4) | ~500 | 400W | $400-1200 |
| **H100** | 80GB | 100B+ (Q4) | ~800 | 700W | $800-2000 |

**Q4 = 4-bit quantization** (most common for efficient inference)

**Why NVIDIA Only?**

Currently, the node software requires:
- **CUDA**: NVIDIA's parallel computing platform
- **Risc0 CUDA acceleration**: For fast STARK proof generation

**AMD and Intel GPUs** are not yet supported (but planned for future releases).

**CPU-Only Hosting?**

**Not recommended.** While the node can run on CPU:
- ❌ Inference is 10-50x slower
- ❌ Proof generation takes 10-60 seconds (vs. 0.2-2 sec on GPU)
- ❌ You'll be outcompeted by GPU providers

CPU-only is fine for **testing** but not profitable for production.

**Can I Use Multiple GPUs?**

**Yes** (experimental). You can:
- Run multiple nodes on different ports (one per GPU)
- Register each as a separate host
- Earnings are independent per GPU

**Cloud GPU Providers**:

If you don't own hardware, you can rent:

| Provider | GPU Options | Cost | Profitable? |
|----------|-------------|------|-------------|
| **Vast.ai** | RTX 4090 | ~$0.40/hr | ✅ Yes ($12/day, earn $15-20/day) |
| **RunPod** | A100 | ~$1.00/hr | ✅ Yes ($24/day, earn $30-40/day) |
| **AWS** | A100 | ~$4.00/hr | ❌ No (too expensive) |
| **Lambda Labs** | RTX 4090 | ~$0.50/hr | ⚠️ Break-even |

**Profitability depends on network demand.** During high-demand periods, cloud GPUs can be profitable.

**Storage Requirements**:

- **Models**: 2-15GB per model (GGUF format)
- **Proofs**: ~221KB per checkpoint (1000 tokens)
- **Logs**: ~100MB per day

**Total**: 100GB minimum, 500GB+ recommended if hosting multiple models.

**Internet Requirements**:

**Upload Speed**: Most critical (sending responses to users)
- Minimum: 50 Mbps (for 7B models)
- Recommended: 100 Mbps+ (for 70B models)

**Latency**: Low latency improves reputation
- Under 50ms to nearest users = ideal
- Over 200ms = users may choose other providers

**Data Usage**:
- ~1-5 GB per day (depending on job volume)
- Unlimited data plan recommended

**Power and Cooling**:

**Power Draw**:
- RTX 4090: ~450W under load
- Plus system (CPU, RAM, etc.): ~150W
- Total: ~600W (~$50/month electricity at $0.12/kWh)

**Cooling**:
- Ensure good airflow (GPU temps under 80°C)
- Noisy fans during jobs (consider datacenter/basement placement)

**Profitability Calculation**:

**Example: RTX 4090 Hosting Mistral 7B**

**Costs**:
- Electricity: $50/month (~600W @ $0.12/kWh)
- Internet: $0 (assuming existing connection)
- Hardware depreciation: ~$100/month (amortized over 2 years)

**Revenue**:
- Jobs: ~500K tokens/day (average)
- Pricing: $0.002 per 1K tokens
- Earnings: ~$30/day = $900/month

**Profit**: $900 - $50 - $100 = **$750/month**

**ROI**: 18 months to break even on hardware ($1,600 GPU cost)

**Important Notes**:
- Earnings vary with network demand
- Early providers earn more (less competition)
- Reputation system rewards consistency

---

#### **Q3: How do I get paid for hosting models?**

**Answer**:

Payments are **automatic and trustless** via smart contracts. Here's the complete payment flow:

**1. User Creates a Job**

- User deposits funds (e.g., 10 USDC) into JobMarketplace escrow contract
- Smart contract creates a job with:
  - `jobId`: Unique identifier
  - `maxTokens`: 10,000 tokens requested
  - `pricePerToken`: 0.000002 USDC (your rate)
  - `escrowAmount`: 10 USDC (locked)

**2. Job is Assigned to You**

- Smart contract checks available hosts:
  - Model match (you're running Mistral 7B, user requested Mistral 7B)
  - Your status is "available" (not offline)
  - Your pricing is competitive
- Job is assigned to your wallet address
- You receive WebSocket notification

**3. You Complete Inference**

- User connects via WebSocket
- You decrypt prompt, run inference, encrypt response
- Stream tokens back to user in real-time

**4. Checkpoint Proof Submission**

Every 1000 tokens, you:
- Generate a **STARK proof** (cryptographic proof you did the work)
- Upload proof to S5 storage (~221KB)
- Submit proof hash + CID to blockchain

**5. Smart Contract Verifies and Releases Payment**

When your proof is submitted:
- Contract verifies proof hash matches S5 data
- Calculates earnings: `1000 tokens × $0.000002 = $0.002 USDC`
- Transfers funds from escrow to **HostEarnings contract** (your balance)
- Emits `ProofSubmitted` event (publicly visible)

**6. Your Earnings Accumulate**

- All earnings go to HostEarnings contract (not directly to your wallet)
- Balance is tracked on-chain per host address
- No minimum threshold to accumulate

**7. You Withdraw When Ready**

Withdraw anytime using Host CLI:

```bash
./fabstir-host-cli withdraw --amount 100.0
# Withdraws 100 USDC from HostEarnings to your wallet
```

Or via SDK:

```javascript
await hostManager.withdrawEarnings('100.0');
```

**Payment Timeline**:

| Event | Time | Notes |
|-------|------|-------|
| Job assigned | Instant | WebSocket notification |
| Inference starts | <1 sec | User connects |
| Tokens generated | Real-time | Streaming response |
| Checkpoint (1000 tokens) | ~5-10 sec | Proof generated + submitted |
| Payment released | ~2-5 sec | Blockchain confirmation (Base L2 is fast) |
| Funds available | Immediately | In HostEarnings contract |
| Withdraw to wallet | ~2-5 sec | On-demand, you control timing |

**Total time from work to payment**: **Under 30 seconds** (for 1000 tokens)

**Payment Tokens**:

You receive the same token the user paid with:
- If user paid in **USDC** → you earn USDC
- If user paid in **ETH** → you earn ETH
- If user paid in **FAB** → you earn FAB

**Multi-Token Balances**:

Your HostEarnings balance tracks each token separately:
- USDC balance: 150.50
- ETH balance: 0.05
- FAB balance: 1000.00

You can withdraw each token independently.

**Automatic vs. Manual Withdrawal**:

**Automatic** (recommended):
- Set a threshold: "Withdraw when balance > 10 USDC"
- Node automatically calls `withdraw()` when threshold is met
- Saves gas by batching many jobs into one withdrawal

**Manual**:
- You decide when to withdraw (e.g., weekly)
- More control, but you pay gas fee per withdrawal

**Gas Costs**:

Withdrawals cost gas (Base L2 fees):
- ~$0.01 per withdrawal transaction
- Negligible for large withdrawals ($100+)
- Matters if withdrawing frequently with small amounts

**Slashing (Penalty System)**:

If you misbehave, your earnings can be slashed:

**Slash conditions**:
- ❌ Submitting fake/invalid proofs
- ❌ Going offline mid-job without notifying
- ❌ Failing to respond to assigned jobs

**Penalty**:
- First offense: Warning
- Second offense: 10% of staked FAB tokens slashed
- Third offense: 50% slashed + delisted from marketplace

**Slashed funds** go to protocol treasury (not the user).

**Earnings Transparency**:

All earnings are **publicly visible** on-chain:
- View on BaseScan: `https://sepolia.basescan.org/address/YOUR_ADDRESS`
- See `ProofSubmitted` events (every 1000 tokens)
- Verify payment amounts match your logs

**Tax Implications** (Consult Your Tax Advisor):

Earnings are likely considered income:
- Track all withdrawals (taxable events)
- Keep records of electricity/hardware costs (deductible)
- Report on tax returns (varies by jurisdiction)

**Disputes**:

If you believe you weren't paid correctly:
1. Check BaseScan for `ProofSubmitted` events
2. Verify proof CID matches your S5 upload
3. Check HostEarnings balance (may not have withdrawn yet)
4. If still incorrect, report in Discord #hosting channel

Smart contracts are **immutable** - incorrect payments are rare but possible bugs. Report immediately if found.

---

#### **Q4: What are the staking requirements?**

**Answer**:

To become a GPU provider, you must **stake FAB tokens** as collateral. This ensures hosts have "skin in the game" and discourages malicious behavior.

**Minimum Stake**:

- **100 FAB tokens** (per host registration)
- At current prices (~$0.10/FAB), this is ~$10 USD

**Why Staking is Required**:

**1. Sybil Resistance**: Prevents someone from registering 1000 fake hosts to spam the network

**2. Quality Assurance**: Only serious providers will stake capital

**3. Slashing Mechanism**: If you misbehave (fake proofs, go offline), your stake can be slashed (you lose tokens)

**4. Reputation Incentive**: Larger stakes signal commitment, improving your reputation score (more job assignments)

**Stake Amounts by Tier**:

| Stake Amount | Benefits | Risk |
|--------------|----------|------|
| **100 FAB** (min) | Can register, basic job priority | Standard slashing risk |
| **500 FAB** | +10% job priority (more assignments) | 5x larger potential loss |
| **1000 FAB** | +25% job priority, "Verified Host" badge | 10x larger potential loss |
| **5000 FAB** | +50% job priority, featured in UI | Significant capital at risk |

**Higher stake = more trust = more jobs = more earnings** (but also more to lose if slashed)

**How to Stake**:

**Option 1: Register with Stake (Host CLI)**

```bash
./fabstir-host-cli register \
  --model "TheBloke/Mistral-7B-Instruct-v0.2-GGUF:mistral-7b-instruct-v0.2.Q4_K_M.gguf" \
  --stake 100
```

This will:
1. Approve NodeRegistry contract to spend your FAB tokens
2. Transfer 100 FAB to NodeRegistry escrow
3. Register your host on-chain
4. Mark you as "active" in marketplace

**Option 2: Increase Stake Later**

If you want to stake more (to increase job priority):

```bash
./fabstir-host-cli stake-more --amount 400
# Increases your stake from 100 → 500 FAB
```

**Where to Get FAB Tokens**:

**Option 1: Buy on DEX (Decentralized Exchange)**
- **Uniswap on Base**: Swap ETH → FAB
- **Liquidity pool**: FAB/ETH on Base L2
- URL: `app.uniswap.org` (select Base network)

**Option 2: Earn as a User**
- Use Platformless AI as a user (spend USDC/ETH)
- Earn FAB rewards (5% cashback in FAB tokens)
- Use earned FAB to stake as a host

**Option 3: Liquidity Mining**
- Provide liquidity to FAB/ETH pool on Uniswap
- Earn LP fees + FAB rewards
- Use rewards to stake

**Stake Lockup Period**:

- **No lockup** while you're an active host
- **7-day unbonding period** if you unregister

This means:
- You can increase stake anytime (no delay)
- You can unregister and get stake back, but must wait 7 days
- During unbonding, you cannot register as a host

**Why 7 days?**
Allows time for any pending disputes/slashing before funds are returned.

**Slashing Risk**:

Your stake can be slashed (partially confiscated) if:

**Minor Offense** (Warning → 10% slash):
- Going offline mid-job without unregistering
- Consistently slow response times (<50% of expected throughput)
- Failing to submit proofs for completed jobs

**Major Offense** (50% slash + delisting):
- Submitting fake/invalid STARK proofs
- Attempting to decrypt user prompts (privacy violation)
- Double-spending exploits
- Coordinated attacks on the network

**Example**:
- You stake 500 FAB
- You submit a fake proof (trying to cheat payment)
- Proof verification fails
- Smart contract slashes 250 FAB (50%)
- You're delisted from marketplace (must re-register with new stake)

**Slashing is RARE** if you:
- ✅ Run official node software (no modifications)
- ✅ Keep node online and responsive
- ✅ Don't try to game the system

**Refunding Your Stake**:

When you want to stop hosting:

```bash
./fabstir-host-cli unregister
# Initiates 7-day unbonding period
```

After 7 days:

```bash
./fabstir-host-cli withdraw-stake
# Returns 100 FAB (or remaining after slashing) to your wallet
```

**Important**: Unregistering does **not** affect your accumulated earnings (those are separate and withdrawable anytime).

**Future: Dynamic Staking**:

Planned for post-MVP:
- **Stake-weighted rewards**: Higher stake = proportionally higher earnings
- **Delegation**: Non-technical FAB holders can delegate stake to hosts (earn passive income)
- **Insurance pools**: Community-funded pools to compensate users if a host is slashed

**Summary**:

- **100 FAB minimum** to register (~$10)
- **Refundable** when you unregister (after 7 days)
- **Slashable** if you misbehave (rare if you follow rules)
- **Increasable** anytime to improve job priority

---

#### **Q5: How are payments settled?**

**Answer**:

Payments are settled **trustlessly via smart contracts** on Base L2. No platform, no middleman, no manual invoices. Everything is automated and cryptographically verifiable.

**End-to-End Settlement Flow**:

**1. User Deposits into Escrow**

User calls `JobMarketplace.createJob()`:
```solidity
function createJob(
  uint256 maxTokens,        // e.g., 10,000 tokens
  uint256 pricePerToken,    // e.g., 2000 (= $0.002 per token)
  bytes32 modelId,          // Model they want
  address paymentToken      // USDC, ETH, or FAB
) external payable
```

User sends:
- For ETH: `msg.value = maxTokens × pricePerToken` (in Wei)
- For USDC/FAB: Approve + transfer tokens to JobMarketplace

Funds are **locked in escrow** (not sent to host yet).

**2. Job Assignment**

Smart contract logic:
```solidity
// Find available hosts running the requested model
address[] memory availableHosts = nodeRegistry.getAvailableHosts(modelId);

// Select host (currently: first available, future: weighted by stake/reputation)
address selectedHost = availableHosts[0];

// Assign job
jobs[jobId].assignedHost = selectedHost;
emit JobAssigned(jobId, selectedHost);
```

**3. Host Completes Work**

Host generates inference + STARK proof, then submits checkpoint:

```solidity
function submitProofOfWork(
  uint256 jobId,
  uint256 tokensClaimed,    // e.g., 1000 tokens
  bytes32 proofHash,        // SHA256 of proof
  string calldata proofCID  // S5 content identifier
) external
```

**4. Proof Verification**

Smart contract verifies:
- ✅ Caller is the assigned host
- ✅ `tokensClaimed ≤ maxTokens` (not claiming more than allowed)
- ✅ `proofHash` matches what's stored in S5 (off-chain verification, on-chain soon)
- ✅ Job is still active (not expired/cancelled)

If all checks pass:

```solidity
// Calculate payment
uint256 payment = tokensClaimed × pricePerToken;

// Transfer from escrow to HostEarnings contract
hostEarnings.deposit(assignedHost, paymentToken, payment);

// Deduct from job's escrow balance
jobs[jobId].remainingEscrow -= payment;

// Emit event
emit ProofSubmitted(jobId, tokensClaimed, proofHash, proofCID);
```

**5. Funds Available in HostEarnings**

Payment is now in `HostEarnings` contract under your address:

```solidity
mapping(address host => mapping(address token => uint256 balance)) public balances;
```

Your balance increases instantly (confirmed in 2-5 seconds on Base L2).

**6. Host Withdraws**

Anytime, you can call:

```solidity
function withdraw(address token, uint256 amount) external {
  require(balances[msg.sender][token] >= amount, "Insufficient balance");

  balances[msg.sender][token] -= amount;

  if (token == ETH_ADDRESS) {
    payable(msg.sender).transfer(amount);
  } else {
    IERC20(token).transfer(msg.sender, amount);
  }

  emit Withdrawal(msg.sender, token, amount);
}
```

Funds are sent directly to your wallet (the one you used to register).

**Refund for Unused Escrow**:

If user deposited 10 USDC but only used 5,000 tokens (out of 10,000 max):

```solidity
function refundUnusedEscrow(uint256 jobId) external {
  require(msg.sender == jobs[jobId].user, "Not job owner");
  require(jobs[jobId].status == JobStatus.Completed, "Job not finished");

  uint256 refund = jobs[jobId].remainingEscrow;
  jobs[jobId].remainingEscrow = 0;

  payable(msg.sender).transfer(refund);

  emit RefundIssued(jobId, refund);
}
```

User gets back 5 USDC (automatically or by calling `refundUnusedEscrow()`).

**Platform Fee (5%)**:

A small network fee is deducted from payments:

```solidity
uint256 platformFee = payment × 5 / 100;  // 5%
uint256 hostEarnings = payment - platformFee;

treasury.deposit(platformFee);            // 5% to protocol treasury
hostEarnings.deposit(host, hostEarnings); // 95% to host
```

**Platform fee goes to**:
- Protocol development (smart contract upgrades)
- Liquidity incentives (FAB staking rewards)
- Governance treasury (FAB token holder controlled)

**Dispute Resolution** (Rare):

If user claims host didn't deliver:

1. User can challenge the proof (within 24 hours)
2. Proof is retrieved from S5 and verified on-chain (future: ZK proof verification)
3. If proof is invalid:
   - Payment is refunded to user
   - Host's stake is slashed
4. If proof is valid:
   - Challenge fails
   - Challenger loses challenge bond (spam prevention)

**Current status**: Manual review via governance (post-MVP: automated ZK proof verification)

**Gas Costs**:

| Transaction | Gas Cost (Base L2) | Who Pays |
|-------------|-------------------|----------|
| `createJob()` | ~$0.01 | User |
| `submitProofOfWork()` | ~$0.005 | Host (deducted from earnings) |
| `withdraw()` | ~$0.01 | Host |
| `refundUnusedEscrow()` | ~$0.005 | User |

Gas costs are **negligible** compared to earnings/payments.

**Settlement Speed**:

- **Block time**: ~2 seconds (Base L2)
- **Confirmation**: 1-3 blocks (~2-6 seconds)
- **Total time**: Work completed → funds available = **Under 10 seconds**

Compare to:
- Traditional platforms: 30-90 days (invoicing, payment processing)
- Crypto exchanges: Instant, but requires trust + KYC
- Platformless AI: **Instant, trustless, no KYC**

**Transparency**:

All payments are publicly verifiable:
- **BaseScan**: View all transactions for your address
- **ProofSubmitted events**: See every payment released
- **HostEarnings balance**: On-chain query (no hidden state)

**Multi-Token Support**:

Smart contracts support multiple payment tokens:
- **ETH** (native Base L2 token)
- **USDC** (stablecoin, most common)
- **FAB** (platform token, discounted fees)

Users choose, hosts receive the same token.

**Future Enhancements** (Post-MVP):

- **Streaming micropayments**: Pay per token (not per 1000)
- **Payment channels**: Off-chain payment batching (even cheaper)
- **Cross-chain payments**: Accept payment on Ethereum, pay host on Base
- **Automated withdrawals**: Threshold-based withdrawals (e.g., auto-withdraw when > 10 USDC)

**Security Guarantees**:

✅ **Non-custodial**: Funds are in smart contracts, not a company's bank account
✅ **Trustless**: No admin key can steal funds
✅ **Immutable**: Payment logic can't be changed (contract is final)
✅ **Audited**: Smart contracts are audited (post-MVP: public audit report)

**Summary**:

Settlement is:
- ⚡ **Instant** (~10 seconds work → payment)
- 🔒 **Trustless** (smart contracts, no middleman)
- 🌐 **Transparent** (all payments visible on-chain)
- 💰 **Cheap** (gas fees < $0.01 per transaction)
- 🛡️ **Secure** (cryptographic proofs + slashing for fraud)

---

### 6. ARCHITECTURE DIAGRAM SECTION

**Layout**:
```
┌─────────────────────────────────────────────────┐
│          How Platformless AI Works              │
│                                                  │
│  [Architecture diagram image showing:           │
│   Users → Encryption → P2P Network → GPU        │
│   Providers → STARK Proofs → Smart Contracts    │
│   → S5 Storage]                                 │
│                                                  │
└─────────────────────────────────────────────────┘
```

**Content**:

**Section Title** (H2):
```
How Platformless AI Works
```

**Subtitle**:
```
Decentralized infrastructure with no platform middleman
```

**Diagram**:
- Use the updated diagram from `images/Fabstir LLM Marketplace Architecture 20250815b.png`
- **Updated elements**:
  - Title: "Platformless AI Architecture" (not "Fabstir LLM Marketplace")
  - Change "EZKL Proofs" → "STARK Proofs"
  - Add subtitle: "Decentralized P2P AI Inference"
  - Footer: "Built by Fabstir" (small text)

**Design Notes**:
- Full-width section (no max-width constraint)
- Dark background to make diagram colors pop
- Image should be high-resolution (2x for retina displays)
- Optional: Clickable diagram that opens modal with larger version

---

### 7. FOOTER

**Layout**:
```
┌──────────────────────────────────────────────────┐
│  Built by Fabstir                                │
│                                                   │
│  [GitHub] | [Docs] | [Discord] | [Twitter/X]     │
│                                                   │
│  © 2025 Fabstir. Open Source (MIT License)       │
└──────────────────────────────────────────────────┘
```

**Content**:

**Branding Line**:
```
Platformless AI is built by Fabstir
Creators of decentralized AI infrastructure
```

**Links**:
- **GitHub**: `https://github.com/fabstir-llm-marketplace` (opens in new tab)
- **Docs**: `https://docs.platformlessai.com` (coming soon, grayed out)
- **Discord**: `https://discord.gg/fabstir` (invite link)
- **Twitter/X**: `https://twitter.com/fabstir` (social)

**Legal/Copyright**:
```
© 2025 Fabstir. All code is open source under MIT License.
```

**Design Notes**:
- Background: `#1a1a1d` (main background)
- Text colors: `#ababae` (copy) for muted text, `#c5c5c8` (copy light) for branding line
- Small text (`text-sm`)
- Links: Color `#9d50bc` (primary light), hover effect (underline + color shift to `#e458b9` secondary pink)
- Padding: `py-8` (32px top/bottom)
- Border top: Thin line using `#3e3e40` (neutrals border)

---

## 🧩 Interactive Features

### Search Bar Functionality

**Behavior**:
1. User types in search box
2. As they type, filter FAQ questions in all three columns
3. Show only matching questions (hide non-matches)
4. If no matches, show "No results found. Try different keywords."

**Example**:
- User types: "private"
- Shows: "Is my data private?" (General FAQ)
- Hides: All other questions

### FAQ Column Click Behavior

**Behavior**:
1. User clicks a question in any column
2. Page scrolls smoothly to answer display area (below columns)
3. Answer expands with fade-in animation
4. Question text appears as heading
5. Full answer content displayed below
6. "Back to questions ↑" link at bottom (scrolls back up)

**Example Flow**:
```
User clicks: "What is Platformless AI?" (General FAQ column)
    ↓
Page scrolls down to answer area
    ↓
Heading: "What is Platformless AI?"
Answer: [Full text from FAQ content above]
    ↓
User clicks: "Back to questions ↑"
    ↓
Scrolls back to three-column FAQ section
```

### Email Waitlist Form

**Trigger**: User clicks "Join Waitlist" button in Hero section

**Form Fields**:
```
┌───────────────────────────────────┐
│  Join the Platformless AI Beta    │
│                                    │
│  Name: [____________]              │
│  Email: [____________]             │
│                                    │
│  I'm interested as:                │
│  ( ) User - I want to use AI       │
│  ( ) Developer - I want to build   │
│  ( ) GPU Provider - I want to host │
│                                    │
│  [Get Early Access]                │
└───────────────────────────────────┘
```

**Validation**:
- Name: Required, min 2 characters
- Email: Required, valid email format
- Interest: Required, one selection

**Submission**:
- Shows loading spinner
- Submits to backend (or Mailchimp/ConvertKit)
- Success: "Thanks! We'll email you when beta launches."
- Error: "Something went wrong. Try again or email support@fabstir.com"

---

## 📱 Responsive Design

### Desktop (1280px+)

- Three-column FAQ: Side-by-side
- Hero text: Large (60px headline)
- Architecture diagram: Full width (1200px)

### Tablet (768px - 1279px)

- Three-column FAQ: 2 columns, third wraps below
- Hero text: Medium (48px headline)
- Architecture diagram: Scaled down (800px)

### Mobile (< 768px)

- Three-column FAQ: Stacked vertically (one column at a time)
- Hero text: Small (36px headline)
- Architecture diagram: Full width (responsive, scrollable if needed)
- Search bar: Full width

---

## 🎨 Design References

**Color Inspiration**: Fabstir brand identity + Crypto/Web3 aesthetic
- Dark backgrounds: `#1a1a1d` (Fabstir dark mode background)
- Purple/pink gradient accents: Primary `#540074` → Secondary `#e458b9`
- Inspired by: Uniswap (dark mode), Aave (purple accents), Ethereum.org (gradients)
- Fabstir theme color: `#540074` (matches manifest)

**Typography Inspiration**: Clean, modern
- Inter font (like Stripe, GitHub) - highly readable, professional
- High contrast: `#e6e6e9` (foreground) on `#1a1a1d` (background)
- Generous line-height for readability (1.6-1.8)
- Purple gradients on headings for brand consistency

**Component Style**: Shadcn UI with Fabstir colors
- Rounded corners (`rounded-lg`)
- Subtle shadows on cards
- Smooth transitions (200ms ease)
- Purple/pink hover states (`#9d50bc` → `#e458b9`)
- Border color: `#3e3e40` (Fabstir neutrals)

**Animations**:
- Fade-in on scroll (Framer Motion or CSS)
- Hover effects on cards/buttons (scale up 2-5% + color shift to `#9d50bc`)
- Smooth scrolling for anchor links
- Purple/pink gradient shimmer on hero heading (optional)

---

## 🚀 Development Notes for UI Designer

### Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Components**: Shadcn UI (install via CLI)
- **Icons**: Lucide Icons (part of Shadcn)
- **Animations**: Framer Motion (optional)

### Setup Commands

```bash
# Create Next.js app
npx create-next-app@latest platformlessai-landing --typescript --tailwind --app

# Install Shadcn UI
npx shadcn-ui@latest init

# Add components
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
npx shadcn-ui@latest add accordion
npx shadcn-ui@latest add input
npx shadcn-ui@latest add dialog
```

### Tailwind Configuration (Fabstir Colors)

Add this to your `tailwind.config.ts` to use Fabstir brand colors:

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Fabstir Brand Colors
        primary: {
          DEFAULT: '#540074',    // Primary purple
          content: '#ea97ff',    // Light purple text
          light: '#9d50bc',      // Lighter purple
          dark: '#260048',       // Very dark purple
        },
        secondary: {
          DEFAULT: '#e458b9',    // Secondary pink
          content: '#fff4ff',    // Very light pink
          light: '#ffa5ff',      // Light pink
          dark: '#af1e89',       // Dark pink
        },
        success: {
          DEFAULT: '#48a437',    // Success green
          content: '#002300',    // Text on success
        },
        warning: {
          DEFAULT: '#a6a23a',    // Warning yellow
          content: '#272000',    // Text on warning
        },
        error: {
          DEFAULT: '#a93a2a',    // Error red
          content: '#330000',    // Text on error
        },
        // Neutrals (Dark Mode)
        background: '#1a1a1d',   // Main background
        foreground: '#e6e6e9',   // Primary text
        border: '#3e3e40',       // Borders
        copy: {
          DEFAULT: '#ababae',    // Body text
          light: '#c5c5c8',      // Lighter text
          lighter: '#e1e1e4',    // Lightest text
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

export default config
```

**Usage Examples**:

```tsx
// Primary purple button
<button className="bg-primary text-primary-content hover:bg-primary-light">
  Join Waitlist
</button>

// Card with border
<div className="bg-primary-dark border border-border rounded-lg p-6">
  <h3 className="text-primary-content">General FAQ</h3>
</div>

// Success checkmark
<span className="text-success">✅</span>

// Error X mark
<span className="text-error">❌</span>

// Body text
<p className="text-copy">Regular body text here</p>

// Muted text
<p className="text-copy-light">Muted secondary text</p>

// Purple gradient heading
<h1 className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
  Platformless AI
</h1>
```

### File Structure

```
platformlessai-landing/
├── app/
│   ├── page.tsx (main landing page)
│   ├── layout.tsx (global layout with header/footer)
│   └── globals.css (Tailwind imports)
├── components/
│   ├── Header.tsx
│   ├── Hero.tsx
│   ├── ValueProp.tsx
│   ├── FAQSection.tsx (with search)
│   ├── FAQColumns.tsx
│   ├── FAQAnswer.tsx
│   ├── ArchitectureDiagram.tsx
│   ├── Footer.tsx
│   └── WaitlistModal.tsx
├── public/
│   └── architecture-diagram.png (updated image)
└── package.json
```

### Key Components to Build

**1. FAQSection.tsx**
- Search bar state (filter questions)
- Three-column layout
- Click handler (scroll to answer)

**2. FAQAnswer.tsx**
- Receives `question` and `answer` props
- Animates in when visible
- "Back to top" link

**3. WaitlistModal.tsx**
- Form with validation
- Submit handler (POST to API)
- Success/error states

### Deployment

```bash
# Build for production
npm run build

# Deploy to Vercel (free)
vercel deploy

# Or push to GitHub → Vercel auto-deploys
git push origin main
```

---

## ✅ Acceptance Criteria

Before showing to stakeholders, verify:

- [ ] All FAQ questions/answers are present (15 total)
- [ ] Search bar filters questions correctly
- [ ] Clicking a question scrolls to answer
- [ ] Architecture diagram is updated (STARK proofs, Platformless AI branding)
- [ ] Waitlist form submits successfully
- [ ] Responsive on mobile (test on real device)
- [ ] All links work (GitHub, Discord, etc.)
- [ ] Dark theme matches design system
- [ ] No typos in copy (run spell check)
- [ ] Site loads in <3 seconds (test on slow connection)

---

## 📞 Questions for Founder

Before finalizing, clarify:

1. **Exact launch date for beta?** (For FAQ "When can I use it?")
2. **Discord/Telegram invite links?** (For footer and support)
3. **Twitter/X handle?** (For social links)
4. **Mailchimp/ConvertKit setup?** (For waitlist form)
5. **Final architecture diagram?** (Send updated PNG with STARK proofs)
6. **Exact pricing for hosts?** (Verify earnings estimates are accurate)
7. **Model availability timeline?** (Which models are actually ready for beta?)

---

## 🎉 Final Notes

This landing page is designed to:
- ✅ Educate visitors on "platformless" concept
- ✅ Address objections (crypto requirement, pricing, privacy)
- ✅ Capture emails for beta launch
- ✅ Provide immediate value (comprehensive FAQ)
- ✅ Build trust (open source, transparent architecture)

**Launch sequence**:
1. Deploy landing page (this doc)
2. Share on Twitter/HN/Reddit (crypto communities)
3. Drive traffic to waitlist
4. Launch beta with early access list
5. Iterate based on feedback

**Target**: 1,000 waitlist signups before beta launch

**Estimated build time**: 2-3 days (for experienced Next.js developer)

**Questions?** Reach out on Discord or GitHub.

---

**End of Design Specification**

**Version**: 1.1 (Updated with Fabstir brand colors)
**Last Updated**: October 16, 2025
**Document Owner**: Fabstir Founder
**Designer**: [Your Name]
**Developer**: TBD (using Claude Code + Shadcn UI MCP)

---

## 🎨 Changelog

### Version 1.1 (October 16, 2025)
- ✅ Updated entire color palette to use Fabstir brand colors
- ✅ Added logo asset references from manifest.json
- ✅ Updated all design notes sections with specific hex colors
- ✅ Added Tailwind CSS configuration with Fabstir colors
- ✅ Added color usage examples for developers
- ✅ Changed gradient from blue→green to purple→pink (primary→secondary)
- ✅ Updated all button, link, and hover state colors
- ✅ Maintained dark mode theme (`#1a1a1d` background)

### Version 1.0 (October 16, 2025)
- Initial design specification with complete FAQ content
- Single-page landing page layout
- 15 FAQ questions with full answers
- Responsive design guidelines
