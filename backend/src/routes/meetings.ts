/** Meeting-related route handlers: /api/sessions/:sessionId/meetings/* */

import { Router } from 'express';
import type { MeetingService } from '../services/meetingService.js';
import type { MeetingAgentService, MeetingBuildContext } from '../services/meetingAgentService.js';
import type { SessionStore, SessionEntry } from '../services/sessionStore.js';
import type { SendEvent, WSEvent } from '../services/phases/types.js';
import type { MeetingMessage } from '../models/meeting.js';
import type { MeetingSession } from '../models/meeting.js';
import { materialize, getMaterializableTypes } from '../services/meetingMaterializer.js';

/** Canvas types that are pre-populated with build data on accept and should not be overwritten. */
const PRE_POPULATED_CANVAS_TYPES = new Set(['blueprint']);

/**
 * Build a list of previously designed element names/descriptions from completed
 * or active design-task-agent meetings in this session (excluding the current meeting).
 */
function buildPreviousDesigns(meetingService: MeetingService, sessionId: string, currentMeetingId: string): string[] {
  const allMeetings = meetingService.getMeetingsForSession(sessionId);
  const previous: string[] = [];
  for (const m of allMeetings) {
    if (m.id === currentMeetingId) continue;
    if (m.meetingTypeId !== 'design-task-agent') continue;
    if (m.status !== 'completed' && m.status !== 'active') continue;
    const elements = m.canvas?.data?.elements;
    if (Array.isArray(elements)) {
      for (const el of elements) {
        const e = el as Record<string, unknown>;
        const name = typeof e.name === 'string' ? e.name : '';
        const desc = typeof e.description === 'string' ? e.description : '';
        if (name) previous.push(desc ? `${name}: ${desc}` : name);
      }
    }
  }
  return previous;
}

/** Check if an agent message contains a closing question (e.g. "Ready to build?"). */
export function isClosingQuestion(text: string): boolean {
  const patterns = [
    /ready to (build|start|go|code|create|see)/i,
    /shall we (start|begin|get started|build|go|tell)/i,
    /want to (see|start|begin|build|code|create)/i,
    /should we (tell|get|let|have|start|begin|go)/i,
    /let'?s (build|start|do|get|go) /i,
    /want me to (save|wrap|finish)/i,
    /time to (build|start|code|create)/i,
    /come to life/i,
  ];
  return patterns.some(p => p.test(text));
}

/** Check if the kid's message is an affirmative response (e.g. "yes", "let's go"). */
export function isAffirmativeResponse(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/[!.]+$/, '');
  const affirmatives = [
    'yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay',
    'lets go', "let's go", 'do it', 'build it', 'go for it',
    'absolutely', 'definitely', 'lets do it', "let's do it", 'go ahead',
  ];
  return affirmatives.includes(normalized) || /^y$/i.test(normalized);
}

interface MeetingRouterDeps {
  store: SessionStore;
  meetingService: MeetingService;
  meetingAgentService: MeetingAgentService;
  sendEvent: (sessionId: string, event: WSEvent) => Promise<void>;
}

function buildMeetingContext(session: SessionEntry | undefined): MeetingBuildContext {
  return {
    goal: session?.session.spec?.nugget?.goal ?? '',
    requirements: (session?.session.spec?.requirements ?? [])
      .map(r => r.description)
      .filter((d): d is string => !!d),
    tasks: (session?.session.tasks ?? []).map(t => ({
      id: t.id,
      title: t.name,
      agent: t.agent_name ?? '',
      status: t.status ?? 'pending',
    })),
    agents: (session?.session.agents ?? []).map(a => ({
      name: a.name,
      role: a.role ?? '',
    })),
    devices: (session?.session.spec?.devices ?? []).map(d => ({
      type: d.pluginId ?? '',
      name: d.instanceId ?? '',
    })),
    phase: session?.session.state ?? 'unknown',
    testsPassing: session?.session.testResults?.passed ?? 0,
    testsTotal: session?.session.testResults?.total ?? 0,
    healthScore: session?.session.healthSummary?.score ?? 0,
    healthGrade: session?.session.healthSummary?.grade ?? '',
  };
}

export function createMeetingRouter({ store, meetingService, meetingAgentService, sendEvent }: MeetingRouterDeps): Router {
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
    const session = store.get(sessionId);
    const buildContext = buildMeetingContext(session);
    const result = await meetingService.acceptMeeting(req.params.meetingId, makeSend(sessionId), buildContext);
    if (!result) {
      res.status(409).json({ detail: 'Meeting cannot be accepted (not in invited state)' });
      return;
    }
    res.json(result);

    // Fire-and-forget: generate a contextual agent follow-up after the canned greeting
    const meetingType = meetingService.getMeetingType(meeting.meetingTypeId);
    if (meetingType) {
      const focusContext = meeting.focusContext;
      const previousDesigns = buildPreviousDesigns(meetingService, sessionId, req.params.meetingId);
      const agentOptions = (focusContext || previousDesigns.length > 0)
        ? { focusContext, previousDesigns }
        : undefined;
      const hasPrePopulatedCanvas = Object.keys(result.canvas?.data ?? {}).length > 0;

      meetingAgentService.generateResponse(meetingType, result.messages, buildContext, agentOptions)
        .then(async (response) => {
          if (response.text) {
            await meetingService.sendMessage(req.params.meetingId, 'agent', response.text, makeSend(sessionId));
          }
          // Skip canvas update if meeting was pre-populated with build data
          if (response.canvasUpdate && !hasPrePopulatedCanvas) {
            await meetingService.updateCanvas(req.params.meetingId, response.canvasUpdate, makeSend(sessionId));
          }
        })
        .catch((err) => { console.error('[meetings] accept follow-up failed:', err instanceof Error ? err.message : err); });
    }
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
    // Resolve any task blocked on this meeting
    const session = store.get(sessionId);
    session?.orchestrator?.resolveMeetingBlock(req.params.meetingId);
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

    // Return kid message immediately (don't block on agent)
    res.json(message);

    // Check for auto-end intent BEFORE generating the agent response.
    // The last agent message at this point is the one that asked "Ready to build?"
    const meetingId = req.params.meetingId;
    const priorMeeting = meetingService.getMeeting(meetingId);
    const agentMsgsBefore = (priorMeeting?.messages ?? []).filter((m: MeetingMessage) => m.role === 'agent');
    const lastAgentMsg = agentMsgsBefore[agentMsgsBefore.length - 1];
    const shouldAutoEnd = lastAgentMsg && isClosingQuestion(lastAgentMsg.content) && isAffirmativeResponse(content.trim());

    // Fire-and-forget: generate agent response asynchronously
    const meetingType = meetingService.getMeetingType(meeting.meetingTypeId);
    if (meetingType) {
      const session = store.get(sessionId);
      const buildContext = buildMeetingContext(session);
      const currentMeeting = meetingService.getMeeting(meetingId);
      const focusContext = currentMeeting?.focusContext;
      const previousDesigns = buildPreviousDesigns(meetingService, sessionId, meetingId);
      const agentOptions = (focusContext || previousDesigns.length > 0)
        ? { focusContext, previousDesigns }
        : undefined;
      const skipCanvasUpdate = PRE_POPULATED_CANVAS_TYPES.has(currentMeeting?.canvas?.type ?? '');

      meetingAgentService.generateResponse(meetingType, currentMeeting?.messages ?? [], buildContext, agentOptions)
        .then(async (response) => {
          if (response.text) {
            await meetingService.sendMessage(meetingId, 'agent', response.text, makeSend(sessionId));
          }
          if (response.canvasUpdate && Object.keys(response.canvasUpdate).length > 0 && !skipCanvasUpdate) {
            await meetingService.updateCanvas(meetingId, response.canvasUpdate, makeSend(sessionId));
          }

          // Auto-end: materialize canvas data and close the meeting
          if (shouldAutoEnd) {
            const meetingNow = meetingService.getMeeting(meetingId);
            if (meetingNow && meetingNow.status === 'active') {
              // Auto-materialize if canvas type supports it
              const canvasType = meetingNow.canvas.type;
              if (getMaterializableTypes().includes(canvasType) && Object.keys(meetingNow.canvas.data).length > 0) {
                const sessionNow = store.get(sessionId);
                const nuggetDir = sessionNow?.orchestrator?.nuggetDir;
                if (nuggetDir) {
                  try {
                    materialize(canvasType, meetingNow.canvas.data as Record<string, unknown>, nuggetDir);
                  } catch (err) {
                    console.error('[meetings] auto-materialize failed:', err instanceof Error ? err.message : err);
                  }
                }
              }
              // End the meeting
              await meetingService.endMeeting(meetingId, makeSend(sessionId));
              const sessionNow = store.get(sessionId);
              sessionNow?.orchestrator?.resolveMeetingBlock(meetingId);
            }
          }
        })
        .catch((err) => {
          console.error('[meetings] agent response failed:', err instanceof Error ? err.message : err);
          // Best-effort: send fallback on failure
          meetingService.sendMessage(
            meetingId,
            'agent',
            "Hmm, let me think... Can you ask me again?",
            makeSend(sessionId),
          ).catch((fallbackErr) => { console.error('[meetings] fallback message failed:', fallbackErr instanceof Error ? fallbackErr.message : fallbackErr); });
        });
    }
  });

  // Save a meeting outcome
  router.post('/:meetingId/outcome', async (req, res) => {
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
    const { outcomeType, data } = req.body;
    if (typeof outcomeType !== 'string' || !outcomeType.trim()) {
      res.status(400).json({ detail: 'outcomeType is required and must be a non-empty string' });
      return;
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      res.status(400).json({ detail: 'data is required and must be an object' });
      return;
    }
    const outcome = await meetingService.addOutcome(
      req.params.meetingId,
      outcomeType.trim(),
      data as Record<string, unknown>,
      makeSend(sessionId),
    );
    if (!outcome) {
      res.status(409).json({ detail: 'Meeting is not active' });
      return;
    }
    res.json(outcome);
  });

  // Materialize canvas data into real files
  router.post('/:meetingId/materialize', async (req, res) => {
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
    const { canvasType, data } = req.body;
    if (typeof canvasType !== 'string' || !canvasType.trim()) {
      res.status(400).json({ detail: 'canvasType is required' });
      return;
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      res.status(400).json({ detail: 'data is required and must be an object' });
      return;
    }
    if (!getMaterializableTypes().includes(canvasType)) {
      res.status(400).json({ detail: `Canvas type "${canvasType}" does not support materialization` });
      return;
    }

    // Get workspace directory from orchestrator
    const session = store.get(sessionId);
    const nuggetDir = session?.orchestrator?.nuggetDir;
    if (!nuggetDir) {
      res.status(409).json({ detail: 'No workspace directory available (build may not have started)' });
      return;
    }

    try {
      const result = materialize(canvasType, data as Record<string, unknown>, nuggetDir);
      if (!result) {
        res.status(400).json({ detail: 'Materialization produced no output' });
        return;
      }
      res.json(result);
    } catch (err) {
      console.error('[meetings] materialize failed:', err instanceof Error ? err.message : err);
      res.status(500).json({ detail: 'Materialization failed' });
    }
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
    // Resolve any task blocked on this meeting
    const session = store.get(sessionId);
    session?.orchestrator?.resolveMeetingBlock(req.params.meetingId);
    res.json(result);
  });

  return router;
}
