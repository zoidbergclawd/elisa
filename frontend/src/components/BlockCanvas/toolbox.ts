export const toolbox = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: 'Goals',
      colour: '210',
      contents: [
        { kind: 'block', type: 'nugget_goal' },
        { kind: 'block', type: 'nugget_template' },
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
      name: 'Skills',
      colour: '315',
      contents: [
        { kind: 'block', type: 'use_skill' },
        { kind: 'block', type: 'use_rule' },
      ],
    },
    {
      kind: 'category',
      name: 'Portals',
      colour: '160',
      contents: [
        { kind: 'block', type: 'portal_tell' },
        { kind: 'block', type: 'portal_when' },
        { kind: 'block', type: 'portal_ask' },
      ],
    },
    {
      kind: 'category',
      name: 'Minions',
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
        { kind: 'block', type: 'timer_every' },
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
