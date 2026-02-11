/** Manages ESP32 compilation and flashing. */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { CompileResult, FlashResult, BoardInfo } from '../models/session.js';

const execFileAsync = promisify(execFile);

const KNOWN_BOARDS: Map<string, string> = new Map([
  ['10C4:EA60', 'Heltec WiFi LoRa 32 V3 (CP210x)'],
  ['303A:1001', 'ESP32-S3 Native USB'],
  ['1A86:55D4', 'ESP32 (CH9102)'],
]);

export class HardwareService {
  async compile(workDir: string): Promise<CompileResult> {
    const errors: string[] = [];
    const pyFiles = collectPyFiles(workDir);

    if (pyFiles.length === 0) {
      return { success: false, errors: ['No Python files found'], outputPath: '' };
    }

    for (const filepath of pyFiles) {
      try {
        await execFileAsync('python', ['-m', 'py_compile', filepath]);
      } catch (err: any) {
        errors.push(`${path.basename(filepath)}: ${err.stderr || err.message}`);
      }
    }

    return {
      success: errors.length === 0,
      errors,
      outputPath: workDir,
    };
  }

  async flash(workDir: string, port?: string): Promise<FlashResult> {
    if (!port) {
      const board = await this.detectBoard();
      if (!board) {
        return {
          success: false,
          message: 'No ESP32 board detected. Connect your board via USB and try again.',
        };
      }
      port = board.port;
    }

    const pyFiles = collectPyFiles(workDir);
    if (pyFiles.length === 0) {
      return { success: false, message: 'No Python files to flash' };
    }

    const cpArgs: string[] = [];
    for (const f of pyFiles) {
      cpArgs.push(f, `:/${path.basename(f)}`);
    }

    const cmd = ['mpremote', 'connect', port, 'cp', ...cpArgs];

    const mainPy = path.join(workDir, 'main.py');
    if (fs.existsSync(mainPy)) {
      cmd.push('+', 'run', mainPy);
    }

    try {
      const { stderr } = await withTimeout(
        execFileAsync(cmd[0], cmd.slice(1)),
        60_000,
      );
      // If we get here without error, it succeeded
      return {
        success: true,
        message: `Flashed ${pyFiles.length} file(s) to ${port}`,
      };
    } catch (err: any) {
      if (err.message === 'Timed out') {
        return { success: false, message: 'Flash timed out after 60 seconds' };
      }
      if (err.code === 'ENOENT') {
        return { success: false, message: 'mpremote not found. Install it with: pip install mpremote' };
      }
      const errorMsg = err.stderr?.trim() || 'Unknown error';
      return { success: false, message: `Flash failed: ${errorMsg}` };
    }
  }

  async detectBoard(): Promise<BoardInfo | null> {
    try {
      const { SerialPort } = await import('serialport');
      const ports = await SerialPort.list();
      for (const portInfo of ports) {
        const vid = portInfo.vendorId?.toUpperCase();
        const pid = portInfo.productId?.toUpperCase();
        if (vid && pid) {
          const key = `${vid}:${pid}`;
          const boardType = KNOWN_BOARDS.get(key);
          if (boardType) {
            return { port: portInfo.path, boardType };
          }
        }
      }
    } catch {
      // serialport not available
    }
    return null;
  }

  async startSerialMonitor(
    port: string,
    callback: (line: string) => Promise<void>,
  ): Promise<{ close: () => void }> {
    try {
      const { SerialPort } = await import('serialport');
      const { ReadlineParser } = await import('@serialport/parser-readline');
      const serialPort = new SerialPort({ path: port, baudRate: 115200 });
      const parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

      parser.on('data', (line: string) => {
        callback(line.trim()).catch(() => {});
      });

      serialPort.on('error', (err: Error) => {
        callback(`[Error] ${err.message}`).catch(() => {});
      });

      return {
        close: () => {
          try { serialPort.close(); } catch { /* ignore */ }
        },
      };
    } catch (err: any) {
      await callback(`[Error] Could not open serial port: ${err.message}`);
      return { close: () => {} };
    }
  }
}

function collectPyFiles(workDir: string): string[] {
  const pyFiles: string[] = [];

  function walk(dir: string): void {
    let items: string[];
    try {
      items = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const item of items) {
      const full = path.join(dir, item);
      if (item.startsWith('.') || item === '__pycache__') continue;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full);
      } else if (item.endsWith('.py')) {
        pyFiles.push(full);
      }
    }
  }

  walk(workDir);
  return pyFiles;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out')), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}
