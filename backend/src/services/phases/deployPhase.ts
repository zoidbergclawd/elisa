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

function log(msg: string, data?: Record<string, unknown>): void {
  const ts = new Date().toISOString();
  if (data) {
    console.log(`[deploy ${ts}] ${msg}`, JSON.stringify(data));
  } else {
    console.log(`[deploy ${ts}] ${msg}`);
  }
}

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
    const result = Array.isArray(devices) && devices.length > 0;
    log('shouldDeployDevices', { result, deviceCount: Array.isArray(devices) ? devices.length : 0 });
    return result;
  }

  async deployDevices(
    ctx: PhaseContext,
    gateResolver: { current: ((value: Record<string, any>) => void) | null },
  ): Promise<void> {
    const spec = ctx.session.spec ?? {};
    const devices = spec.devices ?? [];
    if (!devices.length || !this.deviceRegistry) {
      log('deployDevices: skipping', { deviceCount: devices.length, hasRegistry: !!this.deviceRegistry });
      return;
    }

    ctx.session.state = 'deploying';
    await ctx.send({ type: 'deploy_started', target: 'devices' });
    log('deployDevices: starting', { deviceCount: devices.length });

    // Build manifest lookup
    const manifests = new Map<string, any>();
    for (const device of devices) {
      const manifest = this.deviceRegistry.getDevice(device.pluginId);
      if (manifest) {
        manifests.set(device.pluginId, manifest);
        log(`  manifest loaded: ${device.pluginId}`, { method: manifest.deploy?.method, name: manifest.name });
      } else {
        log(`  WARNING: no manifest for ${device.pluginId}`);
      }
    }

    // Resolve deploy order using provides/requires DAG
    const order = resolveDeployOrder(devices, manifests as any);
    log('deployDevices: resolved order', { order: order.map(d => d.pluginId) });
    const outputs: Record<string, string> = {};

    for (const device of order) {
      const manifest = manifests.get(device.pluginId);
      if (!manifest) {
        log(`  skipping ${device.pluginId}: no manifest`);
        continue;
      }

      log(`--- deploying ${device.pluginId} (method: ${manifest.deploy.method}) ---`);

      if (manifest.deploy.method === 'cloud') {
        // Cloud deploy
        log('  cloud deploy starting', { pluginId: device.pluginId, provides: manifest.deploy.provides });
        try {
          const { CloudDeployService } = await import('../cloudDeployService.js');
          const cloudService = new CloudDeployService();
          const scaffoldDir = this.deviceRegistry!.getScaffoldDir(device.pluginId);
          // GCP project IDs are always lowercase; users often enter the display name
          const project = String(device.fields?.GCP_PROJECT ?? 'elisa-iot').toLowerCase();
          const region = device.fields?.GCP_REGION ?? 'us-central1';

          log('  cloud deploy params', { scaffoldDir, project, region });
          await ctx.send({ type: 'deploy_started', target: device.pluginId });
          const result = await cloudService.deploy(
            scaffoldDir ?? ctx.nuggetDir,
            String(project),
            String(region),
          );
          log('  cloud deploy SUCCESS', { url: result.url });
          // Map result keys to provides keys (result uses url/apiKey, provides use cloud_url/api_key)
          const resultMap: Record<string, string> = {};
          if (result.url) { resultMap['cloud_url'] = result.url; resultMap['DASHBOARD_URL'] = result.url; }
          if (result.apiKey) { resultMap['api_key'] = result.apiKey; resultMap['API_KEY'] = result.apiKey; }
          for (const key of manifest.deploy.provides) {
            if (resultMap[key]) outputs[key] = resultMap[key];
          }
          log('  outputs after cloud deploy', outputs);
          await ctx.send({ type: 'deploy_complete', target: device.pluginId, url: result.url });
        } catch (err: any) {
          log('  cloud deploy FAILED', { error: err.message });
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
        log('  flash deploy starting', {
          pluginId: device.pluginId,
          flashFiles: flashConfig.files,
          lib: flashConfig.lib,
          sharedLib: flashConfig.shared_lib,
          requires: manifest.deploy.requires,
        });

        // Set up gate promise BEFORE sending prompt
        const gatePromise = new Promise<void>((resolve) => {
          gateResolver.current = () => { resolve(); };
        });

        await ctx.send({
          type: 'flash_prompt',
          device_role: device.pluginId,
          message: flashConfig.prompt_message,
        });
        log('  waiting for user to click Ready...');

        await gatePromise;
        log('  user clicked Ready, proceeding with flash');

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
        log('  injections for this device', { requires: manifest.deploy.requires, injections, availableOutputs: outputs });

        // Copy lib and shared files from plugin directory into workspace
        const flashFileInfo = this.deviceRegistry!.getFlashFiles(device.pluginId);
        log('  flash file info from registry', {
          lib: flashFileInfo.lib,
          shared: flashFileInfo.shared,
        });

        for (const libFile of flashFileInfo.lib) {
          const dest = path.join(ctx.nuggetDir, path.basename(libFile));
          const exists = fs.existsSync(libFile);
          log(`  copy lib: ${libFile} -> ${dest} (source exists: ${exists})`);
          if (exists) fs.copyFileSync(libFile, dest);
        }
        for (const sharedFile of flashFileInfo.shared) {
          const dest = path.join(ctx.nuggetDir, path.basename(sharedFile));
          const exists = fs.existsSync(sharedFile);
          log(`  copy shared: ${sharedFile} -> ${dest} (source exists: ${exists})`);
          if (exists) fs.copyFileSync(sharedFile, dest);
        }

        await ctx.send({
          type: 'flash_progress',
          device_role: device.pluginId,
          step: 'Copying library files...',
          progress: 20,
        });

        // Fallback: if agent didn't generate entry point files, copy templates from plugin dir
        const pluginDir = this.deviceRegistry!.getPluginDir(device.pluginId);
        if (pluginDir) {
          for (const entryFileName of flashConfig.files) {
            const workspaceFile = path.join(ctx.nuggetDir, entryFileName);
            if (!fs.existsSync(workspaceFile)) {
              const templateFile = path.join(pluginDir, 'templates', entryFileName);
              if (fs.existsSync(templateFile)) {
                let content = fs.readFileSync(templateFile, 'utf-8');
                // Replace __PLACEHOLDER__ patterns with device fields + injections
                const replacements: Record<string, string> = { ...injections };
                if (device.fields) {
                  for (const [k, v] of Object.entries(device.fields)) {
                    replacements[k] = String(v);
                  }
                }
                for (const [key, value] of Object.entries(replacements)) {
                  content = content.replace(new RegExp(`__${key.toUpperCase()}__`, 'g'), value);
                }
                fs.writeFileSync(workspaceFile, content, 'utf-8');
                log(`  copied template fallback: ${templateFile} -> ${workspaceFile}`);
              } else {
                log(`  WARNING: no template fallback found at ${templateFile}`);
              }
            }
          }
        }

        // Write injected config values (e.g., cloud_url, api_key) as config.py
        if (Object.keys(injections).length > 0) {
          const configLines = Object.entries(injections)
            .map(([k, v]) => `${k.toUpperCase()} = "${v}"`);
          const configContent = configLines.join('\n') + '\n';
          const configPath = path.join(ctx.nuggetDir, 'config.py');
          fs.writeFileSync(configPath, configContent, 'utf-8');
          log(`  wrote config.py: ${configContent.trim()}`);
        }

        // Create main.py wrapper so MicroPython auto-runs the entry point on boot
        const entryFile = flashConfig.files[0];
        if (entryFile && entryFile !== 'main.py') {
          const moduleName = entryFile.replace(/\.py$/, '');
          const mainPyContent = `# Auto-generated by Elisa to boot ${entryFile}\nimport ${moduleName}\n`;
          fs.writeFileSync(path.join(ctx.nuggetDir, 'main.py'), mainPyContent, 'utf-8');
          log(`  wrote main.py wrapper: import ${moduleName}`);
        }

        // Build list of files to flash
        const filesToFlash = [
          ...flashConfig.files,
          ...flashFileInfo.lib.map((f: string) => path.basename(f)),
          ...flashFileInfo.shared.map((f: string) => path.basename(f)),
        ];
        // Include main.py wrapper if we wrote one
        if (entryFile && entryFile !== 'main.py') {
          filesToFlash.push('main.py');
        }
        // Include config.py if we wrote one
        if (Object.keys(injections).length > 0) {
          filesToFlash.push('config.py');
        }

        // Check which files actually exist in workspace
        const fileStatus: Record<string, boolean> = {};
        for (const f of filesToFlash) {
          fileStatus[f] = fs.existsSync(path.join(ctx.nuggetDir, f));
        }
        log('  files to flash', { filesToFlash, fileStatus, nuggetDir: ctx.nuggetDir });

        await ctx.send({
          type: 'flash_progress',
          device_role: device.pluginId,
          step: `Flashing ${filesToFlash.length} files to board...`,
          progress: 40,
        });

        try {
          log('  calling hardwareService.flashFiles...');
          const flashResult = await this.hardwareService.flashFiles(ctx.nuggetDir, filesToFlash);
          log('  flashFiles result', { success: flashResult.success, message: flashResult.message });

          await ctx.send({
            type: 'flash_progress',
            device_role: device.pluginId,
            step: flashResult.success ? 'Flash complete!' : (flashResult.message ?? 'Flash failed'),
            progress: 100,
          });

          // Soft-reset board after successful flash so code runs (OLED shows output, etc.)
          if (flashResult.success) {
            log('  soft-resetting board to boot into main.py');
            await ctx.send({
              type: 'flash_progress',
              device_role: device.pluginId,
              step: 'Resetting board...',
              progress: 90,
            });
            await this.hardwareService.resetBoard();
          }

          await ctx.send({
            type: 'flash_complete',
            device_role: device.pluginId,
            success: flashResult.success,
            message: flashResult.success
              ? `${manifest.name} flashed successfully`
              : (flashResult.message ?? 'Flash failed'),
          });
        } catch (err: any) {
          log('  flashFiles THREW', { error: err.message, stack: err.stack });
          await ctx.send({
            type: 'flash_progress',
            device_role: device.pluginId,
            step: `Error: ${err.message}`,
            progress: 100,
          });
          await ctx.send({
            type: 'flash_complete',
            device_role: device.pluginId,
            success: false,
            message: err.message,
          });
        }
      }
    }

    log('deployDevices: finished all devices', { outputKeys: Object.keys(outputs) });
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
    const result = target === 'web' || target === 'both' || target === 'preview';
    log('shouldDeployWeb', { target, result });
    return result;
  }

  async deployWeb(ctx: PhaseContext): Promise<{ process: ChildProcess | null; url: string | null }> {
    ctx.session.state = 'deploying';
    log('deployWeb: starting');
    await ctx.send({ type: 'deploy_started', target: 'web' });

    await this.sendDeployChecklist(ctx);

    await ctx.send({ type: 'deploy_progress', step: 'Preparing web preview...', progress: 10 });

    // Run build if package.json has a build script
    const pkgPath = path.join(ctx.nuggetDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.scripts?.build) {
          log('deployWeb: running npm build');
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
        log('deployWeb: build warning', { error: err.message });
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
    log('deployWeb: serve dir', { serveDir });

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
    log('deployWeb: finished', { url: finalUrl });
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
