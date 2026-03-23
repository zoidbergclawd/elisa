import type { Skill } from '../Skills/types';
import type { Portal } from '../Portals/types';
import type { BehavioralTest, FeedbackLoop, SystemLevel, RuntimeConfig, KnowledgeConfig } from '../../types';
import type { DeviceManifest } from '../../lib/deviceBlocks';

export interface NuggetSpec {
  nugget: {
    goal: string;
    description: string;
    type: string;
  };
  requirements: Array<{
    type: string;
    description: string;
    test_id?: string;
  }>;
  style?: {
    visual: string | null;
    personality: string | null;
  };
  agents: Array<{
    name: string;
    role: string;
    persona: string;
  }>;
  deployment: {
    target: string;
    auto_flash: boolean;
    runtime_url?: string;
    provision_runtime?: boolean;
  };
  workflow: {
    review_enabled: boolean;
    testing_enabled: boolean;
    human_gates: string[];
    flow_hints?: Array<{ type: 'sequential' | 'parallel'; descriptions: string[] }>;
    iteration_conditions?: string[];
    behavioral_tests?: BehavioralTest[];
    feedback_loops?: FeedbackLoop[];
    system_level?: SystemLevel;
  };
  skills?: Array<{ id: string; name: string; prompt: string; category: string; workspace?: Record<string, unknown> }>;
  rules?: Array<{ id: string; name: string; prompt: string; trigger: string }>;
  portals?: Array<{
    id: string;
    name: string;
    description: string;
    mechanism: string;
    capabilities: Array<{ id: string; name: string; kind: string; description: string }>;
    interactions: Array<{ type: 'tell' | 'when' | 'ask'; capabilityId: string; params?: Record<string, string | number | boolean> }>;
    mcpConfig?: Record<string, unknown>;
    cliConfig?: Record<string, unknown>;
  }>;
  devices?: Array<{
    pluginId: string;
    instanceId: string;
    fields: Record<string, unknown>;
  }>;
  documentation?: {
    generate: boolean;
    focus: string;
  };
  runtime?: RuntimeConfig;
  knowledge?: KnowledgeConfig;
  composition?: {
    parent_graph_id?: string;
    node_id?: string;
    provides?: Array<{ name: string; type: string }>;
    requires?: Array<{ name: string; type: string }>;
  };
  meeting_team?: Array<{
    type: 'builtin' | 'custom';
    meetingTypeId?: string;
    name?: string;
    persona?: string;
    canvasType?: string;
  }>;
}

interface BlockJson {
  type: string;
  id?: string;
  fields?: Record<string, unknown>;
  inputs?: Record<string, { block: BlockJson }>;
  next?: { block: BlockJson };
}

interface WorkspaceJson {
  blocks?: {
    blocks?: BlockJson[];
  };
}

function walkNextChain(block: BlockJson): BlockJson[] {
  const chain: BlockJson[] = [block];
  let current = block;
  while (current.next?.block) {
    chain.push(current.next.block);
    current = current.next.block;
  }
  return chain;
}

function walkInputChain(block: BlockJson, inputName: string): BlockJson[] {
  const inputBlock = block.inputs?.[inputName]?.block;
  if (!inputBlock) return [];
  return walkNextChain(inputBlock);
}

/**
 * PRD-003: Block type migration map.
 * Maps old block type names to their new equivalents.
 * Removed blocks map to empty string (stripped during migration).
 */
const BLOCK_TYPE_MIGRATIONS: Record<string, string> = {
  // Legacy renames (pre-PRD-003)
  project_goal: 'nugget_goal',
  project_template: 'nugget_template',
  // PRD-003: Behavioral Test -> Proof
  behavioral_test: 'proof',
  // PRD-003: Style -> stripped (migrated to shipped skills at interpreter level)
  look_like: '',
  personality: '',
  // PRD-003: Rule -> stripped (retired)
  use_rule: '',
  // PRD-003: Minion -> stripped (execution context, not a primitive)
  agent_builder: '',
  agent_tester: '',
  agent_reviewer: '',
  agent_custom: '',
  // PRD-003: Flow -> stripped (canvas layout = flow)
  first_then: '',
  at_same_time: '',
  keep_improving: '',
  timer_every: '',
  check_with_me: '',
  feedback_loop: '',
  // PRD-003: Team -> stripped (removed entirely)
  team_member: '',
  team_member_custom: '',
  // PRD-003: System -> stripped (removed from primitives)
  system_level: '',
  // PRD-003: Composition -> stripped (Phase 2 via Nugget block)
  nugget_provides: '',
  nugget_requires: '',
  // PRD-003: Knowledge -> stripped (absorbed into Portal)
  agent_backpack: '',
  backpack_source: '',
  study_mode: '',
};

/** Migration warnings collected during workspace migration. */
export interface MigrationWarning {
  blockType: string;
  message: string;
}

/** Migrate old workspace JSON block types to their new names. Mutates in place. */
export function migrateWorkspace(json: Record<string, unknown>): { json: Record<string, unknown>; warnings: MigrationWarning[] } {
  const ws = json as unknown as WorkspaceJson;
  const blocks = ws.blocks?.blocks;
  const warnings: MigrationWarning[] = [];
  if (!blocks) return { json, warnings };

  function migrateBlock(block: BlockJson): boolean {
    const migration = BLOCK_TYPE_MIGRATIONS[block.type];
    if (migration !== undefined) {
      if (migration === '') {
        // Block is being removed -- log warning for lossy conversions
        if (block.type === 'use_rule') {
          warnings.push({ blockType: block.type, message: 'Rule blocks have been retired. Consider expressing this constraint as a Promise.' });
        } else if (block.type.startsWith('agent_')) {
          warnings.push({ blockType: block.type, message: 'Minion blocks removed from primitives. Agents are now auto-configured.' });
        } else if (['first_then', 'at_same_time', 'keep_improving', 'timer_every', 'check_with_me', 'feedback_loop'].includes(block.type)) {
          warnings.push({ blockType: block.type, message: 'Flow blocks removed. Use canvas layout (vertical = sequence, side-by-side = parallel).' });
        } else if (['team_member', 'team_member_custom'].includes(block.type)) {
          warnings.push({ blockType: block.type, message: 'Team blocks removed.' });
        } else if (block.type === 'system_level') {
          warnings.push({ blockType: block.type, message: 'System level block removed from primitives.' });
        } else if (['nugget_provides', 'nugget_requires'].includes(block.type)) {
          warnings.push({ blockType: block.type, message: 'Composition blocks moved to Phase 2 Nugget system.' });
        } else if (['look_like', 'personality'].includes(block.type)) {
          warnings.push({ blockType: block.type, message: 'Style blocks migrated to shipped Skills.' });
        } else if (['agent_backpack', 'backpack_source', 'study_mode'].includes(block.type)) {
          warnings.push({ blockType: block.type, message: 'Knowledge blocks absorbed into Portal.' });
        }
        return false; // signal: remove this block from the chain
      }
      block.type = migration;
    }
    // Recurse into nested inputs
    if (block.inputs) {
      for (const input of Object.values(block.inputs)) {
        if (input.block) {
          const keep = migrateBlock(input.block);
          if (!keep) {
            // Remove the nested block
            input.block = undefined as unknown as BlockJson;
          }
        }
      }
    }
    // Recurse into next chain
    if (block.next?.block) {
      const keep = migrateBlock(block.next.block);
      if (!keep) {
        // Skip removed block, connect to the next one after it
        const removedBlock = block.next.block;
        block.next = removedBlock.next ?? undefined;
        // Continue migrating the new next block if it exists
        if (block.next?.block) {
          const keepNext = migrateBlock(block.next.block);
          if (!keepNext) {
            block.next = block.next.block.next ?? undefined;
          }
        }
      }
    }
    return true; // keep this block
  }

  // Filter out top-level blocks that are removed
  const filteredBlocks: BlockJson[] = [];
  for (const block of blocks) {
    const keep = migrateBlock(block);
    if (keep) {
      filteredBlocks.push(block);
    }
  }
  if (ws.blocks) {
    ws.blocks.blocks = filteredBlocks;
  }
  return { json, warnings };
}

/** Helper to extract proof (test) blocks from a promise block's TEST_SOCKET input. */
function extractProofs(block: BlockJson, spec: NuggetSpec, reqId: string): string | undefined {
  const testBlocks = walkInputChain(block, 'TEST_SOCKET');
  let linkedTestId: string | undefined;
  for (const tb of testBlocks) {
    if (tb.type === 'proof' || tb.type === 'behavioral_test') {
      const givenWhen = (tb.fields?.GIVEN_WHEN as string) ?? '';
      const then = (tb.fields?.THEN as string) ?? '';
      if (!spec.workflow.behavioral_tests) spec.workflow.behavioral_tests = [];
      const testId = `test_${spec.workflow.behavioral_tests.length}`;
      spec.workflow.behavioral_tests.push({ id: testId, when: givenWhen, then, requirement_id: reqId });
      spec.workflow.testing_enabled = true;
      if (!linkedTestId) linkedTestId = testId;
    }
  }
  return linkedTestId;
}

export function interpretWorkspace(
  json: Record<string, unknown>,
  skills?: Skill[],
  _rules?: unknown,
  portals?: Portal[],
  deviceManifests?: DeviceManifest[],
): NuggetSpec {
  const ws = json as unknown as WorkspaceJson;
  const topBlocks = ws.blocks?.blocks ?? [];

  const spec: NuggetSpec = {
    nugget: { goal: '', description: '', type: 'general' },
    requirements: [],
    agents: [],
    deployment: { target: 'preview', auto_flash: false },
    workflow: {
      review_enabled: false,
      testing_enabled: false,
      human_gates: [],
      flow_hints: [],
      iteration_conditions: [],
    },
  };

  const goalBlock = topBlocks.find((b) => b.type === 'nugget_goal');
  if (!goalBlock) return spec;

  const chain = walkNextChain(goalBlock);

  let hasWeb = false;
  let hasEsp32 = false;

  for (const block of chain) {
    switch (block.type) {
      case 'nugget_goal': {
        const text = (block.fields?.GOAL_TEXT as string) ?? '';
        spec.nugget.goal = text;
        spec.nugget.description = text;
        const fw = (block.fields?.FRAMEWORK as string) ?? 'auto';
        if (fw !== 'auto') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- framework field added dynamically from block
          (spec as Record<string, any>).framework = fw;
        }
        break;
      }
      case 'nugget_template': {
        const tmpl = (block.fields?.TEMPLATE_TYPE as string) ?? 'general';
        spec.nugget.type = tmpl;
        break;
      }
      case 'feature': {
        const text = (block.fields?.FEATURE_TEXT as string) ?? '';
        const reqId = `req_${spec.requirements.length}`;
        const linkedTestId = extractProofs(block, spec, reqId);
        spec.requirements.push({ type: 'feature', description: text, test_id: linkedTestId });
        break;
      }
      case 'constraint': {
        const text = (block.fields?.CONSTRAINT_TEXT as string) ?? '';
        spec.requirements.push({ type: 'constraint', description: text });
        break;
      }
      case 'when_then': {
        const trigger = (block.fields?.TRIGGER_TEXT as string) ?? '';
        const action = (block.fields?.ACTION_TEXT as string) ?? '';
        const reqId = `req_${spec.requirements.length}`;
        const linkedTestId = extractProofs(block, spec, reqId);
        spec.requirements.push({ type: 'when_then', description: `When ${trigger} happens, ${action} should happen`, test_id: linkedTestId });
        break;
      }
      case 'has_data': {
        const text = (block.fields?.DATA_TEXT as string) ?? '';
        const reqId = `req_${spec.requirements.length}`;
        const linkedTestId = extractProofs(block, spec, reqId);
        spec.requirements.push({ type: 'data', description: text, test_id: linkedTestId });
        break;
      }
      case 'use_skill': {
        const skillId = (block.fields?.SKILL_ID as string) ?? '';
        if (skillId && skills) {
          const skill = skills.find(s => s.id === skillId);
          if (skill) {
            if (!spec.skills) spec.skills = [];
            const entry: { id: string; name: string; prompt: string; category: string; workspace?: Record<string, unknown> } = {
              id: skill.id, name: skill.name, prompt: skill.prompt, category: skill.category,
            };
            if (skill.category === 'composite' && skill.workspace) {
              entry.workspace = skill.workspace;
            }
            spec.skills.push(entry);
          }
        }
        break;
      }
      case 'portal_tell':
      case 'portal_when':
      case 'portal_ask': {
        const portalId = (block.fields?.PORTAL_ID as string) ?? '';
        const capabilityId = (block.fields?.CAPABILITY_ID as string) ?? '';
        if (portalId && capabilityId && portals) {
          const portal = portals.find(p => p.id === portalId);
          if (portal) {
            if (!spec.portals) spec.portals = [];
            let portalEntry = spec.portals.find(p => p.id === portal.id);
            if (!portalEntry) {
              portalEntry = {
                id: portal.id,
                name: portal.name,
                description: portal.description,
                mechanism: portal.mechanism,
                capabilities: portal.capabilities.map(c => ({
                  id: c.id, name: c.name, kind: c.kind, description: c.description,
                })),
                interactions: [],
                ...(portal.mcpConfig ? { mcpConfig: portal.mcpConfig as Record<string, unknown> } : {}),
                ...(portal.cliConfig ? { cliConfig: portal.cliConfig as Record<string, unknown> } : {}),
              };
              spec.portals.push(portalEntry);
            }
            const interactionType = block.type === 'portal_tell' ? 'tell'
              : block.type === 'portal_when' ? 'when' : 'ask';
            // Extract capability params from block fields (PARAM_<name>)
            const capability = portal.capabilities.find(c => c.id === capabilityId);
            const params: Record<string, string | number | boolean> = {};
            if (capability?.params) {
              for (const param of capability.params) {
                const fieldName = `PARAM_${param.name}`;
                const raw = block.fields?.[fieldName];
                if (raw !== undefined && raw !== null && raw !== '') {
                  if (param.type === 'number') {
                    params[param.name] = Number(raw);
                  } else if (param.type === 'boolean') {
                    params[param.name] = raw === true || raw === 'TRUE';
                  } else {
                    params[param.name] = String(raw);
                  }
                } else if (param.default !== undefined) {
                  params[param.name] = param.default;
                }
              }
            }
            const interaction: { type: 'tell' | 'when' | 'ask'; capabilityId: string; params?: Record<string, string | number | boolean> } = {
              type: interactionType, capabilityId,
            };
            if (Object.keys(params).length > 0) {
              interaction.params = params;
            }
            portalEntry.interactions.push(interaction);
          }
        }
        break;
      }
      case 'write_guide': {
        spec.documentation = {
          generate: true,
          focus: String(block.fields?.GUIDE_FOCUS ?? 'all'),
        };
        break;
      }
      // --- PRD-001: runtime config block (not in palette, but interpreted if present) ---
      case 'runtime_config': {
        spec.runtime = {
          agent_name: (block.fields?.AGENT_NAME as string) || undefined,
          greeting: (block.fields?.GREETING as string) || undefined,
          fallback_response: (block.fields?.FALLBACK_RESPONSE as string) || undefined,
          voice: (block.fields?.VOICE as string) || undefined,
          display_theme: (block.fields?.DISPLAY_THEME as string) || undefined,
        };
        break;
      }
      // --- PRD-001: deploy runtime block ---
      case 'deploy_runtime': {
        const runtimeUrl = (block.fields?.RUNTIME_URL as string) || undefined;
        spec.deployment.provision_runtime = true;
        if (runtimeUrl) spec.deployment.runtime_url = runtimeUrl;
        hasWeb = true;
        break;
      }
      case 'deploy_web':
        hasWeb = true;
        break;
      case 'deploy_esp32':
        hasEsp32 = true;
        spec.nugget.type = 'hardware';
        break;
      case 'deploy_both':
        hasWeb = true;
        hasEsp32 = true;
        break;
      default: {
        // Generic device plugin handler
        if (deviceManifests?.length) {
          const manifest = deviceManifests.find(m => m.blocks.some(b => b.type === block.type));
          if (manifest) {
            if (!spec.devices) spec.devices = [];
            const blockDef = manifest.blocks.find(b => b.type === block.type)!;
            const fields: Record<string, unknown> = {};
            for (const arg of blockDef.args) {
              if ('name' in arg && arg.name) {
                fields[arg.name as string] = block.fields?.[arg.name as string];
              }
            }
            spec.devices.push({ pluginId: manifest.id, instanceId: block.id ?? block.type, fields });
            // Infer deployment target from device manifest deploy method
            if (manifest.deploy?.method === 'flash' || manifest.deploy?.method === 'esptool') hasEsp32 = true;
            if (manifest.deploy?.method === 'cloud') hasWeb = true;
          }
        }
        break;
      }
    }
  }

  if (hasWeb && hasEsp32) spec.deployment.target = 'both';
  else if (hasWeb) spec.deployment.target = 'web';
  else if (hasEsp32) {
    spec.deployment.target = 'esp32';
    spec.deployment.auto_flash = true;
  }

  return spec;
}
