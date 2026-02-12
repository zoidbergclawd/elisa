import { describe, it, expect } from 'vitest';
import {
  buildMetaPlannerSystem,
  META_PLANNER_SYSTEM,
  metaPlannerUser,
} from './metaPlanner.js';

describe('buildMetaPlannerSystem', () => {
  it('always includes base prompt sections', () => {
    const result = buildMetaPlannerSystem({
      nugget: { goal: 'A game', type: 'software' },
    });
    expect(result).toContain('Meta-Planner for Elisa');
    expect(result).toContain('## Your Job');
    expect(result).toContain('## Task Decomposition Rules');
    expect(result).toContain('## Agent Assignment Rules');
    expect(result).toContain('## Output JSON Schema');
    expect(result).toContain('## Deployment Rules');
    expect(result).toContain('## Workflow Hints');
    expect(result).toContain('## Skills and Rules');
    expect(result).toContain('## Examples');
    expect(result).toContain('## Important');
  });

  describe('hardware section inclusion', () => {
    it('includes hardware section when nugget type is hardware', () => {
      const result = buildMetaPlannerSystem({
        nugget: { goal: 'Blink LED', type: 'hardware' },
      });
      expect(result).toContain('## Hardware Nugget Rules');
      expect(result).toContain('elisa_hardware');
      expect(result).toContain('py_compile');
    });

    it('includes hardware section when deploy target is esp32', () => {
      const result = buildMetaPlannerSystem({
        nugget: { goal: 'IoT sensor', type: 'software' },
        deployment: { target: 'esp32' },
      });
      expect(result).toContain('## Hardware Nugget Rules');
    });

    it('includes hardware section when deploy target is both', () => {
      const result = buildMetaPlannerSystem({
        nugget: { goal: 'IoT dashboard', type: 'software' },
        deployment: { target: 'both' },
      });
      expect(result).toContain('## Hardware Nugget Rules');
    });

    it('excludes hardware section for software type with preview target', () => {
      const result = buildMetaPlannerSystem({
        nugget: { goal: 'A game', type: 'software' },
        deployment: { target: 'preview' },
      });
      expect(result).not.toContain('## Hardware Nugget Rules');
    });

    it('excludes hardware section for software type with web target', () => {
      const result = buildMetaPlannerSystem({
        nugget: { goal: 'A site', type: 'software' },
        deployment: { target: 'web' },
      });
      expect(result).not.toContain('## Hardware Nugget Rules');
    });

    it('excludes hardware section when deploy target is absent', () => {
      const result = buildMetaPlannerSystem({
        nugget: { goal: 'A game', type: 'software' },
      });
      expect(result).not.toContain('## Hardware Nugget Rules');
    });
  });

  describe('portal section inclusion', () => {
    it('includes portal section when portals array is non-empty', () => {
      const result = buildMetaPlannerSystem({
        nugget: { goal: 'Weather app', type: 'software' },
        portals: [{ name: 'weather', mechanism: 'mcp' }],
      });
      expect(result).toContain('## Portals');
      expect(result).toContain('serial');
      expect(result).toContain('mcp');
      expect(result).toContain('cli');
    });

    it('excludes portal section when portals array is empty', () => {
      const result = buildMetaPlannerSystem({
        nugget: { goal: 'A game', type: 'software' },
        portals: [],
      });
      expect(result).not.toContain('## Portals');
    });

    it('excludes portal section when portals is missing', () => {
      const result = buildMetaPlannerSystem({
        nugget: { goal: 'A game', type: 'software' },
      });
      expect(result).not.toContain('## Portals');
    });

    it('excludes portal section when portals is not an array', () => {
      const result = buildMetaPlannerSystem({
        nugget: { goal: 'A game', type: 'software' },
        portals: 'not-an-array',
      });
      expect(result).not.toContain('## Portals');
    });
  });

  describe('combined hardware and portal sections', () => {
    it('includes both when both conditions are met', () => {
      const result = buildMetaPlannerSystem({
        nugget: { goal: 'IoT weather station', type: 'hardware' },
        deployment: { target: 'esp32' },
        portals: [{ name: 'sensor-api', mechanism: 'mcp' }],
      });
      expect(result).toContain('## Hardware Nugget Rules');
      expect(result).toContain('## Portals');
    });

    it('hardware section comes before portal section', () => {
      const result = buildMetaPlannerSystem({
        nugget: { goal: 'IoT', type: 'hardware' },
        portals: [{ name: 'api', mechanism: 'mcp' }],
      });
      const hwIdx = result.indexOf('## Hardware Nugget Rules');
      const portalIdx = result.indexOf('## Portals');
      expect(hwIdx).toBeLessThan(portalIdx);
    });
  });

  it('defaults nugget type to software when missing', () => {
    const result = buildMetaPlannerSystem({});
    expect(result).not.toContain('## Hardware Nugget Rules');
  });

  it('defaults deploy target to preview when missing', () => {
    const result = buildMetaPlannerSystem({
      nugget: { goal: 'Test' },
    });
    expect(result).not.toContain('## Hardware Nugget Rules');
  });

  it('examples section appears after conditional sections', () => {
    const result = buildMetaPlannerSystem({
      nugget: { type: 'hardware' },
      portals: [{ name: 'x', mechanism: 'cli' }],
    });
    const hwIdx = result.indexOf('## Hardware Nugget Rules');
    const portalIdx = result.indexOf('## Portals');
    const examplesIdx = result.indexOf('## Examples');
    expect(hwIdx).toBeLessThan(examplesIdx);
    expect(portalIdx).toBeLessThan(examplesIdx);
  });

  it('footer (## Important) is always last', () => {
    const result = buildMetaPlannerSystem({
      nugget: { goal: 'Test', type: 'software' },
    });
    const importantIdx = result.indexOf('## Important');
    const examplesIdx = result.indexOf('## Examples');
    expect(importantIdx).toBeGreaterThan(examplesIdx);
  });
});

describe('META_PLANNER_SYSTEM (deprecated constant)', () => {
  it('includes all sections unconditionally', () => {
    expect(META_PLANNER_SYSTEM).toContain('Meta-Planner for Elisa');
    expect(META_PLANNER_SYSTEM).toContain('## Hardware Nugget Rules');
    expect(META_PLANNER_SYSTEM).toContain('## Portals');
    expect(META_PLANNER_SYSTEM).toContain('## Examples');
    expect(META_PLANNER_SYSTEM).toContain('## Important');
  });
});

describe('metaPlannerUser', () => {
  it('wraps spec JSON into a user prompt', () => {
    const spec = JSON.stringify({ nugget: { goal: 'A game' } });
    const result = metaPlannerUser(spec);
    expect(result).toContain("kid's nugget specification");
    expect(result).toContain('NuggetSpec:');
    expect(result).toContain(spec);
  });

  it('preserves exact JSON content', () => {
    const spec = '{"nugget":{"goal":"Test","type":"software"},"portals":[]}';
    const result = metaPlannerUser(spec);
    expect(result).toContain(spec);
  });
});
