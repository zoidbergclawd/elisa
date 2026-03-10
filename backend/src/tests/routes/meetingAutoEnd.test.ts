/**
 * Tests for meeting auto-end reliability (GitHub #176).
 *
 * Verifies that when the kid confirms readiness (affirmative to closing question
 * or negative to dismissal question), the meeting always auto-ends -- even if
 * the agent response API call fails.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import express from 'express';
import { MeetingRegistry } from '../../services/meetingRegistry.js';
import { MeetingService } from '../../services/meetingService.js';
import { SessionStore } from '../../services/sessionStore.js';
import { createMeetingRouter } from '../../routes/meetings.js';
import type { MeetingType, MeetingSession } from '../../models/meeting.js';
import type { MeetingAgentService } from '../../services/meetingAgentService.js';

const TEST_MEETING_TYPE: MeetingType = {
  id: 'test-meeting',
  name: 'Test Meeting',
  agentName: 'TestBot',
  canvasType: 'test-canvas',
  triggerConditions: [],
  persona: 'A test agent',
};

/** Meeting type with a materializable canvas (explain-it). */
const MATERIALIZABLE_MEETING_TYPE: MeetingType = {
  id: 'mat-meeting',
  name: 'Materializable Meeting',
  agentName: 'DocBot',
  canvasType: 'explain-it',
  triggerConditions: [],
  persona: 'A doc agent',
};

let server: http.Server | null = null;
let baseUrl = '';
let store: SessionStore;
let registry: MeetingRegistry;
let meetingService: MeetingService;
let sentEvents: Record<string, any>[];
let mockAgentService: MeetingAgentService;
let agentResponseFn: () => Promise<{ text: string; canvasUpdate?: Record<string, unknown> }>;

function createTestApp() {
  store = new SessionStore(false);
  registry = new MeetingRegistry();
  registry.register(TEST_MEETING_TYPE);
  registry.register(MATERIALIZABLE_MEETING_TYPE);
  meetingService = new MeetingService(registry);
  sentEvents = [];

  // Default: agent response succeeds with a simple message
  agentResponseFn = async () => ({ text: 'Sure thing!' });

  mockAgentService = {
    generateResponse: vi.fn(async () => agentResponseFn()),
  } as unknown as MeetingAgentService;

  const sendEvent = async (_sessionId: string, event: Record<string, any>) => {
    sentEvents.push(event);
  };

  const app = express();
  app.use(express.json());
  app.use('/api/sessions/:sessionId/meetings', createMeetingRouter({
    store,
    meetingService,
    meetingAgentService: mockAgentService,
    sendEvent,
  }));
  return app;
}

function createSession(): string {
  const id = 'test-session';
  store.create(id, { id, state: 'executing', spec: null, tasks: [], agents: [] });
  return id;
}

async function fetchJSON(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

/** Set up an active meeting with agent messages already in the conversation. */
async function setupActiveMeeting(
  sessionId: string,
  meetingTypeId: string = 'test-meeting',
  agentMessages: string[] = [],
): Promise<MeetingSession> {
  const send = async (event: any) => { sentEvents.push(event); };
  const meeting = await meetingService.createInvite(meetingTypeId, sessionId, send as any);
  await meetingService.acceptMeeting(meeting!.id, send as any);

  // Inject agent messages into the meeting conversation
  for (const msg of agentMessages) {
    await meetingService.sendMessage(meeting!.id, 'agent', msg, send as any);
  }

  return meetingService.getMeeting(meeting!.id)!;
}

/** Wait for fire-and-forget async operations to complete. */
async function waitForAsyncOps(ms: number = 200): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

beforeEach(async () => {
  const app = createTestApp();
  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server!.listen(0, '127.0.0.1', () => {
      const addr = server!.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
  }
});

describe('meeting auto-end: closing question + affirmative response', () => {
  it('auto-ends when kid says "yes" after "Ready to build?"', async () => {
    const sessionId = createSession();
    const meeting = await setupActiveMeeting(sessionId, 'test-meeting', [
      'Ready to build?',
    ]);

    const { status } = await fetchJSON(
      `/api/sessions/${sessionId}/meetings/${meeting.id}/message`,
      { method: 'POST', body: JSON.stringify({ content: 'yes' }) },
    );
    expect(status).toBe(200);

    await waitForAsyncOps();

    const updated = meetingService.getMeeting(meeting.id)!;
    expect(updated.status).toBe('completed');

    // Verify meeting_ended event was sent
    const endEvents = sentEvents.filter(e => e.type === 'meeting_ended' && e.meetingId === meeting.id);
    expect(endEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('auto-ends when kid says "let\'s go" after "Shall we start?"', async () => {
    const sessionId = createSession();
    const meeting = await setupActiveMeeting(sessionId, 'test-meeting', [
      'Shall we start building your game?',
    ]);

    const { status } = await fetchJSON(
      `/api/sessions/${sessionId}/meetings/${meeting.id}/message`,
      { method: 'POST', body: JSON.stringify({ content: "let's go" }) },
    );
    expect(status).toBe(200);

    await waitForAsyncOps();

    const updated = meetingService.getMeeting(meeting.id)!;
    expect(updated.status).toBe('completed');
  });

  it('auto-ends when kid says "yeah do it" after "Want to see it come to life?"', async () => {
    const sessionId = createSession();
    const meeting = await setupActiveMeeting(sessionId, 'test-meeting', [
      'Want to see it come to life?',
    ]);

    const { status } = await fetchJSON(
      `/api/sessions/${sessionId}/meetings/${meeting.id}/message`,
      { method: 'POST', body: JSON.stringify({ content: 'yeah do it' }) },
    );
    expect(status).toBe(200);

    await waitForAsyncOps();

    const updated = meetingService.getMeeting(meeting.id)!;
    expect(updated.status).toBe('completed');
  });

  it('does NOT auto-end when kid gives a non-affirmative response', async () => {
    const sessionId = createSession();
    const meeting = await setupActiveMeeting(sessionId, 'test-meeting', [
      'Ready to build?',
    ]);

    await fetchJSON(
      `/api/sessions/${sessionId}/meetings/${meeting.id}/message`,
      { method: 'POST', body: JSON.stringify({ content: 'wait, I want to change something' }) },
    );

    await waitForAsyncOps();

    const updated = meetingService.getMeeting(meeting.id)!;
    expect(updated.status).toBe('active');
  });
});

describe('meeting auto-end: dismissal question + negative response', () => {
  it('auto-ends when kid says "nope" after "Anything else?"', async () => {
    const sessionId = createSession();
    const meeting = await setupActiveMeeting(sessionId, 'test-meeting', [
      'Anything else you want to know?',
    ]);

    const { status } = await fetchJSON(
      `/api/sessions/${sessionId}/meetings/${meeting.id}/message`,
      { method: 'POST', body: JSON.stringify({ content: 'nope' }) },
    );
    expect(status).toBe(200);

    await waitForAsyncOps();

    const updated = meetingService.getMeeting(meeting.id)!;
    expect(updated.status).toBe('completed');
  });

  it('auto-ends when kid says "I\'m good" after "More questions?"', async () => {
    const sessionId = createSession();
    const meeting = await setupActiveMeeting(sessionId, 'test-meeting', [
      'Do you have more questions?',
    ]);

    const { status } = await fetchJSON(
      `/api/sessions/${sessionId}/meetings/${meeting.id}/message`,
      { method: 'POST', body: JSON.stringify({ content: "I'm good" }) },
    );
    expect(status).toBe(200);

    await waitForAsyncOps();

    const updated = meetingService.getMeeting(meeting.id)!;
    expect(updated.status).toBe('completed');
  });

  it('does NOT auto-end when kid says "yes" to a dismissal question', async () => {
    const sessionId = createSession();
    const meeting = await setupActiveMeeting(sessionId, 'test-meeting', [
      'Anything else you want to know?',
    ]);

    await fetchJSON(
      `/api/sessions/${sessionId}/meetings/${meeting.id}/message`,
      { method: 'POST', body: JSON.stringify({ content: 'yes, tell me about colors' }) },
    );

    await waitForAsyncOps();

    const updated = meetingService.getMeeting(meeting.id)!;
    expect(updated.status).toBe('active');
  });
});

describe('meeting auto-end: reliability when agent response fails', () => {
  it('auto-ends even when agent response throws an error', async () => {
    const sessionId = createSession();
    const meeting = await setupActiveMeeting(sessionId, 'test-meeting', [
      'Ready to build?',
    ]);

    // Make the agent response fail
    agentResponseFn = async () => { throw new Error('API timeout'); };

    const { status } = await fetchJSON(
      `/api/sessions/${sessionId}/meetings/${meeting.id}/message`,
      { method: 'POST', body: JSON.stringify({ content: 'yes' }) },
    );
    expect(status).toBe(200);

    await waitForAsyncOps();

    const updated = meetingService.getMeeting(meeting.id)!;
    expect(updated.status).toBe('completed');

    // Verify meeting_ended event was sent
    const endEvents = sentEvents.filter(e => e.type === 'meeting_ended' && e.meetingId === meeting.id);
    expect(endEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('auto-ends dismissal+negative even when agent response throws', async () => {
    const sessionId = createSession();
    const meeting = await setupActiveMeeting(sessionId, 'test-meeting', [
      'Anything else?',
    ]);

    agentResponseFn = async () => { throw new Error('Network error'); };

    await fetchJSON(
      `/api/sessions/${sessionId}/meetings/${meeting.id}/message`,
      { method: 'POST', body: JSON.stringify({ content: 'no thanks' }) },
    );

    await waitForAsyncOps();

    const updated = meetingService.getMeeting(meeting.id)!;
    expect(updated.status).toBe('completed');
  });
});

describe('meeting auto-end: only considers last agent message', () => {
  it('auto-ends based on the LAST agent message, not earlier ones', async () => {
    const sessionId = createSession();
    // First agent message is NOT a closing question, last one IS
    const meeting = await setupActiveMeeting(sessionId, 'test-meeting', [
      'What color do you want?',
      'Great choice! Ready to build?',
    ]);

    await fetchJSON(
      `/api/sessions/${sessionId}/meetings/${meeting.id}/message`,
      { method: 'POST', body: JSON.stringify({ content: 'yes!' }) },
    );

    await waitForAsyncOps();

    const updated = meetingService.getMeeting(meeting.id)!;
    expect(updated.status).toBe('completed');
  });

  it('does NOT auto-end when last agent message is not a closing/dismissal question', async () => {
    const sessionId = createSession();
    // First message IS a closing question, but last one is NOT
    const meeting = await setupActiveMeeting(sessionId, 'test-meeting', [
      'Ready to build?',
      'What color do you want the background to be?',
    ]);

    await fetchJSON(
      `/api/sessions/${sessionId}/meetings/${meeting.id}/message`,
      { method: 'POST', body: JSON.stringify({ content: 'yes' }) },
    );

    await waitForAsyncOps();

    const updated = meetingService.getMeeting(meeting.id)!;
    expect(updated.status).toBe('active');
  });
});

describe('meeting auto-end: kid-initiated meetings skip auto-end', () => {
  it('does NOT auto-end a kid-initiated meeting when agent asks closing question and kid says yes', async () => {
    const sessionId = createSession();
    const send = async (event: any) => { sentEvents.push(event); };

    // Create meeting via the /start endpoint (kid-initiated)
    const { status, body } = await fetchJSON(
      `/api/sessions/${sessionId}/meetings/start`,
      { method: 'POST', body: JSON.stringify({ meetingTypeId: 'test-meeting' }) },
    );
    expect(status).toBe(200);
    const meetingId = body.meetingId;

    // Inject a closing question from the agent
    await meetingService.sendMessage(meetingId, 'agent', 'Ready to build?', send as any);

    // Kid says yes -- should NOT auto-end because meeting is kid-initiated
    const msgRes = await fetchJSON(
      `/api/sessions/${sessionId}/meetings/${meetingId}/message`,
      { method: 'POST', body: JSON.stringify({ content: 'yes' }) },
    );
    expect(msgRes.status).toBe(200);

    await waitForAsyncOps();

    const updated = meetingService.getMeeting(meetingId)!;
    expect(updated.status).toBe('active');
  });

  it('still auto-ends a system-triggered meeting normally', async () => {
    const sessionId = createSession();
    // System-triggered meeting (created via createInvite, not /start endpoint)
    const meeting = await setupActiveMeeting(sessionId, 'test-meeting', [
      'Ready to build?',
    ]);

    const { status } = await fetchJSON(
      `/api/sessions/${sessionId}/meetings/${meeting.id}/message`,
      { method: 'POST', body: JSON.stringify({ content: 'yes' }) },
    );
    expect(status).toBe(200);

    await waitForAsyncOps();

    const updated = meetingService.getMeeting(meeting.id)!;
    expect(updated.status).toBe('completed');
  });
});

describe('meeting auto-end: resolves meeting block', () => {
  it('calls resolveMeetingBlock on orchestrator after auto-end', async () => {
    const sessionId = createSession();

    // Attach a mock orchestrator to the session BEFORE setting up the meeting
    const resolveMeetingBlock = vi.fn();
    const entry = store.get(sessionId)!;
    (entry as any).orchestrator = { resolveMeetingBlock, nuggetDir: undefined };

    const meeting = await setupActiveMeeting(sessionId, 'test-meeting', [
      'Ready to build?',
    ]);

    await fetchJSON(
      `/api/sessions/${sessionId}/meetings/${meeting.id}/message`,
      { method: 'POST', body: JSON.stringify({ content: 'yes' }) },
    );

    await waitForAsyncOps(500);

    const updated = meetingService.getMeeting(meeting.id)!;
    expect(updated.status).toBe('completed');
    expect(resolveMeetingBlock).toHaveBeenCalledWith(meeting.id);
  });
});
