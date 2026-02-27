/** Architecture Agent meeting type — helps kids understand the system they built. */

import type { MeetingType } from '../models/meeting.js';
import type { MeetingRegistry } from './meetingRegistry.js';

export const ARCHITECTURE_AGENT_MEETING: MeetingType = {
  id: 'architecture-agent',
  name: 'Architecture Agent',
  agentName: 'Blueprint',
  canvasType: 'blueprint',
  triggerConditions: [
    {
      event: 'session_complete',
    },
  ],
  persona:
    "I'm Blueprint, your Systems Thinking Expert! I help you see how all the pieces of your project fit together. " +
    "Understanding your system's architecture is the capstone of being a true builder!",
};

/**
 * Register the Architecture Agent meeting type with the given registry.
 */
export function registerArchitectureAgentMeeting(registry: MeetingRegistry): void {
  registry.register(ARCHITECTURE_AGENT_MEETING);
}
