import type { ExampleNugget } from './index';

export const skillShowcase: ExampleNugget = {
  id: 'skill-showcase',
  name: 'Skill Showcase',
  description: 'Demonstrates skills, rules, and composite skill flows. Builds a themed landing page with code quality rules.',
  category: 'web',
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
          fields: { GOAL_TEXT: 'A themed landing page that showcases skill and rule features' },
          next: {
            block: {
              type: 'nugget_template',
              fields: { TEMPLATE_TYPE: 'website' },
              next: {
                block: {
                  type: 'feature',
                  fields: { FEATURE_TEXT: 'a hero section with a bold headline and call-to-action button' },
                  next: {
                    block: {
                      type: 'feature',
                      fields: { FEATURE_TEXT: 'a features grid showing three cards with icons' },
                      next: {
                        block: {
                          type: 'look_like',
                          fields: { STYLE_TEXT: 'modern and clean with a gradient background' },
                          next: {
                            block: {
                              type: 'use_skill',
                              fields: { SKILL_ID: 'skill-hero-polish' },
                              next: {
                                block: {
                                  type: 'use_skill',
                                  fields: { SKILL_ID: 'skill-theme-picker' },
                                  next: {
                                    block: {
                                      type: 'use_rule',
                                      fields: { RULE_ID: 'rule-semantic-html' },
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
  skills: [
    {
      id: 'skill-hero-polish',
      name: 'Hero section polish',
      prompt: 'Make the hero section visually striking: use a large bold font for the headline, add a subtle background animation or gradient shift, and make the call-to-action button pulse gently to draw attention.',
      category: 'feature',
    },
    {
      id: 'skill-theme-picker',
      name: 'Theme picker',
      prompt: 'Apply the chosen color theme to the landing page.',
      category: 'composite',
      workspace: {
        blocks: {
          blocks: [
            {
              type: 'skill_flow_start',
              id: 'theme-start',
              next: {
                block: {
                  type: 'skill_ask_user',
                  id: 'theme-ask',
                  fields: {
                    QUESTION: 'Which color theme do you want?',
                    HEADER: 'Theme',
                    OPTIONS: 'ocean, sunset, forest',
                    STORE_AS: 'theme',
                  },
                  next: {
                    block: {
                      type: 'skill_branch_if',
                      id: 'theme-branch-ocean',
                      fields: { CONTEXT_KEY: 'theme', MATCH_VALUE: 'ocean' },
                      inputs: {
                        THEN_BLOCKS: {
                          block: {
                            type: 'skill_run_agent',
                            id: 'theme-agent-ocean',
                            fields: {
                              PROMPT: 'Apply an ocean color theme: use deep blues (#0a2463, #3e92cc), white text, and wave-like gradients.',
                              STORE_AS: 'theme_result',
                            },
                          },
                        },
                      },
                      next: {
                        block: {
                          type: 'skill_branch_if',
                          id: 'theme-branch-sunset',
                          fields: { CONTEXT_KEY: 'theme', MATCH_VALUE: 'sunset' },
                          inputs: {
                            THEN_BLOCKS: {
                              block: {
                                type: 'skill_run_agent',
                                id: 'theme-agent-sunset',
                                fields: {
                                  PROMPT: 'Apply a sunset color theme: use warm oranges (#ff6b35, #f7c59f), dark text, and gradient transitions from orange to pink.',
                                  STORE_AS: 'theme_result',
                                },
                              },
                            },
                          },
                          next: {
                            block: {
                              type: 'skill_branch_if',
                              id: 'theme-branch-forest',
                              fields: { CONTEXT_KEY: 'theme', MATCH_VALUE: 'forest' },
                              inputs: {
                                THEN_BLOCKS: {
                                  block: {
                                    type: 'skill_run_agent',
                                    id: 'theme-agent-forest',
                                    fields: {
                                      PROMPT: 'Apply a forest color theme: use deep greens (#1b4332, #52b788), cream text, and earthy accent colors.',
                                      STORE_AS: 'theme_result',
                                    },
                                  },
                                },
                              },
                              next: {
                                block: {
                                  type: 'skill_output',
                                  id: 'theme-output',
                                  fields: { TEMPLATE: '{{theme_result}}' },
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
    },
  ],
  rules: [
    {
      id: 'rule-semantic-html',
      name: 'Use semantic HTML',
      prompt: 'Use semantic HTML elements throughout: header, nav, main, section, article, footer. Do not use div for structural layout. Every image must have an alt attribute.',
      trigger: 'always',
    },
  ],
  portals: [],
};
