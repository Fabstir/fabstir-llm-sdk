import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';

// Simple constants for testing
const APPROVED_MODELS = {
  TINY_VICUNA: {
    repo: "CohereForAI/TinyVicuna-1B-32k-GGUF",
    file: "tiny-vicuna-1b.q4_k_m.gguf",
    sha256: "329d002bc20d4e7baae25df802c9678b5a4340b3ce91f23e6a0644975e95935f"
  },
  TINY_LLAMA: {
    repo: "TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF",
    file: "tinyllama-1b.Q4_K_M.gguf",
    sha256: "45b71fe98efe5f530b825dce6f5049d738e9c16869f10be4370ab81a9912d4a6"
  }
};

declare global {
  interface Window {
    ethereum?: any;
  }
}

export default function HostDiscoveryModelsSimple() {
  const [selectedModel, setSelectedModel] = useState<any>(null);
  const [modelId, setModelId] = useState<string>('');
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate model ID
  const calculateModelId = (repo: string, filename: string): string => {
    const input = `${repo}/${filename}`;
    const hash = ethers.keccak256(ethers.toUtf8Bytes(input));
    return hash;
  };

  // Connect wallet
  const connectWallet = async () => {
    if (!window.ethereum) {
      setError('Please install MetaMask');
      return;
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      console.log('Connected wallet:', address);
      setConnected(true);
      setError(null);
    } catch (err: any) {
      setError(`Failed to connect: ${err.message}`);
    }
  };

  // Select a model
  const selectModel = (model: any, key: string) => {
    setSelectedModel({ ...model, key });
    const id = calculateModelId(model.repo, model.file);
    setModelId(id);
  };

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Model-Based Host Discovery (Simplified)</h1>

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
          {Object.entries(APPROVED_MODELS).map(([key, model]) => (
            <div
              key={key}
              onClick={() => selectModel(model, key)}
              className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                selectedModel?.key === key
                  ? 'bg-blue-50 border-blue-500'
                  : 'hover:bg-gray-50'
              }`}
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

      {/* Info Section */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <h3 className="font-semibold mb-2">Note:</h3>
        <p className="text-sm">
          This is a simplified version of the host discovery page. The full version includes:
        </p>
        <ul className="list-disc list-inside text-sm mt-2">
          <li>Host discovery from blockchain</li>
          <li>Model validation against registry</li>
          <li>Host filtering by hardware requirements</li>
          <li>Real-time availability statistics</li>
          <li>Health checks for discovered hosts</li>
        </ul>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mt-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p className="font-bold">Error</p>
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}