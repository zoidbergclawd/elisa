import type { ExampleNugget } from './index';

export const hardwareBlink: ExampleNugget = {
  id: 'hardware-blink',
  name: 'Blinky Board',
  description: 'Make the LED on your ESP32 blink on and off. Your first hardware nugget!',
  category: 'hardware',
  color: 'bg-green-100',
  accentColor: 'text-green-700',
  workspace: {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: 'nugget_goal',
          x: 30,
          y: 30,
          fields: { GOAL_TEXT: 'Blink the LED on my ESP32 board' },
          next: {
            block: {
              type: 'nugget_template',
              fields: { TEMPLATE_TYPE: 'hardware' },
              next: {
                block: {
                  type: 'feature',
                  fields: { FEATURE_TEXT: 'blink the onboard LED on and off every second' },
                  next: {
                    block: {
                      type: 'heltec_blink',
                      fields: { SPEED: 'normal' },
                      next: {
                        block: {
                          type: 'use_skill',
                          fields: { SKILL_ID: 'skill-friendly-code' },
                          next: {
                            block: {
                              type: 'use_rule',
                              fields: { RULE_ID: 'rule-compile-check' },
                              next: {
                                block: {
                                  type: 'deploy_esp32',
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
    { id: 'skill-friendly-code', name: 'Friendly code agent', prompt: 'Write code like you are teaching someone who has never programmed before. Use simple variable names and add print statements that explain what is happening.', category: 'agent' },
  ],
  rules: [
    { id: 'rule-compile-check', name: 'Must compile cleanly', prompt: 'Before deploying, make sure the MicroPython code compiles without any errors or warnings.', trigger: 'before_deploy' },
  ],
  portals: [],
};
