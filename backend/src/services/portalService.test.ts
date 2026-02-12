import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SerialPortalAdapter,
  McpPortalAdapter,
  CliPortalAdapter,
  PortalService,
  type PortalSpec,
  type PortalCapability,
} from './portalService.js';

const sampleCapabilities: PortalCapability[] = [
  { id: 'cap-1', name: 'LED on', kind: 'action', description: 'Turn LED on' },
  { id: 'cap-2', name: 'Read temp', kind: 'query', description: 'Read temperature' },
];

function makeMockHardwareService() {
  return {} as any;
}

// ---------------------------------------------------------------------------
// SerialPortalAdapter
// ---------------------------------------------------------------------------
describe('SerialPortalAdapter', () => {
  it('returns capabilities passed at construction', () => {
    const adapter = new SerialPortalAdapter(makeMockHardwareService(), sampleCapabilities);
    expect(adapter.getCapabilities()).toEqual(sampleCapabilities);
  });

  it('initialize is a no-op (does not throw)', async () => {
    const adapter = new SerialPortalAdapter(makeMockHardwareService(), sampleCapabilities);
    await expect(adapter.initialize({})).resolves.toBeUndefined();
  });

  it('teardown is a no-op (does not throw)', async () => {
    const adapter = new SerialPortalAdapter(makeMockHardwareService(), []);
    await expect(adapter.teardown()).resolves.toBeUndefined();
  });

  it('handles empty capabilities', () => {
    const adapter = new SerialPortalAdapter(makeMockHardwareService(), []);
    expect(adapter.getCapabilities()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// McpPortalAdapter
// ---------------------------------------------------------------------------
describe('McpPortalAdapter', () => {
  it('returns capabilities passed at construction', () => {
    const adapter = new McpPortalAdapter(sampleCapabilities);
    expect(adapter.getCapabilities()).toEqual(sampleCapabilities);
  });

  it('initializes with command, args, and env', async () => {
    const adapter = new McpPortalAdapter([]);
    await adapter.initialize({
      command: 'npx',
      args: ['-y', '@anthropic-ai/mcp-fs'],
      env: { HOME: '/tmp' },
    });
    const config = adapter.getMcpServerConfig();
    expect(config.command).toBe('npx');
    expect(config.args).toEqual(['-y', '@anthropic-ai/mcp-fs']);
    expect(config.env).toEqual({ HOME: '/tmp' });
  });

  it('defaults to empty command when config is empty', async () => {
    const adapter = new McpPortalAdapter([]);
    await adapter.initialize({});
    const config = adapter.getMcpServerConfig();
    expect(config.command).toBe('');
  });

  it('getMcpServerConfig returns initial defaults before initialize', () => {
    const adapter = new McpPortalAdapter([]);
    const config = adapter.getMcpServerConfig();
    expect(config.command).toBe('');
  });

  it('teardown is a no-op', async () => {
    const adapter = new McpPortalAdapter([]);
    await expect(adapter.teardown()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// CliPortalAdapter
// ---------------------------------------------------------------------------
describe('CliPortalAdapter', () => {
  it('returns capabilities passed at construction', () => {
    const adapter = new CliPortalAdapter(sampleCapabilities);
    expect(adapter.getCapabilities()).toEqual(sampleCapabilities);
  });

  it('initializes with command', async () => {
    const adapter = new CliPortalAdapter([]);
    await adapter.initialize({ command: 'python3' });
    expect(adapter.getCommand()).toBe('python3');
  });

  it('defaults to empty command', async () => {
    const adapter = new CliPortalAdapter([]);
    await adapter.initialize({});
    expect(adapter.getCommand()).toBe('');
  });

  it('teardown is a no-op', async () => {
    const adapter = new CliPortalAdapter([]);
    await expect(adapter.teardown()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// PortalService
// ---------------------------------------------------------------------------
describe('PortalService', () => {
  let service: PortalService;

  beforeEach(() => {
    service = new PortalService(makeMockHardwareService());
  });

  // -- initializePortals ----------------------------------------------------
  describe('initializePortals', () => {
    it('creates a serial adapter when mechanism is serial', async () => {
      const spec: PortalSpec = {
        id: 'p1', name: 'Board', description: 'ESP32', mechanism: 'serial',
        capabilities: sampleCapabilities, interactions: [],
        serialConfig: { baudRate: 115200 },
      };
      await service.initializePortals([spec]);
      const rt = service.getRuntime('p1');
      expect(rt).toBeDefined();
      expect(rt!.mechanism).toBe('serial');
      expect(rt!.status).toBe('ready');
      expect(rt!.adapter).toBeInstanceOf(SerialPortalAdapter);
    });

    it('creates an MCP adapter when mechanism is mcp', async () => {
      const spec: PortalSpec = {
        id: 'p2', name: 'FS', description: 'Files', mechanism: 'mcp',
        capabilities: [], interactions: [],
        mcpConfig: { command: 'npx', args: ['-y', 'pkg'] },
      };
      await service.initializePortals([spec]);
      const rt = service.getRuntime('p2');
      expect(rt!.adapter).toBeInstanceOf(McpPortalAdapter);
    });

    it('creates a CLI adapter when mechanism is cli', async () => {
      const spec: PortalSpec = {
        id: 'p3', name: 'Tool', description: 'CLI', mechanism: 'cli',
        capabilities: [], interactions: [],
        cliConfig: { command: 'python3' },
      };
      await service.initializePortals([spec]);
      const rt = service.getRuntime('p3');
      expect(rt!.adapter).toBeInstanceOf(CliPortalAdapter);
    });

    it('defaults unknown mechanism to CLI adapter', async () => {
      const spec: PortalSpec = {
        id: 'p4', name: 'Unknown', description: '', mechanism: 'something-else',
        capabilities: [], interactions: [],
      };
      await service.initializePortals([spec]);
      const rt = service.getRuntime('p4');
      expect(rt!.adapter).toBeInstanceOf(CliPortalAdapter);
    });

    it('initializes multiple portals', async () => {
      const specs: PortalSpec[] = [
        { id: 'a', name: 'A', description: '', mechanism: 'cli', capabilities: [], interactions: [] },
        { id: 'b', name: 'B', description: '', mechanism: 'mcp', capabilities: [], interactions: [], mcpConfig: { command: 'x' } },
      ];
      await service.initializePortals(specs);
      expect(service.getAllRuntimes()).toHaveLength(2);
    });

    it('handles empty array', async () => {
      await service.initializePortals([]);
      expect(service.getAllRuntimes()).toHaveLength(0);
    });

    it('uses empty object when config is missing', async () => {
      const spec: PortalSpec = {
        id: 'p5', name: 'No-cfg', description: '', mechanism: 'serial',
        capabilities: [], interactions: [],
        // no serialConfig
      };
      await service.initializePortals([spec]);
      expect(service.getRuntime('p5')!.status).toBe('ready');
    });
  });

  // -- auto-detection -------------------------------------------------------
  describe('auto-detection', () => {
    it('detects serial when serialConfig present', async () => {
      const spec: PortalSpec = {
        id: 'auto-s', name: 'Auto', description: '', mechanism: 'auto',
        capabilities: [], interactions: [],
        serialConfig: { baudRate: 9600 },
      };
      await service.initializePortals([spec]);
      expect(service.getRuntime('auto-s')!.mechanism).toBe('serial');
    });

    it('detects mcp when mcpConfig present', async () => {
      const spec: PortalSpec = {
        id: 'auto-m', name: 'Auto', description: '', mechanism: 'auto',
        capabilities: [], interactions: [],
        mcpConfig: { command: 'npx' },
      };
      await service.initializePortals([spec]);
      expect(service.getRuntime('auto-m')!.mechanism).toBe('mcp');
    });

    it('detects cli when cliConfig present', async () => {
      const spec: PortalSpec = {
        id: 'auto-c', name: 'Auto', description: '', mechanism: 'auto',
        capabilities: [], interactions: [],
        cliConfig: { command: 'python3' },
      };
      await service.initializePortals([spec]);
      expect(service.getRuntime('auto-c')!.mechanism).toBe('cli');
    });

    it('falls back to cli when no config present', async () => {
      const spec: PortalSpec = {
        id: 'auto-f', name: 'Auto', description: '', mechanism: 'auto',
        capabilities: [], interactions: [],
      };
      await service.initializePortals([spec]);
      expect(service.getRuntime('auto-f')!.mechanism).toBe('cli');
    });

    it('serial takes priority when multiple configs present', async () => {
      const spec: PortalSpec = {
        id: 'auto-p', name: 'Auto', description: '', mechanism: 'auto',
        capabilities: [], interactions: [],
        serialConfig: { baudRate: 9600 },
        mcpConfig: { command: 'npx' },
        cliConfig: { command: 'python' },
      };
      await service.initializePortals([spec]);
      expect(service.getRuntime('auto-p')!.mechanism).toBe('serial');
    });
  });

  // -- getRuntime -----------------------------------------------------------
  describe('getRuntime', () => {
    it('returns undefined for unknown id', () => {
      expect(service.getRuntime('nonexistent')).toBeUndefined();
    });
  });

  // -- getAllRuntimes --------------------------------------------------------
  describe('getAllRuntimes', () => {
    it('returns empty array when none initialized', () => {
      expect(service.getAllRuntimes()).toEqual([]);
    });
  });

  // -- getMcpServers --------------------------------------------------------
  describe('getMcpServers', () => {
    it('returns MCP server configs', async () => {
      await service.initializePortals([{
        id: 'm1', name: 'FS Server', description: '', mechanism: 'mcp',
        capabilities: [], interactions: [],
        mcpConfig: { command: 'npx', args: ['-y', 'pkg'], env: { KEY: 'val' } },
      }]);
      const servers = service.getMcpServers();
      expect(servers).toHaveLength(1);
      expect(servers[0].name).toBe('FS Server');
      expect(servers[0].command).toBe('npx');
      expect(servers[0].args).toEqual(['-y', 'pkg']);
    });

    it('excludes non-MCP portals', async () => {
      await service.initializePortals([
        { id: 'c1', name: 'CLI', description: '', mechanism: 'cli', capabilities: [], interactions: [] },
      ]);
      expect(service.getMcpServers()).toHaveLength(0);
    });

    it('excludes MCP portals with empty command', async () => {
      await service.initializePortals([{
        id: 'm2', name: 'Empty', description: '', mechanism: 'mcp',
        capabilities: [], interactions: [],
        mcpConfig: {},
      }]);
      expect(service.getMcpServers()).toHaveLength(0);
    });

    it('collects from multiple MCP portals', async () => {
      await service.initializePortals([
        { id: 'm3', name: 'A', description: '', mechanism: 'mcp', capabilities: [], interactions: [], mcpConfig: { command: 'a' } },
        { id: 'm4', name: 'B', description: '', mechanism: 'mcp', capabilities: [], interactions: [], mcpConfig: { command: 'b' } },
      ]);
      expect(service.getMcpServers()).toHaveLength(2);
    });

    it('returns empty when no portals', () => {
      expect(service.getMcpServers()).toEqual([]);
    });
  });

  // -- hasSerialPortals -----------------------------------------------------
  describe('hasSerialPortals', () => {
    it('returns true when serial portal exists', async () => {
      await service.initializePortals([{
        id: 's1', name: 'Board', description: '', mechanism: 'serial',
        capabilities: [], interactions: [],
      }]);
      expect(service.hasSerialPortals()).toBe(true);
    });

    it('returns false when no serial portals', async () => {
      await service.initializePortals([{
        id: 'c2', name: 'CLI', description: '', mechanism: 'cli',
        capabilities: [], interactions: [],
      }]);
      expect(service.hasSerialPortals()).toBe(false);
    });

    it('returns false when empty', () => {
      expect(service.hasSerialPortals()).toBe(false);
    });
  });

  // -- teardownAll ----------------------------------------------------------
  describe('teardownAll', () => {
    it('clears all runtimes', async () => {
      await service.initializePortals([
        { id: 't1', name: 'A', description: '', mechanism: 'cli', capabilities: [], interactions: [] },
      ]);
      expect(service.getAllRuntimes()).toHaveLength(1);
      await service.teardownAll();
      expect(service.getAllRuntimes()).toHaveLength(0);
    });

    it('suppresses teardown errors', async () => {
      await service.initializePortals([
        { id: 't2', name: 'B', description: '', mechanism: 'cli', capabilities: [], interactions: [] },
      ]);
      const rt = service.getRuntime('t2')!;
      rt.adapter.teardown = vi.fn().mockRejectedValue(new Error('boom'));
      await expect(service.teardownAll()).resolves.toBeUndefined();
      expect(service.getAllRuntimes()).toHaveLength(0);
    });

    it('works on empty service', async () => {
      await expect(service.teardownAll()).resolves.toBeUndefined();
    });
  });
});
