// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// Load-Balanced Transcode Stress Test — submits N concurrent jobs to exercise load balancing.

import React, { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { FabstirSDKCore, ChainRegistry, ChainId } from '@fabstir/sdk-core';
import type { TranscodeHandle, TranscodeCapacity } from '@fabstir/sdk-core';
import { buildStreamingFormats, fetchTranscodeCapacity, HostSelectionMode } from '@fabstir/sdk-core';

// ── Env vars ──
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA!;
const USER_PRIVATE_KEY = process.env.NEXT_PUBLIC_TEST_USER_1_PRIVATE_KEY!;
const MAX_LOG_ENTRIES = 500;

// ── Transcode model IDs ──
const TRANSCODE_PRESETS: Record<string, string> = {
  '1080p_h264': '1080p-h264-nvenc', '2160p_h264': '2160p-h264-nvenc', 'both_h264': '1080p-2160p-h264-nvenc',
  '1080p_av1': '1080p-av1-nvenc', '2160p_av1': '2160p-av1-nvenc', 'both_av1': '1080p-2160p-av1-nvenc',
};
function getTranscodeModelId(preset: string): string {
  const f = TRANSCODE_PRESETS[preset];
  if (!f) throw new Error(`Unknown transcode preset: ${preset}`);
  return ethers.keccak256(ethers.solidityPacked(['string', 'string'], ['fabstir/transcoding/', f]));
}

// ── Styles ──
const sectionStyle: React.CSSProperties = { border: '1px solid #333', borderRadius: 6, padding: 12, marginBottom: 12, background: '#1a1a2e' };
const btnStyle: React.CSSProperties = { padding: '6px 14px', borderRadius: 4, border: 'none', cursor: 'pointer', fontWeight: 600, marginRight: 8 };
const greenBtn: React.CSSProperties = { ...btnStyle, background: '#22c55e', color: '#fff' };
const blueBtn: React.CSSProperties = { ...btnStyle, background: '#3b82f6', color: '#fff' };
const redBtn: React.CSSProperties = { ...btnStyle, background: '#ef4444', color: '#fff' };
const disabledBtn: React.CSSProperties = { ...btnStyle, background: '#555', color: '#999', cursor: 'not-allowed' };
const inputStyle: React.CSSProperties = { width: '100%', padding: 6, borderRadius: 4, border: '1px solid #555', background: '#0f0f23', color: '#e0e0e0', fontFamily: 'monospace', fontSize: 13 };
const indicator = (ok: boolean | null) => ok === null ? '⏳' : ok ? '✅' : '❌';

// ── JobState ──
type JobStatus = 'pending' | 'submitting' | 'transcoding' | 'complete' | 'failed' | 'cancelled';
interface JobState { id: number; status: JobStatus; hostAddress: string; hostUrl: string; progress: number; gopInfo: string; taskId: string; error: string; duration: number; outputCount: number; }
const createJobState = (id: number): JobState => ({ id, status: 'pending', hostAddress: '', hostUrl: '', progress: 0, gopInfo: '', taskId: '', error: '', duration: 0, outputCount: 0 });
const STATUS_COLORS: Record<JobStatus, string> = { pending: '#888', submitting: '#f59e0b', transcoding: '#3b82f6', complete: '#22c55e', failed: '#ef4444', cancelled: '#888' };

export default function TranscodeLBTestPage() {
  // ── State ──
  const [logs, setLogs] = useState<{ id: number; msg: string }[]>([]);
  const logIdRef = useRef(0);
  const [transcodeManager, setTranscodeManager] = useState<any>(null);
  const [sdkReady, setSdkReady] = useState<boolean | null>(null);
  const [authReady, setAuthReady] = useState<boolean | null>(null);

  const [discoveredHosts, setDiscoveredHosts] = useState<any[]>([]);
  const [hostCapacities, setHostCapacities] = useState<Record<string, TranscodeCapacity>>({});
  const [isDiscovering, setIsDiscovering] = useState(false);

  const [sourceCid, setSourceCid] = useState('');
  const [selectedCodec, setSelectedCodec] = useState<'h264' | 'av1'>('h264');
  const [selectionMode, setSelectionMode] = useState<HostSelectionMode>(HostSelectionMode.AUTO);
  const [concurrentJobs, setConcurrentJobs] = useState(3);
  const [encryptSource, setEncryptSource] = useState(false);

  const [jobs, setJobs] = useState<JobState[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  // ── Refs ──
  const mountedRef = useRef(true);
  const sdkRef = useRef<FabstirSDKCore | null>(null);
  const handlesRef = useRef<Map<number, TranscodeHandle>>(new Map());
  const logPanelRef = useRef<HTMLDivElement>(null);

  // ── Helpers ──
  function addLog(msg: string) {
    setLogs(prev => {
      const next = [...prev, { id: logIdRef.current++, msg: `[${new Date().toLocaleTimeString()}] ${msg}` }];
      return next.length > MAX_LOG_ENTRIES ? next.slice(-MAX_LOG_ENTRIES) : next;
    });
  }

  useEffect(() => {
    if (logPanelRef.current) logPanelRef.current.scrollTop = logPanelRef.current.scrollHeight;
  }, [logs]);

  // ── 1. SDK Init + Auth (auto on mount) ──
  useEffect(() => {
    mountedRef.current = true;
    initAndAuth();
    return () => { mountedRef.current = false; };
  }, []);

  async function initAndAuth() {
    try {
      addLog('Initializing SDK...');
      const chain = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
      const newSdk = new FabstirSDKCore({
        mode: 'production' as const,
        chainId: ChainId.BASE_SEPOLIA,
        rpcUrl: RPC_URL,
        contractAddresses: {
          jobMarketplace: chain.contracts.jobMarketplace,
          nodeRegistry: chain.contracts.nodeRegistry,
          proofSystem: chain.contracts.proofSystem,
          hostEarnings: chain.contracts.hostEarnings,
          fabToken: chain.contracts.fabToken,
          usdcToken: chain.contracts.usdcToken,
          modelRegistry: chain.contracts.modelRegistry,
        },
        s5Config: {
          portalUrl: process.env.NEXT_PUBLIC_S5_PORTAL_URL,
          seedPhrase: process.env.NEXT_PUBLIC_S5_SEED_PHRASE,
          masterToken: process.env.NEXT_PUBLIC_S5_MASTER_TOKEN,
        },
      });
      setSdkReady(true);
      addLog('SDK initialized');

      addLog('Authenticating...');
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const signer = new ethers.Wallet(USER_PRIVATE_KEY, provider);
      await newSdk.authenticate('signer', { signer });
      setAuthReady(true);
      addLog(`Authenticated as ${await signer.getAddress()}`);

      sdkRef.current = newSdk;
      setTranscodeManager(newSdk.getTranscodeManager());
      addLog('TranscodeManager ready');
    } catch (err: any) {
      setSdkReady(false);
      setAuthReady(false);
      addLog(`Init failed: ${err.message}`);
    }
  }

  // ── 2. Host Discovery ──
  function getSelectedModelKeyAndId(): { modelKey: string; modelId: string } {
    return { modelKey: `1080p_${selectedCodec}`, modelId: getTranscodeModelId(`1080p_${selectedCodec}`) };
  }

  async function handleDiscoverHosts() {
    if (!sdkRef.current) return;
    setIsDiscovering(true);
    setDiscoveredHosts([]);
    setHostCapacities({});
    try {
      const hostManager = sdkRef.current.getHostManager();
      const { modelKey, modelId } = getSelectedModelKeyAndId();
      addLog(`Discovering hosts for ${modelKey} (${modelId.substring(0, 18)}...)...`);
      const hosts = await hostManager.findHostsForModel(modelId);
      setDiscoveredHosts(hosts);
      addLog(`Found ${hosts.length} host(s)`);
      const capResults = await Promise.all(
        hosts.map(host =>
          fetchTranscodeCapacity(host.apiUrl)
            .then(cap => ({ host, cap, ok: true as const }))
            .catch((err: any) => ({ host, cap: null, ok: false as const, err })),
        ),
      );
      const caps: Record<string, TranscodeCapacity> = {};
      for (const r of capResults) {
        if (r.ok) {
          caps[r.host.address] = r.cap;
          addLog(`  ${r.host.address.substring(0, 10)}... @ ${r.host.apiUrl} — ${r.cap.available}/${r.cap.max} slots, queued=${r.cap.queued}, sidecar=${r.cap.sidecarConnected}`);
        } else {
          addLog(`  ${r.host.address.substring(0, 10)}... @ ${r.host.apiUrl} — unreachable: ${r.err.message}`);
        }
      }
      setHostCapacities(caps);
    } catch (err: any) {
      addLog(`Host discovery failed: ${err.message}`);
    } finally {
      setIsDiscovering(false);
    }
  }

  // ── 3. Concurrent Jobs ──
  function updateJob(jobId: number, updates: Partial<JobState>) {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, ...updates } : j));
  }

  async function submitJob(jobId: number, cid: string, modelId: string, formats: any[]): Promise<{ handle: TranscodeHandle; start: number } | null> {
    updateJob(jobId, { status: 'submitting' });
    const start = Date.now();
    try {
      const handle = await transcodeManager.submitTranscodeWithLoadBalancing(cid, formats, modelId, {
        hostSelectionMode: selectionMode, maxHostRetries: 5, isGpu: true, isEncrypted: encryptSource, depositAmount: '0.0002',
        onProgress: (p: number, g?: { currentGop: number; totalGops: number; elapsedSeconds: number }) => {
          if (!mountedRef.current) return;
          updateJob(jobId, { status: 'transcoding', progress: p, gopInfo: g ? `GOP ${g.currentGop}/${g.totalGops}` : '' });
        },
        onHostSelected: (addr: string, url: string) => {
          updateJob(jobId, { hostAddress: addr, hostUrl: url });
          addLog(`Job #${jobId}: assigned to ${addr.substring(0, 10)}... @ ${url}`);
        },
      });
      handlesRef.current.set(jobId, handle);
      updateJob(jobId, { taskId: handle.taskId });
      return { handle, start };
    } catch (err: any) {
      updateJob(jobId, { status: 'failed', error: err.message, duration: Date.now() - start });
      addLog(`Job #${jobId}: submission failed — ${err.message}`);
      return null;
    }
  }

  async function handleStartConcurrentJobs() {
    if (!transcodeManager || !sourceCid) { addLog('Need TranscodeManager and source CID'); return; }
    const { modelId } = getSelectedModelKeyAndId();
    const formats = buildStreamingFormats(['1080p'], selectedCodec, 0);
    const newJobs = Array.from({ length: concurrentJobs }, (_, i) => createJobState(i + 1));
    setJobs(newJobs);
    handlesRef.current.clear();
    setIsRunning(true);
    // Sessions created sequentially (blockchain nonce ordering),
    // transcodes then run concurrently on the host
    addLog(`Submitting ${concurrentJobs} job(s) (sessions staggered)...`);
    const pending: Array<{ jobId: number; handle: TranscodeHandle; start: number }> = [];
    for (const j of newJobs) {
      const result = await submitJob(j.id, sourceCid, modelId, formats);
      if (result) pending.push({ jobId: j.id, ...result });
    }
    addLog(`${pending.length}/${newJobs.length} submitted, transcodes running concurrently`);
    await Promise.allSettled(pending.map(async ({ jobId, handle, start }) => {
      try {
        const res = await handle.result;
        if (!mountedRef.current) return;
        updateJob(jobId, { status: 'complete', duration: Date.now() - start, outputCount: res.outputs?.length || 0, progress: 100 });
        addLog(`Job #${jobId}: complete (${Date.now() - start}ms, ${res.outputs?.length || 0} outputs)`);
      } catch (err: any) {
        if (!mountedRef.current) return;
        updateJob(jobId, { status: 'failed', error: err.message, duration: Date.now() - start });
        addLog(`Job #${jobId}: failed — ${err.message}`);
      }
    }));
    if (mountedRef.current) setIsRunning(false);
    addLog('All jobs settled');
  }

  function handleCancelAll() {
    handlesRef.current.forEach((h, id) => {
      try { h.cancel(); addLog(`Cancelled job #${id}`); } catch (err: any) { addLog(`Failed to cancel job #${id}: ${err.message}`); }
    });
    addLog('Cancel all requested');
  }

  // ── Render ──
  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 16, color: '#e0e0e0', background: '#0f0f23', minHeight: '100vh', fontFamily: 'monospace' }}>
      <h2 style={{ color: '#60a5fa' }}>Load-Balanced Transcode Stress Test</h2>

      {/* Section 1: Init Status */}
      <div style={sectionStyle}>
        <h3>1. SDK Init</h3>
        <p>{indicator(sdkReady)} SDK &nbsp; {indicator(authReady)} Auth &nbsp; {indicator(!!transcodeManager)} TranscodeManager</p>
      </div>

      {/* Section 2: Host Discovery & Config */}
      <div style={sectionStyle}>
        <h3>2. Host Discovery &amp; Config</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
          <span>Codec: {['h264', 'av1'].map(c => (
            <label key={c} style={{ marginLeft: 8 }}><input type="radio" name="codec" value={c} checked={selectedCodec === c} onChange={() => setSelectedCodec(c as 'h264' | 'av1')} /> {c.toUpperCase()}</label>
          ))}</span>
          <label>Mode: <select value={selectionMode} onChange={e => setSelectionMode(e.target.value as HostSelectionMode)} style={{ ...inputStyle, width: 'auto' }}>
            {Object.values(HostSelectionMode).map(m => <option key={m} value={m}>{m}</option>)}
          </select></label>
          <button style={sdkReady ? blueBtn : disabledBtn} disabled={!sdkReady || isDiscovering} onClick={handleDiscoverHosts}>
            {isDiscovering ? 'Discovering...' : 'Discover Hosts'}
          </button>
        </div>
        {discoveredHosts.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr>{['Address', 'URL', 'Sidecar', 'Slots', 'Queued'].map(h => <th key={h} style={{ textAlign: 'left', padding: 4, borderBottom: '1px solid #444' }}>{h}</th>)}</tr></thead>
            <tbody>{discoveredHosts.map(h => { const c = hostCapacities[h.address]; return (
              <tr key={h.address}><td style={{ padding: 4 }}>{h.address.substring(0, 14)}...</td><td style={{ padding: 4 }}>{h.apiUrl}</td>
                <td style={{ padding: 4 }}>{c ? (c.sidecarConnected ? '✅' : '❌') : '—'}</td>
                <td style={{ padding: 4 }}>{c ? `${c.available}/${c.max}` : '—'}</td>
                <td style={{ padding: 4 }}>{c?.queued ?? '—'}</td></tr>
            ); })}</tbody>
          </table>
        )}
      </div>

      {/* Section 3: Concurrent Transcode Jobs */}
      <div style={sectionStyle}>
        <h3>3. Concurrent Transcode Jobs</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <label><input type="checkbox" checked={encryptSource} onChange={e => setEncryptSource(e.target.checked)} /> Encrypt source</label>
          <label>Source CID: <input style={{ ...inputStyle, width: 360 }} value={sourceCid} onChange={e => setSourceCid(e.target.value)} placeholder="Paste source CID..." /></label>
          <label>Jobs: <input type="number" min={1} max={10} value={concurrentJobs} onChange={e => setConcurrentJobs(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))} style={{ ...inputStyle, width: 60 }} /></label>
          <button style={transcodeManager && sourceCid && !isRunning ? greenBtn : disabledBtn} disabled={!transcodeManager || !sourceCid || isRunning} onClick={handleStartConcurrentJobs}>
            Start {concurrentJobs} Job{concurrentJobs > 1 ? 's' : ''}
          </button>
          <button style={isRunning ? redBtn : disabledBtn} disabled={!isRunning} onClick={handleCancelAll}>Cancel All</button>
        </div>
      </div>

      {/* Section 4: Job Status Table */}
      {jobs.length > 0 && (
        <div style={sectionStyle}>
          <h3>4. Job Status</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr>{['#', 'Host', 'Status', 'Progress', 'Duration', 'Outputs'].map(h => <th key={h} style={{ textAlign: 'left', padding: 4, borderBottom: '1px solid #444' }}>{h}</th>)}</tr></thead>
            <tbody>{jobs.map(j => (
              <tr key={j.id}>
                <td style={{ padding: 4 }}>{j.id}</td>
                <td style={{ padding: 4 }}>{j.hostAddress ? `${j.hostAddress.substring(0, 10)}...` : '—'}</td>
                <td style={{ padding: 4, color: STATUS_COLORS[j.status] }}>{j.status}{j.error ? `: ${j.error.substring(0, 40)}` : ''}</td>
                <td style={{ padding: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 80, height: 8, background: '#333', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${j.progress}%`, height: '100%', background: STATUS_COLORS[j.status], transition: 'width 0.3s' }} />
                    </div>
                    <span>{j.progress}%</span>
                  </div>
                </td>
                <td style={{ padding: 4 }}>{j.duration ? `${(j.duration / 1000).toFixed(1)}s` : '—'}</td>
                <td style={{ padding: 4 }}>{j.outputCount || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
          {/* Host distribution summary */}
          {(() => {
            const dist = jobs.filter(j => j.hostAddress).reduce((acc, j) => { acc[j.hostAddress] = (acc[j.hostAddress] || 0) + 1; return acc; }, {} as Record<string, number>);
            const entries = Object.entries(dist);
            return entries.length > 0 ? (
              <p style={{ marginTop: 8, fontSize: 12, color: '#9ca3af' }}>
                Distribution: {entries.map(([addr, count]) => `${addr.substring(0, 10)}... = ${count} job${count > 1 ? 's' : ''}`).join(' | ')}
              </p>
            ) : null;
          })()}
        </div>
      )}

      {/* Log Panel */}
      <div style={sectionStyle}>
        <h3>Log</h3>
        <div ref={logPanelRef} style={{ maxHeight: 200, overflow: 'auto', background: '#000', padding: 8, borderRadius: 4, fontSize: 12 }}>
          {logs.map(l => <div key={l.id} style={{ whiteSpace: 'pre-wrap' }}>{l.msg}</div>)}
        </div>
      </div>
    </div>
  );
}
