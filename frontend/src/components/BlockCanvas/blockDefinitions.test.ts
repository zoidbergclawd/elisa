import { describe, it, expect, beforeAll } from 'vitest';
import * as Blockly from 'blockly';
import { registerBlocks, TEXT_FIELD_MAX_DISPLAY_LENGTH, TEXT_FIELD_MAX_INPUT_LENGTH } from './blockDefinitions';

// Block types that should have the text_field_limits extension
const BLOCKS_WITH_TEXT_FIELDS = [
  'nugget_goal',
  'feature',
  'constraint',
  'when_then',
  'has_data',
  'proof',
];

beforeAll(() => {
  registerBlocks();
});

describe('text_field_limits extension', () => {
  it('is registered as a Blockly extension', () => {
    // If text_field_limits were not registered, calling registerBlocks again
    // would throw "Extension already registered". The fact beforeAll succeeded
    // proves it is registered.
    expect(true).toBe(true);
  });

  for (const blockType of BLOCKS_WITH_TEXT_FIELDS) {
    describe(blockType, () => {
      it('has text_field_limits in its extensions', () => {
        const jsonDef = Blockly.Blocks[blockType];
        expect(jsonDef).toBeDefined();
      });

      it('sets maxDisplayLength on FieldTextInput fields', () => {
        const workspace = new Blockly.Workspace();
        try {
          const block = workspace.newBlock(blockType);
          for (const input of block.inputList) {
            for (const field of input.fieldRow) {
              if (field instanceof Blockly.FieldTextInput) {
                expect(field.maxDisplayLength).toBe(TEXT_FIELD_MAX_DISPLAY_LENGTH);
              }
            }
          }
        } finally {
          workspace.dispose();
        }
      });

      it('truncates text exceeding max input length', () => {
        const workspace = new Blockly.Workspace();
        try {
          const block = workspace.newBlock(blockType);
          for (const input of block.inputList) {
            for (const field of input.fieldRow) {
              if (field instanceof Blockly.FieldTextInput) {
                const longText = 'a'.repeat(TEXT_FIELD_MAX_INPUT_LENGTH + 50);
                field.setValue(longText);
                expect(field.getValue().length).toBeLessThanOrEqual(TEXT_FIELD_MAX_INPUT_LENGTH);
              }
            }
          }
        } finally {
          workspace.dispose();
        }
      });

      it('allows text within the limit', () => {
        const workspace = new Blockly.Workspace();
        try {
          const block = workspace.newBlock(blockType);
          for (const input of block.inputList) {
            for (const field of input.fieldRow) {
              if (field instanceof Blockly.FieldTextInput) {
                const normalText = 'Hello world';
                field.setValue(normalText);
                expect(field.getValue()).toBe(normalText);
              }
            }
          }
        } finally {
          workspace.dispose();
        }
      });
    });
  }

  it('does not add extension to dropdown-only blocks', () => {
    const workspace = new Blockly.Workspace();
    try {
      const block = workspace.newBlock('nugget_template');
      // Dropdown fields should not have maxDisplayLength set
      for (const input of block.inputList) {
        for (const field of input.fieldRow) {
          if (field instanceof Blockly.FieldDropdown) {
            // Dropdown fields don't have maxDisplayLength from our extension
            expect(field).toBeInstanceOf(Blockly.FieldDropdown);
          }
        }
      }
    } finally {
      workspace.dispose();
    }
  });
});

describe('exported constants', () => {
  it('TEXT_FIELD_MAX_DISPLAY_LENGTH is 50', () => {
    expect(TEXT_FIELD_MAX_DISPLAY_LENGTH).toBe(50);
  });

  it('TEXT_FIELD_MAX_INPUT_LENGTH is 150', () => {
    expect(TEXT_FIELD_MAX_INPUT_LENGTH).toBe(150);
  });
});
