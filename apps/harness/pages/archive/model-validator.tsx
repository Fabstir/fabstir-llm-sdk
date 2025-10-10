import React, { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { ModelManager, APPROVED_MODELS } from '@fabstir/sdk-core';

export default function ModelValidator() {
  const [file, setFile] = useState<File | null>(null);
  const [modelRepo, setModelRepo] = useState('');
  const [modelFile, setModelFile] = useState('');
  const [validationResult, setValidationResult] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [calculatedHash, setCalculatedHash] = useState('');
  const [modelId, setModelId] = useState('');

  const calculateSHA256 = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  };

  const calculateModelId = (repo: string, filename: string): string => {
    const input = `${repo}/${filename}`;
    const hash = ethers.keccak256(ethers.toUtf8Bytes(input));
    return hash;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      setModelFile(uploadedFile.name);

      // Calculate SHA-256 hash
      setIsValidating(true);
      try {
        const hash = await calculateSHA256(uploadedFile);
        setCalculatedHash(hash);
      } catch (error) {
        console.error('Error calculating hash:', error);
      }
      setIsValidating(false);
    }
  };

  const validateModel = useCallback(async () => {
    if (!modelRepo || !modelFile) {
      alert('Please enter repository and file name');
      return;
    }

    setIsValidating(true);
    setValidationResult(null);

    try {
      // Calculate model ID
      const id = calculateModelId(modelRepo, modelFile);
      setModelId(id);

      // Check if model matches any approved models
      let isApproved = false;
      let matchedModel = null;
      let hashMatches = false;

      for (const [key, model] of Object.entries(APPROVED_MODELS)) {
        if (model.repo === modelRepo && model.file === modelFile) {
          isApproved = true;
          matchedModel = { key, ...model };

          if (calculatedHash && model.sha256) {
            hashMatches = calculatedHash.toLowerCase() === model.sha256.toLowerCase();
          }
          break;
        }
      }

      // Try to check on-chain if we have a provider
      let onChainApproved = false;
      try {
        if (window.ethereum) {
          const provider = new ethers.BrowserProvider(window.ethereum as any);
          const modelManager = new ModelManager(
            provider,
            '0xfE54c2aa68A7Afe8E0DD571933B556C8b6adC357'
          );
          onChainApproved = await modelManager.isModelApproved(id);
        }
      } catch (error) {
        console.log('Could not check on-chain status:', error);
      }

      setValidationResult({
        modelId: id,
        isApproved,
        onChainApproved,
        matchedModel,
        hashMatches,
        calculatedHash,
        expectedHash: matchedModel?.sha256
      });
    } catch (error: any) {
      console.error('Validation error:', error);
      setValidationResult({
        error: error.message
      });
    } finally {
      setIsValidating(false);
    }
  }, [modelRepo, modelFile, calculatedHash]);

  const quickFillModel = (key: string) => {
    const model = APPROVED_MODELS[key];
    if (model) {
      setModelRepo(model.repo);
      setModelFile(model.file);
    }
  };

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Model Validation Tool</h1>

      {/* Quick Fill Buttons */}
      <div className="bg-gray-50 p-4 rounded-lg mb-6">
        <h3 className="text-lg font-semibold mb-2">Quick Fill Approved Models:</h3>
        <div className="flex gap-2">
          {Object.keys(APPROVED_MODELS).map(key => (
            <button
              key={key}
              onClick={() => quickFillModel(key)}
              className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              {key.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Model Input Form */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Model Information</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              HuggingFace Repository
            </label>
            <input
              type="text"
              value={modelRepo}
              onChange={(e) => setModelRepo(e.target.value)}
              placeholder="e.g., TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF"
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Model File Name
            </label>
            <input
              type="text"
              value={modelFile}
              onChange={(e) => setModelFile(e.target.value)}
              placeholder="e.g., tinyllama-1b.Q4_K_M.gguf"
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Upload GGUF File (Optional - for SHA-256 validation)
            </label>
            <input
              type="file"
              accept=".gguf"
              onChange={handleFileUpload}
              className="w-full px-3 py-2 border rounded-md"
            />
            {file && (
              <p className="text-sm text-gray-600 mt-1">
                File: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          {calculatedHash && (
            <div className="bg-gray-100 p-3 rounded">
              <p className="text-sm font-medium">Calculated SHA-256:</p>
              <p className="text-xs font-mono break-all">{calculatedHash}</p>
            </div>
          )}

          <button
            onClick={validateModel}
            disabled={isValidating || !modelRepo || !modelFile}
            className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400"
          >
            {isValidating ? 'Validating...' : 'Validate Model'}
          </button>
        </div>
      </div>

      {/* Model ID Calculator */}
      {(modelRepo && modelFile) && (
        <div className="bg-white shadow-md rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Model ID</h2>
          <div className="bg-gray-100 p-3 rounded">
            <p className="text-sm font-medium mb-1">Input String:</p>
            <p className="text-xs font-mono mb-2">{`${modelRepo}/${modelFile}`}</p>
            <p className="text-sm font-medium mb-1">Calculated Model ID:</p>
            <p className="text-xs font-mono break-all">
              {calculateModelId(modelRepo, modelFile)}
            </p>
          </div>
        </div>
      )}

      {/* Validation Results */}
      {validationResult && (
        <div className="bg-white shadow-md rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Validation Results</h2>

          {validationResult.error ? (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              <p className="font-bold">Error:</p>
              <p>{validationResult.error}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className={`p-4 rounded-lg ${validationResult.isApproved ? 'bg-green-100' : 'bg-red-100'}`}>
                <p className="font-semibold text-lg">
                  {validationResult.isApproved ? '✅ Model is Approved' : '❌ Model is Not Approved'}
                </p>
                {validationResult.matchedModel && (
                  <p className="text-sm mt-1">
                    Matched: {validationResult.matchedModel.key.replace(/_/g, ' ')}
                  </p>
                )}
              </div>

              {validationResult.onChainApproved !== undefined && (
                <div className="p-3 bg-blue-50 rounded">
                  <p className="text-sm">
                    On-Chain Status: {validationResult.onChainApproved ? '✅ Approved' : '❌ Not Approved'}
                  </p>
                </div>
              )}

              {calculatedHash && validationResult.expectedHash && (
                <div className={`p-3 rounded ${validationResult.hashMatches ? 'bg-green-50' : 'bg-yellow-50'}`}>
                  <p className="font-semibold text-sm mb-2">
                    SHA-256 Validation: {validationResult.hashMatches ? '✅ Match' : '⚠️ Mismatch'}
                  </p>
                  <div className="space-y-1 text-xs">
                    <div>
                      <span className="font-medium">Expected:</span>
                      <p className="font-mono break-all">{validationResult.expectedHash}</p>
                    </div>
                    <div>
                      <span className="font-medium">Calculated:</span>
                      <p className="font-mono break-all">{calculatedHash}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-3 bg-gray-50 rounded">
                <p className="text-sm font-medium mb-1">Model ID:</p>
                <p className="text-xs font-mono break-all">{validationResult.modelId}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="mt-8 bg-blue-50 p-4 rounded-lg">
        <h3 className="font-semibold mb-2">How to Use:</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm">
          <li>Enter the HuggingFace repository and model file name</li>
          <li>Optionally upload the actual GGUF file to verify SHA-256 hash</li>
          <li>Click "Validate Model" to check approval status</li>
          <li>The tool will calculate the model ID and check against approved models</li>
          <li>If connected to Web3, it will also verify on-chain approval status</li>
        </ol>
      </div>
    </div>
  );
}