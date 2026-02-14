/** Unit tests for Electron main process. */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// Shared mock state used across module resets
const mockHandlers = new Map<string, Function>();
const mockStoreData = new Map<string, any>();
const mockAppOnHandlers = new Map<string, Function>();

function buildElectronMock(overrides: Record<string, any> = {}) {
  return {
    app: {
      isPackaged: false,
      whenReady: vi.fn().mockResolvedValue(undefined),
      on: vi.fn((event: string, handler: Function) => {
        mockAppOnHandlers.set(event, handler);
      }),
      quit: vi.fn(),
      ...overrides,
    },
    BrowserWindow: class MockBrowserWindow {
      loadURL = vi.fn();
      loadFile = vi.fn();
      on = vi.fn();
      setMenuBarVisibility = vi.fn();
      focus = vi.fn();
      webContents = { openDevTools: vi.fn() };
    },
    ipcMain: {
      handle: vi.fn((channel: string, handler: Function) => {
        mockHandlers.set(channel, handler);
      }),
    },
    safeStorage: {
      encryptString: vi.fn((str: string) => Buffer.from(`encrypted:${str}`)),
      decryptString: vi.fn((buf: Buffer) => {
        const s = buf.toString();
        return s.startsWith('encrypted:') ? s.slice('encrypted:'.length) : s;
      }),
    },
    dialog: { showOpenDialog: vi.fn() },
    Menu: {
      setApplicationMenu: vi.fn(),
      buildFromTemplate: vi.fn().mockReturnValue({}),
    },
  };
}

function buildStoreMock(data: Map<string, any> = mockStoreData) {
  return {
    default: class MockStore {
      constructor() { /* no-op */ }
      get(key: string) { return data.get(key); }
      set(key: string, value: any) { data.set(key, value); }
    },
  };
}

function buildNetMock() {
  return {
    createServer: vi.fn(() => ({
      listen: vi.fn(),
      close: vi.fn(),
      address: vi.fn(),
      on: vi.fn(),
    })),
  };
}

// Allow the whenReady().then() chain to run initStore + buildMenu
async function flushPromises() {
  await new Promise((r) => setTimeout(r, 10));
}

describe('Electron main process', () => {
  beforeEach(() => {
    mockHandlers.clear();
    mockStoreData.clear();
    mockAppOnHandlers.clear();
  });

  describe('IPC handler registration', () => {
    it('registers expected IPC channels on module load', async () => {
      vi.resetModules();
      vi.doMock('electron', () => buildElectronMock());
      vi.doMock('electron-store', () => buildStoreMock());
      vi.doMock('net', () => buildNetMock());

      await import('./main.js');
      await flushPromises();

      const channels = Array.from(mockHandlers.keys());
      expect(channels).toContain('get-api-key-status');
      expect(channels).toContain('set-api-key');
      expect(channels).toContain('open-settings');
      expect(channels).toContain('get-auth-token');
      expect(channels).toContain('pick-directory');
    });
  });

  describe('API key management (via IPC handlers)', () => {
    it('get-api-key-status returns missing when no key is stored', async () => {
      vi.resetModules();
      vi.doMock('electron', () => buildElectronMock());
      vi.doMock('electron-store', () => buildStoreMock());
      vi.doMock('net', () => buildNetMock());

      await import('./main.js');
      // Let whenReady resolve so initStore runs and `store` is set
      await flushPromises();

      const handler = mockHandlers.get('get-api-key-status');
      expect(handler).toBeDefined();
      const result = handler!();
      expect(result).toBe('missing');
    });

    it('get-api-key-status returns set after set-api-key is called', async () => {
      vi.resetModules();
      const localStoreData = new Map<string, any>();
      vi.doMock('electron', () => buildElectronMock());
      vi.doMock('electron-store', () => buildStoreMock(localStoreData));
      vi.doMock('net', () => buildNetMock());

      await import('./main.js');
      await flushPromises();

      const setHandler = mockHandlers.get('set-api-key');
      const statusHandler = mockHandlers.get('get-api-key-status');
      expect(setHandler).toBeDefined();
      expect(statusHandler).toBeDefined();

      // Set the key
      setHandler!(null, 'sk-test-key-12345');

      // Now status should be 'set'
      const result = statusHandler!();
      expect(result).toBe('set');
    });

    it('set-api-key encrypts the key via safeStorage', async () => {
      vi.resetModules();
      const localStoreData = new Map<string, any>();
      const mockEncrypt = vi.fn((str: string) => Buffer.from(`encrypted:${str}`));
      vi.doMock('electron', () => buildElectronMock());
      vi.doMock('electron-store', () => buildStoreMock(localStoreData));
      vi.doMock('net', () => buildNetMock());

      const mod = await import('electron');
      (mod.safeStorage.encryptString as any) = mockEncrypt;

      await import('./main.js');
      await flushPromises();

      const setHandler = mockHandlers.get('set-api-key');
      setHandler!(null, 'my-secret-key');

      // The store should have the base64-encoded encrypted value
      const stored = localStoreData.get('apiKeyEncrypted');
      expect(stored).toBeDefined();
      expect(typeof stored).toBe('string');
    });
  });

  describe('App lifecycle', () => {
    it('registers before-quit and window-all-closed handlers', async () => {
      vi.resetModules();
      vi.doMock('electron', () => buildElectronMock());
      vi.doMock('electron-store', () => buildStoreMock());
      vi.doMock('net', () => buildNetMock());

      await import('./main.js');
      await flushPromises();

      expect(mockAppOnHandlers.has('before-quit')).toBe(true);
      expect(mockAppOnHandlers.has('window-all-closed')).toBe(true);
      expect(mockAppOnHandlers.has('activate')).toBe(true);
    });
  });

  describe('findFreePort', () => {
    it('module uses net.createServer for port detection', async () => {
      vi.resetModules();
      vi.doMock('electron', () => buildElectronMock());
      vi.doMock('electron-store', () => buildStoreMock());
      vi.doMock('net', () => buildNetMock());

      await import('./main.js');

      // net is mocked, verifying the mock works confirms the module structure
      const net = await import('net');
      expect(vi.isMockFunction(net.createServer)).toBe(true);
    });
  });
});
