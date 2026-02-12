/** Manages portal adapters per session -- connects agents to external things. */

import type { HardwareService } from './hardwareService.js';

export interface PortalCapability {
  id: string;
  name: string;
  kind: 'action' | 'event' | 'query';
  description: string;
}

export interface PortalSpec {
  id: string;
  name: string;
  description: string;
  mechanism: string;
  capabilities: PortalCapability[];
  interactions: Array<{ type: 'tell' | 'when' | 'ask'; capabilityId: string }>;
  mcpConfig?: Record<string, unknown>;
  cliConfig?: Record<string, unknown>;
  serialConfig?: Record<string, unknown>;
}

// ── Security: command injection prevention ──────────────────────────

/** Commands allowed for MCP portal servers and CLI portals. */
export const ALLOWED_COMMANDS: ReadonlySet<string> = new Set([
  'node',
  'npx',
  'python',
  'python3',
  'uvx',
  'docker',
  'deno',
  'bun',
  'bunx',
]);

/** Shell metacharacters that must not appear in args. */
const SHELL_META_RE = /[;&|`$(){}[\]<>!\n\r\\'"]/;

/** Control characters (C0 range except tab) that must not appear in env values. */
const CONTROL_CHAR_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f]/;

export function validateCommand(command: string): void {
  if (!command || typeof command !== 'string') {
    throw new Error('Portal command must be a non-empty string');
  }
  // Extract the base command name (strip any path prefix)
  const base = command.replace(/\\/g, '/').split('/').pop()!;
  // Strip .exe/.cmd/.bat suffixes on Windows
  const normalized = base.replace(/\.(exe|cmd|bat)$/i, '');
  if (!ALLOWED_COMMANDS.has(normalized)) {
    throw new Error(
      `Portal command "${command}" is not allowed. Allowed commands: ${[...ALLOWED_COMMANDS].join(', ')}`,
    );
  }
}

export function validateArgs(args: unknown): string[] | undefined {
  if (args === undefined || args === null) return undefined;
  if (!Array.isArray(args)) {
    throw new Error('Portal args must be an array of strings');
  }
  for (const arg of args) {
    if (typeof arg !== 'string') {
      throw new Error('Each portal arg must be a string');
    }
    if (SHELL_META_RE.test(arg)) {
      throw new Error(
        `Portal arg "${arg}" contains forbidden shell metacharacters`,
      );
    }
  }
  return args as string[];
}

export function validateEnv(env: unknown): Record<string, string> | undefined {
  if (env === undefined || env === null) return undefined;
  if (typeof env !== 'object' || Array.isArray(env)) {
    throw new Error('Portal env must be a plain object');
  }
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
    if (typeof key !== 'string' || typeof value !== 'string') {
      throw new Error(`Portal env entry "${key}" must have a string value`);
    }
    if (SHELL_META_RE.test(key)) {
      throw new Error(`Portal env key "${key}" contains forbidden characters`);
    }
    if (CONTROL_CHAR_RE.test(value)) {
      throw new Error(
        `Portal env value for "${key}" contains forbidden control characters`,
      );
    }
    sanitized[key] = value;
  }
  return sanitized;
}

export interface PortalRuntime {
  id: string;
  name: string;
  mechanism: string;
  adapter: PortalAdapter;
  status: 'initializing' | 'ready' | 'error';
}

export interface PortalAdapter {
  initialize(config: Record<string, unknown>): Promise<void>;
  getCapabilities(): PortalCapability[];
  teardown(): Promise<void>;
}

/** Wraps existing HardwareService for serial-connected boards. */
export class SerialPortalAdapter implements PortalAdapter {
  private capabilities: PortalCapability[] = [];
  private hardwareService: HardwareService;

  constructor(hardwareService: HardwareService, capabilities: PortalCapability[]) {
    this.hardwareService = hardwareService;
    this.capabilities = capabilities;
  }

  async initialize(_config: Record<string, unknown>): Promise<void> {
    // Board detection delegated to orchestrator deploy phase
  }

  getCapabilities(): PortalCapability[] {
    return this.capabilities;
  }

  async teardown(): Promise<void> {
    // Serial port cleanup handled by orchestrator
  }
}

/** Generates MCP server config for injection into Claude CLI. */
export class McpPortalAdapter implements PortalAdapter {
  private capabilities: PortalCapability[] = [];
  private mcpConfig: { command: string; args?: string[]; env?: Record<string, string> } = { command: '' };

  constructor(capabilities: PortalCapability[]) {
    this.capabilities = capabilities;
  }

  async initialize(config: Record<string, unknown>): Promise<void> {
    const command = (config.command as string) ?? '';
    validateCommand(command);
    const args = validateArgs(config.args);
    const env = validateEnv(config.env);
    this.mcpConfig = { command, args, env };
  }

  getCapabilities(): PortalCapability[] {
    return this.capabilities;
  }

  getMcpServerConfig(): { command: string; args?: string[]; env?: Record<string, string> } {
    return this.mcpConfig;
  }

  async teardown(): Promise<void> {
    // MCP servers are ephemeral per CLI invocation
  }
}

/** Wraps a CLI tool invocation. */
export class CliPortalAdapter implements PortalAdapter {
  private capabilities: PortalCapability[] = [];
  private command = '';

  constructor(capabilities: PortalCapability[]) {
    this.capabilities = capabilities;
  }

  async initialize(config: Record<string, unknown>): Promise<void> {
    const command = (config.command as string) ?? '';
    validateCommand(command);
    this.command = command;
  }

  getCapabilities(): PortalCapability[] {
    return this.capabilities;
  }

  getCommand(): string {
    return this.command;
  }

  async teardown(): Promise<void> {}
}

/** Manages adapter lifecycle per session. */
export class PortalService {
  private runtimes = new Map<string, PortalRuntime>();
  private hardwareService: HardwareService;

  constructor(hardwareService: HardwareService) {
    this.hardwareService = hardwareService;
  }

  async initializePortals(portalSpecs: PortalSpec[]): Promise<void> {
    for (const spec of portalSpecs) {
      let adapter: PortalAdapter;
      const mechanism = spec.mechanism === 'auto' ? this.detectMechanism(spec) : spec.mechanism;

      switch (mechanism) {
        case 'serial':
          adapter = new SerialPortalAdapter(this.hardwareService, spec.capabilities);
          await adapter.initialize(spec.serialConfig ?? {});
          break;
        case 'mcp':
          adapter = new McpPortalAdapter(spec.capabilities);
          await adapter.initialize(spec.mcpConfig ?? {});
          break;
        case 'cli':
          adapter = new CliPortalAdapter(spec.capabilities);
          await adapter.initialize(spec.cliConfig ?? {});
          break;
        default:
          adapter = new CliPortalAdapter(spec.capabilities);
          await adapter.initialize({});
      }

      this.runtimes.set(spec.id, {
        id: spec.id,
        name: spec.name,
        mechanism,
        adapter,
        status: 'ready',
      });
    }
  }

  getRuntime(portalId: string): PortalRuntime | undefined {
    return this.runtimes.get(portalId);
  }

  getAllRuntimes(): PortalRuntime[] {
    return Array.from(this.runtimes.values());
  }

  /** Collect MCP server configs from all MCP portals. */
  getMcpServers(): Array<{ name: string; command: string; args?: string[]; env?: Record<string, string> }> {
    const servers: Array<{ name: string; command: string; args?: string[]; env?: Record<string, string> }> = [];
    for (const runtime of this.runtimes.values()) {
      if (runtime.adapter instanceof McpPortalAdapter) {
        const config = runtime.adapter.getMcpServerConfig();
        if (config.command) {
          servers.push({ name: runtime.name, ...config });
        }
      }
    }
    return servers;
  }

  /** Check if any portals use serial mechanism. */
  hasSerialPortals(): boolean {
    for (const runtime of this.runtimes.values()) {
      if (runtime.mechanism === 'serial') return true;
    }
    return false;
  }

  async teardownAll(): Promise<void> {
    for (const runtime of this.runtimes.values()) {
      try {
        await runtime.adapter.teardown();
      } catch {
        // ignore cleanup errors
      }
    }
    this.runtimes.clear();
  }

  private detectMechanism(spec: PortalSpec): string {
    if (spec.serialConfig) return 'serial';
    if (spec.mcpConfig) return 'mcp';
    if (spec.cliConfig) return 'cli';
    return 'cli';
  }
}
