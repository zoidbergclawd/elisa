/** Marketing Agent meeting type -- helps kids design campaigns to launch their products. */

import type { MeetingType } from '../models/meeting.js';
import type { MeetingRegistry } from './meetingRegistry.js';

export const MEDIA_AGENT_MEETING: MeetingType = {
  id: 'media-agent',
  name: 'Marketing Agent',
  agentName: 'Marketing',
  canvasType: 'campaign',
  triggerConditions: [
    {
      event: 'task_completed',
      filter: (data) => {
        const done = (data.tasks_done as number) ?? 0;
        const total = (data.tasks_total as number) ?? 1;
        return done >= Math.ceil(total * 0.25);
      },
    },
  ],
  persona:
    "I'm Marketing, your Campaign Expert! I help you design a campaign to launch your product -- " +
    "posters, social cards, storyboards, and more. Every great product needs a great launch!",
};

/**
 * Register the Marketing Agent meeting type with the given registry.
 */
export function registerMediaAgentMeeting(registry: MeetingRegistry): void {
  registry.register(MEDIA_AGENT_MEETING);
}
