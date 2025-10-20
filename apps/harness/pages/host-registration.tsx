// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import {
  HostManager,
  ModelManager,
  APPROVED_MODELS,
  ModelSpec
} from '@fabstir/sdk-core';

interface SelectedModel extends ModelSpec {
  id?: string;
  key: string;
}

export default function HostRegistration() {
  const [nodeUrl, setNodeUrl] = useState('http://localhost:8080');
  const [selectedModels, setSelectedModels] = useState<SelectedModel[]>([]);
  const [availableModels, setAvailableModels] = useState<SelectedModel[]>([]);
  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationResult, setRegistrationResult] = useState<any>(null);
  const [hostManager, setHostManager] = useState<HostManager | null>(null);
  const [modelManager, setModelManager] = useState<ModelManager | null>(null);
  const [connected, setConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string>('');

  // Additional host metadata
  const [region, setRegion] = useState('us-east-1');
  const [tier, setTier] = useState('standard');
  const [maxConcurrent, setMaxConcurrent] = useState(5);
  const [pricePerToken, setPricePerToken] = useState('0.0001');

  useEffect(() => {
    // Initialize available models with their IDs
    const initModels = async () => {
      const models: SelectedModel[] = [];
      for (const [key, model] of Object.entries(APPROVED_MODELS)) {
        const id = calculateModelId(model.repo, model.file);
        models.push({
          ...model,
          key,
          id
        });
      }
      setAvailableModels(models);
    };
    initModels();
  }, []);

  const calculateModelId = (repo: string, filename: string): string => {
    const input = `${repo}/${filename}`;
    const hash = ethers.keccak256(ethers.toUtf8Bytes(input));
    return hash;
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert('Please install MetaMask to use this feature');
      return;
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum as any);
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();

      // Initialize managers
      const mm = new ModelManager(
        provider,
        process.env.NEXT_PUBLIC_CONTRACT_MODEL_REGISTRY!
      );
      setModelManager(mm);

      const hm = new HostManager(
        signer,
        process.env.NEXT_PUBLIC_CONTRACT_NODE_REGISTRY_WITH_MODELS!,
        mm
      );
      setHostManager(hm);

      const address = await signer.getAddress();
      setWalletAddress(address);
      setConnected(true);
      console.log('Connected wallet:', address);
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      alert('Failed to connect wallet');
    }
  };

  const toggleModelSelection = (model: SelectedModel) => {
    const isSelected = selectedModels.some(m => m.key === model.key);
    if (isSelected) {
      setSelectedModels(selectedModels.filter(m => m.key !== model.key));
    } else {
      setSelectedModels([...selectedModels, model]);
    }
  };

  const registerHost = async () => {
    if (!hostManager) {
      alert('Please connect wallet first');
      return;
    }

    if (selectedModels.length === 0) {
      alert('Please select at least one model');
      return;
    }

    setIsRegistering(true);
    setRegistrationResult(null);

    try {
      // Build metadata object matching HostMetadata interface
      const metadata = {
        hardware: {
          gpu: 'RTX 4090',  // Default GPU
          vram: 24,         // VRAM in GB
          ram: 64           // System RAM in GB
        },
        capabilities: ['inference', 'streaming', 'batch'],
        location: region,
        maxConcurrent: maxConcurrent,
        costPerToken: parseFloat(pricePerToken)
      };

      // Register host with models
      const result = await hostManager.registerHostWithModels({
        apiUrl: nodeUrl,
        supportedModels: selectedModels,
        metadata,
        minPricePerTokenNative: ethers.parseEther(pricePerToken).toString(), // ETH/BNB price in wei
        minPricePerTokenStable: ethers.parseUnits(pricePerToken, 6).toString() // USDC price (6 decimals)
      });

      setRegistrationResult({
        success: true,
        transactionHash: result,
        message: 'Host registered successfully!'
      });

      console.log('Registration successful:', result);
    } catch (error: any) {
      console.error('Registration failed:', error);
      setRegistrationResult({
        success: false,
        error: error.message || 'Registration failed'
      });
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Host Registration with Model Governance</h1>

      {/* Wallet Connection */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Wallet Connection</h2>
        {!connected ? (
          <button
            onClick={connectWallet}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Connect Wallet
          </button>
        ) : (
          <div>
            <p className="text-green-600 font-semibold">✅ Wallet Connected</p>
            <p className="text-gray-700 mt-2">
              <span className="font-medium">Host Address:</span>{' '}
              <span className="font-mono text-sm">{walletAddress}</span>
            </p>
          </div>
        )}
      </div>

      {/* Host Configuration */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Host Configuration</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Node URL</label>
            <input
              type="text"
              value={nodeUrl}
              onChange={(e) => setNodeUrl(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="http://localhost:8080"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Region</label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="us-east-1">US East</option>
                <option value="us-west-1">US West</option>
                <option value="eu-west-1">EU West</option>
                <option value="ap-south-1">Asia Pacific</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Tier</label>
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="standard">Standard</option>
                <option value="premium">Premium</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Max Concurrent Requests</label>
              <input
                type="number"
                value={maxConcurrent}
                onChange={(e) => setMaxConcurrent(parseInt(e.target.value))}
                className="w-full px-3 py-2 border rounded-md"
                min="1"
                max="100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Price Per Token (USDC)</label>
              <input
                type="text"
                value={pricePerToken}
                onChange={(e) => setPricePerToken(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="0.0001"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Model Selection */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Select Supported Models</h2>

        <div className="space-y-3">
          {availableModels.map((model) => (
            <div
              key={model.key}
              className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                selectedModels.some(m => m.key === model.key)
                  ? 'bg-blue-50 border-blue-500'
                  : 'hover:bg-gray-50'
              }`}
              onClick={() => toggleModelSelection(model)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold">{model.key.replace(/_/g, ' ')}</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    <span className="font-medium">Repo:</span> {model.repo}
                  </p>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">File:</span> {model.file}
                  </p>
                  {model.id && (
                    <p className="text-xs text-gray-500 mt-1 font-mono">
                      ID: {model.id.substring(0, 10)}...
                    </p>
                  )}
                </div>
                <div className="ml-4">
                  <input
                    type="checkbox"
                    checked={selectedModels.some(m => m.key === model.key)}
                    onChange={() => {}}
                    className="w-5 h-5"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {selectedModels.length > 0 && (
          <div className="mt-4 p-3 bg-green-50 rounded">
            <p className="text-sm font-medium text-green-800">
              Selected {selectedModels.length} model(s)
            </p>
          </div>
        )}
      </div>

      {/* Register Button */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <button
          onClick={registerHost}
          disabled={!connected || selectedModels.length === 0 || isRegistering}
          className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400"
        >
          {isRegistering ? 'Registering...' : 'Register Host'}
        </button>
      </div>

      {/* Registration Result */}
      {registrationResult && (
        <div className={`p-6 rounded-lg ${
          registrationResult.success ? 'bg-green-100' : 'bg-red-100'
        }`}>
          <h3 className="font-semibold text-lg mb-2">
            {registrationResult.success ? '✅ Success' : '❌ Failed'}
          </h3>
          {registrationResult.success ? (
            <div>
              <p>{registrationResult.message}</p>
              <p className="text-sm mt-2 font-mono">
                Tx: {registrationResult.transactionHash?.substring(0, 20)}...
              </p>
            </div>
          ) : (
            <p className="text-red-700">{registrationResult.error}</p>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="mt-8 bg-blue-50 p-4 rounded-lg">
        <h3 className="font-semibold mb-2">Registration Process:</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm">
          <li>Connect your wallet using MetaMask</li>
          <li>Configure your host settings (URL, region, pricing)</li>
          <li>Select the AI models your host will support</li>
          <li>Only pre-approved models can be selected</li>
          <li>Click "Register Host" to submit the transaction</li>
          <li>The smart contract will validate all selected models</li>
          <li>Registration will fail if any model is not approved</li>
        </ol>
      </div>
    </div>
  );
}