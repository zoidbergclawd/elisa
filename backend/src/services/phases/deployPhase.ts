/** Deploy phase: handles hardware flash and portal deployment. */

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
