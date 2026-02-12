/**
 * Kill any process listening on the given port.
 * Usage: node scripts/kill-port.mjs [port]   (default: 8000)
 *
 * Cross-platform: works on Windows (netstat + taskkill) and Unix (lsof + kill).
 * Exits 0 even if nothing was found — safe to use as a pre-script.
 */
import { execFileSync } from 'node:child_process';
import { platform } from 'node:os';

const port = String(parseInt(process.argv[2] || '8000', 10));
const isWin = platform() === 'win32';

function getPids() {
  try {
    if (isWin) {
      const out = execFileSync('netstat', ['-ano'], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const pids = new Set();
      for (const line of out.split('\n')) {
        if (line.includes(`:${port}`) && line.includes('LISTENING')) {
          const pid = line.trim().split(/\s+/).pop();
          if (pid && pid !== '0') pids.add(pid);
        }
      }
      return [...pids];
    } else {
      const out = execFileSync('lsof', ['-ti', `:${port}`], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return out.trim().split('\n').filter(Boolean);
    }
  } catch {
    return [];
  }
}

const pids = getPids();

if (pids.length === 0) {
  console.log(`Port ${port} is free.`);
  process.exit(0);
}

for (const pid of pids) {
  try {
    if (isWin) {
      execFileSync('taskkill', ['/PID', pid, '/F'], { stdio: 'pipe' });
    } else {
      execFileSync('kill', ['-9', pid], { stdio: 'pipe' });
    }
    console.log(`Killed stale process ${pid} on port ${port}.`);
  } catch {
    // Process may have already exited — ignore.
  }
}
