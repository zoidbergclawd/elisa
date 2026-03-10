/**
 * Regression tests for #169: Bundle spiffsgen.py so SPIFFS generation
 * works without ESP-IDF installed.
 *
 * Verifies:
 *  - findSpiffsgenPath() returns the bundled script first
 *  - findSpiffsgenPath() falls back when bundled copy is missing
 *  - Bundled spiffsgen.py produces a valid SPIFFS image
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { EsptoolFlashStrategy } from '../../services/flashStrategy.js';

const execFileAsync = promisify(execFile);

const tmpDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-spiffs-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tmpDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  tmpDirs.length = 0;
});

// ── findSpiffsgenPath ────────────────────────────────────────────────────

describe('findSpiffsgenPath', () => {
  it('finds the bundled spiffsgen.py (devices/_shared/tools/spiffsgen.py)', async () => {
    const result = await EsptoolFlashStrategy.findSpiffsgenPath();

    expect(result).not.toBeNull();
    expect(result!).toContain('spiffsgen.py');
    // The bundled path should be inside the repo's devices/_shared/tools/ directory
    expect(result!).toContain(path.join('devices', '_shared', 'tools', 'spiffsgen.py'));
    // The file must actually exist
    expect(fs.existsSync(result!)).toBe(true);
  });

  it('returns bundled path even when IDF_PATH is set', async () => {
    // Simulate IDF_PATH pointing to a valid spiffsgen.py elsewhere
    const fakeIdf = makeTempDir();
    const fakeSpiffsDir = path.join(fakeIdf, 'components', 'spiffs');
    fs.mkdirSync(fakeSpiffsDir, { recursive: true });
    fs.writeFileSync(path.join(fakeSpiffsDir, 'spiffsgen.py'), '# fake', 'utf-8');

    const origIdfPath = process.env.IDF_PATH;
    process.env.IDF_PATH = fakeIdf;
    try {
      const result = await EsptoolFlashStrategy.findSpiffsgenPath();
      expect(result).not.toBeNull();
      // Should pick the bundled copy, not the IDF_PATH one
      expect(result!).toContain(path.join('devices', '_shared', 'tools'));
      expect(result!).not.toContain(fakeIdf);
    } finally {
      if (origIdfPath !== undefined) {
        process.env.IDF_PATH = origIdfPath;
      } else {
        delete process.env.IDF_PATH;
      }
    }
  });

  it('falls back to IDF_PATH when bundled copy is missing', async () => {
    // Mock fs.existsSync to say bundled path doesn't exist, but IDF_PATH does
    const fakeIdf = makeTempDir();
    const fakeSpiffsDir = path.join(fakeIdf, 'components', 'spiffs');
    fs.mkdirSync(fakeSpiffsDir, { recursive: true });
    fs.writeFileSync(path.join(fakeSpiffsDir, 'spiffsgen.py'), '# fake idf spiffsgen', 'utf-8');

    const origIdfPath = process.env.IDF_PATH;
    process.env.IDF_PATH = fakeIdf;

    const realExistsSync = fs.existsSync;
    vi.spyOn(fs, 'existsSync').mockImplementation((p: fs.PathLike) => {
      const pStr = String(p);
      // Make the bundled path appear missing
      if (pStr.includes(path.join('devices', '_shared', 'tools', 'spiffsgen.py'))) {
        return false;
      }
      return realExistsSync(pStr);
    });

    try {
      const result = await EsptoolFlashStrategy.findSpiffsgenPath();
      expect(result).not.toBeNull();
      expect(result!).toBe(path.join(fakeSpiffsDir, 'spiffsgen.py'));
    } finally {
      if (origIdfPath !== undefined) {
        process.env.IDF_PATH = origIdfPath;
      } else {
        delete process.env.IDF_PATH;
      }
    }
  });
});

// ── Bundled spiffsgen.py produces a valid SPIFFS image ──────────────────

describe('bundled spiffsgen.py SPIFFS image generation', () => {
  it('generates a valid .bin image from a directory containing runtime_config.json', async () => {
    // Find the bundled spiffsgen.py
    const spiffsgenPath = await EsptoolFlashStrategy.findSpiffsgenPath();
    expect(spiffsgenPath).not.toBeNull();
    // Ensure it's the bundled copy (not a module invocation string)
    expect(spiffsgenPath!.startsWith('-')).toBe(false);

    // Set up a temp source directory with a runtime_config.json
    const tempDir = makeTempDir();
    const sourceDir = path.join(tempDir, 'spiffs');
    fs.mkdirSync(sourceDir);
    const config = {
      agent_id: 'test-agent-123',
      api_key: 'test-key',
      runtime_url: 'http://192.168.1.100:8000',
      wifi_ssid: 'TestNetwork',
      wifi_password: 'testpass123',
    };
    fs.writeFileSync(
      path.join(sourceDir, 'runtime_config.json'),
      JSON.stringify(config, null, 2),
      'utf-8',
    );

    const outputImage = path.join(tempDir, 'storage.bin');

    // Run spiffsgen.py with the same params as generateSpiffsImage
    // Using 0x50000 (327680 bytes) as a typical SPIFFS partition size
    const args = [
      spiffsgenPath!,
      '0x50000',
      sourceDir,
      outputImage,
      '--page-size', '256',
      '--obj-name-len', '32',
      '--meta-len', '4',
      '--use-magic',
      '--use-magic-len',
    ];

    // Use python3 on Unix, python on Windows
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    await execFileAsync(pythonCmd, args, { timeout: 15_000 });

    // Verify the output image exists and has non-zero size
    expect(fs.existsSync(outputImage)).toBe(true);
    const stat = fs.statSync(outputImage);
    expect(stat.size).toBe(0x50000); // SPIFFS images are exactly the partition size
  });
});
