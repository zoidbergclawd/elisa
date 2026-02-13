import * as Blockly from 'blockly';
import { getCurrentSkills, getCurrentRules } from '../Skills/skillsRegistry';
import { getCurrentPortals } from '../Portals/portalRegistry';

const blockDefs = [
  {
    type: 'nugget_goal',
    message0: 'I want to build... %1',
    args0: [
      {
        type: 'field_input',
        name: 'GOAL_TEXT',
        text: 'describe your nugget here',
      },
    ],
    nextStatement: null,
    colour: 210,
    tooltip: 'Describe what you want to build',
    helpUrl: '',
  },
  {
    type: 'feature',
    message0: 'It should be able to... %1',
    args0: [
      {
        type: 'field_input',
        name: 'FEATURE_TEXT',
        text: 'do something cool',
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 135,
    tooltip: 'Add a feature requirement',
    helpUrl: '',
  },
  {
    type: 'agent_builder',
    message0: 'Add a Builder Minion named %1 who is %2',
    args0: [
      {
        type: 'field_input',
        name: 'AGENT_NAME',
        text: 'Builder Bot',
      },
      {
        type: 'field_input',
        name: 'AGENT_PERSONA',
        text: 'a careful coder',
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 30,
    tooltip: 'Add a Builder Minion to your squad',
    helpUrl: '',
  },
  {
    type: 'agent_tester',
    message0: 'Add a Tester Minion named %1 who is %2',
    args0: [
      {
        type: 'field_input',
        name: 'AGENT_NAME',
        text: 'Test Bot',
      },
      {
        type: 'field_input',
        name: 'AGENT_PERSONA',
        text: 'a thorough checker',
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 30,
    tooltip: 'Add a Tester Minion to your squad',
    helpUrl: '',
  },
  {
    type: 'deploy_web',
    message0: 'Put it on the web',
    previousStatement: null,
    nextStatement: null,
    colour: 180,
    tooltip: 'Deploy your nugget to the web',
    helpUrl: '',
  },
  {
    type: 'deploy_esp32',
    message0: 'Flash it to my board',
    previousStatement: null,
    nextStatement: null,
    colour: 180,
    tooltip: 'Flash your nugget to an ESP32 board',
    helpUrl: '',
  },
  // Goals category additions
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
  // Requirements category additions
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
    previousStatement: null,
    nextStatement: null,
    colour: 135,
    tooltip: 'Add a when/then rule',
    helpUrl: '',
  },
  {
    type: 'has_data',
    message0: 'It needs to know about... %1',
    args0: [
      {
        type: 'field_input',
        name: 'DATA_TEXT',
        text: 'some information',
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 135,
    tooltip: 'Add data the nugget needs',
    helpUrl: '',
  },
  // Style category (NEW - colour 270)
  {
    type: 'look_like',
    message0: 'Make it look... %1',
    args0: [
      {
        type: 'field_dropdown',
        name: 'STYLE_PRESET',
        options: [
          ['Fun & Colorful', 'fun_colorful'],
          ['Clean & Simple', 'clean_simple'],
          ['Dark & Techy', 'dark_techy'],
          ['Nature', 'nature'],
          ['Space', 'space'],
        ],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 270,
    tooltip: 'Choose a visual style',
    helpUrl: '',
  },
  {
    type: 'personality',
    message0: "Give it a personality that's... %1",
    args0: [
      {
        type: 'field_input',
        name: 'PERSONALITY_TEXT',
        text: 'friendly and helpful',
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 270,
    tooltip: 'Set the personality',
    helpUrl: '',
  },
  // Agents category additions
  {
    type: 'agent_reviewer',
    message0: 'Add a Reviewer Minion named %1 who focuses on %2',
    args0: [
      {
        type: 'field_input',
        name: 'AGENT_NAME',
        text: 'Review Bot',
      },
      {
        type: 'field_input',
        name: 'AGENT_PERSONA',
        text: 'code quality',
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 30,
    tooltip: 'Add a Reviewer Minion to your squad',
    helpUrl: '',
  },
  {
    type: 'agent_custom',
    message0: 'Add a Custom Minion named %1 who %2',
    args0: [
      {
        type: 'field_input',
        name: 'AGENT_NAME',
        text: 'Helper Bot',
      },
      {
        type: 'field_input',
        name: 'AGENT_PERSONA',
        text: 'does something special',
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 30,
    tooltip: 'Add a Custom Minion to your squad',
    helpUrl: '',
  },
  // Flow category (NEW - colour 60) - container blocks
  {
    type: 'first_then',
    message0: 'First do %1 Then do %2',
    args0: [
      {
        type: 'input_statement',
        name: 'FIRST_BLOCKS',
      },
      {
        type: 'input_statement',
        name: 'THEN_BLOCKS',
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 60,
    tooltip: 'Do things in order',
    helpUrl: '',
  },
  {
    type: 'at_same_time',
    message0: 'Do these at the same time %1',
    args0: [
      {
        type: 'input_statement',
        name: 'PARALLEL_BLOCKS',
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 60,
    tooltip: 'Do things in parallel',
    helpUrl: '',
  },
  {
    type: 'keep_improving',
    message0: 'Keep improving until... %1',
    args0: [
      {
        type: 'field_input',
        name: 'CONDITION_TEXT',
        text: 'it works perfectly',
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 60,
    tooltip: 'Iterate until a condition is met',
    helpUrl: '',
  },
  {
    type: 'timer_every',
    message0: 'Every %1 seconds %2',
    args0: [
      {
        type: 'field_number',
        name: 'INTERVAL',
        value: 5,
      },
      {
        type: 'input_statement',
        name: 'ACTION_BLOCKS',
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 60,
    tooltip: 'Do something on a timer',
    helpUrl: '',
  },
  {
    type: 'check_with_me',
    message0: 'Check with me before... %1',
    args0: [
      {
        type: 'field_input',
        name: 'GATE_DESCRIPTION',
        text: 'finishing the nugget',
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 60,
    tooltip: 'Add a review checkpoint',
    helpUrl: '',
  },
  // Deploy category additions
  {
    type: 'deploy_both',
    message0: 'Web dashboard + hardware',
    previousStatement: null,
    nextStatement: null,
    colour: 180,
    tooltip: 'Deploy to both web and hardware',
    helpUrl: '',
  },
  // Skills category (NEW - colour 315)
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
  {
    type: 'use_rule',
    message0: 'Apply rule: %1',
    args0: [
      {
        type: 'field_dropdown',
        name: 'RULE_ID',
        options: [['(no rules yet)', '']],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 345,
    tooltip: 'Apply a rule from your prompt library',
    helpUrl: '',
    extensions: ['rule_dropdown_extension'],
  },
  // Portals category (NEW - colour 160, teal)
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
    colour: 160,
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
    colour: 160,
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
    colour: 160,
    tooltip: 'Ask a portal for information',
    helpUrl: '',
    extensions: ['portal_ask_extension'],
  },
];

let registered = false;

export function registerBlocks(): void {
  if (registered) return;

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

  Blockly.Extensions.register('rule_dropdown_extension', function (this: Blockly.Block) {
    const dropdown = this.getField('RULE_ID') as Blockly.FieldDropdown;
    if (!dropdown) return;
    const originalMenuGenerator = dropdown.getOptions;
    dropdown.getOptions = function () {
      const rules = getCurrentRules();
      if (rules.length === 0) {
        return [['(no rules yet)', '']];
      }
      return rules.map((r) => [r.name, r.id] as [string, string]);
    };
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
      // Arrow functions capture `this` (the block) from the extension scope
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
