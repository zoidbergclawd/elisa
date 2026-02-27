import type { Skill, Rule } from '../Skills/types';
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
}

interface BlockJson {
  type: string;
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

const BLOCK_TYPE_MIGRATIONS: Record<string, string> = {
  project_goal: 'nugget_goal',
  project_template: 'nugget_template',
};

/** Migrate old workspace JSON block types to their new names. Mutates in place. */
export function migrateWorkspace(json: Record<string, unknown>): Record<string, unknown> {
  const ws = json as unknown as WorkspaceJson;
  const blocks = ws.blocks?.blocks;
  if (!blocks) return json;

  function migrateBlock(block: BlockJson): void {
    if (BLOCK_TYPE_MIGRATIONS[block.type]) {
      block.type = BLOCK_TYPE_MIGRATIONS[block.type];
    }
    if (block.next?.block) migrateBlock(block.next.block);
    if (block.inputs) {
      for (const input of Object.values(block.inputs)) {
        if (input.block) migrateBlock(input.block);
      }
    }
  }

  for (const block of blocks) {
    migrateBlock(block);
  }
  return json;
}

export function interpretWorkspace(
  json: Record<string, unknown>,
  skills?: Skill[],
  rules?: Rule[],
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
        break;
      }
      case 'nugget_template': {
        const tmpl = (block.fields?.TEMPLATE_TYPE as string) ?? 'general';
        spec.nugget.type = tmpl;
        break;
      }
      case 'feature': {
        const text = (block.fields?.FEATURE_TEXT as string) ?? '';
        spec.requirements.push({ type: 'feature', description: text });
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
        const reqIndex = spec.requirements.length;
        const reqId = `req_${reqIndex}`;
        const testBlocks = walkInputChain(block, 'TEST_SOCKET');
        let linkedTestId: string | undefined;
        if (testBlocks.length > 0) {
          for (const tb of testBlocks) {
            if (tb.type === 'behavioral_test') {
              const givenWhen = (tb.fields?.GIVEN_WHEN as string) ?? '';
              const then = (tb.fields?.THEN as string) ?? '';
              if (!spec.workflow.behavioral_tests) spec.workflow.behavioral_tests = [];
              const testId = `test_${spec.workflow.behavioral_tests.length}`;
              spec.workflow.behavioral_tests.push({ id: testId, when: givenWhen, then, requirement_id: reqId });
              spec.workflow.testing_enabled = true;
              if (!linkedTestId) linkedTestId = testId;
            }
          }
        }
        spec.requirements.push({ type: 'when_then', description: `When ${trigger} happens, ${action} should happen`, test_id: linkedTestId });
        break;
      }
      case 'has_data': {
        const text = (block.fields?.DATA_TEXT as string) ?? '';
        spec.requirements.push({ type: 'data', description: text });
        break;
      }
      // behavioral_test blocks are now handled inside when_then via TEST_SOCKET input.
      // They cannot appear in the main chain (typed connection: test_check).
      case 'look_like': {
        const preset = (block.fields?.STYLE_PRESET as string) ?? '';
        if (!spec.style) spec.style = { visual: null, personality: null };
        spec.style.visual = preset;
        break;
      }
      case 'personality': {
        const text = (block.fields?.PERSONALITY_TEXT as string) ?? '';
        if (!spec.style) spec.style = { visual: null, personality: null };
        spec.style.personality = text;
        break;
      }
      case 'agent_builder': {
        const name = (block.fields?.AGENT_NAME as string) ?? 'Builder';
        const persona = (block.fields?.AGENT_PERSONA as string) ?? '';
        spec.agents.push({ name, role: 'builder', persona });
        break;
      }
      case 'agent_tester': {
        const name = (block.fields?.AGENT_NAME as string) ?? 'Tester';
        const persona = (block.fields?.AGENT_PERSONA as string) ?? '';
        spec.agents.push({ name, role: 'tester', persona });
        spec.workflow.testing_enabled = true;
        break;
      }
      case 'agent_reviewer': {
        const name = (block.fields?.AGENT_NAME as string) ?? 'Reviewer';
        const persona = (block.fields?.AGENT_PERSONA as string) ?? '';
        spec.agents.push({ name, role: 'reviewer', persona });
        spec.workflow.review_enabled = true;
        break;
      }
      case 'agent_custom': {
        const name = (block.fields?.AGENT_NAME as string) ?? 'Helper';
        const persona = (block.fields?.AGENT_PERSONA as string) ?? '';
        spec.agents.push({ name, role: 'custom', persona });
        break;
      }
      case 'first_then': {
        const firstBlocks = walkInputChain(block, 'FIRST_BLOCKS');
        const thenBlocks = walkInputChain(block, 'THEN_BLOCKS');
        const firstDescs = firstBlocks.map(b => (b.fields?.FEATURE_TEXT as string) ?? (b.fields?.GOAL_TEXT as string) ?? b.type);
        const thenDescs = thenBlocks.map(b => (b.fields?.FEATURE_TEXT as string) ?? (b.fields?.GOAL_TEXT as string) ?? b.type);
        spec.workflow.flow_hints!.push({ type: 'sequential', descriptions: [...firstDescs, ...thenDescs] });
        break;
      }
      case 'at_same_time': {
        const parallelBlocks = walkInputChain(block, 'PARALLEL_BLOCKS');
        const descs = parallelBlocks.map(b => (b.fields?.FEATURE_TEXT as string) ?? (b.fields?.GOAL_TEXT as string) ?? b.type);
        spec.workflow.flow_hints!.push({ type: 'parallel', descriptions: descs });
        break;
      }
      case 'keep_improving': {
        const text = (block.fields?.CONDITION_TEXT as string) ?? '';
        spec.workflow.iteration_conditions!.push(text);
        break;
      }
      case 'check_with_me': {
        const text = (block.fields?.GATE_DESCRIPTION as string) ?? '';
        spec.workflow.human_gates.push(text);
        spec.workflow.review_enabled = true;
        break;
      }
      case 'timer_every': {
        const interval = (block.fields?.INTERVAL as number) ?? 5;
        spec.requirements.push({ type: 'timer', description: `Repeat every ${interval} seconds` });
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
      case 'use_rule': {
        const ruleId = (block.fields?.RULE_ID as string) ?? '';
        if (ruleId && rules) {
          const rule = rules.find(r => r.id === ruleId);
          if (rule) {
            if (!spec.rules) spec.rules = [];
            spec.rules.push({ id: rule.id, name: rule.name, prompt: rule.prompt, trigger: rule.trigger });
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
      // --- Systems Thinking: feedback loop block ---
      case 'feedback_loop': {
        const id = (block.fields?.LOOP_ID as string) ?? '';
        const trigger = (block.fields?.TRIGGER as string) ?? 'test_failure';
        const exitCondition = (block.fields?.EXIT_CONDITION as string) ?? '';
        const maxIterations = (block.fields?.MAX_ITERATIONS as number) ?? 3;
        const connectsFrom = (block.fields?.CONNECTS_FROM as string) ?? '';
        const connectsTo = (block.fields?.CONNECTS_TO as string) ?? '';
        if (!spec.workflow.feedback_loops) spec.workflow.feedback_loops = [];
        spec.workflow.feedback_loops.push({
          id,
          trigger: trigger as 'test_failure' | 'review_rejection' | 'custom',
          exit_condition: exitCondition,
          max_iterations: maxIterations,
          connects_from: connectsFrom,
          connects_to: connectsTo,
        });
        break;
      }
      // --- Systems Thinking: system level block ---
      case 'system_level': {
        const level = (block.fields?.LEVEL as string) ?? 'explorer';
        spec.workflow.system_level = level as 'explorer' | 'builder' | 'architect';
        break;
      }
      // --- PRD-001: runtime config block ---
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
      // --- PRD-001: backpack source block ---
      case 'backpack_source': {
        const sourceId = (block.fields?.SOURCE_ID as string) ?? '';
        const sourceType = (block.fields?.SOURCE_TYPE as string) ?? 'url';
        const title = (block.fields?.TITLE as string) ?? '';
        const uri = (block.fields?.URI as string) || undefined;
        if (!spec.knowledge) spec.knowledge = {};
        if (!spec.knowledge.backpack_sources) spec.knowledge.backpack_sources = [];
        spec.knowledge.backpack_sources.push({
          id: sourceId,
          type: sourceType as 'pdf' | 'url' | 'youtube' | 'drive' | 'topic_pack' | 'sports_feed' | 'news_feed' | 'custom_feed',
          title,
          uri,
        });
        break;
      }
      // --- PRD-001: study mode block ---
      case 'study_mode': {
        const enabled = (block.fields?.ENABLED as boolean) ?? true;
        const style = (block.fields?.STYLE as string) ?? 'explain';
        const difficulty = (block.fields?.DIFFICULTY as string) ?? 'medium';
        const quizFrequency = (block.fields?.QUIZ_FREQUENCY as number) ?? 5;
        if (!spec.knowledge) spec.knowledge = {};
        spec.knowledge.study_mode = {
          enabled,
          style: style as 'explain' | 'quiz_me' | 'flashcards' | 'socratic',
          difficulty: difficulty as 'easy' | 'medium' | 'hard',
          quiz_frequency: quizFrequency,
        };
        break;
      }
      // --- PRD-002: deploy runtime block ---
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
            if (manifest.deploy?.method === 'flash') hasEsp32 = true;
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
