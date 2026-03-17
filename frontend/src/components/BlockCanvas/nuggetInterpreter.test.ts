import { describe, it, expect } from 'vitest';
import { interpretCompositionWorkspace } from './nuggetInterpreter';

function makeCompositionWorkspace(topBlocks: unknown[]) {
  return { blocks: { blocks: topBlocks } };
}

function nuggetBlock(nuggetId: string, next?: unknown) {
  return {
    type: 'nugget_ref',
    fields: { NUGGET_ID: nuggetId },
    ...(next ? { next: { block: next } } : {}),
  };
}

describe('nuggetInterpreter', () => {
  describe('interpretCompositionWorkspace', () => {
    it('returns empty result for empty workspace', () => {
      const result = interpretCompositionWorkspace(makeCompositionWorkspace([]));
      expect(result.nuggetIds).toEqual([]);
      expect(result.placements).toEqual([]);
      expect(result.parallelGroups).toBe(0);
    });

    it('interprets a single nugget block', () => {
      const ws = makeCompositionWorkspace([
        nuggetBlock('web-dashboard'),
      ]);
      const result = interpretCompositionWorkspace(ws);
      expect(result.nuggetIds).toEqual(['web-dashboard']);
      expect(result.placements).toEqual([
        { nuggetId: 'web-dashboard', group: 0, position: 0 },
      ]);
      expect(result.parallelGroups).toBe(1);
    });

    it('interprets sequential nuggets (vertical chain) as one group', () => {
      const ws = makeCompositionWorkspace([
        nuggetBlock('api-server',
          nuggetBlock('web-dashboard')),
      ]);
      const result = interpretCompositionWorkspace(ws);
      expect(result.nuggetIds).toEqual(['api-server', 'web-dashboard']);
      expect(result.placements).toEqual([
        { nuggetId: 'api-server', group: 0, position: 0 },
        { nuggetId: 'web-dashboard', group: 0, position: 1 },
      ]);
      expect(result.parallelGroups).toBe(1);
    });

    it('interprets parallel nuggets (side-by-side) as separate groups', () => {
      const ws = makeCompositionWorkspace([
        nuggetBlock('sensor-node'),
        nuggetBlock('web-dashboard'),
      ]);
      const result = interpretCompositionWorkspace(ws);
      expect(result.nuggetIds).toEqual(['sensor-node', 'web-dashboard']);
      expect(result.placements).toEqual([
        { nuggetId: 'sensor-node', group: 0, position: 0 },
        { nuggetId: 'web-dashboard', group: 1, position: 0 },
      ]);
      expect(result.parallelGroups).toBe(2);
    });

    it('handles mixed sequential + parallel layout', () => {
      // Group 0: sensor -> gateway (sequential)
      // Group 1: dashboard (parallel)
      const ws = makeCompositionWorkspace([
        nuggetBlock('sensor-node',
          nuggetBlock('gateway')),
        nuggetBlock('dashboard'),
      ]);
      const result = interpretCompositionWorkspace(ws);
      expect(result.nuggetIds).toEqual(['sensor-node', 'gateway', 'dashboard']);
      expect(result.placements).toHaveLength(3);
      expect(result.placements[0]).toEqual({ nuggetId: 'sensor-node', group: 0, position: 0 });
      expect(result.placements[1]).toEqual({ nuggetId: 'gateway', group: 0, position: 1 });
      expect(result.placements[2]).toEqual({ nuggetId: 'dashboard', group: 1, position: 0 });
      expect(result.parallelGroups).toBe(2);
    });

    it('deduplicates nugget IDs when same nugget appears multiple times', () => {
      const ws = makeCompositionWorkspace([
        nuggetBlock('sensor-node',
          nuggetBlock('sensor-node')),
      ]);
      const result = interpretCompositionWorkspace(ws);
      expect(result.nuggetIds).toEqual(['sensor-node']);
      expect(result.placements).toHaveLength(2);
    });

    it('skips nugget blocks with empty NUGGET_ID', () => {
      const ws = makeCompositionWorkspace([
        nuggetBlock(''),
        nuggetBlock('valid-nugget'),
      ]);
      const result = interpretCompositionWorkspace(ws);
      expect(result.nuggetIds).toEqual(['valid-nugget']);
      expect(result.placements).toHaveLength(1);
    });

    it('skips non-nugget blocks in the chain', () => {
      const ws = makeCompositionWorkspace([
        {
          type: 'some_other_block',
          fields: {},
          next: { block: nuggetBlock('valid-nugget') },
        },
      ]);
      const result = interpretCompositionWorkspace(ws);
      expect(result.nuggetIds).toEqual(['valid-nugget']);
      expect(result.placements).toHaveLength(1);
    });

    it('handles missing blocks key', () => {
      const result = interpretCompositionWorkspace({});
      expect(result.nuggetIds).toEqual([]);
      expect(result.parallelGroups).toBe(0);
    });

    it('three parallel chains for IoT composition pattern', () => {
      const ws = makeCompositionWorkspace([
        nuggetBlock('sensor-node'),
        nuggetBlock('gateway-node'),
        nuggetBlock('web-dashboard'),
      ]);
      const result = interpretCompositionWorkspace(ws);
      expect(result.parallelGroups).toBe(3);
      expect(result.nuggetIds).toHaveLength(3);
    });
  });
});
