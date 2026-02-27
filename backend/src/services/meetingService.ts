/** In-memory meeting session management. */

import { randomUUID } from 'node:crypto';
import type {
  MeetingSession,
  MeetingMessage,
  MeetingOutcome,
  CanvasState,
  MeetingStatus,
} from '../models/meeting.js';
import type { MeetingRegistry } from './meetingRegistry.js';
import type { SendEvent } from './phases/types.js';

export class MeetingService {
  /** All meetings indexed by meeting ID. */
  private meetings = new Map<string, MeetingSession>();
  /** Index: sessionId -> Set of meeting IDs. */
  private sessionIndex = new Map<string, Set<string>>();

  private registry: MeetingRegistry;

  constructor(registry: MeetingRegistry) {
    this.registry = registry;
  }

  /**
   * Create a meeting invite for a session.
   * Sends a `meeting_invite` WebSocket event.
   */
  async createInvite(
    meetingTypeId: string,
    sessionId: string,
    send: SendEvent,
    overrides?: { title?: string; description?: string },
  ): Promise<MeetingSession | null> {
    const meetingType = this.registry.getById(meetingTypeId);
    if (!meetingType) {
      console.warn(`[MeetingService] Unknown meeting type: ${meetingTypeId}`);
      return null;
    }

    const id = randomUUID();
    const title = overrides?.title ?? `${meetingType.name}`;
    const description = overrides?.description ?? `${meetingType.agentName} wants to work with you!`;

    const meeting: MeetingSession = {
      id,
      meetingTypeId,
      sessionId,
      status: 'invited',
      canvas: { type: meetingType.canvasType, data: {} },
      messages: [],
      outcomes: [],
      agentName: meetingType.agentName,
      title,
      description,
      createdAt: Date.now(),
    };

    this.meetings.set(id, meeting);
    if (!this.sessionIndex.has(sessionId)) {
      this.sessionIndex.set(sessionId, new Set());
    }
    this.sessionIndex.get(sessionId)!.add(id);

    await send({
      type: 'meeting_invite',
      meetingTypeId,
      meetingId: id,
      agentName: meetingType.agentName,
      title,
      description,
    });

    return meeting;
  }

  /**
   * Accept a meeting invite -- transitions to 'active'.
   * Sends a `meeting_started` WebSocket event.
   */
  async acceptMeeting(meetingId: string, send: SendEvent): Promise<MeetingSession | null> {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) return null;
    if (meeting.status !== 'invited') return null;

    meeting.status = 'active';

    const meetingType = this.registry.getById(meeting.meetingTypeId);
    await send({
      type: 'meeting_started',
      meetingId,
      meetingTypeId: meeting.meetingTypeId,
      agentName: meeting.agentName,
      canvasType: meeting.canvas.type,
    });

    // Send an initial greeting from the agent
    if (meetingType?.persona) {
      const greeting: MeetingMessage = {
        role: 'agent',
        content: `Hi there! I'm ${meeting.agentName}. ${meeting.description}`,
        timestamp: Date.now(),
      };
      meeting.messages.push(greeting);
      await send({
        type: 'meeting_message',
        meetingId,
        role: 'agent',
        content: greeting.content,
      });
    }

    return meeting;
  }

  /**
   * Decline a meeting invite -- transitions to 'declined'.
   */
  declineMeeting(meetingId: string): MeetingSession | null {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) return null;
    if (meeting.status !== 'invited') return null;

    meeting.status = 'declined';
    return meeting;
  }

  /**
   * Send a message in an active meeting.
   * Sends a `meeting_message` WebSocket event.
   */
  async sendMessage(
    meetingId: string,
    role: 'agent' | 'kid',
    content: string,
    send: SendEvent,
  ): Promise<MeetingMessage | null> {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) return null;
    if (meeting.status !== 'active') return null;

    const message: MeetingMessage = {
      role,
      content,
      timestamp: Date.now(),
    };
    meeting.messages.push(message);

    await send({
      type: 'meeting_message',
      meetingId,
      role,
      content,
    });

    return message;
  }

  /**
   * Update the canvas state for a meeting.
   * Sends a `meeting_canvas_update` WebSocket event.
   */
  async updateCanvas(
    meetingId: string,
    canvasData: Record<string, unknown>,
    send: SendEvent,
  ): Promise<CanvasState | null> {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) return null;
    if (meeting.status !== 'active') return null;

    meeting.canvas.data = { ...meeting.canvas.data, ...canvasData };

    await send({
      type: 'meeting_canvas_update',
      meetingId,
      canvasType: meeting.canvas.type,
      data: meeting.canvas.data,
    });

    return meeting.canvas;
  }

  /**
   * Add an outcome to a meeting.
   * Sends a `meeting_outcome` WebSocket event.
   */
  async addOutcome(
    meetingId: string,
    outcomeType: string,
    data: Record<string, unknown>,
    send: SendEvent,
  ): Promise<MeetingOutcome | null> {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) return null;
    if (meeting.status !== 'active') return null;

    const outcome: MeetingOutcome = { type: outcomeType, data };
    meeting.outcomes.push(outcome);

    await send({
      type: 'meeting_outcome',
      meetingId,
      outcomeType,
      data,
    });

    return outcome;
  }

  /**
   * End a meeting -- transitions to 'completed'.
   * Sends a `meeting_ended` WebSocket event.
   */
  async endMeeting(meetingId: string, send: SendEvent): Promise<MeetingSession | null> {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) return null;
    if (meeting.status !== 'active') return null;

    meeting.status = 'completed';

    await send({
      type: 'meeting_ended',
      meetingId,
      outcomes: meeting.outcomes,
    });

    return meeting;
  }

  /**
   * Get a meeting by ID.
   */
  getMeeting(meetingId: string): MeetingSession | undefined {
    return this.meetings.get(meetingId);
  }

  /**
   * Get all meetings for a session.
   */
  getMeetingsForSession(sessionId: string): MeetingSession[] {
    const ids = this.sessionIndex.get(sessionId);
    if (!ids) return [];
    const result: MeetingSession[] = [];
    for (const id of ids) {
      const meeting = this.meetings.get(id);
      if (meeting) result.push(meeting);
    }
    return result;
  }

  /**
   * Get active meetings for a session.
   */
  getActiveMeetings(sessionId: string): MeetingSession[] {
    return this.getMeetingsForSession(sessionId).filter(m => m.status === 'active');
  }

  /**
   * Get meeting history for a session (completed + declined).
   */
  getMeetingHistory(sessionId: string): MeetingSession[] {
    return this.getMeetingsForSession(sessionId).filter(
      m => m.status === 'completed' || m.status === 'declined',
    );
  }

  /**
   * Clean up all meetings for a session.
   */
  cleanupSession(sessionId: string): void {
    const ids = this.sessionIndex.get(sessionId);
    if (!ids) return;
    for (const id of ids) {
      this.meetings.delete(id);
    }
    this.sessionIndex.delete(sessionId);
  }
}
