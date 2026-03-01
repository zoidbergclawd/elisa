/** Task-level meeting types that trigger before specific tasks start. */

import type { MeetingType } from '../models/meeting.js';
import type { MeetingRegistry } from './meetingRegistry.js';

const DESIGN_KEYWORDS = /sprite|art|icon|theme|logo|animation|design|visual|image|graphic|appearance|style|color|palette|layout/i;

/**
 * Design review meeting -- triggers before tasks with visual/design keywords.
 * Re-uses the 'campaign' canvas for collaborative design work.
 */
const DESIGN_TASK_MEETING: MeetingType = {
  id: 'design-task-agent',
  name: 'Design Review',
  agentName: 'Pixel',
  canvasType: 'campaign',
  triggerConditions: [{
    event: 'task_starting',
    filter: (data) => {
      const text = `${data.task_title ?? ''} ${data.task_description ?? ''}`.toLowerCase();
      return DESIGN_KEYWORDS.test(text);
    },
  }],
  persona: "I'm Pixel! Before we build this, let's design how it should look together! I can help with colors, layouts, and making things look awesome.",
};

/** Register all task-level meeting types with the registry. */
export function registerTaskMeetingTypes(registry: MeetingRegistry): void {
  registry.register(DESIGN_TASK_MEETING);
}
