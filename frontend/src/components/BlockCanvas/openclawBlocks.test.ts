import { describe, it, expect } from 'vitest';
import {
  OPENCLAW_BLOCK_DEFS,
  OPENCLAW_BLOCK_TYPES,
  OC_HUE,
  registerOpenClawBlocks,
} from './openclawBlocks';

describe('OPENCLAW_BLOCK_DEFS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(OPENCLAW_BLOCK_DEFS)).toBe(true);
    expect(OPENCLAW_BLOCK_DEFS.length).toBeGreaterThan(20);
  });

  it('every block type starts with oc_', () => {
    for (const def of OPENCLAW_BLOCK_DEFS) {
      expect(def.type).toMatch(/^oc_/);
    }
  });

  it('every block has a colour set to OC_HUE', () => {
    for (const def of OPENCLAW_BLOCK_DEFS) {
      expect(def.colour).toBe(OC_HUE);
    }
  });

  it('every block has tooltip and message0', () => {
    for (const def of OPENCLAW_BLOCK_DEFS) {
      expect(def.message0).toBeTruthy();
      expect(def.tooltip).toBeTruthy();
    }
  });

  it('every block has previousStatement or is a top-level block', () => {
    const topLevel = new Set(['oc_deploy', 'oc_validate_config', 'oc_publish_clawhub']);
    for (const def of OPENCLAW_BLOCK_DEFS) {
      if (!topLevel.has(def.type)) {
        expect(def).toHaveProperty('previousStatement');
      }
    }
  });
});

describe('OPENCLAW_BLOCK_TYPES', () => {
  it('is a Set containing all block type strings', () => {
    expect(OPENCLAW_BLOCK_TYPES).toBeInstanceOf(Set);
    expect(OPENCLAW_BLOCK_TYPES.size).toBe(OPENCLAW_BLOCK_DEFS.length);
  });

  it('contains expected block types', () => {
    expect(OPENCLAW_BLOCK_TYPES.has('oc_create_agent')).toBe(true);
    expect(OPENCLAW_BLOCK_TYPES.has('oc_connect_channel')).toBe(true);
    expect(OPENCLAW_BLOCK_TYPES.has('oc_exec_policy')).toBe(true);
    expect(OPENCLAW_BLOCK_TYPES.has('oc_cron_schedule')).toBe(true);
    expect(OPENCLAW_BLOCK_TYPES.has('oc_create_skill')).toBe(true);
    expect(OPENCLAW_BLOCK_TYPES.has('oc_deploy')).toBe(true);
  });
});

describe('Agent category blocks', () => {
  const agentBlocks = OPENCLAW_BLOCK_DEFS.filter(d => d.type.startsWith('oc_') && (
    d.type === 'oc_create_agent' || d.type === 'oc_agent_model' ||
    d.type === 'oc_agent_tools' || d.type === 'oc_agent_sandbox'
  ));

  it('has 4 agent blocks', () => {
    expect(agentBlocks.length).toBe(4);
  });

  it('oc_create_agent has AGENT_ID and PERSONALITY fields', () => {
    const def = OPENCLAW_BLOCK_DEFS.find(d => d.type === 'oc_create_agent')!;
    const fieldNames = def.args0.map((a: { name: string }) => a.name);
    expect(fieldNames).toContain('AGENT_ID');
    expect(fieldNames).toContain('PERSONALITY');
  });

  it('oc_agent_model has AGENT_ID, PRIMARY_MODEL, FALLBACK_MODEL fields', () => {
    const def = OPENCLAW_BLOCK_DEFS.find(d => d.type === 'oc_agent_model')!;
    const fieldNames = def.args0.map((a: { name: string }) => a.name);
    expect(fieldNames).toContain('AGENT_ID');
    expect(fieldNames).toContain('PRIMARY_MODEL');
    expect(fieldNames).toContain('FALLBACK_MODEL');
  });
});

describe('Channel category blocks', () => {
  it('oc_connect_channel has CHANNEL_TYPE dropdown', () => {
    const def = OPENCLAW_BLOCK_DEFS.find(d => d.type === 'oc_connect_channel')!;
    const dropdown = def.args0.find((a: { name: string }) => a.name === 'CHANNEL_TYPE');
    expect(dropdown).toBeDefined();
    expect(dropdown.type).toBe('field_dropdown');
  });

  it('oc_route_to_agent has CHANNEL and AGENT_ID fields', () => {
    const def = OPENCLAW_BLOCK_DEFS.find(d => d.type === 'oc_route_to_agent')!;
    const fieldNames = def.args0.map((a: { name: string }) => a.name);
    expect(fieldNames).toContain('CHANNEL');
    expect(fieldNames).toContain('AGENT_ID');
  });
});

describe('Security category blocks', () => {
  it('oc_security_preset has PRESET dropdown with strict/standard/permissive', () => {
    const def = OPENCLAW_BLOCK_DEFS.find(d => d.type === 'oc_security_preset')!;
    const dropdown = def.args0.find((a: { name: string }) => a.name === 'PRESET');
    expect(dropdown.type).toBe('field_dropdown');
    const values = dropdown.options.map((o: [string, string]) => o[1]);
    expect(values).toContain('strict');
    expect(values).toContain('standard');
    expect(values).toContain('permissive');
  });
});
