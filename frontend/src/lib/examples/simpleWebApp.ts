import type { ExampleNugget } from './index';

export const simpleWebApp: ExampleNugget = {
  id: 'simple-web-app',
  name: 'My First Website',
  description: 'A click counter with a big button and animated number. Deploys to the web.',
  category: 'web',
  color: 'bg-blue-100',
  accentColor: 'text-blue-700',
  workspace: {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: 'nugget_goal',
          x: 30,
          y: 30,
          fields: { GOAL_TEXT: 'A click counter with a big button and animated number' },
          next: {
            block: {
              type: 'nugget_template',
              fields: { TEMPLATE_TYPE: 'website' },
              next: {
                block: {
                  type: 'feature',
                  fields: { FEATURE_TEXT: 'a large button that says Click Me' },
                  next: {
                    block: {
                      type: 'feature',
                      fields: { FEATURE_TEXT: 'a counter that goes up each time you click' },
                      next: {
                        block: {
                          type: 'look_like',
                          fields: { STYLE_TEXT: 'colorful with smooth animations' },
                          next: {
                            block: {
                              type: 'use_skill',
                              fields: { SKILL_ID: 'skill-big-button' },
                              next: {
                                block: {
                                  type: 'use_rule',
                                  fields: { RULE_ID: 'rule-comments' },
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
    { id: 'skill-big-button', name: 'Big button details', prompt: 'Make the button really large (at least 200px wide), use a fun rounded shape, and add a hover effect that makes it grow slightly.', category: 'feature' },
  ],
  rules: [
    { id: 'rule-comments', name: 'Add helpful comments', prompt: 'Add a comment above every function explaining what it does in simple words a kid can understand.', trigger: 'on_task_complete' },
  ],
  portals: [],
};
