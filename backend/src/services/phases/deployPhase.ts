/** Deploy phase: handles hardware flash, portal deployment, and web preview. */

import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { safeEnv } from '../../utils/safeEnv.js';
import { BUILD_TIMEOUT_MS } from '../../utils/constants.js';
import { findFreePort } from '../../utils/findFreePort.js';
import type { PhaseContext, GateResponse } from './types.js';
import { maybeTeach } from './types.js';
import { HardwareService } from '../hardwareService.js';
import { PortalService } from '../portalService.js';
import { TeachingEngine } from '../teachingEngine.js';
import type { DeviceRegistry } from '../deviceRegistry.js';
import { resolveDeployOrder } from './deployOrder.js';
import { selectFlashStrategy } from '../flashStrategy.js';
import type { RuntimeProvisioner } from '../runtimeProvisioner.js';
import type { DeviceManifest } from '../../utils/deviceManifestSchema.js';

function log(msg: string, data?: Record<string, unknown>): void {
  const ts = new Date().toISOString();
  if (data) {
    console.log(`[deploy ${ts}] ${msg}`, JSON.stringify(data));
  } else {
    console.log(`[deploy ${ts}] ${msg}`);
  }
}

// ── spec_mapping bridge ───────────────────────────────────────────────

/**
 * Set a nested property on an object using a dot-delimited path.
 * Creates intermediate objects as needed.
 *
 * Example: setNestedValue(obj, 'runtime.agent_name', 'Elisa')
 * sets obj.runtime.agent_name = 'Elisa', creating obj.runtime if absent.
 */
export function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- navigating arbitrary nested structure
  let current: any = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] === undefined || current[parts[i]] === null) {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Resolve device block fields into the NuggetSpec according to each device
 * plugin's spec_mapping.extract_fields declaration.
 *
 * Each entry in extract_fields maps a dot-delimited spec path (key) to a
 * block field name (value). For example, `{ "runtime.agent_name": "AGENT_NAME" }`
 * copies `device.fields.AGENT_NAME` into `spec.runtime.agent_name`.
 *
 * This must run BEFORE runtimeProvisioner.provision(spec) so that device
 * block field values are available in the spec's runtime config.
 *
 * @param spec - The NuggetSpec to resolve. A deep clone is returned; the original is not mutated.
 * @param getManifest - Lookup function to retrieve a DeviceManifest by plugin ID.
 * @returns A new NuggetSpec with device fields mapped to their spec paths.
 */
export function resolveDeviceConfig(
  spec: Record<string, unknown>,
  getManifest: (pluginId: string) => DeviceManifest | undefined,
): Record<string, unknown> {
  const devices = spec.devices as Array<{ pluginId: string; fields?: Record<string, unknown> }> | undefined;
  if (!Array.isArray(devices) || devices.length === 0) return spec;

  const resolved = structuredClone(spec);
  for (const device of (resolved.devices as Array<{ pluginId: string; fields?: Record<string, unknown> }>)) {
    const manifest = getManifest(device.pluginId);
    if (!manifest?.spec_mapping?.extract_fields) continue;

    const extractFields = manifest.spec_mapping.extract_fields as Record<string, string>;
    for (const [specPath, fieldKey] of Object.entries(extractFields)) {
      if (typeof fieldKey !== 'string') continue;
      if (device.fields?.[fieldKey] !== undefined) {
        setNestedValue(resolved, specPath, device.fields[fieldKey]);
      }
    }
  }
  return resolved;
}

export class DeployPhase {
  private hardwareService: HardwareService;
  private portalService: PortalService;
  private teachingEngine: TeachingEngine;
  private deviceRegistry?: DeviceRegistry;
  private runtimeProvisioner?: RuntimeProvisioner;

  constructor(
    hardwareService: HardwareService,
    portalService: PortalService,
    teachingEngine: TeachingEngine,
    deviceRegistry?: DeviceRegistry,
    runtimeProvisioner?: RuntimeProvisioner,
  ) {
    this.hardwareService = hardwareService;
    this.portalService = portalService;
    this.teachingEngine = teachingEngine;
    this.deviceRegistry = deviceRegistry;
    this.runtimeProvisioner = runtimeProvisioner;
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
    gateResolver: { current: ((value: GateResponse) => void) | null },
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- manifests Map has local `any` values from heterogeneous device.json schemas
    const order = resolveDeployOrder(devices, manifests as any);
    log('deployDevices: resolved order', { order: order.map(d => d.pluginId) });
    const outputs: Record<string, string> = {};

    // Resolve device block fields into the spec before provisioning.
    // This maps e.g. device.fields.AGENT_NAME -> spec.runtime.agent_name
    // according to each plugin's spec_mapping.extract_fields declaration.
    const resolvedSpec = resolveDeviceConfig(
      spec,
      (pluginId) => this.deviceRegistry!.getDevice(pluginId),
    );
    log('deployDevices: resolved device config', {
      hadMapping: resolvedSpec !== spec,
      runtimeKeys: Object.keys((resolvedSpec as any).runtime ?? {}),
    });

    // Run runtime provisioning for any device that requires it BEFORE device flash.
    // Provision results (agent_id, api_key, runtime_url) are added to outputs so
    // downstream devices can consume them via the provides/requires DAG.
    if (this.runtimeProvisioner) {
      for (const device of order) {
        const manifest = manifests.get(device.pluginId);
        if (!manifest) continue;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deploy schema varies per device plugin; runtime_provision is an optional extension
        const deploy = manifest.deploy as Record<string, any>;
        if (deploy.runtime_provision?.required) {
          log(`  runtime provisioning for ${device.pluginId}...`);
          await ctx.send({
            type: 'deploy_progress',
            device_role: device.pluginId,
            step: 'Provisioning runtime agent...',
            progress: 5,
          });

          try {
            const provisionResult = await this.runtimeProvisioner.provision(resolvedSpec as any);
            outputs['agent_id'] = provisionResult.agent_id;
            outputs['api_key'] = provisionResult.api_key;
            outputs['runtime_url'] = provisionResult.runtime_url;
            // Also provide uppercase variants for template placeholder compatibility
            outputs['AGENT_ID'] = provisionResult.agent_id;
            outputs['API_KEY'] = provisionResult.api_key;
            outputs['RUNTIME_URL'] = provisionResult.runtime_url;
            log('  provisioning complete', {
              agent_id: provisionResult.agent_id,
              runtime_url: provisionResult.runtime_url,
            });
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            log('  provisioning FAILED', { error: message });
            await ctx.send({
              type: 'error',
              message: `Runtime provisioning failed for ${manifest.name}: ${message}`,
              recoverable: true,
            });
          }
        }
      }
    }

    for (const device of order) {
      const manifest = manifests.get(device.pluginId);
      if (!manifest) {
        log(`  skipping ${device.pluginId}: no manifest`);
        continue;
      }

      log(`--- deploying ${device.pluginId} (method: ${manifest.deploy.method}) ---`);

      if (manifest.deploy.method === 'cloud') {
        // Cloud deploy (unchanged)
        await this.deployCloud(ctx, device, manifest, outputs);
      } else if (manifest.deploy.method === 'flash' || manifest.deploy.method === 'esptool') {
        // Flash deploy (mpremote or esptool) via strategy pattern
        await this.deployFlash(ctx, device, manifest, outputs, gateResolver);
      }
    }

    log('deployDevices: finished all devices', { outputKeys: Object.keys(outputs) });
  }

  /** Deploy a cloud device (e.g., Cloud Run). */
  private async deployCloud(
    ctx: PhaseContext,
    device: any,
    manifest: any,
    outputs: Record<string, string>,
  ): Promise<void> {
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
      if (!scaffoldDir) {
        throw new Error(`No scaffold directory found for device plugin "${device.pluginId}"`);
      }
      await ctx.send({
        type: 'deploy_progress',
        device_role: device.pluginId,
        step: 'Enabling required GCP APIs (Cloud Run, Cloud Build, Artifact Registry)...',
        progress: 10,
      });
      const result = await cloudService.deploy(
        scaffoldDir,
        ctx.nuggetDir,
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log('  cloud deploy FAILED', { error: message });
      await ctx.send({
        type: 'error',
        message: `Cloud deploy failed for ${manifest.name}: ${message}`,
        recoverable: true,
      });
      await ctx.send({ type: 'deploy_complete', target: device.pluginId });
    }
  }

  /** Deploy a flashable device using the appropriate FlashStrategy. */
  private async deployFlash(
    ctx: PhaseContext,
    device: any,
    manifest: any,
    outputs: Record<string, string>,
    gateResolver: { current: ((value: GateResponse) => void) | null },
  ): Promise<void> {
    const method = manifest.deploy.method;
    const flashConfig = method === 'flash' ? manifest.deploy.flash : manifest.deploy.esptool;

    log(`  ${method} deploy starting`, {
      pluginId: device.pluginId,
      requires: manifest.deploy.requires,
    });

    // Select the flash strategy
    const strategy = selectFlashStrategy(method, this.hardwareService);

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

    // Get flash file info from registry
    const flashFileInfo = this.deviceRegistry!.getFlashFiles(device.pluginId);
    const pluginDir = this.deviceRegistry!.getPluginDir(device.pluginId) ?? '';

    try {
      const flashResult = await strategy.flash({
        pluginDir,
        nuggetDir: ctx.nuggetDir,
        deviceFields: device.fields ?? {},
        injections,
        pluginId: device.pluginId,
        flashConfig,
        flashFiles: flashFileInfo,
        onProgress: (step, progress) => {
          ctx.send({
            type: 'flash_progress',
            device_role: device.pluginId,
            step,
            progress,
          });
        },
      });

      await ctx.send({
        type: 'flash_progress',
        device_role: device.pluginId,
        step: flashResult.success ? 'Flash complete!' : (flashResult.message ?? 'Flash failed'),
        progress: 100,
      });

      await ctx.send({
        type: 'flash_complete',
        device_role: device.pluginId,
        success: flashResult.success,
        message: flashResult.success
          ? `${manifest.name} flashed successfully`
          : (flashResult.message ?? 'Flash failed'),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      log(`  ${method} flash THREW`, { error: message, stack });
      await ctx.send({
        type: 'flash_progress',
        device_role: device.pluginId,
        step: `Error: ${message}`,
        progress: 100,
      });
      await ctx.send({
        type: 'flash_complete',
        device_role: device.pluginId,
        success: false,
        message,
      });
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
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log('deployWeb: build warning', { error: message });
        await ctx.send({ type: 'deploy_progress', step: `Build warning: ${message}`, progress: 30 });
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('Web preview server failed to start:', message);
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
    const portalSpecs = (spec.portals ?? []) as import('../portalService.js').PortalSpec[];
    try {
      await this.portalService.initializePortals(portalSpecs);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('Portal initialization warning:', message);
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
