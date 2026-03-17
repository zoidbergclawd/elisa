/**
 * PRD-003 Phase 2: Dynamic Nugget block registration.
 *
 * Nugget blocks are `category: 'special'` -- they are NOT primitives.
 * Each available nugget (saved or shipped) becomes a selectable option
 * in the nugget_ref block's dropdown.
 */

import * as Blockly from 'blockly';
import { BLOCK_CATEGORIES, type BlockCategory } from './blockDefinitions';

/** Nugget summary used to populate the dropdown. */
export interface NuggetEntry {
  id: string;
  name: string;
  goal: string;
  builtin?: boolean;
}

/** Colour for nugget blocks -- distinct gold/bronze hue. */
export const NUGGET_BLOCK_COLOUR = 15;

let registered = false;
let currentNuggets: NuggetEntry[] = [];

/** Update the available nuggets for the dropdown. Call when nuggets change. */
export function updateNuggetOptions(nuggets: NuggetEntry[]): void {
  currentNuggets = nuggets;
}

/** Get current nuggets (used by dropdown extension). */
export function getCurrentNuggets(): NuggetEntry[] {
  return currentNuggets;
}

/** Register the nugget_ref block type. Call once at startup. */
export function registerNuggetBlocks(): void {
  if (registered) return;

  // Register the dropdown extension with goal tooltip
  Blockly.Extensions.register('nugget_dropdown_extension', function (this: Blockly.Block) {
    const dropdown = this.getField('NUGGET_ID') as Blockly.FieldDropdown;
    if (!dropdown) return;
    const originalMenuGenerator = dropdown.getOptions;
    dropdown.getOptions = function () {
      const nuggets = getCurrentNuggets();
      if (nuggets.length === 0) {
        return [['(no nuggets available)', '']];
      }
      return nuggets.map((n) => [n.name, n.id] as [string, string]);
    };
    originalMenuGenerator.call(dropdown);

    // Update tooltip to show the selected nugget's goal
    const block = this;
    dropdown.setValidator((newValue: string) => {
      const nuggets = getCurrentNuggets();
      const nugget = nuggets.find((n) => n.id === newValue);
      if (nugget) {
        block.setTooltip(`Goal: ${nugget.goal}`);
      }
      return undefined;
    });
  });

  // Define the nugget_ref block
  Blockly.common.defineBlocks(
    Blockly.common.createBlockDefinitionsFromJsonArray([
      {
        type: 'nugget_ref',
        message0: 'Nugget: %1',
        args0: [
          {
            type: 'field_dropdown',
            name: 'NUGGET_ID',
            options: [['(no nuggets available)', '']],
          },
        ],
        previousStatement: null,
        nextStatement: null,
        colour: NUGGET_BLOCK_COLOUR,
        tooltip: 'Reference a saved nugget specification. Arrange nuggets vertically for sequence, side-by-side for parallel.',
        helpUrl: '',
        extensions: ['nugget_dropdown_extension'],
      },
    ]),
  );

  // Register in the block category system
  (BLOCK_CATEGORIES as Record<string, BlockCategory>)['nugget_ref'] = 'special';

  registered = true;
}
