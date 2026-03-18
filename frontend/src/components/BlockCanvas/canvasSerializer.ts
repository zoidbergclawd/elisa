/** Serialize current Blockly workspace to a CanvasContext for mid-project planning. */

import type { CanvasContext } from '../../types';

interface BlockJson {
  type: string;
  fields?: Record<string, unknown>;
  inputs?: Record<string, { block: BlockJson }>;
  next?: { block: BlockJson };
}

interface WorkspaceJson {
  blocks?: {
    blocks?: BlockJson[];
  };
}

// Map Blockly block types to canonical primitive names
const BLOCK_TO_PRIMITIVE: Record<string, string> = {
  nugget_goal: 'Goal',
  nugget_template: 'Goal',
  write_guide: 'Goal',
  feature: 'Promise',
  constraint: 'Promise',
  when_then: 'Promise',
  has_data: 'Promise',
  proof: 'Proof',
  use_skill: 'Skill',
  portal_tell: 'Portal',
  portal_when: 'Portal',
  portal_ask: 'Portal',
  deploy_web: 'Deploy',
  deploy_esp32: 'Deploy',
  deploy_both: 'Deploy',
};

// Map Blockly portal types to subtypes
const PORTAL_SUBTYPE: Record<string, string> = {
  portal_tell: 'service',
  portal_when: 'device',
  portal_ask: 'api',
};

function getBlockContent(block: BlockJson): string {
  if (!block.fields) return '';
  // Most blocks use a single text field
  const fieldValues = Object.values(block.fields).filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );
  return fieldValues.join(' ');
}

function walkNextChain(block: BlockJson): BlockJson[] {
  const chain: BlockJson[] = [block];
  let current = block;
  while (current.next?.block) {
    chain.push(current.next.block);
    current = current.next.block;
  }
  return chain;
}

function extractChildren(block: BlockJson): Array<{ type: string; content: string }> {
  const children: Array<{ type: string; content: string }> = [];
  if (block.inputs?.test_checks?.block) {
    const proofs = walkNextChain(block.inputs.test_checks.block);
    for (const proof of proofs) {
      children.push({
        type: BLOCK_TO_PRIMITIVE[proof.type] ?? proof.type,
        content: getBlockContent(proof),
      });
    }
  }
  return children;
}

/** Serialize a Blockly workspace JSON to CanvasContext for mid-project planning.
 *  Returns null if workspace is null/empty. */
export function serializeCanvasForPlanning(
  workspaceJson: Record<string, unknown> | null,
): CanvasContext | null {
  if (!workspaceJson) return null;

  const ws = workspaceJson as unknown as WorkspaceJson;
  const rawBlocks = ws.blocks?.blocks ?? [];
  if (rawBlocks.length === 0) return null;

  // Collect all top-level blocks and expand next-chains
  const allBlocks: BlockJson[] = [];
  for (const topBlock of rawBlocks) {
    allBlocks.push(...walkNextChain(topBlock));
  }

  const blocks: CanvasContext['blocks'] = [];
  let hasGoal = false;
  let promiseCount = 0;
  let skillCount = 0;
  let portalCount = 0;
  let hasDeployTarget = false;

  for (const block of allBlocks) {
    const primitiveType = BLOCK_TO_PRIMITIVE[block.type];
    if (!primitiveType) continue; // Skip unknown / non-primitive blocks

    const content = getBlockContent(block);
    const children = extractChildren(block);
    const subtype = PORTAL_SUBTYPE[block.type];

    blocks.push({
      type: primitiveType,
      content,
      ...(subtype ? { subtype } : {}),
      ...(children.length > 0 ? { children } : {}),
    });

    switch (primitiveType) {
      case 'Goal': hasGoal = true; break;
      case 'Promise': promiseCount++; break;
      case 'Skill': skillCount++; break;
      case 'Portal': portalCount++; break;
      case 'Deploy': hasDeployTarget = true; break;
    }
  }

  return { blocks, hasGoal, promiseCount, skillCount, portalCount, hasDeployTarget };
}
