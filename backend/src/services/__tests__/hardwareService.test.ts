import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HardwareService } from '../hardwareService.js';

// Mock child_process, fs, crypto so we never touch real hardware
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));
vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => '00000000-1111-2222-3333-444444444444'),
}));
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => 'print("hello")'),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    readdirSync: vi.fn(() => ['main.py']),
    statSync: vi.fn(() => ({ isDirectory: () => false })),
  },
}));

// Build a mock SerialPort that captures event listeners and can emit events
function createMockSerialPort(opts?: { openError?: Error; replyData?: string; closeError?: Error }) {
  const listeners: Record<string, ((...args: any[]) => void)[]> = {};

  const mockClose = vi.fn((cb: (err?: Error | null) => void) => {
    cb(opts?.closeError ?? null);
  });

  const instance = {
    on: vi.fn((event: string, cb: (...args: any[]) => void) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);

      // Auto-fire 'open' or 'error' after registration
      if (event === 'open' && !opts?.openError) {
        setTimeout(() => cb(), 5);
      }
      if (event === 'error' && opts?.openError) {
        setTimeout(() => cb(opts.openError), 5);
      }
      // Auto-fire 'data' after registration (with REPL prompt)
      if (event === 'data' && opts?.replyData) {
        setTimeout(() => cb(Buffer.from(opts.replyData!)), 20);
      }
    }),
    write: vi.fn(),
    close: mockClose,
    pipe: vi.fn(),
  };

  return { instance, mockClose, listeners };
}

// We need to dynamically control what MockSerialPort returns per test
let currentMockPort: ReturnType<typeof createMockSerialPort> | null = null;

const MockSerialPortConstructor = vi.fn(function (this: any) {
  if (currentMockPort) {
    Object.assign(this, currentMockPort.instance);
  }
  return this;
});
(MockSerialPortConstructor as any).list = vi.fn(async () => []);

vi.mock('serialport', () => ({
  SerialPort: MockSerialPortConstructor,
}));

vi.mock('@serialport/parser-readline', () => ({
  ReadlineParser: vi.fn(),
}));

describe('HardwareService', () => {
  let service: HardwareService;

  beforeEach(() => {
    vi.clearAllMocks();
    currentMockPort = null;
    service = new HardwareService();
  });

  describe('flash mutex', () => {
    it('serializes concurrent flash calls', async () => {
      const executionOrder: number[] = [];

      // Mock _flashImpl to track execution order
      let call1Resolve: () => void;
      const call1Gate = new Promise<void>(r => { call1Resolve = r; });

      vi.spyOn(service as any, '_flashImpl')
        .mockImplementationOnce(async () => {
          executionOrder.push(1);
          await call1Gate;
          executionOrder.push(2);
          return { success: true, message: 'first' };
        })
        .mockImplementationOnce(async () => {
          executionOrder.push(3);
          return { success: true, message: 'second' };
        });

      // Fire both flash calls concurrently
      const p1 = service.flash('/work1');
      const p2 = service.flash('/work2');

      // Give the event loop time to start both
      await new Promise(r => setTimeout(r, 50));

      // Call 1 should be running, call 2 should be waiting on the mutex
      expect(executionOrder).toEqual([1]);

      // Release call 1
      call1Resolve!();

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1.message).toBe('first');
      expect(r2.message).toBe('second');

      // Verify sequential: 1 started, 1 finished, then 2 started
      expect(executionOrder).toEqual([1, 2, 3]);
    });
  });

  describe('temp file names use UUID', () => {
    it('generates temp file paths with UUID instead of Date.now()', async () => {
      const fs = (await import('node:fs')).default;

      // Mock detectBoard to return a port
      vi.spyOn(service, 'detectBoard' as any).mockResolvedValue({
        port: 'COM3',
        boardType: 'ESP32',
      });

      // Mock execFile to simulate a failed flash
      const { execFile } = await import('node:child_process');
      (execFile as any).mockImplementation(
        (_cmd: string, _args: string[], _opts: any, cb: any) => {
          cb(new Error('mock fail'), '', 'mock error');
        },
      );

      await service.flash('/work', 'COM3');

      // Check writeFileSync was called with UUID-based filenames
      const writeFileCalls = (fs.writeFileSync as any).mock.calls;
      const manifestCall = writeFileCalls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('.json'),
      );

      expect(manifestCall).toBeDefined();
      expect(manifestCall[0]).toContain('elisa-flash-');
      expect(manifestCall[0]).toContain('00000000-1111-2222-3333-444444444444');
      // Should NOT contain the old Date.now() pattern
      expect(manifestCall[0]).not.toMatch(/elisa_flash_\d+/);
      expect(manifestCall[0]).not.toMatch(/elisa_manifest_\d+/);
    });
  });

  describe('probeForRepl', () => {
    it('awaits port close and returns true when REPL found', async () => {
      const mock = createMockSerialPort({ replyData: '>>>' });
      currentMockPort = mock;

      const result = await (service as any).probeForRepl('COM3');

      expect(result).toBe(true);
      // close should have been called via the awaited promisified pattern
      expect(mock.mockClose).toHaveBeenCalledTimes(1);
      expect(mock.mockClose).toHaveBeenCalledWith(expect.any(Function));
    }, 10_000);

    it('awaits port close and returns false on open error', async () => {
      const mock = createMockSerialPort({ openError: new Error('open failed') });
      currentMockPort = mock;

      const result = await (service as any).probeForRepl('COM3');

      expect(result).toBe(false);
      // close should still be called in the catch block
      expect(mock.mockClose).toHaveBeenCalled();
    }, 10_000);

    it('handles close error gracefully without throwing', async () => {
      const mock = createMockSerialPort({
        replyData: '>>>',
        closeError: new Error('close failed'),
      });
      currentMockPort = mock;

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await (service as any).probeForRepl('COM3');

      // Should resolve (not throw) even when close errors
      expect(typeof result).toBe('boolean');
      expect(warnSpy).toHaveBeenCalledWith('Port close warning:', 'close failed');
      warnSpy.mockRestore();
    }, 10_000);
  });
});
