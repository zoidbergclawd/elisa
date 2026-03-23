import * as Blockly from 'blockly';
import { getCurrentSkills } from '../Skills/skillsRegistry';
import { getCurrentPortals } from '../Portals/portalRegistry';

/**
 * Block category metadata for the PRD-003 type system.
 * Primitives are authoring atoms; special blocks (Phase 2) operate above primitives;
 * ide blocks are workspace/IDE concerns.
 */
export type BlockCategory = 'primitive' | 'special' | 'ide';

export const BLOCK_CATEGORIES: Record<string, BlockCategory> = {
  // Goal
  nugget_goal: 'primitive',
  nugget_template: 'primitive',
  write_guide: 'primitive',
  // Promise (was Requirement)
  feature: 'primitive',
  constraint: 'primitive',
  when_then: 'primitive',
  has_data: 'primitive',
  // Proof (was Behavioral Test)
  proof: 'primitive',
  // Skill
  use_skill: 'primitive',
  // Portal (absorbs Knowledge + Devices)
  portal_tell: 'primitive',
  portal_when: 'primitive',
  portal_ask: 'primitive',
  // Deploy
  deploy_web: 'primitive',
  deploy_esp32: 'primitive',
  deploy_both: 'primitive',
};

const blockDefs = [
  // --- Goal ---
  {
    type: 'nugget_goal',
    message0: 'I want to build... %1 %2',
    args0: [
      {
        type: 'field_input',
        name: 'GOAL_TEXT',
        text: 'describe your nugget here',
      },
      {
        type: 'field_dropdown',
        name: 'FRAMEWORK',
        options: [
          ['Auto (recommended)', 'auto'],
          ['Phaser (2D games)', 'phaser'],
          ['p5.js (creative coding)', 'p5'],
          ['Three.js (3D)', 'threejs'],
          ['None (plain HTML)', 'none'],
        ],
      },
    ],
    nextStatement: null,
    colour: 210,
    tooltip: 'Describe what you want to build. Optionally pick a graphics framework.',
    helpUrl: '',
    extensions: ['text_field_limits'],
  },
  {
    type: 'nugget_template',
    message0: 'Start from a template: %1',
    args0: [
      {
        type: 'field_dropdown',
        name: 'TEMPLATE_TYPE',
        options: [
          ['Game', 'game'],
          ['Website', 'website'],
          ['Hardware Nugget', 'hardware'],
          ['Story', 'story'],
          ['Tool', 'tool'],
        ],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 210,
    tooltip: 'Start from a template',
    helpUrl: '',
  },
  {
    type: 'write_guide',
    message0: 'Write me a guide about %1',
    args0: [
      {
        type: 'field_dropdown',
        name: 'GUIDE_FOCUS',
        options: [
          ['how everything works', 'how_it_works'],
          ['how to set it up', 'setup'],
          ['what each part does', 'parts'],
          ['all of the above', 'all'],
        ],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 210,
    tooltip: 'Generate a kid-friendly guide about your project',
  },
  // --- Promise (was Requirement) ---
  {
    type: 'feature',
    message0: 'It should %1',
    args0: [
      {
        type: 'field_input',
        name: 'FEATURE_TEXT',
        text: 'do something cool',
      },
    ],
    message1: '%1',
    args1: [
      {
        type: 'input_statement',
        name: 'TEST_SOCKET',
        check: 'test_check',
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 135,
    tooltip: 'Add a promise — attach a proof to verify it',
    helpUrl: '',
    extensions: ['text_field_limits'],
  },
  {
    type: 'constraint',
    message0: "Make sure it doesn't... %1",
    args0: [
      {
        type: 'field_input',
        name: 'CONSTRAINT_TEXT',
        text: 'break when you click too fast',
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 135,
    tooltip: 'Add a constraint',
    helpUrl: '',
    extensions: ['text_field_limits'],
  },
  {
    type: 'when_then',
    message0: 'When %1 happens, %2 should happen',
    args0: [
      {
        type: 'field_input',
        name: 'TRIGGER_TEXT',
        text: 'something',
      },
      {
        type: 'field_input',
        name: 'ACTION_TEXT',
        text: 'something else',
      },
    ],
    message1: '%1',
    args1: [
      {
        type: 'input_statement',
        name: 'TEST_SOCKET',
        check: 'test_check',
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 135,
    tooltip: 'Add a when/then promise — attach a proof to verify it',
    helpUrl: '',
    extensions: ['text_field_limits'],
  },
  {
    type: 'has_data',
    message0: 'It stores/tracks %1',
    args0: [
      {
        type: 'field_input',
        name: 'DATA_TEXT',
        text: 'some information',
      },
    ],
    message1: '%1',
    args1: [
      {
        type: 'input_statement',
        name: 'TEST_SOCKET',
        check: 'test_check',
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 135,
    tooltip: 'Add data the nugget needs — attach a proof to verify it',
    helpUrl: '',
    extensions: ['text_field_limits'],
  },
  // --- Proof (was Behavioral Test) ---
  {
    type: 'proof',
    message0: 'Prove that when %1 then %2',
    args0: [
      { type: 'field_input', name: 'GIVEN_WHEN', text: 'the user clicks play' },
      { type: 'field_input', name: 'THEN', text: 'the game starts' },
    ],
    previousStatement: 'test_check',
    nextStatement: 'test_check',
    colour: 30,
    tooltip: 'Add a proof — attach to a Promise block to verify it',
    helpUrl: '',
    extensions: ['text_field_limits'],
  },
  // --- Skill (absorbs Style as shipped skills) ---
  {
    type: 'use_skill',
    message0: 'Use skill: %1',
    args0: [
      {
        type: 'field_dropdown',
        name: 'SKILL_ID',
        options: [['(no skills yet)', '']],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 315,
    tooltip: 'Use a skill from your prompt library',
    helpUrl: '',
    extensions: ['skill_dropdown_extension'],
  },
  // --- Portal (absorbs Knowledge + Devices) ---
  {
    type: 'portal_tell',
    message0: 'Tell %1 to %2',
    args0: [
      {
        type: 'field_dropdown',
        name: 'PORTAL_ID',
        options: [['(no portals yet)', '']],
      },
      {
        type: 'field_dropdown',
        name: 'CAPABILITY_ID',
        options: [['(select portal first)', '']],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 260,
    tooltip: 'Tell a portal to do something',
    helpUrl: '',
    extensions: ['portal_tell_extension'],
  },
  {
    type: 'portal_when',
    message0: 'When %1 %2 %3',
    args0: [
      {
        type: 'field_dropdown',
        name: 'PORTAL_ID',
        options: [['(no portals yet)', '']],
      },
      {
        type: 'field_dropdown',
        name: 'CAPABILITY_ID',
        options: [['(select portal first)', '']],
      },
      {
        type: 'input_statement',
        name: 'ACTION_BLOCKS',
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 260,
    tooltip: 'React when a portal event happens',
    helpUrl: '',
    extensions: ['portal_when_extension'],
  },
  {
    type: 'portal_ask',
    message0: 'Ask %1 for %2',
    args0: [
      {
        type: 'field_dropdown',
        name: 'PORTAL_ID',
        options: [['(no portals yet)', '']],
      },
      {
        type: 'field_dropdown',
        name: 'CAPABILITY_ID',
        options: [['(select portal first)', '']],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 260,
    tooltip: 'Ask a portal for information',
    helpUrl: '',
    extensions: ['portal_ask_extension'],
  },
  // --- Deploy ---
  {
    type: 'deploy_web',
    message0: 'Put it on the web',
    previousStatement: null,
    nextStatement: null,
    colour: 50,
    tooltip: 'Deploy your nugget to the web',
    helpUrl: '',
  },
  {
    type: 'deploy_esp32',
    message0: 'Flash it to my board',
    previousStatement: null,
    nextStatement: null,
    colour: 50,
    tooltip: 'Flash your nugget to an ESP32 board',
    helpUrl: '',
  },
  {
    type: 'deploy_both',
    message0: 'Web dashboard + hardware',
    previousStatement: null,
    nextStatement: null,
    colour: 50,
    tooltip: 'Deploy to both web and hardware',
    helpUrl: '',
  },
];

/** Max characters displayed before truncation with ellipsis. */
export const TEXT_FIELD_MAX_DISPLAY_LENGTH = 50;
/** Max characters allowed in text input fields. */
export const TEXT_FIELD_MAX_INPUT_LENGTH = 150;

let registered = false;

export function registerBlocks(): void {
  if (registered) return;

  // Register text field limits extension (display truncation + input validation)
  Blockly.Extensions.register('text_field_limits', function (this: Blockly.Block) {
    for (const input of this.inputList) {
      for (const field of input.fieldRow) {
        if (field instanceof Blockly.FieldTextInput) {
          field.maxDisplayLength = TEXT_FIELD_MAX_DISPLAY_LENGTH;
          field.setValidator((newValue: string) => {
            if (newValue && newValue.length > TEXT_FIELD_MAX_INPUT_LENGTH) {
              return newValue.substring(0, TEXT_FIELD_MAX_INPUT_LENGTH);
            }
            return newValue;
          });
        }
      }
    }
  });

  // Register dynamic dropdown extensions before defining blocks
  Blockly.Extensions.register('skill_dropdown_extension', function (this: Blockly.Block) {
    const dropdown = this.getField('SKILL_ID') as Blockly.FieldDropdown;
    if (!dropdown) return;
    const originalMenuGenerator = dropdown.getOptions;
    dropdown.getOptions = function () {
      const skills = getCurrentSkills();
      if (skills.length === 0) {
        return [['(no skills yet)', '']];
      }
      return skills.map((s) => [s.name, s.id] as [string, string]);
    };
    // Trigger initial options refresh
    originalMenuGenerator.call(dropdown);
  });

  /** Remove all dynamic PARAM_* inputs from a portal block. */
  function removeParamInputs(block: Blockly.Block): void {
    const inputNames = block.inputList.map(i => i.name).filter(n => n.startsWith('PARAM_'));
    for (const name of inputNames) {
      block.removeInput(name);
    }
  }

  /** Add input fields to a portal block for the selected capability's params. */
  function addParamInputs(block: Blockly.Block, portalId: string, capabilityId: string, kind: 'action' | 'event' | 'query'): void {
    const portals = getCurrentPortals();
    const portal = portals.find(p => p.id === portalId);
    if (!portal) return;
    const cap = portal.capabilities.find(c => c.id === capabilityId && c.kind === kind);
    if (!cap?.params || cap.params.length === 0) return;

    for (const param of cap.params) {
      const inputName = `PARAM_${param.name}`;
      if (param.type === 'boolean') {
        block.appendDummyInput(inputName)
          .appendField(`  ${param.name}:`)
          .appendField(new Blockly.FieldCheckbox(param.default === true ? 'TRUE' : 'FALSE'), inputName);
      } else if (param.type === 'choice' && param.choices && param.choices.length > 0) {
        const options = param.choices.map(c => [c, c] as [string, string]);
        const defaultVal = param.default !== undefined ? String(param.default) : param.choices[0];
        block.appendDummyInput(inputName)
          .appendField(`  ${param.name}:`)
          .appendField(new Blockly.FieldDropdown(options), inputName);
        const field = block.getField(inputName);
        if (field && defaultVal) field.setValue(defaultVal);
      } else if (param.type === 'number') {
        block.appendDummyInput(inputName)
          .appendField(`  ${param.name}:`)
          .appendField(new Blockly.FieldNumber(param.default as number ?? 0), inputName);
      } else {
        // string type
        block.appendDummyInput(inputName)
          .appendField(`  ${param.name}:`)
          .appendField(new Blockly.FieldTextInput(param.default !== undefined ? String(param.default) : ''), inputName);
      }
    }
  }

  function makePortalExtension(kind: 'action' | 'event' | 'query') {
    return function (this: Blockly.Block) {
      const portalDropdown = this.getField('PORTAL_ID') as Blockly.FieldDropdown;
      const capDropdown = this.getField('CAPABILITY_ID') as Blockly.FieldDropdown;
      if (!portalDropdown || !capDropdown) return;

      portalDropdown.getOptions = function () {
        const portals = getCurrentPortals();
        if (portals.length === 0) {
          return [['(no portals yet)', '']];
        }
        return portals.map((p) => [p.name, p.id] as [string, string]);
      };

      capDropdown.getOptions = function () {
        const portals = getCurrentPortals();
        const selectedPortalId = portalDropdown.getValue();
        const portal = portals.find((p) => p.id === selectedPortalId);
        if (!portal) return [['(select portal first)', '']];
        const caps = portal.capabilities.filter((c) => c.kind === kind);
        if (caps.length === 0) return [['(none available)', '']];
        return caps.map((c) => [c.name, c.id] as [string, string]);
      };

      // When portal changes, clear param inputs (capability will change too)
      portalDropdown.setValidator(() => {
        removeParamInputs(this);
        return undefined;
      });

      // When capability changes, rebuild param inputs
      capDropdown.setValidator((newValue: string) => {
        removeParamInputs(this);
        if (newValue) {
          const portalId = portalDropdown.getValue();
          // Defer to next tick so Blockly has finished updating the field value
          setTimeout(() => addParamInputs(this, portalId, newValue, kind), 0);
        }
        return undefined;
      });
    };
  }

  Blockly.Extensions.register('portal_tell_extension', makePortalExtension('action'));
  Blockly.Extensions.register('portal_when_extension', makePortalExtension('event'));
  Blockly.Extensions.register('portal_ask_extension', makePortalExtension('query'));

  Blockly.common.defineBlocks(
    Blockly.common.createBlockDefinitionsFromJsonArray(blockDefs)
  );
  registered = true;
}
