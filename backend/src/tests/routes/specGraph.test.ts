/** Tests for Spec Graph route handlers. Uses lightweight Express app with real HTTP. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import express from 'express';
import { SpecGraphService } from '../../services/specGraph.js';
import { CompositionService } from '../../services/compositionService.js';
import { createSpecGraphRouter } from '../../routes/specGraph.js';

let server: http.Server | null = null;
let baseUrl = '';
let specGraphService: SpecGraphService;

function createTestApp() {
  specGraphService = new SpecGraphService();
  const compositionService = new CompositionService(specGraphService);
  const app = express();
  app.use(express.json());
  app.use('/api/spec-graph', createSpecGraphRouter({ specGraphService, compositionService }));
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

function makeSpec(goal: string): Record<string, any> {
  return { nugget: { goal } };
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

// ── POST /api/spec-graph (Create Graph) ──────────────────────────────

describe('POST /api/spec-graph', () => {
  it('creates a graph and returns 201 with graph_id', async () => {
    const { status, body } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/test-workspace' }),
    });

    expect(status).toBe(201);
    expect(body).toHaveProperty('graph_id');
    expect(typeof body.graph_id).toBe('string');
  });

  it('returns 400 when workspace_path is missing', async () => {
    const { status, body } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    expect(status).toBe(400);
    expect(body.detail).toContain('workspace_path');
  });

  it('returns 400 when workspace_path is not a string', async () => {
    const { status, body } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: 123 }),
    });

    expect(status).toBe(400);
    expect(body.detail).toContain('workspace_path');
  });
});

// ── GET /api/spec-graph/:id (Get Graph) ──────────────────────────────

describe('GET /api/spec-graph/:id', () => {
  it('returns 200 with graph data', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/test' }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${created.graph_id}`);

    expect(status).toBe(200);
    expect(body.graph).toBeDefined();
    expect(body.graph.id).toBe(created.graph_id);
    expect(body.graph.workspace_path).toBe('/tmp/test');
    expect(body.graph.nodes).toEqual([]);
    expect(body.graph.edges).toEqual([]);
  });

  it('returns 404 for unknown graph ID', async () => {
    const { status, body } = await fetchJSON('/api/spec-graph/nonexistent');

    expect(status).toBe(404);
    expect(body.detail).toContain('not found');
  });
});

// ── DELETE /api/spec-graph/:id (Delete Graph) ────────────────────────

describe('DELETE /api/spec-graph/:id', () => {
  it('deletes a graph and returns 200', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/test' }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${created.graph_id}`, {
      method: 'DELETE',
    });

    expect(status).toBe(200);
    expect(body.status).toBe('deleted');
  });

  it('subsequent GET returns 404 after delete', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/test' }),
    });

    await fetchJSON(`/api/spec-graph/${created.graph_id}`, { method: 'DELETE' });

    const { status } = await fetchJSON(`/api/spec-graph/${created.graph_id}`);
    expect(status).toBe(404);
  });

  it('returns 404 for unknown graph ID', async () => {
    const { status, body } = await fetchJSON('/api/spec-graph/nonexistent', {
      method: 'DELETE',
    });

    expect(status).toBe(404);
    expect(body.detail).toContain('not found');
  });
});

// ── POST /api/spec-graph/:id/nodes (Add Node) ───────────────────────

describe('POST /api/spec-graph/:id/nodes', () => {
  it('adds a node and returns 201 with node_id', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/test' }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${created.graph_id}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ spec: makeSpec('Build a robot'), label: 'Robot Nugget' }),
    });

    expect(status).toBe(201);
    expect(body).toHaveProperty('node_id');
    expect(typeof body.node_id).toBe('string');
  });

  it('returns 400 when spec is missing', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/test' }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${created.graph_id}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ label: 'Missing Spec' }),
    });

    expect(status).toBe(400);
    expect(body.detail).toContain('spec');
  });

  it('returns 400 when label is missing', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/test' }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${created.graph_id}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ spec: makeSpec('x') }),
    });

    expect(status).toBe(400);
    expect(body.detail).toContain('label');
  });

  it('returns 404 for unknown graph ID', async () => {
    const { status, body } = await fetchJSON('/api/spec-graph/nonexistent/nodes', {
      method: 'POST',
      body: JSON.stringify({ spec: makeSpec('x'), label: 'x' }),
    });

    expect(status).toBe(404);
    expect(body.detail).toContain('not found');
  });
});

// ── GET /api/spec-graph/:id/nodes (List Nodes) ──────────────────────

describe('GET /api/spec-graph/:id/nodes', () => {
  it('returns empty list for new graph', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/test' }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${created.graph_id}/nodes`);

    expect(status).toBe(200);
    expect(body.nodes).toEqual([]);
  });

  it('returns correct count after adding nodes', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/test' }),
    });
    const gid = created.graph_id;

    await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ spec: makeSpec('A'), label: 'Node A' }),
    });
    await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ spec: makeSpec('B'), label: 'Node B' }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${gid}/nodes`);

    expect(status).toBe(200);
    expect(body.nodes).toHaveLength(2);
  });

  it('returns 404 for unknown graph ID', async () => {
    const { status } = await fetchJSON('/api/spec-graph/nonexistent/nodes');
    expect(status).toBe(404);
  });
});

// ── GET /api/spec-graph/:id/nodes/:nodeId (Get Node) ────────────────

describe('GET /api/spec-graph/:id/nodes/:nodeId', () => {
  it('returns node data', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/test' }),
    });
    const gid = created.graph_id;

    const { body: added } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ spec: makeSpec('Build a thing'), label: 'My Node' }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${gid}/nodes/${added.node_id}`);

    expect(status).toBe(200);
    expect(body.node).toBeDefined();
    expect(body.node.id).toBe(added.node_id);
    expect(body.node.label).toBe('My Node');
    expect(body.node.nugget_spec.nugget.goal).toBe('Build a thing');
  });

  it('returns 404 for unknown node ID', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/test' }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${created.graph_id}/nodes/nonexistent`);

    expect(status).toBe(404);
    expect(body.detail).toContain('not found');
  });

  it('returns 404 for unknown graph ID', async () => {
    const { status } = await fetchJSON('/api/spec-graph/nonexistent/nodes/some-node');
    expect(status).toBe(404);
  });
});

// ── DELETE /api/spec-graph/:id/nodes/:nodeId (Remove Node) ──────────

describe('DELETE /api/spec-graph/:id/nodes/:nodeId', () => {
  it('removes a node and returns 200', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/test' }),
    });
    const gid = created.graph_id;

    const { body: added } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ spec: makeSpec('x'), label: 'x' }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${gid}/nodes/${added.node_id}`, {
      method: 'DELETE',
    });

    expect(status).toBe(200);
    expect(body.status).toBe('removed');
  });

  it('cascades edge removal when node is deleted', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/test' }),
    });
    const gid = created.graph_id;

    const { body: nodeA } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ spec: makeSpec('A'), label: 'A' }),
    });
    const { body: nodeB } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ spec: makeSpec('B'), label: 'B' }),
    });

    // Add edge A -> B
    await fetchJSON(`/api/spec-graph/${gid}/edges`, {
      method: 'POST',
      body: JSON.stringify({ from_id: nodeA.node_id, to_id: nodeB.node_id, relationship: 'depends_on' }),
    });

    // Delete node A
    await fetchJSON(`/api/spec-graph/${gid}/nodes/${nodeA.node_id}`, { method: 'DELETE' });

    // Verify graph has no edges left
    const { body: graphData } = await fetchJSON(`/api/spec-graph/${gid}`);
    expect(graphData.graph.edges).toHaveLength(0);
    expect(graphData.graph.nodes).toHaveLength(1);
  });

  it('returns 404 for unknown node ID', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/test' }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${created.graph_id}/nodes/nonexistent`, {
      method: 'DELETE',
    });

    expect(status).toBe(404);
    expect(body.detail).toContain('not found');
  });

  it('returns 404 for unknown graph ID', async () => {
    const { status } = await fetchJSON('/api/spec-graph/nonexistent/nodes/some-node', {
      method: 'DELETE',
    });
    expect(status).toBe(404);
  });
});

// ── POST /api/spec-graph/:id/edges (Add Edge) ───────────────────────

describe('POST /api/spec-graph/:id/edges', () => {
  it('adds an edge and returns 201', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/test' }),
    });
    const gid = created.graph_id;

    const { body: nodeA } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ spec: makeSpec('A'), label: 'A' }),
    });
    const { body: nodeB } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ spec: makeSpec('B'), label: 'B' }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${gid}/edges`, {
      method: 'POST',
      body: JSON.stringify({
        from_id: nodeA.node_id,
        to_id: nodeB.node_id,
        relationship: 'depends_on',
      }),
    });

    expect(status).toBe(201);
    expect(body.status).toBe('added');
  });

  it('returns 400 for self-edge', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/test' }),
    });
    const gid = created.graph_id;

    const { body: node } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ spec: makeSpec('A'), label: 'A' }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${gid}/edges`, {
      method: 'POST',
      body: JSON.stringify({
        from_id: node.node_id,
        to_id: node.node_id,
        relationship: 'depends_on',
      }),
    });

    expect(status).toBe(400);
    expect(body.detail).toContain('Self-edge');
  });

  it('returns 400 for duplicate edge', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/test' }),
    });
    const gid = created.graph_id;

    const { body: nodeA } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ spec: makeSpec('A'), label: 'A' }),
    });
    const { body: nodeB } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ spec: makeSpec('B'), label: 'B' }),
    });

    const edge = {
      from_id: nodeA.node_id,
      to_id: nodeB.node_id,
      relationship: 'depends_on',
    };

    await fetchJSON(`/api/spec-graph/${gid}/edges`, {
      method: 'POST',
      body: JSON.stringify(edge),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${gid}/edges`, {
      method: 'POST',
      body: JSON.stringify(edge),
    });

    expect(status).toBe(400);
    expect(body.detail).toContain('Duplicate');
  });

  it('returns 400 when from_id is missing', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/test' }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${created.graph_id}/edges`, {
      method: 'POST',
      body: JSON.stringify({ to_id: 'b', relationship: 'depends_on' }),
    });

    expect(status).toBe(400);
    expect(body.detail).toContain('from_id');
  });

  it('returns 400 when to_id is missing', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/test' }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${created.graph_id}/edges`, {
      method: 'POST',
      body: JSON.stringify({ from_id: 'a', relationship: 'depends_on' }),
    });

    expect(status).toBe(400);
    expect(body.detail).toContain('to_id');
  });

  it('returns 400 when relationship is missing', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/test' }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${created.graph_id}/edges`, {
      method: 'POST',
      body: JSON.stringify({ from_id: 'a', to_id: 'b' }),
    });

    expect(status).toBe(400);
    expect(body.detail).toContain('relationship');
  });

  it('returns 404 for unknown graph ID', async () => {
    const { status } = await fetchJSON('/api/spec-graph/nonexistent/edges', {
      method: 'POST',
      body: JSON.stringify({ from_id: 'a', to_id: 'b', relationship: 'depends_on' }),
    });
    expect(status).toBe(404);
  });
});

// ── DELETE /api/spec-graph/:id/edges (Remove Edge) ───────────────────

describe('DELETE /api/spec-graph/:id/edges', () => {
  it('removes an edge and returns 200', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/test' }),
    });
    const gid = created.graph_id;

    const { body: nodeA } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ spec: makeSpec('A'), label: 'A' }),
    });
    const { body: nodeB } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ spec: makeSpec('B'), label: 'B' }),
    });

    await fetchJSON(`/api/spec-graph/${gid}/edges`, {
      method: 'POST',
      body: JSON.stringify({
        from_id: nodeA.node_id,
        to_id: nodeB.node_id,
        relationship: 'depends_on',
      }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${gid}/edges`, {
      method: 'DELETE',
      body: JSON.stringify({ from_id: nodeA.node_id, to_id: nodeB.node_id }),
    });

    expect(status).toBe(200);
    expect(body.status).toBe('removed');
  });

  it('returns 404 when edge does not exist', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/test' }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${created.graph_id}/edges`, {
      method: 'DELETE',
      body: JSON.stringify({ from_id: 'a', to_id: 'b' }),
    });

    expect(status).toBe(404);
    expect(body.detail).toContain('not found');
  });

  it('returns 400 when from_id is missing', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/test' }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${created.graph_id}/edges`, {
      method: 'DELETE',
      body: JSON.stringify({ to_id: 'b' }),
    });

    expect(status).toBe(400);
    expect(body.detail).toContain('from_id');
  });

  it('returns 400 when to_id is missing', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/test' }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${created.graph_id}/edges`, {
      method: 'DELETE',
      body: JSON.stringify({ from_id: 'a' }),
    });

    expect(status).toBe(400);
    expect(body.detail).toContain('to_id');
  });
});

// ── GET /api/spec-graph/:id/neighbors/:nodeId (Get Neighbors) ───────

describe('GET /api/spec-graph/:id/neighbors/:nodeId', () => {
  it('returns incoming and outgoing neighbors', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/test' }),
    });
    const gid = created.graph_id;

    const { body: nodeA } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ spec: makeSpec('A'), label: 'Node A' }),
    });
    const { body: nodeB } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ spec: makeSpec('B'), label: 'Node B' }),
    });
    const { body: nodeC } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ spec: makeSpec('C'), label: 'Node C' }),
    });

    // A -> B, C -> B
    await fetchJSON(`/api/spec-graph/${gid}/edges`, {
      method: 'POST',
      body: JSON.stringify({ from_id: nodeA.node_id, to_id: nodeB.node_id, relationship: 'depends_on' }),
    });
    await fetchJSON(`/api/spec-graph/${gid}/edges`, {
      method: 'POST',
      body: JSON.stringify({ from_id: nodeC.node_id, to_id: nodeB.node_id, relationship: 'provides_to' }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${gid}/neighbors/${nodeB.node_id}`);

    expect(status).toBe(200);
    expect(body.incoming).toHaveLength(2);
    expect(body.outgoing).toHaveLength(0);

    const incomingIds = body.incoming.map((n: any) => n.id).sort();
    expect(incomingIds).toEqual([nodeA.node_id, nodeC.node_id].sort());
  });

  it('returns empty lists for isolated node', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/test' }),
    });
    const gid = created.graph_id;

    const { body: node } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ spec: makeSpec('A'), label: 'Alone' }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${gid}/neighbors/${node.node_id}`);

    expect(status).toBe(200);
    expect(body.incoming).toHaveLength(0);
    expect(body.outgoing).toHaveLength(0);
  });

  it('returns 404 for unknown graph ID', async () => {
    const { status } = await fetchJSON('/api/spec-graph/nonexistent/neighbors/some-node');
    expect(status).toBe(404);
  });
});

// ── Integration Test ────────────────────────────────────────────────

describe('Integration: full graph workflow', () => {
  it('creates graph, adds nodes, connects with edges, queries neighbors, verifies full graph', async () => {
    // Create graph
    const { status: createStatus, body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/integration-test' }),
    });
    expect(createStatus).toBe(201);
    const gid = created.graph_id;

    // Add 3 nodes
    const { body: n1 } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ spec: makeSpec('Weather API'), label: 'Weather Service' }),
    });
    const { body: n2 } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ spec: makeSpec('Dashboard UI'), label: 'Dashboard' }),
    });
    const { body: n3 } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ spec: makeSpec('Alert System'), label: 'Alerts' }),
    });

    // Add edges: Weather -> Dashboard, Weather -> Alerts, Dashboard -> Alerts
    await fetchJSON(`/api/spec-graph/${gid}/edges`, {
      method: 'POST',
      body: JSON.stringify({
        from_id: n1.node_id,
        to_id: n2.node_id,
        relationship: 'provides_to',
        description: 'weather data feed',
      }),
    });
    await fetchJSON(`/api/spec-graph/${gid}/edges`, {
      method: 'POST',
      body: JSON.stringify({
        from_id: n1.node_id,
        to_id: n3.node_id,
        relationship: 'provides_to',
        description: 'weather alerts',
      }),
    });
    await fetchJSON(`/api/spec-graph/${gid}/edges`, {
      method: 'POST',
      body: JSON.stringify({
        from_id: n2.node_id,
        to_id: n3.node_id,
        relationship: 'shares_interface',
      }),
    });

    // Verify full graph
    const { body: graphData } = await fetchJSON(`/api/spec-graph/${gid}`);
    expect(graphData.graph.nodes).toHaveLength(3);
    expect(graphData.graph.edges).toHaveLength(3);

    // Query neighbors of Dashboard (n2)
    const { body: neighbors } = await fetchJSON(`/api/spec-graph/${gid}/neighbors/${n2.node_id}`);
    expect(neighbors.incoming).toHaveLength(1); // Weather -> Dashboard
    expect(neighbors.incoming[0].id).toBe(n1.node_id);
    expect(neighbors.outgoing).toHaveLength(1); // Dashboard -> Alerts
    expect(neighbors.outgoing[0].id).toBe(n3.node_id);

    // Query neighbors of Weather (n1)
    const { body: weatherNeighbors } = await fetchJSON(`/api/spec-graph/${gid}/neighbors/${n1.node_id}`);
    expect(weatherNeighbors.incoming).toHaveLength(0);
    expect(weatherNeighbors.outgoing).toHaveLength(2); // -> Dashboard, -> Alerts

    // List nodes
    const { body: nodeList } = await fetchJSON(`/api/spec-graph/${gid}/nodes`);
    expect(nodeList.nodes).toHaveLength(3);

    // Delete a node and verify edge cascade
    await fetchJSON(`/api/spec-graph/${gid}/nodes/${n1.node_id}`, { method: 'DELETE' });

    const { body: afterDelete } = await fetchJSON(`/api/spec-graph/${gid}`);
    expect(afterDelete.graph.nodes).toHaveLength(2);
    // Only the Dashboard -> Alerts edge should remain
    expect(afterDelete.graph.edges).toHaveLength(1);
    expect(afterDelete.graph.edges[0].from_id).toBe(n2.node_id);
    expect(afterDelete.graph.edges[0].to_id).toBe(n3.node_id);

    // Remove remaining edge
    const { status: edgeDelStatus } = await fetchJSON(`/api/spec-graph/${gid}/edges`, {
      method: 'DELETE',
      body: JSON.stringify({ from_id: n2.node_id, to_id: n3.node_id }),
    });
    expect(edgeDelStatus).toBe(200);

    const { body: finalGraph } = await fetchJSON(`/api/spec-graph/${gid}`);
    expect(finalGraph.graph.edges).toHaveLength(0);

    // Delete the graph
    const { status: graphDelStatus } = await fetchJSON(`/api/spec-graph/${gid}`, { method: 'DELETE' });
    expect(graphDelStatus).toBe(200);

    // Verify it is gone
    const { status: goneStatus } = await fetchJSON(`/api/spec-graph/${gid}`);
    expect(goneStatus).toBe(404);
  });
});

// ── POST /api/spec-graph/:id/compose (Compose Nodes) ────────────────

function makeCompositionSpec(goal: string, provides?: Array<{ name: string; type: string }>, requires?: Array<{ name: string; type: string }>): Record<string, any> {
  const spec: Record<string, any> = { nugget: { goal } };
  if (provides || requires) {
    spec.composition = {};
    if (provides) spec.composition.provides = provides;
    if (requires) spec.composition.requires = requires;
  }
  return spec;
}

describe('POST /api/spec-graph/:id/compose', () => {
  it('composes valid nodes and returns 200 with ComposeResult', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/compose-test' }),
    });
    const gid = created.graph_id;

    const { body: n1 } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({
        spec: makeCompositionSpec('Sensor', [{ name: 'temperature', type: 'number' }]),
        label: 'Sensor Nugget',
      }),
    });
    const { body: n2 } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({
        spec: makeCompositionSpec('Display', undefined, [{ name: 'temperature', type: 'number' }]),
        label: 'Display Nugget',
      }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${gid}/compose`, {
      method: 'POST',
      body: JSON.stringify({ node_ids: [n1.node_id, n2.node_id] }),
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty('composed_spec');
    expect(body).toHaveProperty('emergent_behaviors');
    expect(body).toHaveProperty('interface_contracts');
    expect(body).toHaveProperty('warnings');
    expect(body.composed_spec.nugget.goal).toContain('Sensor Nugget');
    expect(body.composed_spec.nugget.goal).toContain('Display Nugget');
  });

  it('returns 400 when node_ids is empty', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/compose-test' }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${created.graph_id}/compose`, {
      method: 'POST',
      body: JSON.stringify({ node_ids: [] }),
    });

    expect(status).toBe(400);
    expect(body.detail).toContain('node_ids');
  });

  it('returns 400 when node_ids is missing', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/compose-test' }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${created.graph_id}/compose`, {
      method: 'POST',
      body: JSON.stringify({}),
    });

    expect(status).toBe(400);
    expect(body.detail).toContain('node_ids');
  });

  it('returns 400 when node_ids contains nonexistent nodes', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/compose-test' }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${created.graph_id}/compose`, {
      method: 'POST',
      body: JSON.stringify({ node_ids: ['nonexistent-1', 'nonexistent-2'] }),
    });

    expect(status).toBe(400);
    expect(body.detail).toContain('Invalid composition');
  });
});

// ── POST /api/spec-graph/:id/impact (Detect Impact) ─────────────────

describe('POST /api/spec-graph/:id/impact', () => {
  it('detects impact of a valid node and returns 200', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/impact-test' }),
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

    const { status, body } = await fetchJSON(`/api/spec-graph/${gid}/impact`, {
      method: 'POST',
      body: JSON.stringify({ node_id: n1.node_id }),
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty('affected_nodes');
    expect(body).toHaveProperty('severity');
    expect(Array.isArray(body.affected_nodes)).toBe(true);
    // Consumer requires data provided by Provider, so it should be affected
    expect(body.affected_nodes.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 400 when node_id is missing', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/impact-test' }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${created.graph_id}/impact`, {
      method: 'POST',
      body: JSON.stringify({}),
    });

    expect(status).toBe(400);
    expect(body.detail).toContain('node_id');
  });

  it('returns 404 when node_id does not exist', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/impact-test' }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${created.graph_id}/impact`, {
      method: 'POST',
      body: JSON.stringify({ node_id: 'nonexistent' }),
    });

    expect(status).toBe(404);
    expect(body.detail).toContain('not found');
  });
});

// ── GET /api/spec-graph/:id/interfaces (Resolve Interfaces) ─────────

describe('GET /api/spec-graph/:id/interfaces', () => {
  it('resolves interfaces among nodes and returns 200 with contracts', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/interfaces-test' }),
    });
    const gid = created.graph_id;

    const { body: n1 } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({
        spec: makeCompositionSpec('Sensor', [{ name: 'temperature', type: 'number' }]),
        label: 'Sensor',
      }),
    });
    const { body: n2 } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({
        spec: makeCompositionSpec('Display', undefined, [{ name: 'temperature', type: 'number' }]),
        label: 'Display',
      }),
    });

    const { status, body } = await fetchJSON(
      `/api/spec-graph/${gid}/interfaces?node_ids=${n1.node_id},${n2.node_id}`,
    );

    expect(status).toBe(200);
    expect(body).toHaveProperty('contracts');
    expect(Array.isArray(body.contracts)).toBe(true);
    expect(body.contracts.length).toBeGreaterThanOrEqual(1);
    expect(body.contracts[0]).toHaveProperty('provider_node_id');
    expect(body.contracts[0]).toHaveProperty('consumer_node_id');
    expect(body.contracts[0]).toHaveProperty('interface_name');
    expect(body.contracts[0]).toHaveProperty('type');
  });

  it('returns 400 when node_ids query parameter is missing', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/interfaces-test' }),
    });

    const { status, body } = await fetchJSON(`/api/spec-graph/${created.graph_id}/interfaces`);

    expect(status).toBe(400);
    expect(body.detail).toContain('node_ids');
  });

  it('returns empty contracts when no interfaces match', async () => {
    const { body: created } = await fetchJSON('/api/spec-graph', {
      method: 'POST',
      body: JSON.stringify({ workspace_path: '/tmp/interfaces-test' }),
    });
    const gid = created.graph_id;

    const { body: n1 } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({
        spec: makeSpec('Standalone A'),
        label: 'Standalone A',
      }),
    });
    const { body: n2 } = await fetchJSON(`/api/spec-graph/${gid}/nodes`, {
      method: 'POST',
      body: JSON.stringify({
        spec: makeSpec('Standalone B'),
        label: 'Standalone B',
      }),
    });

    const { status, body } = await fetchJSON(
      `/api/spec-graph/${gid}/interfaces?node_ids=${n1.node_id},${n2.node_id}`,
    );

    expect(status).toBe(200);
    expect(body.contracts).toHaveLength(0);
  });
});
