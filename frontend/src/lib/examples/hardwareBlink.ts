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
                      type: 'hw_component',
                      fields: { HW_TYPE: 'led', HW_ACTION: 'blink', HW_SPEED: 'normal' },
                      next: {
                        block: {
                          type: 'deploy_hardware',
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
      ],
    },
  },
  skills: [],
  rules: [],
  portals: [],
};
