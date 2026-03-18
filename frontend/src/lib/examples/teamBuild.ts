import type { ExampleNugget } from './index';

export const teamBuild: ExampleNugget = {
  id: 'team-build',
  name: 'Team Build',
  description: 'A todo app with skills for clean UI and pastel styling, deployed to the web.',
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
                              type: 'use_skill',
                              fields: { SKILL_ID: 'skill-clean-ui' },
                              next: {
                                block: {
                                  type: 'use_skill',
                                  fields: { SKILL_ID: 'skill-pastel-style' },
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
      ],
    },
  },
  skills: [
    { id: 'skill-clean-ui', name: 'Clean UI details', prompt: 'Use a card-based layout for each todo item. Each card should have a checkbox on the left, the task text in the middle, and a red X delete button on the right.', category: 'feature' },
    { id: 'skill-pastel-style', name: 'Pastel color scheme', prompt: 'Use soft pastel colors: light blue header, white cards with subtle shadows, and gentle rounded corners on everything.', category: 'style' },
  ],
  rules: [],
  portals: [],
};
