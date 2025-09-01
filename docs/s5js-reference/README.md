# Enhanced S5.js SDK

An enhanced JavaScript/TypeScript SDK for the S5 decentralized storage network, featuring a simple path-based API for file and directory operations.

## Features

- 🚀 **Path-based API**: Simple `get()`, `put()`, `delete()`, `list()` operations
- 📁 **Directory Support**: Full directory tree management with recursive operations
- 🔄 **Cursor Pagination**: Efficient handling of large directories
- 🔐 **Built-in Encryption**: Automatic encryption for private data
- 📦 **CBOR Serialization**: Deterministic encoding for cross-platform compatibility
- 🌐 **Browser & Node.js**: Works in both environments
- 🗂️ **HAMT Sharding**: Automatic directory sharding for millions of entries
- 🚶 **Directory Walker**: Recursive traversal with filters and resumable cursors
- 📋 **Batch Operations**: High-level copy/delete operations with progress tracking
- ✅ **Real S5 Portal Integration**: Fully tested with s5.vup.cx portal

## Key Components

### Core API
- **S5**: Main client class for connection and identity management
- **FS5**: File system operations with path-based API
- **S5UserIdentity**: User identity and authentication

### Utility Classes
- **DirectoryWalker**: Recursive directory traversal with cursor support
- **BatchOperations**: High-level copy/delete operations with progress tracking

See the [API Documentation](./docs/API.md) for detailed usage examples.

## Installation

The enhanced path-based API features are currently in development as part of a Sia Foundation grant project.

**For production use:**

```bash
npm install @s5-dev/s5js
```

**To try the enhanced features:**

```bash
# Clone the repository
git clone https://github.com/julesl23/s5.js
cd s5.js

# Install dependencies
npm install

# Build the project
npm run build

# Run tests with real S5 portal
npm test
```

**Status**: These features are pending review and have not been merged into the main S5.js repository.

## Quick Start

```typescript
import { S5 } from "./dist/src/index.js";

// Create S5 instance and connect to real S5 portal
const s5 = await S5.create({
  initialPeers: [
    "wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p",
  ],
});

// Generate a new seed phrase (save this securely!)
const seedPhrase = s5.generateSeedPhrase();
console.log("Your seed phrase:", seedPhrase);

// Or recover from existing seed phrase
// const seedPhrase = "your saved twelve word seed phrase here";

await s5.recoverIdentityFromSeedPhrase(seedPhrase);

// Register on S5 portal (s5.vup.cx supports the new API)
await s5.registerOnNewPortal("https://s5.vup.cx");

// Initialize filesystem (creates home and archive directories)
await s5.fs.ensureIdentityInitialized();

// Store data
await s5.fs.put("home/documents/hello.txt", "Hello, S5!");

// Retrieve data
const content = await s5.fs.get("home/documents/hello.txt");
console.log(content); // "Hello, S5!"

// List directory contents
for await (const item of s5.fs.list("home/documents")) {
  console.log(`${item.type}: ${item.name}`);
}
```

### Advanced Usage

```typescript
import { DirectoryWalker, BatchOperations } from "./dist/src/index.js";

// Recursive directory traversal
const walker = new DirectoryWalker(s5.fs, '/');
for await (const entry of walker.walk("home", { maxDepth: 3 })) {
  console.log(`${entry.path} (${entry.type})`);
}

// Batch operations with progress
const batch = new BatchOperations(s5.fs);
const result = await batch.copyDirectory("home/source", "home/backup", {
  onProgress: (progress) => {
    console.log(`Copied ${progress.processed} items...`);
  }
});
console.log(`Completed: ${result.success} success, ${result.failed} failed`);
```

## Testing with Real S5 Portal

The enhanced S5.js has been successfully integrated with real S5 portal infrastructure. To test:

### 1. Fresh Identity Test (Recommended)

This test creates a new identity and verifies all functionality:

```bash
node test/integration/test-fresh-s5.js
```

Expected output: 100% success rate (9/9 tests passing)

### 2. Full Integration Test

Comprehensive test of all features:

```bash
node test/integration/test-s5-full-integration.js
```

### 3. Direct Portal API Test

Tests direct portal communication:

```bash
node test/integration/test-portal-direct.js
```

### Important Notes

- **Use Fresh Identities**: The new deterministic key derivation system requires fresh identities. Old accounts created with the previous system won't work.
- **Portal URL**: Use `https://s5.vup.cx` which has the updated API. Other portals may not have the required updates.
- **Path Requirements**: All paths must start with either `home/` or `archive/`

## Performance Benchmarks

The enhanced S5.js includes comprehensive performance benchmarks to verify HAMT efficiency and scaling behaviour.

### Running Benchmarks

#### Local Mock Benchmarks (Fast)

Test HAMT performance with mock S5 API:

```bash
# Basic HAMT verification
node test/integration/test-hamt-local-simple.js

# Comprehensive scaling test (up to 100K entries)
node test/integration/test-hamt-mock-comprehensive.js
```

#### Real Portal Benchmarks (Network)

Test with actual S5 portal (requires internet connection):

```bash
# Minimal real portal test
node test/integration/test-hamt-real-minimal.js

# HAMT activation threshold test
node test/integration/test-hamt-activation-real.js

# Full portal performance analysis
node test/integration/test-hamt-real-portal.js
```

### Benchmark Results

See [BENCHMARKS.md](./docs/BENCHMARKS.md) for detailed performance analysis showing:
- HAMT activation at exactly 1000 entries
- O(log n) scaling verified up to 100K+ entries
- ~800ms per operation on real S5 network
- Memory usage of ~650 bytes per entry

For production deployments, these benchmarks confirm the implementation is ready for large-scale directory operations.

## Documentation

- [API Documentation](./docs/API.md) - Complete API reference with examples
- [Implementation Status](./docs/IMPLEMENTATION.md) - Development progress tracking
- [Milestones](./docs/MILESTONES.md) - Grant milestone tracking
- [Benchmarks](./docs/BENCHMARKS.md) - Performance analysis and results

## Development

This is an enhanced version of s5.js being developed under an 8-month grant from the Sia Foundation. The project implements a new format using:

- **New Format**: CBOR serialization with DirV1 specification (replaces MessagePack)
- **Path-based API**: Simple file operations with familiar syntax
- **HAMT sharding**: Automatic directory sharding for efficient large directory support
- **Directory utilities**: Recursive operations with progress tracking and error handling
- **Deterministic Key Derivation**: Subdirectory keys derived from parent keys
- **Real Portal Integration**: Successfully tested with s5.vup.cx

**Note**: This is a clean implementation that does NOT maintain backward compatibility with old S5 data formats.

### Building

```bash
npm run build     # Compile TypeScript
npm run dev       # Watch mode
npm run test      # Run tests
```

### Development Commands

```bash
npm run build       # Compile TypeScript to JavaScript
npm run dev         # Watch mode for development
npm run type-check  # Run TypeScript type checking
```

### Testing

```bash
npm run test        # Run tests in watch mode
npm run test:run    # Run tests once
npm run test:ui     # Run tests with UI
npm run test:coverage # Generate coverage report
```

### Test Server

For integration testing with mock S5 services:

```bash
node test-server.js  # Start mock server on port 3000
```

See [test-server-README.md](./test-server-README.md) for details.

## Project Architecture

### Technology Stack

- **Language**: TypeScript (ES2022 target, ESNext modules)
- **Runtime**: Dual-targeted for Browser and Node.js
- **Test Framework**: Vitest with global test functions
- **Crypto**: @noble libraries for cryptographic operations
- **Storage**: IndexedDB (browser) and memory-level (Node.js)
- **Serialization**: CBOR via cbor-x
- **Networking**: WebSocket-based P2P connections

### Module Structure

- `src/api/` - Core S5 API interfaces and crypto implementations
- `src/fs/` - File system operations (FS5 implementation)
  - `dirv1/` - CBOR-based directory format implementation
  - `hamt/` - Hash Array Mapped Trie for large directories
  - `utils/` - Directory walker and batch operations
- `src/identity/` - User identity and authentication
- `src/node/` - P2P networking and registry operations
- `src/kv/` - Key-value storage abstractions
- `src/encryption/` - Encryption utilities
- `src/identifier/` - Content identifiers and multibase encoding
- `src/util/` - Utility functions

## Project Status

- ✅ Month 1: Project Setup - Complete
- ✅ Month 2: Path Helpers v0.1 - Complete
- ✅ Month 3: Path-cascade Optimization & HAMT - Complete
- ✅ Month 4: Directory Utilities - Complete
- ✅ **S5 Portal Integration** - Complete (100% test success rate)
- 🚧 Month 5: Media Processing (Part 1) - In Progress
- ⏳ Months 6-8: Advanced features pending

See [MILESTONES.md](./docs/MILESTONES.md) for detailed progress.

### Completed Phases ✅

- **Phase 1**: Core Infrastructure (CBOR, DirV1 types)
- **Phase 2**: Path-Based API (get, put, delete, list, getMetadata)
- **Phase 3**: HAMT Integration (auto-sharding at 1000+ entries)
- **Phase 4**: Directory Utilities (walker, batch operations)

### In Progress 🚧

- **Phase 5**: Media Processing Foundation (WASM setup)

### Upcoming ⏳

- **Phase 6**: Thumbnail Generation
- **Phase 7**: Progressive Image Loading
- **Phase 8**: Final Integration and Testing

## Performance

The implementation has been benchmarked to ensure efficient operation:

- **HAMT activation**: Automatic at 1000+ entries
- **Scaling**: O(log n) performance verified up to 100K+ entries
- **Memory usage**: ~650 bytes per directory entry
- **Network latency**: ~800ms per operation on real S5 network

See [BENCHMARKS.md](./docs/BENCHMARKS.md) for detailed results.

## Testing & Integration

- For S5 portal testing, see the test files mentioned above
- For integration testing with external services, see [test-server-README.md](./test/integration/test-server-README.md)

## Troubleshooting

### "Invalid base length" errors

- Solution: Use a fresh seed phrase. Old accounts have incompatible key structures.

### Directory not found errors

- Solution: Ensure you call `ensureIdentityInitialized()` after portal registration
- All paths must start with `home/` or `archive/`

### Portal connection issues

- Use `https://s5.vup.cx` which has the updated API
- Ensure you have Node.js v20+ for proper crypto support

## Important Notes

- **Format**: Uses new CBOR/DirV1 format - NOT compatible with old S5 data
- **Paths**: Must start with `home/` or `archive/`
- **Portal**: Use `https://s5.vup.cx` for testing (has updated API)
- **Identity**: Requires fresh seed phrases (old accounts incompatible)

## Contributing

This project is being developed under a Sia Foundation grant. For contributions or issues, please refer to the [grant proposal](./docs/grant/Sia-Standard-Grant-Enhanced-s5js.md).

## License

MIT

---

*This is an enhanced version of s5.js being developed under an 8-month grant from the Sia Foundation. The project implements a new format using CBOR serialization with the DirV1 specification.*