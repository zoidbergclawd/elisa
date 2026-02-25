import { describe, it, expect } from 'vitest';
import { NuggetSpecSchema } from '../../utils/specValidator.js';

describe('NuggetSpec openclawConfig field', () => {
  const base = {
    nugget: { goal: 'test', type: 'general', description: 'test' },
  };

  it('accepts NuggetSpec without openclawConfig (backward compatible)', () => {
    const result = NuggetSpecSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it('accepts NuggetSpec with minimal openclawConfig', () => {
    const result = NuggetSpecSchema.safeParse({
      ...base,
      openclawConfig: { agents: [], channels: {}, bindings: [] },
    });
    expect(result.success).toBe(true);
  });

  it('accepts full agent configuration', () => {
    const result = NuggetSpecSchema.safeParse({
      ...base,
      openclawConfig: {
        agents: [{
          id: 'research-bot',
          workspace: '~/.openclaw/workspaces/research-bot',
          personality: 'A thorough researcher',
          model: { primary: 'anthropic/claude-opus-4-6', fallbacks: ['anthropic/claude-sonnet-4-5'] },
          tools: {
            profile: 'messaging',
            allow: ['browser', 'web_search'],
            deny: ['exec'],
            exec: { security: 'deny', safeBins: [] },
            fs: { workspaceOnly: true },
            elevated: { enabled: false, allowFrom: [] },
          },
          sandbox: { mode: 'all', scope: 'agent', workspaceAccess: 'ro' },
        }],
        channels: {},
        bindings: [],
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts channel configurations', () => {
    const result = NuggetSpecSchema.safeParse({
      ...base,
      openclawConfig: {
        agents: [],
        channels: {
          telegram: { enabled: true, botToken: 'TOKEN', dmPolicy: 'allowlist', allowFrom: ['tg:123'] },
          whatsapp: { enabled: true, dmPolicy: 'pairing' },
          discord: { enabled: true, groups: { '*': { requireMention: true, mentionPatterns: ['@bot'] } } },
        },
        bindings: [],
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts binding configurations', () => {
    const result = NuggetSpecSchema.safeParse({
      ...base,
      openclawConfig: {
        agents: [],
        channels: {},
        bindings: [
          { agentId: 'bot', match: { channel: 'telegram' } },
          { agentId: 'bot', match: { channel: 'whatsapp', peer: 'wa:123' } },
          { agentId: 'bot', match: { channel: 'discord', guild: 'my-server' } },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts security configuration', () => {
    const result = NuggetSpecSchema.safeParse({
      ...base,
      openclawConfig: {
        agents: [],
        channels: {},
        bindings: [],
        security: {
          gateway: { bind: 'loopback', auth: { mode: 'token' } },
          session: { dmScope: 'per-channel-peer' },
          browser: { ssrfPolicy: { dangerouslyAllowPrivateNetwork: false, hostnameAllowlist: ['*.github.com'] } },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts cron and hooks configurations', () => {
    const result = NuggetSpecSchema.safeParse({
      ...base,
      openclawConfig: {
        agents: [],
        channels: {},
        bindings: [],
        cron: {
          enabled: true,
          jobs: [{ schedule: '0 9 * * *', skill: 'daily-summary', agentId: 'main', sessionKey: 'cron:daily' }],
        },
        hooks: {
          enabled: true,
          token: 'secret',
          path: '/hooks',
          mappings: [{ match: { path: 'github' }, action: 'agent', agentId: 'dev-bot', deliver: true }],
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts skills array in openclawConfig', () => {
    const result = NuggetSpecSchema.safeParse({
      ...base,
      openclawConfig: {
        agents: [],
        channels: {},
        bindings: [],
        skills: [{
          name: 'translate-spanish',
          description: 'Translate text to Spanish',
          userInvocable: true,
          metadata: { openclaw: { emoji: '🇪🇸' } },
          body: 'When the user asks...',
        }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown keys inside openclawConfig', () => {
    const result = NuggetSpecSchema.safeParse({
      ...base,
      openclawConfig: {
        agents: [],
        channels: {},
        bindings: [],
        unknownKey: 'bad',
      },
    });
    expect(result.success).toBe(false);
  });

  it('caps agent ID length at 200', () => {
    const result = NuggetSpecSchema.safeParse({
      ...base,
      openclawConfig: {
        agents: [{ id: 'a'.repeat(201) }],
        channels: {},
        bindings: [],
      },
    });
    expect(result.success).toBe(false);
  });
});
