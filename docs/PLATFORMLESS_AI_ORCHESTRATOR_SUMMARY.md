# Platformless AI Orchestrator: Multi-Agent AI with A2A Protocol on Sia

## Overview

`@fabstir/orchestrator` is a production-ready multi-agent orchestration package for the Platformless AI P2P LLM marketplace. It decomposes complex goals into task graphs, routes sub-tasks to optimal models across decentralized GPU hosts, executes them with encrypted inference, settles payments on-chain, and collects cryptographic proofs — all coordinated through Google's Agent-to-Agent (A2A) protocol.

**Platformless AI is, to our knowledge, the first and only DePIN project to implement the A2A protocol** — bridging decentralized compute infrastructure with the emerging standard for inter-agent communication.

---

## What is the A2A Protocol?

The [Agent-to-Agent (A2A) protocol](https://github.com/google/A2A) is an open standard introduced by Google in April 2025 for enabling AI agents to discover, communicate, and collaborate with each other — regardless of framework, vendor, or runtime.

### Key Facts

- **Origin**: Created by Google, announced April 9, 2025, with 50+ launch partners including Salesforce, SAP, Atlassian, MongoDB, LangChain, and CrewAI
- **Governance**: Transferred to the Linux Foundation in January 2026 as a vendor-neutral open standard
- **Adoption**: 150+ technology partners across enterprise, cloud, and AI ecosystems
- **Status**: v1.0.0-rc (release candidate), rapidly approaching stable 1.0
- **Complementary to MCP**: A2A handles agent-to-agent communication while Anthropic's Model Context Protocol (MCP) handles agent-to-tool communication — they are designed to work together

### How A2A Works

1. **Agent Cards** (`/.well-known/agent.json`): JSON metadata describing an agent's capabilities, skills, supported protocols, and authentication requirements — enabling automatic discovery
2. **JSON-RPC 2.0**: Standardised request/response format for task delegation between agents
3. **Server-Sent Events (SSE)**: Real-time streaming for long-running tasks with progress updates
4. **Skill-based routing**: Agents advertise tagged skills; clients discover agents by matching skill tags to requirements

### Why A2A Matters for DePIN

Until now, DePIN AI projects have operated as isolated inference endpoints — you send a prompt, get a response. A2A transforms this into a collaborative agent network where:

- Agents **discover** each other's capabilities automatically
- Complex tasks get **delegated** to the most suitable agent
- Results flow back through **standardised channels**
- Authentication and payments integrate at the **protocol level**

No other DePIN project — not Akash, Render, Bittensor, io.net, Ritual, Gensyn, or Nosana — currently implements A2A. They provide raw compute or inference APIs, but lack inter-agent coordination at the protocol level.

---

## Orchestrator Capabilities

### Task Decomposition and Planning

The orchestrator uses a persistent planning session to break complex goals into Directed Acyclic Graphs (DAGs) of sub-tasks:

```
User Goal: "Analyse Q4 earnings reports and draft investor summary"
    │
    ├── Task 1: Extract key metrics from earnings PDF (analysis)
    ├── Task 2: Compare with Q3 performance (analysis, depends on Task 1)
    ├── Task 3: Research market context (research, parallel with Task 1)
    └── Task 4: Draft investor summary (synthesis, depends on Tasks 2 & 3)
```

Each task carries type hints (`analysis`, `synthesis`, `research`, `tool-calling`, `creative`) and optional model preferences, enabling intelligent routing.

### Intelligent Model Routing

The `ModelRouter` assigns models to tasks based on complexity:

| Task Type | Routing Logic |
|-----------|--------------|
| Tool-calling | Deep model (needs function-call capability) |
| Synthesis | Deep model (needs reasoning) |
| Large analysis (>2000 chars) | Deep model |
| Small analysis | Fast model (cost-efficient) |
| Research, creative | Fast model by default |
| Explicit hint | User override respected |

Models are validated against the on-chain `ModelRegistry` at initialisation, ensuring only hosts with registered, approved models are used.

### Execution Patterns

Three built-in orchestration patterns cover common multi-agent workflows:

- **FanOut**: Execute N sub-tasks in parallel, collect all results. Ideal for independent research queries or parallel analysis.
- **Pipeline**: Execute tasks sequentially, each receiving the prior task's output as context. Ideal for staged refinement or multi-step reasoning.
- **MapReduce**: Parallel map phase across inputs, followed by a single reduce step that synthesises all intermediate results. Ideal for document analysis or data aggregation.

### Encrypted Inference

Every session uses end-to-end encryption by default. Prompts and responses are encrypted between the SDK and host nodes — the marketplace infrastructure never sees plaintext content. This is critical for enterprise and privacy-sensitive use cases.

### On-Chain Settlement

The orchestrator manages the full payment lifecycle:

1. **Deposit**: USDC or native token deposited to escrow before each sub-task
2. **Budget enforcement**: Per-task and total deposit limits prevent runaway costs
3. **Settlement**: `completeSessionJob` called on-chain after each sub-task completes
4. **Nonce serialisation**: Transaction mutex ensures correct nonce ordering when multiple sub-tasks settle concurrently from a shared wallet

### Proof Collection

Every sub-task can return a cryptographic proof CID (Content Identifier). The `ProofCollector` accumulates these throughout orchestration, providing a verifiable audit trail of all inference work performed — stored on Sia for permanent, decentralised availability.

### SSE Streaming and Task Lifecycle

The orchestrator supports real-time progress streaming via Server-Sent Events (SSE), giving clients granular visibility into every stage of orchestration:

- **Content negotiation**: `POST /v1/orchestrate` with `Accept: text/event-stream` returns an SSE stream; without it, the existing sync JSON response is returned (fully backward compatible)
- **Phased progress events**: Clients receive `status-update` events for each orchestration phase — `decomposing` (goal breakdown), `executing` (per sub-task start and batch completion with `taskId`/`taskName`), and `synthesising` (final answer generation)
- **Artifact streaming**: Synthesis results are delivered as `artifact-update` events before the final `completed` status
- **Client disconnect handling**: If the client closes the SSE connection, the orchestration is aborted via `AbortSignal` — no wasted compute
- **Task cancellation**: `DELETE /v1/orchestrate/:taskId` cancels an active streaming task, returning 404 for unknown tasks
- **SSEEventBus**: A concrete `EventBus` implementation that writes SSE format (`data: JSON\n\n`) to Express responses, with guards against writes after close or client disconnect

### Concurrency and Session Pooling

The `SessionPool` manages multiple simultaneous `FabstirSDKCore` instances with semaphore-based concurrency control:

- Configurable max concurrent sessions (minimum 2, recommended 3+)
- Abort signal propagation for clean cancellation
- Automatic session cleanup on failure
- Wait queue for backpressure when pool is saturated

---

## A2A Integration Architecture

### Server Side: Exposing the Orchestrator as an A2A Agent

```
┌──────────────────────────────────────────────┐
│           OrchestratorA2AServer              │
│                                              │
│  GET /.well-known/agent.json                 │
│    → Returns Agent Card with skills          │
│                                              │
│  POST /v1/orchestrate                        │
│    → JWT-authenticated task submission       │
│    → Content negotiation:                    │
│      Accept: text/event-stream → SSE stream  │
│      Otherwise → sync JSON response          │
│    → OrchestratorExecutor bridges to         │
│      OrchestratorManager                     │
│    → SSE: streams progress, artifacts,       │
│      status updates in real time             │
│                                              │
│  DELETE /v1/orchestrate/:taskId              │
│    → Cancels an active streaming task        │
│    → Returns 404 if task not found           │
│                                              │
│  JWT verification via setJwtVerifier()       │
│    → Wallet-signed auth tokens               │
└──────────────────────────────────────────────┘
```

The server publishes an **Agent Card** at the well-known endpoint:

```json
{
  "name": "Fabstir Orchestrator",
  "description": "Multi-agent orchestration with encrypted inference and on-chain settlement",
  "url": "https://orchestrator.example.com",
  "version": "0.1.0",
  "skills": [{
    "id": "encrypted-orchestration",
    "name": "Encrypted Multi-Agent Orchestration",
    "description": "Decomposes goals into sub-tasks, routes to optimal models, settles on-chain",
    "tags": ["orchestration", "encrypted", "multi-agent", "on-chain-settlement"]
  }],
  "securitySchemes": [{
    "type": "bearer",
    "description": "Wallet-signed JWT"
  }]
}
```

### Client Side: Discovering and Delegating to External Agents

The `A2AClientPool` and `AgentDiscovery` modules allow the orchestrator to act as an A2A client:

- **Agent Discovery**: Register external agent URLs, fetch their Agent Cards, search by skill tags
- **Task Delegation**: Send JSON-RPC requests to external agents, receive text artifact responses
- **Agent Card Caching**: Discovered cards are cached to avoid repeated network calls

This means the Platformless AI orchestrator can both **serve** A2A requests from other agents and **delegate** to external A2A-compatible agents — enabling true multi-agent collaboration across organisational boundaries.

### CLI Usage

```bash
# One-shot orchestration
FABSTIR_PRIVATE_KEY=0x... \
FABSTIR_FAST_MODEL="Repo:fast-model.gguf" \
FABSTIR_DEEP_MODEL="Repo:deep-model.gguf" \
fabstir-orchestrator "Analyse this dataset and produce a summary report"

# Start as A2A server (no goal argument)
FABSTIR_PRIVATE_KEY=0x... \
FABSTIR_A2A_PORT=3100 \
fabstir-orchestrator
# → Orchestrator A2A server listening on port 3100
```

---

## Why This Matters for the Sia Ecosystem

### Decentralised Storage Meets Decentralised AI

Platformless AI uses Sia for persistent storage of conversation histories, proofs, and agent state. The orchestrator extends this by:

- **Storing proof CIDs on Sia**: Every sub-task's cryptographic proof is content-addressed and stored on Sia, creating a permanent, verifiable audit trail
- **Conversation persistence**: Multi-turn orchestration sessions persist on Sia, enabling resumable workflows
- **Agent Card hosting**: Agent metadata can be stored and served from Sia, making agent discovery truly decentralised

### The A2A Advantage

By implementing A2A, Platformless AI transforms Sia-backed compute from simple inference endpoints into a collaborative agent network:

1. **Interoperability**: Any A2A-compatible agent (Google, LangChain, CrewAI, enterprise agents) can discover and delegate tasks to Platformless AI hosts
2. **Composability**: Orchestrators can chain together agents from different DePIN networks, using Sia as the shared storage layer
3. **Enterprise readiness**: A2A is backed by 150+ partners and the Linux Foundation — it's the emerging standard enterprises will adopt for agent communication
4. **Payment integration**: The A2A protocol's alignment with the x402 HTTP payment standard (USDC micropayments) maps directly to Platformless AI's on-chain settlement model

### Competitive Position

| Feature | Platformless AI | Other DePIN AI |
|---------|----------------|----------------|
| A2A Protocol | Yes | No |
| Multi-agent orchestration | Yes (DAG-based) | No (single inference) |
| SSE streaming | Real-time phased progress | None |
| Task cancellation | Mid-flight abort via SSE or REST | None |
| Encrypted inference | Default | Rare |
| On-chain settlement | Per sub-task | Per session at best |
| Task decomposition | Automatic | Manual |
| Agent discovery | A2A standard | Proprietary or none |
| Proof collection | CID-based on Sia | Limited |
| Orchestration patterns | FanOut, Pipeline, MapReduce | None |

---

## Technical Summary

| Component | Description |
|-----------|-------------|
| `SessionAdapter` | Clean interface wrapping FabstirSDKCore for session lifecycle |
| `SessionPool` | Semaphore-based concurrency with transaction mutex |
| `ModelRouter` | Task-type-aware model assignment with on-chain validation |
| `TaskPlanner` | LLM-driven goal decomposition into task DAGs |
| `TaskQueue` | DAG-aware execution queue with dependency tracking |
| `ProofCollector` | Cryptographic proof CID accumulation |
| `OrchestratorManager` | Top-level coordinator: plan → route → execute → synthesise → settle |
| `FanOut` / `Pipeline` / `MapReduce` | Reusable orchestration patterns |
| `OrchestratorA2AServer` | Express server with SSE streaming, content negotiation, and cancel endpoint |
| `OrchestratorExecutor` | Bridges OrchestratorManager to A2A event bus with abort support |
| `SSEEventBus` | Concrete EventBus writing SSE format to HTTP responses |
| `A2AClientPool` | HTTP client for delegating to external A2A agents |
| `AgentDiscovery` | Skill-based agent lookup via Agent Cards |

**Package**: `@fabstir/orchestrator` v0.1.0
**Tests**: 150 unit tests, all passing
**Runtime**: Node.js >= 18
**Dependencies**: `@fabstir/sdk-core`, `express`

---

## What's Next

- **Multi-orchestrator coordination**: A2A-based delegation between Platformless AI orchestrators
- **Agent marketplace**: On-chain registry of A2A-compatible agents with reputation scoring
- **Sia-native agent cards**: Host Agent Card metadata directly on Sia for fully decentralised discovery
- **x402 payment integration**: HTTP-native micropayments for cross-agent task delegation

---

*Platformless AI is building the infrastructure where decentralised compute, encrypted inference, on-chain settlement, and inter-agent collaboration converge — powered by Sia storage and the A2A protocol.*
