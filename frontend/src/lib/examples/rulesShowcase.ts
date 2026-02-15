import type { ExampleNugget } from './index';

export const rulesShowcase: ExampleNugget = {
  id: 'rules-showcase',
  name: 'Rules Showcase',
  description: 'Demonstrates all four rule triggers: always, on_task_complete, on_test_fail, and before_deploy. Builds a portfolio page with quality gates.',
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
                              type: 'look_like',
                              fields: { STYLE_TEXT: 'professional and minimal with a dark color scheme' },
                              next: {
                                block: {
                                  type: 'use_skill',
                                  fields: { SKILL_ID: 'skill-smooth-scroll' },
                                  next: {
                                    block: {
                                      type: 'use_rule',
                                      fields: { RULE_ID: 'rule-accessible-colors' },
                                      next: {
                                        block: {
                                          type: 'use_rule',
                                          fields: { RULE_ID: 'rule-responsive-layout' },
                                          next: {
                                            block: {
                                              type: 'use_rule',
                                              fields: { RULE_ID: 'rule-clean-up-debug' },
                                              next: {
                                                block: {
                                                  type: 'use_rule',
                                                  fields: { RULE_ID: 'rule-read-the-error' },
                                                  next: {
                                                    block: {
                                                      type: 'use_rule',
                                                      fields: { RULE_ID: 'rule-all-images-alt' },
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
    {
      id: 'skill-smooth-scroll',
      name: 'Smooth scroll navigation',
      prompt: 'Add a sticky navigation bar at the top with links to each section (Bio, Projects, Contact). Clicking a link smooth-scrolls to that section. Use CSS scroll-behavior: smooth and anchor IDs.',
      category: 'feature',
    },
  ],
  rules: [
    {
      id: 'rule-accessible-colors',
      name: 'Accessible color contrast',
      prompt: 'All text must have a contrast ratio of at least 4.5:1 against its background. Use light text on dark backgrounds and dark text on light backgrounds. Never use light gray text on a white background.',
      trigger: 'always',
    },
    {
      id: 'rule-responsive-layout',
      name: 'Mobile-friendly layout',
      prompt: 'Use responsive CSS so the page works on mobile screens. The project cards grid should stack to a single column below 768px. The navigation should collapse or wrap on small screens. Use relative units (rem, %) instead of fixed pixel widths.',
      trigger: 'always',
    },
    {
      id: 'rule-clean-up-debug',
      name: 'Clean up debug code',
      prompt: 'Remove all console.log, console.debug, and console.warn statements. Remove any TODO or FIXME comments. Remove any commented-out code blocks. Only console.error is allowed.',
      trigger: 'on_task_complete',
    },
    {
      id: 'rule-read-the-error',
      name: 'Read the error first',
      prompt: 'Before changing any code to fix a failing test, read the full error message and stack trace. Identify the exact file and line number. Explain what the error means in a comment before attempting a fix. Make the smallest change possible.',
      trigger: 'on_test_fail',
    },
    {
      id: 'rule-all-images-alt',
      name: 'All images need alt text',
      prompt: 'Every img element must have a descriptive alt attribute. Decorative images should use alt="". Check that no image is missing alt text before deploying. Also verify all image src paths are valid.',
      trigger: 'before_deploy',
    },
  ],
  portals: [],
};
