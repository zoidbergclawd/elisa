/** Meeting-related route handlers: /api/sessions/:sessionId/meetings/* */

import { Router } from 'express';
import type { MeetingService } from '../services/meetingService.js';
import type { SessionStore } from '../services/sessionStore.js';
import type { SendEvent, WSEvent } from '../services/phases/types.js';

interface MeetingRouterDeps {
  store: SessionStore;
  meetingService: MeetingService;
  sendEvent: (sessionId: string, event: WSEvent) => Promise<void>;
}

export function createMeetingRouter({ store, meetingService, sendEvent }: MeetingRouterDeps): Router {
  const router = Router({ mergeParams: true });

  /** Helper to create a SendEvent scoped to a session. */
  function makeSend(sessionId: string): SendEvent {
    return (event) => sendEvent(sessionId, event);
  }

  // List all meetings for a session
  router.get('/', (req, res) => {
    const sessionId = (req.params as Record<string, string>).sessionId;
    if (!store.has(sessionId)) {
      res.status(404).json({ detail: 'Session not found' });
      return;
    }
    const meetings = meetingService.getMeetingsForSession(sessionId);
    res.json(meetings);
  });

  // Get meeting details
  router.get('/:meetingId', (req, res) => {
    const sessionId = (req.params as Record<string, string>).sessionId;
    if (!store.has(sessionId)) {
      res.status(404).json({ detail: 'Session not found' });
      return;
    }
    const meeting = meetingService.getMeeting(req.params.meetingId);
    if (!meeting || meeting.sessionId !== sessionId) {
      res.status(404).json({ detail: 'Meeting not found' });
      return;
    }
    res.json(meeting);
  });

  // Accept a meeting invite
  router.post('/:meetingId/accept', async (req, res) => {
    const sessionId = (req.params as Record<string, string>).sessionId;
    if (!store.has(sessionId)) {
      res.status(404).json({ detail: 'Session not found' });
      return;
    }
    const meeting = meetingService.getMeeting(req.params.meetingId);
    if (!meeting || meeting.sessionId !== sessionId) {
      res.status(404).json({ detail: 'Meeting not found' });
      return;
    }
    const result = await meetingService.acceptMeeting(req.params.meetingId, makeSend(sessionId));
    if (!result) {
      res.status(409).json({ detail: 'Meeting cannot be accepted (not in invited state)' });
      return;
    }
    res.json(result);
  });

  // Decline a meeting invite
  router.post('/:meetingId/decline', (req, res) => {
    const sessionId = (req.params as Record<string, string>).sessionId;
    if (!store.has(sessionId)) {
      res.status(404).json({ detail: 'Session not found' });
      return;
    }
    const meeting = meetingService.getMeeting(req.params.meetingId);
    if (!meeting || meeting.sessionId !== sessionId) {
      res.status(404).json({ detail: 'Meeting not found' });
      return;
    }
    const result = meetingService.declineMeeting(req.params.meetingId);
    if (!result) {
      res.status(409).json({ detail: 'Meeting cannot be declined (not in invited state)' });
      return;
    }
    res.json(result);
  });

  // Send a message from the kid
  router.post('/:meetingId/message', async (req, res) => {
    const sessionId = (req.params as Record<string, string>).sessionId;
    if (!store.has(sessionId)) {
      res.status(404).json({ detail: 'Session not found' });
      return;
    }
    const meeting = meetingService.getMeeting(req.params.meetingId);
    if (!meeting || meeting.sessionId !== sessionId) {
      res.status(404).json({ detail: 'Meeting not found' });
      return;
    }
    const { content } = req.body;
    if (typeof content !== 'string' || content.trim().length === 0) {
      res.status(400).json({ detail: 'content is required and must be a non-empty string' });
      return;
    }
    const message = await meetingService.sendMessage(
      req.params.meetingId,
      'kid',
      content.trim(),
      makeSend(sessionId),
    );
    if (!message) {
      res.status(409).json({ detail: 'Meeting is not active' });
      return;
    }
    res.json(message);
  });

  // End a meeting
  router.post('/:meetingId/end', async (req, res) => {
    const sessionId = (req.params as Record<string, string>).sessionId;
    if (!store.has(sessionId)) {
      res.status(404).json({ detail: 'Session not found' });
      return;
    }
    const meeting = meetingService.getMeeting(req.params.meetingId);
    if (!meeting || meeting.sessionId !== sessionId) {
      res.status(404).json({ detail: 'Meeting not found' });
      return;
    }
    const result = await meetingService.endMeeting(req.params.meetingId, makeSend(sessionId));
    if (!result) {
      res.status(409).json({ detail: 'Meeting is not active' });
      return;
    }
    res.json(result);
  });

  return router;
}
