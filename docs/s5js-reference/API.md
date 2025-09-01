# Enhanced S5.js Path-Based API Documentation

## Table of Contents

- [Enhanced S5.js Path-Based API Documentation](#enhanced-s5js-path-based-api-documentation)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Installation](#installation)
  - [Quick Start](#quick-start)
  - [Core API Methods](#core-api-methods)
    - [get(path, options?)](#getpath-options)
      - [Parameters](#parameters)
      - [Returns](#returns)
      - [Data Decoding](#data-decoding)
      - [Example](#example)
    - [put(path, data, options?)](#putpath-data-options)
      - [Parameters](#parameters-1)
      - [Automatic Encoding](#automatic-encoding)
      - [Example](#example-1)
    - [getMetadata(path)](#getmetadatapath)
      - [Parameters](#parameters-2)
      - [Returns](#returns-1)
      - [File Metadata](#file-metadata)
      - [Directory Metadata](#directory-metadata)
      - [Example](#example-2)
    - [delete(path)](#deletepath)
      - [Parameters](#parameters-3)
      - [Returns](#returns-2)
      - [Notes](#notes)
      - [Example](#example-3)
    - [list(path, options?)](#listpath-options)
      - [Parameters](#parameters-4)
      - [Yields](#yields)
      - [Example](#example-4)
  - [Types and Interfaces](#types-and-interfaces)
    - [PutOptions](#putoptions)
    - [GetOptions](#getoptions)
    - [ListOptions](#listoptions)
    - [ListResult](#listresult)
  - [Path Resolution](#path-resolution)
  - [Cursor-Based Pagination](#cursor-based-pagination)
    - [How Cursors Work](#how-cursors-work)
    - [Pagination Example](#pagination-example)
    - [Cursor Stability](#cursor-stability)
  - [Error Handling](#error-handling)
    - [Common Errors](#common-errors)
    - [Invalid Cursor Errors](#invalid-cursor-errors)
  - [Examples](#examples)
    - [File Management](#file-management)
    - [Batch Operations with Progress](#batch-operations-with-progress)
    - [Clean-up Operations](#clean-up-operations)
  - [Integration with FS5 Class Methods](#integration-with-fs5-class-methods)
  - [Best Practices](#best-practices)
  - [Limitations](#limitations)
  - [HAMT (Hash Array Mapped Trie) Support](#hamt-hash-array-mapped-trie-support)
    - [How HAMT Works](#how-hamt-works)
    - [HAMT Behavior](#hamt-behavior)
    - [Working with Large Directories](#working-with-large-directories)
    - [HAMT Implementation Details](#hamt-implementation-details)
  - [Directory Utilities (Phase 4)](#directory-utilities-phase-4)
    - [DirectoryWalker](#directorywalker)
    - [BatchOperations](#batchoperations)
    - [Directory Utility Examples](#directory-utility-examples)
  - [Performance Considerations](#performance-considerations)
  - [Next Steps](#next-steps)

## Overview

The Enhanced S5.js Path-Based API provides developer-friendly methods for file and directory operations on the S5 decentralised storage network. This implementation uses a **new data format**:

- **CBOR serialization** instead of MessagePack
- **DirV1 specification** with deterministic encoding
- **No backward compatibility** with old S5 data formats

The API offers an intuitive interface using familiar path syntax while implementing this clean, new format.

## Installation

The enhanced path-based API features are currently in development as part of a Sia Foundation grant project.

**For production use:**

```bash
npm install @s5-dev/s5js
```

**To try the enhanced features:**

- Clone from: https://github.com/julesl23/s5.js
- See the [Development Setup](#development-setup) section for build instructions

**Status**: These features are pending review and have not been merged into the main S5.js repository.

## Quick Start

```typescript
import { S5 } from "@s5-dev/s5js";

// Create S5 instance and connect to peers
const s5 = await S5.create({
  initialPeers: [
    "wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p"
  ]
});

// Generate a new seed phrase
const seedPhrase = s5.generateSeedPhrase();

// Or recover from existing seed phrase
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

## Core API Methods

### get(path, options?)

Retrieve data from a file at the specified path.

```typescript
async get(path: string, options?: GetOptions): Promise<any | undefined>
```

#### Parameters

- **path** (string): The file path (e.g., "home/documents/file.txt")
- **options** (GetOptions, optional): Configuration options
  - `defaultMediaType` (string): Default media type for content interpretation

#### Returns

- The decoded file data (string, object, or Uint8Array)
- `undefined` if the file doesn't exist

#### Data Decoding

The method automatically detects and decodes data:

1. Attempts CBOR decoding first (for objects)
2. Falls back to JSON parsing
3. Then attempts UTF-8 text decoding
4. Returns raw Uint8Array if all decoding fails

#### Example

```typescript
// Get text file
const content = await s5.fs.get("home/readme.txt");
console.log(content); // "Hello, world!"

// Get JSON/CBOR data
const data = await s5.fs.get("home/config.json");
console.log(data); // { version: "1.0", settings: {...} }

// Get binary data
const image = await s5.fs.get("home/photo.jpg");
console.log(image); // Uint8Array[...]
```

### put(path, data, options?)

Store data at the specified path, creating intermediate directories as needed.

```typescript
async put(path: string, data: any, options?: PutOptions): Promise<void>
```

#### Parameters

- **path** (string): The file path where data will be stored
- **data** (any): The data to store (string, object, or Uint8Array)
- **options** (PutOptions, optional): Configuration options
  - `mediaType` (string): MIME type for the file
  - `timestamp` (number): Custom timestamp (milliseconds since epoch)

#### Automatic Encoding

- Objects are encoded as CBOR
- Strings are encoded as UTF-8
- Uint8Array stored as-is
- Media type auto-detected from file extension if not provided

#### Example

```typescript
// Store text
await s5.fs.put("home/notes.txt", "My notes here");

// Store JSON data (encoded as CBOR)
await s5.fs.put("home/data.json", {
  name: "Test",
  values: [1, 2, 3],
});

// Store with custom media type
await s5.fs.put("home/styles.css", cssContent, {
  mediaType: "text/css",
});

// Store with custom timestamp
await s5.fs.put("home/backup.txt", "content", {
  timestamp: Date.now() - 86400000, // 1 day ago
});
```

### getMetadata(path)

Retrieve metadata about a file or directory without downloading the content.

```typescript
async getMetadata(path: string): Promise<Record<string, any> | undefined>
```

#### Parameters

- **path** (string): The file or directory path

#### Returns

- Metadata object for the file/directory
- `undefined` if the path doesn't exist

#### File Metadata

```typescript
{
  type: "file",
  name: "example.txt",
  size: 1234,              // Size in bytes
  mediaType: "text/plain",
  timestamp: 1705432100000, // Milliseconds since epoch
  hash: "..."              // File hash
}
```

#### Directory Metadata

```typescript
{
  type: "directory",
  name: "documents",
  fileCount: 10,       // Number of files
  directoryCount: 3    // Number of subdirectories
}
```

#### Example

```typescript
const fileMeta = await s5.fs.getMetadata("home/document.pdf");
if (fileMeta) {
  console.log(`Size: ${fileMeta.size} bytes`);
  console.log(`Type: ${fileMeta.mediaType}`);
}

const dirMeta = await s5.fs.getMetadata("home/photos");
if (dirMeta) {
  console.log(`Contains ${dirMeta.fileCount} files`);
}
```

### delete(path)

Delete a file or empty directory.

```typescript
async delete(path: string): Promise<boolean>
```

#### Parameters

- **path** (string): The file or directory path to delete

#### Returns

- `true` if successfully deleted
- `false` if the path doesn't exist

#### Notes

- Only empty directories can be deleted
- Root directories ("home", "archive") cannot be deleted
- Parent directory must exist

#### Example

```typescript
// Delete a file
const deleted = await s5.fs.delete("home/temp.txt");
console.log(deleted ? "Deleted" : "Not found");

// Delete an empty directory
await s5.fs.delete("home/old-folder");

// Returns false for non-existent paths
const result = await s5.fs.delete("home/ghost.txt"); // false
```

### list(path, options?)

List contents of a directory with optional cursor-based pagination.

```typescript
async *list(path: string, options?: ListOptions): AsyncIterableIterator<ListResult>
```

#### Parameters

- **path** (string): The directory path
- **options** (ListOptions, optional): Configuration options
  - `limit` (number): Maximum items to return
  - `cursor` (string): Resume from a previous position

#### Yields

```typescript
interface ListResult {
  name: string;
  type: "file" | "directory";
  size?: number;         // File size in bytes (for files)
  mediaType?: string;    // MIME type (for files)
  timestamp?: number;    // Milliseconds since epoch
  cursor?: string;       // Pagination cursor
}
```

#### Example

```typescript
// List all items
for await (const item of s5.fs.list("home")) {
  console.log(`${item.type}: ${item.name}`);
}

// List with limit
for await (const item of s5.fs.list("home", { limit: 10 })) {
  console.log(item.name);
}

// Pagination example
const firstPage = [];
let lastCursor;

for await (const item of s5.fs.list("home/docs", { limit: 20 })) {
  firstPage.push(item);
  lastCursor = item.cursor;
}

// Get next page
for await (const item of s5.fs.list("home/docs", {
  cursor: lastCursor,
  limit: 20,
})) {
  console.log(item.name);
}
```

## Types and Interfaces

### PutOptions

```typescript
interface PutOptions {
  mediaType?: string; // MIME type (e.g., "text/plain", "image/jpeg")
  timestamp?: number; // Custom timestamp (milliseconds since epoch)
}
```

### GetOptions

```typescript
interface GetOptions {
  defaultMediaType?: string; // Default media type for content interpretation
}
```

### ListOptions

```typescript
interface ListOptions {
  limit?: number; // Maximum items to return
  cursor?: string; // Pagination cursor from previous result
}
```

### ListResult

```typescript
interface ListResult {
  name: string;
  type: "file" | "directory";
  size?: number;         // File size in bytes (for files)
  mediaType?: string;    // MIME type (for files)
  timestamp?: number;    // Milliseconds since epoch
  cursor?: string;       // Opaque cursor for pagination
}
```

## Path Resolution

- Paths use forward slashes (`/`) as separators
- Leading slash is optional: `"home/file.txt"` equals `"/home/file.txt"`
- Empty path (`""`) refers to the root directory
- Paths are case-sensitive
- UTF-8 characters are supported in file and directory names
- Avoid trailing slashes except for clarity

## Cursor-Based Pagination

The `list()` method supports efficient pagination through large directories using cursors.

### How Cursors Work

- Each item in a listing includes a `cursor` field
- The cursor encodes the position of that item deterministically
- To get the next page, pass the last item's cursor to the next `list()` call
- Cursors are stable - the same position produces the same cursor
- Cursors are opaque base64url-encoded strings - don't parse or modify them
- Invalid cursors will throw an "Invalid cursor" error

### Pagination Example

```typescript
async function listAllItems(path: string, pageSize: number = 100) {
  const allItems = [];
  let cursor: string | undefined;

  while (true) {
    let hasItems = false;

    for await (const item of s5.fs.list(path, { cursor, limit: pageSize })) {
      allItems.push(item);
      cursor = item.cursor;
      hasItems = true;
    }

    if (!hasItems) break;
  }

  return allItems;
}
```

### Cursor Stability

- Cursors remain valid as long as the directory structure is stable
- Adding items after the cursor position doesn't invalidate it
- Deleting items before the cursor may cause skipped entries
- Cursors encode position, type, and name for stability

## Error Handling

All methods handle errors gracefully:

### Common Errors

```typescript
try {
  await s5.fs.put("invalid/path", "content");
} catch (error) {
  if (error.message.includes("does not exist")) {
    // Parent directory doesn't exist
  }
}

try {
  await s5.fs.delete("home"); // Cannot delete root
} catch (error) {
  console.error("Cannot delete root directory");
}
```

### Invalid Cursor Errors

```typescript
try {
  for await (const item of s5.fs.list("home", { cursor: "invalid!" })) {
    // ...
  }
} catch (error) {
  if (error.message.includes("Invalid cursor")) {
    // Handle invalid cursor - start from beginning
    for await (const item of s5.fs.list("home")) {
      // ...
    }
  }
}
```

## Examples

### File Management

```typescript
// Create a project structure
const files = {
  "home/project/README.md": "# My Project\n\nDescription here",
  "home/project/src/index.js": "console.log('Hello');",
  "home/project/package.json": {
    name: "my-project",
    version: "1.0.0",
    main: "src/index.js",
  },
};

// Upload all files
for (const [path, content] of Object.entries(files)) {
  await s5.fs.put(path, content);
}

// Verify structure
async function printTree(path: string, indent = "") {
  for await (const item of s5.fs.list(path)) {
    console.log(
      `${indent}${item.type === "directory" ? "📁" : "📄"} ${item.name}`
    );
    if (item.type === "directory") {
      await printTree(`${path}/${item.name}`, indent + "  ");
    }
  }
}

await printTree("home/project");
```

### Batch Operations with Progress

```typescript
async function uploadDirectory(localPath: string, s5Path: string) {
  const files = await getLocalFiles(localPath); // Your implementation
  let uploaded = 0;

  for (const file of files) {
    const content = await readFile(file.path);
    await s5.fs.put(`${s5Path}/${file.relativePath}`, content, {
      mediaType: file.mimeType,
    });

    uploaded++;
    console.log(`Progress: ${uploaded}/${files.length}`);
  }
}
```

### Clean-up Operations

```typescript
async function cleanupTempFiles(basePath: string) {
  let cleaned = 0;

  for await (const item of s5.fs.list(basePath)) {
    if (item.type === "file" && item.name.endsWith(".tmp")) {
      const deleted = await s5.fs.delete(`${basePath}/${item.name}`);
      if (deleted) cleaned++;
    } else if (item.type === "directory") {
      // Recursively clean subdirectories
      await cleanupTempFiles(`${basePath}/${item.name}`);
    }
  }

  console.log(`Cleaned ${cleaned} temporary files`);
}
```

## Integration with FS5 Class Methods

The path-based API methods work alongside the existing FS5 class methods. Both use the same underlying DirV1 format:

```typescript
// Use existing FS5 methods (now using DirV1 format)
const fileVersion = await s5.fs.uploadBlobWithoutEncryption(blob);
await s5.fs.createFile("home", "newfile.txt", fileVersion, "text/plain");

// Access the same file via path API
const content = await s5.fs.get("home/newfile.txt");

// Mix approaches as needed - all using DirV1 format
await s5.fs.createDirectory("home", "newfolder");
await s5.fs.put("home/newfolder/data.json", { created: Date.now() });
```

**Note**: All methods now use the new CBOR/DirV1 format. There is no compatibility with old S5 data.

## Best Practices

1. **Path Format**: Use forward slashes (`/`) without leading slashes
2. **Error Handling**: Always wrap API calls in try-catch blocks
3. **Pagination**: Use cursors for directories with many items (>100)
4. **Media Types**: Explicitly specify media types for better content handling
5. **Batch Operations**: Group related operations when possible
6. **Directory Creation**: Intermediate directories are created automatically with `put()`
7. **Binary Data**: Use Uint8Array for binary content
8. **Timestamps**: Use milliseconds since epoch for consistency

## Limitations

- Cannot delete non-empty directories
- Cannot store data directly at the root path
- Cursor pagination is forward-only (no backwards navigation)
- Maximum file size depends on S5 network limits
- Path segments cannot contain forward slashes
- Root directories ("home", "archive") are immutable

## HAMT (Hash Array Mapped Trie) Support

The Enhanced S5.js implementation includes automatic HAMT sharding for efficient handling of large directories. This feature activates transparently when directories exceed 1000 entries.

### How HAMT Works

- **Automatic Activation**: Directories automatically convert to HAMT structure at 1000+ entries
- **Transparent Operation**: All existing API methods work seamlessly with sharded directories
- **Performance**: O(log n) access time for directories with millions of entries
- **Lazy Loading**: HAMT nodes are loaded on-demand for memory efficiency
- **Deterministic**: Uses xxhash64 for consistent sharding across implementations

### HAMT Behavior

When a directory reaches the sharding threshold:

1. The directory structure automatically converts to HAMT format
2. Entries are distributed across multiple nodes based on hash values
3. All operations continue to work without code changes
4. Performance remains consistent even with millions of entries

### Working with Large Directories

```typescript
// Adding many files - HAMT activates automatically
for (let i = 0; i < 10000; i++) {
  await s5.fs.put(`home/large-dir/file${i}.txt`, `Content ${i}`);
}

// Listing still works normally with cursor pagination
for await (const item of s5.fs.list("home/large-dir", { limit: 100 })) {
  console.log(item.name); // Efficiently iterates through sharded structure
}

// Direct access remains fast even with millions of entries
const file = await s5.fs.get("home/large-dir/file9999.txt");
console.log(file); // O(log n) lookup time
```

### HAMT Implementation Details

- **Branching Factor**: 32-way branching using 5-bit chunks
- **Hash Function**: xxhash64 for key distribution
- **Node Types**: Internal nodes (pointers) and leaf nodes (entries)
- **Serialization**: CBOR format matching Rust S5 implementation
- **Memory Efficient**: Nodes loaded only when accessed

## Directory Utilities (Phase 4)

Phase 4 adds powerful utility classes for recursive directory operations and batch processing.

### DirectoryWalker

The `DirectoryWalker` class provides efficient recursive directory traversal with cursor support for resumable operations.

#### Constructor

```typescript
import { DirectoryWalker } from "@s5-dev/s5js";

const walker = new DirectoryWalker(s5.fs, '/home/projects');
```

#### walk(options?)

Recursively traverse a directory tree, yielding entries as they are discovered.

```typescript
interface WalkOptions {
  recursive?: boolean;      // Whether to recurse into subdirectories (default: true)
  maxDepth?: number;        // Maximum depth to traverse
  includeFiles?: boolean;   // Whether to include files in results (default: true)
  includeDirectories?: boolean; // Whether to include directories in results (default: true)
  filter?: (name: string, type: 'file' | 'directory') => boolean;  // Filter entries
  cursor?: string;          // Resume from cursor position
}

interface WalkResult {
  path: string;             // Full path to the entry
  name: string;             // Entry name
  type: 'file' | 'directory'; // Type of entry
  size?: number;            // Size in bytes (for files)
  depth: number;            // Depth from starting directory
  cursor?: string;          // Cursor for resuming
}

// Basic usage
const walker = new DirectoryWalker(s5.fs, "home/projects");
for await (const result of walker.walk()) {
  console.log(`${result.path} (depth: ${result.depth})`);
}

// With options
const walker2 = new DirectoryWalker(s5.fs, "home");
for await (const result of walker2.walk({
  maxDepth: 2,
  filter: (name, type) => !name.startsWith(".")  // Skip hidden files
})) {
  if (result.type === 'file') {
    console.log(`File: ${result.path} (${result.size} bytes)`);
  } else {
    console.log(`Dir: ${result.path}`);
  }
}

// Resumable walk with cursor
const walker3 = new DirectoryWalker(s5.fs, "home/large-dir");
let lastCursor: string | undefined;
try {
  for await (const result of walker3.walk({ cursor: savedCursor })) {
    lastCursor = result.cursor;
    // Process entry...
  }
} catch (error) {
  // Can resume from lastCursor
  await saveResumePoint(lastCursor);
}
```

#### count(options?)

Count entries in a directory tree without loading all data.

```typescript
interface WalkStats {
  files: number;
  directories: number;
  totalSize: number;
}

const walker = new DirectoryWalker(s5.fs, "home/projects");
const stats = await walker.count({ recursive: true });
console.log(`Files: ${stats.files}, Dirs: ${stats.directories}, Size: ${stats.totalSize}`);
```

### BatchOperations

The `BatchOperations` class provides high-level operations for copying and deleting entire directory trees with progress tracking and error handling.

#### Constructor

```typescript
import { BatchOperations } from "@s5-dev/s5js";

const batch = new BatchOperations(s5.fs);
```

#### copyDirectory(sourcePath, destPath, options?)

Copy an entire directory tree to a new location.

```typescript
interface BatchOptions {
  recursive?: boolean;       // Copy subdirectories (default: true)
  onProgress?: (progress: BatchProgress) => void;  // Progress callback
  onError?: "stop" | "continue" | ((error: Error, path: string) => "stop" | "continue");
  cursor?: string;           // Resume from cursor
  preserveMetadata?: boolean; // Preserve file metadata (default: true)
}

interface BatchProgress {
  operation: "copy" | "delete";
  total?: number;
  processed: number;
  currentPath: string;
  cursor?: string;
}

interface BatchResult {
  success: number;
  failed: number;
  errors: Array<{ path: string; error: Error }>;
  cursor?: string;          // For resuming if interrupted
}

// Basic copy
const result = await batch.copyDirectory("home/source", "home/backup");
console.log(`Copied ${result.success} items`);

// With progress tracking
const result = await batch.copyDirectory("home/photos", "archive/photos-2024", {
  onProgress: (progress) => {
    console.log(`Copying ${progress.currentPath} (${progress.processed} done)`);
  },
  onError: "continue"  // Continue on errors
});

if (result.failed > 0) {
  console.log(`Failed to copy ${result.failed} items:`);
  result.errors.forEach(e => console.log(`  ${e.path}: ${e.error.message}`));
}

// Resumable copy
let resumeCursor = savedCursor; // From previous interrupted operation
const result = await batch.copyDirectory("home/large-project", "backup/project", {
  cursor: resumeCursor,
  onProgress: (progress) => {
    // Save cursor periodically for resume capability
    if (progress.processed % 100 === 0) {
      saveCursor(progress.cursor);
    }
  }
});
```

#### deleteDirectory(path, options?)

Delete a directory and optionally all its contents.

```typescript
// Delete empty directory only
await batch.deleteDirectory("home/temp", { recursive: false });

// Delete directory tree
const result = await batch.deleteDirectory("home/old-project", {
  recursive: true,
  onProgress: (progress) => {
    console.log(`Deleting ${progress.currentPath} (${progress.processed}/${progress.total})`);
  }
});

// With error handling
const result = await batch.deleteDirectory("home/cache", {
  recursive: true,
  onError: (error, path) => {
    if (error.message.includes("permission")) {
      console.log(`Skipping protected file: ${path}`);
      return "continue";
    }
    return "stop";
  }
});
```

### Directory Utility Examples

#### Backup with Progress

```typescript
async function backupDirectory(source: string, dest: string) {
  const batch = new BatchOperations(s5.fs);
  const startTime = Date.now();
  
  console.log(`Starting backup of ${source}...`);
  
  const result = await batch.copyDirectory(source, dest, {
    onProgress: (progress) => {
      process.stdout.write(`\rProcessed: ${progress.processed} items`);
    },
    onError: "continue"
  });
  
  const duration = (Date.now() - startTime) / 1000;
  console.log(`\nBackup complete in ${duration}s`);
  console.log(`Success: ${result.success}, Failed: ${result.failed}`);
  
  if (result.failed > 0) {
    const logPath = `${dest}-errors.log`;
    const errorLog = result.errors.map(e => 
      `${e.path}: ${e.error.message}`
    ).join('\n');
    await s5.fs.put(logPath, errorLog);
    console.log(`Error log saved to ${logPath}`);
  }
}
```

#### Find Large Files

```typescript
async function findLargeFiles(path: string, minSize: number) {
  const walker = new DirectoryWalker(s5.fs, path);
  const largeFiles: Array<{ path: string; size: number }> = [];
  
  for await (const result of walker.walk(path)) {
    if (result.type === 'file' && result.size && result.size > minSize) {
      largeFiles.push({
        path: result.path,
        size: result.size
      });
    }
  }
  
  // Sort by size descending
  largeFiles.sort((a, b) => b.size - a.size);
  
  return largeFiles;
}

// Find files larger than 100MB
const largeFiles = await findLargeFiles("home", 100 * 1024 * 1024);
largeFiles.forEach(f => {
  console.log(`${f.path}: ${(f.size / 1024 / 1024).toFixed(2)} MB`);
});
```

#### Directory Synchronization

```typescript
async function syncDirectories(source: string, dest: string) {
  const batch = new BatchOperations(s5.fs);
  
  // First, copy new and updated files
  const copyResult = await batch.copyDirectory(source, dest, {
    preserveMetadata: true,
    onError: "continue"
  });
  
  // Then, remove files that exist in dest but not in source
  const sourceWalker = new DirectoryWalker(s5.fs, source);
  const sourceFiles = new Set<string>();
  for await (const result of sourceWalker.walk()) {
    sourceFiles.add(result.path.substring(source.length));
  }
  
  const destWalker = new DirectoryWalker(s5.fs, dest);
  const toDelete: string[] = [];
  for await (const result of destWalker.walk()) {
    const relativePath = result.path.substring(dest.length);
    if (!sourceFiles.has(relativePath)) {
      toDelete.push(result.path);
    }
  }
  
  // Delete orphaned files
  for (const path of toDelete) {
    await s5.fs.delete(path);
  }
  
  console.log(`Sync complete: ${copyResult.success} copied, ${toDelete.length} deleted`);
}
```

## Performance Considerations

- **Directory Caching**: Directory metadata is cached during path traversal
- **Efficient Pagination**: Use cursors to avoid loading entire large directories
- **Batch Registry Updates**: Multiple operations in succession are optimised
- **Network Latency**: Operations require network round-trips to S5 portals
- **CBOR Efficiency**: Object data is stored efficiently using CBOR encoding
- **HAMT Performance**: Automatic sharding maintains O(log n) performance for large directories
- **Walker Efficiency**: DirectoryWalker uses depth-first traversal with lazy loading
- **Batch Operations**: Progress callbacks allow for UI updates without blocking
- **Resumable Operations**: Cursor support enables efficient resume after interruption

## Performance Testing

To run performance benchmarks and verify HAMT efficiency:

### Local Mock Benchmarks (Fast)

```bash
# Basic HAMT verification
node test/integration/test-hamt-local-simple.js

# Comprehensive scaling test (up to 100K entries)  
node test/integration/test-hamt-mock-comprehensive.js
```

### Real Portal Benchmarks (Network)

```bash
# Minimal real portal test
node test/integration/test-hamt-real-minimal.js

# HAMT activation threshold test
node test/integration/test-hamt-activation-real.js

# Full portal performance analysis
node test/integration/test-hamt-real-portal.js
```

See [BENCHMARKS.md](./BENCHMARKS.md) for detailed performance results.

## Next Steps

- Review the [test suite](https://github.com/julesl23/s5.js/tree/main/test/fs) for comprehensive usage examples
- Check [TypeScript definitions](https://github.com/julesl23/s5.js/blob/main/src/fs/dirv1/types.ts) for complete type information
- Explore [S5 network documentation](https://docs.sfive.net/) for deeper understanding
- See the [grant proposal](https://github.com/julesl23/s5.js/blob/main/docs/MILESTONES.md) for upcoming features

---

_This documentation covers Phase 2, Phase 3, and Phase 4 of the Enhanced S5.js grant project. Phase 3 added automatic HAMT sharding for efficient handling of large directories. Phase 4 added the DirectoryWalker and BatchOperations utilities for recursive directory operations. Future phases will add media processing capabilities including thumbnail generation and progressive image loading._
