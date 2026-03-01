/**
 * Wires the MeetingTriggerEngine into the orchestrator pipeline.
 *
 * Evaluates build events against registered meeting types and creates
 * meeting invites when matches are found. Respects system level gating:
 * auto-invites only fire at Explorer level (shouldAutoInviteMeetings).
 */

import { MeetingTriggerEngine } from './meetingRegistry.js';
import type { MeetingRegistry } from './meetingRegistry.js';
import type { MeetingService } from './meetingService.js';
import type { SendEvent } from './phases/types.js';
import type { SystemLevel } from './systemLevelService.js';
import { shouldAutoInviteMeetings } from './systemLevelService.js';

export class MeetingTriggerWiring {
  private triggerEngine: MeetingTriggerEngine;
  private meetingService: MeetingService;

  constructor(registry: MeetingRegistry, meetingService: MeetingService) {
    this.triggerEngine = new MeetingTriggerEngine(registry);
    this.meetingService = meetingService;
  }

  /**
   * Evaluate a build event and create meeting invites for any matching types.
   * No-ops if the system level does not allow auto-invites.
   */
  async evaluateAndInvite(
    eventType: string,
    eventData: Record<string, unknown>,
    sessionId: string,
    send: SendEvent,
    systemLevel: SystemLevel,
  ): Promise<void> {
    if (!shouldAutoInviteMeetings(systemLevel)) return;

    const matches = this.triggerEngine.evaluate(eventType, eventData);
    for (const match of matches) {
      await this.meetingService.createInvite(
        match.meetingType.id,
        sessionId,
        send,
      );
    }
  }

  /**
   * Evaluate task_starting triggers and create meeting invites for matching types.
   * Returns IDs of created meetings so callers can block on them.
   */
  async evaluateAndInviteForTask(
    taskData: {
      task_id: string;
      task_title: string;
      task_description: string;
      agent_name: string;
      agent_role: string;
    },
    sessionId: string,
    send: SendEvent,
    systemLevel: SystemLevel,
  ): Promise<string[]> {
    if (!shouldAutoInviteMeetings(systemLevel)) return [];

    const matches = this.triggerEngine.evaluate('task_starting', taskData as unknown as Record<string, unknown>);
    const meetingIds: string[] = [];

    for (const match of matches) {
      const meeting = await this.meetingService.createInvite(
        match.meetingType.id,
        sessionId,
        send,
        {
          title: `${match.meetingType.name}: ${taskData.task_title}`,
          description: `${match.meetingType.agentName} wants to help design "${taskData.task_title}" before building it!`,
        },
      );
      if (meeting) {
        meetingIds.push(meeting.id);
      }
    }

    return meetingIds;
  }
}
