import * as Blockly from 'blockly';
import { getCurrentSkills } from '../Skills/skillsRegistry';

const skillFlowBlockDefs = [
  {
    type: 'skill_flow_start',
    message0: 'Skill Flow',
    nextStatement: null,
    colour: 315,
    tooltip: 'Entry point for a composite skill flow',
    helpUrl: '',
  },
  {
    type: 'skill_ask_user',
    message0: 'Ask user: %1 header: %2 options: %3 store as: %4',
    args0: [
      { type: 'field_input', name: 'QUESTION', text: 'What would you like?' },
      { type: 'field_input', name: 'HEADER', text: 'Choice' },
      { type: 'field_input', name: 'OPTIONS', text: 'Option A, Option B, Option C' },
      { type: 'field_input', name: 'STORE_AS', text: 'answer' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 315,
    tooltip: 'Ask the user a question with options. Comma-separated options.',
    helpUrl: '',
  },
  {
    type: 'skill_branch_if',
    message0: 'If %1 equals %2 %3',
    args0: [
      { type: 'field_input', name: 'CONTEXT_KEY', text: 'answer' },
      { type: 'field_input', name: 'MATCH_VALUE', text: 'Option A' },
      { type: 'input_statement', name: 'THEN_BLOCKS' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 315,
    tooltip: 'If the context value matches, run the nested blocks. Blocks after this one always run regardless.',
    helpUrl: '',
  },
  {
    type: 'skill_invoke',
    message0: 'Run skill: %1 store as: %2',
    args0: [
      {
        type: 'field_dropdown',
        name: 'SKILL_ID',
        options: [['(no skills yet)', '']],
      },
      { type: 'field_input', name: 'STORE_AS', text: 'skill_result' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 315,
    tooltip: 'Invoke another skill by ID and store its output',
    helpUrl: '',
    extensions: ['skill_flow_dropdown_extension'],
  },
  {
    type: 'skill_run_agent',
    message0: 'Run agent with prompt: %1 store as: %2',
    args0: [
      { type: 'field_multilinetext', name: 'PROMPT', text: 'Build a {{topic}} presentation using python-pptx' },
      { type: 'field_input', name: 'STORE_AS', text: 'agent_result' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 315,
    tooltip: 'Spawn a Claude agent with a prompt template. Use {{key}} syntax to insert context values (e.g. {{answer}}, {{topic}}).',
    helpUrl: '',
  },
  {
    type: 'skill_set_context',
    message0: 'Set %1 = %2',
    args0: [
      { type: 'field_input', name: 'KEY', text: 'my_key' },
      { type: 'field_input', name: 'VALUE', text: '{{some_value}}' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 315,
    tooltip: 'Set a context value. Use {{key}} to reference other values.',
    helpUrl: '',
  },
  {
    type: 'skill_output',
    message0: 'Output: %1',
    args0: [
      { type: 'field_input', name: 'TEMPLATE', text: 'Result: {{agent_result}}' },
    ],
    previousStatement: null,
    colour: 315,
    tooltip: 'Produce the final output of this skill flow. Terminal block.',
    helpUrl: '',
  },
];

let registered = false;

export function registerSkillFlowBlocks(): void {
  if (registered) return;

  Blockly.Extensions.register('skill_flow_dropdown_extension', function (this: Blockly.Block) {
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
    originalMenuGenerator.call(dropdown);
  });

  Blockly.common.defineBlocks(
    Blockly.common.createBlockDefinitionsFromJsonArray(skillFlowBlockDefs),
  );
  registered = true;
}
