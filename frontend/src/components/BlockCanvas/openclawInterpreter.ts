/** Interpreter for OpenClaw blocks. Walks workspace JSON and compiles oc_* blocks
 * into an OpenClawConfig object matching the backend Zod schema. */

import { OPENCLAW_BLOCK_TYPES } from './openclawBlocks';

// --- Types matching backend OpenClawConfig schema ---

export interface OcAgent {
  id: string;
  workspace?: string;
  personality?: string;
  model?: { primary?: string; fallbacks?: string[] };
  tools?: {
    profile?: string;
    allow?: string[];
    deny?: string[];
    exec?: { security?: string; safeBins?: string[] };
    fs?: { workspaceOnly?: boolean };
    elevated?: { enabled?: boolean; allowFrom?: string[] };
  };
  sandbox?: { mode?: string; scope?: string; workspaceAccess?: string };
}

export interface OcChannel {
  enabled?: boolean;
  botToken?: string;
  dmPolicy?: string;
  allowFrom?: string[];
  groups?: Record<string, { requireMention?: boolean; mentionPatterns?: string[] }>;
}

export interface OcBinding {
  agentId: string;
  match: { channel?: string; peer?: string; guild?: string; accountId?: string };
}

export interface OcSkill {
  name: string;
  description: string;
  userInvocable?: boolean;
  disableModelInvocation?: boolean;
  metadata?: Record<string, unknown>;
  body?: string;
}

export interface OpenClawConfig {
  agents?: OcAgent[];
  channels?: Record<string, OcChannel>;
  bindings?: OcBinding[];
  security?: {
    gateway?: { bind?: string; auth?: { mode?: string; token?: string } };
    session?: { dmScope?: string };
    browser?: { ssrfPolicy?: { dangerouslyAllowPrivateNetwork?: boolean; hostnameAllowlist?: string[] } };
  };
  cron?: { enabled?: boolean; jobs?: Array<{ schedule: string; skill: string; agentId: string; sessionKey?: string }> };
  hooks?: { enabled?: boolean; token?: string; path?: string; mappings?: Array<{ match: { path: string }; action: string; agentId: string; deliver?: boolean }> };
  skills?: OcSkill[];
  deploy?: boolean;
  validate?: boolean;
  publish?: string[];
}

// --- Block JSON types ---

interface BlockJson {
  type: string;
  fields?: Record<string, unknown>;
  inputs?: Record<string, { block: BlockJson }>;
  next?: { block: BlockJson };
}

interface WorkspaceJson {
  blocks?: { blocks?: BlockJson[] };
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

function parseCSV(value: string | undefined): string[] {
  if (!value || value.trim() === '') return [];
  return value.split(',').map(s => s.trim()).filter(Boolean);
}

function getOrCreateAgent(config: OpenClawConfig, agentId: string): OcAgent {
  if (!config.agents) config.agents = [];
  let agent = config.agents.find(a => a.id === agentId);
  if (!agent) {
    agent = { id: agentId };
    config.agents.push(agent);
  }
  return agent;
}

function getOrCreateChannel(config: OpenClawConfig, channel: string): OcChannel {
  if (!config.channels) config.channels = {};
  if (!config.channels[channel]) config.channels[channel] = {};
  return config.channels[channel];
}

function getOrCreateSkill(config: OpenClawConfig, name: string): OcSkill {
  if (!config.skills) config.skills = [];
  let skill = config.skills.find(s => s.name === name);
  if (!skill) {
    skill = { name, description: '' };
    config.skills.push(skill);
  }
  return skill;
}

const SECURITY_PRESETS: Record<string, Partial<OpenClawConfig['security']>> = {
  strict: {
    gateway: { bind: 'loopback', auth: { mode: 'token' } },
    session: { dmScope: 'per-channel-peer' },
    browser: { ssrfPolicy: { dangerouslyAllowPrivateNetwork: false } },
  },
  standard: {
    gateway: { bind: 'loopback', auth: { mode: 'token' } },
    session: { dmScope: 'per-peer' },
  },
  permissive: {
    gateway: { auth: { mode: 'token' } },
  },
};

/** Interpret all oc_* blocks in a workspace into an OpenClawConfig.
 * Returns null if no OpenClaw blocks found. */
export function interpretOpenClawBlocks(
  json: Record<string, unknown>,
): OpenClawConfig | null {
  const ws = json as unknown as WorkspaceJson;
  const topBlocks = ws.blocks?.blocks ?? [];

  const allBlocks: BlockJson[] = [];
  for (const top of topBlocks) {
    const chain = walkNextChain(top);
    allBlocks.push(...chain);
  }

  const ocBlocks = allBlocks.filter(b => OPENCLAW_BLOCK_TYPES.has(b.type));
  if (ocBlocks.length === 0) return null;

  const config: OpenClawConfig = {};

  for (const block of allBlocks) {
    const f = block.fields ?? {};

    switch (block.type) {
      case 'oc_create_agent': {
        const agent = getOrCreateAgent(config, (f.AGENT_ID as string) ?? 'main');
        agent.personality = (f.PERSONALITY as string) ?? '';
        agent.workspace = `~/.openclaw/workspaces/${agent.id}`;
        break;
      }
      case 'oc_agent_model': {
        const agent = getOrCreateAgent(config, (f.AGENT_ID as string) ?? 'main');
        agent.model = {
          primary: (f.PRIMARY_MODEL as string) ?? undefined,
          fallbacks: (f.FALLBACK_MODEL as string) ? [(f.FALLBACK_MODEL as string)] : undefined,
        };
        break;
      }
      case 'oc_agent_tools': {
        const agent = getOrCreateAgent(config, (f.AGENT_ID as string) ?? 'main');
        agent.tools = {
          ...agent.tools,
          profile: (f.PROFILE as string) ?? undefined,
          allow: parseCSV(f.ALLOW_TOOLS as string) || undefined,
          deny: parseCSV(f.DENY_TOOLS as string) || undefined,
        };
        if (agent.tools.allow?.length === 0) delete agent.tools.allow;
        if (agent.tools.deny?.length === 0) delete agent.tools.deny;
        break;
      }
      case 'oc_agent_sandbox': {
        const agent = getOrCreateAgent(config, (f.AGENT_ID as string) ?? 'main');
        agent.sandbox = {
          mode: (f.MODE as string) ?? 'off',
          scope: 'agent',
          workspaceAccess: (f.WORKSPACE_ACCESS as string) ?? 'rw',
        };
        break;
      }
      case 'oc_connect_channel': {
        const ch = getOrCreateChannel(config, (f.CHANNEL_TYPE as string) ?? 'telegram');
        ch.enabled = true;
        break;
      }
      case 'oc_dm_policy': {
        const ch = getOrCreateChannel(config, (f.CHANNEL as string) ?? 'telegram');
        ch.dmPolicy = (f.POLICY as string) ?? 'pairing';
        const allowFrom = parseCSV(f.ALLOW_FROM as string);
        if (allowFrom.length > 0) ch.allowFrom = allowFrom;
        break;
      }
      case 'oc_group_mentions': {
        const ch = getOrCreateChannel(config, (f.CHANNEL as string) ?? 'discord');
        const patterns = parseCSV(f.PATTERNS as string);
        ch.groups = { '*': { requireMention: true, mentionPatterns: patterns } };
        break;
      }
      case 'oc_route_to_agent': {
        if (!config.bindings) config.bindings = [];
        const match: OcBinding['match'] = { channel: (f.CHANNEL as string) ?? undefined };
        const matchType = (f.MATCH_TYPE as string) ?? 'all';
        const matchValue = (f.MATCH_VALUE as string) ?? '';
        if (matchType === 'peer' && matchValue) match.peer = matchValue;
        if (matchType === 'guild' && matchValue) match.guild = matchValue;
        config.bindings.push({ agentId: (f.AGENT_ID as string) ?? 'main', match });
        break;
      }
      case 'oc_session_isolation': {
        if (!config.security) config.security = {};
        if (!config.security.session) config.security.session = {};
        config.security.session.dmScope = (f.SCOPE as string) ?? 'per-channel-peer';
        break;
      }
      case 'oc_exec_policy': {
        const agent = getOrCreateAgent(config, (f.AGENT_ID as string) ?? 'main');
        if (!agent.tools) agent.tools = {};
        agent.tools.exec = { security: (f.POLICY as string) ?? 'deny' };
        break;
      }
      case 'oc_allow_commands': {
        const agent = getOrCreateAgent(config, (f.AGENT_ID as string) ?? 'main');
        if (!agent.tools) agent.tools = {};
        if (!agent.tools.exec) agent.tools.exec = {};
        agent.tools.exec.security = agent.tools.exec.security ?? 'ask';
        agent.tools.exec.safeBins = parseCSV(f.COMMANDS as string);
        break;
      }
      case 'oc_fs_restriction': {
        const agent = getOrCreateAgent(config, (f.AGENT_ID as string) ?? 'main');
        if (!agent.tools) agent.tools = {};
        agent.tools.fs = { workspaceOnly: f.WORKSPACE_ONLY === true || f.WORKSPACE_ONLY === 'TRUE' };
        break;
      }
      case 'oc_elevated_access': {
        const agent = getOrCreateAgent(config, (f.AGENT_ID as string) ?? 'main');
        if (!agent.tools) agent.tools = {};
        agent.tools.elevated = {
          enabled: f.ENABLED === true || f.ENABLED === 'TRUE',
          allowFrom: parseCSV(f.ALLOW_FROM as string),
        };
        break;
      }
      case 'oc_browser_policy': {
        if (!config.security) config.security = {};
        config.security.browser = {
          ssrfPolicy: {
            dangerouslyAllowPrivateNetwork: f.ALLOW_PRIVATE === true || f.ALLOW_PRIVATE === 'TRUE',
            hostnameAllowlist: parseCSV(f.HOSTS as string),
          },
        };
        break;
      }
      case 'oc_security_preset': {
        const preset = SECURITY_PRESETS[(f.PRESET as string) ?? 'strict'];
        if (preset) {
          config.security = { ...config.security, ...preset };
        }
        break;
      }
      case 'oc_cron_schedule': {
        if (!config.cron) config.cron = { enabled: true, jobs: [] };
        config.cron.enabled = true;
        config.cron.jobs!.push({
          schedule: (f.SCHEDULE as string) ?? '0 9 * * *',
          skill: (f.SKILL as string) ?? '',
          agentId: (f.AGENT_ID as string) ?? 'main',
          sessionKey: `cron:${(f.SKILL as string) ?? 'job'}`,
        });
        break;
      }
      case 'oc_webhook': {
        if (!config.hooks) config.hooks = { enabled: true, path: '/hooks', mappings: [] };
        config.hooks.enabled = true;
        config.hooks.mappings!.push({
          match: { path: (f.WEBHOOK_PATH as string) ?? '' },
          action: 'agent',
          agentId: (f.AGENT_ID as string) ?? 'main',
          deliver: true,
        });
        break;
      }
      case 'oc_message_trigger': {
        const skill = getOrCreateSkill(config, (f.SKILL as string) ?? 'trigger-skill');
        skill.description = `Triggered when message matches "${(f.PATTERN as string) ?? ''}" on ${(f.CHANNEL as string) ?? 'any'}`;
        break;
      }
      case 'oc_create_skill': {
        const skill = getOrCreateSkill(config, (f.SKILL_NAME as string) ?? 'my-skill');
        skill.description = (f.DESCRIPTION as string) ?? '';
        break;
      }
      case 'oc_skill_requirements': {
        const skill = getOrCreateSkill(config, (f.SKILL_NAME as string) ?? 'my-skill');
        const bins = parseCSV(f.BINS as string);
        const envVars = parseCSV(f.ENV_VARS as string);
        skill.metadata = {
          openclaw: {
            requires: {
              ...(bins.length > 0 ? { bins } : {}),
              ...(envVars.length > 0 ? { env: envVars } : {}),
            },
            ...(envVars.length > 0 ? { primaryEnv: envVars[0] } : {}),
          },
        };
        break;
      }
      case 'oc_skill_invocation': {
        const skill = getOrCreateSkill(config, (f.SKILL_NAME as string) ?? 'my-skill');
        const mode = (f.MODE as string) ?? 'both';
        skill.userInvocable = mode === 'both' || mode === 'user';
        skill.disableModelInvocation = mode === 'user';
        break;
      }
      case 'oc_deploy':
        config.deploy = true;
        break;
      case 'oc_validate_config':
        config.validate = true;
        break;
      case 'oc_publish_clawhub': {
        if (!config.publish) config.publish = [];
        config.publish.push((f.SKILL_NAME as string) ?? '');
        break;
      }
    }
  }

  return config;
}
