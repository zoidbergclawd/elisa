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
    message0: 'Add a builder named %1 who is %2',
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
    tooltip: 'Add a builder agent to your team',
    helpUrl: '',
  },
  {
    type: 'agent_tester',
    message0: 'Add a tester named %1 who is %2',
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
    tooltip: 'Add a tester agent to your team',
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
    message0: 'Add a reviewer named %1 who focuses on %2',
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
    tooltip: 'Add a reviewer agent to your team',
    helpUrl: '',
  },
  {
    type: 'agent_custom',
    message0: 'Add a helper named %1 who %2',
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
    tooltip: 'Add a custom helper agent',
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
  // Hardware category (NEW - colour 0)
  {
    type: 'led_control',
    message0: 'Turn LED %1 at %2 speed',
    args0: [
      {
        type: 'field_dropdown',
        name: 'LED_ACTION',
        options: [
          ['On', 'on'],
          ['Off', 'off'],
          ['Blink', 'blink'],
        ],
      },
      {
        type: 'field_dropdown',
        name: 'LED_SPEED',
        options: [
          ['Slow', 'slow'],
          ['Normal', 'normal'],
          ['Fast', 'fast'],
        ],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 0,
    tooltip: 'Control an LED',
    helpUrl: '',
  },
  {
    type: 'button_input',
    message0: 'When button on pin %1 is pressed %2',
    args0: [
      {
        type: 'field_number',
        name: 'PIN',
        value: 12,
      },
      {
        type: 'input_statement',
        name: 'ACTION_BLOCKS',
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 0,
    tooltip: 'React to a button press',
    helpUrl: '',
  },
  {
    type: 'sensor_read',
    message0: 'Read the %1 sensor',
    args0: [
      {
        type: 'field_dropdown',
        name: 'SENSOR_TYPE',
        options: [
          ['Temperature', 'temperature'],
          ['Light', 'light'],
          ['Motion', 'motion'],
          ['Custom', 'custom'],
        ],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 0,
    tooltip: 'Read a sensor value',
    helpUrl: '',
  },
  {
    type: 'lora_send',
    message0: 'Send message %1 on channel %2',
    args0: [
      {
        type: 'field_input',
        name: 'MESSAGE',
        text: 'hello',
      },
      {
        type: 'field_number',
        name: 'CHANNEL',
        value: 1,
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 0,
    tooltip: 'Send a LoRa message',
    helpUrl: '',
  },
  {
    type: 'lora_receive',
    message0: 'When message arrives on channel %1 %2',
    args0: [
      {
        type: 'field_number',
        name: 'CHANNEL',
        value: 1,
      },
      {
        type: 'input_statement',
        name: 'ACTION_BLOCKS',
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 0,
    tooltip: 'React to incoming LoRa messages',
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
    colour: 0,
    tooltip: 'Do something on a timer',
    helpUrl: '',
  },
  {
    type: 'buzzer_play',
    message0: 'Play sound at %1 Hz for %2 seconds',
    args0: [
      {
        type: 'field_number',
        name: 'FREQUENCY',
        value: 1000,
      },
      {
        type: 'field_number',
        name: 'DURATION',
        value: 0.5,
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 0,
    tooltip: 'Play a buzzer tone',
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

  function makePortalExtension(kind: 'action' | 'event' | 'query', _fieldName: string) {
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
    };
  }

  Blockly.Extensions.register('portal_tell_extension', makePortalExtension('action', 'CAPABILITY_ID'));
  Blockly.Extensions.register('portal_when_extension', makePortalExtension('event', 'CAPABILITY_ID'));
  Blockly.Extensions.register('portal_ask_extension', makePortalExtension('query', 'CAPABILITY_ID'));

  Blockly.common.defineBlocks(
    Blockly.common.createBlockDefinitionsFromJsonArray(blockDefs)
  );
  registered = true;
}
