/** Manages ESP32 compilation and flashing via native serialport. */

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { CompileResult, FlashResult, BoardInfo } from '../models/session.js';
import { safeEnv } from '../utils/safeEnv.js';
import { withTimeout } from '../utils/withTimeout.js';

const execFileAsync = promisify(execFile);

/** Resolve the full path to mpremote, checking PATH then common install locations. */
function findMpremote(): string {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const candidates = [
    path.join(home, 'AppData', 'Roaming', 'Python', 'Python314', 'Scripts', 'mpremote.exe'),
    path.join(home, 'AppData', 'Roaming', 'Python', 'Python313', 'Scripts', 'mpremote.exe'),
    path.join(home, 'AppData', 'Roaming', 'Python', 'Python312', 'Scripts', 'mpremote.exe'),
    path.join(home, 'AppData', 'Roaming', 'Python', 'Python311', 'Scripts', 'mpremote.exe'),
    path.join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python314', 'Scripts', 'mpremote.exe'),
    path.join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'Scripts', 'mpremote.exe'),
    path.join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'Scripts', 'mpremote.exe'),
    path.join(home, '.local', 'bin', 'mpremote'),
    '/usr/local/bin/mpremote',
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'mpremote';
}

const KNOWN_BOARDS: Map<string, string> = new Map([
  ['10C4:EA60', 'Heltec WiFi LoRa 32 V3 (CP210x)'],
  ['303A:1001', 'ESP32-S3 Native USB'],
  ['303A:4001', 'ESP32-S3 Native USB'],
  ['1A86:55D4', 'ESP32 (CH9102)'],
]);

// VID 303A = Espressif -- any PID under this VID is likely an ESP32 with native USB CDC.
// PIDs vary by firmware version and board manufacturer.
const ESPRESSIF_VID = '303A';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export class HardwareService {
  private flashMutex = Promise.resolve();

  async compile(workDir: string): Promise<CompileResult> {
    const errors: string[] = [];
    const pyFiles = collectPyFiles(workDir);

    if (pyFiles.length === 0) {
      return { success: false, errors: ['No Python files found'], outputPath: '' };
    }

    for (const filepath of pyFiles) {
      try {
        await execFileAsync('python', ['-m', 'py_compile', filepath], { env: safeEnv() });
      } catch (err: any) {
        const stderr = (err.stderr || '').trim();
        const msg = stderr || err.message;
        console.log(`[elisa] py_compile failed for ${path.basename(filepath)}: ${msg}`);
        // Only count actual syntax errors (py_compile outputs "SyntaxError" or "Error")
        // Skip generic "Command failed" which means python itself had issues
        if (stderr && (stderr.includes('SyntaxError') || stderr.includes('Error'))) {
          errors.push(`${path.basename(filepath)}: ${stderr}`);
        }
      }
    }

    return {
      success: errors.length === 0,
      errors,
      outputPath: workDir,
    };
  }

  async flash(workDir: string, port?: string): Promise<FlashResult> {
    let resolve: () => void;
    const previous = this.flashMutex;
    this.flashMutex = new Promise<void>(r => { resolve = r; });
    await previous;
    try {
      return await this._flashImpl(workDir, port);
    } finally {
      resolve!();
    }
  }

  private async _flashImpl(workDir: string, port?: string): Promise<FlashResult> {
    let boardType = '';
    if (!port) {
      const board = await this.detectBoard();
      if (!board) {
        return {
          success: false,
          message: 'No ESP32 board detected. Connect your board via USB and try again.',
        };
      }
      port = board.port;
      boardType = board.boardType;
    }

    const pyFiles = collectPyFiles(workDir);
    if (pyFiles.length === 0) {
      return { success: false, message: 'No Python files to flash' };
    }

    // Try pyserial paste mode first (works for all MicroPython boards).
    // Retry up to 3 times with 500ms delay -- the COM port may appear
    // before USB CDC is fully ready after board reset.
    let serialResult: FlashResult = { success: false, message: 'No attempts' };
    for (let attempt = 1; attempt <= 3; attempt++) {
      serialResult = await this.flashViaSerial(port, pyFiles);
      if (serialResult.success) return serialResult;
      if (attempt < 3) {
        console.log(`[elisa] Serial flash attempt ${attempt} failed, retrying in 500ms...`);
        await sleep(500);
      }
    }

    // Fall back to mpremote for boards where serial paste mode failed
    // (mpremote uses raw REPL which doesn't work on ESP32-S3 native USB,
    // but may work better for CP210x/CH9102 boards)
    console.log(`[elisa] Serial flash failed (${serialResult.message}), trying mpremote...`);
    const mpremoteResult = await this.flashViaMpremote(workDir, port, pyFiles);
    if (mpremoteResult.success) {
      return mpremoteResult;
    }

    return {
      success: false,
      message: `Serial: ${serialResult.message} | mpremote: ${mpremoteResult.message}`,
    };
  }

  private async flashViaMpremote(
    workDir: string,
    port: string,
    pyFiles: string[],
  ): Promise<FlashResult> {
    const cpArgs: string[] = [];
    for (const f of pyFiles) {
      cpArgs.push(f, `:/${path.basename(f)}`);
    }

    const mpremote = findMpremote();
    const cmd = [mpremote, 'connect', port, 'cp', ...cpArgs];

    const mainPyCandidates = [
      path.join(workDir, 'main.py'),
      path.join(workDir, 'src', 'main.py'),
    ];
    const mainPy = mainPyCandidates.find((p) => fs.existsSync(p));
    if (mainPy) {
      cmd.push('+', 'run', mainPy);
    }

    try {
      let childProc: import('node:child_process').ChildProcess | undefined;
      const execPromise = new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        childProc = execFile(cmd[0], cmd.slice(1), { env: safeEnv() }, (err, stdout, stderr) => {
          if (err) {
            if (stdout != null) (err as any).stdout = stdout;
            if (stderr != null) (err as any).stderr = stderr;
            reject(err);
          } else {
            resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
          }
        });
      });
      await withTimeout(
        execPromise,
        60_000,
        { childProcess: childProc },
      );
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

  /**
   * Flash files to MicroPython board via pyserial paste mode.
   *
   * Node.js serialport cannot write to ESP32-S3 native USB CDC on Windows
   * (ERROR_GEN_FAILURE 31). Pyserial CAN write with write_timeout=0
   * (non-blocking overlapped I/O). However, pyserial's read() and in_waiting
   * break because ClearCommError is unsupported on this device (error 22).
   *
   * Solution: Generate a Python script that monkey-patches pyserial to handle
   * these quirks, then uses paste mode (Ctrl+E) to write files to the board.
   */
  private async flashViaSerial(port: string, pyFiles: string[]): Promise<FlashResult> {
    const files = pyFiles.map(f => ({
      dest: path.basename(f),
      content: fs.readFileSync(f, 'utf-8'),
    }));

    const tmpDir = process.env.TEMP || process.env.TMP || '/tmp';
    const tempName = `elisa-flash-${randomUUID()}`;
    const scriptPath = path.join(tmpDir, `${tempName}.py`);
    const manifestPath = path.join(tmpDir, `${tempName}.json`);

    fs.writeFileSync(manifestPath, JSON.stringify(files), 'utf-8');

    // The Python script monkey-patches pyserial for ESP32-S3 native USB CDC:
    // - write_timeout=0: non-blocking overlapped writes that USB CDC accepts
    // - No dsrdtr/rtscts: USB CDC devices choke on SetCommState with DTR/DSR flags
    // - Patched read(): catches ClearCommError and does raw overlapped ReadFile
    // - Patched in_waiting: catches ClearCommError and returns 0
    // - Bulk writes with chunking (512 bytes) for large payloads
    const pyScript = `
import serial
import serial.serialwin32
import serial.win32 as win32
import ctypes
import ctypes.wintypes as wt
import time
import json
import sys
import platform

port = sys.argv[1]
manifest_path = sys.argv[2]

with open(manifest_path, 'r', encoding='utf-8') as mf:
    files = json.load(mf)

# ----- Monkey-patch pyserial for ESP32 USB serial (Windows only) -----
# Patches: _reconfigure_port (SetCommState), read (ClearCommError), in_waiting
if platform.system() == 'Windows':
    # Patch _reconfigure_port: SetCommState fails (error 31) on USB virtual serial
    # ports because baud rate / flow control are meaningless for USB. Swallow the
    # error -- the port is still usable for overlapped I/O.
    _orig_reconfigure = serial.serialwin32.Serial._reconfigure_port
    def _patched_reconfigure(self):
        try:
            _orig_reconfigure(self)
        except serial.SerialException as e:
            if 'Cannot configure port' in str(e):
                print(f'WARNING: SetCommState failed (expected for USB serial): {e}')
                # Still need to set timeouts even if SetCommState failed
                try:
                    timeouts = serial.win32.COMMTIMEOUTS()
                    if self._timeout is None:
                        pass  # no timeout
                    elif self._timeout == 0:
                        timeouts.ReadIntervalTimeout = win32.MAXDWORD
                    else:
                        total_ms = max(int(self._timeout * 1000), 1)
                        timeouts.ReadTotalTimeoutConstant = total_ms
                    win32.SetCommTimeouts(self._port_handle, ctypes.byref(timeouts))
                except Exception:
                    pass
            else:
                raise
    serial.serialwin32.Serial._reconfigure_port = _patched_reconfigure

    _orig_read = serial.serialwin32.Serial.read
    def _patched_read(self, size=1):
        try:
            return _orig_read(self, size)
        except serial.SerialException as e:
            if 'ClearCommError' in str(e):
                # ClearCommError unsupported on native USB CDC -- raw overlapped ReadFile
                buf = ctypes.create_string_buffer(size)
                rc = wt.DWORD()
                olap = self._overlapped_read
                ok = win32.ReadFile(self._port_handle, buf, size,
                                    ctypes.byref(rc), ctypes.byref(olap))
                if ok:
                    return buf.raw[:rc.value]
                err = win32.GetLastError()
                if err == win32.ERROR_IO_PENDING:
                    timeout_ms = int((self._timeout or 2) * 1000)
                    ret = win32.WaitForSingleObject(olap.hEvent, timeout_ms)
                    if ret == 258:  # WAIT_TIMEOUT
                        win32.CancelIoEx(self._port_handle, ctypes.byref(olap))
                        return b''
                    win32.GetOverlappedResult(self._port_handle,
                                              ctypes.byref(olap),
                                              ctypes.byref(rc), True)
                    return buf.raw[:rc.value]
                return b''
            raise
    serial.serialwin32.Serial.read = _patched_read

    _orig_in_waiting = serial.serialwin32.Serial.in_waiting.fget
    def _patched_in_waiting(self):
        try:
            return _orig_in_waiting(self)
        except serial.SerialException:
            return 0
    serial.serialwin32.Serial.in_waiting = property(_patched_in_waiting)

CHUNK_SIZE = 512  # USB CDC endpoint buffer is 64-512 bytes

def chunked_write(ser, data):
    """Write data in chunks to avoid overflowing USB CDC buffer."""
    payload = data if isinstance(data, bytes) else data.encode()
    for i in range(0, len(payload), CHUNK_SIZE):
        ser.write(payload[i:i+CHUNK_SIZE])
        if i + CHUNK_SIZE < len(payload):
            time.sleep(0.02)  # 20ms between chunks

# ----- Helpers -----
def read_response(ser, timeout=3):
    """Read all available data until silence for 0.3s or total timeout."""
    data = b''
    deadline = time.time() + timeout
    last_data = time.time()
    while time.time() < deadline:
        chunk = ser.read(256)
        if chunk:
            data += chunk
            last_data = time.time()
        elif data and (time.time() - last_data) > 0.3:
            break
        time.sleep(0.02)
    return data

def read_until(ser, match, timeout=3):
    """Read until match string found or timeout."""
    data = b''
    deadline = time.time() + timeout
    while time.time() < deadline:
        chunk = ser.read(256)
        if chunk:
            data += chunk
            if match.encode() in data:
                return data
        time.sleep(0.02)
    return data

# ----- Main -----
print(f'Opening {port}...')
sys.stdout.flush()
ser = serial.Serial()
ser.port = port
ser.baudrate = 115200
ser.timeout = 1
ser.write_timeout = 0
ser.open()
time.sleep(1)

# Interrupt any running program
print('Sending Ctrl+C...')
sys.stdout.flush()
ser.write(b'\\x03')
time.sleep(0.3)
ser.write(b'\\x03')
time.sleep(0.5)

# Read and check for REPL prompt
resp = read_response(ser, timeout=2)
resp_str = resp.decode('utf-8', errors='replace')
print(f'After Ctrl+C: {resp_str[:100].replace(chr(10), " ")}')
sys.stdout.flush()

# Send newline to get prompt
ser.write(b'\\r\\n')
prompt = read_until(ser, '>>>', timeout=3)
prompt_str = prompt.decode('utf-8', errors='replace')

if '>>>' not in prompt_str:
    print(f'ERROR: No MicroPython REPL. Got: {prompt_str[:100]}', file=sys.stderr)
    sys.stderr.flush()
    ser.close()
    sys.exit(1)

print('MicroPython REPL confirmed')

for f in files:
    dest = f['dest']
    content = f['content']

    # Enter paste mode (Ctrl+E)
    ser.write(b'\\x05')
    banner = read_until(ser, 'paste mode', timeout=3)
    banner_str = banner.decode('utf-8', errors='replace')

    if 'paste mode' not in banner_str:
        # Retry once
        ser.write(b'\\x05')
        banner = read_until(ser, 'paste mode', timeout=3)
        banner_str = banner.decode('utf-8', errors='replace')
        if 'paste mode' not in banner_str:
            print(f'ERROR: Failed to enter paste mode for {dest}', file=sys.stderr)
            ser.close()
            sys.exit(1)

    # Build file-write code using hex encoding for safe transfer
    hex_content = content.encode('utf-8').hex()
    code_lines = [
        'import binascii',
        f"f=open('{dest}','wb')",
        f"f.write(binascii.unhexlify('{hex_content}'))",
        'f.close()',
        f"print('OK:{dest}')",
    ]
    code = '\\r\\n'.join(code_lines) + '\\r\\n'

    # Chunked write for large payloads (USB CDC buffer is 64-512 bytes)
    chunked_write(ser, code.encode())
    time.sleep(0.2)

    # Execute with Ctrl+D
    ser.write(b'\\x04')
    resp = read_until(ser, f'OK:{dest}', timeout=5)
    resp_str = resp.decode('utf-8', errors='replace')

    if f'OK:{dest}' in resp_str:
        print(f'WROTE:{dest}')
    elif 'Error' in resp_str or 'Traceback' in resp_str:
        print(f'ERROR:{dest}:{resp_str[:200]}', file=sys.stderr)
        ser.close()
        sys.exit(1)
    else:
        print(f'SENT:{dest} (no confirmation)')

# Don't soft-reset or open a serial monitor after flash.  The ESP-IDF USB
# CDC driver tracks whether a host has connected; before any host opens the
# port, print() is non-blocking (data dropped).  Once a host opens and
# closes the port, print() switches to blocking mode and will hang when the
# TX buffer fills with no reader.  By closing immediately, the board stays
# in the "no host" state after the user presses RST, keeping print()
# non-blocking and the board responsive for the next flash.
ser.close()
print('FLASH_OK')
`;

    fs.writeFileSync(scriptPath, pyScript, 'utf-8');

    try {
      const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        execFile('python', [scriptPath, port, manifestPath], { timeout: 60_000, env: safeEnv() }, (err, stdout, stderr) => {
          if (err) {
            (err as any).stdout = stdout;
            (err as any).stderr = stderr;
            reject(err);
          } else {
            resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
          }
        });
      });

      console.log(`[elisa] flash stdout: ${result.stdout.trim()}`);
      if (result.stderr) console.log(`[elisa] flash stderr: ${result.stderr.trim()}`);

      if (result.stdout.includes('FLASH_OK')) {
        return {
          success: true,
          message: `Flashed ${pyFiles.length} file(s) to ${port} via serial paste mode`,
        };
      }
      return {
        success: false,
        message: `Flash script finished without confirmation: ${result.stdout.trim().substring(0, 200)}`,
      };
    } catch (err: any) {
      const stderr = err.stderr?.trim() || '';
      const stdout = err.stdout?.trim() || '';
      console.log(`[elisa] flash failed stdout: ${stdout}`);
      console.log(`[elisa] flash failed stderr: ${stderr}`);
      return {
        success: false,
        message: `Serial paste mode failed: ${stderr || stdout || err.message}`,
      };
    } finally {
      try { fs.unlinkSync(scriptPath); } catch { /* ignore */ }
      try { fs.unlinkSync(manifestPath); } catch { /* ignore */ }
    }
  }

  /**
   * Fast board detection using only USB VID:PID matching.
   * Never opens a serial port -- safe for repeated polling.
   */
  async detectBoardFast(): Promise<BoardInfo | null> {
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
            return { port: portInfo.path, boardType, vendorId: vid, productId: pid };
          }
          if (vid === ESPRESSIF_VID) {
            return { port: portInfo.path, boardType: 'ESP32 Native USB', vendorId: vid, productId: pid };
          }
        }
      }
    } catch (err: any) {
      console.error(`[elisa] detectBoardFast error: ${err.message}`);
    }
    return null;
  }

  /**
   * Detect a connected MicroPython board.
   * First checks USB VID:PID against known boards (fast), then probes serial
   * ports for a MicroPython REPL prompt (>>>) as a fallback for unknown boards.
   */
  async detectBoard(): Promise<BoardInfo | null> {
    // Phase 1: fast VID:PID matching
    const fast = await this.detectBoardFast();
    if (fast) return fast;

    try {
      const { SerialPort } = await import('serialport');
      const ports = await SerialPort.list();

      // Phase 2: REPL probe -- open each serial port, send Ctrl+C, look for >>>
      for (const portInfo of ports) {
        // Skip ports that are clearly not microcontrollers
        if (!portInfo.vendorId) continue;
        console.log(`[elisa] detectBoard: probing ${portInfo.path} for MicroPython REPL...`);
        const result = await this.probeForRepl(portInfo.path);
        if (result) {
          console.log(`[elisa] detectBoard: found MicroPython REPL on ${portInfo.path}`);
          return { port: portInfo.path, boardType: 'MicroPython Board' };
        }
      }
    } catch (err: any) {
      console.error(`[elisa] detectBoard error: ${err.message}`);
    }
    return null;
  }

  /**
   * Probe a serial port for a MicroPython REPL by sending Ctrl+C and
   * checking if the response contains '>>>'.
   */
  private async probeForRepl(portPath: string): Promise<boolean> {
    const { SerialPort } = await import('serialport');
    let sp: InstanceType<typeof SerialPort> | null = null;

    try {
      sp = new SerialPort({ path: portPath, baudRate: 115200 });
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('open timeout')), 3000);
        sp!.on('open', () => { clearTimeout(timer); resolve(); });
        sp!.on('error', (e) => { clearTimeout(timer); reject(e); });
      });

      // Collect any data that arrives
      let received = '';
      sp.on('data', (chunk: Buffer) => {
        received += chunk.toString('utf-8');
      });

      // Send Ctrl+C twice to interrupt any running program
      sp.write(Buffer.from([0x03]));
      await sleep(300);
      sp.write(Buffer.from([0x03]));

      // Wait for response
      await sleep(1500);

      await new Promise<void>((resolve) => {
        sp!.close((err) => {
          if (err) console.warn('Port close warning:', err.message);
          resolve();
        });
      });
      return received.includes('>>>');
    } catch {
      try {
        await new Promise<void>((resolve) => {
          sp?.close((err) => {
            if (err) console.warn('Port close warning:', err.message);
            resolve();
          });
        });
      } catch { /* ignore */ }
      return false;
    }
  }

  /**
   * Flash specific files to a MicroPython board via mpremote cp.
   * Unlike flash() which copies all .py files and runs main.py,
   * this method copies only the specified files (used for IoT multi-device deploys).
   */
  async flashFiles(workDir: string, files: string[]): Promise<{ success: boolean; message?: string }> {
    if (files.length === 0) return { success: true };
    const mpremote = findMpremote();
    const missing: string[] = [];
    let flashed = 0;
    for (const file of files) {
      const filePath = path.join(workDir, file);
      if (!fs.existsSync(filePath)) {
        missing.push(file);
        continue;
      }
      try {
        await execFileAsync(mpremote, ['cp', filePath, `:${file}`], { timeout: 30000 });
        flashed++;
      } catch (err: any) {
        return { success: false, message: `Failed to flash ${file}: ${err.message}` };
      }
    }
    if (flashed === 0) {
      return { success: false, message: `No files found to flash (missing: ${missing.join(', ')})` };
    }
    if (missing.length > 0) {
      return { success: true, message: `Flashed ${flashed} file(s); skipped missing: ${missing.join(', ')}` };
    }
    return { success: true };
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
