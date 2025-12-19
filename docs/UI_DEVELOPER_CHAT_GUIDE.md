# Fabstir LLM Chat UI - Complete Developer Guide

## 📋 Overview

This guide shows you how to build a **production-quality**, professional chat interface for the Fabstir P2P LLM marketplace using `@fabstir/sdk-core`. You'll create a ChatGPT-like experience with modern UI components, smooth animations, gasless transactions via Base Account Kit, and excellent UX.

**Key Principle**: The SDK handles ALL blockchain and LLM complexity. You focus on building a beautiful, responsive UI using industry-standard components.

**Reference Implementation**: See `/workspace/apps/harness/pages/chat-context-demo.tsx` for a complete working example (1833 lines of production code).

---

## 🎯 What You're Building

A professional chat application with:
- ✅ Modern UI using shadcn/ui + @assistant-ui/react
- ✅ Multi-wallet support (MetaMask, Coinbase Wallet, WalletConnect) via RainbowKit
- ✅ Base Account Kit integration for gasless transactions
- ✅ Automatic host discovery from blockchain
- ✅ Session creation with USDC or ETH payments
- ✅ Real-time WebSocket streaming responses with smooth animations
- ✅ Context-aware conversations with message history
- ✅ Cost tracking with beautiful charts (Recharts)
- ✅ Toast notifications for all user feedback
- ✅ S5 decentralized storage for conversation persistence
- ✅ Persistent user settings with cross-device sync
- ✅ Responsive design (mobile + desktop)
- ✅ Professional loading states and error handling

**Architecture**: Next.js/React → SDK → Smart Contracts + LLM Nodes

---

## 📦 Part 1: Project Setup

### 1.1 Prerequisites

- Node.js 18+ required
- pnpm (recommended) or npm
- Access to `@fabstir/sdk-core` package
- Base Sepolia testnet USDC (https://faucet.circle.com)
- Base Sepolia ETH for gas fees
- Basic React/Next.js knowledge

### 1.2 Create Next.js Project

```bash
npx create-next-app@latest fabstir-chat --typescript --tailwind --app
cd fabstir-chat
```

### 1.3 Install ALL Dependencies

#### Core SDK & Web3
```bash
# Fabstir SDK
# Option A: Link local development version
cd ~/path/to/fabstir-llm-sdk/packages/sdk-core
pnpm build
npm link
cd ~/fabstir-chat
npm link @fabstir/sdk-core

# Option B: Install from tarball (provided by team)
npm install ~/path/to/fabstir-sdk-core-1.1.0.tgz

# Web3 & Wallet (CRITICAL - don't skip these!)
npm install ethers@6.13.4
npm install viem@2.x
npm install @base-org/account@^2.3.1      # Base Account Kit for gasless txns
npm install @rainbow-me/rainbowkit wagmi @tanstack/react-query  # Multi-wallet support
```

#### UI Components & Libraries
```bash
# shadcn/ui - Modern, accessible React components (ESSENTIAL!)
npx shadcn@latest init
# When prompted:
# - TypeScript: Yes
# - Style: Default
# - Base color: Slate
# - CSS variables: Yes

# Install shadcn components
npx shadcn@latest add button card dialog dropdown-menu toast
npx shadcn@latest add table avatar badge separator
npx shadcn@latest add input textarea label
npx shadcn@latest add scroll-area

# Chat UI components (gives ChatGPT-like interface!)
npm install @assistant-ui/react @assistant-ui/react-markdown

# Icons & utilities
npm install lucide-react clsx tailwind-merge class-variance-authority

# Charts for cost visualization
npm install recharts

# Animation libraries
npm install framer-motion

# Modern UI effects (optional but recommended)
# Install magicui and aceternity components manually from their websites:
# - magicui.design (ShimmerButton, PulseLoader, AnimatedGradient)
# - ui.aceternity.com (HeroParallax, CardSpotlight)
```

**IMPORTANT**: The SDK is built with `pnpm`. Do NOT use `npm install` in the SDK repo - it causes dependency hoisting issues. Use `pnpm` for the SDK, but `npm` is fine for your UI app.

### 1.4 Environment Variables

Create `.env.local`:

```bash
# RPC URLs (REQUIRED)
NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA=https://base-sepolia.g.alchemy.com/v2/YOUR_API_KEY

# Chain Configuration
NEXT_PUBLIC_CHAIN_ID=84532  # Base Sepolia

# WalletConnect Project ID (get from https://cloud.walletconnect.com)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here

# S5 Storage (Optional - for conversation persistence)
NEXT_PUBLIC_S5_PORTAL_URL=wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p

# DO NOT PUT CONTRACT ADDRESSES HERE
# The SDK uses ChainRegistry which reads from its internal .env.test
# Contact Fabstir team if you need to override contract addresses
```

**CRITICAL**: Contract addresses come from ChainRegistry, NOT environment variables. The SDK team manages the single source of truth in `.env.test`.

### 1.5 Next.js Configuration

Update `next.config.js`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for SDK browser compatibility
  transpilePackages: [
    '@fabstir/sdk-core',
    '@rainbow-me/rainbowkit',
    '@assistant-ui/react'
  ],

  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      crypto: false,
    };

    // Suppress punycode deprecation warning
    config.ignoreWarnings = [
      { module: /node_modules\/punycode/ }
    ];

    // Add externals for node-only packages
    config.externals.push('pino-pretty', 'encoding');

    return config;
  },
};

module.exports = nextConfig;
```

### 1.6 Configure RainbowKit + Wagmi

Create `lib/wagmi-config.ts`:

```typescript
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { baseSepolia } from 'wagmi/chains';

export const wagmiConfig = getDefaultConfig({
  appName: 'Fabstir Chat',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
  chains: [baseSepolia],
  ssr: true,
});
```

### 1.7 Set Up Providers

Create `app/providers.tsx`:

```typescript
'use client';

import '@rainbow-me/rainbowkit/styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { wagmiConfig } from '@/lib/wagmi-config';
import { Toaster } from '@/components/ui/toaster';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 5000,
      },
    },
  }));

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          {children}
          <Toaster />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

Update `app/layout.tsx`:

```typescript
import { Providers } from './providers';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### 1.8 Configure Tailwind for shadcn

Update `tailwind.config.ts`:

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        shimmer: 'shimmer 2s linear infinite',
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
```

---

## 🏗️ Part 2: SDK Integration with React Query

### 2.1 Create Custom Hooks for SDK

Create `hooks/use-fabstir-sdk.ts`:

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { FabstirSDKCore, ChainRegistry, ChainId } from '@fabstir/sdk-core';
import type {
  PaymentManager,
  SessionManager,
  HostManager,
  StorageManager,
  TreasuryManager
} from '@fabstir/sdk-core';

export function useFabstirSDK() {
  const { toast } = useToast();

  // SDK State
  const [sdk, setSdk] = useState<FabstirSDKCore | null>(null);
  const [sessionManager, setSessionManager] = useState<SessionManager | null>(null);
  const [paymentManager, setPaymentManager] = useState<PaymentManager | null>(null);
  const [hostManager, setHostManager] = useState<HostManager | null>(null);
  const [storageManager, setStorageManager] = useState<StorageManager | null>(null);
  const [treasuryManager, setTreasuryManager] = useState<TreasuryManager | null>(null);

  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userAddress, setUserAddress] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(true);

  // Initialize SDK on mount
  useEffect(() => {
    initializeSDK();
  }, []);

  const initializeSDK = useCallback(async () => {
    try {
      setIsInitializing(true);

      // Get chain configuration from ChainRegistry
      const chain = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);

      const sdkConfig = {
        mode: 'production' as const,
        chainId: ChainId.BASE_SEPOLIA,
        rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA!,

        // Contract addresses from ChainRegistry
        contractAddresses: {
          jobMarketplace: chain.contracts.jobMarketplace,
          nodeRegistry: chain.contracts.nodeRegistry,
          proofSystem: chain.contracts.proofSystem,
          hostEarnings: chain.contracts.hostEarnings,
          fabToken: chain.contracts.fabToken,
          usdcToken: chain.contracts.usdcToken,
          modelRegistry: chain.contracts.modelRegistry,
        },

        // S5 storage for conversation persistence
        s5Config: {
          portalUrl: process.env.NEXT_PUBLIC_S5_PORTAL_URL,
        }
      };

      const newSdk = new FabstirSDKCore(sdkConfig);
      setSdk(newSdk);

      console.log('✅ SDK initialized successfully');

      toast({
        title: 'SDK Ready',
        description: 'Fabstir SDK initialized successfully',
      });

    } catch (error: any) {
      console.error('SDK initialization failed:', error);
      toast({
        title: 'Initialization Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsInitializing(false);
    }
  }, [toast]);

  const authenticate = useCallback(async (method: 'metamask' | 'base-account' = 'metamask') => {
    if (!sdk) {
      toast({
        title: 'SDK Not Ready',
        description: 'Please wait for SDK to initialize',
        variant: 'destructive',
      });
      return;
    }

    try {
      if (method === 'metamask') {
        // Check if MetaMask is installed
        if (!window.ethereum) {
          toast({
            title: 'MetaMask Not Found',
            description: 'Please install MetaMask to continue',
            variant: 'destructive',
          });
          return;
        }

        // Authenticate with MetaMask
        await sdk.authenticate('metamask');
      } else if (method === 'base-account') {
        // Base Account Kit authentication
        // This is handled separately - see section 2.3
        throw new Error('Use connectWithBaseAccount() for Base Account Kit');
      }

      // Get user address
      const signer = sdk.getSigner();
      if (!signer) {
        throw new Error('Signer not available after authentication');
      }
      const address = await signer.getAddress();
      setUserAddress(address);

      // Get all managers
      const pm = sdk.getPaymentManager();
      const sm = sdk.getSessionManager();
      const hm = sdk.getHostManager();
      const stm = sdk.getStorageManager();
      const tm = sdk.getTreasuryManager();

      setPaymentManager(pm);
      setSessionManager(sm);
      setHostManager(hm);
      setStorageManager(stm);
      setTreasuryManager(tm);
      setIsAuthenticated(true);

      toast({
        title: 'Connected',
        description: `Wallet connected: ${address.slice(0, 6)}...${address.slice(-4)}`,
      });

    } catch (error: any) {
      console.error('Authentication failed:', error);
      toast({
        title: 'Authentication Failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [sdk, toast]);

  return {
    sdk,
    sessionManager,
    paymentManager,
    hostManager,
    storageManager,
    treasuryManager,
    isAuthenticated,
    userAddress,
    isInitializing,
    authenticate,
  };
}
```

### 2.2 Wallet Connection with RainbowKit

Create `components/wallet-connect-button.tsx`:

```typescript
'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Button } from '@/components/ui/button';

export function WalletConnectButton() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              style: {
                opacity: 0,
                pointerEvents: 'none',
                userSelect: 'none',
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <Button onClick={openConnectModal} size="lg">
                    Connect Wallet
                  </Button>
                );
              }

              if (chain.unsupported) {
                return (
                  <Button onClick={openChainModal} variant="destructive" size="lg">
                    Wrong Network
                  </Button>
                );
              }

              return (
                <div className="flex gap-2">
                  <Button
                    onClick={openChainModal}
                    variant="outline"
                    size="lg"
                  >
                    {chain.hasIcon && (
                      <div
                        style={{
                          background: chain.iconBackground,
                          width: 12,
                          height: 12,
                          borderRadius: 999,
                          overflow: 'hidden',
                          marginRight: 4,
                        }}
                      >
                        {chain.iconUrl && (
                          <img
                            alt={chain.name ?? 'Chain icon'}
                            src={chain.iconUrl}
                            style={{ width: 12, height: 12 }}
                          />
                        )}
                      </div>
                    )}
                    {chain.name}
                  </Button>

                  <Button onClick={openAccountModal} size="lg">
                    {account.displayName}
                    {account.displayBalance
                      ? ` (${account.displayBalance})`
                      : ''}
                  </Button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
```

### 2.3 Base Account Kit Integration

Create `lib/base-account.ts`:

```typescript
import { createBaseAccountSDK } from '@base-org/account';

let baseAccountSDK: any = null;

export function createSDK() {
  if (!baseAccountSDK) {
    baseAccountSDK = createBaseAccountSDK({
      apiKey: process.env.NEXT_PUBLIC_CDP_API_KEY || '',
    });
  }
  return baseAccountSDK;
}

export async function connectBaseWallet() {
  const sdk = createSDK();

  // This will trigger the passkey/biometric prompt
  const accounts = await sdk.connect();

  return accounts;
}

export async function getAccountInfo(address: string) {
  const sdk = createSDK();

  // Get smart account address
  const accountInfo = await sdk.getAccountInfo(address);

  return accountInfo;
}
```

Create `hooks/use-base-account.ts`:

```typescript
'use client';

import { useState, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { createSDK, connectBaseWallet, getAccountInfo } from '@/lib/base-account';
import { ensureSubAccount } from '@fabstir/sdk-core/wallet';

export function useBaseAccount() {
  const { toast } = useToast();
  const [baseAccountSDK, setBaseAccountSDK] = useState<any>(null);
  const [primaryAccount, setPrimaryAccount] = useState<string>('');
  const [subAccount, setSubAccount] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);

  const connectWithBaseAccount = useCallback(async (sdk: any) => {
    try {
      setIsConnecting(true);

      // CRITICAL: Call Base Account SDK IMMEDIATELY to open popup in user interaction context
      const bas = createSDK();
      const accounts = await connectBaseWallet();

      setBaseAccountSDK(bas);

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts returned from Base Account Kit');
      }

      const walletAddress = accounts[0]!;
      const accountInfo = await getAccountInfo(walletAddress);
      const smartWallet = accountInfo.smartAccount || walletAddress;

      setPrimaryAccount(smartWallet);

      // Get or create sub-account with Auto Spend Permissions
      toast({
        title: 'Setting up Sub-Account',
        description: 'Checking for sub-account with spending permissions...',
      });

      const provider = bas.getProvider();
      const sub = await ensureSubAccount(
        provider,
        smartWallet as `0x${string}`,
        {
          tokenAddress: process.env.NEXT_PUBLIC_USDC_TOKEN_ADDRESS as `0x${string}`,
          tokenDecimals: 6,
          maxAllowance: '1000000', // 1M USDC
          periodDays: 365,
        }
      );

      setSubAccount(sub.address);

      // Authenticate SDK with Base Account signer
      const signer = await provider.getSigner();
      await sdk.authenticate('signer', { signer });

      toast({
        title: 'Base Account Connected',
        description: `Smart wallet: ${smartWallet.slice(0, 6)}...${smartWallet.slice(-4)}`,
      });

      return {
        primaryAccount: smartWallet,
        subAccount: sub.address,
        provider,
      };

    } catch (error: any) {
      console.error('Base Account connection failed:', error);
      toast({
        title: 'Connection Failed',
        description: error.message,
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [toast]);

  return {
    baseAccountSDK,
    primaryAccount,
    subAccount,
    isConnecting,
    connectWithBaseAccount,
  };
}
```

### 2.4 Dual Pricing Display Patterns

The Fabstir marketplace uses a **dual pricing system** where hosts set separate minimum prices for native token (ETH/BNB) and stablecoin (USDC) payments. This section shows you how to query and display pricing correctly in your UI.

#### Understanding Dual Pricing

Hosts register with two pricing values:
- **`minPricePerTokenNative`**: Minimum price in native token (wei for ETH/BNB)
- **`minPricePerTokenStable`**: Minimum price in stablecoins (raw USDC units with 6 decimals)

**Pricing Ranges**:
```typescript
// Native Token (ETH/BNB)
MIN: 2,272,727,273 wei (~$0.00001 @ $4400 ETH)
MAX: 22,727,272,727,273 wei (~$0.1 @ $4400 ETH)
DEFAULT: 11,363,636,363,636 wei (~$0.00005 @ $4400 ETH)

// Stablecoin (USDC)
MIN: 10 (0.00001 USDC per token)
MAX: 100,000 (0.1 USDC per token)
DEFAULT: 316 (0.000316 USDC per token)
```

#### Querying Host Pricing

Create `hooks/use-host-pricing.ts`:

```typescript
'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ethers } from 'ethers';
import type { HostManager } from '@fabstir/sdk-core';

interface HostPricing {
  address: string;
  minPricePerTokenNative: bigint;
  minPricePerTokenStable: bigint;
  // Human-readable formatted values
  nativeEth: string;
  nativeUsd: string;
  stableUsdc: string;
  perThousandTokensUsd: string;
}

export function useHostPricing(
  hostManager: HostManager | null,
  hostAddress: string | undefined,
  ethPriceUsd: number = 4400 // You can fetch this from an oracle
) {
  // Query host pricing
  const {
    data: pricing,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['host-pricing', hostAddress],
    queryFn: async () => {
      if (!hostManager || !hostAddress) {
        throw new Error('Host manager or address not available');
      }

      // Get host info with pricing
      const hostInfo = await hostManager.getHostInfo(hostAddress);

      // Format native pricing
      const nativeEth = ethers.formatEther(hostInfo.minPricePerTokenNative);
      const nativeUsd = (parseFloat(nativeEth) * ethPriceUsd).toFixed(6);

      // Format stable pricing (USDC has 6 decimals)
      const stableUsdc = (Number(hostInfo.minPricePerTokenStable) / 1_000_000).toFixed(6);

      // Calculate cost per 1000 tokens
      const perThousandTokensUsd = (parseFloat(stableUsdc) * 1000).toFixed(2);

      const result: HostPricing = {
        address: hostInfo.address,
        minPricePerTokenNative: hostInfo.minPricePerTokenNative,
        minPricePerTokenStable: hostInfo.minPricePerTokenStable,
        nativeEth,
        nativeUsd,
        stableUsdc,
        perThousandTokensUsd,
      };

      return result;
    },
    enabled: !!hostManager && !!hostAddress,
    staleTime: 30000, // Cache for 30 seconds
  });

  return {
    pricing,
    isLoading,
    error,
    refetch,
  };
}
```

#### Pricing Display Component

Create `components/host-pricing-display.tsx`:

```typescript
'use client';

import { motion } from 'framer-motion';
import { DollarSign, Zap, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface HostPricingDisplayProps {
  pricing: {
    nativeEth: string;
    nativeUsd: string;
    stableUsdc: string;
    perThousandTokensUsd: string;
  } | null;
  isLoading: boolean;
  paymentType?: 'ETH' | 'USDC';
}

export function HostPricingDisplay({
  pricing,
  isLoading,
  paymentType = 'USDC',
}: HostPricingDisplayProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!pricing) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          No pricing information available
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Host Pricing
            <Badge variant="outline" className="ml-auto">
              {paymentType}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Native Token Pricing (ETH/BNB) */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Zap className="w-4 h-4" />
              <span>Native Token (ETH)</span>
            </div>
            <div className="pl-6">
              <p className="text-2xl font-bold">
                {pricing.nativeEth} ETH
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  per token
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                ~${pricing.nativeUsd} USD per token
              </p>
            </div>
          </div>

          {/* Stablecoin Pricing (USDC) */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="w-4 h-4" />
              <span>Stablecoin (USDC)</span>
            </div>
            <div className="pl-6">
              <p className="text-2xl font-bold">
                ${pricing.stableUsdc}
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  per token
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                ~${pricing.perThousandTokensUsd} per 1000 tokens
              </p>
            </div>
          </div>

          {/* Current Selection Highlight */}
          <div className="pt-4 border-t">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Your Selection:</span>
              <Badge variant="secondary" className="text-base">
                {paymentType === 'ETH'
                  ? `${pricing.nativeEth} ETH/token`
                  : `$${pricing.stableUsdc} USDC/token`}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
```

#### Using Pricing in Session Creation

When creating a session, ensure your `pricePerToken` meets the host's minimum:

```typescript
'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { ChainId } from '@fabstir/sdk-core';
import type { SessionManager } from '@fabstir/sdk-core';

export function useSessionWithPricing(sessionManager: SessionManager | null) {
  const { toast } = useToast();

  const startSessionWithPricing = async (
    hostInfo: {
      address: string;
      endpoint: string;
      minPricePerTokenNative: bigint;
      minPricePerTokenStable: bigint;
    },
    paymentType: 'ETH' | 'USDC',
    depositAmount: string
  ) => {
    if (!sessionManager) {
      throw new Error('Session manager not initialized');
    }

    // Get minimum price for selected payment type
    const minPrice = paymentType === 'ETH'
      ? hostInfo.minPricePerTokenNative
      : hostInfo.minPricePerTokenStable;

    // IMPORTANT: Your pricePerToken must be >= host's minimum
    // For this example, we'll use the host's minimum + 10%
    const pricePerToken = Number(minPrice) * 1.1;

    // Validate pricing
    if (pricePerToken < Number(minPrice)) {
      toast({
        title: 'Invalid Pricing',
        description: `Price per token (${pricePerToken}) is below host minimum (${minPrice})`,
        variant: 'destructive',
      });
      throw new Error('Price below host minimum');
    }

    const config = {
      depositAmount,
      pricePerToken: Math.floor(pricePerToken),
      duration: 86400, // 24 hours
      proofInterval: 1000, // 1000 tokens
      hostUrl: hostInfo.endpoint,
      model: 'llama-3.2-1b-instruct', // Or get from host's supported models
      chainId: ChainId.BASE_SEPOLIA,
    };

    try {
      const result = await sessionManager.startSession(config);

      toast({
        title: 'Session Started',
        description: `Deposited ${depositAmount} ${paymentType} at ${pricePerToken} per token`,
      });

      return result;
    } catch (error: any) {
      // Contract will revert if pricing is invalid
      if (error.message?.includes('PriceBelowMinimum')) {
        toast({
          title: 'Pricing Error',
          description: 'Your price per token is below the host minimum',
          variant: 'destructive',
        });
      }
      throw error;
    }
  };

  return { startSessionWithPricing };
}
```

#### Payment Type Selector Component

Create `components/payment-type-selector.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface PaymentTypeSelectorProps {
  onSelect: (type: 'ETH' | 'USDC') => void;
  selected: 'ETH' | 'USDC';
  pricing: {
    nativeEth: string;
    nativeUsd: string;
    stableUsdc: string;
  } | null;
}

export function PaymentTypeSelector({
  onSelect,
  selected,
  pricing,
}: PaymentTypeSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {/* ETH Payment */}
      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <Card
          className={cn(
            'cursor-pointer transition-all p-6',
            selected === 'ETH' && 'ring-2 ring-primary shadow-lg'
          )}
          onClick={() => onSelect('ETH')}
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-semibold text-lg">Pay with ETH</h3>
              <p className="text-sm text-muted-foreground">
                Native token payment
              </p>
            </div>
            {selected === 'ETH' && (
              <div className="bg-primary text-primary-foreground rounded-full p-1">
                <Check className="w-4 h-4" />
              </div>
            )}
          </div>
          {pricing && (
            <div className="space-y-1">
              <p className="text-2xl font-bold">{pricing.nativeEth} ETH</p>
              <p className="text-sm text-muted-foreground">
                ~${pricing.nativeUsd} per token
              </p>
            </div>
          )}
        </Card>
      </motion.div>

      {/* USDC Payment */}
      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <Card
          className={cn(
            'cursor-pointer transition-all p-6',
            selected === 'USDC' && 'ring-2 ring-primary shadow-lg'
          )}
          onClick={() => onSelect('USDC')}
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-semibold text-lg">Pay with USDC</h3>
              <p className="text-sm text-muted-foreground">
                Stable pricing
              </p>
            </div>
            {selected === 'USDC' && (
              <div className="bg-primary text-primary-foreground rounded-full p-1">
                <Check className="w-4 h-4" />
              </div>
            )}
          </div>
          {pricing && (
            <div className="space-y-1">
              <p className="text-2xl font-bold">${pricing.stableUsdc}</p>
              <p className="text-sm text-muted-foreground">
                USDC per token
              </p>
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
```

#### Complete Example: Pricing-Aware Host Selector

```typescript
'use client';

import { useState } from 'react';
import { useHostPricing } from '@/hooks/use-host-pricing';
import { HostPricingDisplay } from '@/components/host-pricing-display';
import { PaymentTypeSelector } from '@/components/payment-type-selector';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function PricingAwareHostSelector({
  hosts,
  onStartSession,
  hostManager,
}: any) {
  const [selectedHost, setSelectedHost] = useState<any>(null);
  const [paymentType, setPaymentType] = useState<'ETH' | 'USDC'>('USDC');

  const { pricing, isLoading } = useHostPricing(
    hostManager,
    selectedHost?.address
  );

  const handleStartSession = () => {
    if (!selectedHost || !pricing) return;

    onStartSession(selectedHost, paymentType, pricing);
  };

  return (
    <div className="space-y-6">
      {/* Host Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Host</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Your host list UI here */}
          <select
            onChange={(e) => {
              const host = hosts.find((h: any) => h.address === e.target.value);
              setSelectedHost(host);
            }}
            className="w-full p-2 border rounded"
          >
            <option value="">Choose a host...</option>
            {hosts.map((host: any) => (
              <option key={host.address} value={host.address}>
                {host.address.slice(0, 10)}...{host.address.slice(-8)}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Payment Type Selection */}
      {selectedHost && (
        <>
          <PaymentTypeSelector
            onSelect={setPaymentType}
            selected={paymentType}
            pricing={pricing}
          />

          {/* Pricing Display */}
          <HostPricingDisplay
            pricing={pricing}
            isLoading={isLoading}
            paymentType={paymentType}
          />

          {/* Start Session Button */}
          <Button
            onClick={handleStartSession}
            disabled={!pricing}
            size="lg"
            className="w-full"
          >
            Start Session with {paymentType}
          </Button>
        </>
      )}
    </div>
  );
}
```

**Key Takeaways**:

1. **Always query pricing before session creation** - Host's minimum prices can change
2. **Format pricing correctly** - Native uses `formatEther()`, stable divides by 1,000,000
3. **Validate pricing** - Your `pricePerToken` MUST be >= host's minimum or the contract will revert
4. **Show both options** - Let users choose between ETH and USDC payments
5. **Cache pricing data** - Use React Query's `staleTime` to avoid excessive queries

---

## 💬 Part 3: Chat Implementation with @assistant-ui

### 3.1 Install Chat UI Components

```bash
npm install @assistant-ui/react @assistant-ui/react-markdown
```

### 3.2 Create Chat Context with React Query

Create `hooks/use-chat-session.ts`:

```typescript
'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { ChainId, ChainRegistry } from '@fabstir/sdk-core';
import type { SessionManager, HostManager } from '@fabstir/sdk-core';
import { parseUnits } from 'viem';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  tokens?: number;
}

interface ParsedHost {
  address: string;
  endpoint: string;
  models: string[];
  stake: bigint;
}

// Session configuration
const SESSION_DEPOSIT = '2.0';
const PRICE_PER_TOKEN = 2000;
const PROOF_INTERVAL = 1000; // Proof checkpoints every 1000 tokens (production default)
const SESSION_DURATION = 86400;

export function useChatSession(
  sessionManager: SessionManager | null,
  hostManager: HostManager | null
) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<bigint | null>(null);
  const [selectedHost, setSelectedHost] = useState<ParsedHost | null>(null);
  const [totalTokens, setTotalTokens] = useState(0);
  const [totalCost, setTotalCost] = useState(0);

  // Query: Discover hosts
  const {
    data: availableHosts,
    isLoading: isDiscoveringHosts,
    refetch: refetchHosts,
  } = useQuery({
    queryKey: ['hosts'],
    queryFn: async () => {
      if (!hostManager) throw new Error('Host manager not initialized');

      const hosts = await hostManager.discoverAllActiveHostsWithModels();

      const parsedHosts = hosts
        .map(host => ({
          address: host.address,
          endpoint: host.apiUrl || host.endpoint || '',
          models: host.supportedModels || [],
          stake: host.stake || 0n,
        }))
        .filter(h => h.models.length > 0 && h.endpoint);

      if (parsedHosts.length > 0) {
        setSelectedHost(parsedHosts[0]);
      }

      return parsedHosts;
    },
    enabled: !!hostManager,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Mutation: Start session
  const startSessionMutation = useMutation({
    mutationFn: async (host: ParsedHost) => {
      if (!sessionManager) throw new Error('Session manager not initialized');

      const config = {
        depositAmount: SESSION_DEPOSIT,
        pricePerToken: PRICE_PER_TOKEN,
        duration: SESSION_DURATION,
        proofInterval: PROOF_INTERVAL,
        hostUrl: host.endpoint,
        model: host.models[0],
        chainId: ChainId.BASE_SEPOLIA,
      };

      const result = await sessionManager.startSession(config);
      return result;
    },
    onSuccess: (result) => {
      setSessionId(result.sessionId);
      (window as any).__currentSessionId = result.sessionId;

      addMessage('system', `✅ Session started! Deposited $${SESSION_DEPOSIT} USDC.`);

      toast({
        title: 'Session Started',
        description: 'You can now chat with the AI',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Session Creation Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Mutation: Send message
  const sendMessageMutation = useMutation({
    mutationFn: async (prompt: string) => {
      if (!sessionManager || !sessionId) {
        throw new Error('No active session');
      }

      const context = buildContext();
      const fullPrompt = context
        ? `${context}\nUser: ${prompt}\nAssistant:`
        : `User: ${prompt}\nAssistant:`;

      const response = await sessionManager.sendPromptStreaming(
        sessionId,
        fullPrompt
      );

      return { response, prompt };
    },
    onMutate: (prompt) => {
      // Optimistically add user message
      addMessage('user', prompt);
    },
    onSuccess: (data) => {
      const cleaned = cleanResponse(data.response);
      const tokens = Math.ceil((data.prompt.length + cleaned.length) / 4);

      addMessage('assistant', cleaned, tokens);
    },
    onError: (error: any) => {
      addMessage('system', `❌ Error: ${error.message}`);
      toast({
        title: 'Message Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Mutation: End session
  const endSessionMutation = useMutation({
    mutationFn: async () => {
      if (!sessionManager || !sessionId) {
        throw new Error('No active session');
      }
      await sessionManager.endSession(sessionId);
    },
    onSuccess: () => {
      addMessage('system', '✅ Session ended. Payments settled.');
      setSessionId(null);
      (window as any).__currentSessionId = null;

      toast({
        title: 'Session Ended',
        description: 'Payments have been distributed',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to End Session',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Helper functions
  const addMessage = useCallback((
    role: ChatMessage['role'],
    content: string,
    tokens?: number
  ) => {
    const message: ChatMessage = {
      role,
      content,
      timestamp: Date.now(),
      tokens,
    };

    setMessages(prev => [...prev, message]);

    if (tokens) {
      setTotalTokens(prev => prev + tokens);
      setTotalCost(prev => prev + (tokens * PRICE_PER_TOKEN) / 1000000);
    }
  }, []);

  const buildContext = useCallback((): string => {
    const previousMessages = messages.filter(m => m.role !== 'system');
    if (previousMessages.length === 0) return '';

    return previousMessages
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');
  }, [messages]);

  const cleanResponse = useCallback((response: string): string => {
    let cleaned = response.replace(/^A:\s*/, '').trim();
    if (cleaned.includes('A:')) {
      const parts = cleaned.split(/A:\s*/);
      cleaned = parts[1]?.split('\n')[0]?.trim() || cleaned;
    }
    return cleaned;
  }, []);

  return {
    messages,
    sessionId,
    selectedHost,
    setSelectedHost,
    availableHosts,
    isDiscoveringHosts,
    totalTokens,
    totalCost,
    startSession: startSessionMutation.mutate,
    isStartingSession: startSessionMutation.isPending,
    sendMessage: sendMessageMutation.mutate,
    isSendingMessage: sendMessageMutation.isPending,
    endSession: endSessionMutation.mutate,
    isEndingSession: endSessionMutation.isPending,
    refetchHosts,
  };
}
```

### 3.3 Modern Chat UI Component

Create `components/chat-interface.tsx`:

```typescript
'use client';

import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, Bot, User, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  tokens?: number;
}

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  isSending: boolean;
  isSessionActive: boolean;
}

export function ChatInterface({
  messages,
  onSendMessage,
  isSending,
  isSessionActive,
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSending || !isSessionActive) return;

    onSendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <Card className="flex flex-col h-[calc(100vh-200px)] max-w-4xl mx-auto">
      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4">
        <AnimatePresence initial={false}>
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-full text-center text-muted-foreground"
            >
              <Bot className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg font-medium">No messages yet</p>
              <p className="text-sm">Start a conversation with the AI</p>
            </motion.div>
          )}

          {messages.map((message, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className={cn(
                'flex gap-3 mb-4',
                message.role === 'user' && 'flex-row-reverse'
              )}
            >
              <Avatar className={cn(
                'w-8 h-8',
                message.role === 'user' && 'bg-primary',
                message.role === 'assistant' && 'bg-secondary',
                message.role === 'system' && 'bg-muted'
              )}>
                <AvatarFallback>
                  {message.role === 'user' && <User className="w-4 h-4" />}
                  {message.role === 'assistant' && <Bot className="w-4 h-4" />}
                  {message.role === 'system' && <AlertCircle className="w-4 h-4" />}
                </AvatarFallback>
              </Avatar>

              <div
                className={cn(
                  'flex-1 rounded-lg p-4',
                  message.role === 'user' && 'bg-primary text-primary-foreground ml-12',
                  message.role === 'assistant' && 'bg-muted mr-12',
                  message.role === 'system' && 'bg-accent/50 text-center'
                )}
              >
                <div className="whitespace-pre-wrap break-words">
                  {message.content}
                </div>

                {message.tokens && (
                  <div className="mt-2 text-xs opacity-70">
                    <Badge variant="outline">
                      {message.tokens} tokens (~$
                      {((message.tokens * 2000) / 1000000).toFixed(4)})
                    </Badge>
                  </div>
                )}
              </div>
            </motion.div>
          ))}

          {isSending && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3 mb-4"
            >
              <Avatar className="w-8 h-8 bg-secondary">
                <AvatarFallback>
                  <Bot className="w-4 h-4" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 rounded-lg p-4 bg-muted mr-12">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">
                    AI is thinking...
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </AnimatePresence>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              !isSessionActive
                ? 'Start a session first...'
                : 'Type your message... (Enter to send, Shift+Enter for new line)'
            }
            disabled={!isSessionActive || isSending}
            rows={3}
            className="resize-none"
          />
          <Button
            type="submit"
            disabled={!isSessionActive || !input.trim() || isSending}
            size="lg"
            className="h-auto"
          >
            {isSending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </form>

        {!isSessionActive && (
          <p className="mt-2 text-sm text-muted-foreground text-center">
            Please start a session to begin chatting
          </p>
        )}
      </div>
    </Card>
  );
}
```

### 3.4 Session Controls with ShimmerButton

Create `components/session-controls.tsx`:

```typescript
'use client';

import { motion } from 'framer-motion';
import { Play, Square, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ShimmerButton } from '@/components/ui/shimmer-button';

interface SessionControlsProps {
  isSessionActive: boolean;
  onStartSession: () => void;
  onEndSession: () => void;
  onDiscoverHosts: () => void;
  isStarting: boolean;
  isEnding: boolean;
  isDiscovering: boolean;
}

export function SessionControls({
  isSessionActive,
  onStartSession,
  onEndSession,
  onDiscoverHosts,
  isStarting,
  isEnding,
  isDiscovering,
}: SessionControlsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3 justify-center"
    >
      {!isSessionActive ? (
        <>
          <ShimmerButton
            onClick={onStartSession}
            disabled={isStarting}
            className="shadow-lg"
          >
            {isStarting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Start Session ($2 USDC)
              </>
            )}
          </ShimmerButton>

          <Button
            onClick={onDiscoverHosts}
            disabled={isDiscovering}
            variant="outline"
            size="lg"
          >
            {isDiscovering ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Discovering...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Discover Hosts
              </>
            )}
          </Button>
        </>
      ) : (
        <Button
          onClick={onEndSession}
          disabled={isEnding}
          variant="destructive"
          size="lg"
        >
          {isEnding ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Ending...
            </>
          ) : (
            <>
              <Square className="mr-2 h-4 w-4" />
              End Session
            </>
          )}
        </Button>
      )}
    </motion.div>
  );
}
```

Create `components/ui/shimmer-button.tsx`:

```typescript
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ShimmerButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

const ShimmerButton = React.forwardRef<HTMLButtonElement, ShimmerButtonProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <button
        className={cn(
          'group relative inline-flex h-12 animate-shimmer items-center justify-center rounded-md border border-slate-800 bg-[linear-gradient(110deg,#000103,45%,#1e2631,55%,#000103)] bg-[length:200%_100%] px-6 font-medium text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:ring-offset-slate-50',
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </button>
    );
  }
);

ShimmerButton.displayName = 'ShimmerButton';

export { ShimmerButton };
```

### 3.5 Cost Visualization with Recharts

Create `components/cost-dashboard.tsx`:

```typescript
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { DollarSign, Zap, TrendingUp } from 'lucide-react';

interface CostDashboardProps {
  usdcBalance: string;
  totalCost: number;
  totalTokens: number;
  messages: Array<{
    timestamp: number;
    tokens?: number;
  }>;
}

export function CostDashboard({
  usdcBalance,
  totalCost,
  totalTokens,
  messages,
}: CostDashboardProps) {
  // Prepare data for chart
  const chartData = messages
    .filter(m => m.tokens)
    .map((m, idx) => ({
      index: idx + 1,
      tokens: m.tokens,
      cost: (m.tokens! * 2000) / 1000000,
    }));

  return (
    <div className="grid gap-4 md:grid-cols-3 mb-6">
      {/* USDC Balance */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">USDC Balance</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">${usdcBalance}</div>
          <p className="text-xs text-muted-foreground">Available for sessions</p>
        </CardContent>
      </Card>

      {/* Session Cost */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Session Cost</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">${totalCost.toFixed(4)}</div>
          <p className="text-xs text-muted-foreground">
            From ${(totalCost / messages.length || 0).toFixed(4)}/message avg
          </p>
        </CardContent>
      </Card>

      {/* Tokens Used */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Tokens Used</CardTitle>
          <Zap className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalTokens}</div>
          <Badge variant="secondary" className="mt-1">
            ~{Math.ceil(totalTokens / 100)} checkpoints
          </Badge>
        </CardContent>
      </Card>

      {/* Usage Chart */}
      {chartData.length > 0 && (
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>Token Usage Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="index" label={{ value: 'Message #', position: 'insideBottom', offset: -5 }} />
                <YAxis label={{ value: 'Tokens', angle: -90, position: 'insideLeft' }} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="tokens"
                  stroke="#8884d8"
                  fill="#8884d8"
                  fillOpacity={0.6}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

---

## 🎨 Part 4: Complete App Assembly

### 4.1 Main Chat Page

Create `app/chat/page.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { motion } from 'framer-motion';
import { useFabstirSDK } from '@/hooks/use-fabstir-sdk';
import { useChatSession } from '@/hooks/use-chat-session';
import { useBaseAccount } from '@/hooks/use-base-account';
import { WalletConnectButton } from '@/components/wallet-connect-button';
import { ChatInterface } from '@/components/chat-interface';
import { SessionControls } from '@/components/session-controls';
import { CostDashboard } from '@/components/cost-dashboard';
import { HostSelector } from '@/components/host-selector';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Sparkles } from 'lucide-react';

export default function ChatPage() {
  const { address, isConnected } = useAccount();
  const {
    sdk,
    sessionManager,
    hostManager,
    isAuthenticated,
    isInitializing,
    authenticate,
  } = useFabstirSDK();

  const {
    connectWithBaseAccount,
    isConnecting: isConnectingBase,
  } = useBaseAccount();

  const {
    messages,
    sessionId,
    selectedHost,
    setSelectedHost,
    availableHosts,
    isDiscoveringHosts,
    totalTokens,
    totalCost,
    startSession,
    isStartingSession,
    sendMessage,
    isSendingMessage,
    endSession,
    isEndingSession,
    refetchHosts,
  } = useChatSession(sessionManager, hostManager);

  const [usdcBalance, setUsdcBalance] = useState('0');

  // Handle wallet connection methods
  const handleMetaMaskConnect = async () => {
    await authenticate('metamask');
  };

  const handleBaseAccountConnect = async () => {
    if (!sdk) return;
    await connectWithBaseAccount(sdk);
  };

  if (isInitializing) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" />
          <p className="text-lg font-medium">Initializing Fabstir SDK...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-center mb-8"
      >
        <div className="flex items-center gap-3">
          <Sparkles className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Fabstir Chat</h1>
            <p className="text-sm text-muted-foreground">
              Decentralized AI-powered conversations
            </p>
          </div>
        </div>

        {!isConnected ? (
          <WalletConnectButton />
        ) : !isAuthenticated ? (
          <div className="flex gap-2">
            <Button onClick={handleMetaMaskConnect} size="lg">
              Authenticate SDK
            </Button>
            <Button
              onClick={handleBaseAccountConnect}
              disabled={isConnectingBase}
              variant="outline"
              size="lg"
            >
              {isConnectingBase ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Use Base Account'
              )}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-sm">
              Connected: {address?.slice(0, 6)}...{address?.slice(-4)}
            </Badge>
            <WalletConnectButton />
          </div>
        )}
      </motion.div>

      {!isAuthenticated ? (
        <Card className="p-12 text-center">
          <Sparkles className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-2xl font-semibold mb-2">
            Connect Your Wallet to Continue
          </h2>
          <p className="text-muted-foreground mb-6">
            Connect your wallet and authenticate to start chatting with AI models
          </p>
          {isConnected && (
            <div className="flex gap-3 justify-center">
              <Button onClick={handleMetaMaskConnect} size="lg">
                Authenticate with MetaMask
              </Button>
              <Button
                onClick={handleBaseAccountConnect}
                disabled={isConnectingBase}
                variant="outline"
                size="lg"
              >
                {isConnectingBase ? 'Connecting...' : 'Use Base Account (Gasless)'}
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <>
          {/* Cost Dashboard */}
          <CostDashboard
            usdcBalance={usdcBalance}
            totalCost={totalCost}
            totalTokens={totalTokens}
            messages={messages}
          />

          <Tabs defaultValue="chat" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto">
              <TabsTrigger value="chat">Chat</TabsTrigger>
              <TabsTrigger value="hosts">Hosts</TabsTrigger>
            </TabsList>

            <TabsContent value="chat" className="space-y-4">
              {/* Session Controls */}
              <SessionControls
                isSessionActive={!!sessionId}
                onStartSession={() => selectedHost && startSession(selectedHost)}
                onEndSession={endSession}
                onDiscoverHosts={refetchHosts}
                isStarting={isStartingSession}
                isEnding={isEndingSession}
                isDiscovering={isDiscoveringHosts}
              />

              {/* Chat Interface */}
              <ChatInterface
                messages={messages}
                onSendMessage={sendMessage}
                isSending={isSendingMessage}
                isSessionActive={!!sessionId}
              />
            </TabsContent>

            <TabsContent value="hosts">
              <HostSelector
                hosts={availableHosts || []}
                selectedHost={selectedHost}
                onSelect={setSelectedHost}
                isLoading={isDiscoveringHosts}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
```

### 4.2 Host Selector Component

Create `components/host-selector.tsx`:

```typescript
'use client';

import { motion } from 'framer-motion';
import { Server, Check, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface ParsedHost {
  address: string;
  endpoint: string;
  models: string[];
  stake: bigint;
}

interface HostSelectorProps {
  hosts: ParsedHost[];
  selectedHost: ParsedHost | null;
  onSelect: (host: ParsedHost) => void;
  isLoading: boolean;
}

export function HostSelector({
  hosts,
  selectedHost,
  onSelect,
  isLoading,
}: HostSelectorProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (hosts.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Server className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-lg font-medium mb-2">No Hosts Available</p>
          <p className="text-sm text-muted-foreground">
            Click "Discover Hosts" to search the network
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">
          Available Hosts ({hosts.length})
        </h3>
        <Badge variant="outline">{hosts.length} online</Badge>
      </div>

      {hosts.map((host, idx) => (
        <motion.div
          key={host.address}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.1 }}
        >
          <Card
            className={cn(
              'cursor-pointer transition-all hover:shadow-md',
              selectedHost?.address === host.address &&
                'ring-2 ring-primary shadow-lg'
            )}
            onClick={() => onSelect(host)}
          >
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Server className="w-5 h-5" />
                    <code className="text-sm font-mono">
                      {host.address.slice(0, 10)}...{host.address.slice(-8)}
                    </code>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <ExternalLink className="w-4 h-4" />
                    {host.endpoint}
                  </div>
                </div>
                {selectedHost?.address === host.address && (
                  <Badge className="bg-primary">
                    <Check className="w-3 h-3 mr-1" />
                    Selected
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div>
                  <p className="text-sm font-medium mb-1">Supported Models:</p>
                  <div className="flex flex-wrap gap-1">
                    {host.models.map((model) => (
                      <Badge key={model} variant="secondary">
                        {model}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex justify-between items-center pt-2">
                  <span className="text-sm text-muted-foreground">
                    Stake: {(Number(host.stake) / 1e18).toFixed(2)} FAB
                  </span>
                  {selectedHost?.address !== host.address && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(host);
                      }}
                    >
                      Select
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
```

---

## 🎛️ Part 4.5: Model and Host Selection with User Preferences

The SDK provides persistent user preferences for model and host selection. These preferences are stored on S5 decentralized storage and sync across devices.

### Host Selection Modes

```typescript
import { HostSelectionMode } from '@fabstir/sdk-core';

// Available modes:
// - AUTO: Weighted algorithm balancing stake, price, uptime, latency
// - CHEAPEST: Prioritize lowest price (70% weight)
// - RELIABLE: Prioritize highest stake and uptime (50% + 40%)
// - FASTEST: Prioritize lowest latency (60% weight) - placeholder until metrics available
// - SPECIFIC: Use a specific preferred host (throws error if unavailable)
```

### Settings Page: Host Selection Mode Picker

```typescript
'use client';

import { HostSelectionMode } from '@fabstir/sdk-core';
import { useSDK } from '@/hooks/use-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

const HOST_MODE_OPTIONS = [
  { value: HostSelectionMode.AUTO, label: 'Auto', description: 'Balanced selection' },
  { value: HostSelectionMode.CHEAPEST, label: 'Cheapest', description: 'Lowest price first' },
  { value: HostSelectionMode.RELIABLE, label: 'Reliable', description: 'Highest stake + uptime' },
  { value: HostSelectionMode.FASTEST, label: 'Fastest', description: 'Lowest latency' },
  { value: HostSelectionMode.SPECIFIC, label: 'Specific', description: 'Choose a specific host' },
];

export function HostSelectionSettings() {
  const { sdk } = useSDK();
  const queryClient = useQueryClient();

  const { data: currentMode, isLoading } = useQuery({
    queryKey: ['hostSelectionMode'],
    queryFn: async () => {
      const storageManager = await sdk.getStorageManager();
      return storageManager.getHostSelectionMode();
    },
    enabled: !!sdk,
  });

  const updateMode = useMutation({
    mutationFn: async (mode: HostSelectionMode) => {
      const storageManager = await sdk.getStorageManager();
      await storageManager.setHostSelectionMode(mode);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hostSelectionMode'] }),
  });

  if (isLoading) return <div>Loading preferences...</div>;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Host Selection Mode</h3>
      <RadioGroup
        value={currentMode}
        onValueChange={(value) => updateMode.mutate(value as HostSelectionMode)}
      >
        {HOST_MODE_OPTIONS.map((option) => (
          <div key={option.value} className="flex items-center space-x-2">
            <RadioGroupItem value={option.value} id={option.value} />
            <Label htmlFor={option.value}>
              <span className="font-medium">{option.label}</span>
              <span className="text-muted-foreground ml-2">{option.description}</span>
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}
```

### Model Selector with Availability

```typescript
'use client';

import { useSDK } from '@/hooks/use-sdk';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function ModelSelector() {
  const { sdk } = useSDK();
  const queryClient = useQueryClient();

  // Fetch models with availability
  const { data: models, isLoading } = useQuery({
    queryKey: ['availableModels'],
    queryFn: async () => {
      const modelManager = sdk.getModelManager();
      modelManager.setHostManager(sdk.getHostManager());
      return modelManager.getAvailableModelsWithHosts();
    },
    enabled: !!sdk,
  });

  // Get current default
  const { data: defaultModel } = useQuery({
    queryKey: ['defaultModel'],
    queryFn: async () => {
      const storageManager = await sdk.getStorageManager();
      storageManager.setModelManager(sdk.getModelManager());
      return storageManager.getDefaultModel();
    },
    enabled: !!sdk,
  });

  // Set default model
  const setDefault = useMutation({
    mutationFn: async (modelId: string | null) => {
      const storageManager = await sdk.getStorageManager();
      storageManager.setModelManager(sdk.getModelManager());
      await storageManager.setDefaultModel(modelId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['defaultModel'] }),
  });

  if (isLoading) return <div>Loading models...</div>;

  const availableModels = models?.filter((m) => m.isAvailable) || [];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Default Model</h3>
      <Select
        value={defaultModel?.id || 'none'}
        onValueChange={(value) => setDefault.mutate(value === 'none' ? null : value)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select a default model" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No default</SelectItem>
          {availableModels.map((m) => (
            <SelectItem key={m.model.id} value={m.model.id}>
              <div className="flex justify-between w-full">
                <span>{m.model.fileName}</span>
                <span className="text-muted-foreground">
                  {m.hostCount} hosts • ${(Number(m.priceRange.min) / 1000000).toFixed(4)}/token
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

### Host Rankings Display

```typescript
'use client';

import { HostSelectionMode } from '@fabstir/sdk-core';
import { HostSelectionService } from '@fabstir/sdk-core';
import { useSDK } from '@/hooks/use-sdk';
import { useQuery } from '@tanstack/react-query';

interface HostRankingsProps {
  modelId: string;
  mode: HostSelectionMode;
}

export function HostRankings({ modelId, mode }: HostRankingsProps) {
  const { sdk } = useSDK();

  const { data: rankedHosts, isLoading } = useQuery({
    queryKey: ['rankedHosts', modelId, mode],
    queryFn: async () => {
      const hostSelectionService = new HostSelectionService();
      hostSelectionService.setHostManager(sdk.getHostManager());
      return hostSelectionService.getRankedHostsForModel(modelId, mode, 10);
    },
    enabled: !!sdk && !!modelId,
  });

  if (isLoading) return <div>Loading hosts...</div>;
  if (!rankedHosts?.length) return <div>No hosts available</div>;

  return (
    <div className="space-y-2">
      <h4 className="font-medium">Top Hosts ({mode})</h4>
      {rankedHosts.map((rh, i) => (
        <div key={rh.host.address} className="p-3 border rounded-lg">
          <div className="flex justify-between items-center">
            <span className="font-mono text-sm">
              {i + 1}. {rh.host.address.slice(0, 10)}...
            </span>
            <span className="text-green-600 font-medium">
              {(rh.score * 100).toFixed(1)}%
            </span>
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            Price: {rh.host.minPricePerTokenStable.toString()} |
            Stake: {(Number(rh.host.stake) / 1e18).toFixed(0)} FAB
          </div>
        </div>
      ))}
    </div>
  );
}
```

### Automatic Host Selection on Session Start

The SDK automatically uses user preferences when starting a session without specifying a host:

```typescript
// SessionManager will automatically:
// 1. Load user's hostSelectionMode from settings
// 2. Use HostSelectionService to select best host
// 3. Store selected host in lastHostAddress
const { sessionId } = await sessionManager.startSession({
  modelId,
  chainId,
  // host not specified → automatic selection
  paymentMethod: 'deposit',
  depositAmount: 1000000n,
  paymentToken: usdcAddress,
});
```

---

## 📚 Part 5: SDK Method Reference

### FabstirSDKCore Methods

```typescript
// Initialize
const sdk = new FabstirSDKCore(config: FabstirSDKCoreConfig);

// Authenticate (prompts wallet)
await sdk.authenticate(method: 'metamask' | 'privatekey' | 'signer', options?: any);

// Get managers (after auth)
const sessionManager = sdk.getSessionManager();
const paymentManager = sdk.getPaymentManager();
const hostManager = sdk.getHostManager();
const storageManager = sdk.getStorageManager();
const treasuryManager = sdk.getTreasuryManager();
```

### SessionManager Methods

```typescript
// Start session
startSession(config: {
  depositAmount: string;
  pricePerToken: number;
  duration: number;
  proofInterval: number;
  hostUrl: string;
  model: string;
  chainId: number; // REQUIRED!
}): Promise<{ sessionId: bigint; jobId: bigint }>

// Send message
sendPromptStreaming(sessionId: bigint, prompt: string): Promise<string>

// End session
endSession(sessionId: bigint): Promise<void>
```

### HostManager Methods

```typescript
// Discover hosts
discoverAllActiveHostsWithModels(): Promise<HostInfo[]>

// Get host earnings
getHostEarnings(hostAddress: string, tokenAddress: string): Promise<bigint>

// Get host status
getHostStatus(hostAddress: string): Promise<HostStatus>
```

### StorageManager Methods

```typescript
// Store conversation
storeConversation(data: {
  sessionId: string;
  messages: Array<{role: string; content: string; timestamp: number}>;
}): Promise<string>

// Retrieve conversation
retrieveConversation(sessionId: string): Promise<{messages: Array<any>; metadata?: any}>

// User Settings (cross-device sync, 5-minute cache)
import { UserSettings, UserSettingsVersion } from '@fabstir/sdk-core';

// Save settings
saveUserSettings(settings: UserSettings): Promise<void>

// Get settings (null for first-time users)
getUserSettings(): Promise<UserSettings | null>

// Update specific settings
updateUserSettings(partial: PartialUserSettings): Promise<void>

// Clear all settings
clearUserSettings(): Promise<void>

// Example: Save user preferences
await storageManager.saveUserSettings({
  version: UserSettingsVersion.V1,
  lastUpdated: Date.now(),
  selectedModel: 'tiny-vicuna-1b.q4_k_m.gguf',
  preferredPaymentToken: 'USDC',
  theme: 'dark'
});

// Example: Get settings
const settings = await storageManager.getUserSettings();
if (settings) {
  console.log('Model preference:', settings.selectedModel);
} else {
  console.log('First-time user - show setup wizard');
}

// AI Preference Helpers (V2)
import { HostSelectionMode } from '@fabstir/sdk-core';

// Get/set default model
storageManager.setModelManager(modelManager); // Required first
getDefaultModel(): Promise<ModelInfo | null>
setDefaultModel(modelId: string | null): Promise<void>

// Get/set host selection mode
getHostSelectionMode(): Promise<HostSelectionMode>  // AUTO if not set
setHostSelectionMode(mode: HostSelectionMode, preferredHostAddress?: string): Promise<void>

// Reset AI preferences
clearAIPreferences(): Promise<void>

// Example: Host selection mode
await storageManager.setHostSelectionMode(HostSelectionMode.CHEAPEST);
const mode = await storageManager.getHostSelectionMode(); // 'cheapest'
```

---

## 📄 Part 6: Deferred Embeddings Workflow

**What is Deferred Embeddings?** A workflow where documents are uploaded to vector databases WITHOUT embeddings, then embeddings are generated later during an active session with a host. This improves UX by separating document upload (instant) from embedding generation (slow).

### 6.1 Architecture Overview

```
User Flow:
1. Upload document → S5 storage (instant, no blockchain)
2. Document marked as "pending" in vector database
3. User starts chat session with host
4. Background: Generate embeddings via host's /v1/embed endpoint
5. Progress bar shows real-time progress
6. Document moves from "pending" to "ready" status
7. Now searchable in RAG queries
```

**Key Benefits:**
- ⚡ Instant uploads (no waiting for embeddings)
- 📊 Real-time progress tracking
- 🔄 Retry failed embeddings
- 💰 Only pay for embeddings when needed (during session)
- 🎯 Better UX: upload now, process later

### 6.2 Document Upload with Pending Status

```typescript
// Component: /components/vector-databases/file-uploader.tsx
import { useState } from 'react';
import { useVectorDatabases } from '@/hooks/use-vector-databases';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';

export function FileUploader({ databaseName }: { databaseName: string }) {
  const [uploading, setUploading] = useState(false);
  const { uploadDocument } = useVectorDatabases();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // Upload file content to S5 storage
      const fileContent = await file.text();

      // Add document with "pending" status (no embeddings yet)
      await uploadDocument(databaseName, {
        id: `doc-${Date.now()}`,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        content: fileContent,  // Raw text content
        status: 'pending',     // Key: pending status
        uploadedAt: Date.now()
      });

      toast.success(`${file.name} uploaded! Embeddings will be generated during next session.`);
    } catch (error) {
      toast.error(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        accept=".txt,.md,.pdf"
        onChange={handleFileUpload}
        className="hidden"
        id="file-upload"
      />
      <label htmlFor="file-upload">
        <Button asChild disabled={uploading}>
          <span>
            <Upload className="mr-2 h-4 w-4" />
            {uploading ? 'Uploading...' : 'Upload Document'}
          </span>
        </Button>
      </label>
    </div>
  );
}
```

### 6.3 Progress Bar Integration

```typescript
// Component: /components/vector-databases/embedding-progress-bar.tsx
import { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface EmbeddingProgressProps {
  documentId: string;
  fileName: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  progress?: number;
  errorMessage?: string;
}

export function EmbeddingProgressBar({
  documentId,
  fileName,
  status,
  progress = 0,
  errorMessage
}: EmbeddingProgressProps) {
  return (
    <div className="space-y-2 p-4 border rounded-lg">
      {/* Header with status icon */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {status === 'processing' && (
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          )}
          {status === 'ready' && (
            <CheckCircle className="h-4 w-4 text-green-500" />
          )}
          {status === 'failed' && (
            <AlertCircle className="h-4 w-4 text-red-500" />
          )}
          <span className="font-medium text-sm">{fileName}</span>
        </div>
        <span className="text-xs text-gray-500">
          {status === 'pending' && 'Awaiting session'}
          {status === 'processing' && `${progress}%`}
          {status === 'ready' && 'Complete'}
          {status === 'failed' && 'Failed'}
        </span>
      </div>

      {/* Progress bar (only show when processing) */}
      {status === 'processing' && (
        <Progress value={progress} className="h-2" />
      )}

      {/* Error message */}
      {status === 'failed' && errorMessage && (
        <p className="text-xs text-red-600">{errorMessage}</p>
      )}
    </div>
  );
}
```

### 6.4 Background Embedding Generation

```typescript
// Hook: /hooks/use-embedding-generation.ts
import { useState, useCallback } from 'react';
import { useFabstirSDK } from './use-sdk';
import { useVectorDatabases } from './use-vector-databases';

export function useEmbeddingGeneration() {
  const { sdk } = useFabstirSDK();
  const { updateDocumentStatus } = useVectorDatabases();
  const [processing, setProcessing] = useState(false);

  const generateEmbeddingsForPendingDocuments = useCallback(
    async (sessionId: bigint) => {
      if (!sdk) {
        throw new Error('SDK not initialized');
      }

      setProcessing(true);
      try {
        // 1. Get VectorRAGManager
        const vectorRAGManager = sdk.getVectorRAGManager();

        // 2. Get all pending documents
        const pendingDocs = await vectorRAGManager.getPendingDocuments();
        console.log(`Found ${pendingDocs.length} pending documents`);

        // 3. Process each document
        const sessionManager = sdk.getSessionManager();
        for (const doc of pendingDocs) {
          try {
            // Update to processing status
            await updateDocumentStatus(doc.id, 'processing', {
              embeddingProgress: 0
            });

            // Generate embeddings via host's /v1/embed endpoint
            const vectors = await sessionManager.generateEmbeddings(
              sessionId,
              doc.content,  // Raw document text
              {
                chunkSize: 512,
                chunkOverlap: 50
              }
            );

            // Update progress
            await updateDocumentStatus(doc.id, 'processing', {
              embeddingProgress: 50
            });

            // Add vectors to database
            await vectorRAGManager.addVectors(doc.databaseName, vectors);

            // Update to ready status
            await updateDocumentStatus(doc.id, 'ready', {
              vectorCount: vectors.length,
              embeddingProgress: 100
            });

            console.log(`✅ ${doc.fileName}: ${vectors.length} vectors generated`);
          } catch (error) {
            // Update to failed status
            await updateDocumentStatus(doc.id, 'failed', {
              embeddingError: error.message
            });
            console.error(`❌ ${doc.fileName} failed:`, error);
          }
        }
      } finally {
        setProcessing(false);
      }
    },
    [sdk, updateDocumentStatus]
  );

  return { generateEmbeddingsForPendingDocuments, processing };
}
```

### 6.5 Trigger Background Processing on Session Start

```typescript
// Page: /app/session-groups/[id]/page.tsx
import { useEmbeddingGeneration } from '@/hooks/use-embedding-generation';

export default function SessionGroupPage() {
  const { generateEmbeddingsForPendingDocuments } = useEmbeddingGeneration();

  const handleStartSession = async () => {
    try {
      // 1. Start session with host
      const { sessionId } = await sessionManager.startSession({
        hostUrl: selectedHost.url,
        jobId: BigInt(Math.floor(Math.random() * 1000000)),
        modelName: 'llama-3',
        chainId: ChainId.BASE_SEPOLIA,
        depositAmount: '1.0'
      });

      setSessionId(sessionId);
      toast.success('Session started!');

      // 2. Start background embedding generation (don't await - runs in background)
      generateEmbeddingsForPendingDocuments(sessionId).catch((error) => {
        console.error('Background embedding generation failed:', error);
        toast.error('Some documents failed to process');
      });
    } catch (error) {
      toast.error(`Failed to start session: ${error.message}`);
    }
  };

  return (
    <div>
      {/* Chat UI */}
      {/* Progress bars for pending documents */}
      <PendingDocumentsList />
    </div>
  );
}
```

### 6.6 Display Pending Documents with Progress

```typescript
// Component: /components/vector-databases/pending-documents-list.tsx
import { useEffect, useState } from 'react';
import { useFabstirSDK } from '@/hooks/use-sdk';
import { EmbeddingProgressBar } from './embedding-progress-bar';

export function PendingDocumentsList() {
  const { sdk } = useFabstirSDK();
  const [pendingDocs, setPendingDocs] = useState<any[]>([]);

  useEffect(() => {
    if (!sdk) return;

    const vectorRAGManager = sdk.getVectorRAGManager();

    // Poll for updates every 2 seconds
    const interval = setInterval(async () => {
      try {
        const docs = await vectorRAGManager.getPendingDocuments();
        setPendingDocs(docs);
      } catch (error) {
        console.error('Failed to fetch pending documents:', error);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [sdk]);

  if (pendingDocs.length === 0) return null;

  return (
    <div className="space-y-3 p-4 bg-blue-50 rounded-lg">
      <h3 className="text-sm font-medium text-blue-900">
        Processing Documents ({pendingDocs.length})
      </h3>
      {pendingDocs.map((doc) => (
        <EmbeddingProgressBar
          key={doc.id}
          documentId={doc.id}
          fileName={doc.fileName}
          status={doc.status}
          progress={doc.embeddingProgress}
          errorMessage={doc.embeddingError}
        />
      ))}
    </div>
  );
}
```

### 6.7 Error Handling Best Practices

#### Handle Network Failures

```typescript
try {
  const vectors = await sessionManager.generateEmbeddings(sessionId, content);
} catch (error) {
  if (error.code === 'EMBEDDING_TIMEOUT') {
    // Host took too long (>120 seconds)
    await updateDocumentStatus(doc.id, 'failed', {
      embeddingError: 'Embedding generation timeout. Try smaller document or different host.'
    });
  } else if (error.code === 'NETWORK_ERROR') {
    // Host unreachable
    await updateDocumentStatus(doc.id, 'failed', {
      embeddingError: 'Host disconnected. Will retry when session restarts.'
    });
  } else if (error.code === 'SESSION_INACTIVE') {
    // Session ended before processing completed
    console.log('Session ended, stopping embedding generation');
    break; // Stop processing remaining documents
  } else {
    // Unknown error
    await updateDocumentStatus(doc.id, 'failed', {
      embeddingError: error.message
    });
  }
}
```

#### Retry Failed Documents

```typescript
// Component: Retry button for failed documents
<Button
  variant="outline"
  size="sm"
  onClick={async () => {
    // Reset to pending status
    await updateDocumentStatus(doc.id, 'pending');

    // Trigger re-processing if session is active
    if (sessionId) {
      await generateEmbeddingsForPendingDocuments(sessionId);
    } else {
      toast.info('Start a session to retry embedding generation');
    }
  }}
>
  Retry
</Button>
```

#### Progress Auto-Hide

```typescript
// Hide progress bar after 3 seconds when status is 'ready'
useEffect(() => {
  if (status === 'ready') {
    const timer = setTimeout(() => {
      setVisible(false);
    }, 3000);
    return () => clearTimeout(timer);
  }
}, [status]);
```

### 6.8 Search Clarification UI

Make it clear to users when semantic search is unavailable:

```typescript
// Component: Vector search panel
{readyDocumentCount === 0 ? (
  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
    <div className="flex items-start gap-3">
      <AlertCircle className="h-5 w-5 text-gray-400 flex-shrink-0" />
      <div>
        <p className="text-sm font-medium text-gray-700 mb-1">
          Semantic search unavailable
        </p>
        <p className="text-sm text-gray-600">
          Upload and vectorize documents to enable semantic search. Documents
          must have embeddings generated before they can be searched semantically.
        </p>
      </div>
    </div>
  </div>
) : (
  <VectorSearchInput onSearch={handleSearch} />
)}

{/* Text-based filtering is always available */}
<input
  type="text"
  placeholder="Type to filter by filename..."
  title="Text-based filtering. Semantic search available after embeddings complete."
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
/>
```

### 6.9 Complete Workflow Example

```typescript
// Complete deferred embeddings workflow
export default function VectorDatabasePage({ params }: { params: { id: string } }) {
  const { sdk } = useFabstirSDK();
  const { generateEmbeddingsForPendingDocuments } = useEmbeddingGeneration();
  const [sessionId, setSessionId] = useState<bigint | null>(null);

  // 1. User uploads document
  const handleUpload = async (file: File) => {
    const content = await file.text();
    await vectorRAGManager.uploadDocument(params.id, {
      id: `doc-${Date.now()}`,
      fileName: file.name,
      content: content,
      status: 'pending'  // Key: pending status, no embeddings yet
    });
    toast.success('Document uploaded! Embeddings will be generated during next session.');
  };

  // 2. User starts session
  const handleStartSession = async () => {
    const { sessionId } = await sessionManager.startSession({...});
    setSessionId(sessionId);

    // 3. Automatically start background embedding generation
    generateEmbeddingsForPendingDocuments(sessionId);
  };

  // 4. Display progress
  return (
    <div>
      <FileUploader onUpload={handleUpload} />
      <PendingDocumentsList />  {/* Shows progress bars */}
      <VectorSearchPanel readyDocumentCount={readyDocs.length} />
    </div>
  );
}
```

### 6.10 Key Takeaways

✅ **Deferred embeddings separate upload (instant) from processing (slow)**
✅ **Documents start as "pending", become "ready" after embedding generation**
✅ **Background processing happens during active session**
✅ **Progress bars show real-time updates**
✅ **Failed documents can be retried**
✅ **Clear UI indicating when semantic search is unavailable**

---

## 🔧 Troubleshooting

### Issue: "SDK not initialized"
- Wait for `isInitializing` to become `false`
- Check RPC URL is valid

### Issue: "No hosts available"
- Verify Base Sepolia network (84532)
- Try refreshing with "Discover Hosts"

### Issue: "Transaction failed"
- User needs ETH for gas
- Check MetaMask is on Base Sepolia

### Issue: "Insufficient USDC"
- Get testnet USDC from https://faucet.circle.com
- Need at least $2 USDC

---

## 🚀 Deployment Checklist

- [ ] Remove test keys
- [ ] Update contract addresses from team
- [ ] Use production RPC endpoints
- [ ] Add error tracking (Sentry)
- [ ] Test on Base Sepolia thoroughly
- [ ] Enable S5 storage
- [ ] Add analytics
- [ ] Test mobile responsiveness
- [ ] Add session limits
- [ ] Implement rate limiting

---

## 📖 Resources

- SDK API: `/workspace/docs/SDK_API.md`
- UI Developer Settings Guide: `/workspace/docs/UI_DEVELOPER_SETTINGS_GUIDE.md`
- Reference Implementation: `/workspace/apps/harness/pages/chat-context-demo.tsx`
- shadcn/ui: https://ui.shadcn.com
- RainbowKit: https://rainbowkit.com
- Base Account Kit: https://docs.base.org/account-kit

---

**You're building a production-quality chat interface with the best modern React tools. The SDK handles all blockchain complexity - you focus on creating an amazing UX!** 🚀
