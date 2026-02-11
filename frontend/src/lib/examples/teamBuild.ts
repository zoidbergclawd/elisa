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
                              type: 'add_agent',
                              fields: { AGENT_NAME: 'Test Bot', AGENT_ROLE: 'tester' },
                              next: {
                                block: {
                                  type: 'add_agent',
                                  fields: { AGENT_NAME: 'Review Bot', AGENT_ROLE: 'reviewer' },
                                  next: {
                                    block: {
                                      type: 'look_like',
                                      fields: { STYLE_TEXT: 'clean and modern with a light theme' },
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
      ],
    },
  },
  skills: [],
  rules: [
    {
      id: 'rule-test-all',
      name: 'Test everything',
      prompt: 'Write tests for every feature. Every add, check, and delete action must have at least one test.',
      trigger: 'always',
    },
  ],
  portals: [],
};
