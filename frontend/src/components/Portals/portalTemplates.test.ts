import { describe, it, expect } from 'vitest';
import { portalTemplates } from './portalTemplates';

describe('portalTemplates', () => {
  it('contains at least 3 templates', () => {
    expect(portalTemplates.length).toBeGreaterThanOrEqual(3);
  });

  it('each template has required fields', () => {
    for (const t of portalTemplates) {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(typeof t.mechanism).toBe('string');
      expect(t.status).toBe('unconfigured');
      expect(Array.isArray(t.capabilities)).toBe(true);
      expect(t.capabilities.length).toBeGreaterThan(0);
    }
  });

  it('ESP32 Board template has serial mechanism', () => {
    const esp = portalTemplates.find(t => t.name === 'ESP32 Board');
    expect(esp).toBeDefined();
    expect(esp!.mechanism).toBe('serial');
    expect(esp!.serialConfig).toBeDefined();
    expect(esp!.templateId).toBe('esp32');
  });

  it('LoRa Radio template has serial mechanism', () => {
    const lora = portalTemplates.find(t => t.name === 'LoRa Radio');
    expect(lora).toBeDefined();
    expect(lora!.mechanism).toBe('serial');
    expect(lora!.templateId).toBe('lora');
  });

  it('File System template has mcp mechanism', () => {
    const fs = portalTemplates.find(t => t.name === 'File System');
    expect(fs).toBeDefined();
    expect(fs!.mechanism).toBe('mcp');
    expect(fs!.mcpConfig).toBeDefined();
    expect(fs!.templateId).toBe('filesystem');
  });

  it('capabilities have required fields', () => {
    for (const t of portalTemplates) {
      for (const cap of t.capabilities) {
        expect(cap.id).toBeTruthy();
        expect(cap.name).toBeTruthy();
        expect(['action', 'event', 'query']).toContain(cap.kind);
        expect(cap.description).toBeTruthy();
      }
    }
  });

  it('templates do not have an id field (id assigned at instantiation)', () => {
    for (const t of portalTemplates) {
      expect((t as any).id).toBeUndefined();
    }
  });

  it('templates have diverse capability kinds', () => {
    const allKinds = new Set<string>();
    for (const t of portalTemplates) {
      for (const cap of t.capabilities) {
        allKinds.add(cap.kind);
      }
    }
    expect(allKinds.size).toBeGreaterThanOrEqual(3);
  });
});
