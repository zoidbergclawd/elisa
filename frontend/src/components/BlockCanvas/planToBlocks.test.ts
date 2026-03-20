import { describe, it, expect, vi } from 'vitest';
import { planToWorkspaceJson, populateCanvasFromPlan } from './planToBlocks';
import type { CanvasBlockSpec } from '../../types';

const goalOnly: CanvasBlockSpec = {
  blocks: [
    { id: 'g1', type: 'Goal', category: 'primitive', content: 'Build a weather app', position: { x: 50, y: 50 } },
  ],
};

const fullSpec: CanvasBlockSpec = {
  blocks: [
    { id: 'g1', type: 'Goal', category: 'primitive', content: 'Weather app', position: { x: 50, y: 50 } },
    {
      id: 'p1',
      type: 'Promise',
      category: 'primitive',
      content: 'Shows temperature',
      position: { x: 50, y: 150 },
      children: [
        { id: 'pr1', type: 'Proof', category: 'primitive', content: 'Displays Celsius' },
        { id: 'pr2', type: 'Proof', category: 'primitive', content: 'Handles missing data' },
      ],
    },
    { id: 's1', type: 'Skill', category: 'primitive', content: 'Charts', position: { x: 50, y: 250 } },
    { id: 'pt1', type: 'Portal', category: 'primitive', content: 'Fetch weather', position: { x: 50, y: 350 } },
    { id: 'd1', type: 'Deploy', category: 'primitive', content: 'Web deploy', position: { x: 50, y: 450 }, subtype: 'web' },
  ],
};

/** Walk the next-chain starting from a block, collecting all blocks. */
function walkChain(block: { type: string; next?: { block: unknown } }): Array<{ type: string }> {
  const chain: Array<{ type: string }> = [block];
  let current: unknown = block;
  while ((current as { next?: { block: unknown } }).next?.block) {
    current = (current as { next: { block: unknown } }).next.block;
    chain.push(current as { type: string });
  }
  return chain;
}

describe('planToWorkspaceJson', () => {
  it('converts a single Goal block', () => {
    const result = planToWorkspaceJson(goalOnly);
    expect(result.blocks.languageVersion).toBe(0);
    expect(result.blocks.blocks).toHaveLength(1);
    expect(result.blocks.blocks[0].type).toBe('nugget_goal');
    expect(result.blocks.blocks[0].fields?.GOAL_TEXT).toBe('Build a weather app');
    expect(result.blocks.blocks[0].x).toBe(50);
    expect(result.blocks.blocks[0].y).toBe(50);
  });

  it('chains all block types into a single stack', () => {
    const result = planToWorkspaceJson(fullSpec);
    // Only 1 top-level block (the rest are chained via next)
    expect(result.blocks.blocks).toHaveLength(1);

    const chain = walkChain(result.blocks.blocks[0]);
    expect(chain).toHaveLength(5);

    const types = chain.map((b) => b.type);
    expect(types).toContain('nugget_goal');
    expect(types).toContain('feature');
    expect(types).toContain('use_skill');
    expect(types).toContain('portal_tell');
    expect(types).toContain('deploy_web');
  });

  it('only first block has position coordinates', () => {
    const result = planToWorkspaceJson(fullSpec);
    expect(result.blocks.blocks[0].x).toBe(50);
    expect(result.blocks.blocks[0].y).toBe(50);

    // Walk chain and check subsequent blocks have no position
    let current: Record<string, unknown> = result.blocks.blocks[0];
    while ((current as { next?: { block: unknown } }).next) {
      current = (current as { next: { block: Record<string, unknown> } }).next.block;
      expect(current.x).toBeUndefined();
      expect(current.y).toBeUndefined();
    }
  });

  it('attaches proofs as children of promise blocks', () => {
    const result = planToWorkspaceJson(fullSpec);
    // Promise block is chained after goal; walk to find it
    const chain = walkChain(result.blocks.blocks[0]);
    const promiseBlock = chain.find((b) => b.type === 'feature') as { inputs?: Record<string, { block: { type: string; fields?: Record<string, string>; next?: { block: { type: string; fields?: Record<string, string> } } } }> };
    expect(promiseBlock?.inputs?.TEST_SOCKET).toBeDefined();
    expect(promiseBlock?.inputs?.TEST_SOCKET.block.type).toBe('proof');
    expect(promiseBlock?.inputs?.TEST_SOCKET.block.fields?.GIVEN_WHEN).toBe('Displays Celsius');
    // Second proof is chained via next
    expect(promiseBlock?.inputs?.TEST_SOCKET.block.next?.block.type).toBe('proof');
    expect(promiseBlock?.inputs?.TEST_SOCKET.block.next?.block.fields?.GIVEN_WHEN).toBe('Handles missing data');
  });

  it('maps Deploy subtypes correctly', () => {
    const deviceSpec: CanvasBlockSpec = {
      blocks: [
        { id: 'd1', type: 'Deploy', category: 'primitive', content: 'Flash', position: { x: 0, y: 0 }, subtype: 'device' },
      ],
    };
    const result = planToWorkspaceJson(deviceSpec);
    expect(result.blocks.blocks[0].type).toBe('deploy_esp32');
  });

  it('handles empty spec', () => {
    const result = planToWorkspaceJson({ blocks: [] });
    expect(result.blocks.blocks).toHaveLength(0);
  });

  it('sets correct field names for Goal and Promise blocks', () => {
    const result = planToWorkspaceJson(fullSpec);
    const chain = walkChain(result.blocks.blocks[0]) as Array<{ type: string; fields?: Record<string, string> }>;
    const goal = chain.find((b) => b.type === 'nugget_goal');
    expect(goal?.fields?.GOAL_TEXT).toBe('Weather app');
    const promise = chain.find((b) => b.type === 'feature');
    expect(promise?.fields?.FEATURE_TEXT).toBe('Shows temperature');
  });
});

describe('populateCanvasFromPlan', () => {
  it('loads blocks into workspace (blank mode)', () => {
    const loadWorkspace = vi.fn();
    populateCanvasFromPlan(loadWorkspace, null, goalOnly, false);
    expect(loadWorkspace).toHaveBeenCalledOnce();
    const arg = loadWorkspace.mock.calls[0][0] as { blocks: { blocks: unknown[] } };
    expect(arg.blocks.blocks).toHaveLength(1);
  });

  it('replaces workspace when merge=false', () => {
    const loadWorkspace = vi.fn();
    const existing = {
      blocks: {
        languageVersion: 0,
        blocks: [{ type: 'nugget_goal', id: 'old', x: 10, y: 10, fields: { GOAL: 'old' } }],
      },
    };
    populateCanvasFromPlan(loadWorkspace, existing, goalOnly, false);
    const arg = loadWorkspace.mock.calls[0][0] as { blocks: { blocks: unknown[] } };
    // Should NOT include old blocks
    expect(arg.blocks.blocks).toHaveLength(1);
  });

  it('merges new blocks with existing workspace', () => {
    const loadWorkspace = vi.fn();
    const existing = {
      blocks: {
        languageVersion: 0,
        blocks: [{ type: 'nugget_goal', id: 'old', x: 10, y: 10, fields: { GOAL: 'old' } }],
      },
    };
    populateCanvasFromPlan(loadWorkspace, existing, goalOnly, true);
    const arg = loadWorkspace.mock.calls[0][0] as { blocks: { blocks: Array<{ y?: number }> } };
    expect(arg.blocks.blocks).toHaveLength(2);
    // New blocks should be offset below existing
    const newBlock = arg.blocks.blocks[1];
    expect((newBlock.y ?? 0)).toBeGreaterThan(10);
  });

  it('handles merge with null existing workspace', () => {
    const loadWorkspace = vi.fn();
    populateCanvasFromPlan(loadWorkspace, null, goalOnly, true);
    // When existing is null, should just load the new blocks
    expect(loadWorkspace).toHaveBeenCalledOnce();
  });
});
