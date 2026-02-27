/** DeviceFileValidator: post-execution validation of required device entry point files.
 *
 * Extracted from executePhase.ts to isolate device file validation from DAG
 * orchestration. This module owns:
 *   - Checking that required device entry point files exist after build
 *   - Running targeted fixup agents for any missing files
 *   - Fixup agent prompt construction using builderAgent template
 */

import fs from 'node:fs';
import path from 'node:path';
import type { PhaseContext } from './types.js';
import type { AgentRunner } from '../agentRunner.js';
import type { DeviceRegistry } from '../deviceRegistry.js';
import * as builderAgent from '../../prompts/builderAgent.js';
import { sanitizePlaceholder } from './promptBuilder.js';
import { DEFAULT_MODEL } from '../../utils/constants.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeviceFileValidatorDeps {
  agentRunner: AgentRunner;
  deviceRegistry: DeviceRegistry;
}

export interface MissingFile {
  pluginId: string;
  file: string;
}

// ---------------------------------------------------------------------------
// DeviceFileValidator
// ---------------------------------------------------------------------------

export class DeviceFileValidator {
  private deps: DeviceFileValidatorDeps;

  constructor(deps: DeviceFileValidatorDeps) {
    this.deps = deps;
  }

  /**
   * After all tasks complete, check that required device entry point files
   * were generated. If any are missing, run a targeted fixup agent to create them.
   */
  async validate(ctx: PhaseContext): Promise<void> {
    const missing = this.findMissingFiles(ctx);
    if (missing.length === 0) return;

    console.log(`[deviceFileValidator] Missing device files after execution: ${missing.map(m => m.file).join(', ')}`);

    for (const { pluginId, file } of missing) {
      await this.runFixupAgent(ctx, pluginId, file);
    }
  }

  /**
   * Scan device manifests and check which required files are missing from
   * the workspace.
   */
  findMissingFiles(ctx: PhaseContext): MissingFile[] {
    const spec = ctx.session.spec ?? {};
    const devices = spec.devices ?? [];
    if (!devices.length) return [];

    const missing: MissingFile[] = [];
    for (const device of devices) {
      const manifest = this.deps.deviceRegistry.getDevice(device.pluginId);
      if (!manifest || manifest.deploy.method !== 'flash') continue;
      for (const file of manifest.deploy.flash.files) {
        const filePath = path.join(ctx.nuggetDir, file);
        if (!fs.existsSync(filePath)) {
          missing.push({ pluginId: device.pluginId, file });
        }
      }
    }
    return missing;
  }

  /**
   * Run a targeted fixup agent for a single missing device file.
   */
  private async runFixupAgent(ctx: PhaseContext, pluginId: string, file: string): Promise<void> {
    const spec = ctx.session.spec ?? {};
    const devices = spec.devices ?? [];
    const agentContext = this.deps.deviceRegistry.getAgentContext(pluginId);
    const device = devices.find((d: any) => d.pluginId === pluginId);
    const fieldLines = device?.fields
      ? Object.entries(device.fields).map(([k, v]: [string, any]) => `${k}: ${v}`).join('\n')
      : '';

    const fixupPrompt = [
      `# URGENT: Generate missing device entry point file`,
      ``,
      `The build completed but the required file \`${file}\` was not created.`,
      `You MUST create this file now. The device cannot be deployed without it.`,
      ``,
      agentContext ? `## Device Context\n${agentContext}` : '',
      fieldLines ? `## Device Instance: ${pluginId}\n${fieldLines}` : '',
      ``,
      `## Instructions`,
      `1. Read the existing files in the workspace to understand what was already built.`,
      `2. Create \`${file}\` following the device context above.`,
      `3. Use the pin numbers and configuration from the Device Instance fields.`,
      `4. Write a summary to .elisa/comms/fixup_${pluginId}_summary.md`,
    ].filter(Boolean).join('\n');

    const fixupSystemPrompt = builderAgent.SYSTEM_PROMPT
      .replaceAll('{agent_name}', 'Fixup Agent')
      .replaceAll('{persona}', 'A focused builder that generates missing device files.')
      .replaceAll('{allowed_paths}', '.')
      .replaceAll('{restricted_paths}', '.elisa/')
      .replaceAll('{task_id}', `fixup-${pluginId}`)
      .replaceAll('{nugget_goal}', sanitizePlaceholder((spec.nugget ?? {}).goal ?? 'Not specified'))
      .replaceAll('{nugget_type}', sanitizePlaceholder((spec.nugget ?? {}).type ?? 'software'))
      .replaceAll('{nugget_description}', sanitizePlaceholder((spec.nugget ?? {}).description ?? 'Not specified'));

    const fixupTaskId = `fixup-${pluginId}`;
    console.log(`[deviceFileValidator] Running fixup agent for ${file}...`);
    await ctx.send({
      type: 'agent_output',
      task_id: fixupTaskId,
      agent_name: 'Fixup Agent',
      content: `Generating missing file: ${file}`,
    });

    try {
      await this.deps.agentRunner.execute({
        taskId: fixupTaskId,
        systemPrompt: fixupSystemPrompt,
        prompt: fixupPrompt,
        workingDir: ctx.nuggetDir,
        model: DEFAULT_MODEL,
        maxTurns: 10,
        abortSignal: ctx.abortSignal,
        onOutput: async (_tid: string, content: string) => {
          await ctx.send({
            type: 'agent_output',
            task_id: fixupTaskId,
            agent_name: 'Fixup Agent',
            content,
          });
        },
      });

      const created = fs.existsSync(path.join(ctx.nuggetDir, file));
      console.log(`[deviceFileValidator] Fixup for ${file}: ${created ? 'SUCCESS' : 'STILL MISSING'}`);
      if (!created) {
        await ctx.send({
          type: 'error',
          message: `Fixup agent failed to create ${file} for ${pluginId}`,
          recoverable: true,
        });
      }
    } catch (err: any) {
      console.error(`[deviceFileValidator] Fixup agent error for ${file}:`, err.message);
      await ctx.send({
        type: 'error',
        message: `Fixup agent error for ${file}: ${err.message}`,
        recoverable: true,
      });
    }
  }
}
