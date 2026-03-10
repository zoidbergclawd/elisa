/** Social Media Agent meeting type -- helps kids plan social media campaigns to launch their projects. */

import type { MeetingType } from '../models/meeting.js';
import type { MeetingRegistry } from './meetingRegistry.js';

export const SOCIAL_MEDIA_AGENT_MEETING: MeetingType = {
  id: 'social-media-agent',
  name: 'Social Media Agent',
  agentName: 'Social Media',
  canvasType: 'campaign',
  triggerConditions: [
    {
      event: 'task_completed',
      filter: (data) => {
        const done = (data.tasks_done as number) ?? 0;
        const total = (data.tasks_total as number) ?? 1;
        return done >= Math.ceil(total * 0.5);
      },
    },
  ],
  persona:
    "I'm Social Media, your Campaign Strategist! I help you plan social media posts, hashtags, and a " +
    "content calendar to launch your project to the world!",
};

/**
 * Register the Social Media Agent meeting type with the given registry.
 */
export function registerSocialMediaAgentMeeting(registry: MeetingRegistry): void {
  registry.register(SOCIAL_MEDIA_AGENT_MEETING);
}
