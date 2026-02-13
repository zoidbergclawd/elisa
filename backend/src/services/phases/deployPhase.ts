/** Deploy phase: handles hardware flash, portal deployment, and web preview. */

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import type { PhaseContext } from './types.js';
import { maybeTeach } from './types.js';
import { HardwareService } from '../hardwareService.js';
import { PortalService } from '../portalService.js';
import { TeachingEngine } from '../teachingEngine.js';

export class DeployPhase {
  private hardwareService: HardwareService;
  private portalService: PortalService;
  private teachingEngine: TeachingEngine;

  constructor(
    hardwareService: HardwareService,
    portalService: PortalService,
    teachingEngine: TeachingEngine,
  ) {
    this.hardwareService = hardwareService;
    this.portalService = portalService;
    this.teachingEngine = teachingEngine;
  }

  shouldDeployWeb(ctx: PhaseContext): boolean {
    const spec = ctx.session.spec ?? {};
    const target = spec.deployment?.target ?? 'preview';
    return target === 'web' || target === 'both';
  }

  async deployWeb(ctx: PhaseContext): Promise<{ process: ChildProcess | null; url: string | null }> {
    ctx.session.state = 'deploying';
    await ctx.send({ type: 'deploy_started', target: 'web' });

    // Surface before_deploy rules
    const specData = ctx.session.spec ?? {};
    const deployRules = (specData.rules ?? []).filter(
      (r: any) => r.trigger === 'before_deploy',
    );
    if (deployRules.length) {
      await ctx.send({
        type: 'deploy_checklist',
        rules: deployRules.map((r: any) => ({ name: r.name, prompt: r.prompt })),
      });
    }

    await ctx.send({ type: 'deploy_progress', step: 'Preparing web preview...', progress: 10 });

    // Run build if package.json has a build script
    const pkgPath = path.join(ctx.nuggetDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.scripts?.build) {
          await ctx.send({ type: 'deploy_progress', step: 'Running build...', progress: 30 });
          await new Promise<void>((resolve, reject) => {
            const isWin = process.platform === 'win32';
            const cmd = isWin ? 'npm.cmd' : 'npm';
            const buildProc = spawn(cmd, ['run', 'build'], {
              cwd: ctx.nuggetDir,
              stdio: 'pipe',
            });
            let stderr = '';
            buildProc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk; });
            buildProc.on('close', (code) => {
              if (code === 0) resolve();
              else reject(new Error(`Build failed (exit ${code}): ${stderr.slice(0, 500)}`));
            });
            buildProc.on('error', reject);
            setTimeout(() => { buildProc.kill(); reject(new Error('Build timed out')); }, 120_000);
          });
        }
      } catch (err: any) {
        await ctx.send({ type: 'deploy_progress', step: `Build warning: ${err.message}`, progress: 30 });
      }
    }

    // Find directory to serve: dist/ > build/ > public/ > src/ > .
    const candidates = ['dist', 'build', 'public', 'src', '.'];
    let serveDir = ctx.nuggetDir;
    for (const dir of candidates) {
      const full = dir === '.' ? ctx.nuggetDir : path.join(ctx.nuggetDir, dir);
      if (fs.existsSync(path.join(full, 'index.html'))) {
        serveDir = full;
        break;
      }
    }

    await ctx.send({ type: 'deploy_progress', step: 'Finding free port...', progress: 60 });
    const port = await DeployPhase.findFreePort(3000);

    await ctx.send({ type: 'deploy_progress', step: `Starting local server on port ${port}...`, progress: 80 });

    let serverProcess: ChildProcess | null = null;
    const url = `http://localhost:${port}`;
    const isWin = process.platform === 'win32';

    try {
      const npxCmd = isWin ? 'npx.cmd' : 'npx';
      serverProcess = spawn(npxCmd, ['serve', serveDir, '-l', String(port), '--no-clipboard'], {
        cwd: ctx.nuggetDir,
        stdio: 'pipe',
        detached: false,
      });

      // Wait for server to start or fail
      const started = await new Promise<boolean>((resolve) => {
        let resolved = false;
        serverProcess!.on('error', () => {
          if (!resolved) { resolved = true; resolve(false); }
        });
        serverProcess!.on('close', () => {
          if (!resolved) { resolved = true; resolve(false); }
        });
        setTimeout(() => {
          if (!resolved) { resolved = true; resolve(true); }
        }, 2000);
      });

      if (started) {
        // Open browser (best-effort, only hardcoded localhost URL)
        try {
          if (isWin) {
            execFile('cmd.exe', ['/c', 'start', '', url]);
          } else if (process.platform === 'darwin') {
            execFile('open', [url]);
          } else {
            execFile('xdg-open', [url]);
          }
        } catch {
          // Browser open is best-effort
        }
      } else {
        serverProcess = null;
      }
    } catch (err: any) {
      console.warn('Web preview server failed to start:', err.message);
      serverProcess = null;
    }

    await ctx.send({ type: 'deploy_complete', target: 'web', url });
    return { process: serverProcess, url };
  }

  private static findFreePort(startPort: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.listen(startPort, () => {
        const addr = server.address() as net.AddressInfo;
        server.close(() => resolve(addr.port));
      });
      server.on('error', () => {
        if (startPort < 65535) {
          resolve(DeployPhase.findFreePort(startPort + 1));
        } else {
          reject(new Error('No free port found'));
        }
      });
    });
  }

  shouldDeployHardware(ctx: PhaseContext): boolean {
    const spec = ctx.session.spec ?? {};
    const target = spec.deployment?.target ?? 'preview';
    return target === 'esp32' || target === 'both';
  }

  shouldDeployPortals(ctx: PhaseContext): boolean {
    const spec = ctx.session.spec ?? {};
    return Array.isArray(spec.portals) && spec.portals.length > 0;
  }

  async initializePortals(ctx: PhaseContext): Promise<void> {
    const spec = ctx.session.spec ?? {};
    const portalSpecs = spec.portals ?? [];
    try {
      await this.portalService.initializePortals(portalSpecs);
    } catch (err: any) {
      console.warn('Portal initialization warning:', err.message);
    }
  }

  async deployHardware(ctx: PhaseContext): Promise<{ serialHandle: { close: () => void } | null }> {
    ctx.session.state = 'deploying';
    await ctx.send({ type: 'deploy_started', target: 'esp32' });

    // Surface before_deploy rules to frontend as a checklist
    const specData = ctx.session.spec ?? {};
    const deployRules = (specData.rules ?? []).filter(
      (r: any) => r.trigger === 'before_deploy',
    );
    if (deployRules.length) {
      await ctx.send({
        type: 'deploy_checklist',
        rules: deployRules.map((r: any) => ({ name: r.name, prompt: r.prompt })),
      });
    }

    // Step 1: Compile
    await ctx.send({
      type: 'deploy_progress',
      step: 'Compiling MicroPython code...',
      progress: 25,
    });
    const compileResult = await this.hardwareService.compile(ctx.nuggetDir);
    await maybeTeach(this.teachingEngine, ctx, 'hardware_compile', '');

    if (!compileResult.success) {
      await ctx.send({
        type: 'deploy_progress',
        step: `Compile failed: ${compileResult.errors.join(', ')}`,
        progress: 25,
      });
      await ctx.send({
        type: 'error',
        message: `Compilation failed: ${compileResult.errors.join(', ')}`,
        recoverable: true,
      });
      return { serialHandle: null };
    }

    // Step 2: Flash
    await ctx.send({
      type: 'deploy_progress',
      step: 'Flashing to board...',
      progress: 60,
    });
    const flashResult = await this.hardwareService.flash(ctx.nuggetDir);
    await maybeTeach(this.teachingEngine, ctx, 'hardware_flash', '');

    if (!flashResult.success) {
      await ctx.send({
        type: 'deploy_progress',
        step: flashResult.message,
        progress: 60,
      });
      await ctx.send({
        type: 'error',
        message: flashResult.message,
        recoverable: true,
      });
      return { serialHandle: null };
    }

    // Step 3: Serial monitor
    await ctx.send({
      type: 'deploy_progress',
      step: 'Starting serial monitor...',
      progress: 90,
    });

    let serialHandle: { close: () => void } | null = null;
    const board = await this.hardwareService.detectBoard();
    if (board) {
      serialHandle = await this.hardwareService.startSerialMonitor(
        board.port,
        async (line: string) => {
          await ctx.send({
            type: 'serial_data',
            line,
            timestamp: new Date().toISOString(),
          });
        },
      );
    }

    await ctx.send({ type: 'deploy_complete', target: 'esp32' });
    return { serialHandle };
  }

  async deployPortals(ctx: PhaseContext): Promise<{ serialHandle: { close: () => void } | null }> {
    ctx.session.state = 'deploying';
    await ctx.send({ type: 'deploy_started', target: 'portals' });

    // Surface before_deploy rules to frontend as a checklist
    const specData = ctx.session.spec ?? {};
    const deployRules = (specData.rules ?? []).filter(
      (r: any) => r.trigger === 'before_deploy',
    );
    if (deployRules.length) {
      await ctx.send({
        type: 'deploy_checklist',
        rules: deployRules.map((r: any) => ({ name: r.name, prompt: r.prompt })),
      });
    }

    let serialHandle: { close: () => void } | null = null;

    // Deploy serial portals through existing hardware pipeline
    if (this.portalService.hasSerialPortals()) {
      await ctx.send({
        type: 'deploy_progress',
        step: 'Compiling code for serial portal...',
        progress: 25,
      });
      const compileResult = await this.hardwareService.compile(ctx.nuggetDir);

      if (!compileResult.success) {
        await ctx.send({
          type: 'deploy_progress',
          step: `Compile failed: ${compileResult.errors.join(', ')}`,
          progress: 25,
        });
        await ctx.send({
          type: 'error',
          message: `Compilation failed: ${compileResult.errors.join(', ')}`,
          recoverable: true,
        });
        return { serialHandle: null };
      }

      await ctx.send({
        type: 'deploy_progress',
        step: 'Flashing to board...',
        progress: 60,
      });
      const flashResult = await this.hardwareService.flash(ctx.nuggetDir);

      if (!flashResult.success) {
        await ctx.send({
          type: 'deploy_progress',
          step: flashResult.message,
          progress: 60,
        });
        await ctx.send({
          type: 'error',
          message: flashResult.message,
          recoverable: true,
        });
        return { serialHandle: null };
      }

      await ctx.send({
        type: 'deploy_progress',
        step: 'Starting serial monitor...',
        progress: 90,
      });

      const board = await this.hardwareService.detectBoard();
      if (board) {
        serialHandle = await this.hardwareService.startSerialMonitor(
          board.port,
          async (line: string) => {
            await ctx.send({
              type: 'serial_data',
              line,
              timestamp: new Date().toISOString(),
            });
          },
        );
      }
    }

    // Deploy CLI portals by executing their commands
    const cliPortals = this.portalService.getCliPortals();
    for (const { name, adapter } of cliPortals) {
      await ctx.send({
        type: 'deploy_progress',
        step: `Running CLI portal "${name}"...`,
        progress: 80,
      });

      const result = await adapter.execute(ctx.nuggetDir);

      if (result.stdout) {
        await ctx.send({
          type: 'deploy_progress',
          step: result.stdout.slice(0, 500),
          progress: 85,
        });
      }

      if (!result.success) {
        await ctx.send({
          type: 'error',
          message: `CLI portal "${name}" failed: ${result.stderr.slice(0, 500)}`,
          recoverable: true,
        });
      }
    }

    await maybeTeach(this.teachingEngine, ctx, 'portal_used', '');
    await ctx.send({ type: 'deploy_complete', target: 'portals' });
    return { serialHandle };
  }

  async teardown(): Promise<void> {
    await this.portalService.teardownAll();
  }

  getMcpServers(): any[] {
    return this.portalService.getMcpServers();
  }
}
