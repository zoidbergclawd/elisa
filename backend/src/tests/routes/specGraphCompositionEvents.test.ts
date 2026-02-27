/** Tests for composition event emission from specGraph route handlers. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import express from 'express';
import { SpecGraphService } from '../../services/specGraph.js';
import { CompositionService } from '../../services/compositionService.js';
import { createSpecGraphRouter } from '../../routes/specGraph.js';
import type { WSEvent } from '../../services/phases/types.js';

let server: http.Server | null = null;
let baseUrl = '';
let specGraphService: SpecGraphService;
let sendEventMock: ReturnType<typeof vi.fn>;
let sentEvents: Array<{ sessionId: string; event: WSEvent }>;

function createTestApp() {
  specGraphService = new SpecGraphService();
  const compositionService = new CompositionService(specGraphService);
  sentEvents = [];
  sendEventMock = vi.fn(async (sessionId: string, event: WSEvent) => {
    sentEvents.push({ sessionId, event });
  });
  const app = express();
  app.use(express.json());
  app.use(
    '/api/spec-graph',
    createSpecGraphRouter({ specGraphService, compositionService, sendEvent: sendEventMock }),
  );
  return app;
}

async function fetchJSON(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function makeCompositionSpec(
  goal: string,
  provides?: Array<{ name: string; type: string }>,
  requires?: Array<{ name: string; type: string }>,
): Record<string, any> {
  const spec: Record<string, any> = { nugget: { goal } };
  if (provides || requires) {
    spec.composition = {};
    if (provides) spec.composition.provides = provides;
    if (requires) spec.composition.requires = requires;
  }
  return spec;
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

describe('POST /api/spec-graph/:id/compose — event emission', () => {
  it('emits composition_started event when session_id is provided', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/event-test' }),
    });
    const gid = created.graph_id;

    const { body: n1 } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({
        spec: makeCompositionSpec('Sensor', [{ name: 'temp', type: 'number' }]),
        label: 'Sensor',
      }),
    });
    const { body: n2 } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({
        spec: makeCompositionSpec('Display', undefined, [{ name: 'temp', type: 'number' }]),
        label: 'Display',
      }),
    });

    const { status } = await fetchJSON(`/api/spec-graph/${gid}/compose`, {
      method: 'POST',
      body: JSON.stringify({
        node_ids: [n1.node_id, n2.node_id],
        session_id: 'test-session-1',
      }),
    });

    expect(status).toBe(200);

    const startedEvents = sentEvents.filter((e) => e.event.type === 'composition_started');
    expect(startedEvents).toHaveLength(1);
    expect(startedEvents[0].sessionId).toBe('test-session-1');
    expect(startedEvents[0].event).toEqual({
      type: 'composition_started',
      graph_id: gid,
      node_ids: [n1.node_id, n2.node_id],
    });
  });

  it('emits composition_impact events for each composed node', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/event-test' }),
    });
    const gid = created.graph_id;

    const { body: n1 } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({
        spec: makeCompositionSpec('Sensor', [{ name: 'temp', type: 'number' }]),
        label: 'Sensor',
      }),
    });
    const { body: n2 } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({
        spec: makeCompositionSpec('Display', undefined, [{ name: 'temp', type: 'number' }]),
        label: 'Display',
      }),
    });

    await fetchJSON(`/api/spec-graph/${gid}/compose`, {
      method: 'POST',
      body: JSON.stringify({
        node_ids: [n1.node_id, n2.node_id],
        session_id: 'test-session-2',
      }),
    });

    const impactEvents = sentEvents.filter((e) => e.event.type === 'composition_impact');
    expect(impactEvents).toHaveLength(2);

    // Each impact event should be for the correct session and graph
    for (const ie of impactEvents) {
      expect(ie.sessionId).toBe('test-session-2');
      const evt = ie.event as Extract<WSEvent, { type: 'composition_impact' }>;
      expect(evt.graph_id).toBe(gid);
      expect(evt).toHaveProperty('changed_node_id');
      expect(evt).toHaveProperty('affected_nodes');
      expect(evt).toHaveProperty('severity');
    }

    // The changed_node_ids should match the composed node IDs
    const changedNodeIds = impactEvents.map(
      (ie) => (ie.event as Extract<WSEvent, { type: 'composition_impact' }>).changed_node_id,
    );
    expect(changedNodeIds.sort()).toEqual([n1.node_id, n2.node_id].sort());
  });

  it('does not emit events when session_id is not provided', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/event-test' }),
    });
    const gid = created.graph_id;

    const { body: n1 } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({
        spec: makeCompositionSpec('Sensor', [{ name: 'temp', type: 'number' }]),
        label: 'Sensor',
      }),
    });
    const { body: n2 } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({
        spec: makeCompositionSpec('Display', undefined, [{ name: 'temp', type: 'number' }]),
        label: 'Display',
      }),
    });

    const { status } = await fetchJSON(`/api/spec-graph/${gid}/compose`, {
      method: 'POST',
      body: JSON.stringify({
        node_ids: [n1.node_id, n2.node_id],
      }),
    });

    expect(status).toBe(200);
    expect(sendEventMock).not.toHaveBeenCalled();
  });

  it('emits correct impact severity based on edge relationships', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/event-test' }),
    });
    const gid = created.graph_id;

    const { body: n1 } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({
        spec: makeCompositionSpec('Provider', [{ name: 'data', type: 'string' }]),
        label: 'Provider',
      }),
    });
    const { body: n2 } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({
        spec: makeCompositionSpec('Consumer', undefined, [{ name: 'data', type: 'string' }]),
        label: 'Consumer',
      }),
    });

    // Add an edge: Provider -> Consumer (makes impact "breaking")
    await fetchJSON(`/api/spec-graph/${gid}/edges`, {
      method: 'POST',
      body: JSON.stringify({
        from_id: n1.node_id,
        to_id: n2.node_id,
        relationship: 'provides_to',
      }),
    });

    await fetchJSON(`/api/spec-graph/${gid}/compose`, {
      method: 'POST',
      body: JSON.stringify({
        node_ids: [n1.node_id, n2.node_id],
        session_id: 'test-session-3',
      }),
    });

    const impactEvents = sentEvents.filter((e) => e.event.type === 'composition_impact');

    // Provider node (n1) has an edge to Consumer (n2), so its impact should be "breaking"
    const providerImpact = impactEvents.find(
      (e) => (e.event as Extract<WSEvent, { type: 'composition_impact' }>).changed_node_id === n1.node_id,
    );
    expect(providerImpact).toBeDefined();
    expect((providerImpact!.event as Extract<WSEvent, { type: 'composition_impact' }>).severity).toBe('breaking');
  });

  it('still returns compose result even when events are emitted', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/event-test' }),
    });
    const gid = created.graph_id;

    const { body: n1 } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({
        spec: makeCompositionSpec('A', [{ name: 'x', type: 'string' }]),
        label: 'Node A',
      }),
    });
    const { body: n2 } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({
        spec: makeCompositionSpec('B', undefined, [{ name: 'x', type: 'string' }]),
        label: 'Node B',
      }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${gid}/compose`, {
      method: 'POST',
      body: JSON.stringify({
        node_ids: [n1.node_id, n2.node_id],
        session_id: 'test-session-4',
      }),
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty('composed_spec');
    expect(body).toHaveProperty('emergent_behaviors');
    expect(body).toHaveProperty('interface_contracts');
    expect(body).toHaveProperty('warnings');
    expect(body.composed_spec.nugget.goal).toContain('Node A');
    expect(body.composed_spec.nugget.goal).toContain('Node B');
  });

  it('emits events in correct order: started first, then impacts', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/event-test' }),
    });
    const gid = created.graph_id;

    const { body: n1 } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({
        spec: makeCompositionSpec('X'),
        label: 'X',
      }),
    });
    const { body: n2 } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({
        spec: makeCompositionSpec('Y'),
        label: 'Y',
      }),
    });

    await fetchJSON(`/api/spec-graph/${gid}/compose`, {
      method: 'POST',
      body: JSON.stringify({
        node_ids: [n1.node_id, n2.node_id],
        session_id: 'test-session-5',
      }),
    });

    // First event should be composition_started
    expect(sentEvents.length).toBeGreaterThanOrEqual(1);
    expect(sentEvents[0].event.type).toBe('composition_started');

    // Subsequent events should be composition_impact
    for (let i = 1; i < sentEvents.length; i++) {
      expect(sentEvents[i].event.type).toBe('composition_impact');
    }
  });
});
