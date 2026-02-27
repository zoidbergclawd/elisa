import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  MpremoteFlashStrategy,
  EsptoolFlashStrategy,
  selectFlashStrategy,
  type FlashParams,
} from '../../services/flashStrategy.js';

// ── Mocks ───────────────────────────────────────────────────────────────

function makeMockHardwareService() {
  return {
    flashFiles: vi.fn(async () => ({ success: true, message: 'Flashed OK' })),
    wipeBoard: vi.fn(async () => ({ success: true, removed: [] })),
    resetBoard: vi.fn(async () => {}),
    detectBoard: vi.fn(async () => null),
    compile: vi.fn(async () => ({ success: true, errors: [], outputPath: '' })),
  };
}

/** Create a real temp directory for tests that write files. */
function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-flash-test-'));
  tmpDirs.push(dir);
  return dir;
}

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  tmpDirs.length = 0;
});

function makeFlashParams(overrides: Partial<FlashParams> = {}): FlashParams {
  return {
    pluginDir: '/tmp/test-plugin',
    nuggetDir: makeTempDir(),
    deviceFields: {},
    injections: {},
    pluginId: 'test-device',
    flashConfig: {
      files: ['main.py'],
      lib: [],
      shared_lib: [],
      prompt_message: 'Plug in device',
    },
    flashFiles: { lib: [], shared: [] },
    onProgress: vi.fn(),
    ...overrides,
  };
}

// ── MpremoteFlashStrategy ───────────────────────────────────────────────

describe('MpremoteFlashStrategy', () => {
  it('has method "flash"', () => {
    const hw = makeMockHardwareService();
    const strategy = new MpremoteFlashStrategy(hw as any);
    expect(strategy.method).toBe('flash');
  });

  it('delegates flash to hardwareService.flashFiles', async () => {
    const hw = makeMockHardwareService();
    const strategy = new MpremoteFlashStrategy(hw as any);
    const params = makeFlashParams();

    const result = await strategy.flash(params);

    expect(result.success).toBe(true);
    expect(hw.flashFiles).toHaveBeenCalledOnce();
    expect(hw.wipeBoard).toHaveBeenCalledOnce();
  });

  it('calls resetBoard after successful flash', async () => {
    const hw = makeMockHardwareService();
    const strategy = new MpremoteFlashStrategy(hw as any);
    const params = makeFlashParams();

    await strategy.flash(params);

    expect(hw.resetBoard).toHaveBeenCalledOnce();
  });

  it('does NOT call resetBoard after failed flash', async () => {
    const hw = makeMockHardwareService();
    hw.flashFiles.mockResolvedValue({ success: false, message: 'No board' });
    const strategy = new MpremoteFlashStrategy(hw as any);
    const params = makeFlashParams();

    const result = await strategy.flash(params);

    expect(result.success).toBe(false);
    expect(hw.resetBoard).not.toHaveBeenCalled();
  });

  it('builds correct flash file list including config.py when injections present', async () => {
    const hw = makeMockHardwareService();
    const strategy = new MpremoteFlashStrategy(hw as any);
    const params = makeFlashParams({
      injections: { cloud_url: 'https://example.com' },
      flashConfig: {
        files: ['sensor.py'],
        lib: [],
        shared_lib: [],
        prompt_message: 'Plug in',
      },
    });

    await strategy.flash(params);

    // Should flash sensor.py, main.py (wrapper), and config.py
    const flashCall = hw.flashFiles.mock.calls[0] as any[];
    const files = flashCall[1] as string[];
    expect(files).toContain('sensor.py');
    expect(files).toContain('main.py');
    expect(files).toContain('config.py');
  });

  it('reports progress during flash', async () => {
    const hw = makeMockHardwareService();
    const strategy = new MpremoteFlashStrategy(hw as any);
    const onProgress = vi.fn();
    const params = makeFlashParams({ onProgress });

    await strategy.flash(params);

    expect(onProgress).toHaveBeenCalled();
    // Should report at least copying and wiping steps
    const steps = onProgress.mock.calls.map((c: any[]) => c[0]);
    expect(steps.some((s: string) => s.includes('Copying'))).toBe(true);
    expect(steps.some((s: string) => s.includes('Wiping'))).toBe(true);
  });
});

// ── EsptoolFlashStrategy ────────────────────────────────────────────────

describe('EsptoolFlashStrategy', () => {
  it('has method "esptool"', () => {
    const strategy = new EsptoolFlashStrategy();
    expect(strategy.method).toBe('esptool');
  });

  it('returns stub failure message (not yet implemented)', async () => {
    const strategy = new EsptoolFlashStrategy();
    const params = makeFlashParams({
      flashConfig: {
        firmware_file: 'firmware.bin',
        flash_offset: '0x0',
        baud_rate: 460800,
        chip: 'esp32s3',
        prompt_message: 'Plug in BOX-3',
      },
    });

    // Create a fake firmware file for the check
    const firmwarePath = path.join(params.pluginDir, 'firmware.bin');
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (String(p) === firmwarePath) return true;
      return false;
    });

    const result = await strategy.flash(params);

    expect(result.success).toBe(false);
    expect(result.message).toContain('stub');

    vi.restoreAllMocks();
  });

  it('fails if firmware file does not exist', async () => {
    const strategy = new EsptoolFlashStrategy();
    const params = makeFlashParams({
      flashConfig: {
        firmware_file: 'nonexistent.bin',
        flash_offset: '0x0',
        baud_rate: 460800,
        chip: 'esp32s3',
        prompt_message: 'Plug in BOX-3',
      },
    });

    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const result = await strategy.flash(params);

    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');

    vi.restoreAllMocks();
  });
});

// ── selectFlashStrategy ─────────────────────────────────────────────────

describe('selectFlashStrategy', () => {
  it('returns MpremoteFlashStrategy for method "flash"', () => {
    const hw = makeMockHardwareService();
    const strategy = selectFlashStrategy('flash', hw as any);
    expect(strategy).toBeInstanceOf(MpremoteFlashStrategy);
    expect(strategy.method).toBe('flash');
  });

  it('returns EsptoolFlashStrategy for method "esptool"', () => {
    const hw = makeMockHardwareService();
    const strategy = selectFlashStrategy('esptool', hw as any);
    expect(strategy).toBeInstanceOf(EsptoolFlashStrategy);
    expect(strategy.method).toBe('esptool');
  });

  it('throws for unknown method', () => {
    const hw = makeMockHardwareService();
    expect(() => selectFlashStrategy('unknown', hw as any)).toThrow(/unknown/i);
  });
});
