import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import {
  APPROVED_MODELS,
  ModelManager,
  HostManagerEnhanced,
  ClientManager,
  type HostInfo,
  type ModelSpec
} from '@fabstir/sdk-core';

declare global {
  interface Window {
    ethereum?: any;
  }
}

interface FilterOptions {
  minVRAM?: number;
  maxPrice?: number;
  location?: string;
  onlyActive?: boolean;
}

export default function HostDiscoveryModels() {
  const [selectedModel, setSelectedModel] = useState<ModelSpec | null>(null);
  const [modelId, setModelId] = useState<string>('');
  const [hosts, setHosts] = useState<HostInfo[]>([]);
  const [filteredHosts, setFilteredHosts] = useState<HostInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);


  // Managers
  const [hostManager, setHostManager] = useState<HostManagerEnhanced | null>(null);
  const [modelManager, setModelManager] = useState<ModelManager | null>(null);
  const [clientManager, setClientManager] = useState<ClientManager | null>(null);

  // Filters
  const [filters, setFilters] = useState<FilterOptions>({
    onlyActive: true,
    minVRAM: 0,
    maxPrice: 1.0,
    location: ''
  });

  // Model availability stats
  const [modelStats, setModelStats] = useState<any>(null);

  // Connect wallet and initialize managers
  const connectWallet = async () => {
    if (!window.ethereum) {
      setError('Please install MetaMask');
      return;
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();

      console.log('Provider connected, initializing managers...');

      // Initialize managers
      const modelRegistryAddress = process.env.NEXT_PUBLIC_CONTRACT_MODEL_REGISTRY || '0xfE54c2aa68A7Afe8E0DD571933B556C8b6adC357';
      const nodeRegistryAddress = process.env.NEXT_PUBLIC_CONTRACT_NODE_REGISTRY_WITH_MODELS || '0xaa14Ed58c3EF9355501bc360E5F09Fb9EC8c1100';

      try {
        const mm = new ModelManager(
          provider,
          modelRegistryAddress
        );
        console.log('ModelManager created, initializing...');
        await mm.initialize();
        setModelManager(mm);
        console.log('ModelManager initialized');
      } catch (mmError: any) {
        console.error('ModelManager initialization failed:', mmError);
        throw new Error(`ModelManager init failed: ${mmError.message}`);
      }

      try {
        const hm = new HostManagerEnhanced(
          signer,
          nodeRegistryAddress,
          modelManager || new ModelManager(provider, modelRegistryAddress)
        );
        console.log('HostManagerEnhanced created, initializing...');
        await hm.initialize();
        setHostManager(hm);
        console.log('HostManagerEnhanced initialized');
      } catch (hmError: any) {
        console.error('HostManagerEnhanced initialization failed:', hmError);
        throw new Error(`HostManager init failed: ${hmError.message}`);
      }

      setConnected(true);
      setError(null);
      console.log('Successfully connected and initialized all managers');
    } catch (err: any) {
      console.error('Connection error:', err);
      setError(`Failed to connect: ${err.message}`);
    }
  };

  // Select a model from approved list
  const selectModel = async (model: ModelSpec) => {
    if (!modelManager) return;

    setSelectedModel(model);
    setIsLoading(true);
    setError(null);

    try {
      const id = await modelManager.getModelId(model.repo, model.file);
      setModelId(id);
      await discoverHostsForModel(id);
    } catch (err: any) {
      setError(`Failed to select model: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Discover hosts for a specific model
  const discoverHostsForModel = async (modelId: string) => {
    if (!hostManager) {
      setError('Host manager not initialized');
      return;
    }

    setIsLoading(true);
    setError(null);
    setHosts([]);
    setFilteredHosts([]);

    try {
      // Find hosts supporting this model
      const foundHosts = await hostManager.findHostsForModel(modelId);
      setHosts(foundHosts);

      // Calculate model statistics
      if (foundHosts.length > 0) {
        const activeHosts = foundHosts.filter(h => h.isActive);
        const prices = activeHosts.map(h => h.metadata.costPerToken || 0);
        const avgPrice = prices.length > 0
          ? prices.reduce((a, b) => a + b, 0) / prices.length
          : 0;

        const vramValues = foundHosts.map(h => h.metadata.hardware?.vram || 0);
        const locations = [...new Set(foundHosts.map(h => h.metadata.location || 'unknown'))];

        setModelStats({
          totalHosts: foundHosts.length,
          activeHosts: activeHosts.length,
          averagePrice: avgPrice.toFixed(6),
          minPrice: prices.length > 0 ? Math.min(...prices).toFixed(6) : '0',
          maxPrice: prices.length > 0 ? Math.max(...prices).toFixed(6) : '0',
          minVRAM: vramValues.length > 0 ? Math.min(...vramValues) : 0,
          maxVRAM: vramValues.length > 0 ? Math.max(...vramValues) : 0,
          locations
        });
      } else {
        setModelStats(null);
      }

      // Apply initial filters
      applyFilters(foundHosts);
    } catch (err: any) {
      setError(`Failed to discover hosts: ${err.message}`);
      setHosts([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Apply filters to host list
  const applyFilters = (hostsToFilter?: HostInfo[]) => {
    const targetHosts = hostsToFilter || hosts;

    const filtered = targetHosts.filter(host => {
      // Active filter
      if (filters.onlyActive && !host.isActive) {
        return false;
      }

      // VRAM filter
      if (filters.minVRAM && host.metadata.hardware?.vram) {
        if (host.metadata.hardware.vram < filters.minVRAM) {
          return false;
        }
      }

      // Price filter
      if (filters.maxPrice && host.metadata.costPerToken) {
        if (host.metadata.costPerToken > filters.maxPrice) {
          return false;
        }
      }

      // Location filter
      if (filters.location && filters.location !== '') {
        if (host.metadata.location !== filters.location) {
          return false;
        }
      }

      return true;
    });

    // Sort by price (lowest first)
    filtered.sort((a, b) => {
      const priceA = a.metadata.costPerToken || 0;
      const priceB = b.metadata.costPerToken || 0;
      return priceA - priceB;
    });

    setFilteredHosts(filtered);
  };

  // Update filters
  useEffect(() => {
    applyFilters();
  }, [filters]);

  // Health check a host
  const checkHostHealth = async (apiUrl: string) => {
    try {
      const response = await fetch(`${apiUrl}/v1/health`);
      return response.ok;
    } catch {
      return false;
    }
  };

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Model-Based Host Discovery</h1>

      {/* Wallet Connection */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Connection Status</h2>
        {!connected ? (
          <button
            onClick={connectWallet}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Connect Wallet
          </button>
        ) : (
          <p className="text-green-600">✅ Connected to Ethereum</p>
        )}
      </div>

      {/* Model Selection */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Select AI Model</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {APPROVED_MODELS && Object.entries(APPROVED_MODELS).map(([key, model]) => (
            <div
              key={key}
              onClick={() => connected && selectModel(model)}
              className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                selectedModel?.file === model.file
                  ? 'bg-blue-50 border-blue-500'
                  : 'hover:bg-gray-50'
              } ${!connected ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <h3 className="font-semibold">{key.replace(/_/g, ' ')}</h3>
              <p className="text-sm text-gray-600 mt-1">{model.repo}</p>
              <p className="text-xs text-gray-500">{model.file}</p>
            </div>
          ))}
        </div>

        {modelId && (
          <div className="mt-4 p-3 bg-gray-100 rounded">
            <p className="text-sm font-medium">Selected Model ID:</p>
            <p className="text-xs font-mono break-all">{modelId}</p>
          </div>
        )}
      </div>

      {/* Model Statistics */}
      {modelStats && (
        <div className="bg-white shadow-md rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Model Availability</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 bg-blue-50 rounded">
              <p className="text-sm text-gray-600">Total Hosts</p>
              <p className="text-2xl font-bold">{modelStats.totalHosts}</p>
            </div>
            <div className="p-3 bg-green-50 rounded">
              <p className="text-sm text-gray-600">Active Hosts</p>
              <p className="text-2xl font-bold">{modelStats.activeHosts}</p>
            </div>
            <div className="p-3 bg-yellow-50 rounded">
              <p className="text-sm text-gray-600">Avg Price/Token</p>
              <p className="text-xl font-bold">${modelStats.averagePrice}</p>
            </div>
            <div className="p-3 bg-purple-50 rounded">
              <p className="text-sm text-gray-600">VRAM Range</p>
              <p className="text-xl font-bold">{modelStats.minVRAM}-{modelStats.maxVRAM} GB</p>
            </div>
          </div>

          {modelStats.locations && modelStats.locations.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium mb-2">Available Locations:</p>
              <div className="flex flex-wrap gap-2">
                {modelStats.locations.map((loc: string) => (
                  <span key={loc} className="px-3 py-1 bg-gray-100 rounded-full text-sm">
                    {loc}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      {hosts.length > 0 && (
        <div className="bg-white shadow-md rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Filter Hosts</h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Min VRAM (GB)</label>
              <input
                type="number"
                value={filters.minVRAM}
                onChange={(e) => setFilters({ ...filters, minVRAM: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border rounded-md"
                min="0"
                max="48"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Max Price/Token</label>
              <input
                type="number"
                value={filters.maxPrice}
                onChange={(e) => setFilters({ ...filters, maxPrice: parseFloat(e.target.value) || 1.0 })}
                className="w-full px-3 py-2 border rounded-md"
                step="0.0001"
                min="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Location</label>
              <select
                value={filters.location}
                onChange={(e) => setFilters({ ...filters, location: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">All Locations</option>
                {modelStats?.locations?.map((loc: string) => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={filters.onlyActive}
                  onChange={(e) => setFilters({ ...filters, onlyActive: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm">Active Only</span>
              </label>
            </div>
          </div>

          <div className="mt-4 text-sm text-gray-600">
            Showing {filteredHosts.length} of {hosts.length} hosts
          </div>
        </div>
      )}

      {/* Host List */}
      {filteredHosts.length > 0 && (
        <div className="bg-white shadow-md rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Available Hosts</h2>

          <div className="space-y-4">
            {filteredHosts.map((host, index) => (
              <div key={host.address} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold">Host #{index + 1}</h3>
                    <p className="text-xs font-mono text-gray-600">{host.address}</p>
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-1 rounded text-xs ${
                      host.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {host.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">API URL:</span>
                    <p className="font-medium truncate">{host.apiUrl}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Location:</span>
                    <p className="font-medium">{host.metadata.location || 'Unknown'}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Hardware:</span>
                    <p className="font-medium">
                      {host.metadata.hardware?.gpu || 'Unknown'} ({host.metadata.hardware?.vram || 0} GB)
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-600">Price/Token:</span>
                    <p className="font-medium">${host.metadata.costPerToken || 0}</p>
                  </div>
                </div>

                {host.metadata.capabilities && (
                  <div className="mt-2">
                    <span className="text-sm text-gray-600">Capabilities: </span>
                    <span className="text-sm">
                      {Object.entries(host.metadata.capabilities)
                        .filter(([_, v]) => v)
                        .map(([k]) => k)
                        .join(', ')}
                    </span>
                  </div>
                )}

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={async () => {
                      const healthy = await checkHostHealth(host.apiUrl);
                      alert(healthy ? '✅ Host is healthy' : '❌ Host is not responding');
                    }}
                    className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
                  >
                    Health Check
                  </button>
                  <button
                    className="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600"
                  >
                    Select Host
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-8">
          <p className="text-gray-600">Loading hosts...</p>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p className="font-bold">Error</p>
          <p>{error}</p>
        </div>
      )}

      {/* No Hosts Message */}
      {!isLoading && selectedModel && hosts.length === 0 && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
          <p className="font-bold">No Hosts Found</p>
          <p>No hosts are currently supporting the selected model.</p>
        </div>
      )}
    </div>
  );
}