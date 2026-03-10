/** Buddy Agent meeting type -- mid-build check-in that explains progress and takes feedback. */

import type { MeetingType } from '../models/meeting.js';
import type { MeetingRegistry } from './meetingRegistry.js';

export const BUDDY_AGENT_MEETING: MeetingType = {
  id: 'buddy-agent',
  name: 'Buddy Check-in',
  agentName: 'Buddy',
  canvasType: 'explain-it',
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
    "A friendly teammate who checks in during the build. Explains what's happening in kid-friendly terms, " +
    "asks if the kid has questions or wants to change direction, and celebrates progress. Warm, curious, encouraging.",
};

/**
 * Register the Buddy Agent meeting type with the given registry.
 */
export function registerBuddyAgentMeeting(registry: MeetingRegistry): void {
  registry.register(BUDDY_AGENT_MEETING);
}
