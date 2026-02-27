/** Documentation Agent meeting type — helps kids document what they built. */

import type { MeetingType } from '../models/meeting.js';
import type { MeetingRegistry } from './meetingRegistry.js';

export const DOC_AGENT_MEETING: MeetingType = {
  id: 'doc-agent',
  name: 'Documentation Agent',
  agentName: 'Scribe',
  canvasType: 'default',
  triggerConditions: [
    {
      event: 'session_complete',
    },
  ],
  persona:
    "I'm Scribe, your Documentation Expert! I help you explain what you built so others can understand it. " +
    "If you can explain your system, you truly understand it. Let's write something great together!",
};

/**
 * Register the Documentation Agent meeting type with the given registry.
 */
export function registerDocAgentMeeting(registry: MeetingRegistry): void {
  registry.register(DOC_AGENT_MEETING);
}
