// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// Transcoding Test Harness — exercises the full transcode flow against a real host.

import React, { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { FabstirSDKCore, ChainRegistry, ChainId } from '@fabstir/sdk-core';
import type { VideoFormat, TranscodeHandle, TranscodeResult } from '@fabstir/sdk-core';

// ── Env vars ──
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA!;
const USER_PRIVATE_KEY = process.env.NEXT_PUBLIC_TEST_USER_1_PRIVATE_KEY!;
const HOST_ADDRESS = process.env.NEXT_PUBLIC_TEST_HOST_2_ADDRESS!;
const HOST_URL = process.env.NEXT_PUBLIC_TEST_HOST_2_URL!;
const MAX_LOG_ENTRIES = 500;

// ── Transcode model IDs (contract uses keccak256(abi.encodePacked("fabstir/transcoding/", fileName))) ──
function getTranscodeModelId(preset: string): string {
  const fileNames: Record<string, string> = {
    '1080p_h264': '1080p-h264-nvenc',
    '2160p_h264': '2160p-h264-nvenc',
    'both_h264': '1080p-2160p-h264-nvenc',
    '1080p_av1': '1080p-av1-nvenc',
    '2160p_av1': '2160p-av1-nvenc',
    'both_av1': '1080p-2160p-av1-nvenc',
  };
  const fileName = fileNames[preset];
  if (!fileName) throw new Error(`Unknown transcode preset: ${preset}`);
  return ethers.keccak256(ethers.solidityPacked(['string', 'string'], ['fabstir/transcoding/', fileName]));
}

// ── Format presets (node-facing VideoFormat[]) ──
const FORMAT_PRESETS: Record<string, { label: string; formats: VideoFormat[] }> = {
  '1080p_h264': {
    label: '1080p H.264',
    formats: [{ id: 1, ext: 'mp4', vcodec: 'h264_nvenc', acodec: 'aac', preset: 'fast', vf: 'scale=1920x1080', b_v: '5M', ar: '48k', ch: 2, dest: 's5' }],
  },
  '2160p_h264': {
    label: '2160p (4K) H.264',
    formats: [{ id: 1, ext: 'mp4', vcodec: 'h264_nvenc', acodec: 'aac', preset: 'fast', vf: 'scale=3840x2160', b_v: '15M', ar: '48k', ch: 2, dest: 's5' }],
  },
  'both_h264': {
    label: '1080p + 2160p H.264',
    formats: [
      { id: 1, ext: 'mp4', vcodec: 'h264_nvenc', acodec: 'aac', preset: 'fast', vf: 'scale=1920x1080', b_v: '5M', ar: '48k', ch: 2, dest: 's5' },
      { id: 2, ext: 'mp4', vcodec: 'h264_nvenc', acodec: 'aac', preset: 'fast', vf: 'scale=3840x2160', b_v: '15M', ar: '48k', ch: 2, dest: 's5' },
    ],
  },
  '1080p_av1': {
    label: '1080p AV1',
    formats: [{ id: 1, ext: 'mp4', vcodec: 'av1_nvenc', acodec: 'aac', preset: 'p4', vf: 'scale=1920x1080', b_v: '5M', ar: '48k', ch: 2, dest: 's5' }],
  },
  '2160p_av1': {
    label: '2160p (4K) AV1',
    formats: [{ id: 1, ext: 'mp4', vcodec: 'av1_nvenc', acodec: 'aac', preset: 'p4', vf: 'scale=3840x2160', b_v: '15M', ar: '48k', ch: 2, dest: 's5' }],
  },
  'both_av1': {
    label: '1080p + 2160p AV1',
    formats: [
      { id: 1, ext: 'mp4', vcodec: 'av1_nvenc', acodec: 'aac', preset: 'p4', vf: 'scale=1920x1080', b_v: '5M', ar: '48k', ch: 2, dest: 's5' },
      { id: 2, ext: 'mp4', vcodec: 'av1_nvenc', acodec: 'aac', preset: 'p4', vf: 'scale=3840x2160', b_v: '15M', ar: '48k', ch: 2, dest: 's5' },
    ],
  },
};

// ── Styles ──
const sectionStyle: React.CSSProperties = { border: '1px solid #333', borderRadius: 6, padding: 12, marginBottom: 12, background: '#1a1a2e' };
const btnStyle: React.CSSProperties = { padding: '6px 14px', borderRadius: 4, border: 'none', cursor: 'pointer', fontWeight: 600, marginRight: 8 };
const greenBtn: React.CSSProperties = { ...btnStyle, background: '#22c55e', color: '#fff' };
const blueBtn: React.CSSProperties = { ...btnStyle, background: '#3b82f6', color: '#fff' };
const redBtn: React.CSSProperties = { ...btnStyle, background: '#ef4444', color: '#fff' };
const disabledBtn: React.CSSProperties = { ...btnStyle, background: '#555', color: '#999', cursor: 'not-allowed' };
const inputStyle: React.CSSProperties = { width: '100%', padding: 6, borderRadius: 4, border: '1px solid #555', background: '#0f0f23', color: '#e0e0e0', fontFamily: 'monospace', fontSize: 13 };
const indicator = (ok: boolean | null) => ok === null ? '⏳' : ok ? '✅' : '❌';

export default function TranscodeTestPage() {
  // ── State ──
  const [logs, setLogs] = useState<string[]>([]);
  const [sdk, setSdk] = useState<FabstirSDKCore | null>(null);
  const [sessionManager, setSessionManager] = useState<any>(null);
  const [transcodeManager, setTranscodeManager] = useState<any>(null);

  // Init status
  const [sdkReady, setSdkReady] = useState<boolean | null>(null);
  const [authReady, setAuthReady] = useState<boolean | null>(null);

  // Feature detection
  const [transcodingAvail, setTranscodingAvail] = useState<boolean | null>(null);
  const [trustlessAvail, setTrustlessAvail] = useState<boolean | null>(null);

  // Session
  const [sessionId, setSessionId] = useState<string>('');
  const [jobId, setJobId] = useState<string>('');

  // Upload
  const [isUploading, setIsUploading] = useState(false);
  const [encryptSource, setEncryptSource] = useState(true);

  // Transcode
  const [sourceCid, setSourceCid] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('1080p_h264');
  const [progress, setProgress] = useState(0);
  const [gopInfo, setGopInfo] = useState('');
  const [isTranscoding, setIsTranscoding] = useState(false);
  const [result, setResult] = useState<TranscodeResult | null>(null);

  // Price
  const [priceEstimate, setPriceEstimate] = useState<any>(null);
  const [durationSec, setDurationSec] = useState(60);

  const handleRef = useRef<TranscodeHandle | null>(null);
  const logPanelRef = useRef<HTMLDivElement>(null);

  function addLog(msg: string) {
    const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
    setLogs(prev => [...prev, `[${ts}] ${msg}`].slice(-MAX_LOG_ENTRIES));
  }

  // Auto-scroll log panel
  useEffect(() => {
    if (logPanelRef.current) logPanelRef.current.scrollTop = logPanelRef.current.scrollHeight;
  }, [logs]);

  // ── 1. SDK Init + Auth (auto on mount) ──
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    initAndAuth();
    return () => { mountedRef.current = false; handleRef.current = null; };
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

      // Authenticate with private key
      addLog('Authenticating...');
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const signer = new ethers.Wallet(USER_PRIVATE_KEY, provider);
      await newSdk.authenticate('signer', { signer });
      setAuthReady(true);
      addLog(`Authenticated as ${await signer.getAddress()}`);

      // Get managers
      const sm = newSdk.getSessionManager() as any; // Cast to access submitTranscode
      const tm = newSdk.getTranscodeManager();
      setSdk(newSdk);
      setSessionManager(sm);
      setTranscodeManager(tm);
      addLog('Managers ready (SessionManager, TranscodeManager)');
    } catch (err: any) {
      setSdkReady(false);
      setAuthReady(false);
      addLog(`Init failed: ${err.message}`);
    }
  }

  // ── 2. Feature Detection ──
  async function checkHost() {
    if (!transcodeManager) return;
    addLog(`Checking host capabilities at ${HOST_URL}...`);
    try {
      const [tc, tl] = await Promise.all([
        transcodeManager.isTranscodingAvailable(HOST_URL),
        transcodeManager.isTrustlessAvailable(HOST_URL),
      ]);
      setTranscodingAvail(tc);
      setTrustlessAvail(tl);
      addLog(`Transcoding: ${tc ? 'available' : 'not available'}, Trustless: ${tl ? 'available' : 'not available'}`);
    } catch (err: any) {
      addLog(`Feature detection failed: ${err.message}`);
      setTranscodingAvail(false);
      setTrustlessAvail(false);
    }
  }

  // ── 3. Session Management ──
  async function handleStartSession() {
    if (!sessionManager) return;
    const modelId = getTranscodeModelId(selectedPreset);
    addLog(`Starting session with modelId=${modelId.substring(0, 18)}... (${selectedPreset})`);
    try {
      const result = await sessionManager.startSession({
        host: HOST_ADDRESS,
        modelId,
        chainId: ChainId.BASE_SEPOLIA,
        endpoint: HOST_URL,
        depositAmount: '0.0002',
        pricePerToken: 4000000000000,
        proofInterval: 100,
        duration: 3600,
        paymentMethod: 'deposit',
        encryption: true,
      });
      const sid = result.sessionId.toString();
      const jid = result.jobId.toString();
      setSessionId(sid);
      setJobId(jid);
      addLog(`Session started: sessionId=${sid}, jobId=${jid}`);
    } catch (err: any) {
      addLog(`Start session failed: ${err.message}`);
    }
  }

  // ── 4. Price Estimation ──
  async function handleEstimatePrice() {
    if (!transcodeManager) return;
    addLog('Estimating price...');
    try {
      const preset = FORMAT_PRESETS[selectedPreset];
      const formatSpec = {
        version: '1.0.0' as const,
        input: { cid: sourceCid || 'placeholder' },
        output: {
          video: { codec: preset.formats[0].vcodec as any, resolution: parseResolution(preset.formats[0].vf), frameRate: 30, bitrate: { target: parseBitrate(preset.formats[0].b_v) } },
          audio: { codec: (preset.formats[0].acodec || 'aac') as any, sampleRate: 48000, channels: preset.formats[0].ch || 2 },
          container: preset.formats[0].ext as any,
        },
        quality: { tier: 'standard' as const },
        gop: { size: 60, structure: 'IBBPBBP' },
        proof: { strategy: 'per_gop' as any, requireQualityMetrics: true },
      };
      const est = await transcodeManager.estimateTranscodePrice(HOST_ADDRESS, formatSpec, durationSec);
      setPriceEstimate(est);
      addLog(`Price estimate: ${est.totalCost} tokens (${est.breakdown.pricePerSecond}/sec, ${durationSec}s, ${est.breakdown.codec}@${est.breakdown.resolution})`);
    } catch (err: any) {
      addLog(`Price estimation failed: ${err.message}`);
    }
  }

  // ── 5. Video Upload ──
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !sdk) return;
    setIsUploading(true);
    addLog(`Uploading ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB) to S5 portal...`);
    try {
      const storageManager = sdk.getStorageManager() as any;
      const s5 = storageManager.getS5Client();

      const blob = new Blob([await file.arrayBuffer()], { type: file.type || 'video/mp4' });
      let cid: string;

      if (encryptSource) {
        // Encrypted upload → construct S5 encrypted CID (0xae format with embedded key)
        const result = await s5.fs.uploadBlobEncrypted(blob);
        addLog(`Encrypted upload complete: hash=${Array.from(result.hash.slice(0, 4)).map((b: number) => b.toString(16).padStart(2, '0')).join('')}..., padding=${result.padding}`);

        // Build plaintext BlobIdentifier bytes: [0x5b, 0x82, 0x1f, ...hash(32), ...sizeLE]
        const sizeLE: number[] = [];
        let s = result.size;
        do { sizeLE.push(s & 0xff); s = Math.floor(s / 256); } while (s > 0);
        while (sizeLE.length > 1 && sizeLE[sizeLE.length - 1] === 0) sizeLE.pop();
        // Plaintext CID tail: [0x26, 0x1f, ...hash(32), ...sizeLE]
        const plaintextCID = new Uint8Array([0x26, 0x1f, ...result.hash, ...sizeLE]);
        // Padding as 4-byte little-endian
        const paddingLE = new Uint8Array(4);
        paddingLE[0] = result.padding & 0xff; paddingLE[1] = (result.padding >> 8) & 0xff;
        paddingLE[2] = (result.padding >> 16) & 0xff; paddingLE[3] = (result.padding >> 24) & 0xff;
        // Full encrypted CID: [0xae, 0x01, 18, 0x1f, ...encryptedHash(32), ...key(32), ...padding(4), ...plaintextCID]
        const encCID = new Uint8Array([0xae, 0x01, 18, 0x1f, ...result.encryptedBlobHash, ...result.encryptionKey, ...paddingLE, ...plaintextCID]);
        const { base64url } = await import('multiformats/bases/base64');
        cid = `s5://${base64url.encode(encCID)}`;
        addLog(`Encrypted CID: ${cid.substring(0, 40)}...`);
      } else {
        // Unencrypted upload
        const blobId = await s5.api.uploadBlob(blob);
        const zCid = blobId.toBase58();
        addLog(`Upload complete. Blob CID: ${zCid}`);
        try {
          const downloaded = await s5.downloadByCID(zCid);
          addLog(`Verified: downloaded ${downloaded.length} bytes from S5 portal`);
        } catch (e: any) {
          addLog(`WARNING: verification download failed: ${e.message}`);
        }
        cid = `s5://${zCid}`;
      }

      setSourceCid(cid);
      addLog(`Save this CID for future use: ${cid}`);
    } catch (err: any) {
      addLog(`Upload failed: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  }

  // ── 6. Transcode Execution ──
  async function handleStartTranscode() {
    if (!sessionManager || !sessionId || !sourceCid) {
      addLog('Missing session or source CID');
      return;
    }
    setIsTranscoding(true);
    setProgress(0);
    setGopInfo('');
    setResult(null);
    addLog(`Starting transcode: preset=${selectedPreset}, cid=${sourceCid.substring(0, 20)}...`);
    try {
      const formats = FORMAT_PRESETS[selectedPreset].formats;
      const handle = await sessionManager.submitTranscode(sessionId, sourceCid, formats, {
        isGpu: true,
        isEncrypted: encryptSource,
        onProgress: (p: number, g?: { currentGop: number; totalGops: number; elapsedSeconds: number }) => {
          if (!mountedRef.current) return;
          setProgress(p);
          if (g) setGopInfo(`GOP ${g.currentGop}/${g.totalGops} (${g.elapsedSeconds}s)`);
          if (p % 25 === 0 || p === 100) addLog(`Progress: ${p}%${g ? ` — GOP ${g.currentGop}/${g.totalGops}` : ''}`);
        },
      });
      handleRef.current = handle;
      addLog(`Transcode submitted: taskId=${handle.taskId}`);

      const res = await handle.result;
      if (!mountedRef.current) return;
      setResult(res);
      setIsTranscoding(false);
      addLog(`Transcode complete: ${res.outputs?.length || 0} output(s), ${res.duration}ms`);
    } catch (err: any) {
      if (!mountedRef.current) return;
      setIsTranscoding(false);
      addLog(`Transcode failed: ${err.message}`);
    }
  }

  function handleCancelTranscode() {
    if (handleRef.current) {
      handleRef.current.cancel();
      addLog('Transcode cancel requested');
      setIsTranscoding(false);
    }
  }

  // ── Helpers ──
  function parseResolution(vf?: string): { width: number; height: number } {
    const m = vf?.match(/scale=(\d+)x(\d+)/);
    return m ? { width: parseInt(m[1]), height: parseInt(m[2]) } : { width: 1920, height: 1080 };
  }
  function parseBitrate(bv?: string): number {
    if (!bv) return 5000;
    const n = parseFloat(bv);
    return bv.endsWith('M') ? n * 1000 : n;
  }

  // ── Render ──
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 20, color: '#e0e0e0', background: '#0f0f23', minHeight: '100vh', fontFamily: 'system-ui, monospace' }}>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Transcoding Test Harness</h1>

      {/* 1. Init Status */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 8px' }}>1. SDK Init &amp; Auth</h3>
        <div>{indicator(sdkReady)} SDK Initialized &nbsp; {indicator(authReady)} Authenticated</div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Host: {HOST_ADDRESS?.substring(0, 10)}... @ {HOST_URL}</div>
      </div>

      {/* 2. Feature Detection */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 8px' }}>2. Feature Detection</h3>
        <button style={authReady ? blueBtn : disabledBtn} onClick={checkHost} disabled={!authReady}>Check Host</button>
        <span style={{ marginLeft: 12 }}>
          {indicator(transcodingAvail)} Transcoding &nbsp; {indicator(trustlessAvail)} Trustless Verification
        </span>
      </div>

      {/* 3. Session */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 8px' }}>3. Session Management</h3>
        <button style={authReady && !sessionId ? greenBtn : disabledBtn} onClick={handleStartSession} disabled={!authReady || !!sessionId}>
          Start Session
        </button>
        {sessionId && <span style={{ marginLeft: 12, fontSize: 13 }}>Session: {sessionId} | Job: {jobId}</span>}
      </div>

      {/* 4. Video Source */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 8px' }}>4. Video Source</h3>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 13, marginRight: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={encryptSource} onChange={e => setEncryptSource(e.target.checked)} />
            {' '}Encrypt source
          </label>
          <label style={{ fontSize: 13, marginRight: 8 }}>Upload video to S5:</label>
          <input type="file" accept="video/*" onChange={handleFileUpload} disabled={!authReady || isUploading} style={{ fontSize: 13 }} />
          {isUploading && <span style={{ marginLeft: 8, color: '#3b82f6' }}>Uploading{encryptSource ? ' (encrypted)' : ''}...</span>}
        </div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Or paste a previously obtained CID:</div>
        <input
          style={inputStyle}
          placeholder="S5 CID from previous upload (e.g. uJh5...)"
          value={sourceCid}
          onChange={e => setSourceCid(e.target.value.trim())}
        />
      </div>

      {/* 5. Format Selection */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 8px' }}>5. Format Preset</h3>
        {Object.entries(FORMAT_PRESETS).map(([key, { label }]) => (
          <label key={key} style={{ marginRight: 16, cursor: 'pointer' }}>
            <input type="radio" name="preset" value={key} checked={selectedPreset === key} onChange={() => setSelectedPreset(key)} />
            {' '}{label}
          </label>
        ))}
      </div>

      {/* 6. Price Estimation */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 8px' }}>6. Price Estimation</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <label style={{ fontSize: 13 }}>Duration (sec):</label>
          <input type="number" style={{ ...inputStyle, width: 80 }} value={durationSec} onChange={e => setDurationSec(parseInt(e.target.value) || 60)} />
          <button style={authReady ? blueBtn : disabledBtn} onClick={handleEstimatePrice} disabled={!authReady}>Estimate Price</button>
        </div>
        {priceEstimate && (
          <div style={{ fontSize: 13, background: '#0a0a1a', padding: 8, borderRadius: 4 }}>
            Total: {priceEstimate.totalCost} tokens | Per second: {priceEstimate.breakdown.pricePerSecond} |
            {' '}{priceEstimate.breakdown.resolution} {priceEstimate.breakdown.codec} ({priceEstimate.breakdown.quality})
          </div>
        )}
      </div>

      {/* 7. Transcode Execution */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 8px' }}>7. Transcode</h3>
        <div style={{ marginBottom: 8 }}>
          <button
            style={sessionId && sourceCid && !isTranscoding ? greenBtn : disabledBtn}
            onClick={handleStartTranscode}
            disabled={!sessionId || !sourceCid || isTranscoding}
          >
            Start Transcode
          </button>
          <button
            style={isTranscoding ? redBtn : disabledBtn}
            onClick={handleCancelTranscode}
            disabled={!isTranscoding}
          >
            Cancel
          </button>
        </div>
        {/* Progress bar */}
        <div style={{ background: '#333', borderRadius: 4, height: 20, marginBottom: 4, overflow: 'hidden' }}>
          <div style={{ background: progress === 100 ? '#22c55e' : '#3b82f6', height: '100%', width: `${progress}%`, transition: 'width 0.3s' }} />
        </div>
        <div style={{ fontSize: 13, color: '#aaa' }}>
          {progress}% {gopInfo && `| ${gopInfo}`}
        </div>
      </div>

      {/* 8. Results */}
      {result && (
        <div style={sectionStyle}>
          <h3 style={{ margin: '0 0 8px' }}>8. Results</h3>
          <div style={{ fontSize: 13, background: '#0a0a1a', padding: 8, borderRadius: 4 }}>
            <div><strong>Outputs:</strong> {result.outputs?.length ? result.outputs.map((o: any, i: number) => {
              const rawCid = o.cid || o.outputCid || '';
              const bareCid = rawCid.replace(/^s5:\/\//, '');
              const isEncCid = bareCid.startsWith('u');
              return (
                <div key={i} style={{ marginLeft: 12 }}>
                  <span style={{ wordBreak: 'break-all' }}>{rawCid.substring(0, 40)}...{rawCid.substring(rawCid.length - 10)}</span>
                  {bareCid && !isEncCid && (
                    <a href={`https://s5.platformlessai.ai/s5/blob/${bareCid}`} target="_blank" rel="noreferrer" style={{ marginLeft: 8, color: '#3b82f6' }}>Download</a>
                  )}
                  {bareCid && (
                    <button style={{ ...blueBtn, marginLeft: 8, fontSize: 12, padding: '3px 8px' }} onClick={async () => {
                      try {
                        addLog(`Downloading output ${i + 1} via S5...`);
                        const sm = (sdk as any).getStorageManager().getS5Client();
                        let data: Uint8Array;
                        // Check if CID is encrypted (0xae prefix) — parse and decrypt manually
                        const { base64url: b64u } = await import('multiformats/bases/base64');
                        const { base58btc: b58 } = await import('multiformats/bases/base58');
                        const cidBytes = bareCid.startsWith('u') ? b64u.decode(bareCid) : bareCid.startsWith('z') ? b58.decode(bareCid) : null;
                        if (cidBytes && cidBytes[0] === 0xae) {
                          // Encrypted CID: [0xae, algo, chunkPow, 0x1f, encHash(32), key(32), padding(4), plaintextCID...]
                          const encHash = cidBytes.slice(4, 36);
                          const encKey = cidBytes.slice(36, 68);
                          const pCid = cidBytes.slice(72); // plaintext CID tail
                          // Extract plaintext size from tail: [0x26, 0x1f, hash(32), ...sizeLE]
                          const sizeBytes = pCid.slice(34);
                          let pSize = 0;
                          for (let j = sizeBytes.length - 1; j >= 0; j--) pSize = pSize * 256 + sizeBytes[j];
                          addLog(`Encrypted output: decrypting ${pSize} bytes...`);
                          data = await sm.fs.downloadAndDecryptBlob(encHash, encKey, pSize);
                        } else {
                          data = await sm.downloadByCID(bareCid);
                        }
                        const fileBlob = new Blob([data], { type: 'video/mp4' });
                        const url = URL.createObjectURL(fileBlob);
                        const a = document.createElement('a'); a.href = url; a.download = `output-${o.id || i}.${o.ext || 'mp4'}`;
                        document.body.appendChild(a); a.click(); document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        addLog(`Downloaded output ${i + 1}: ${data.length} bytes`);
                      } catch (e: any) { addLog(`Download failed: ${e.message}`); }
                    }}>Save via S5</button>
                  )}
                </div>
              );
            }) : 'none'}</div>
            {result.billing && <div><strong>Billing:</strong> {result.billing.units} units / {result.billing.tokens} tokens</div>}
            <div><strong>Duration:</strong> {result.duration}ms</div>
            {result.qualityMetrics && (
              <div><strong>Quality:</strong> PSNR={result.qualityMetrics.psnrDB}dB, Bitrate={result.qualityMetrics.actualBitrate}bps
                {result.qualityMetrics.ssim != null && `, SSIM=${result.qualityMetrics.ssim}`}
              </div>
            )}
            {result.proofTreeCID && <div><strong>Proof Tree:</strong> <a href={`https://s5.platformlessai.ai/s5/blob/${result.proofTreeCID.replace(/^s5:\/\//, '')}`} target="_blank" rel="noreferrer" style={{ color: '#3b82f6' }}>{result.proofTreeCID.substring(0, 30)}...</a></div>}
            {result.proofTreeRootHash && <div><strong>Root Hash:</strong> {result.proofTreeRootHash}</div>}
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', color: '#888' }}>Raw result JSON</summary>
              <pre style={{ fontSize: 11, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(result, null, 2)}</pre>
            </details>
          </div>
        </div>
      )}

      {/* 9. Log Panel */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 8px' }}>9. Log</h3>
        <div ref={logPanelRef} style={{ height: 200, overflow: 'auto', background: '#0a0a1a', padding: 8, borderRadius: 4, fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          {logs.map((l, i) => <div key={i} style={{ color: l.includes('failed') || l.includes('Failed') ? '#ef4444' : l.includes('✅') || l.includes('complete') ? '#22c55e' : '#ccc' }}>{l}</div>)}
        </div>
      </div>
    </div>
  );
}
