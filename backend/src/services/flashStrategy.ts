/**
 * Flash strategy abstraction for device deployment.
 *
 * Defines a common interface for different flash mechanisms (mpremote, esptool)
 * so the deploy pipeline can dispatch to the correct strategy based on the
 * device manifest's deploy.method field.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { safeEnv } from '../utils/safeEnv.js';
import type { HardwareService } from './hardwareService.js';
import type { DeviceRegistry } from './deviceRegistry.js';
import { sanitizeReplacements, escapePythonString } from '../utils/sanitizePythonValue.js';

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
  /** Flash configuration from the device manifest */
  flashConfig: Record<string, any>;
  /** Lib files resolved from the device registry */
  flashFiles: { lib: string[]; shared: string[] };
  /** Progress callback */
  onProgress: (step: string, progress: number) => void;
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

/**
 * Flash strategy for binary firmware flash using esptool.
 * This is a STUB implementation. Actual esptool execution will be
 * implemented in task #13.
 */
export class EsptoolFlashStrategy implements FlashStrategy {
  readonly method = 'esptool';

  async checkPrerequisites(): Promise<{ available: boolean; message: string }> {
    try {
      await execFileAsync('esptool.py', ['version'], { timeout: 5000, env: safeEnv() });
      return { available: true, message: 'esptool.py is available' };
    } catch {
      // Also try the pip-installed name without .py
      try {
        await execFileAsync('esptool', ['version'], { timeout: 5000, env: safeEnv() });
        return { available: true, message: 'esptool is available' };
      } catch {
        return { available: false, message: 'esptool not found. Install it with: pip install esptool' };
      }
    }
  }

  async flash(params: FlashParams): Promise<FlashResult> {
    const { pluginDir, flashConfig, onProgress } = params;

    // Validate that the firmware file exists in the plugin directory
    const firmwarePath = path.join(pluginDir, flashConfig.firmware_file);
    if (!fs.existsSync(firmwarePath)) {
      return {
        success: false,
        message: `Firmware file not found: ${flashConfig.firmware_file}`,
      };
    }

    onProgress('Preparing firmware flash...', 10);

    // STUB: Log what we would do. Real implementation in task #13.
    const chip = flashConfig.chip ?? 'esp32s3';
    const offset = flashConfig.flash_offset ?? '0x0';
    const baudRate = flashConfig.baud_rate ?? 460800;

    console.log(`[esptool-stub] Would flash ${firmwarePath} to ${chip} at offset ${offset} baud ${baudRate}`);

    onProgress('esptool flash not yet implemented (stub)', 100);

    return {
      success: false,
      message: 'esptool flash is a stub — real implementation pending (task #13)',
    };
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
      return new EsptoolFlashStrategy();
    default:
      throw new Error(`Unknown flash method: ${method}`);
  }
}
