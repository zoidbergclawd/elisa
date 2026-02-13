/** Tests for portal templates. */

import { describe, it, expect } from 'vitest';
import { portalTemplates } from './portalTemplates';

describe('portalTemplates', () => {
  it('contains all expected templates', () => {
    const ids = portalTemplates.map((t) => t.templateId);
    expect(ids).toContain('esp32');
    expect(ids).toContain('lora');
    expect(ids).toContain('filesystem');
    expect(ids).toContain('github');
    expect(ids).toContain('brave-search');
  });

  it('has unique templateIds', () => {
    const ids = portalTemplates.map((t) => t.templateId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has non-empty capabilities for all templates', () => {
    for (const template of portalTemplates) {
      expect(template.capabilities.length).toBeGreaterThan(0);
    }
  });

  it('has unique capability ids within each template', () => {
    for (const template of portalTemplates) {
      const capIds = template.capabilities.map((c) => c.id);
      expect(new Set(capIds).size).toBe(capIds.length);
    }
  });

  it('all templates have required fields', () => {
    for (const t of portalTemplates) {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(typeof t.mechanism).toBe('string');
      expect(t.status).toBe('unconfigured');
      expect(t.templateId).toBeTruthy();
    }
  });

  it('capabilities have valid kinds', () => {
    for (const t of portalTemplates) {
      for (const cap of t.capabilities) {
        expect(cap.id).toBeTruthy();
        expect(cap.name).toBeTruthy();
        expect(['action', 'event', 'query']).toContain(cap.kind);
        expect(cap.description).toBeTruthy();
      }
    }
  });

  it('templates do not have an id field', () => {
    for (const t of portalTemplates) {
      expect((t as Record<string, unknown>).id).toBeUndefined();
    }
  });

  describe('GitHub template', () => {
    const github = portalTemplates.find((t) => t.templateId === 'github')!;

    it('exists and uses MCP mechanism', () => {
      expect(github).toBeDefined();
      expect(github.mechanism).toBe('mcp');
    });

    it('uses npx with @modelcontextprotocol/server-github', () => {
      expect(github.mcpConfig?.command).toBe('npx');
      expect(github.mcpConfig?.args).toContain('@modelcontextprotocol/server-github');
    });

    it('has create-issue, read-repo, and search-code capabilities', () => {
      const capIds = github.capabilities.map((c) => c.id);
      expect(capIds).toContain('create-issue');
      expect(capIds).toContain('read-repo');
      expect(capIds).toContain('search-code');
    });

    it('includes GITHUB_PERSONAL_ACCESS_TOKEN env placeholder', () => {
      expect(github.mcpConfig?.env).toBeDefined();
      expect(github.mcpConfig?.env).toHaveProperty('GITHUB_PERSONAL_ACCESS_TOKEN');
    });
  });

  describe('Brave Search template', () => {
    const brave = portalTemplates.find((t) => t.templateId === 'brave-search')!;

    it('exists and uses MCP mechanism', () => {
      expect(brave).toBeDefined();
      expect(brave.mechanism).toBe('mcp');
    });

    it('uses npx with @modelcontextprotocol/server-brave-search', () => {
      expect(brave.mcpConfig?.command).toBe('npx');
      expect(brave.mcpConfig?.args).toContain('@modelcontextprotocol/server-brave-search');
    });

    it('has web-search and local-search capabilities', () => {
      const capIds = brave.capabilities.map((c) => c.id);
      expect(capIds).toContain('web-search');
      expect(capIds).toContain('local-search');
    });

    it('includes BRAVE_API_KEY env placeholder', () => {
      expect(brave.mcpConfig?.env).toBeDefined();
      expect(brave.mcpConfig?.env).toHaveProperty('BRAVE_API_KEY');
    });
  });
});
