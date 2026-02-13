import type { ExampleNugget } from './index';

export const spaceDodge: ExampleNugget = {
  id: 'space-dodge',
  name: 'Space Dodge',
  description: 'A browser game where you dodge asteroids in space. Arrow keys to move, survive as long as you can!',
  category: 'game',
  color: 'bg-amber-100',
  accentColor: 'text-amber-700',
  workspace: {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: 'nugget_goal',
          x: 30,
          y: 30,
          fields: { GOAL_TEXT: 'A space dodge game where I fly a spaceship and avoid asteroids' },
          next: {
            block: {
              type: 'nugget_template',
              fields: { TEMPLATE_TYPE: 'game' },
              next: {
                block: {
                  type: 'feature',
                  fields: { FEATURE_TEXT: 'a spaceship I control with arrow keys' },
                  next: {
                    block: {
                      type: 'feature',
                      fields: { FEATURE_TEXT: 'asteroids that fall from the top of the screen' },
                      next: {
                        block: {
                          type: 'when_then',
                          fields: { TRIGGER_TEXT: 'my ship hits an asteroid', ACTION_TEXT: 'the game ends and shows my score' },
                          next: {
                            block: {
                              type: 'has_data',
                              fields: { DATA_TEXT: 'a score that counts how many seconds I survived' },
                              next: {
                                block: {
                                  type: 'use_skill',
                                  fields: { SKILL_ID: 'skill-retro-style' },
                                  next: {
                                    block: {
                                      type: 'use_rule',
                                      fields: { RULE_ID: 'rule-game-playable' },
                                      next: {
                                        block: {
                                          type: 'use_rule',
                                          fields: { RULE_ID: 'rule-no-lag' },
                                          next: {
                                            block: {
                                              type: 'look_like',
                                              fields: { STYLE_TEXT: 'dark space background with glowing neon colors' },
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
      ],
    },
  },
  skills: [
    {
      id: 'skill-retro-style',
      name: 'Retro arcade style',
      prompt: 'Make the game look like a retro arcade game. Use pixel-style fonts, screen shake on collision, and a starfield background that scrolls.',
      category: 'style',
    },
  ],
  rules: [
    { id: 'rule-game-playable', name: 'Game must be playable', prompt: 'The game must load without errors, respond to arrow keys, and show a score. Test by opening index.html in a browser.', trigger: 'on_task_complete' },
    { id: 'rule-no-lag', name: 'No lag allowed', prompt: 'The game must run smoothly at 60fps. Do not use heavy DOM manipulation inside the game loop. Use requestAnimationFrame.', trigger: 'always' },
  ],
  portals: [],
};
