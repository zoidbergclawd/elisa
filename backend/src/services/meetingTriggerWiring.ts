/**
 * Wires the MeetingTriggerEngine into the orchestrator pipeline.
 *
 * Evaluates build events against registered meeting types and creates
 * meeting invites when matches are found. Respects system level gating:
 * auto-invites only fire at Explorer level (shouldAutoInviteMeetings).
 *
 * Deduplicates per meeting type per session: once a meeting type has been
 * invited in a session, subsequent matching events are ignored.
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
  /** Tracks which meeting type IDs have already been invited per session. */
  private invitedTypes = new Map<string, Set<string>>();

  constructor(registry: MeetingRegistry, meetingService: MeetingService) {
    this.triggerEngine = new MeetingTriggerEngine(registry);
    this.meetingService = meetingService;
  }

  /**
   * Evaluate a build event and create meeting invites for any matching types.
   * No-ops if the system level does not allow auto-invites.
   * Deduplicates: each meeting type fires at most once per session.
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
      if (this.hasBeenInvited(sessionId, match.meetingType.id)) continue;

      await this.meetingService.createInvite(
        match.meetingType.id,
        sessionId,
        send,
      );
      this.markInvited(sessionId, match.meetingType.id);
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
          focusContext: `Task: ${taskData.task_title}\nDescription: ${taskData.task_description}`,
        },
      );
      if (meeting) {
        meetingIds.push(meeting.id);
      }
    }

    return meetingIds;
  }

  /**
   * Clear dedup state for a session (call on session cleanup).
   */
  clearSession(sessionId: string): void {
    this.invitedTypes.delete(sessionId);
  }

  private hasBeenInvited(sessionId: string, meetingTypeId: string): boolean {
    return this.invitedTypes.get(sessionId)?.has(meetingTypeId) ?? false;
  }

  private markInvited(sessionId: string, meetingTypeId: string): void {
    if (!this.invitedTypes.has(sessionId)) {
      this.invitedTypes.set(sessionId, new Set());
    }
    this.invitedTypes.get(sessionId)!.add(meetingTypeId);
  }
}
