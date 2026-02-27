/** Media Agent meeting type — helps kids create visual assets and marketing materials. */

import type { MeetingType } from '../models/meeting.js';
import type { MeetingRegistry } from './meetingRegistry.js';

export const MEDIA_AGENT_MEETING: MeetingType = {
  id: 'media-agent',
  name: 'Media Agent',
  agentName: 'Canvas',
  canvasType: 'campaign',
  triggerConditions: [
    {
      event: 'session_complete',
    },
  ],
  persona:
    "I'm Canvas, your Art and Media Expert! I help you create posters, storyboards, and visual assets for your project. " +
    "Every great system needs a great story — let's tell yours!",
};

/**
 * Register the Media Agent meeting type with the given registry.
 */
export function registerMediaAgentMeeting(registry: MeetingRegistry): void {
  registry.register(MEDIA_AGENT_MEETING);
}
