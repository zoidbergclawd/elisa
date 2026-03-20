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

    // Update the goal label and tooltip when the selection changes
    const block = this; // eslint-disable-line @typescript-eslint/no-this-alias -- Blockly block init requires capturing `this`
    const updateGoalLabel = (nuggetId: string) => {
      const nuggets = getCurrentNuggets();
      const nugget = nuggets.find((n) => n.id === nuggetId);
      const goalField = block.getField('NUGGET_GOAL');
      if (nugget) {
        block.setTooltip(`Goal: ${nugget.goal}`);
        if (goalField) goalField.setValue(nugget.goal);
      } else {
        block.setTooltip('Select a nugget');
        if (goalField) goalField.setValue('');
      }
    };

    dropdown.setValidator((newValue: string) => {
      // Defer so Blockly finishes updating the field value first
      setTimeout(() => updateGoalLabel(newValue), 0);
      return undefined;
    });

    // Set initial goal label from current dropdown value
    const initialValue = dropdown.getValue();
    if (initialValue) {
      setTimeout(() => updateGoalLabel(initialValue), 0);
    }
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
        message1: '%1',
        args1: [
          {
            type: 'field_label_serializable',
            name: 'NUGGET_GOAL',
            text: '',
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
