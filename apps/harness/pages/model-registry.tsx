/**
 * Model Registry UI - Display and manage approved models
 */

import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import {
  ModelManager,
  ModelInfo,
  APPROVED_MODELS,
  getModelDisplayName,
  ModelApprovalTier
} from '@fabstir/sdk-core';

const ModelRegistryPage: React.FC = () => {
  // State
  const [modelManager, setModelManager] = useState<ModelManager | null>(null);
  const [approvedModels, setApprovedModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [connected, setConnected] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelInfo | null>(null);
  const [calculatingId, setCalculatingId] = useState(false);
  const [customRepo, setCustomRepo] = useState('');
  const [customFile, setCustomFile] = useState('');
  const [customModelId, setCustomModelId] = useState('');

  // Initialize on mount
  useEffect(() => {
    initializeModelManager();
  }, []);

  // Initialize model manager
  const initializeModelManager = async () => {
    try {
      // Use read-only provider for viewing
      const provider = new ethers.JsonRpcProvider(
        process.env.NEXT_PUBLIC_RPC_URL ||
        'https://base-sepolia.g.alchemy.com/v2/demo'
      );

      const modelRegistryAddress =
        process.env.NEXT_PUBLIC_MODEL_REGISTRY_ADDRESS ||
        '0xfE54c2aa68A7Afe8E0DD571933B556C8b6adC357';

      const manager = new ModelManager(modelRegistryAddress, provider);
      await manager.initialize();

      setModelManager(manager);
      setConnected(true);

      // Load approved models
      await loadApprovedModels(manager);
    } catch (err: any) {
      console.error('Failed to initialize:', err);
      setError(`Initialization failed: ${err.message}`);
    }
  };

  // Load approved models from registry
  const loadApprovedModels = async (manager?: ModelManager) => {
    const mgr = manager || modelManager;
    if (!mgr) return;

    setLoading(true);
    setError('');

    try {
      // First, get the pre-approved models and calculate their IDs
      const preApprovedList: ModelInfo[] = [];

      for (const [key, spec] of Object.entries(APPROVED_MODELS)) {
        const modelId = await mgr.getModelId(spec.repo, spec.file);
        const details = await mgr.getModelDetails(modelId);

        if (details) {
          preApprovedList.push(details);
        } else {
          // Model not in registry yet, show as pending
          preApprovedList.push({
            modelId,
            huggingfaceRepo: spec.repo,
            fileName: spec.file,
            sha256Hash: spec.sha256 || '',
            approvalTier: 0,
            active: false,
            timestamp: 0
          });
        }
      }

      // Also try to get all models from events
      const allModels = await mgr.getAllApprovedModels();

      // Merge lists, avoiding duplicates
      const modelMap = new Map<string, ModelInfo>();
      [...preApprovedList, ...allModels].forEach(model => {
        modelMap.set(model.modelId, model);
      });

      setApprovedModels(Array.from(modelMap.values()));
    } catch (err: any) {
      console.error('Failed to load models:', err);
      setError(`Failed to load models: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Calculate model ID for custom input
  const calculateCustomModelId = async () => {
    if (!modelManager || !customRepo || !customFile) {
      setError('Please enter both repository and filename');
      return;
    }

    setCalculatingId(true);
    try {
      const modelId = await modelManager.getModelId(customRepo, customFile);
      setCustomModelId(modelId);

      // Check if approved
      const isApproved = await modelManager.isModelApproved(modelId);
      if (isApproved) {
        const details = await modelManager.getModelDetails(modelId);
        if (details) {
          setSelectedModel(details);
        }
      }
    } catch (err: any) {
      setError(`Failed to calculate ID: ${err.message}`);
    } finally {
      setCalculatingId(false);
    }
  };

  // Get tier badge color
  const getTierColor = (tier: number): string => {
    switch (tier) {
      case 0: return 'bg-gray-500';
      case 1: return 'bg-blue-500';
      case 2: return 'bg-green-500';
      case 3: return 'bg-purple-500';
      default: return 'bg-gray-400';
    }
  };

  // Get tier name
  const getTierName = (tier: number): string => {
    const names = ['Experimental', 'Community', 'Verified', 'Enterprise'];
    return names[tier] || 'Unknown';
  };

  // Format timestamp
  const formatDate = (timestamp: number): string => {
    if (timestamp === 0) return 'Pending';
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  // Truncate hash for display
  const truncateHash = (hash: string): string => {
    if (!hash) return '';
    return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">🏛️ Model Registry</h1>

      {/* Status */}
      <div className="mb-6 p-4 bg-gray-100 rounded">
        <div className="flex items-center gap-4">
          <span className={`px-3 py-1 rounded ${connected ? 'bg-green-500' : 'bg-red-500'} text-white`}>
            {connected ? '✓ Connected' : '✗ Disconnected'}
          </span>
          {modelManager && (
            <span className="text-sm text-gray-600">
              Registry: {truncateHash(modelManager.getContractAddress())}
            </span>
          )}
        </div>
      </div>

      {/* Model ID Calculator */}
      <div className="mb-8 p-6 bg-white rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">📊 Model ID Calculator</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="text"
            placeholder="HuggingFace Repository (e.g., CohereForAI/TinyVicuna-1B-32k-GGUF)"
            value={customRepo}
            onChange={(e) => setCustomRepo(e.target.value)}
            className="px-4 py-2 border rounded"
          />
          <input
            type="text"
            placeholder="Filename (e.g., tiny-vicuna-1b.q4_k_m.gguf)"
            value={customFile}
            onChange={(e) => setCustomFile(e.target.value)}
            className="px-4 py-2 border rounded"
          />
        </div>
        <button
          onClick={calculateCustomModelId}
          disabled={calculatingId || !customRepo || !customFile}
          className="mt-4 px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
        >
          {calculatingId ? 'Calculating...' : 'Calculate Model ID'}
        </button>
        {customModelId && (
          <div className="mt-4 p-4 bg-gray-50 rounded">
            <p className="font-mono text-sm break-all">
              <strong>Model ID:</strong> {customModelId}
            </p>
          </div>
        )}
      </div>

      {/* Approved Models List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold">✅ Approved Models</h2>
          <button
            onClick={() => loadApprovedModels()}
            disabled={loading}
            className="mt-2 px-4 py-1 bg-gray-200 rounded hover:bg-gray-300"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {error && (
          <div className="p-4 bg-red-50 text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
            <p className="mt-4">Loading models...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Model
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Repository
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tier
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hash
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Added
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {approvedModels.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                      No approved models found
                    </td>
                  </tr>
                ) : (
                  approvedModels.map((model) => (
                    <tr
                      key={model.modelId}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelectedModel(model)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {model.fileName}
                          </div>
                          <div className="text-xs text-gray-500 font-mono">
                            {truncateHash(model.modelId)}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 break-all">
                          {model.huggingfaceRepo}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded text-white ${getTierColor(model.approvalTier)}`}>
                          {getTierName(model.approvalTier)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded ${
                          model.active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {model.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-xs font-mono text-gray-500">
                          {truncateHash(model.sha256Hash)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(model.timestamp)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Selected Model Details */}
      {selectedModel && (
        <div className="mt-8 p-6 bg-white rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">📋 Model Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Model ID</label>
              <p className="mt-1 text-sm font-mono break-all">{selectedModel.modelId}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Filename</label>
              <p className="mt-1 text-sm">{selectedModel.fileName}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Repository</label>
              <p className="mt-1 text-sm">{selectedModel.huggingfaceRepo}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">SHA-256 Hash</label>
              <p className="mt-1 text-sm font-mono break-all">{selectedModel.sha256Hash}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Approval Tier</label>
              <p className="mt-1">
                <span className={`px-2 py-1 text-sm rounded text-white ${getTierColor(selectedModel.approvalTier)}`}>
                  {getTierName(selectedModel.approvalTier)}
                </span>
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Status</label>
              <p className="mt-1">
                <span className={`px-2 py-1 text-sm rounded ${
                  selectedModel.active
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {selectedModel.active ? 'Active' : 'Inactive'}
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={() => setSelectedModel(null)}
            className="mt-4 px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};

export default ModelRegistryPage;