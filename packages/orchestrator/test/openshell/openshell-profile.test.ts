// OpenShell provider profile (docs/development/IMPLEMENTATION-ORCHESTRATOR-OPENSHELL.md O6–O8, orchestrator 0.8.0).
// One route table classifies every daemon route; the profile is generated from it, so a new route cannot reach the
// daemon without a decision about the sandbox. The default output is the profile the node developer tested.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { OpenAIServer } from '../../src/openai/OpenAIServer';
import { DelegateControlPlane } from '../../src/delegate/control-plane';
import { DAEMON_ROUTES, CONTROL_PLANE_PATTERN, openShellProfile } from '../../src/openshell/profile';

const TESTED = readFileSync(join(__dirname, 'fabstir-openai.tested.yaml'), 'utf8');

/** Every route the daemon really registers: the OpenAI server plus the control plane, as runCLI mounts them. */
function registeredRoutes(): { method: string; path: string }[] {
  const server = new OpenAIServer({ pool: {} as any, modelRouter: { getAvailableModels: () => [] }, config: {} as any, gate: { check: async () => ({ authorized: true, allowanceRemaining: 1n }) } });
  new DelegateControlPlane({ sdk: {} as any, delegateAddress: '0x' + '1'.repeat(40), chainId: 84532 }).mount(server.app);
  const out: { method: string; path: string }[] = [];
  for (const layer of (server.app as any)._router.stack) {
    if (!layer.route) continue;
    for (const m of Object.keys(layer.route.methods)) out.push({ method: m.toUpperCase(), path: layer.route.path });
  }
  return out;
}

describe('R1 — every daemon route is classified', () => {
  it('each registered route is in DAEMON_ROUTES or under the denied control plane', () => {
    const routes = registeredRoutes();
    expect(routes.length).toBeGreaterThanOrEqual(6);
    for (const r of routes) {
      const known = DAEMON_ROUTES.some((d) => d.method === r.method && d.path === r.path);
      const control = r.path.startsWith('/v1/delegate/');
      expect(known || control, `${r.method} ${r.path} has no OpenShell classification`).toBe(true);
    }
  });

  it('every classified route is really registered (the table cannot drift the other way)', () => {
    const routes = registeredRoutes();
    for (const d of DAEMON_ROUTES) expect(routes, `${d.method} ${d.path}`).toContainEqual({ method: d.method, path: d.path });
  });
});

describe('the generated profile', () => {
  it('R2: by default it is the profile the node developer tested, byte for byte', () => {
    expect(openShellProfile({ port: 13457 })).toBe(TESTED);
  });

  it('R3: images is off by default and on with images: true', () => {
    expect(openShellProfile({ port: 13457 })).not.toContain('/v1/images/generations');
    const withImages = openShellProfile({ port: 13457, images: true });
    expect(withImages).toContain('      - allow:\n          method: POST\n          path: /v1/images/generations\n');
  });

  it('R4: port, host and binaries are applied', () => {
    const p = openShellProfile({ port: 23457, host: 'gateway.local', binaries: ['/usr/bin/aider'] });
    expect(p).toContain('  - host: gateway.local\n    port: 23457\n');
    expect(p).toContain('binaries:\n  - /usr/bin/aider\n');
    expect(p).not.toContain('opencode');
  });

  it('R5: the control plane is always denied', () => {
    for (const o of [{ port: 1 }, { port: 1, images: true }]) {
      expect(openShellProfile(o)).toContain(`    deny_rules:\n      - method: "*"\n        path: ${CONTROL_PLANE_PATTERN}\n`);
    }
  });

  it('R7: values that would break or inject into the YAML are refused', () => {
    for (const port of [0, 65536, 1.5, NaN]) expect(() => openShellProfile({ port })).toThrow(/port/);
    for (const host of ['', 'a b', 'x\nid: evil', 'h:1']) expect(() => openShellProfile({ port: 1, host })).toThrow(/host/);
    // values YAML would read as a number, a boolean or null (round 1); a dotted IPv4 stays a string and is accepted
    for (const host of ['12345', '1.5', 'true', 'yes', 'on', 'off', 'no', 'null', 'TRUE']) expect(() => openShellProfile({ port: 1, host })).toThrow(/host/);
    expect(openShellProfile({ port: 1, host: '172.17.0.1' })).toContain('  - host: 172.17.0.1\n');
    for (const b of ['curl', '/usr/bin/a b', '/x\n- /bin/sh', '/x#y']) expect(() => openShellProfile({ port: 1, binaries: [b] })).toThrow(/binary/);
    expect(() => openShellProfile({ port: 1, binaries: [] })).toThrow(/binary/);
  });
});

describe('R6 — fabstir-orchestrator openshell-profile', () => {
  it('prints the profile from flags and exits without keys, SDK or network', async () => {
    const { runCLI } = await import('../../src/cli/orchestrate');
    const env = process.env;
    process.env = { FABSTIR_OPENAI_PORT: '3457' } as any; // no FABSTIR_PRIVATE_KEY / FABSTIR_PAYER
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    try {
      await runCLI(['node', 'orchestrate', 'openshell-profile', '--port', '13457']);
      expect(out.mock.calls.map((c) => c[0]).join('')).toBe(TESTED);
      out.mockClear();
      await runCLI(['node', 'orchestrate', 'openshell-profile', '--images', '--binary', '/usr/bin/aider', '--host', 'gw.local']);
      const printed = out.mock.calls.map((c) => c[0]).join('');
      expect(printed).toContain('  - host: gw.local\n    port: 3457\n'); // FABSTIR_OPENAI_PORT when --port is absent
      expect(printed).toContain('/v1/images/generations');
      expect(printed).toContain('  - /usr/bin/aider\n');
      expect(exit).not.toHaveBeenCalled();
    } finally {
      process.env = env;
      out.mockRestore();
      exit.mockRestore();
    }
  });

  it('an unknown flag is refused with exit 1', async () => {
    const { runCLI } = await import('../../src/cli/orchestrate');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    try {
      await runCLI(['node', 'orchestrate', 'openshell-profile', '--prot', '1']);
      expect(err).toHaveBeenCalledWith(expect.stringContaining('--prot'));
      expect(exit).toHaveBeenCalledWith(1);
    } finally {
      err.mockRestore();
      exit.mockRestore();
    }
  });
});
