import type { ExampleNugget } from './index';

export const rulesShowcase: ExampleNugget = {
  id: 'rules-showcase',
  name: 'Portfolio Page',
  description: 'A personal portfolio page with a bio, project cards, contact form, and smooth scroll navigation.',
  category: 'web',
  color: 'bg-indigo-100',
  accentColor: 'text-indigo-700',
  workspace: {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: 'nugget_goal',
          x: 30,
          y: 30,
          fields: { GOAL_TEXT: 'A personal portfolio page with a bio, project cards, and contact form' },
          next: {
            block: {
              type: 'nugget_template',
              fields: { TEMPLATE_TYPE: 'website' },
              next: {
                block: {
                  type: 'feature',
                  fields: { FEATURE_TEXT: 'a hero section with name, title, and a short bio paragraph' },
                  next: {
                    block: {
                      type: 'feature',
                      fields: { FEATURE_TEXT: 'a project cards grid showing three portfolio items with images and descriptions' },
                      next: {
                        block: {
                          type: 'feature',
                          fields: { FEATURE_TEXT: 'a contact form with name, email, and message fields' },
                          next: {
                            block: {
                              type: 'use_skill',
                              fields: { SKILL_ID: 'skill-smooth-scroll' },
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
      ],
    },
  },
  skills: [
    {
      id: 'skill-smooth-scroll',
      name: 'Smooth scroll navigation',
      prompt: 'Add a sticky navigation bar at the top with links to each section (Bio, Projects, Contact). Clicking a link smooth-scrolls to that section. Use CSS scroll-behavior: smooth and anchor IDs.',
      category: 'feature',
    },
  ],
  rules: [],
  portals: [],
};
