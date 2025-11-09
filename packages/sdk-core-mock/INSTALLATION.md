# Installing @fabstir/sdk-core-mock

Quick guide for UI developers to get started with the mock SDK.

## Option 1: Install from Tarball (Recommended)

The mock SDK has been packaged as a tarball for easy distribution.

### Step 1: Install the package

```bash
# From your UI project directory
npm install /path/to/fabstir-sdk-core-mock-0.1.0.tgz
```

Or with pnpm:

```bash
pnpm add /path/to/fabstir-sdk-core-mock-0.1.0.tgz
```

### Step 2: Import and use

```typescript
import { FabstirSDKCoreMock } from '@fabstir/sdk-core-mock';

const sdk = new FabstirSDKCoreMock({
  userAddress: '0x1234567890ABCDEF1234567890ABCDEF12345678'
});

await sdk.authenticate('any-password');

// Now you can use all managers
const sessionGroupManager = sdk.getSessionGroupManager();
const groups = await sessionGroupManager.listSessionGroups();
```

## Option 2: Link from Workspace (Monorepo Development)

If you're developing within the Fabstir monorepo:

### Step 1: Build the mock SDK

```bash
cd packages/sdk-core-mock
pnpm build
```

### Step 2: Link in your UI project

The mock SDK is already configured as a workspace package, so you can just import it:

```typescript
import { FabstirSDKCoreMock } from '@fabstir/sdk-core-mock';
```

## Package Contents

The tarball includes:

- **Built JavaScript** (`dist/` folder with compiled .js files)
- **TypeScript Declarations** (.d.ts files for IDE autocomplete)
- **Source Code** (`src/` folder for debugging)
- **Comprehensive README** (usage examples and API reference)

Total package size: **34.6 KB** (177.5 KB unpacked)

## Verification

After installation, verify the package works:

```bash
# Create a test file
cat > test-mock-sdk.js << 'EOF'
const { FabstirSDKCoreMock } = require('@fabstir/sdk-core-mock');

async function test() {
  const sdk = new FabstirSDKCoreMock({ userAddress: '0x123' });
  await sdk.authenticate('test');

  const sessionGroupManager = sdk.getSessionGroupManager();
  const groups = await sessionGroupManager.listSessionGroups();

  console.log(`✅ Mock SDK working! Found ${groups.length} session groups`);
}

test().catch(console.error);
EOF

# Run the test
node test-mock-sdk.js
```

Expected output:
```
[Mock] Initializing session groups with mock data
✅ Mock SDK working! Found 5 session groups
```

## Next Steps

1. Read the full [README.md](./README.md) for detailed API documentation
2. Check the UI mockups at `/workspace/docs/ui4-reference/UI_MOCKUPS.md`
3. Follow implementation guide at `/workspace/docs/ui4-reference/UI_IMPLEMENTATION_SESSION_GROUPS.md`
4. Start building your UI components!

## Support

For issues or questions:
- Main SDK documentation: `/workspace/docs/SDK_API.md`
- Quick reference: `/workspace/docs/SDK_QUICK_REFERENCE.md`
- UI developer chat guide: `/workspace/docs/UI_DEVELOPER_CHAT_GUIDE.md`

---

**Happy UI development! 🎨**
