/** Integration Agent meeting type — helps kids connect nuggets together. */

import type { MeetingType } from '../models/meeting.js';
import type { MeetingRegistry } from './meetingRegistry.js';

export const INTEGRATION_AGENT_MEETING: MeetingType = {
  id: 'integration-agent',
  name: 'Integration Meeting',
  agentName: 'Interface Designer',
  canvasType: 'interface-designer',
  triggerConditions: [{ event: 'composition_started' }],
  persona:
    'A friendly systems designer who helps kids connect their nuggets together. ' +
    'Explains interfaces and contracts in simple, approachable language. ' +
    'Loves showing how pieces fit together!',
};

/**
 * Register the Integration Agent meeting type with the given registry.
 */
export function registerIntegrationAgentMeeting(registry: MeetingRegistry): void {
  registry.register(INTEGRATION_AGENT_MEETING);
}
