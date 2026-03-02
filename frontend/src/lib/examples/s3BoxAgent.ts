import type { ExampleNugget } from './index';

export const s3BoxAgent: ExampleNugget = {
  id: 's3-box-agent',
  name: 'Space Commander',
  description: 'A voice-controlled space-themed AI buddy on the ESP32-S3-BOX-3. Wake it up and talk to your own space commander!',
  category: 'hardware',
  color: 'bg-violet-100',
  accentColor: 'text-violet-700',
  requiredDevices: ['esp32-s3-box3-agent'],
  workspace: {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: 'nugget_goal',
          x: 30,
          y: 30,
          fields: { GOAL_TEXT: 'A voice-controlled space commander AI buddy on my ESP32-S3-BOX-3' },
          next: {
            block: {
              type: 'nugget_template',
              fields: { TEMPLATE_TYPE: 'hardware' },
              next: {
                block: {
                  type: 'feature',
                  fields: { FEATURE_TEXT: 'responds to voice commands with a space commander personality' },
                  next: {
                    block: {
                      type: 'feature',
                      fields: { FEATURE_TEXT: 'shows a space-themed display with listening indicator' },
                      next: {
                        block: {
                          type: 'esp32_s3_box3_agent',
                          fields: {
                            WAKE_WORD: 'hey commander',
                            VOICE_ENABLED: true,
                            WIFI_SSID: '',
                            WIFI_PASS: '',
                          },
                          next: {
                            block: {
                              type: 'esp32_s3_box3_display',
                              fields: {
                                THEME: 'space',
                                SHOW_LISTENING: true,
                              },
                              next: {
                                block: {
                                  type: 'use_skill',
                                  fields: { SKILL_ID: 'skill-space-personality' },
                                  next: {
                                    block: {
                                      type: 'use_rule',
                                      fields: { RULE_ID: 'rule-quick-response' },
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
              },
            },
          },
        },
      ],
    },
  },
  skills: [
    {
      id: 'skill-space-personality',
      name: 'Space commander personality',
      prompt: 'You are Commander Nova, a friendly space explorer. Respond to everything as if you are on a mission in deep space. Use space metaphors, give star-themed encouragement, and make the user feel like your co-pilot.',
      category: 'agent',
    },
  ],
  rules: [
    {
      id: 'rule-quick-response',
      name: 'Respond quickly',
      prompt: 'Keep all responses under 3 sentences so the voice response feels snappy and natural. Never pause for more than 2 seconds before speaking.',
      trigger: 'always',
    },
  ],
  portals: [],
};
