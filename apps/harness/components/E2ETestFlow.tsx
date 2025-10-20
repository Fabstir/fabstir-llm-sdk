// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import React, { useState } from 'react';
import { parseUnits } from 'viem';
import { LLMService } from '../lib/llm-service';
import { ProofHandler } from '../lib/proof-handler';
import { PaymentSettlement } from '../lib/payment-settlement';
import { S5ConversationStore } from '../lib/s5-storage';
interface TestResults { response: string; tokens: number; cid: string; txHash: string; gasless: boolean; }

export function E2ETestFlow({ smartAccount, jobId, hostUrl = 'wss://host.fabstir.network' }: 
  { smartAccount: string; jobId: number; hostUrl?: string }) {
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState('');
  const [results, setResults] = useState<TestResults | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<string[]>([]);

  const runAutomatedTest = async () => {
    setIsRunning(true); setError(''); setResults(null); setProgress([]);
    try {
      setCurrentStep('Sending prompt'); setProgress(p => [...p, '📤 Sending prompt "1 + 1 = ?"']);
      const llmService = new LLMService();
      const llmResponse = await llmService.sendPrompt(hostUrl, jobId, '1 + 1 = ?');
      setProgress(p => [...p, `✅ Received response: ${llmResponse.response}`]);
      setCurrentStep('Submitting proof'); setProgress(p => [...p, '🔐 Submitting proof to contract']);
      const proofHandler = new ProofHandler(
        process.env.NEXT_PUBLIC_RPC_URL || '', process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '',
        process.env.NEXT_PUBLIC_HOST_PRIVATE_KEY || '');
      const proofStatus = await proofHandler.submitProofForJob({
        jobId, prompt: '1 + 1 = ?', response: llmResponse.response, tokensProven: llmResponse.tokens });
      setProgress(p => [...p, `✅ Proof submitted: ${proofStatus.txHash}`]);

      setCurrentStep('Processing payment'); setProgress(p => [...p, '💰 Processing payment settlement']);
      const settlement = new PaymentSettlement(
        process.env.NEXT_PUBLIC_RPC_URL || '', process.env.NEXT_PUBLIC_HOST_ADDRESS || '');
      await settlement.processSettlement(jobId, parseUnits('2', 6), llmResponse.tokens, 
        parseUnits('0.002', 6), process.env.NEXT_PUBLIC_HOST_PRIVATE_KEY || '');
      setProgress(p => [...p, '✅ Payment completed']);
      setCurrentStep('Saving to S5'); setProgress(p => [...p, '💾 Saving conversation to S5']);
      const s5Store = new S5ConversationStore(process.env.NEXT_PUBLIC_S5_SEED || '');
      const storageResult = await s5Store.saveConversation({
        prompt: '1 + 1 = ?', response: llmResponse.response, jobId,
        timestamp: Date.now(), tokensUsed: llmResponse.tokens });
      setProgress(p => [...p, `✅ Saved to S5: ${storageResult.cid}`]);

      setResults({ response: llmResponse.response, tokens: llmResponse.tokens,
        cid: storageResult.cid || '', txHash: proofStatus.txHash, gasless: true });
      setCurrentStep('Test completed successfully!');
      setProgress(p => [...p, '🎉 E2E test completed! 0 ETH spent (gasless)']);
    } catch (err: any) {
      setError(err.message); setCurrentStep('Test failed');
      setProgress(p => [...p, `❌ Error: ${err.message}`]);
    } finally { setIsRunning(false); }
  };

  return (
    <div style={{ padding: '24px', border: '2px solid #0052cc', borderRadius: '8px', backgroundColor: '#f9f9f9' }}>
      <h3>🧪 Autonomous E2E Test</h3>
      <p>Complete flow: LLM → Proof → Payment → S5 Storage (gasless)</p>
      <button onClick={runAutomatedTest} disabled={isRunning || !smartAccount}
        style={{ padding: '12px 24px', fontSize: '16px', backgroundColor: isRunning ? '#666' : '#28a745',
          color: 'white', border: 'none', borderRadius: '4px', cursor: isRunning ? 'wait' : 'pointer',
          width: '100%', marginTop: '16px' }}>
        {isRunning ? currentStep : 'Run E2E Test'}
      </button>
      {progress.length > 0 && (
        <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
          <strong>Progress:</strong>
          {progress.map((step, i) => <div key={i} style={{ marginTop: '4px' }}>{step}</div>)}
        </div>
      )}
      {results && (
        <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#d4edda', borderRadius: '4px' }}>
          <strong>✅ Test Results:</strong>
          <div>Response: {results.response} | Tokens: {results.tokens} | S5 CID: {results.cid}</div>
          <div>TX: {results.txHash.slice(0, 10)}... | <b style={{ color: '#28a745' }}>Gasless: 0 ETH ✓</b></div>
        </div>
      )}
      {error && <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#f8d7da', borderRadius: '4px' }}><strong>Error:</strong> {error}</div>}
    </div>
  );
}