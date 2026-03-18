/** Converts a CanvasBlockSpec from Planning Mode into Blockly workspace JSON.
 *  Supports blank (clear workspace first) and merge (append to existing) modes. */

import type { CanvasBlockSpec, CanvasBlock } from '../../types';

interface BlocklyBlock {
  type: string;
  id: string;
  x?: number;
  y?: number;
  fields?: Record<string, string>;
  inputs?: Record<string, { block: BlocklyBlock }>;
  next?: { block: BlocklyBlock };
}

interface BlocklyWorkspaceJson {
  blocks: { languageVersion: number; blocks: BlocklyBlock[] };
}

const BLOCK_TYPE_MAP: Record<string, string> = {
  Goal: 'nugget_goal',
  Promise: 'feature',
  Proof: 'proof',
  Skill: 'use_skill',
  Portal: 'portal_tell',
  Deploy: 'deploy_web',
};

const DEPLOY_BLOCK_MAP: Record<string, string> = {
  web: 'deploy_web',
  device: 'deploy_esp32',
  cloud: 'deploy_web',
  cli: 'deploy_web',
};

function makeBlockId(): string {
  return 'plan_' + Math.random().toString(36).slice(2, 10);
}

function mapBlockType(block: CanvasBlock): string {
  if (block.type === 'Deploy' && block.subtype) {
    return DEPLOY_BLOCK_MAP[block.subtype] ?? 'deploy_web';
  }
  return BLOCK_TYPE_MAP[block.type] ?? 'nugget_goal';
}

function fieldName(blockType: string): string {
  switch (blockType) {
    case 'nugget_goal': return 'GOAL';
    case 'feature': return 'DESCRIPTION';
    case 'proof': return 'PROOF';
    case 'use_skill': return 'SKILL_ID';
    case 'portal_tell': return 'COMMAND';
    default: return 'DESCRIPTION';
  }
}

function canvasBlockToBlockly(block: CanvasBlock): BlocklyBlock {
  const blockType = mapBlockType(block);
  const result: BlocklyBlock = {
    type: blockType,
    id: makeBlockId(),
    x: block.position.x,
    y: block.position.y,
    fields: { [fieldName(blockType)]: block.content },
  };

  // Attach child proofs to promise blocks via test_checks statement input
  if (block.type === 'Promise' && block.children && block.children.length > 0) {
    const proofBlocks = block.children
      .filter((c) => c.type === 'Proof')
      .map((c) => ({
        type: 'proof' as const,
        id: makeBlockId(),
        fields: { PROOF: c.content },
      }));

    if (proofBlocks.length > 0) {
      // Chain proofs via next statements
      for (let i = 0; i < proofBlocks.length - 1; i++) {
        (proofBlocks[i] as BlocklyBlock).next = { block: proofBlocks[i + 1] };
      }
      result.inputs = { test_checks: { block: proofBlocks[0] } };
    }
  }

  return result;
}

/** Convert a CanvasBlockSpec to Blockly workspace JSON. */
export function planToWorkspaceJson(spec: CanvasBlockSpec): BlocklyWorkspaceJson {
  const blocks = spec.blocks.map(canvasBlockToBlockly);
  return {
    blocks: {
      languageVersion: 0,
      blocks,
    },
  };
}

/** Populate a Blockly workspace from a CanvasBlockSpec.
 *  @param loadWorkspace  - function to load workspace JSON (from BlockCanvasHandle)
 *  @param currentJson    - current workspace JSON (null for blank)
 *  @param spec           - the CanvasBlockSpec from planning
 *  @param merge          - if true, append to existing blocks; if false, replace
 */
export function populateCanvasFromPlan(
  loadWorkspace: (json: Record<string, unknown>) => void,
  currentJson: Record<string, unknown> | null,
  spec: CanvasBlockSpec,
  merge: boolean,
): void {
  const newJson = planToWorkspaceJson(spec);

  if (merge && currentJson) {
    // Merge: append new blocks to existing workspace
    const existing = currentJson as unknown as BlocklyWorkspaceJson;
    const existingBlocks = existing?.blocks?.blocks ?? [];
    // Offset new blocks to avoid overlap
    const maxY = existingBlocks.reduce(
      (max, b) => Math.max(max, (b.y ?? 0) + 60),
      100,
    );
    const offsetBlocks = newJson.blocks.blocks.map((b, i) => ({
      ...b,
      y: maxY + i * 80,
    }));
    const merged: BlocklyWorkspaceJson = {
      blocks: {
        languageVersion: 0,
        blocks: [...existingBlocks, ...offsetBlocks],
      },
    };
    loadWorkspace(merged as unknown as Record<string, unknown>);
  } else {
    loadWorkspace(newJson as unknown as Record<string, unknown>);
  }
}
