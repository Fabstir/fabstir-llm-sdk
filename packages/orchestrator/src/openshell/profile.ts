// OpenShell provider profile for the delegate daemon (orchestrator 0.8.0).
// OpenShell (NVIDIA's agent sandbox runtime) lets a sandbox reach a model provider only through a profile listing the
// endpoint, the allowed methods and paths, and the programs allowed to call it. The daemon runs OUTSIDE the sandbox
// and holds the only payment key; the sandbox may reach its inference routes and never its control plane.

/** How a sandboxed agent may use a daemon route: always, only when asked for, or never. */
export type SandboxAccess = 'sandbox' | 'optional';

/**
 * Every route the daemon serves, classified for OpenShell. A test enumerates the routes OpenAIServer and the control
 * plane really register and fails on any that is neither listed here nor under the denied control plane, so a new
 * route cannot ship without a decision about sandboxes. Order is the profile's rule order.
 */
export const DAEMON_ROUTES: readonly { method: 'GET' | 'POST'; path: string; access: SandboxAccess }[] = [
  { method: 'GET', path: '/v1/models', access: 'sandbox' },
  { method: 'POST', path: '/v1/chat/completions', access: 'sandbox' },
  { method: 'POST', path: '/v1/responses', access: 'sandbox' },
  // Spends the allowance on image jobs: off unless the profile asks for it.
  { method: 'POST', path: '/v1/images/generations', access: 'optional' },
];

/** The control plane (`/v1/delegate/status`, `/v1/delegate/payer`): denied to every sandbox, whatever else is allowed. */
export const CONTROL_PLANE_PATTERN = '/v1/delegate/**';

export interface OpenShellProfileOptions {
  /** The port the sandbox gateway reaches the daemon on — the PUBLISHED host port when the daemon runs in a container. */
  port: number;
  /** The daemon's host as the sandbox sees it. Default `host.openshell.internal`. */
  host?: string;
  /** Absolute paths of the programs allowed to call the daemon. Default opencode and curl. */
  binaries?: readonly string[];
  /** Also allow POST /v1/images/generations. */
  images?: boolean;
}

export const DEFAULT_OPENSHELL_HOST = 'host.openshell.internal';
export const DEFAULT_OPENSHELL_BINARIES: readonly string[] = ['/usr/local/bin/opencode', '/usr/bin/curl'];

// Values are written into YAML unquoted: anything outside these shapes is refused rather than escaped.
const HOST_RE = /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/;
const BINARY_RE = /^\/[A-Za-z0-9._+\/-]+$/;
// Unquoted, YAML would read these as a number, a boolean or null rather than a hostname (a dotted IPv4 stays a string).
const YAML_NON_STRING_RE = /^(?:[0-9]+(?:\.[0-9]+)?|true|false|yes|no|on|off|null|y|n)$/i;

/** The profile as YAML text. Refuses a port, host or binary that would not survive unquoted in YAML. */
export function openShellProfile(opts: OpenShellProfileOptions): string {
  const { port, images = false } = opts;
  const host = opts.host ?? DEFAULT_OPENSHELL_HOST;
  const binaries = opts.binaries ?? DEFAULT_OPENSHELL_BINARIES;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`OpenShell profile: port must be an integer in 1..65535, got ${port}`);
  if (!HOST_RE.test(host) || YAML_NON_STRING_RE.test(host)) throw new Error(`OpenShell profile: host must be a hostname or IPv4 address, got ${JSON.stringify(host)}`);
  if (binaries.length === 0) throw new Error('OpenShell profile: at least one binary is required');
  for (const b of binaries) {
    if (!BINARY_RE.test(b)) throw new Error(`OpenShell profile: binary must be an absolute path without spaces or YAML characters, got ${JSON.stringify(b)}`);
  }
  const rules = DAEMON_ROUTES.filter((r) => r.access === 'sandbox' || (images && r.access === 'optional'))
    .map((r) => `      - allow:\n          method: ${r.method}\n          path: ${r.path}\n`).join('');
  return [
    '# OpenShell provider profile: Platformless AI (Fabstir) OpenAI-compatible daemon.\n',
    '# The daemon runs OUTSIDE the sandbox on the gateway host and holds the only payment\n',
    '# key (a delegate with an on-chain capped USDC allowance). The sandbox holds no secret.\n',
    'id: fabstir-openai\n',
    'display_name: Platformless AI\n',
    'description: Fabstir orchestrator OpenAI-compatible daemon (delegate-pays, host-local)\n',
    'category: inference\n',
    'inference_capable: true\n',
    'credentials: []\n',
    'endpoints:\n',
    `  - host: ${host}\n`,
    `    port: ${port}\n`,
    '    protocol: rest\n',
    '    enforcement: enforce\n',
    '    rules:\n',
    rules,
    "    # The daemon's control plane (/v1/delegate/*) can change the payer: never from a sandbox.\n",
    '    deny_rules:\n',
    '      - method: "*"\n',
    `        path: ${CONTROL_PLANE_PATTERN}\n`,
    'binaries:\n',
    ...binaries.map((b) => `  - ${b}\n`),
  ].join('');
}

/**
 * `fabstir-orchestrator openshell-profile [--port N] [--host H] [--binary PATH]... [--images]` → the profile on stdout.
 * Port defaults to FABSTIR_OPENAI_PORT (3457). Needs no key, SDK or network.
 */
export function openShellProfileFromArgs(args: readonly string[], env: Record<string, string | undefined>): string {
  let port = Number(env.FABSTIR_OPENAI_PORT ?? '3457');
  let host: string | undefined;
  const binaries: string[] = [];
  let images = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const value = () => {
      const v = args[++i];
      if (v === undefined) throw new Error(`openshell-profile: ${a} needs a value`);
      return v;
    };
    if (a === '--port') port = Number(value());
    else if (a === '--host') host = value();
    else if (a === '--binary') binaries.push(value());
    else if (a === '--images') images = true;
    else throw new Error(`openshell-profile: unknown argument ${a} (use --port, --host, --binary, --images)`);
  }
  return openShellProfile({ port, host, binaries: binaries.length ? binaries : undefined, images });
}
