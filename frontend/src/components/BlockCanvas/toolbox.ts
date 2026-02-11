export const toolbox = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: 'Goals',
      colour: '210',
      contents: [
        { kind: 'block', type: 'project_goal' },
        { kind: 'block', type: 'project_template' },
      ],
    },
    {
      kind: 'category',
      name: 'Requirements',
      colour: '135',
      contents: [
        { kind: 'block', type: 'feature' },
        { kind: 'block', type: 'constraint' },
        { kind: 'block', type: 'when_then' },
        { kind: 'block', type: 'has_data' },
      ],
    },
    {
      kind: 'category',
      name: 'Style',
      colour: '270',
      contents: [
        { kind: 'block', type: 'look_like' },
        { kind: 'block', type: 'personality' },
      ],
    },
    {
      kind: 'category',
      name: 'Agents',
      colour: '30',
      contents: [
        { kind: 'block', type: 'agent_builder' },
        { kind: 'block', type: 'agent_tester' },
        { kind: 'block', type: 'agent_reviewer' },
        { kind: 'block', type: 'agent_custom' },
      ],
    },
    {
      kind: 'category',
      name: 'Flow',
      colour: '60',
      contents: [
        { kind: 'block', type: 'first_then' },
        { kind: 'block', type: 'at_same_time' },
        { kind: 'block', type: 'keep_improving' },
        { kind: 'block', type: 'check_with_me' },
      ],
    },
    {
      kind: 'category',
      name: 'Hardware',
      colour: '0',
      contents: [
        { kind: 'block', type: 'led_control' },
        { kind: 'block', type: 'button_input' },
        { kind: 'block', type: 'sensor_read' },
        { kind: 'block', type: 'lora_send' },
        { kind: 'block', type: 'lora_receive' },
        { kind: 'block', type: 'timer_every' },
        { kind: 'block', type: 'buzzer_play' },
      ],
    },
    {
      kind: 'category',
      name: 'Deploy',
      colour: '180',
      contents: [
        { kind: 'block', type: 'deploy_web' },
        { kind: 'block', type: 'deploy_esp32' },
        { kind: 'block', type: 'deploy_both' },
      ],
    },
  ],
};
