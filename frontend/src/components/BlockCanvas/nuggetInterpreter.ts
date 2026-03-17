/**
 * PRD-003 Phase 2: Composition canvas interpreter.
 *
 * Reads a composition workspace (nugget_ref blocks arranged spatially)
 * and produces a ComposeRequest that can be sent to the backend.
 *
 * Spatial layout inference:
 * - Blocks connected via next pointers = sequential (vertical chain)
 * - Multiple top-level block chains = parallel (side-by-side)
 */

export interface NuggetPlacement {
  nuggetId: string;
  /** Sequential group index -- nuggets in the same group run in sequence. */
  group: number;
  /** Position within the sequential group (0-based). */
  position: number;
}

export interface ComposeRequest {
  /** All nugget IDs referenced on the canvas. */
  nuggetIds: string[];
  /** Spatial arrangement for dependency inference. */
  placements: NuggetPlacement[];
  /** Number of parallel groups (side-by-side chains). */
  parallelGroups: number;
}

interface BlockJson {
  type: string;
  fields?: Record<string, unknown>;
  next?: { block: BlockJson };
}

interface WorkspaceJson {
  blocks?: {
    blocks?: BlockJson[];
  };
}

function walkChain(block: BlockJson): BlockJson[] {
  const chain: BlockJson[] = [block];
  let current = block;
  while (current.next?.block) {
    chain.push(current.next.block);
    current = current.next.block;
  }
  return chain;
}

/**
 * Interpret a composition workspace into a ComposeRequest.
 * Each top-level block starts a sequential chain (group).
 * Multiple top-level blocks represent parallel groups.
 */
export function interpretCompositionWorkspace(
  json: Record<string, unknown>,
): ComposeRequest {
  const ws = json as unknown as WorkspaceJson;
  const topBlocks = ws.blocks?.blocks ?? [];

  const nuggetIds: string[] = [];
  const placements: NuggetPlacement[] = [];

  let groupIndex = 0;

  for (const topBlock of topBlocks) {
    const chain = walkChain(topBlock);
    let position = 0;

    for (const block of chain) {
      if (block.type === 'nugget_ref') {
        const nuggetId = (block.fields?.NUGGET_ID as string) ?? '';
        if (nuggetId) {
          if (!nuggetIds.includes(nuggetId)) {
            nuggetIds.push(nuggetId);
          }
          placements.push({
            nuggetId,
            group: groupIndex,
            position,
          });
          position++;
        }
      }
    }

    if (position > 0) {
      groupIndex++;
    }
  }

  return {
    nuggetIds,
    placements,
    parallelGroups: groupIndex,
  };
}
