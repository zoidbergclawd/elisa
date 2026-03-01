/** Art Agent meeting type — lets kids customize their BOX-3 device theme. */

import type { MeetingType } from '../models/meeting.js';
import type { MeetingRegistry } from './meetingRegistry.js';

export const ART_AGENT_MEETING: MeetingType = {
  id: 'art-agent',
  name: 'Art Agent',
  agentName: 'Pixel',
  canvasType: 'theme-picker',
  triggerConditions: [
    {
      event: 'deploy_started',
      filter: (data) => {
        // Trigger when a BOX-3 device is being deployed
        const devices = data.devices as Array<{ type?: string }> | undefined;
        if (Array.isArray(devices)) {
          return devices.some((d) => d.type === 'box-3');
        }
        const deviceType = data.device_type as string | undefined;
        return deviceType === 'box-3';
      },
    },
    {
      event: 'plan_ready',
      filter: (data) => {
        // Trigger at plan_ready when BOX-3 is in device_types
        const deviceTypes = data.device_types as string[] | undefined;
        return Array.isArray(deviceTypes) && deviceTypes.includes('box-3');
      },
    },
  ],
  persona:
    "I'm Pixel, your Art Director! I help you pick the perfect look for your BOX-3. " +
    "Colors, styles, vibes — let's make your device look awesome together!",
};

/**
 * Register the Art Agent meeting type with the given registry.
 */
export function registerArtAgentMeeting(registry: MeetingRegistry): void {
  registry.register(ART_AGENT_MEETING);
}
