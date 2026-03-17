/**
 * PRD-003 Phase 2: Composition mode toolbox.
 *
 * In composition mode, the canvas only shows Nugget blocks.
 * Primitives are not available -- composition operates at the
 * layer above specification.
 */

import { NUGGET_BLOCK_COLOUR } from './nuggetBlocks';

export const compositionToolbox = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: 'Nuggets',
      colour: String(NUGGET_BLOCK_COLOUR),
      contents: [
        { kind: 'block', type: 'nugget_ref' },
      ],
    },
  ],
};
