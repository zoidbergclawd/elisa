/**
 * Flash strategy abstraction for device deployment.
 *
 * Defines a common interface for different flash mechanisms (mpremote, esptool)
 * so the deploy pipeline can dispatch to the correct strategy based on the
 * device manifest's deploy.method field.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { safeEnv } from '../utils/safeEnv.js';
import type { HardwareService } from './hardwareService.js';
import type { DeviceRegistry } from './deviceRegistry.js';
import { sanitizeReplacements, escapePythonString } from '../utils/sanitizePythonValue.js';
import type { FaceDescriptor } from '../models/display.js';
import { DEFAULT_FACE } from '../models/display.js';

const execFileAsync = promisify(execFile);

// ── Interfaces ──────────────────────────────────────────────────────────

export interface FlashParams {
  /** Device plugin directory (absolute path) */
  pluginDir: string;
  /** Nugget workspace directory (absolute path) */
  nuggetDir: string;
  /** Device instance fields from the user's block configuration */
  deviceFields: Record<string, unknown>;
  /** Values from upstream devices (e.g., runtime_url, api_key) */
  injections: Record<string, string>;
  /** Device plugin ID */
  pluginId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- device manifest flash config schema varies per plugin; no unified type exists
  flashConfig: Record<string, any>;
  /** Lib files resolved from the device registry */
  flashFiles: { lib: string[]; shared: string[] };
  /** Progress callback */
  onProgress: (step: string, progress: number) => void;
  /** Optional runtime config from resolved NuggetSpec (for esptool devices) */
  runtimeConfig?: {
    face_descriptor?: FaceDescriptor;
  };
}

export interface FlashResult {
  success: boolean;
  message?: string;
}

export interface FlashStrategy {
  /** The deploy method this strategy handles */
  readonly method: string;

  /** Validate that required tools are available */
  checkPrerequisites(): Promise<{ available: boolean; message: string }>;

  /** Execute the flash operation */
  flash(params: FlashParams): Promise<FlashResult>;
}

// ── Mpremote Strategy ───────────────────────────────────────────────────

/**
 * Flash strategy for MicroPython devices using mpremote.
 * Extracts the existing flash logic from deployPhase.ts.
 */
export class MpremoteFlashStrategy implements FlashStrategy {
  readonly method = 'flash';

  constructor(
    private hardwareService: HardwareService,
  ) {}

  async checkPrerequisites(): Promise<{ available: boolean; message: string }> {
    // mpremote availability is checked lazily by hardwareService.flashFiles()
    // which produces a clear error if mpremote is not found.
    // We do a lightweight check here.
    try {
      await execFileAsync('mpremote', ['version'], { timeout: 5000, env: safeEnv() });
      return { available: true, message: 'mpremote is available' };
    } catch {
      // Check common install locations (same logic as hardwareService)
      const home = process.env.USERPROFILE || process.env.HOME || '';
      const candidates = [
        path.join(home, '.local', 'bin', 'mpremote'),
        '/usr/local/bin/mpremote',
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          return { available: true, message: `mpremote found at ${candidate}` };
        }
      }
      return { available: false, message: 'mpremote not found. Install it with: pip install mpremote' };
    }
  }

  async flash(params: FlashParams): Promise<FlashResult> {
    const {
      pluginDir, nuggetDir, deviceFields, injections,
      flashConfig, flashFiles, onProgress,
    } = params;

    // Copy lib and shared files from plugin directory into workspace
    for (const libFile of flashFiles.lib) {
      const dest = path.join(nuggetDir, path.basename(libFile));
      if (fs.existsSync(libFile)) fs.copyFileSync(libFile, dest);
    }
    for (const sharedFile of flashFiles.shared) {
      const dest = path.join(nuggetDir, path.basename(sharedFile));
      if (fs.existsSync(sharedFile)) fs.copyFileSync(sharedFile, dest);
    }

    onProgress('Copying library files...', 20);

    // Use the plugin template for entry point files.
    // Agent-generated versions lack runtime config (cloud URL, API key)
    // and hardware init (OLED) that the template provides.
    if (pluginDir) {
      for (const entryFileName of flashConfig.files) {
        const workspaceFile = path.join(nuggetDir, entryFileName);
        const templateFile = path.join(pluginDir, 'templates', entryFileName);
        if (fs.existsSync(templateFile)) {
          let content = fs.readFileSync(templateFile, 'utf-8');
          // Replace __PLACEHOLDER__ patterns with device fields + injections.
          // Values are sanitized to prevent Python code injection.
          const rawReplacements: Record<string, unknown> = { ...injections };
          if (deviceFields) {
            for (const [k, v] of Object.entries(deviceFields)) {
              rawReplacements[k] = v;
            }
          }
          const safeReplacements = sanitizeReplacements(content, rawReplacements);
          for (const [key, value] of Object.entries(safeReplacements)) {
            content = content.replace(new RegExp(`__${key.toUpperCase()}__`, 'g'), value);
          }
          fs.writeFileSync(workspaceFile, content, 'utf-8');
        }
      }
    }

    // Wipe board filesystem before flashing to remove stale files
    onProgress('Wiping board filesystem...', 28);
    await this.hardwareService.wipeBoard();

    // Write injected config values (e.g., cloud_url, api_key) as config.py.
    // Values are escaped to produce safe Python string literals.
    if (Object.keys(injections).length > 0) {
      const configLines = Object.entries(injections)
        .map(([k, v]) => `${k.toUpperCase()} = "${escapePythonString(v)}"`);
      const configContent = configLines.join('\n') + '\n';
      const configPath = path.join(nuggetDir, 'config.py');
      fs.writeFileSync(configPath, configContent, 'utf-8');
    }

    // Create main.py wrapper so MicroPython auto-runs the entry point on boot
    const entryFile = flashConfig.files[0];
    if (entryFile && entryFile !== 'main.py') {
      const moduleName = entryFile.replace(/\.py$/, '');
      const mainPyContent = `# Auto-generated by Elisa to boot ${entryFile}\nimport ${moduleName}\n`;
      fs.writeFileSync(path.join(nuggetDir, 'main.py'), mainPyContent, 'utf-8');
    }

    // Build list of files to flash
    const filesToFlash = [
      ...flashConfig.files,
      ...flashFiles.lib.map((f: string) => path.basename(f)),
      ...flashFiles.shared.map((f: string) => path.basename(f)),
    ];
    // Include main.py wrapper if we wrote one
    if (entryFile && entryFile !== 'main.py') {
      filesToFlash.push('main.py');
    }
    // Include config.py if we wrote one
    if (Object.keys(injections).length > 0) {
      filesToFlash.push('config.py');
    }

    onProgress(`Flashing ${filesToFlash.length} files to board...`, 40);

    const flashResult = await this.hardwareService.flashFiles(
      nuggetDir,
      filesToFlash,
      (flashed, total, fileName) => {
        const pct = Math.round(40 + (flashed / total) * 50);
        onProgress(`Flashed ${fileName} (${flashed}/${total})`, pct);
      },
    );

    // Soft-reset board after successful flash so code runs
    if (flashResult.success) {
      onProgress('Resetting board...', 90);
      await this.hardwareService.resetBoard();
    }

    return {
      success: flashResult.success,
      message: flashResult.message,
    };
  }
}

// ── Esptool Strategy ────────────────────────────────────────────────────

/** Esptool flash timeout in milliseconds. */
const ESPTOOL_TIMEOUT_MS = 120_000;

/** Progress regex: esptool outputs lines like "Writing at 0x00010000... (10 %)" */
const PROGRESS_RE = /\((\d+)\s*%\)/;

/**
 * Resolve the esptool command. Returns the command and args prefix needed to
 * invoke esptool. Tries `esptool.py` first (standalone install), then `esptool`
 * (pip script entry point), then `python3 -m esptool` as a last resort.
 *
 * Exported for testing.
 */
export async function resolveEsptool(): Promise<{ cmd: string; prefix: string[]; version: string } | null> {
  // Try esptool.py (standalone script)
  try {
    const { stdout } = await execFileAsync('esptool.py', ['version'], { timeout: 5000, env: safeEnv() });
    const version = extractVersion(stdout);
    return { cmd: 'esptool.py', prefix: [], version };
  } catch { /* not found */ }

  // Try esptool (pip entry point, no .py suffix)
  try {
    const { stdout } = await execFileAsync('esptool', ['version'], { timeout: 5000, env: safeEnv() });
    const version = extractVersion(stdout);
    return { cmd: 'esptool', prefix: [], version };
  } catch { /* not found */ }

  // Try python3 -m esptool
  try {
    const { stdout } = await execFileAsync('python3', ['-m', 'esptool', 'version'], { timeout: 5000, env: safeEnv() });
    const version = extractVersion(stdout);
    return { cmd: 'python3', prefix: ['-m', 'esptool'], version };
  } catch { /* not found */ }

  return null;
}

/** Extract version string from esptool version output (e.g. "esptool.py v4.7.0"). */
function extractVersion(stdout: string): string {
  const match = stdout.match(/v?(\d+\.\d+(?:\.\d+)?)/);
  return match ? `v${match[1]}` : 'unknown';
}

/**
 * Detect the serial port for an ESP32 device.
 * Checks for an explicit SERIAL_PORT field override first, then falls back
 * to USB VID:PID detection via HardwareService.
 *
 * Exported for testing.
 */
export async function detectSerialPort(
  deviceFields: Record<string, unknown>,
  hardwareService?: HardwareService,
): Promise<string | null> {
  // Explicit port override from device block fields
  const explicitPort = deviceFields.SERIAL_PORT;
  if (typeof explicitPort === 'string' && explicitPort.length > 0) {
    return explicitPort;
  }

  // Auto-detect via hardware service
  if (hardwareService) {
    const board = await hardwareService.detectBoardFast();
    if (board) return board.port;
    // Fall back to full detection (includes REPL probe)
    const fullBoard = await hardwareService.detectBoard();
    if (fullBoard) return fullBoard.port;
  }

  return null;
}

/**
 * Build the full runtime_config.json for ESP32 firmware.
 *
 * Combines provisioning injections (agent_id, api_key, runtime_url) with
 * device block fields (WIFI_SSID, WIFI_PASSWORD, etc.) and spec runtime
 * config (face_descriptor). The resulting object matches the schema at
 * devices/esp32-s3-box3-agent/firmware/runtime_config.schema.json.
 *
 * Exported for testing.
 */
export function buildRuntimeConfig(
  injections: Record<string, string>,
  deviceFields: Record<string, unknown>,
  runtimeConfig?: { face_descriptor?: FaceDescriptor },
): Record<string, unknown> {
  return {
    agent_id: injections.agent_id ?? injections.AGENT_ID ?? '',
    api_key: injections.api_key ?? injections.API_KEY ?? '',
    runtime_url: injections.runtime_url ?? injections.RUNTIME_URL ?? '',
    wifi_ssid: (deviceFields.WIFI_SSID as string) || '',
    wifi_password: (deviceFields.WIFI_PASSWORD as string) || '',
    agent_name: (deviceFields.AGENT_NAME as string) || 'Elisa Agent',
    wake_word: (deviceFields.WAKE_WORD as string) || 'Hi Elisa',
    display_theme: (deviceFields.DISPLAY_THEME as string) || 'default',
    face_descriptor: runtimeConfig?.face_descriptor ?? DEFAULT_FACE,
  };
}

/**
 * Flash strategy for binary firmware flash using esptool.
 * Flashes pre-built firmware images (.bin) to ESP32 devices.
 */
export class EsptoolFlashStrategy implements FlashStrategy {
  readonly method = 'esptool';

  constructor(
    private hardwareService?: HardwareService,
  ) {}

  async checkPrerequisites(): Promise<{ available: boolean; message: string }> {
    const resolved = await resolveEsptool();
    if (resolved) {
      return { available: true, message: `esptool ${resolved.version} found` };
    }
    return { available: false, message: 'esptool not found: install with pip install esptool' };
  }

  async flash(params: FlashParams): Promise<FlashResult> {
    const { pluginDir, nuggetDir, deviceFields, injections, flashConfig, onProgress, runtimeConfig } = params;

    // Validate that the firmware file exists in the plugin directory
    const firmwarePath = path.join(pluginDir, flashConfig.firmware_file);
    if (!fs.existsSync(firmwarePath)) {
      return {
        success: false,
        message: `Firmware file not found: ${flashConfig.firmware_file}`,
      };
    }

    onProgress('Checking esptool...', 5);

    // Resolve esptool command
    const resolved = await resolveEsptool();
    if (!resolved) {
      return {
        success: false,
        message: 'esptool not found: install with pip install esptool',
      };
    }

    onProgress('Detecting serial port...', 10);

    // Detect serial port
    const port = await detectSerialPort(deviceFields, this.hardwareService);
    if (!port) {
      return {
        success: false,
        message: 'No ESP32 board detected. Connect your board via USB and try again.',
      };
    }

    // Build runtime config combining injections + device fields + spec data.
    const config = Object.keys(injections).length > 0
      ? buildRuntimeConfig(injections, deviceFields, runtimeConfig)
      : null;

    // Build the list of address-file pairs for write_flash.
    // esptool supports multiple pairs: write_flash 0x0 boot.bin 0x10000 app.bin ...
    const flashPairs: string[] = [];

    // Add partition files (bootloader, partition table, OTA, SR models, etc.)
    const partitionFiles: Array<{ file: string; offset: string }> = flashConfig.partition_files ?? [];
    for (const pf of partitionFiles) {
      const pfPath = path.join(pluginDir, pf.file);
      if (fs.existsSync(pfPath)) {
        flashPairs.push(pf.offset, pfPath);
      } else {
        console.warn(`[esptool] partition file not found, skipping: ${pf.file}`);
      }
    }

    // Add the main firmware binary
    const offset = flashConfig.flash_offset ?? '0x0';
    flashPairs.push(offset, firmwarePath);

    // Generate SPIFFS image with runtime_config.json if spiffs config is present
    let spiffsTempDir: string | null = null;
    const spiffsConfig = flashConfig.spiffs;
    if (spiffsConfig && config) {
      onProgress('Building config partition...', 15);
      try {
        const spiffsResult = await this.generateSpiffsImage(pluginDir, config, spiffsConfig);
        if (spiffsResult) {
          flashPairs.push(spiffsConfig.offset, spiffsResult.imagePath);
          spiffsTempDir = spiffsResult.tempDir;
        }
      } catch (err) {
        console.warn('[esptool] SPIFFS generation failed, using pre-built storage.bin:', err);
        // Fall back to pre-built storage.bin (has placeholder config)
        const fallbackStorage = path.join(pluginDir, 'firmware', 'partitions', 'storage.bin');
        if (fs.existsSync(fallbackStorage)) {
          flashPairs.push(spiffsConfig.offset, fallbackStorage);
        }
      }
    }

    onProgress('Flashing firmware...', 20);

    // Build esptool args
    const chip = flashConfig.chip ?? 'esp32s3';
    const baudRate = String(flashConfig.baud_rate ?? 460800);

    const args = [
      ...resolved.prefix,
      '--chip', chip,
      '--port', port,
      '--baud', baudRate,
      'write_flash',
      ...(flashConfig.flash_mode ? ['--flash_mode', flashConfig.flash_mode] : []),
      ...(flashConfig.flash_size ? ['--flash_size', flashConfig.flash_size] : []),
      ...(flashConfig.flash_freq ? ['--flash_freq', flashConfig.flash_freq] : []),
      ...flashPairs,
    ];

    // Execute esptool via execFile (no shell)
    try {
      const result = await new Promise<FlashResult>((resolve) => {
        const child = execFile(
          resolved.cmd,
          args,
          { timeout: ESPTOOL_TIMEOUT_MS, env: safeEnv(), maxBuffer: 10 * 1024 * 1024 },
          (err, stdout, stderr) => {
            if (err) {
              // Check for timeout
              if ((err as NodeJS.ErrnoException & { killed?: boolean }).killed || err.message === 'Timed out') {
                resolve({
                  success: false,
                  message: 'Firmware flash timed out after 120 seconds',
                });
                return;
              }
              // Capture stderr for diagnostics
              const diagnostic = (stderr || '').trim() || (stdout || '').trim() || err.message;
              resolve({
                success: false,
                message: `esptool failed: ${diagnostic}`,
              });
              return;
            }

            // Check for success indicator in output
            const output = (stdout || '') + (stderr || '');
            if (output.includes('Hash of data verified') || output.includes('Leaving...')) {
              resolve({
                success: true,
                message: `Firmware flashed to ${port} successfully`,
              });
            } else {
              resolve({
                success: true,
                message: `Firmware flashed to ${port}`,
              });
            }
          },
        );

        // Parse progress from stdout/stderr in real time
        const onData = (data: Buffer | string) => {
          const text = typeof data === 'string' ? data : data.toString();
          const match = text.match(PROGRESS_RE);
          if (match) {
            const pct = parseInt(match[1], 10);
            const mappedPct = Math.round(20 + (pct / 100) * 70);
            onProgress(`Flashing firmware... ${pct}%`, mappedPct);
          }
        };
        child.stdout?.on('data', onData);
        child.stderr?.on('data', onData);
      });

      // Clean up SPIFFS temp directory
      if (spiffsTempDir) {
        try { fs.rmSync(spiffsTempDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }

      if (result.success) {
        onProgress('Flash complete!', 100);
      }
      return result;
    } catch (err: unknown) {
      if (spiffsTempDir) {
        try { fs.rmSync(spiffsTempDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `esptool error: ${message}`,
      };
    }
  }

  /**
   * Generate a SPIFFS image containing runtime_config.json.
   * Uses ESP-IDF's spiffsgen.py to create the image.
   */
  private async generateSpiffsImage(
    pluginDir: string,
    config: Record<string, unknown>,
    spiffsConfig: { size: string; page_size: number; obj_name_len: number; meta_len: number },
  ): Promise<{ imagePath: string; tempDir: string } | null> {
    // Create temp directory with runtime_config.json
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-spiffs-'));
    const spiffsSourceDir = path.join(tempDir, 'spiffs');
    fs.mkdirSync(spiffsSourceDir);
    fs.writeFileSync(
      path.join(spiffsSourceDir, 'runtime_config.json'),
      JSON.stringify(config, null, 2),
      'utf-8',
    );

    const outputImage = path.join(tempDir, 'storage.bin');
    const partitionSize = spiffsConfig.size;

    // Find spiffsgen.py: check IDF_PATH, then common install locations
    const spiffsgenPath = await this.findSpiffsgen();
    if (!spiffsgenPath) {
      // Fall back: copy pre-built storage.bin from the build
      const prebuilt = path.join(pluginDir, 'firmware', 'partitions', 'storage.bin');
      if (fs.existsSync(prebuilt)) {
        fs.copyFileSync(prebuilt, outputImage);
        console.warn('[esptool] spiffsgen.py not found, using pre-built storage.bin with placeholder config');
        return { imagePath: outputImage, tempDir };
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
      return null;
    }

    // Run spiffsgen.py to create the SPIFFS image
    const args = [
      spiffsgenPath,
      partitionSize,
      spiffsSourceDir,
      outputImage,
      '--page-size', String(spiffsConfig.page_size),
      '--obj-name-len', String(spiffsConfig.obj_name_len),
      '--meta-len', String(spiffsConfig.meta_len),
      '--use-magic',
      '--use-magic-len',
    ];

    await execFileAsync('python', args, { timeout: 15_000, env: safeEnv() });
    return { imagePath: outputImage, tempDir };
  }

  /** Find spiffsgen.py from ESP-IDF installation. */
  private async findSpiffsgen(): Promise<string | null> {
    // Check IDF_PATH environment variable
    const idfPath = process.env.IDF_PATH;
    if (idfPath) {
      const candidate = path.join(idfPath, 'components', 'spiffs', 'spiffsgen.py');
      if (fs.existsSync(candidate)) return candidate;
    }

    // Check common install locations
    const home = process.env.USERPROFILE || process.env.HOME || '';
    const candidates = [
      path.join(home, 'esp', 'esp-idf', 'components', 'spiffs', 'spiffsgen.py'),
      '/opt/esp-idf/components/spiffs/spiffsgen.py',
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }

    // Try running it as a module
    try {
      await execFileAsync('python', ['-c', 'import spiffsgen'], { timeout: 5000, env: safeEnv() });
      return '-m spiffsgen'; // Not a path, but a module invocation
    } catch { /* not available */ }

    return null;
  }
}

// ── Strategy Factory ────────────────────────────────────────────────────

/**
 * Select the appropriate FlashStrategy based on the manifest deploy method.
 */
export function selectFlashStrategy(
  method: string,
  hardwareService: HardwareService,
): FlashStrategy {
  switch (method) {
    case 'flash':
      return new MpremoteFlashStrategy(hardwareService);
    case 'esptool':
      return new EsptoolFlashStrategy(hardwareService);
    default:
      throw new Error(`Unknown flash method: ${method}`);
  }
}
