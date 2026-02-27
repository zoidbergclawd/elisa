/** Web Designer Agent meeting type — helps kids design launch pages for web deploys. */

import type { MeetingType } from '../models/meeting.js';
import type { MeetingRegistry } from './meetingRegistry.js';

export const WEB_DESIGN_AGENT_MEETING: MeetingType = {
  id: 'web-design-agent',
  name: 'Web Designer Agent',
  agentName: 'Styler',
  canvasType: 'launch-pad',
  triggerConditions: [
    {
      event: 'deploy_started',
      filter: (data) => {
        const target = data.target as string | undefined;
        return target === 'web';
      },
    },
  ],
  persona:
    "I'm Styler, your Web Designer! I help you create an awesome launch page for your project. " +
    "Layout, colors, fonts — let's make your project shine on the web!",
};

/**
 * Register the Web Designer Agent meeting type with the given registry.
 */
export function registerWebDesignAgentMeeting(registry: MeetingRegistry): void {
  registry.register(WEB_DESIGN_AGENT_MEETING);
}
