import type { ExampleNugget } from './index';

export const iotSensorNetwork: ExampleNugget = {
  id: 'iot-sensor-network',
  name: 'IoT Sensor Network',
  description: 'A sensor node reads temperature, humidity, and motion, sends data over LoRa to a gateway, which relays it to a cloud dashboard.',
  category: 'hardware',
  color: 'bg-emerald-100',
  accentColor: 'text-emerald-700',
  workspace: {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: 'nugget_goal',
          x: 30,
          y: 30,
          fields: { GOAL_TEXT: 'An IoT sensor network that monitors temperature, humidity, door state, and motion, then displays it on a live cloud dashboard' },
          next: {
            block: {
              type: 'nugget_template',
              fields: { TEMPLATE_TYPE: 'hardware' },
              next: {
                block: {
                  type: 'feature',
                  fields: { FEATURE_TEXT: 'sensor node reads DHT22, reed switch, and PIR every 10 seconds and shows readings on the OLED' },
                  next: {
                    block: {
                      type: 'feature',
                      fields: { FEATURE_TEXT: 'gateway receives LoRa packets and POSTs JSON to the cloud dashboard endpoint' },
                      next: {
                        block: {
                          type: 'feature',
                          fields: { FEATURE_TEXT: 'cloud dashboard shows live-updating cards for each sensor with sparkline charts' },
                          next: {
                            block: {
                              type: 'heltec_sensor_node',
                              fields: {
                                SENSOR_DHT22: true,
                                PIN_DHT22: 13,
                                SENSOR_REED: true,
                                PIN_REED: 12,
                                SENSOR_PIR: true,
                                PIN_PIR: 14,
                                HAS_OLED: true,
                                LORA_CHANNEL: 1,
                                INTERVAL: 10,
                              },
                              next: {
                                block: {
                                  type: 'heltec_gateway',
                                  fields: {
                                    LORA_CHANNEL: 1,
                                    WIFI_SSID: '',
                                    WIFI_PASS: '',
                                  },
                                  next: {
                                    block: {
                                      type: 'cloud_dashboard',
                                      fields: { GCP_PROJECT: '' },
                                      next: {
                                        block: {
                                          type: 'use_skill',
                                          fields: { SKILL_ID: 'skill-iot-robust' },
                                          next: {
                                            block: {
                                              type: 'use_skill',
                                              fields: { SKILL_ID: 'skill-dashboard-ux' },
                                              next: {
                                                block: {
                                                  type: 'use_rule',
                                                  fields: { RULE_ID: 'rule-sensor-validate' },
                                                  next: {
                                                    block: {
                                                      type: 'use_rule',
                                                      fields: { RULE_ID: 'rule-offline-safe' },
                                                      next: {
                                                        block: {
                                                          type: 'deploy_both',
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
      id: 'skill-iot-robust',
      name: 'Robust IoT code',
      prompt: 'All MicroPython code must handle sensor read failures gracefully: catch exceptions per-sensor, log the error, and continue the loop with partial data. Never let one bad sensor crash the node.',
      category: 'agent',
    },
    {
      id: 'skill-dashboard-ux',
      name: 'Dashboard UX',
      prompt: 'The cloud dashboard should auto-refresh via SSE, show a card per sensor type with the latest value and a sparkline of the last 20 readings, and use color-coded status indicators (green = normal, yellow = warning, red = alert).',
      category: 'feature',
    },
  ],
  rules: [
    {
      id: 'rule-sensor-validate',
      name: 'Validate sensor ranges',
      prompt: 'Reject obviously invalid readings before transmitting: temperature must be -40 to 80 C, humidity 0 to 100%. Log rejected values.',
      trigger: 'always',
    },
    {
      id: 'rule-offline-safe',
      name: 'Offline-safe operation',
      prompt: 'The sensor node must continue reading and displaying locally even if LoRa transmission fails. The gateway must queue data if the cloud endpoint is unreachable and retry on next cycle.',
      trigger: 'always',
    },
  ],
  portals: [],
};
