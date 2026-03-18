import { describe, it, expect } from 'vitest';
import { serializeCanvasForPlanning } from './canvasSerializer';

function makeWorkspace(blocks: Array<Record<string, unknown>>) {
  return { blocks: { blocks } };
}

describe('serializeCanvasForPlanning', () => {
  it('returns null for null workspace', () => {
    expect(serializeCanvasForPlanning(null)).toBeNull();
  });

  it('returns null for empty workspace', () => {
    expect(serializeCanvasForPlanning(makeWorkspace([]))).toBeNull();
  });

  it('returns null for workspace with no blocks property', () => {
    expect(serializeCanvasForPlanning({})).toBeNull();
  });

  it('serializes a single Goal block', () => {
    const ws = makeWorkspace([
      { type: 'nugget_goal', fields: { GOAL: 'Weather app' } },
    ]);
    const result = serializeCanvasForPlanning(ws);
    expect(result).not.toBeNull();
    expect(result!.hasGoal).toBe(true);
    expect(result!.blocks).toHaveLength(1);
    expect(result!.blocks[0].type).toBe('Goal');
    expect(result!.blocks[0].content).toBe('Weather app');
  });

  it('counts promises correctly', () => {
    const ws = makeWorkspace([
      { type: 'feature', fields: { DESCRIPTION: 'Fast loading' } },
      { type: 'constraint', fields: { DESCRIPTION: 'No crashes' } },
    ]);
    const result = serializeCanvasForPlanning(ws);
    expect(result!.promiseCount).toBe(2);
  });

  it('counts skills correctly', () => {
    const ws = makeWorkspace([
      { type: 'use_skill', fields: { SKILL_ID: 'charts' } },
    ]);
    const result = serializeCanvasForPlanning(ws);
    expect(result!.skillCount).toBe(1);
  });

  it('counts portals correctly with subtypes', () => {
    const ws = makeWorkspace([
      { type: 'portal_tell', fields: { COMMAND: 'fetch data' } },
      { type: 'portal_ask', fields: { QUERY: 'get weather' } },
    ]);
    const result = serializeCanvasForPlanning(ws);
    expect(result!.portalCount).toBe(2);
    expect(result!.blocks[0].subtype).toBe('service');
    expect(result!.blocks[1].subtype).toBe('api');
  });

  it('detects deploy target', () => {
    const ws = makeWorkspace([
      { type: 'deploy_web' },
    ]);
    const result = serializeCanvasForPlanning(ws);
    expect(result!.hasDeployTarget).toBe(true);
  });

  it('extracts nested proofs from promises', () => {
    const ws = makeWorkspace([
      {
        type: 'feature',
        fields: { DESCRIPTION: 'Shows temperature' },
        inputs: {
          test_checks: {
            block: {
              type: 'proof',
              fields: { PROOF: 'Displays Celsius' },
              next: {
                block: {
                  type: 'proof',
                  fields: { PROOF: 'Handles null' },
                },
              },
            },
          },
        },
      },
    ]);
    const result = serializeCanvasForPlanning(ws);
    expect(result!.blocks[0].children).toHaveLength(2);
    expect(result!.blocks[0].children![0].type).toBe('Proof');
    expect(result!.blocks[0].children![0].content).toBe('Displays Celsius');
    expect(result!.blocks[0].children![1].content).toBe('Handles null');
  });

  it('follows next chains for top-level blocks', () => {
    const ws = makeWorkspace([
      {
        type: 'nugget_goal',
        fields: { GOAL: 'Weather app' },
        next: {
          block: {
            type: 'feature',
            fields: { DESCRIPTION: 'Shows forecast' },
          },
        },
      },
    ]);
    const result = serializeCanvasForPlanning(ws);
    expect(result!.blocks).toHaveLength(2);
    expect(result!.hasGoal).toBe(true);
    expect(result!.promiseCount).toBe(1);
  });

  it('skips unknown block types', () => {
    const ws = makeWorkspace([
      { type: 'nugget_goal', fields: { GOAL: 'Test' } },
      { type: 'unknown_custom_block', fields: { FOO: 'bar' } },
    ]);
    const result = serializeCanvasForPlanning(ws);
    expect(result!.blocks).toHaveLength(1);
  });

  it('serializes a full workspace', () => {
    const ws = makeWorkspace([
      { type: 'nugget_goal', fields: { GOAL: 'Weather app' } },
      { type: 'feature', fields: { DESCRIPTION: 'Shows temperature' } },
      { type: 'feature', fields: { DESCRIPTION: 'Shows forecast' } },
      { type: 'use_skill', fields: { SKILL_ID: 'charts' } },
      { type: 'portal_tell', fields: { COMMAND: 'fetch weather' } },
      { type: 'deploy_web' },
    ]);
    const result = serializeCanvasForPlanning(ws);
    expect(result!.hasGoal).toBe(true);
    expect(result!.promiseCount).toBe(2);
    expect(result!.skillCount).toBe(1);
    expect(result!.portalCount).toBe(1);
    expect(result!.hasDeployTarget).toBe(true);
    expect(result!.blocks).toHaveLength(6);
  });
});
