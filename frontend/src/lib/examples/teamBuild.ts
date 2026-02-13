import type { ExampleNugget } from './index';

export const teamBuild: ExampleNugget = {
  id: 'team-build',
  name: 'Team Build',
  description: 'A todo app built by a full team: builder writes code, tester checks it, reviewer approves.',
  category: 'multi-agent',
  color: 'bg-purple-100',
  accentColor: 'text-purple-700',
  workspace: {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: 'nugget_goal',
          x: 30,
          y: 30,
          fields: { GOAL_TEXT: 'A todo list app where I can add, check off, and delete tasks' },
          next: {
            block: {
              type: 'nugget_template',
              fields: { TEMPLATE_TYPE: 'website' },
              next: {
                block: {
                  type: 'feature',
                  fields: { FEATURE_TEXT: 'add new todo items with a text input and button' },
                  next: {
                    block: {
                      type: 'feature',
                      fields: { FEATURE_TEXT: 'mark items as done with a checkbox' },
                      next: {
                        block: {
                          type: 'feature',
                          fields: { FEATURE_TEXT: 'delete items with a remove button' },
                          next: {
                            block: {
                              type: 'agent_tester',
                              fields: { AGENT_NAME: 'Test Bot' },
                              next: {
                                block: {
                                  type: 'agent_reviewer',
                                  fields: { AGENT_NAME: 'Review Bot' },
                                  next: {
                                    block: {
                                      type: 'use_skill',
                                      fields: { SKILL_ID: 'skill-clean-ui' },
                                      next: {
                                        block: {
                                          type: 'use_skill',
                                          fields: { SKILL_ID: 'skill-pastel-style' },
                                          next: {
                                            block: {
                                              type: 'use_rule',
                                              fields: { RULE_ID: 'rule-test-all' },
                                              next: {
                                                block: {
                                                  type: 'use_rule',
                                                  fields: { RULE_ID: 'rule-fix-carefully' },
                                                  next: {
                                                    block: {
                                                      type: 'look_like',
                                                      fields: { STYLE_PRESET: 'clean_simple' },
                                                      next: {
                                                        block: {
                                                          type: 'deploy_web',
                                                          fields: {},
                                                        },
                                                      },
                                                    },
                                                  },
                                                },
                                              },
                                            },
                                          },
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      ],
    },
  },
  skills: [
    { id: 'skill-clean-ui', name: 'Clean UI details', prompt: 'Use a card-based layout for each todo item. Each card should have a checkbox on the left, the task text in the middle, and a red X delete button on the right.', category: 'feature' },
    { id: 'skill-pastel-style', name: 'Pastel color scheme', prompt: 'Use soft pastel colors: light blue header, white cards with subtle shadows, and gentle rounded corners on everything.', category: 'style' },
  ],
  rules: [
    {
      id: 'rule-test-all',
      name: 'Test everything',
      prompt: 'Write tests for every feature. Every add, check, and delete action must have at least one test.',
      trigger: 'always',
    },
    { id: 'rule-fix-carefully', name: 'Fix carefully on fail', prompt: 'Read the exact error message. Only change the specific line that caused the error. Do not rewrite working code.', trigger: 'on_test_fail' },
  ],
  portals: [],
};
