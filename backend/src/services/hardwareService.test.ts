import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks -- must be declared before importing the module under test
// ---------------------------------------------------------------------------

// Track what the SerialPort constructor should return per test.
// The factory function reads from this at call time.
let serialPortInstance: Record<string, any>;

// Use a class-based mock so `new SerialPort(...)` always delegates to `serialPortInstance`.
class MockSerialPort {
  constructor(_opts: any) {
    if (serialPortInstance.__throw) {
      throw serialPortInstance.__throw;
    }
    // Copy all mock methods onto this instance
    Object.assign(this, serialPortInstance);
  }
  static list = vi.fn().mockResolvedValue([]);
}

vi.mock('serialport', () => ({
  SerialPort: MockSerialPort,
}));

// ReadlineParser must be a proper class/function since it's used with `new`.
class MockReadlineParser {
  on = vi.fn();
  constructor(_opts?: any) {}
}

vi.mock('@serialport/parser-readline', () => ({
  ReadlineParser: MockReadlineParser,
}));

// Mock node:child_process -- hardwareService uses execFile (the safe variant,
// not exec) for py_compile, mpremote, and the serial flash Python script.
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

// Mock node:crypto for deterministic UUID in temp file names
vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => '00000000-1111-2222-3333-444444444444'),
}));

// Mock fs for collectPyFiles and findMpremote
vi.mock('node:fs', async (importOriginal) => {
  const orig = await importOriginal<typeof import('node:fs')>();
  return {
    ...orig,
    default: {
      ...orig,
      existsSync: vi.fn(orig.existsSync),
      readdirSync: vi.fn(orig.readdirSync),
      statSync: vi.fn(orig.statSync),
      readFileSync: vi.fn(orig.readFileSync),
      writeFileSync: vi.fn(),
      unlinkSync: vi.fn(),
    },
    existsSync: vi.fn(orig.existsSync),
    readdirSync: vi.fn(orig.readdirSync),
    statSync: vi.fn(orig.statSync),
    readFileSync: vi.fn(orig.readFileSync),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Import AFTER mocks
// ---------------------------------------------------------------------------
import { HardwareService } from './hardwareService.js';

let service: HardwareService;
let mockExecFile: Mock;
let mockSerialPortList: Mock;
let mockFs: typeof import('node:fs');

beforeEach(async () => {
  vi.clearAllMocks();

  // Reset the shared serial port instance to a safe default
  serialPortInstance = {
    on: vi.fn(),
    write: vi.fn(),
    close: vi.fn(),
    pipe: vi.fn().mockReturnValue({ on: vi.fn() }),
  };

  // Restore MockSerialPort.list after clearAllMocks wipes its mock state
  MockSerialPort.list = vi.fn().mockResolvedValue([]);

  service = new HardwareService();

  const childProcess = await import('node:child_process');
  mockExecFile = childProcess.execFile as unknown as Mock;

  mockSerialPortList = MockSerialPort.list as unknown as Mock;

  mockFs = (await import('node:fs')).default as any;
});

// ---------------------------------------------------------------------------
// detectBoardFast
// ---------------------------------------------------------------------------
describe('HardwareService.detectBoardFast', () => {
  it('detects a known board by VID:PID (Heltec CP210x)', async () => {
    mockSerialPortList.mockResolvedValue([
      { path: 'COM3', vendorId: '10c4', productId: 'ea60' },
    ]);
    const board = await service.detectBoardFast();
    expect(board).toEqual({ port: 'COM3', boardType: 'Heltec WiFi LoRa 32 V3 (CP210x)' });
  });

  it('detects ESP32-S3 Native USB (303A:1001)', async () => {
    mockSerialPortList.mockResolvedValue([
      { path: '/dev/ttyACM0', vendorId: '303a', productId: '1001' },
    ]);
    const board = await service.detectBoardFast();
    expect(board).toEqual({ port: '/dev/ttyACM0', boardType: 'ESP32-S3 Native USB' });
  });

  it('detects ESP32-S3 Native USB alternate PID (303A:4001)', async () => {
    mockSerialPortList.mockResolvedValue([
      { path: 'COM7', vendorId: '303a', productId: '4001' },
    ]);
    const board = await service.detectBoardFast();
    expect(board).toEqual({ port: 'COM7', boardType: 'ESP32-S3 Native USB' });
  });

  it('detects unknown Espressif VID as ESP32 Native USB', async () => {
    mockSerialPortList.mockResolvedValue([
      { path: 'COM5', vendorId: '303A', productId: 'FFFF' },
    ]);
    const board = await service.detectBoardFast();
    expect(board).toEqual({ port: 'COM5', boardType: 'ESP32 Native USB' });
  });

  it('detects ESP32 CH9102 board (1A86:55D4)', async () => {
    mockSerialPortList.mockResolvedValue([
      { path: '/dev/ttyUSB0', vendorId: '1a86', productId: '55d4' },
    ]);
    const board = await service.detectBoardFast();
    expect(board).toEqual({ port: '/dev/ttyUSB0', boardType: 'ESP32 (CH9102)' });
  });

  it('returns null when no ports are listed', async () => {
    mockSerialPortList.mockResolvedValue([]);
    const board = await service.detectBoardFast();
    expect(board).toBeNull();
  });

  it('returns null when ports have no matching VID:PID', async () => {
    mockSerialPortList.mockResolvedValue([
      { path: 'COM1', vendorId: '0000', productId: '0000' },
      { path: 'COM2', vendorId: undefined, productId: undefined },
    ]);
    const board = await service.detectBoardFast();
    expect(board).toBeNull();
  });

  it('skips ports without vendorId', async () => {
    mockSerialPortList.mockResolvedValue([
      { path: 'COM1' },
      { path: 'COM3', vendorId: '10c4', productId: 'ea60' },
    ]);
    const board = await service.detectBoardFast();
    expect(board).toEqual({ port: 'COM3', boardType: 'Heltec WiFi LoRa 32 V3 (CP210x)' });
  });

  it('returns first matching board when multiple are connected', async () => {
    mockSerialPortList.mockResolvedValue([
      { path: 'COM3', vendorId: '10c4', productId: 'ea60' },
      { path: 'COM5', vendorId: '303a', productId: '1001' },
    ]);
    const board = await service.detectBoardFast();
    expect(board).toEqual({ port: 'COM3', boardType: 'Heltec WiFi LoRa 32 V3 (CP210x)' });
  });

  it('handles case-insensitive VID:PID matching', async () => {
    // Service uppercases VID/PID for comparison
    mockSerialPortList.mockResolvedValue([
      { path: 'COM3', vendorId: '10C4', productId: 'EA60' },
    ]);
    const board = await service.detectBoardFast();
    expect(board).toEqual({ port: 'COM3', boardType: 'Heltec WiFi LoRa 32 V3 (CP210x)' });
  });

  it('returns null and logs error when SerialPort.list() throws', async () => {
    mockSerialPortList.mockRejectedValue(new Error('USB subsystem error'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const board = await service.detectBoardFast();
    expect(board).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('USB subsystem error'),
    );
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// detectBoard (full detection with REPL probe fallback)
// ---------------------------------------------------------------------------
describe('HardwareService.detectBoard', () => {
  it('returns fast-detected board without REPL probe', async () => {
    mockSerialPortList.mockResolvedValue([
      { path: 'COM3', vendorId: '10c4', productId: 'ea60' },
    ]);
    const board = await service.detectBoard();
    expect(board).toEqual({ port: 'COM3', boardType: 'Heltec WiFi LoRa 32 V3 (CP210x)' });
  });

  it('returns null when no ports have vendorId (skips REPL probe)', async () => {
    mockSerialPortList.mockResolvedValue([
      { path: 'COM1' }, // no vendorId -- skipped by both fast and REPL probe
    ]);
    const board = await service.detectBoard();
    expect(board).toBeNull();
  });

  it('returns null on empty port list', async () => {
    mockSerialPortList.mockResolvedValue([]);
    const board = await service.detectBoard();
    expect(board).toBeNull();
  });

  it('returns null when list throws in fallback probe', async () => {
    // First call (detectBoardFast) returns no match, second call (detectBoard phase 2) throws
    let callCount = 0;
    mockSerialPortList.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return []; // fast detection: no match
      throw new Error('USB error');
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const board = await service.detectBoard();
    expect(board).toBeNull();
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// compile
// ---------------------------------------------------------------------------
describe('HardwareService.compile', () => {
  function setupWorkDir(files: { name: string; isDir: boolean }[]) {
    const fsMock = mockFs as any;
    fsMock.readdirSync.mockImplementation((dir: string) => {
      if (dir === '/work') return files.map(f => f.name);
      return [];
    });
    fsMock.statSync.mockImplementation((fullPath: string) => {
      const name = fullPath.split(/[\\/]/).pop();
      const entry = files.find(f => f.name === name);
      return {
        isDirectory: () => entry?.isDir ?? false,
      };
    });
  }

  // Helper: configure execFile mock so that promisified calls (compile) and
  // callback calls (flash) both work. The real promisify wraps execFile's
  // callback API into a promise, so mocking execFile with callback behavior
  // is sufficient.
  function mockExecFileSuccess() {
    mockExecFile.mockImplementation(
      (cmd: string, args: string[], ...rest: any[]) => {
        const cb = rest.find((r: any) => typeof r === 'function');
        if (cb) cb(null, '', '');
        return { kill: vi.fn() };
      },
    );
  }

  it('returns failure when no Python files found', async () => {
    const fsMock = mockFs as any;
    fsMock.readdirSync.mockReturnValue([]);
    const result = await service.compile('/work');
    expect(result.success).toBe(false);
    expect(result.errors).toContain('No Python files found');
    expect(result.outputPath).toBe('');
  });

  it('returns success when py_compile passes for all files', async () => {
    setupWorkDir([
      { name: 'main.py', isDir: false },
      { name: 'helper.py', isDir: false },
    ]);
    mockExecFileSuccess();

    const result = await service.compile('/work');
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.outputPath).toBe('/work');
  });

  it('collects syntax errors from py_compile stderr', async () => {
    setupWorkDir([{ name: 'bad.py', isDir: false }]);

    mockExecFile.mockImplementation(
      (cmd: string, args: string[], ...rest: any[]) => {
        const cb = rest.find((r: any) => typeof r === 'function');
        if (cb) {
          const err = new Error('Command failed') as any;
          err.stderr = 'SyntaxError: invalid syntax';
          cb(err);
        }
        return { kill: vi.fn() };
      },
    );

    const result = await service.compile('/work');
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('SyntaxError');
    expect(result.errors[0]).toContain('bad.py');
  });

  it('collects generic Error messages from py_compile stderr', async () => {
    setupWorkDir([{ name: 'broken.py', isDir: false }]);

    mockExecFile.mockImplementation(
      (cmd: string, args: string[], ...rest: any[]) => {
        const cb = rest.find((r: any) => typeof r === 'function');
        if (cb) {
          const err = new Error('Command failed') as any;
          err.stderr = 'Error: cannot compile broken.py';
          cb(err);
        }
        return { kill: vi.fn() };
      },
    );

    const result = await service.compile('/work');
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('Error');
  });

  it('ignores non-syntax Command failed errors (empty stderr)', async () => {
    setupWorkDir([{ name: 'ok.py', isDir: false }]);

    mockExecFile.mockImplementation(
      (cmd: string, args: string[], ...rest: any[]) => {
        const cb = rest.find((r: any) => typeof r === 'function');
        if (cb) {
          const err = new Error('Command failed') as any;
          err.stderr = '';
          cb(err);
        }
        return { kill: vi.fn() };
      },
    );

    const result = await service.compile('/work');
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('skips __pycache__ and hidden directories', async () => {
    const fsMock = mockFs as any;
    fsMock.readdirSync.mockImplementation((dir: string) => {
      if (dir === '/work') return ['__pycache__', '.git', 'main.py'];
      return [];
    });
    fsMock.statSync.mockImplementation((fullPath: string) => {
      const name = fullPath.split(/[\\/]/).pop();
      return { isDirectory: () => name !== 'main.py' };
    });
    mockExecFileSuccess();

    const result = await service.compile('/work');
    expect(result.success).toBe(true);
  });

  it('walks subdirectories to find .py files', async () => {
    const fsMock = mockFs as any;
    fsMock.readdirSync.mockImplementation((dir: string) => {
      if (dir === '/work') return ['src'];
      if (dir.endsWith('src')) return ['app.py'];
      return [];
    });
    fsMock.statSync.mockImplementation((fullPath: string) => {
      const name = fullPath.split(/[\\/]/).pop();
      return { isDirectory: () => name === 'src' };
    });
    mockExecFileSuccess();

    const result = await service.compile('/work');
    expect(result.success).toBe(true);
  });

  it('handles readdirSync throwing (unreadable directory)', async () => {
    const fsMock = mockFs as any;
    fsMock.readdirSync.mockImplementation(() => {
      throw new Error('EACCES');
    });

    const result = await service.compile('/work');
    expect(result.success).toBe(false);
    expect(result.errors).toContain('No Python files found');
  });
});

// ---------------------------------------------------------------------------
// flash
// ---------------------------------------------------------------------------
describe('HardwareService.flash', () => {
  function setupFlashWorkDir() {
    const fsMock = mockFs as any;
    fsMock.readdirSync.mockImplementation((dir: string) => {
      if (dir === '/work') return ['main.py'];
      return [];
    });
    fsMock.statSync.mockReturnValue({ isDirectory: () => false });
    fsMock.readFileSync.mockReturnValue('print("hello")');
    fsMock.existsSync.mockReturnValue(false); // no mpremote found, no main.py
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.unlinkSync.mockImplementation(() => {});
  }

  it('returns failure when no board detected and no port specified', async () => {
    mockSerialPortList.mockResolvedValue([]);
    setupFlashWorkDir();

    const result = await service.flash('/work');
    expect(result.success).toBe(false);
    expect(result.message).toContain('No ESP32 board detected');
  });

  it('returns failure when no Python files in work directory', async () => {
    const fsMock = mockFs as any;
    fsMock.readdirSync.mockReturnValue([]);

    const result = await service.flash('/work', 'COM3');
    expect(result.success).toBe(false);
    expect(result.message).toBe('No Python files to flash');
  });

  it('succeeds via serial paste mode on first attempt', async () => {
    setupFlashWorkDir();

    mockExecFile.mockImplementation(
      (cmd: string, args: string[], opts: any, cb?: Function) => {
        const callback = cb || opts;
        if (typeof callback === 'function') {
          callback(null, 'FLASH_OK\n', '');
        }
        return { kill: vi.fn() };
      },
    );

    const result = await service.flash('/work', 'COM3');
    expect(result.success).toBe(true);
    expect(result.message).toContain('serial paste mode');
  });

  it('falls back to mpremote when serial paste mode fails', async () => {
    setupFlashWorkDir();

    mockExecFile.mockImplementation(
      (cmd: string, args: string[], opts: any, cb?: Function) => {
        const callback = cb || opts;
        if (typeof callback === 'function') {
          if (cmd === 'python') {
            const err = new Error('failed') as any;
            err.stderr = 'Connection refused';
            err.stdout = '';
            callback(err);
          } else {
            callback(null, 'OK', '');
          }
        }
        return { kill: vi.fn() };
      },
    );

    const result = await service.flash('/work', 'COM3');
    expect(result.success).toBe(true);
    expect(result.message).toContain('Flashed');
  });

  it('reports combined failure when both serial and mpremote fail', async () => {
    setupFlashWorkDir();

    mockExecFile.mockImplementation(
      (cmd: string, args: string[], opts: any, cb?: Function) => {
        const callback = cb || opts;
        if (typeof callback === 'function') {
          const err = new Error('failed') as any;
          err.stderr = cmd === 'python' ? 'Serial error' : 'mpremote error';
          err.stdout = '';
          callback(err);
        }
        return { kill: vi.fn() };
      },
    );

    const result = await service.flash('/work', 'COM3');
    expect(result.success).toBe(false);
    expect(result.message).toContain('Serial');
    expect(result.message).toContain('mpremote');
  });

  it('reports mpremote not found (ENOENT)', async () => {
    setupFlashWorkDir();

    mockExecFile.mockImplementation(
      (cmd: string, args: string[], opts: any, cb?: Function) => {
        const callback = cb || opts;
        if (typeof callback === 'function') {
          if (cmd === 'python') {
            const err = new Error('failed') as any;
            err.stderr = 'error';
            err.stdout = '';
            callback(err);
          } else {
            const err = new Error('spawn mpremote ENOENT') as any;
            err.code = 'ENOENT';
            callback(err);
          }
        }
        return { kill: vi.fn() };
      },
    );

    const result = await service.flash('/work', 'COM3');
    expect(result.success).toBe(false);
    expect(result.message).toContain('mpremote not found');
  });

  it('auto-detects board when no port is specified', async () => {
    setupFlashWorkDir();

    mockSerialPortList.mockResolvedValue([
      { path: 'COM4', vendorId: '10c4', productId: 'ea60' },
    ]);

    mockExecFile.mockImplementation(
      (cmd: string, args: string[], opts: any, cb?: Function) => {
        const callback = cb || opts;
        if (typeof callback === 'function') {
          callback(null, 'FLASH_OK\n', '');
        }
        return { kill: vi.fn() };
      },
    );

    const result = await service.flash('/work');
    expect(result.success).toBe(true);
  });

  it('retries serial flash up to 3 times before falling back', async () => {
    setupFlashWorkDir();

    let serialAttempts = 0;
    mockExecFile.mockImplementation(
      (cmd: string, args: string[], opts: any, cb?: Function) => {
        const callback = cb || opts;
        if (typeof callback === 'function') {
          if (cmd === 'python') {
            serialAttempts++;
            const err = new Error('failed') as any;
            err.stderr = 'error';
            err.stdout = '';
            callback(err);
          } else {
            callback(null, 'OK', '');
          }
        }
        return { kill: vi.fn() };
      },
    );

    await service.flash('/work', 'COM3');
    expect(serialAttempts).toBe(3);
  });

  it('reports serial flash without FLASH_OK as failure', async () => {
    setupFlashWorkDir();

    mockExecFile.mockImplementation(
      (cmd: string, args: string[], opts: any, cb?: Function) => {
        const callback = cb || opts;
        if (typeof callback === 'function') {
          if (cmd === 'python') {
            // Script succeeds but no FLASH_OK in output
            callback(null, 'SENT:main.py (no confirmation)', '');
          } else {
            const err = new Error('failed') as any;
            err.stderr = 'mpremote error';
            err.stdout = '';
            callback(err);
          }
        }
        return { kill: vi.fn() };
      },
    );

    const result = await service.flash('/work', 'COM3');
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// startSerialMonitor
// ---------------------------------------------------------------------------
describe('HardwareService.startSerialMonitor', () => {
  it('returns a close handle and pipes data through callback', async () => {
    const parserOnCalls: Array<[string, Function]> = [];
    const mockParser = {
      on: vi.fn((event: string, handler: Function) => {
        parserOnCalls.push([event, handler]);
      }),
    };
    serialPortInstance = {
      on: vi.fn(),
      pipe: vi.fn().mockReturnValue(mockParser),
      close: vi.fn(),
    };

    const callback = vi.fn().mockResolvedValue(undefined);
    const monitor = await service.startSerialMonitor('COM3', callback);

    expect(monitor.close).toBeDefined();

    // Find the 'data' handler registered on the parser
    const dataEntry = parserOnCalls.find(([ev]) => ev === 'data');
    expect(dataEntry).toBeDefined();
    await dataEntry![1]('  Hello from ESP32  ');
    expect(callback).toHaveBeenCalledWith('Hello from ESP32');
  });

  it('invokes callback with error when serial port emits error', async () => {
    const portOnCalls: Array<[string, Function]> = [];
    serialPortInstance = {
      on: vi.fn((event: string, handler: Function) => {
        portOnCalls.push([event, handler]);
      }),
      pipe: vi.fn().mockReturnValue({ on: vi.fn() }),
      close: vi.fn(),
    };

    const callback = vi.fn().mockResolvedValue(undefined);
    await service.startSerialMonitor('COM3', callback);

    const errorEntry = portOnCalls.find(([ev]) => ev === 'error');
    expect(errorEntry).toBeDefined();
    errorEntry![1](new Error('Device disconnected'));
    expect(callback).toHaveBeenCalledWith('[Error] Device disconnected');
  });

  it('close() calls serialPort.close()', async () => {
    const closeFn = vi.fn();
    serialPortInstance = {
      on: vi.fn(),
      pipe: vi.fn().mockReturnValue({ on: vi.fn() }),
      close: closeFn,
    };

    const monitor = await service.startSerialMonitor(
      'COM3',
      vi.fn().mockResolvedValue(undefined),
    );
    monitor.close();
    expect(closeFn).toHaveBeenCalled();
  });

  it('handles serial port constructor failure gracefully', async () => {
    serialPortInstance = { __throw: new Error('Port not found') };

    const callback = vi.fn().mockResolvedValue(undefined);
    const monitor = await service.startSerialMonitor('COM99', callback);

    expect(callback).toHaveBeenCalledWith(
      '[Error] Could not open serial port: Port not found',
    );
    // close is a no-op but should not throw
    expect(() => monitor.close()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// flash mutex
// ---------------------------------------------------------------------------
describe('HardwareService flash mutex', () => {
  it('serializes concurrent flash calls', async () => {
    const executionOrder: number[] = [];

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

    const p1 = service.flash('/work1');
    const p2 = service.flash('/work2');

    await new Promise(r => setTimeout(r, 50));
    expect(executionOrder).toEqual([1]);

    call1Resolve!();

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.message).toBe('first');
    expect(r2.message).toBe('second');
    expect(executionOrder).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// temp file names use UUID
// ---------------------------------------------------------------------------
describe('HardwareService temp file names use UUID', () => {
  it('generates temp file paths with UUID instead of Date.now()', async () => {
    const fsMock = mockFs as any;
    fsMock.readdirSync.mockImplementation((dir: string) => {
      if (dir === '/work') return ['main.py'];
      return [];
    });
    fsMock.statSync.mockReturnValue({ isDirectory: () => false });
    fsMock.readFileSync.mockReturnValue('print("hello")');
    fsMock.existsSync.mockReturnValue(false);
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.unlinkSync.mockImplementation(() => {});

    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: any, cb: any) => {
        const callback = typeof _opts === 'function' ? _opts : cb;
        if (typeof callback === 'function') {
          const err = new Error('mock fail') as any;
          err.stderr = 'mock error';
          err.stdout = '';
          callback(err);
        }
        return { kill: vi.fn() };
      },
    );

    await service.flash('/work', 'COM3');

    const writeFileCalls = (fsMock.writeFileSync as any).mock.calls;
    const manifestCall = writeFileCalls.find(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('.json'),
    );

    expect(manifestCall).toBeDefined();
    expect(manifestCall[0]).toContain('elisa-flash-');
    expect(manifestCall[0]).toContain('00000000-1111-2222-3333-444444444444');
    expect(manifestCall[0]).not.toMatch(/elisa_flash_\d+/);
    expect(manifestCall[0]).not.toMatch(/elisa_manifest_\d+/);
  });
});

// ---------------------------------------------------------------------------
// probeForRepl
// ---------------------------------------------------------------------------
describe('HardwareService.probeForRepl', () => {
  // Helper: create a mock serial port with controllable open/data/close behavior
  function createProbePort(opts?: { openError?: Error; replyData?: string; closeError?: Error }) {
    const listeners: Record<string, ((...args: any[]) => void)[]> = {};
    const mockClose = vi.fn((cb: (err?: Error | null) => void) => {
      cb(opts?.closeError ?? null);
    });

    const instance: Record<string, any> = {
      on: vi.fn((event: string, cb: (...args: any[]) => void) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(cb);

        if (event === 'open' && !opts?.openError) {
          setTimeout(() => cb(), 5);
        }
        if (event === 'error' && opts?.openError) {
          setTimeout(() => cb(opts.openError), 5);
        }
        if (event === 'data' && opts?.replyData) {
          setTimeout(() => cb(Buffer.from(opts.replyData!)), 20);
        }
      }),
      write: vi.fn(),
      close: mockClose,
      pipe: vi.fn(),
    };

    return { instance, mockClose };
  }

  it('returns true when REPL prompt found', async () => {
    const probe = createProbePort({ replyData: '>>>' });
    serialPortInstance = probe.instance;
    // Override __throw so constructor does not throw
    delete serialPortInstance.__throw;

    const result = await (service as any).probeForRepl('COM3');
    expect(result).toBe(true);
    expect(probe.mockClose).toHaveBeenCalledTimes(1);
  }, 10_000);

  it('returns false on open error', async () => {
    const probe = createProbePort({ openError: new Error('open failed') });
    serialPortInstance = probe.instance;
    delete serialPortInstance.__throw;

    const result = await (service as any).probeForRepl('COM3');
    expect(result).toBe(false);
    expect(probe.mockClose).toHaveBeenCalled();
  }, 10_000);

  it('handles close error gracefully without throwing', async () => {
    const probe = createProbePort({
      replyData: '>>>',
      closeError: new Error('close failed'),
    });
    serialPortInstance = probe.instance;
    delete serialPortInstance.__throw;

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await (service as any).probeForRepl('COM3');
    expect(typeof result).toBe('boolean');
    expect(warnSpy).toHaveBeenCalledWith('Port close warning:', 'close failed');
    warnSpy.mockRestore();
  }, 10_000);
});
