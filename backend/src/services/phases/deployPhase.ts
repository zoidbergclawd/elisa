/** Deploy phase: handles hardware flash, portal deployment, and web preview. */

import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { safeEnv } from '../../utils/safeEnv.js';
import { BUILD_TIMEOUT_MS } from '../../utils/constants.js';
import { findFreePort } from '../../utils/findFreePort.js';
import type { PhaseContext } from './types.js';
import { maybeTeach } from './types.js';
import { HardwareService } from '../hardwareService.js';
import { PortalService } from '../portalService.js';
import { TeachingEngine } from '../teachingEngine.js';
import type { DeviceRegistry } from '../deviceRegistry.js';
import { resolveDeployOrder } from './deployOrder.js';

export class DeployPhase {
  private hardwareService: HardwareService;
  private portalService: PortalService;
  private teachingEngine: TeachingEngine;
  private deviceRegistry?: DeviceRegistry;

  constructor(
    hardwareService: HardwareService,
    portalService: PortalService,
    teachingEngine: TeachingEngine,
    deviceRegistry?: DeviceRegistry,
  ) {
    this.hardwareService = hardwareService;
    this.portalService = portalService;
    this.teachingEngine = teachingEngine;
    this.deviceRegistry = deviceRegistry;
  }

  shouldDeployDevices(ctx: PhaseContext): boolean {
    const spec = ctx.session.spec ?? {};
    const devices = spec.devices;
    return Array.isArray(devices) && devices.length > 0;
  }

  async deployDevices(
    ctx: PhaseContext,
    gateResolver: { current: ((value: Record<string, any>) => void) | null },
  ): Promise<void> {
    const spec = ctx.session.spec ?? {};
    const devices = spec.devices ?? [];
    if (!devices.length || !this.deviceRegistry) return;

    ctx.session.state = 'deploying';
    await ctx.send({ type: 'deploy_started', target: 'devices' });

    // Build manifest lookup
    const manifests = new Map<string, any>();
    for (const device of devices) {
      const manifest = this.deviceRegistry.getDevice(device.pluginId);
      if (manifest) manifests.set(device.pluginId, manifest);
    }

    // Resolve deploy order using provides/requires DAG
    const order = resolveDeployOrder(devices, manifests as any);
    const outputs: Record<string, string> = {};

    for (const device of order) {
      const manifest = manifests.get(device.pluginId);
      if (!manifest) continue;

      if (manifest.deploy.method === 'cloud') {
        // Cloud deploy
        try {
          const { CloudDeployService } = await import('../cloudDeployService.js');
          const cloudService = new CloudDeployService();
          const scaffoldDir = this.deviceRegistry!.getScaffoldDir(device.pluginId);
          const project = device.fields?.GCP_PROJECT ?? 'elisa-iot';
          const region = device.fields?.GCP_REGION ?? 'us-central1';

          await ctx.send({ type: 'deploy_started', target: device.pluginId });
          const result = await cloudService.deploy(
            scaffoldDir ?? ctx.nuggetDir,
            String(project),
            String(region),
          );
          // Map result keys to provides keys (result uses url/apiKey, provides use cloud_url/api_key)
          const resultMap: Record<string, string> = {};
          if (result.url) { resultMap['cloud_url'] = result.url; resultMap['DASHBOARD_URL'] = result.url; }
          if (result.apiKey) { resultMap['api_key'] = result.apiKey; resultMap['API_KEY'] = result.apiKey; }
          for (const key of manifest.deploy.provides) {
            if (resultMap[key]) outputs[key] = resultMap[key];
          }
          await ctx.send({ type: 'deploy_complete', target: device.pluginId, url: result.url });
        } catch (err: any) {
          await ctx.send({
            type: 'error',
            message: `Cloud deploy failed for ${manifest.name}: ${err.message}`,
            recoverable: true,
          });
          await ctx.send({ type: 'deploy_complete', target: device.pluginId });
        }
      } else if (manifest.deploy.method === 'flash') {
        // Flash deploy with user prompt
        const flashConfig = manifest.deploy.flash;

        // Set up gate promise BEFORE sending prompt
        const gatePromise = new Promise<void>((resolve) => {
          gateResolver.current = () => { resolve(); };
        });

        await ctx.send({
          type: 'flash_prompt',
          device_role: device.pluginId,
          message: flashConfig.prompt_message,
        });

        await gatePromise;

        await ctx.send({
          type: 'flash_progress',
          device_role: device.pluginId,
          step: 'Preparing files...',
          progress: 10,
        });

        // Collect required values from upstream device outputs
        const injections: Record<string, string> = {};
        for (const key of manifest.deploy.requires) {
          if (outputs[key]) injections[key] = outputs[key];
        }

        // Copy lib and shared files from plugin directory into workspace
        const flashFileInfo = this.deviceRegistry!.getFlashFiles(device.pluginId);
        for (const libFile of flashFileInfo.lib) {
          const dest = path.join(ctx.nuggetDir, path.basename(libFile));
          if (fs.existsSync(libFile)) fs.copyFileSync(libFile, dest);
        }
        for (const sharedFile of flashFileInfo.shared) {
          const dest = path.join(ctx.nuggetDir, path.basename(sharedFile));
          if (fs.existsSync(sharedFile)) fs.copyFileSync(sharedFile, dest);
        }

        // Write injected config values (e.g., cloud_url, api_key) as config.py
        if (Object.keys(injections).length > 0) {
          const configLines = Object.entries(injections)
            .map(([k, v]) => `${k.toUpperCase()} = "${v}"`);
          fs.writeFileSync(
            path.join(ctx.nuggetDir, 'config.py'),
            configLines.join('\n') + '\n',
            'utf-8',
          );
        }

        // Build list of files to flash
        const filesToFlash = [
          ...flashConfig.files,
          ...flashFileInfo.lib.map((f: string) => path.basename(f)),
          ...flashFileInfo.shared.map((f: string) => path.basename(f)),
        ];
        // Include config.py if we wrote one
        if (Object.keys(injections).length > 0) {
          filesToFlash.push('config.py');
        }

        await ctx.send({
          type: 'flash_progress',
          device_role: device.pluginId,
          step: `Flashing ${filesToFlash.length} files...`,
          progress: 30,
        });

        try {
          const flashResult = await this.hardwareService.flashFiles(ctx.nuggetDir, filesToFlash);
          await ctx.send({
            type: 'flash_complete',
            device_role: device.pluginId,
            success: flashResult.success,
            message: flashResult.success
              ? `${manifest.name} flashed successfully`
              : (flashResult.message ?? 'Flash failed'),
          });
        } catch (err: any) {
          await ctx.send({
            type: 'flash_complete',
            device_role: device.pluginId,
            success: false,
            message: err.message,
          });
        }
      }
    }
  }

  private async sendDeployChecklist(ctx: PhaseContext): Promise<void> {
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
  }

  shouldDeployWeb(ctx: PhaseContext): boolean {
    const spec = ctx.session.spec ?? {};
    const target = spec.deployment?.target ?? 'preview';
    return target === 'web' || target === 'both' || target === 'preview';
  }

  async deployWeb(ctx: PhaseContext): Promise<{ process: ChildProcess | null; url: string | null }> {
    ctx.session.state = 'deploying';
    await ctx.send({ type: 'deploy_started', target: 'web' });

    await this.sendDeployChecklist(ctx);

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
            const buildProc = spawn('npm', ['run', 'build'], {
              cwd: ctx.nuggetDir,
              stdio: 'pipe',
              shell: isWin,
              env: safeEnv(),
            });
            let stderr = '';
            buildProc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk; });
            buildProc.on('close', (code) => {
              if (code === 0) resolve();
              else reject(new Error(`Build failed (exit ${code}): ${stderr.slice(0, 500)}`));
            });
            buildProc.on('error', reject);
            setTimeout(() => { buildProc.kill(); reject(new Error('Build timed out')); }, BUILD_TIMEOUT_MS);
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
    const port = await findFreePort(3000);

    await ctx.send({ type: 'deploy_progress', step: `Starting local server on port ${port}...`, progress: 80 });

    let serverProcess: ChildProcess | null = null;
    let finalUrl: string | null = null;
    const fallbackUrl = `http://localhost:${port}`;
    const isWin = process.platform === 'win32';

    try {
      serverProcess = spawn('npx', ['serve', '-p', String(port)], {
        cwd: serveDir,
        stdio: 'pipe',
        detached: false,
        shell: isWin,
        env: safeEnv(),
      });

      // Wait for server to start and parse actual URL from output.
      // Serve v14 may silently switch ports if the requested port is taken.
      const result = await new Promise<{ started: boolean; url: string | null }>((resolve) => {
        let resolved = false;
        const urlPattern = /Accepting connections at (http:\/\/localhost:\d+)/;

        const checkOutput = (data: Buffer) => {
          const match = data.toString().match(urlPattern);
          if (match && !resolved) {
            resolved = true;
            resolve({ started: true, url: match[1] });
          }
        };
        serverProcess!.stdout?.on('data', checkOutput);
        serverProcess!.stderr?.on('data', checkOutput);

        serverProcess!.on('error', () => {
          if (!resolved) { resolved = true; resolve({ started: false, url: null }); }
        });
        serverProcess!.on('close', () => {
          if (!resolved) { resolved = true; resolve({ started: false, url: null }); }
        });
        setTimeout(() => {
          if (!resolved) { resolved = true; resolve({ started: true, url: null }); }
        }, 5000);
      });

      if (!result.started) {
        serverProcess = null;
      }
      finalUrl = result.url ?? (serverProcess ? fallbackUrl : null);
    } catch (err: any) {
      console.warn('Web preview server failed to start:', err.message);
      serverProcess = null;
    }
    await ctx.send({ type: 'deploy_complete', target: 'web', ...(finalUrl ? { url: finalUrl } : {}) });
    return { process: serverProcess, url: finalUrl };
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

  async deployPortals(ctx: PhaseContext): Promise<void> {
    ctx.session.state = 'deploying';
    await ctx.send({ type: 'deploy_started', target: 'portals' });

    await this.sendDeployChecklist(ctx);

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
  }

  async teardown(): Promise<void> {
    await this.portalService.teardownAll();
  }

  getMcpServers(): any[] {
    return this.portalService.getMcpServers();
  }
}
