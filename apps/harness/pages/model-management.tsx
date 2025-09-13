/**
 * Model Registry Management Test Harness
 *
 * This page demonstrates all ModelRegistry contract features for UI developers.
 * It uses the DEPLOYER account for owner-only functions.
 *
 * Key Features:
 * - View all registered models
 * - Add trusted models (owner only)
 * - Deactivate/reactivate models
 * - Calculate model IDs
 * - Verify model hashes
 * - Test data generators
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import {
  ModelManager,
  ModelSpec,
  ModelInfo,
  APPROVED_MODELS
} from '@fabstir/sdk-core';

// Contract addresses from environment
const MODEL_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_MODEL_REGISTRY || '0x92b2De840bB2171203011A6dBA928d855cA8183E';
const DEPLOYER_PRIVATE_KEY = process.env.NEXT_PUBLIC_DEPLOYER_PRIVATE_KEY || '0xe7231a57c89df087f0291bf20b952199c1d4575206d256397c02ba6383dedc97';
const DEPLOYER_ADDRESS = process.env.NEXT_PUBLIC_DEPLOYER_ADDRESS || '0xbeaBB2a5AEd358aA0bd442dFFd793411519Bdc11';

// Test models for quick addition
const TEST_MODELS = [
  {
    repo: "CohereForAI/TinyVicuna-1B-32k-GGUF",
    file: "tiny-vicuna-1b.q4_k_m.gguf",
    sha256: "329d002bc20d4e7baae25df802c9678b5a4340b3ce91f23e6a0644975e95935f",
    tier: 1,
    name: "TinyVicuna"
  },
  {
    repo: "TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF",
    file: "tinyllama-1b.Q4_K_M.gguf",
    sha256: "45b71fe98efe5f530b825dce6f5049d738e9c16869f10be4370ab81a9912d4a6",
    tier: 1,
    name: "TinyLlama"
  },
  {
    repo: "TheBloke/Mistral-7B-Instruct-v0.2-GGUF",
    file: "mistral-7b-instruct-v0.2.Q4_K_M.gguf",
    sha256: "c2a75f103b5c9e68c97e33ca1a90e3c7e2df59db82a36b4e80bc3c527a91cf21",
    tier: 2,
    name: "Mistral-7B"
  }
];

export default function ModelManagementPage() {
  // State management
  const [isConnected, setIsConnected] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [modelManager, setModelManager] = useState<ModelManager | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [txHash, setTxHash] = useState<string>('');

  // Form state for adding models
  const [newModel, setNewModel] = useState({
    repo: '',
    file: '',
    sha256: ''
  });
  const [calculatedModelId, setCalculatedModelId] = useState<string>('');

  // Tab state
  const [activeTab, setActiveTab] = useState<'view' | 'add' | 'tools'>('view');

  /**
   * Connect wallet using deployer account
   * Demonstrates owner connection pattern
   */
  const connectAsOwner = async () => {
    try {
      setLoading(true);
      setError('');

      if (!window.ethereum) {
        throw new Error('MetaMask not detected. Please install MetaMask.');
      }

      // Use our own RPC URL for Base Sepolia
      const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA || 'https://base-sepolia.g.alchemy.com/v2/1pZoccdtgU8CMyxXzE3l_ghnBBaJABMR';

      // Request network switch to Base Sepolia with our RPC
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x14a34' }], // 84532 in hex
        });
      } catch (switchError: any) {
        // This error code indicates that the chain has not been added to MetaMask
        if (switchError.code === 4902) {
          try {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x14a34',
                chainName: 'Base Sepolia',
                rpcUrls: [RPC_URL],
                nativeCurrency: {
                  name: 'ETH',
                  symbol: 'ETH',
                  decimals: 18
                },
                blockExplorerUrls: ['https://sepolia.basescan.org']
              }],
            });
          } catch (addError) {
            throw new Error('Failed to add Base Sepolia network to MetaMask');
          }
        } else if (switchError.code !== -32002) { // Ignore "already processing" errors
          throw new Error(`Failed to switch network: ${switchError.message}`);
        }
      }

      // Create provider with our own RPC URL to avoid MetaMask fetch issues
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const wallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);

      // Initialize ModelManager with owner signer
      const manager = new ModelManager(
        provider,
        MODEL_REGISTRY_ADDRESS,
        wallet
      );
      await manager.initialize();

      // Verify we're connected as owner
      const address = await wallet.getAddress();
      if (address.toLowerCase() !== DEPLOYER_ADDRESS.toLowerCase()) {
        throw new Error('Connected address does not match deployer');
      }

      setProvider(provider);
      setSigner(wallet);
      setModelManager(manager);
      setIsConnected(true);
      setIsOwner(true);
      setSuccess(`Connected as owner: ${address}`);

      // Load initial data
      await fetchAllModels(manager);
    } catch (err: any) {
      console.error('Connection error:', err);
      setError(`Failed to connect as owner: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Connect with user's wallet (read-only)
   * Demonstrates standard connection pattern
   */
  const connectWallet = async () => {
    try {
      setLoading(true);
      setError('');

      if (!window.ethereum) {
        throw new Error('No Ethereum provider found');
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      // Initialize ModelManager
      const manager = new ModelManager(
        provider,
        MODEL_REGISTRY_ADDRESS,
        signer
      );
      await manager.initialize();

      setProvider(provider);
      setSigner(signer);
      setModelManager(manager);
      setIsConnected(true);
      setIsOwner(address.toLowerCase() === DEPLOYER_ADDRESS.toLowerCase());
      setSuccess(`Connected: ${address}`);

      // Load initial data
      await fetchAllModels(manager);
    } catch (err: any) {
      console.error('Connection error:', err);
      setError(`Failed to connect: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Fetch all registered models
   * Demonstrates data fetching pattern
   */
  const fetchAllModels = async (manager?: ModelManager) => {
    const mgr = manager || modelManager;
    if (!mgr) return;

    try {
      setLoading(true);
      const allModels = await mgr.getAllApprovedModels();
      setModels(allModels);
      console.log(`Fetched ${allModels.length} models`);
    } catch (err: any) {
      console.error('Error fetching models:', err);
      setError(`Failed to fetch models: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Add a trusted model (owner only)
   * Demonstrates write transaction pattern
   */
  const addTrustedModel = async (model: typeof TEST_MODELS[0]) => {
    if (!modelManager || !isOwner) {
      setError('Must be connected as owner');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');

      // Get the contract directly for owner functions
      const contract = (modelManager as any).modelRegistry;

      // Convert hex string to bytes32 if needed
      const hashBytes32 = model.sha256.startsWith('0x')
        ? model.sha256
        : '0x' + model.sha256;

      // Estimate gas
      const gasEstimate = await contract.addTrustedModel.estimateGas(
        model.repo,
        model.file,
        hashBytes32
      );
      console.log(`Gas estimate: ${gasEstimate.toString()}`);

      // Send transaction
      const tx = await contract.addTrustedModel(
        model.repo,
        model.file,
        hashBytes32
      );

      setTxHash(tx.hash);
      setSuccess(`Adding model ${model.name}... TX: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();
      console.log('Transaction confirmed:', receipt);

      setSuccess(`Successfully added ${model.name}!`);

      // Refresh model list
      await fetchAllModels();

      // Clear form
      setNewModel({ repo: '', file: '', sha256: '' });
    } catch (err: any) {
      console.error('Error adding model:', err);
      setError(`Failed to add model: ${err.message}`);
    } finally {
      setLoading(false);
      setTxHash('');
    }
  };

  /**
   * Calculate model ID from repo and filename
   * Demonstrates ID calculation pattern
   */
  const calculateModelId = useCallback(async (repo: string, file: string) => {
    if (!modelManager || !repo || !file) {
      setCalculatedModelId('');
      return;
    }

    try {
      const modelId = await modelManager.getModelId(repo, file);
      setCalculatedModelId(modelId);
      return modelId;
    } catch (err) {
      console.error('Error calculating model ID:', err);
      setCalculatedModelId('');
    }
  }, [modelManager]);

  /**
   * Deactivate a model (owner only)
   * Demonstrates status management pattern
   */
  const deactivateModel = async (modelId: string) => {
    if (!modelManager || !isOwner) {
      setError('Must be connected as owner');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const contract = (modelManager as any).modelRegistry;
      const tx = await contract.deactivateModel(modelId);

      setSuccess(`Deactivating model... TX: ${tx.hash}`);
      await tx.wait();

      setSuccess('Model deactivated successfully');
      await fetchAllModels();
    } catch (err: any) {
      console.error('Error deactivating model:', err);
      setError(`Failed to deactivate: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Reactivate a model (owner only)
   * Demonstrates status management pattern
   */
  const reactivateModel = async (modelId: string) => {
    if (!modelManager || !isOwner) {
      setError('Must be connected as owner');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const contract = (modelManager as any).modelRegistry;
      const tx = await contract.reactivateModel(modelId);

      setSuccess(`Reactivating model... TX: ${tx.hash}`);
      await tx.wait();

      setSuccess('Model reactivated successfully');
      await fetchAllModels();
    } catch (err: any) {
      console.error('Error reactivating model:', err);
      setError(`Failed to reactivate: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Verify a model hash
   * Demonstrates hash verification pattern
   */
  const verifyModelHash = async (file: File, expectedHash: string) => {
    try {
      const buffer = await file.arrayBuffer();
      const isValid = await modelManager?.verifyModelHash(buffer, expectedHash);

      if (isValid) {
        setSuccess('Hash verified successfully!');
      } else {
        setError('Hash verification failed - file does not match');
      }
    } catch (err: any) {
      console.error('Error verifying hash:', err);
      setError(`Verification error: ${err.message}`);
    }
  };

  /**
   * Calculate SHA256 hash of a file
   * Demonstrates client-side hashing
   */
  const calculateFileHash = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  };

  // Update calculated model ID when form changes
  useEffect(() => {
    if (newModel.repo && newModel.file) {
      calculateModelId(newModel.repo, newModel.file);
    }
  }, [newModel.repo, newModel.file, calculateModelId]);

  /**
   * Get tier display name
   */
  const getTierName = (tier: number): string => {
    const tierNames = ['', 'Owner', 'Community', 'Verified', 'Enterprise'];
    return tierNames[tier] || 'Unknown';
  };

  /**
   * Format timestamp for display
   */
  const formatTimestamp = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  /**
   * Truncate hash for display
   */
  const truncateHash = (hash: string): string => {
    if (!hash) return '';
    return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
  };

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-lg mb-6">
        <h1 className="text-3xl font-bold mb-2">Model Registry Management</h1>
        <p className="opacity-90">Owner-only test harness for ModelRegistry contract</p>
      </div>

      {/* Connection Status */}
      <div className="bg-white border rounded-lg p-4 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Status</p>
            <p className={`font-mono text-sm ${isConnected ? 'text-green-600' : 'text-gray-400'}`}>
              {isConnected ? (isOwner ? '👑 Connected as Owner' : '👤 Connected') : 'Not Connected'}
            </p>
            {isConnected && signer && (
              <p className="text-xs text-gray-500 mt-1">
                {isOwner ? DEPLOYER_ADDRESS : 'Read-only mode'}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={connectAsOwner}
              disabled={loading || isConnected}
              className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 disabled:opacity-50"
            >
              Connect as Owner
            </button>
            <button
              onClick={connectWallet}
              disabled={loading || isConnected}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Connect Wallet
            </button>
            {isConnected && (
              <button
                onClick={() => fetchAllModels()}
                disabled={loading}
                className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 disabled:opacity-50"
              >
                Refresh
              </button>
            )}
          </div>
        </div>

        <div className="mt-2 text-xs">
          <span className="text-gray-600">Registry: </span>
          <span className="font-mono">{MODEL_REGISTRY_ADDRESS}</span>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
          {success}
        </div>
      )}

      {txHash && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded mb-4">
          Transaction: {txHash}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6">
        <button
          onClick={() => setActiveTab('view')}
          className={`px-4 py-2 rounded-t ${activeTab === 'view' ? 'bg-white border-t border-l border-r' : 'bg-gray-100'}`}
        >
          View Models ({models.length})
        </button>
        <button
          onClick={() => setActiveTab('add')}
          disabled={!isOwner}
          className={`px-4 py-2 rounded-t ${activeTab === 'add' ? 'bg-white border-t border-l border-r' : 'bg-gray-100'} ${!isOwner ? 'opacity-50' : ''}`}
        >
          Add Models
        </button>
        <button
          onClick={() => setActiveTab('tools')}
          className={`px-4 py-2 rounded-t ${activeTab === 'tools' ? 'bg-white border-t border-l border-r' : 'bg-gray-100'}`}
        >
          Tools
        </button>
      </div>

      {/* View Models Tab */}
      {activeTab === 'view' && (
        <div className="bg-white border rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Registered Models</h2>

          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading models...</div>
          ) : models.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No models registered yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Model ID</th>
                    <th className="text-left py-2">Repository</th>
                    <th className="text-left py-2">File Name</th>
                    <th className="text-left py-2">SHA256</th>
                    <th className="text-left py-2">Tier</th>
                    <th className="text-left py-2">Status</th>
                    <th className="text-left py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((model) => (
                    <tr key={model.modelId} className="border-b hover:bg-gray-50">
                      <td className="py-2 font-mono text-xs">{truncateHash(model.modelId)}</td>
                      <td className="py-2 text-sm">{model.huggingfaceRepo}</td>
                      <td className="py-2 text-sm">{model.fileName}</td>
                      <td className="py-2 font-mono text-xs">{truncateHash(model.sha256Hash)}</td>
                      <td className="py-2">
                        <span className={`px-2 py-1 rounded text-xs ${
                          model.approvalTier === 1 ? 'bg-purple-100 text-purple-700' :
                          model.approvalTier === 2 ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {getTierName(model.approvalTier)}
                        </span>
                      </td>
                      <td className="py-2">
                        <span className={`px-2 py-1 rounded text-xs ${
                          model.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {model.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-2">
                        {isOwner && (
                          model.active ? (
                            <button
                              onClick={() => deactivateModel(model.modelId)}
                              disabled={loading}
                              className="text-red-600 hover:text-red-800 text-sm"
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              onClick={() => reactivateModel(model.modelId)}
                              disabled={loading}
                              className="text-green-600 hover:text-green-800 text-sm"
                            >
                              Reactivate
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add Models Tab */}
      {activeTab === 'add' && isOwner && (
        <div className="bg-white border rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Add Trusted Models</h2>

          {/* Quick Add Test Models */}
          <div className="mb-6">
            <h3 className="font-semibold mb-2">Quick Add Test Models</h3>
            <div className="flex gap-2 flex-wrap">
              {TEST_MODELS.map((model) => (
                <button
                  key={model.name}
                  onClick={() => addTrustedModel(model)}
                  disabled={loading}
                  className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  Add {model.name}
                </button>
              ))}
            </div>
          </div>

          {/* Manual Add Form */}
          <div className="border-t pt-6">
            <h3 className="font-semibold mb-2">Add Custom Model</h3>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">HuggingFace Repository</label>
                <input
                  type="text"
                  value={newModel.repo}
                  onChange={(e) => setNewModel({...newModel, repo: e.target.value})}
                  placeholder="e.g., TheBloke/Llama-2-7B-GGUF"
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">File Name</label>
                <input
                  type="text"
                  value={newModel.file}
                  onChange={(e) => setNewModel({...newModel, file: e.target.value})}
                  placeholder="e.g., llama-2-7b.Q4_K_M.gguf"
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">SHA256 Hash</label>
                <input
                  type="text"
                  value={newModel.sha256}
                  onChange={(e) => setNewModel({...newModel, sha256: e.target.value})}
                  placeholder="64 character hex string"
                  className="w-full px-3 py-2 border rounded font-mono text-sm"
                />
              </div>

              {calculatedModelId && (
                <div>
                  <label className="block text-sm font-medium mb-1">Calculated Model ID</label>
                  <div className="px-3 py-2 bg-gray-50 border rounded font-mono text-sm">
                    {calculatedModelId}
                  </div>
                </div>
              )}

              <button
                onClick={() => addTrustedModel({...newModel, tier: 1, name: 'Custom'})}
                disabled={loading || !newModel.repo || !newModel.file || !newModel.sha256}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
              >
                Add Model
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tools Tab */}
      {activeTab === 'tools' && (
        <div className="bg-white border rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Utility Tools</h2>

          {/* Model ID Calculator */}
          <div className="mb-6">
            <h3 className="font-semibold mb-2">Model ID Calculator</h3>
            <div className="grid grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Repository"
                onChange={(e) => calculateModelId(e.target.value, document.querySelector<HTMLInputElement>('#calc-file')?.value || '')}
                className="px-3 py-2 border rounded"
              />
              <input
                id="calc-file"
                type="text"
                placeholder="File name"
                onChange={(e) => calculateModelId(document.querySelector<HTMLInputElement>('#calc-repo')?.value || '', e.target.value)}
                className="px-3 py-2 border rounded"
              />
            </div>
          </div>

          {/* Hash Calculator */}
          <div className="mb-6">
            <h3 className="font-semibold mb-2">SHA256 Hash Calculator</h3>
            <input
              type="file"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const hash = await calculateFileHash(file);
                  setSuccess(`File hash: ${hash}`);
                }
              }}
              className="block"
            />
          </div>

          {/* Model Verification */}
          <div className="mb-6">
            <h3 className="font-semibold mb-2">Verify Model File</h3>
            <div className="space-y-2">
              <input
                type="file"
                id="verify-file"
                className="block"
              />
              <input
                type="text"
                id="verify-hash"
                placeholder="Expected SHA256 hash"
                className="px-3 py-2 border rounded w-full"
              />
              <button
                onClick={() => {
                  const fileInput = document.querySelector<HTMLInputElement>('#verify-file');
                  const hashInput = document.querySelector<HTMLInputElement>('#verify-hash');
                  if (fileInput?.files?.[0] && hashInput?.value) {
                    verifyModelHash(fileInput.files[0], hashInput.value);
                  }
                }}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                Verify
              </button>
            </div>
          </div>

          {/* Contract Info */}
          <div className="border-t pt-6">
            <h3 className="font-semibold mb-2">Contract Information</h3>
            <div className="space-y-1 text-sm">
              <div><span className="font-medium">Registry Address:</span> <span className="font-mono">{MODEL_REGISTRY_ADDRESS}</span></div>
              <div><span className="font-medium">Network:</span> Base Sepolia</div>
              <div><span className="font-medium">Owner Address:</span> <span className="font-mono">{DEPLOYER_ADDRESS}</span></div>
              <div><span className="font-medium">Total Models:</span> {models.length}</div>
              <div><span className="font-medium">Active Models:</span> {models.filter(m => m.active).length}</div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-6 text-center text-sm text-gray-500">
        Model Registry Test Harness - For Development Only
      </div>
    </div>
  );
}