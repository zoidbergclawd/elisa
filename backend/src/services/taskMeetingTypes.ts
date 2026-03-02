/** Task-level meeting types that trigger before specific tasks start. */

import type { MeetingType } from '../models/meeting.js';
import type { MeetingRegistry } from './meetingRegistry.js';

export const DESIGN_KEYWORDS = /sprite|art|icon|theme|logo|animation|design|visual|image|graphic|appearance|style|color|palette|layout/i;

export const SCAFFOLD_SKIP_KEYWORDS = /scaffold|setup|initialization|configure|install|boilerplate|test|testing|unit test|lint/i;

/**
 * Design review meeting -- triggers before tasks with visual/design keywords.
 * Uses the 'design-preview' canvas for live visual design collaboration.
 * Skips scaffold/setup tasks even if they contain design keywords.
 */
const DESIGN_TASK_MEETING: MeetingType = {
  id: 'design-task-agent',
  name: 'Design Review',
  agentName: 'Pixel',
  canvasType: 'design-preview',
  triggerConditions: [{
    event: 'task_starting',
    filter: (data) => {
      const text = `${data.task_title ?? ''} ${data.task_description ?? ''}`.toLowerCase();
      if (SCAFFOLD_SKIP_KEYWORDS.test(text)) return false;
      return DESIGN_KEYWORDS.test(text);
    },
  }],
  persona: "I'm Pixel! Let's design this together through our chat -- you'll see the preview update live as we talk! Tell me about the colors, style, and elements you want.",
};

/** Register all task-level meeting types with the registry. */
export function registerTaskMeetingTypes(registry: MeetingRegistry): void {
  registry.register(DESIGN_TASK_MEETING);
}
