/**
 * Tests for EsptoolFlashStrategy: real esptool execution path.
 *
 * All child_process.execFile calls are mocked -- no actual esptool invocations.
 * NOTE: This test mocks execFile (NOT exec/shell). The production code uses
 * execFile exclusively, consistent with the project's security patterns.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';

// vi.hoisted runs before vi.mock hoisting, so mockExecFile is available in factories.
const { mockExecFile } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
}));

// Mock child_process before importing the module under test.
vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
}));

// Mock promisify so that promisify(execFile) returns a function that calls mockExecFile
vi.mock('node:util', () => ({
  promisify: () => {
    return (...args: any[]) => new Promise((resolve, reject) => {
      mockExecFile(...args, (err: any, stdout: string, stderr: string) => {
        if (err) reject(err);
        else resolve({ stdout, stderr });
      });
    });
  },
}));

// Now import after mocks are in place
import {
  EsptoolFlashStrategy,
  resolveEsptool,
  detectSerialPort,
  type FlashParams,
} from '../../services/flashStrategy.js';

// ── Helpers ─────────────────────────────────────────────────────────────

function makeMockHardwareService() {
  return {
    detectBoardFast: vi.fn(async () => null),
    detectBoard: vi.fn(async () => null),
    flashFiles: vi.fn(async () => ({ success: true, message: 'OK' })),
    wipeBoard: vi.fn(async () => ({ success: true, removed: [] })),
    resetBoard: vi.fn(async () => {}),
    compile: vi.fn(async () => ({ success: true, errors: [], outputPath: '' })),
  };
}

/** Create a real temp directory for tests that write files. */
function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-esptool-test-'));
  tmpDirs.push(dir);
  return dir;
}

const tmpDirs: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  for (const dir of tmpDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  tmpDirs.length = 0;
});

function makeEsptoolFlashParams(overrides: Partial<FlashParams> = {}): FlashParams {
  const pluginDir = makeTempDir();
  const nuggetDir = makeTempDir();
  // Create a fake firmware file
  fs.writeFileSync(path.join(pluginDir, 'firmware.bin'), 'fake-firmware-data');

  return {
    pluginDir,
    nuggetDir,
    deviceFields: { SERIAL_PORT: '/dev/ttyUSB0' },
    injections: {},
    pluginId: 'box-3',
    flashConfig: {
      firmware_file: 'firmware.bin',
      flash_offset: '0x0',
      baud_rate: 460800,
      chip: 'esp32s3',
      prompt_message: 'Plug in BOX-3',
    },
    flashFiles: { lib: [], shared: [] },
    onProgress: vi.fn(),
    ...overrides,
  };
}

function createMockChildProcess() {
  const child = {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    on: vi.fn(),
    kill: vi.fn(),
    pid: 12345,
  };
  return child;
}

/**
 * Set up mockExecFile to simulate esptool being available.
 * Handles both the promisified calls (version check) and direct execFile (flash).
 */
function setupEsptoolAvailable(flashStdout = 'Hash of data verified.\nLeaving...\n') {
  mockExecFile.mockImplementation((...allArgs: any[]) => {
    const cmd = allArgs[0] as string;
    const args = allArgs[1] as string[];
    // Last arg may be callback (for direct execFile) or not (for promisified via our mock)
    const lastArg = allArgs[allArgs.length - 1];
    const callback = typeof lastArg === 'function' ? lastArg : null;

    // Version check (promisified path)
    if (cmd === 'esptool.py' && args[0] === 'version') {
      if (callback) callback(null, 'esptool.py v4.7.0\n', '');
      return createMockChildProcess();
    }

    // Flash command (direct execFile path -- callback is 4th arg)
    if (cmd === 'esptool.py' && args.includes('write_flash')) {
      const child = createMockChildProcess();
      // Emit progress via stderr asynchronously
      setTimeout(() => {
        child.stderr.emit('data', 'Writing at 0x00010000... (25 %)\n');
        child.stderr.emit('data', 'Writing at 0x00020000... (50 %)\n');
        child.stderr.emit('data', 'Writing at 0x00030000... (75 %)\n');
        child.stderr.emit('data', 'Writing at 0x00040000... (100 %)\n');
      }, 0);
      if (callback) callback(null, flashStdout, '');
      return child;
    }

    // Unknown command -- fail
    const err = new Error(`spawn ${cmd} ENOENT`);
    (err as any).code = 'ENOENT';
    if (callback) callback(err, '', '');
    return createMockChildProcess();
  });
}

function setupEsptoolUnavailable() {
  mockExecFile.mockImplementation((...allArgs: any[]) => {
    const cmd = allArgs[0] as string;
    const lastArg = allArgs[allArgs.length - 1];
    const callback = typeof lastArg === 'function' ? lastArg : null;

    const err = new Error(`spawn ${cmd} ENOENT`);
    (err as any).code = 'ENOENT';
    if (callback) callback(err, '', '');
    return createMockChildProcess();
  });
}

// ── checkPrerequisites ──────────────────────────────────────────────────

describe('EsptoolFlashStrategy.checkPrerequisites', () => {
  it('returns available when esptool.py is found', async () => {
    mockExecFile.mockImplementation((...allArgs: any[]) => {
      const cmd = allArgs[0] as string;
      const args = allArgs[1] as string[];
      const lastArg = allArgs[allArgs.length - 1];
      const callback = typeof lastArg === 'function' ? lastArg : null;

      if (cmd === 'esptool.py' && args[0] === 'version') {
        if (callback) callback(null, 'esptool.py v4.7.0\n', '');
      } else {
        const err = new Error('ENOENT');
        (err as any).code = 'ENOENT';
        if (callback) callback(err, '', '');
      }
      return createMockChildProcess();
    });

    const strategy = new EsptoolFlashStrategy();
    const result = await strategy.checkPrerequisites();

    expect(result.available).toBe(true);
    expect(result.message).toContain('v4.7.0');
  });

  it('returns available when esptool (no .py) is found', async () => {
    mockExecFile.mockImplementation((...allArgs: any[]) => {
      const cmd = allArgs[0] as string;
      const args = allArgs[1] as string[];
      const lastArg = allArgs[allArgs.length - 1];
      const callback = typeof lastArg === 'function' ? lastArg : null;

      if (cmd === 'esptool' && args[0] === 'version') {
        if (callback) callback(null, 'esptool.py v4.6.0\n', '');
      } else {
        const err = new Error('ENOENT');
        (err as any).code = 'ENOENT';
        if (callback) callback(err, '', '');
      }
      return createMockChildProcess();
    });

    const strategy = new EsptoolFlashStrategy();
    const result = await strategy.checkPrerequisites();

    expect(result.available).toBe(true);
    expect(result.message).toContain('v4.6.0');
  });

  it('returns available when python3 -m esptool works', async () => {
    mockExecFile.mockImplementation((...allArgs: any[]) => {
      const cmd = allArgs[0] as string;
      const args = allArgs[1] as string[];
      const lastArg = allArgs[allArgs.length - 1];
      const callback = typeof lastArg === 'function' ? lastArg : null;

      if (cmd === 'python3' && args.includes('-m') && args.includes('esptool')) {
        if (callback) callback(null, 'esptool.py v4.5.1\n', '');
      } else {
        const err = new Error('ENOENT');
        (err as any).code = 'ENOENT';
        if (callback) callback(err, '', '');
      }
      return createMockChildProcess();
    });

    const strategy = new EsptoolFlashStrategy();
    const result = await strategy.checkPrerequisites();

    expect(result.available).toBe(true);
    expect(result.message).toContain('v4.5.1');
  });

  it('returns unavailable when no esptool variant is found', async () => {
    setupEsptoolUnavailable();

    const strategy = new EsptoolFlashStrategy();
    const result = await strategy.checkPrerequisites();

    expect(result.available).toBe(false);
    expect(result.message).toContain('not found');
    expect(result.message).toContain('pip install esptool');
  });
});

// ── resolveEsptool ──────────────────────────────────────────────────────

describe('resolveEsptool', () => {
  it('prefers esptool.py over other variants', async () => {
    mockExecFile.mockImplementation((...allArgs: any[]) => {
      const cmd = allArgs[0] as string;
      const lastArg = allArgs[allArgs.length - 1];
      const callback = typeof lastArg === 'function' ? lastArg : null;

      if (cmd === 'esptool.py') {
        if (callback) callback(null, 'esptool.py v4.7.0\n', '');
      } else if (cmd === 'esptool') {
        if (callback) callback(null, 'esptool.py v4.6.0\n', '');
      } else {
        const err = new Error('ENOENT');
        (err as any).code = 'ENOENT';
        if (callback) callback(err, '', '');
      }
      return createMockChildProcess();
    });

    const result = await resolveEsptool();
    expect(result).not.toBeNull();
    expect(result!.cmd).toBe('esptool.py');
    expect(result!.prefix).toEqual([]);
    expect(result!.version).toBe('v4.7.0');
  });

  it('falls back to python3 -m esptool', async () => {
    mockExecFile.mockImplementation((...allArgs: any[]) => {
      const cmd = allArgs[0] as string;
      const args = allArgs[1] as string[];
      const lastArg = allArgs[allArgs.length - 1];
      const callback = typeof lastArg === 'function' ? lastArg : null;

      if (cmd === 'python3' && args.includes('-m')) {
        if (callback) callback(null, 'esptool.py v4.5.1\n', '');
      } else {
        const err = new Error('ENOENT');
        (err as any).code = 'ENOENT';
        if (callback) callback(err, '', '');
      }
      return createMockChildProcess();
    });

    const result = await resolveEsptool();
    expect(result).not.toBeNull();
    expect(result!.cmd).toBe('python3');
    expect(result!.prefix).toEqual(['-m', 'esptool']);
  });

  it('returns null when nothing is found', async () => {
    setupEsptoolUnavailable();
    const result = await resolveEsptool();
    expect(result).toBeNull();
  });
});

// ── detectSerialPort ────────────────────────────────────────────────────

describe('detectSerialPort', () => {
  it('uses explicit SERIAL_PORT field when provided', async () => {
    const port = await detectSerialPort({ SERIAL_PORT: '/dev/ttyACM0' });
    expect(port).toBe('/dev/ttyACM0');
  });

  it('ignores empty SERIAL_PORT string', async () => {
    const hw = makeMockHardwareService();
    hw.detectBoardFast.mockResolvedValue({ port: '/dev/ttyUSB0', boardType: 'ESP32' });

    const port = await detectSerialPort({ SERIAL_PORT: '' }, hw as any);
    expect(port).toBe('/dev/ttyUSB0');
  });

  it('falls back to detectBoardFast', async () => {
    const hw = makeMockHardwareService();
    hw.detectBoardFast.mockResolvedValue({ port: '/dev/ttyUSB0', boardType: 'ESP32-S3' });

    const port = await detectSerialPort({}, hw as any);
    expect(port).toBe('/dev/ttyUSB0');
    expect(hw.detectBoardFast).toHaveBeenCalledOnce();
  });

  it('falls back to detectBoard when detectBoardFast finds nothing', async () => {
    const hw = makeMockHardwareService();
    hw.detectBoardFast.mockResolvedValue(null);
    hw.detectBoard.mockResolvedValue({ port: 'COM3', boardType: 'MicroPython Board' });

    const port = await detectSerialPort({}, hw as any);
    expect(port).toBe('COM3');
    expect(hw.detectBoardFast).toHaveBeenCalledOnce();
    expect(hw.detectBoard).toHaveBeenCalledOnce();
  });

  it('returns null when no board detected and no override', async () => {
    const hw = makeMockHardwareService();
    const port = await detectSerialPort({}, hw as any);
    expect(port).toBeNull();
  });

  it('returns null when no hardware service and no override', async () => {
    const port = await detectSerialPort({});
    expect(port).toBeNull();
  });
});

// ── flash() ─────────────────────────────────────────────────────────────

describe('EsptoolFlashStrategy.flash', () => {
  it('validates firmware file exists', async () => {
    setupEsptoolAvailable();
    const strategy = new EsptoolFlashStrategy();
    const params = makeEsptoolFlashParams({
      flashConfig: {
        firmware_file: 'nonexistent.bin',
        flash_offset: '0x0',
        baud_rate: 460800,
        chip: 'esp32s3',
        prompt_message: 'Plug in BOX-3',
      },
    });

    const result = await strategy.flash(params);

    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });

  it('fails gracefully when esptool is not installed', async () => {
    setupEsptoolUnavailable();
    const strategy = new EsptoolFlashStrategy();
    const params = makeEsptoolFlashParams();

    const result = await strategy.flash(params);

    expect(result.success).toBe(false);
    expect(result.message).toContain('esptool not found');
  });

  it('fails when no serial port is detected', async () => {
    setupEsptoolAvailable();
    const hw = makeMockHardwareService();
    const strategy = new EsptoolFlashStrategy(hw as any);
    const params = makeEsptoolFlashParams({
      deviceFields: {}, // no SERIAL_PORT override
    });

    const result = await strategy.flash(params);

    expect(result.success).toBe(false);
    expect(result.message).toContain('No ESP32 board detected');
  });

  it('calls esptool with correct arguments', async () => {
    setupEsptoolAvailable();
    const strategy = new EsptoolFlashStrategy();
    const params = makeEsptoolFlashParams();

    await strategy.flash(params);

    // Find the flash call (not the version check)
    const flashCall = mockExecFile.mock.calls.find(
      (call: any[]) => {
        const callArgs = call[1];
        return Array.isArray(callArgs) && callArgs.includes('write_flash');
      }
    );
    expect(flashCall).toBeDefined();
    const [cmd, args] = flashCall!;
    expect(cmd).toBe('esptool.py');
    expect(args).toContain('--chip');
    expect(args).toContain('esp32s3');
    expect(args).toContain('--port');
    expect(args).toContain('/dev/ttyUSB0');
    expect(args).toContain('--baud');
    expect(args).toContain('460800');
    expect(args).toContain('write_flash');
    expect(args).toContain('0x0');
    // Firmware path should be the absolute path
    expect(args[args.length - 1]).toContain('firmware.bin');
  });

  it('uses python3 -m esptool when esptool.py is unavailable', async () => {
    mockExecFile.mockImplementation((...allArgs: any[]) => {
      const cmd = allArgs[0] as string;
      const args = allArgs[1] as string[];
      const lastArg = allArgs[allArgs.length - 1];
      const callback = typeof lastArg === 'function' ? lastArg : null;

      if (cmd === 'python3' && args[0] === '-m' && args[1] === 'esptool') {
        if (args[2] === 'version') {
          if (callback) callback(null, 'esptool.py v4.5.0\n', '');
        } else if (args.includes('write_flash')) {
          if (callback) callback(null, 'Hash of data verified.\nLeaving...\n', '');
        } else {
          if (callback) callback(null, '', '');
        }
      } else {
        const err = new Error('ENOENT');
        (err as any).code = 'ENOENT';
        if (callback) callback(err, '', '');
      }
      return createMockChildProcess();
    });

    const strategy = new EsptoolFlashStrategy();
    const params = makeEsptoolFlashParams();

    const result = await strategy.flash(params);

    expect(result.success).toBe(true);

    const flashCall = mockExecFile.mock.calls.find(
      (call: any[]) => {
        const callArgs = call[1];
        return Array.isArray(callArgs) && callArgs.includes('write_flash');
      }
    );
    expect(flashCall).toBeDefined();
    const [cmd, args] = flashCall!;
    expect(cmd).toBe('python3');
    expect(args[0]).toBe('-m');
    expect(args[1]).toBe('esptool');
  });

  it('reports success when esptool output contains verification', async () => {
    setupEsptoolAvailable('Hash of data verified.\nLeaving...\n');
    const strategy = new EsptoolFlashStrategy();
    const params = makeEsptoolFlashParams();

    const result = await strategy.flash(params);

    expect(result.success).toBe(true);
    expect(result.message).toContain('successfully');
  });

  it('reports success even without verification string (exit code 0)', async () => {
    setupEsptoolAvailable('Some other output without verification\n');
    const strategy = new EsptoolFlashStrategy();
    const params = makeEsptoolFlashParams();

    const result = await strategy.flash(params);

    expect(result.success).toBe(true);
    expect(result.message).toContain('/dev/ttyUSB0');
  });

  it('parses progress from esptool output', async () => {
    setupEsptoolAvailable();
    const onProgress = vi.fn();
    const strategy = new EsptoolFlashStrategy();
    const params = makeEsptoolFlashParams({ onProgress });

    await strategy.flash(params);

    // Should have received progress calls from the initial steps
    const progressSteps = onProgress.mock.calls.map((c: any[]) => c[0]);
    expect(progressSteps).toContain('Checking esptool...');
    expect(progressSteps).toContain('Detecting serial port...');
    expect(progressSteps).toContain('Flashing firmware...');
    expect(progressSteps).toContain('Flash complete!');
  });

  it('handles esptool errors gracefully', async () => {
    mockExecFile.mockImplementation((...allArgs: any[]) => {
      const cmd = allArgs[0] as string;
      const args = allArgs[1] as string[];
      const lastArg = allArgs[allArgs.length - 1];
      const callback = typeof lastArg === 'function' ? lastArg : null;

      if (cmd === 'esptool.py' && args[0] === 'version') {
        if (callback) callback(null, 'esptool.py v4.7.0\n', '');
      } else if (cmd === 'esptool.py' && args.includes('write_flash')) {
        const err = new Error('Command failed');
        (err as any).code = 1;
        if (callback) callback(err, '', 'A fatal error occurred: Failed to connect to ESP32-S3: No serial data received.');
      } else {
        const err = new Error('ENOENT');
        (err as any).code = 'ENOENT';
        if (callback) callback(err, '', '');
      }
      return createMockChildProcess();
    });

    const strategy = new EsptoolFlashStrategy();
    const params = makeEsptoolFlashParams();

    const result = await strategy.flash(params);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to connect');
  });

  it('handles timeout gracefully', async () => {
    mockExecFile.mockImplementation((...allArgs: any[]) => {
      const cmd = allArgs[0] as string;
      const args = allArgs[1] as string[];
      const lastArg = allArgs[allArgs.length - 1];
      const callback = typeof lastArg === 'function' ? lastArg : null;

      if (cmd === 'esptool.py' && args[0] === 'version') {
        if (callback) callback(null, 'esptool.py v4.7.0\n', '');
      } else if (cmd === 'esptool.py' && args.includes('write_flash')) {
        const err = new Error('Timed out');
        (err as any).killed = true;
        if (callback) callback(err, '', '');
      } else {
        const err = new Error('ENOENT');
        (err as any).code = 'ENOENT';
        if (callback) callback(err, '', '');
      }
      return createMockChildProcess();
    });

    const strategy = new EsptoolFlashStrategy();
    const params = makeEsptoolFlashParams();

    const result = await strategy.flash(params);

    expect(result.success).toBe(false);
    expect(result.message).toContain('timed out');
    expect(result.message).toContain('120');
  });

  it('writes runtime_config.json when injections are present', async () => {
    setupEsptoolAvailable();
    const strategy = new EsptoolFlashStrategy();
    const params = makeEsptoolFlashParams({
      injections: {
        agent_id: 'agent-123',
        api_key: 'sk-test-key',
        runtime_url: 'https://runtime.example.com',
      },
    });

    await strategy.flash(params);

    const configPath = path.join(params.nuggetDir, 'runtime_config.json');
    expect(fs.existsSync(configPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(config.agent_id).toBe('agent-123');
    expect(config.api_key).toBe('sk-test-key');
    expect(config.runtime_url).toBe('https://runtime.example.com');
  });

  it('does NOT write runtime_config.json when no injections', async () => {
    setupEsptoolAvailable();
    const strategy = new EsptoolFlashStrategy();
    const params = makeEsptoolFlashParams({ injections: {} });

    await strategy.flash(params);

    const configPath = path.join(params.nuggetDir, 'runtime_config.json');
    expect(fs.existsSync(configPath)).toBe(false);
  });

  it('uses explicit SERIAL_PORT from device fields', async () => {
    setupEsptoolAvailable();
    const strategy = new EsptoolFlashStrategy();
    const params = makeEsptoolFlashParams({
      deviceFields: { SERIAL_PORT: '/dev/cu.usbmodem14101' },
    });

    await strategy.flash(params);

    const flashCall = mockExecFile.mock.calls.find(
      (call: any[]) => {
        const callArgs = call[1];
        return Array.isArray(callArgs) && callArgs.includes('write_flash');
      }
    );
    expect(flashCall).toBeDefined();
    const args = flashCall![1] as string[];
    const portIdx = args.indexOf('--port');
    expect(args[portIdx + 1]).toBe('/dev/cu.usbmodem14101');
  });

  it('uses auto-detected port when no SERIAL_PORT field', async () => {
    setupEsptoolAvailable();
    const hw = makeMockHardwareService();
    hw.detectBoardFast.mockResolvedValue({ port: '/dev/ttyACM1', boardType: 'ESP32-S3' });
    const strategy = new EsptoolFlashStrategy(hw as any);
    const params = makeEsptoolFlashParams({
      deviceFields: {}, // no SERIAL_PORT
    });

    await strategy.flash(params);

    const flashCall = mockExecFile.mock.calls.find(
      (call: any[]) => {
        const callArgs = call[1];
        return Array.isArray(callArgs) && callArgs.includes('write_flash');
      }
    );
    expect(flashCall).toBeDefined();
    const args = flashCall![1] as string[];
    const portIdx = args.indexOf('--port');
    expect(args[portIdx + 1]).toBe('/dev/ttyACM1');
  });

  it('uses default values for chip, baud_rate, and flash_offset', async () => {
    setupEsptoolAvailable();
    const strategy = new EsptoolFlashStrategy();
    const params = makeEsptoolFlashParams({
      flashConfig: {
        firmware_file: 'firmware.bin',
        prompt_message: 'Plug in device',
        // chip, baud_rate, flash_offset all omitted -- should use defaults
      },
    });

    await strategy.flash(params);

    const flashCall = mockExecFile.mock.calls.find(
      (call: any[]) => {
        const callArgs = call[1];
        return Array.isArray(callArgs) && callArgs.includes('write_flash');
      }
    );
    expect(flashCall).toBeDefined();
    const args = flashCall![1] as string[];

    // Default chip
    const chipIdx = args.indexOf('--chip');
    expect(args[chipIdx + 1]).toBe('esp32s3');

    // Default baud rate
    const baudIdx = args.indexOf('--baud');
    expect(args[baudIdx + 1]).toBe('460800');

    // Default offset (write_flash arg)
    const wfIdx = args.indexOf('write_flash');
    expect(args[wfIdx + 1]).toBe('0x0');
  });

  it('respects custom chip, baud_rate, and flash_offset', async () => {
    setupEsptoolAvailable();
    const strategy = new EsptoolFlashStrategy();
    const params = makeEsptoolFlashParams({
      flashConfig: {
        firmware_file: 'firmware.bin',
        chip: 'esp32',
        baud_rate: 115200,
        flash_offset: '0x1000',
        prompt_message: 'Plug in device',
      },
    });

    await strategy.flash(params);

    const flashCall = mockExecFile.mock.calls.find(
      (call: any[]) => {
        const callArgs = call[1];
        return Array.isArray(callArgs) && callArgs.includes('write_flash');
      }
    );
    expect(flashCall).toBeDefined();
    const args = flashCall![1] as string[];

    const chipIdx = args.indexOf('--chip');
    expect(args[chipIdx + 1]).toBe('esp32');

    const baudIdx = args.indexOf('--baud');
    expect(args[baudIdx + 1]).toBe('115200');

    const wfIdx = args.indexOf('write_flash');
    expect(args[wfIdx + 1]).toBe('0x1000');
  });

  it('uses execFile (no shell) for esptool execution', async () => {
    setupEsptoolAvailable();
    const strategy = new EsptoolFlashStrategy();
    const params = makeEsptoolFlashParams();

    await strategy.flash(params);

    const flashCall = mockExecFile.mock.calls.find(
      (call: any[]) => {
        const callArgs = call[1];
        return Array.isArray(callArgs) && callArgs.includes('write_flash');
      }
    );
    expect(flashCall).toBeDefined();
    const opts = flashCall![2] as any;
    // execFile does NOT have a shell option -- if it did and was true, that
    // would be a security concern. Verify no shell option is set.
    expect(opts.shell).toBeUndefined();
  });

  it('sets 120 second timeout on execFile', async () => {
    setupEsptoolAvailable();
    const strategy = new EsptoolFlashStrategy();
    const params = makeEsptoolFlashParams();

    await strategy.flash(params);

    const flashCall = mockExecFile.mock.calls.find(
      (call: any[]) => {
        const callArgs = call[1];
        return Array.isArray(callArgs) && callArgs.includes('write_flash');
      }
    );
    expect(flashCall).toBeDefined();
    const opts = flashCall![2] as any;
    expect(opts.timeout).toBe(120_000);
  });

  it('reports progress for writing runtime config step', async () => {
    setupEsptoolAvailable();
    const onProgress = vi.fn();
    const strategy = new EsptoolFlashStrategy();
    const params = makeEsptoolFlashParams({
      onProgress,
      injections: { agent_id: 'test-agent' },
    });

    await strategy.flash(params);

    const steps = onProgress.mock.calls.map((c: any[]) => c[0]);
    expect(steps).toContain('Writing runtime configuration...');
  });
});

// ── EsptoolFlashStrategy method and construction ────────────────────────

describe('EsptoolFlashStrategy basics', () => {
  it('has method "esptool"', () => {
    const strategy = new EsptoolFlashStrategy();
    expect(strategy.method).toBe('esptool');
  });

  it('accepts optional hardwareService in constructor', () => {
    const hw = makeMockHardwareService();
    const strategy = new EsptoolFlashStrategy(hw as any);
    expect(strategy.method).toBe('esptool');
  });

  it('works without hardwareService (falls back to device fields)', async () => {
    setupEsptoolAvailable();
    const strategy = new EsptoolFlashStrategy(); // no hardware service
    const params = makeEsptoolFlashParams({
      deviceFields: { SERIAL_PORT: '/dev/ttyUSB99' },
    });

    const result = await strategy.flash(params);
    expect(result.success).toBe(true);
  });
});
