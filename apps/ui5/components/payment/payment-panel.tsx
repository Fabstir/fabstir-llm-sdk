'use client';

import { useState, useEffect } from 'react';
import { ethers, type Signer } from 'ethers';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Wallet, Zap, AlertCircle } from 'lucide-react';
import {
  checkUSDCBalance,
  depositUSDC,
  approveUSDC,
  getUSDCAllowance,
  formatUSDC,
} from '@/lib/payment-utils';

export interface DiscoveredHost {
  address: string;
  endpoint: string;
  models: string[];
  pricing: number;
  stake: string;
  status: string;
}

interface PaymentPanelProps {
  signer: Signer | null;
  address: string | null;
  aiModeEnabled: boolean;
  onToggleAIMode: (enabled: boolean) => void;
  selectedHost?: DiscoveredHost;
  hosts?: DiscoveredHost[];
  onSelectHost?: (hostAddress: string) => void;
  isDiscovering?: boolean;
}

export function PaymentPanel({
  signer,
  address,
  aiModeEnabled,
  onToggleAIMode,
  selectedHost,
  hosts = [],
  onSelectHost,
  isDiscovering = false,
}: PaymentPanelProps) {
  const [usdcBalance, setUsdcBalance] = useState<string>('0.00');
  const [allowance, setAllowance] = useState<string>('0.00');
  const [depositAmount, setDepositAmount] = useState<string>('10');
  const [approveAmount, setApproveAmount] = useState<string>('1000');
  const [isDepositing, setIsDepositing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number>(84532); // Base Sepolia

  // Load balance and allowance on mount
  useEffect(() => {
    if (signer && address) {
      loadBalances();
    }
  }, [signer, address]);

  const loadBalances = async () => {
    if (!signer || !address) return;

    try {
      const balance = await checkUSDCBalance(address, signer);
      setUsdcBalance(balance);

      const currentAllowance = await getUSDCAllowance(signer);
      setAllowance(currentAllowance);
    } catch (err: any) {
      console.error('[PaymentPanel] Failed to load balances:', err);
      setError(err.message || 'Failed to load balances');
    }
  };

  const handleDeposit = async () => {
    if (!address) {
      setError('No wallet address available');
      return;
    }

    setIsDepositing(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await depositUSDC(depositAmount, address, chainId);

      if (result.success) {
        setSuccess(`Deposited ${depositAmount} USDC successfully! TX: ${result.txHash?.slice(0, 10)}...`);
        await loadBalances(); // Refresh balance
      } else {
        setError(result.error || 'Deposit failed');
      }
    } catch (err: any) {
      setError(err.message || 'Deposit failed');
    } finally {
      setIsDepositing(false);
    }
  };

  const handleApprove = async () => {
    if (!signer) {
      setError('No signer available');
      return;
    }

    setIsApproving(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await approveUSDC(approveAmount, signer);

      if (result.success) {
        if (result.txHash) {
          setSuccess(`Approved ${approveAmount} USDC for JobMarketplace! TX: ${result.txHash.slice(0, 10)}...`);
        } else {
          setSuccess('Already approved (sufficient allowance)');
        }
        await loadBalances(); // Refresh allowance
      } else {
        setError(result.error || 'Approval failed');
      }
    } catch (err: any) {
      setError(err.message || 'Approval failed');
    } finally {
      setIsApproving(false);
    }
  };

  const estimatedCost = selectedHost
    ? `~$${((Number(selectedHost.pricing) / 1000000) * 1000).toFixed(2)} per 1K tokens`
    : 'Select a host to see pricing';

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Payment & AI Mode
        </CardTitle>
        <CardDescription>
          Manage USDC balance and enable real AI inference with blockchain payments
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* AI Mode Toggle */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              <Label htmlFor="ai-mode" className="font-medium">
                AI Mode (Real LLM Inference)
              </Label>
            </div>
            <p className="text-sm text-muted-foreground">
              Enable blockchain-based AI chat with production hosts
            </p>
          </div>
          <Switch
            id="ai-mode"
            checked={aiModeEnabled}
            onCheckedChange={onToggleAIMode}
          />
        </div>

        {/* Show payment info only if AI mode enabled */}
        {aiModeEnabled && (
          <>
            {/* Host Selection */}
            <div className="space-y-3">
              <Label>Production Host Selection</Label>
              {isDiscovering ? (
                <div className="flex items-center gap-2 p-4 border rounded-lg bg-blue-50">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  <span className="text-sm text-blue-900">Discovering hosts from NodeRegistry...</span>
                </div>
              ) : hosts.length === 0 ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No active hosts found. Please check your network connection or try again later.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {selectedHost ? 'Selected host:' : 'Available hosts:'} {hosts.length} host(s) discovered
                  </p>

                  {/* Selected Host Display */}
                  {selectedHost && (
                    <div className="p-3 border-2 border-blue-500 rounded-lg bg-blue-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium text-blue-900">
                            {selectedHost.address.slice(0, 10)}...{selectedHost.address.slice(-8)}
                          </p>
                          <p className="text-xs text-blue-700">
                            Model: {selectedHost.models[0] || 'Unknown'}
                          </p>
                          <p className="text-xs text-blue-700">
                            Pricing: ${(Number(selectedHost.pricing) / 1000000).toFixed(4)} per token
                          </p>
                          <p
                            className="text-xs text-blue-700 cursor-help group/endpoint relative"
                            title={selectedHost.endpoint}
                          >
                            <span className="group-hover/endpoint:hidden">
                              Endpoint: {selectedHost.endpoint.replace(/https?:\/\/(\d+)\.(\d+)\.(\d+)\.(\d+)(:\d+)?/, 'http://$1.$2.*.*$5')}
                            </span>
                            <span className="hidden group-hover/endpoint:inline">
                              Endpoint: {selectedHost.endpoint}
                            </span>
                          </p>
                        </div>
                        {hosts.length > 1 && (
                          <button
                            onClick={() => {
                              // Show dropdown to select different host
                              const dropdown = document.getElementById('host-dropdown');
                              if (dropdown) {
                                dropdown.classList.toggle('hidden');
                              }
                            }}
                            className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-100 rounded"
                          >
                            Change
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Host Selection Dropdown (hidden by default) */}
                  {hosts.length > 1 && (
                    <div id="host-dropdown" className="hidden space-y-2 max-h-60 overflow-y-auto p-2 border rounded-lg bg-gray-50">
                      {hosts.map((host) => (
                        <button
                          key={host.address}
                          onClick={() => {
                            onSelectHost?.(host.address);
                            // Hide dropdown after selection
                            const dropdown = document.getElementById('host-dropdown');
                            if (dropdown) {
                              dropdown.classList.add('hidden');
                            }
                          }}
                          className={`w-full text-left p-2 border rounded transition-colors ${
                            selectedHost?.address === host.address
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          <p className="text-sm font-medium text-gray-900">
                            {host.address.slice(0, 10)}...{host.address.slice(-8)}
                          </p>
                          <p className="text-xs text-gray-600">
                            {host.models[0] || 'Unknown'} • ${(Number(host.pricing) / 1000000).toFixed(4)}/token
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Balance Display */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">USDC Balance</Label>
                <div className="text-2xl font-bold">${formatUSDC(usdcBalance)}</div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Approved Allowance</Label>
                <div className="text-2xl font-bold">${formatUSDC(allowance)}</div>
              </div>
            </div>

            {/* Estimated Cost */}
            {selectedHost && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm">
                  <span className="font-medium">Selected Host:</span> {selectedHost.address.slice(0, 10)}...
                </p>
                <p className="text-sm">
                  <span className="font-medium">Pricing:</span> {estimatedCost}
                </p>
                <p className="text-sm">
                  <span className="font-medium">Model:</span> {selectedHost.models[0] || 'Unknown'}
                </p>
              </div>
            )}

            {/* Deposit USDC */}
            <div className="space-y-3">
              <Label htmlFor="deposit-amount">Deposit USDC (Testnet Faucet)</Label>
              <div className="flex gap-2">
                <Input
                  id="deposit-amount"
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="10"
                  min="0"
                  step="1"
                  disabled={isDepositing}
                />
                <Button
                  onClick={handleDeposit}
                  disabled={isDepositing || !address}
                  className="min-w-[120px]"
                >
                  {isDepositing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Depositing...
                    </>
                  ) : (
                    'Deposit USDC'
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Note: This uses testnet faucet for demo. In production, transfer USDC from your wallet.
              </p>
            </div>

            {/* Approve USDC */}
            <div className="space-y-3">
              <Label htmlFor="approve-amount">Approve USDC for JobMarketplace</Label>
              <div className="flex gap-2">
                <Input
                  id="approve-amount"
                  type="number"
                  value={approveAmount}
                  onChange={(e) => setApproveAmount(e.target.value)}
                  placeholder="1000"
                  min="0"
                  step="100"
                  disabled={isApproving}
                />
                <Button
                  onClick={handleApprove}
                  disabled={isApproving || !signer}
                  variant="secondary"
                  className="min-w-[120px]"
                >
                  {isApproving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Approving...
                    </>
                  ) : (
                    'Approve USDC'
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Approve once for multiple AI sessions. Recommended: 1000 USDC for ~500 sessions ($2 each).
              </p>
            </div>

            {/* Success/Error Messages */}
            {success && (
              <Alert>
                <AlertDescription className="text-green-600">{success}</AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </>
        )}

        {/* Warning when AI mode disabled */}
        {!aiModeEnabled && (
          <Alert>
            <AlertDescription>
              AI Mode is disabled. Chat sessions will use mock responses (no blockchain, no payment, no real AI).
              Enable AI Mode above to use production LLM hosts with payment.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
