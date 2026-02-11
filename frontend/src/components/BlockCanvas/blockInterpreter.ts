import type { Skill, Rule } from '../Skills/types';

export interface ProjectSpec {
  project: {
    goal: string;
    description: string;
    type: string;
  };
  requirements: Array<{
    type: string;
    description: string;
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
  hardware?: {
    target: string;
    components: Array<{ type: string; [key: string]: unknown }>;
  };
  deployment: {
    target: string;
    auto_flash: boolean;
  };
  workflow: {
    review_enabled: boolean;
    testing_enabled: boolean;
    human_gates: string[];
    flow_hints?: Array<{ type: 'sequential' | 'parallel'; descriptions: string[] }>;
    iteration_conditions?: string[];
  };
  skills?: Array<{ id: string; name: string; prompt: string; category: string }>;
  rules?: Array<{ id: string; name: string; prompt: string; trigger: string }>;
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

export function interpretWorkspace(
  json: Record<string, unknown>,
  skills?: Skill[],
  rules?: Rule[],
): ProjectSpec {
  const ws = json as unknown as WorkspaceJson;
  const topBlocks = ws.blocks?.blocks ?? [];

  const spec: ProjectSpec = {
    project: { goal: '', description: '', type: 'general' },
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

  const goalBlock = topBlocks.find((b) => b.type === 'project_goal');
  if (!goalBlock) return spec;

  const chain = walkNextChain(goalBlock);

  let hasWeb = false;
  let hasEsp32 = false;

  for (const block of chain) {
    switch (block.type) {
      case 'project_goal': {
        const text = (block.fields?.GOAL_TEXT as string) ?? '';
        spec.project.goal = text;
        spec.project.description = text;
        break;
      }
      case 'project_template': {
        const tmpl = (block.fields?.TEMPLATE_TYPE as string) ?? 'general';
        spec.project.type = tmpl;
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
        spec.requirements.push({ type: 'when_then', description: `When ${trigger} happens, ${action} should happen` });
        break;
      }
      case 'has_data': {
        const text = (block.fields?.DATA_TEXT as string) ?? '';
        spec.requirements.push({ type: 'data', description: text });
        break;
      }
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
      case 'led_control': {
        const action = (block.fields?.LED_ACTION as string) ?? 'on';
        const speed = (block.fields?.LED_SPEED as string) ?? 'normal';
        if (!spec.hardware) spec.hardware = { target: 'esp32', components: [] };
        spec.hardware.components.push({ type: 'led', action, speed });
        hasEsp32 = true;
        break;
      }
      case 'button_input': {
        const pin = (block.fields?.PIN as number) ?? 12;
        if (!spec.hardware) spec.hardware = { target: 'esp32', components: [] };
        spec.hardware.components.push({ type: 'button', pin });
        hasEsp32 = true;
        break;
      }
      case 'sensor_read': {
        const sensorType = (block.fields?.SENSOR_TYPE as string) ?? 'temperature';
        if (!spec.hardware) spec.hardware = { target: 'esp32', components: [] };
        spec.hardware.components.push({ type: 'sensor', sensor_type: sensorType });
        hasEsp32 = true;
        break;
      }
      case 'lora_send': {
        const message = (block.fields?.MESSAGE as string) ?? '';
        const channel = (block.fields?.CHANNEL as number) ?? 1;
        if (!spec.hardware) spec.hardware = { target: 'esp32', components: [] };
        spec.hardware.components.push({ type: 'lora_send', message, channel });
        hasEsp32 = true;
        break;
      }
      case 'lora_receive': {
        const channel = (block.fields?.CHANNEL as number) ?? 1;
        if (!spec.hardware) spec.hardware = { target: 'esp32', components: [] };
        spec.hardware.components.push({ type: 'lora_receive', channel });
        hasEsp32 = true;
        break;
      }
      case 'timer_every': {
        const interval = (block.fields?.INTERVAL as number) ?? 5;
        if (!spec.hardware) spec.hardware = { target: 'esp32', components: [] };
        spec.hardware.components.push({ type: 'timer', interval });
        hasEsp32 = true;
        break;
      }
      case 'buzzer_play': {
        const freq = (block.fields?.FREQUENCY as number) ?? 1000;
        const duration = (block.fields?.DURATION as number) ?? 0.5;
        if (!spec.hardware) spec.hardware = { target: 'esp32', components: [] };
        spec.hardware.components.push({ type: 'buzzer', frequency: freq, duration });
        hasEsp32 = true;
        break;
      }
      case 'use_skill': {
        const skillId = (block.fields?.SKILL_ID as string) ?? '';
        if (skillId && skills) {
          const skill = skills.find(s => s.id === skillId);
          if (skill) {
            if (!spec.skills) spec.skills = [];
            spec.skills.push({ id: skill.id, name: skill.name, prompt: skill.prompt, category: skill.category });
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
      case 'deploy_web':
        hasWeb = true;
        break;
      case 'deploy_esp32':
        hasEsp32 = true;
        spec.project.type = 'hardware';
        break;
      case 'deploy_both':
        hasWeb = true;
        hasEsp32 = true;
        break;
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
