/** Tests for meeting route handlers. Uses lightweight Express app with real HTTP. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import express from 'express';
import { MeetingRegistry } from '../../services/meetingRegistry.js';
import { MeetingService } from '../../services/meetingService.js';
import { SessionStore } from '../../services/sessionStore.js';
import { createMeetingRouter } from '../../routes/meetings.js';
import type { MeetingType } from '../../models/meeting.js';

const TEST_MEETING_TYPE: MeetingType = {
  id: 'test-meeting',
  name: 'Test Meeting',
  agentName: 'Pixel',
  canvasType: 'test-canvas',
  triggerConditions: [],
  persona: 'A test agent',
};

let server: http.Server | null = null;
let baseUrl = '';
let store: SessionStore;
let registry: MeetingRegistry;
let meetingService: MeetingService;
let sentEvents: Record<string, any>[];

function createTestApp() {
  store = new SessionStore(false);
  registry = new MeetingRegistry();
  registry.register(TEST_MEETING_TYPE);
  meetingService = new MeetingService(registry);
  sentEvents = [];

  const sendEvent = async (_sessionId: string, event: Record<string, any>) => {
    sentEvents.push(event);
  };

  const app = express();
  app.use(express.json());
  app.use('/api/sessions/:sessionId/meetings', createMeetingRouter({ store, meetingService, sendEvent }));
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

describe('GET /api/sessions/:sessionId/meetings', () => {
  it('returns 404 for unknown session', async () => {
    const { status } = await fetchJSON('/api/sessions/unknown/meetings');
    expect(status).toBe(404);
  });

  it('returns empty array for session with no meetings', async () => {
    const sessionId = createSession();
    const { status, body } = await fetchJSON(`/api/sessions/${sessionId}/meetings`);
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });

  it('returns meetings for session', async () => {
    const sessionId = createSession();
    const sendEvent = async (event: any) => { sentEvents.push(event); };
    await meetingService.createInvite('test-meeting', sessionId, sendEvent as any);

    const { status, body } = await fetchJSON(`/api/sessions/${sessionId}/meetings`);
    expect(status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].meetingTypeId).toBe('test-meeting');
  });
});

describe('GET /api/sessions/:sessionId/meetings/:meetingId', () => {
  it('returns 404 for unknown meeting', async () => {
    const sessionId = createSession();
    const { status } = await fetchJSON(`/api/sessions/${sessionId}/meetings/unknown`);
    expect(status).toBe(404);
  });

  it('returns meeting details', async () => {
    const sessionId = createSession();
    const sendEvent = async (event: any) => { sentEvents.push(event); };
    const meeting = await meetingService.createInvite('test-meeting', sessionId, sendEvent as any);

    const { status, body } = await fetchJSON(`/api/sessions/${sessionId}/meetings/${meeting!.id}`);
    expect(status).toBe(200);
    expect(body.id).toBe(meeting!.id);
    expect(body.status).toBe('invited');
  });
});

describe('POST /api/sessions/:sessionId/meetings/:meetingId/accept', () => {
  it('accepts an invite', async () => {
    const sessionId = createSession();
    const sendEvent = async (event: any) => { sentEvents.push(event); };
    const meeting = await meetingService.createInvite('test-meeting', sessionId, sendEvent as any);
    sentEvents = [];

    const { status, body } = await fetchJSON(
      `/api/sessions/${sessionId}/meetings/${meeting!.id}/accept`,
      { method: 'POST' },
    );
    expect(status).toBe(200);
    expect(body.status).toBe('active');
  });

  it('returns 409 for already accepted meeting', async () => {
    const sessionId = createSession();
    const sendEvent = async (event: any) => { sentEvents.push(event); };
    const meeting = await meetingService.createInvite('test-meeting', sessionId, sendEvent as any);
    await meetingService.acceptMeeting(meeting!.id, sendEvent as any);

    const { status } = await fetchJSON(
      `/api/sessions/${sessionId}/meetings/${meeting!.id}/accept`,
      { method: 'POST' },
    );
    expect(status).toBe(409);
  });
});

describe('POST /api/sessions/:sessionId/meetings/:meetingId/decline', () => {
  it('declines an invite', async () => {
    const sessionId = createSession();
    const sendEvent = async (event: any) => { sentEvents.push(event); };
    const meeting = await meetingService.createInvite('test-meeting', sessionId, sendEvent as any);

    const { status, body } = await fetchJSON(
      `/api/sessions/${sessionId}/meetings/${meeting!.id}/decline`,
      { method: 'POST' },
    );
    expect(status).toBe(200);
    expect(body.status).toBe('declined');
  });
});

describe('POST /api/sessions/:sessionId/meetings/:meetingId/message', () => {
  it('sends a message in an active meeting', async () => {
    const sessionId = createSession();
    const sendEvent = async (event: any) => { sentEvents.push(event); };
    const meeting = await meetingService.createInvite('test-meeting', sessionId, sendEvent as any);
    await meetingService.acceptMeeting(meeting!.id, sendEvent as any);
    sentEvents = [];

    const { status, body } = await fetchJSON(
      `/api/sessions/${sessionId}/meetings/${meeting!.id}/message`,
      { method: 'POST', body: JSON.stringify({ content: 'Hello agent!' }) },
    );
    expect(status).toBe(200);
    expect(body.role).toBe('kid');
    expect(body.content).toBe('Hello agent!');
  });

  it('returns 400 for empty content', async () => {
    const sessionId = createSession();
    const sendEvent = async (event: any) => { sentEvents.push(event); };
    const meeting = await meetingService.createInvite('test-meeting', sessionId, sendEvent as any);
    await meetingService.acceptMeeting(meeting!.id, sendEvent as any);

    const { status } = await fetchJSON(
      `/api/sessions/${sessionId}/meetings/${meeting!.id}/message`,
      { method: 'POST', body: JSON.stringify({ content: '' }) },
    );
    expect(status).toBe(400);
  });

  it('returns 400 for missing content', async () => {
    const sessionId = createSession();
    const sendEvent = async (event: any) => { sentEvents.push(event); };
    const meeting = await meetingService.createInvite('test-meeting', sessionId, sendEvent as any);
    await meetingService.acceptMeeting(meeting!.id, sendEvent as any);

    const { status } = await fetchJSON(
      `/api/sessions/${sessionId}/meetings/${meeting!.id}/message`,
      { method: 'POST', body: JSON.stringify({}) },
    );
    expect(status).toBe(400);
  });

  it('returns 409 for message in non-active meeting', async () => {
    const sessionId = createSession();
    const sendEvent = async (event: any) => { sentEvents.push(event); };
    const meeting = await meetingService.createInvite('test-meeting', sessionId, sendEvent as any);

    const { status } = await fetchJSON(
      `/api/sessions/${sessionId}/meetings/${meeting!.id}/message`,
      { method: 'POST', body: JSON.stringify({ content: 'Hello' }) },
    );
    expect(status).toBe(409);
  });
});

describe('POST /api/sessions/:sessionId/meetings/:meetingId/end', () => {
  it('ends an active meeting', async () => {
    const sessionId = createSession();
    const sendEvent = async (event: any) => { sentEvents.push(event); };
    const meeting = await meetingService.createInvite('test-meeting', sessionId, sendEvent as any);
    await meetingService.acceptMeeting(meeting!.id, sendEvent as any);
    sentEvents = [];

    const { status, body } = await fetchJSON(
      `/api/sessions/${sessionId}/meetings/${meeting!.id}/end`,
      { method: 'POST' },
    );
    expect(status).toBe(200);
    expect(body.status).toBe('completed');
  });

  it('returns 409 for non-active meeting', async () => {
    const sessionId = createSession();
    const sendEvent = async (event: any) => { sentEvents.push(event); };
    const meeting = await meetingService.createInvite('test-meeting', sessionId, sendEvent as any);

    const { status } = await fetchJSON(
      `/api/sessions/${sessionId}/meetings/${meeting!.id}/end`,
      { method: 'POST' },
    );
    expect(status).toBe(409);
  });
});
