/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { interpretOpenClawBlocks, type OpenClawConfig } from './openclawInterpreter';

function makeWorkspace(blocks: unknown[]) {
  return { blocks: { blocks } };
}

function goalBlock(text: string, next?: unknown) {
  return {
    type: 'nugget_goal',
    fields: { GOAL_TEXT: text },
    ...(next ? { next: { block: next } } : {}),
  };
}

function chainBlocks(first: Record<string, unknown>, ...rest: Record<string, unknown>[]) {
  if (rest.length === 0) return first;
  let current = first;
  for (const block of rest) {
    current.next = { block };
    current = block;
  }
  return first;
}

describe('interpretOpenClawBlocks', () => {
  it('returns empty config for workspace with no oc_ blocks', () => {
    const ws = makeWorkspace([goalBlock('test')]);
    const config = interpretOpenClawBlocks(ws);
    expect(config).toBeNull();
  });

  it('extracts oc_create_agent', () => {
    const ws = makeWorkspace([
      chainBlocks(
        goalBlock('test'),
        { type: 'oc_create_agent', fields: { AGENT_ID: 'research-bot', PERSONALITY: 'A thorough researcher' } },
      ),
    ]);
    const config = interpretOpenClawBlocks(ws)!;
    expect(config.agents).toHaveLength(1);
    expect(config.agents![0].id).toBe('research-bot');
    expect(config.agents![0].personality).toBe('A thorough researcher');
  });

  it('merges oc_agent_model into existing agent', () => {
    const ws = makeWorkspace([
      chainBlocks(
        goalBlock('test'),
        { type: 'oc_create_agent', fields: { AGENT_ID: 'bot', PERSONALITY: 'Helper' } },
        { type: 'oc_agent_model', fields: { AGENT_ID: 'bot', PRIMARY_MODEL: 'anthropic/claude-opus-4-6', FALLBACK_MODEL: 'anthropic/claude-sonnet-4-5' } },
      ),
    ]);
    const config = interpretOpenClawBlocks(ws)!;
    expect(config.agents![0].model?.primary).toBe('anthropic/claude-opus-4-6');
    expect(config.agents![0].model?.fallbacks).toEqual(['anthropic/claude-sonnet-4-5']);
  });

  it('extracts oc_connect_channel', () => {
    const ws = makeWorkspace([
      chainBlocks(
        goalBlock('test'),
        { type: 'oc_connect_channel', fields: { CHANNEL_TYPE: 'telegram' } },
      ),
    ]);
    const config = interpretOpenClawBlocks(ws)!;
    expect(config.channels?.telegram?.enabled).toBe(true);
  });

  it('extracts oc_dm_policy', () => {
    const ws = makeWorkspace([
      chainBlocks(
        goalBlock('test'),
        { type: 'oc_dm_policy', fields: { CHANNEL: 'telegram', POLICY: 'allowlist', ALLOW_FROM: 'tg:123, tg:456' } },
      ),
    ]);
    const config = interpretOpenClawBlocks(ws)!;
    expect(config.channels?.telegram?.dmPolicy).toBe('allowlist');
    expect(config.channels?.telegram?.allowFrom).toEqual(['tg:123', 'tg:456']);
  });

  it('extracts oc_route_to_agent', () => {
    const ws = makeWorkspace([
      chainBlocks(
        goalBlock('test'),
        { type: 'oc_route_to_agent', fields: { CHANNEL: 'telegram', MATCH_TYPE: 'all', MATCH_VALUE: '', AGENT_ID: 'bot' } },
      ),
    ]);
    const config = interpretOpenClawBlocks(ws)!;
    expect(config.bindings).toHaveLength(1);
    expect(config.bindings![0].agentId).toBe('bot');
    expect(config.bindings![0].match.channel).toBe('telegram');
  });

  it('extracts oc_route_to_agent with peer match', () => {
    const ws = makeWorkspace([
      chainBlocks(
        goalBlock('test'),
        { type: 'oc_route_to_agent', fields: { CHANNEL: 'whatsapp', MATCH_TYPE: 'peer', MATCH_VALUE: 'wa:123', AGENT_ID: 'personal' } },
      ),
    ]);
    const config = interpretOpenClawBlocks(ws)!;
    expect(config.bindings![0].match.peer).toBe('wa:123');
  });

  it('extracts oc_exec_policy', () => {
    const ws = makeWorkspace([
      chainBlocks(
        goalBlock('test'),
        { type: 'oc_create_agent', fields: { AGENT_ID: 'bot', PERSONALITY: 'test' } },
        { type: 'oc_exec_policy', fields: { AGENT_ID: 'bot', POLICY: 'deny' } },
      ),
    ]);
    const config = interpretOpenClawBlocks(ws)!;
    expect(config.agents![0].tools?.exec?.security).toBe('deny');
  });

  it('extracts oc_security_preset strict', () => {
    const ws = makeWorkspace([
      chainBlocks(
        goalBlock('test'),
        { type: 'oc_security_preset', fields: { PRESET: 'strict' } },
      ),
    ]);
    const config = interpretOpenClawBlocks(ws)!;
    expect(config.security?.gateway?.bind).toBe('loopback');
    expect(config.security?.session?.dmScope).toBe('per-channel-peer');
  });

  it('extracts oc_cron_schedule', () => {
    const ws = makeWorkspace([
      chainBlocks(
        goalBlock('test'),
        { type: 'oc_cron_schedule', fields: { SCHEDULE: '0 9 * * *', SKILL: 'daily-summary', AGENT_ID: 'main' } },
      ),
    ]);
    const config = interpretOpenClawBlocks(ws)!;
    expect(config.cron?.enabled).toBe(true);
    expect(config.cron?.jobs).toHaveLength(1);
    expect(config.cron?.jobs![0].schedule).toBe('0 9 * * *');
  });

  it('extracts oc_webhook', () => {
    const ws = makeWorkspace([
      chainBlocks(
        goalBlock('test'),
        { type: 'oc_webhook', fields: { WEBHOOK_PATH: 'github', SKILL: 'pr-review', AGENT_ID: 'dev-bot' } },
      ),
    ]);
    const config = interpretOpenClawBlocks(ws)!;
    expect(config.hooks?.enabled).toBe(true);
    expect(config.hooks?.mappings).toHaveLength(1);
  });

  it('extracts oc_create_skill', () => {
    const ws = makeWorkspace([
      chainBlocks(
        goalBlock('test'),
        { type: 'oc_create_skill', fields: { SKILL_NAME: 'translate', DESCRIPTION: 'Translate to Spanish' } },
      ),
    ]);
    const config = interpretOpenClawBlocks(ws)!;
    expect(config.skills).toHaveLength(1);
    expect(config.skills![0].name).toBe('translate');
  });

  it('extracts oc_skill_requirements and merges into skill', () => {
    const ws = makeWorkspace([
      chainBlocks(
        goalBlock('test'),
        { type: 'oc_create_skill', fields: { SKILL_NAME: 'code-review', DESCRIPTION: 'Review PRs' } },
        { type: 'oc_skill_requirements', fields: { SKILL_NAME: 'code-review', BINS: 'gh', ENV_VARS: 'GITHUB_TOKEN' } },
      ),
    ]);
    const config = interpretOpenClawBlocks(ws)!;
    const meta = config.skills![0].metadata as any;
    expect(meta.openclaw.requires.bins).toEqual(['gh']);
    expect(meta.openclaw.requires.env).toEqual(['GITHUB_TOKEN']);
  });

  it('extracts oc_session_isolation', () => {
    const ws = makeWorkspace([
      chainBlocks(
        goalBlock('test'),
        { type: 'oc_session_isolation', fields: { SCOPE: 'per-channel-peer' } },
      ),
    ]);
    const config = interpretOpenClawBlocks(ws)!;
    expect(config.security?.session?.dmScope).toBe('per-channel-peer');
  });

  it('handles multiple blocks composing a full config', () => {
    const ws = makeWorkspace([
      chainBlocks(
        goalBlock('My OpenClaw setup'),
        { type: 'oc_create_agent', fields: { AGENT_ID: 'personal', PERSONALITY: 'Helpful' } },
        { type: 'oc_connect_channel', fields: { CHANNEL_TYPE: 'whatsapp' } },
        { type: 'oc_route_to_agent', fields: { CHANNEL: 'whatsapp', MATCH_TYPE: 'all', MATCH_VALUE: '', AGENT_ID: 'personal' } },
        { type: 'oc_security_preset', fields: { PRESET: 'strict' } },
        { type: 'oc_deploy', fields: {} },
      ),
    ]);
    const config = interpretOpenClawBlocks(ws)!;
    expect(config.agents).toHaveLength(1);
    expect(config.channels?.whatsapp?.enabled).toBe(true);
    expect(config.bindings).toHaveLength(1);
    expect(config.security?.gateway?.bind).toBe('loopback');
    expect(config.deploy).toBe(true);
  });
});
