import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SpecGraphService } from '../services/specGraph.js';
import type { NuggetSpec } from '../utils/specValidator.js';
import type { SpecGraphEdge } from '../models/specGraph.js';

/** Minimal NuggetSpec fixture for tests. */
const makeSpec = (goal: string): NuggetSpec => ({
  nugget: { goal },
});

describe('SpecGraphService', () => {
  let svc: SpecGraphService;
  let tmpDir: string;

  beforeEach(() => {
    svc = new SpecGraphService();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specgraph-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- Graph lifecycle ---

  describe('graph lifecycle', () => {
    it('creates a graph and returns an ID', () => {
      const id = svc.create(tmpDir);
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
    });

    it('getGraph returns the created graph', () => {
      const id = svc.create(tmpDir);
      const graph = svc.getGraph(id);
      expect(graph).toBeDefined();
      expect(graph!.id).toBe(id);
      expect(graph!.workspace_path).toBe(tmpDir);
      expect(graph!.nodes).toEqual([]);
      expect(graph!.edges).toEqual([]);
    });

    it('getGraph returns undefined for unknown ID', () => {
      expect(svc.getGraph('nonexistent')).toBeUndefined();
    });

    it('deleteGraph removes the graph', () => {
      const id = svc.create(tmpDir);
      expect(svc.deleteGraph(id)).toBe(true);
      expect(svc.getGraph(id)).toBeUndefined();
    });

    it('deleteGraph returns false for unknown ID', () => {
      expect(svc.deleteGraph('nonexistent')).toBe(false);
    });
  });

  // --- Node CRUD ---

  describe('node CRUD', () => {
    let graphId: string;

    beforeEach(() => {
      graphId = svc.create(tmpDir);
    });

    it('addNode returns a node ID', () => {
      const nodeId = svc.addNode(graphId, makeSpec('Test goal'), 'Test Node');
      expect(nodeId).toBeTruthy();
      expect(typeof nodeId).toBe('string');
    });

    it('getNode returns the added node', () => {
      const nodeId = svc.addNode(graphId, makeSpec('Test goal'), 'Test Node');
      const node = svc.getNode(graphId, nodeId);
      expect(node).toBeDefined();
      expect(node!.id).toBe(nodeId);
      expect(node!.label).toBe('Test Node');
      expect(node!.nugget_spec.nugget?.goal).toBe('Test goal');
      expect(node!.created_at).toBeGreaterThan(0);
      expect(node!.updated_at).toBeGreaterThan(0);
    });

    it('getNode returns undefined for unknown node ID', () => {
      expect(svc.getNode(graphId, 'nonexistent')).toBeUndefined();
    });

    it('getNodes returns all nodes', () => {
      svc.addNode(graphId, makeSpec('Goal A'), 'Node A');
      svc.addNode(graphId, makeSpec('Goal B'), 'Node B');
      const nodes = svc.getNodes(graphId);
      expect(nodes).toHaveLength(2);
    });

    it('updateNode changes spec and label', () => {
      const nodeId = svc.addNode(graphId, makeSpec('Old goal'), 'Old Label');
      const result = svc.updateNode(graphId, nodeId, makeSpec('New goal'), 'New Label');
      expect(result).toBe(true);

      const node = svc.getNode(graphId, nodeId);
      expect(node!.nugget_spec.nugget?.goal).toBe('New goal');
      expect(node!.label).toBe('New Label');
    });

    it('updateNode changes only spec when label is omitted', () => {
      const nodeId = svc.addNode(graphId, makeSpec('Old goal'), 'Keep This');
      svc.updateNode(graphId, nodeId, makeSpec('New goal'));
      const node = svc.getNode(graphId, nodeId);
      expect(node!.nugget_spec.nugget?.goal).toBe('New goal');
      expect(node!.label).toBe('Keep This');
    });

    it('updateNode returns false for unknown node', () => {
      expect(svc.updateNode(graphId, 'nonexistent', makeSpec('x'))).toBe(false);
    });

    it('removeNode removes the node', () => {
      const nodeId = svc.addNode(graphId, makeSpec('Goal'), 'Node');
      expect(svc.removeNode(graphId, nodeId)).toBe(true);
      expect(svc.getNode(graphId, nodeId)).toBeUndefined();
      expect(svc.getNodes(graphId)).toHaveLength(0);
    });

    it('removeNode returns false for unknown node', () => {
      expect(svc.removeNode(graphId, 'nonexistent')).toBe(false);
    });
  });

  // --- Edge CRUD ---

  describe('edge CRUD', () => {
    let graphId: string;
    let nodeA: string;
    let nodeB: string;
    let nodeC: string;

    beforeEach(() => {
      graphId = svc.create(tmpDir);
      nodeA = svc.addNode(graphId, makeSpec('A'), 'Node A');
      nodeB = svc.addNode(graphId, makeSpec('B'), 'Node B');
      nodeC = svc.addNode(graphId, makeSpec('C'), 'Node C');
    });

    it('addEdge adds an edge', () => {
      svc.addEdge(graphId, { from_id: nodeA, to_id: nodeB, relationship: 'depends_on' });
      const edges = svc.getEdges(graphId);
      expect(edges).toHaveLength(1);
      expect(edges[0].from_id).toBe(nodeA);
      expect(edges[0].to_id).toBe(nodeB);
      expect(edges[0].relationship).toBe('depends_on');
    });

    it('addEdge stores description', () => {
      svc.addEdge(graphId, {
        from_id: nodeA,
        to_id: nodeB,
        relationship: 'shares_interface',
        description: 'API boundary',
      });
      const edges = svc.getEdges(graphId);
      expect(edges[0].description).toBe('API boundary');
    });

    it('removeEdge removes an existing edge', () => {
      svc.addEdge(graphId, { from_id: nodeA, to_id: nodeB, relationship: 'depends_on' });
      expect(svc.removeEdge(graphId, nodeA, nodeB)).toBe(true);
      expect(svc.getEdges(graphId)).toHaveLength(0);
    });

    it('removeEdge returns false when edge not found', () => {
      expect(svc.removeEdge(graphId, nodeA, nodeB)).toBe(false);
    });

    it('allows different relationship types between same nodes', () => {
      svc.addEdge(graphId, { from_id: nodeA, to_id: nodeB, relationship: 'depends_on' });
      svc.addEdge(graphId, { from_id: nodeA, to_id: nodeB, relationship: 'shares_interface' });
      expect(svc.getEdges(graphId)).toHaveLength(2);
    });
  });

  // --- Self-edge rejection ---

  describe('self-edge rejection', () => {
    it('throws when adding a self-edge', () => {
      const graphId = svc.create(tmpDir);
      const nodeId = svc.addNode(graphId, makeSpec('A'), 'Node A');
      expect(() =>
        svc.addEdge(graphId, { from_id: nodeId, to_id: nodeId, relationship: 'depends_on' }),
      ).toThrow('Self-edges are not allowed');
    });
  });

  // --- Duplicate edge rejection ---

  describe('duplicate edge rejection', () => {
    it('throws when adding a duplicate edge with same relationship', () => {
      const graphId = svc.create(tmpDir);
      const a = svc.addNode(graphId, makeSpec('A'), 'A');
      const b = svc.addNode(graphId, makeSpec('B'), 'B');
      const edge: SpecGraphEdge = { from_id: a, to_id: b, relationship: 'depends_on' };
      svc.addEdge(graphId, edge);
      expect(() => svc.addEdge(graphId, edge)).toThrow('Duplicate edge already exists');
    });
  });

  // --- removeNode cascades to edges ---

  describe('removeNode cascades to edges', () => {
    it('removes all edges connected to the deleted node', () => {
      const graphId = svc.create(tmpDir);
      const a = svc.addNode(graphId, makeSpec('A'), 'A');
      const b = svc.addNode(graphId, makeSpec('B'), 'B');
      const c = svc.addNode(graphId, makeSpec('C'), 'C');

      svc.addEdge(graphId, { from_id: a, to_id: b, relationship: 'depends_on' });
      svc.addEdge(graphId, { from_id: c, to_id: a, relationship: 'provides_to' });
      svc.addEdge(graphId, { from_id: b, to_id: c, relationship: 'shares_interface' });

      // Remove node A -- edges involving A should be gone
      svc.removeNode(graphId, a);

      const edges = svc.getEdges(graphId);
      expect(edges).toHaveLength(1);
      expect(edges[0].from_id).toBe(b);
      expect(edges[0].to_id).toBe(c);
    });
  });

  // --- Neighbor traversal ---

  describe('neighbor traversal', () => {
    it('returns correct incoming and outgoing neighbors', () => {
      const graphId = svc.create(tmpDir);
      const a = svc.addNode(graphId, makeSpec('A'), 'A');
      const b = svc.addNode(graphId, makeSpec('B'), 'B');
      const c = svc.addNode(graphId, makeSpec('C'), 'C');

      svc.addEdge(graphId, { from_id: a, to_id: b, relationship: 'depends_on' });
      svc.addEdge(graphId, { from_id: c, to_id: b, relationship: 'provides_to' });

      const { incoming, outgoing } = svc.getNeighbors(graphId, b);
      expect(incoming).toHaveLength(2);
      expect(incoming.map((n) => n.id).sort()).toEqual([a, c].sort());
      expect(outgoing).toHaveLength(0);
    });

    it('returns empty lists for isolated node', () => {
      const graphId = svc.create(tmpDir);
      const a = svc.addNode(graphId, makeSpec('A'), 'A');
      svc.addNode(graphId, makeSpec('B'), 'B');

      const { incoming, outgoing } = svc.getNeighbors(graphId, a);
      expect(incoming).toHaveLength(0);
      expect(outgoing).toHaveLength(0);
    });
  });

  // --- Cycle detection ---

  describe('cycle detection', () => {
    it('returns false for an acyclic graph', () => {
      const graphId = svc.create(tmpDir);
      const a = svc.addNode(graphId, makeSpec('A'), 'A');
      const b = svc.addNode(graphId, makeSpec('B'), 'B');
      const c = svc.addNode(graphId, makeSpec('C'), 'C');

      svc.addEdge(graphId, { from_id: a, to_id: b, relationship: 'depends_on' });
      svc.addEdge(graphId, { from_id: b, to_id: c, relationship: 'depends_on' });

      expect(svc.detectCycles(graphId)).toBe(false);
    });

    it('returns false for empty graph', () => {
      const graphId = svc.create(tmpDir);
      expect(svc.detectCycles(graphId)).toBe(false);
    });

    it('returns true for a simple cycle (A -> B -> A)', () => {
      const graphId = svc.create(tmpDir);
      const a = svc.addNode(graphId, makeSpec('A'), 'A');
      const b = svc.addNode(graphId, makeSpec('B'), 'B');

      svc.addEdge(graphId, { from_id: a, to_id: b, relationship: 'depends_on' });
      svc.addEdge(graphId, { from_id: b, to_id: a, relationship: 'depends_on' });

      expect(svc.detectCycles(graphId)).toBe(true);
    });

    it('returns true for a complex cycle (A -> B -> C -> A)', () => {
      const graphId = svc.create(tmpDir);
      const a = svc.addNode(graphId, makeSpec('A'), 'A');
      const b = svc.addNode(graphId, makeSpec('B'), 'B');
      const c = svc.addNode(graphId, makeSpec('C'), 'C');

      svc.addEdge(graphId, { from_id: a, to_id: b, relationship: 'depends_on' });
      svc.addEdge(graphId, { from_id: b, to_id: c, relationship: 'depends_on' });
      svc.addEdge(graphId, { from_id: c, to_id: a, relationship: 'depends_on' });

      expect(svc.detectCycles(graphId)).toBe(true);
    });

    it('detects cycle in a subgraph while other parts are acyclic', () => {
      const graphId = svc.create(tmpDir);
      const a = svc.addNode(graphId, makeSpec('A'), 'A');
      const b = svc.addNode(graphId, makeSpec('B'), 'B');
      const c = svc.addNode(graphId, makeSpec('C'), 'C');
      const d = svc.addNode(graphId, makeSpec('D'), 'D');

      // Acyclic part: A -> B
      svc.addEdge(graphId, { from_id: a, to_id: b, relationship: 'depends_on' });
      // Cyclic part: C -> D -> C
      svc.addEdge(graphId, { from_id: c, to_id: d, relationship: 'depends_on' });
      svc.addEdge(graphId, { from_id: d, to_id: c, relationship: 'depends_on' });

      expect(svc.detectCycles(graphId)).toBe(true);
    });
  });

  // --- buildGraphContext ---

  describe('buildGraphContext', () => {
    it('returns empty message for graph with no nodes', () => {
      const graphId = svc.create(tmpDir);
      const ctx = svc.buildGraphContext(graphId);
      expect(ctx).toContain('empty');
    });

    it('includes node labels and goals', () => {
      const graphId = svc.create(tmpDir);
      svc.addNode(graphId, makeSpec('Build a weather app'), 'Weather App');
      svc.addNode(graphId, makeSpec('Build a dashboard'), 'Dashboard');

      const ctx = svc.buildGraphContext(graphId);
      expect(ctx).toContain('Weather App');
      expect(ctx).toContain('Build a weather app');
      expect(ctx).toContain('Dashboard');
      expect(ctx).toContain('Build a dashboard');
    });

    it('includes edge relationships', () => {
      const graphId = svc.create(tmpDir);
      const a = svc.addNode(graphId, makeSpec('A'), 'Node A');
      const b = svc.addNode(graphId, makeSpec('B'), 'Node B');
      svc.addEdge(graphId, {
        from_id: a,
        to_id: b,
        relationship: 'depends_on',
        description: 'data feed',
      });

      const ctx = svc.buildGraphContext(graphId);
      expect(ctx).toContain('depends_on');
      expect(ctx).toContain('Node A');
      expect(ctx).toContain('Node B');
      expect(ctx).toContain('data feed');
    });

    it('excludes specified node and its edges', () => {
      const graphId = svc.create(tmpDir);
      const a = svc.addNode(graphId, makeSpec('A'), 'Excluded');
      const b = svc.addNode(graphId, makeSpec('B'), 'Kept');
      svc.addEdge(graphId, { from_id: a, to_id: b, relationship: 'depends_on' });

      const ctx = svc.buildGraphContext(graphId, a);
      expect(ctx).not.toContain('Excluded');
      expect(ctx).toContain('Kept');
      // The edge from a -> b should also be excluded
      expect(ctx).not.toContain('depends_on');
    });
  });

  // --- Persistence round-trip ---

  describe('persistence', () => {
    it('save then load round-trips graph data', () => {
      const graphId = svc.create(tmpDir);
      const nodeA = svc.addNode(graphId, makeSpec('Goal A'), 'Node A');
      const nodeB = svc.addNode(graphId, makeSpec('Goal B'), 'Node B');
      svc.addEdge(graphId, {
        from_id: nodeA,
        to_id: nodeB,
        relationship: 'depends_on',
        description: 'test dep',
      });

      svc.save(graphId);

      // Create a fresh service and load
      const svc2 = new SpecGraphService();
      const loaded = svc2.load(tmpDir);

      expect(loaded).not.toBeNull();
      expect(loaded!.nodes).toHaveLength(2);
      expect(loaded!.edges).toHaveLength(1);
      expect(loaded!.nodes[0].label).toBe('Node A');
      expect(loaded!.nodes[1].label).toBe('Node B');
      expect(loaded!.edges[0].from_id).toBe(nodeA);
      expect(loaded!.edges[0].to_id).toBe(nodeB);
      expect(loaded!.edges[0].relationship).toBe('depends_on');
      expect(loaded!.edges[0].description).toBe('test dep');
    });

    it('save creates .elisa directory if missing', () => {
      const graphId = svc.create(tmpDir);
      svc.save(graphId);

      const filePath = path.join(tmpDir, '.elisa', 'spec-graph.json');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('load returns null when file does not exist', () => {
      const loaded = svc.load(tmpDir);
      expect(loaded).toBeNull();
    });

    it('load returns null for invalid JSON', () => {
      const dir = path.join(tmpDir, '.elisa');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'spec-graph.json'), 'not json!!!');

      const loaded = svc.load(tmpDir);
      expect(loaded).toBeNull();
    });

    it('load returns null for JSON missing required arrays', () => {
      const dir = path.join(tmpDir, '.elisa');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'spec-graph.json'), JSON.stringify({ version: 1 }));

      const loaded = svc.load(tmpDir);
      expect(loaded).toBeNull();
    });

    it('save does not leave .tmp file behind', () => {
      const graphId = svc.create(tmpDir);
      svc.save(graphId);

      const tmpFile = path.join(tmpDir, '.elisa', 'spec-graph.json.tmp');
      expect(fs.existsSync(tmpFile)).toBe(false);
    });
  });

  // --- Error cases ---

  describe('error cases', () => {
    it('addNode throws for invalid graph ID', () => {
      expect(() => svc.addNode('bad-id', makeSpec('x'), 'x')).toThrow('Graph not found');
    });

    it('removeNode throws for invalid graph ID', () => {
      expect(() => svc.removeNode('bad-id', 'x')).toThrow('Graph not found');
    });

    it('getNode throws for invalid graph ID', () => {
      expect(() => svc.getNode('bad-id', 'x')).toThrow('Graph not found');
    });

    it('getNodes throws for invalid graph ID', () => {
      expect(() => svc.getNodes('bad-id')).toThrow('Graph not found');
    });

    it('updateNode throws for invalid graph ID', () => {
      expect(() => svc.updateNode('bad-id', 'x', makeSpec('x'))).toThrow('Graph not found');
    });

    it('addEdge throws for invalid graph ID', () => {
      expect(() =>
        svc.addEdge('bad-id', { from_id: 'a', to_id: 'b', relationship: 'depends_on' }),
      ).toThrow('Graph not found');
    });

    it('removeEdge throws for invalid graph ID', () => {
      expect(() => svc.removeEdge('bad-id', 'a', 'b')).toThrow('Graph not found');
    });

    it('getEdges throws for invalid graph ID', () => {
      expect(() => svc.getEdges('bad-id')).toThrow('Graph not found');
    });

    it('getNeighbors throws for invalid graph ID', () => {
      expect(() => svc.getNeighbors('bad-id', 'x')).toThrow('Graph not found');
    });

    it('detectCycles throws for invalid graph ID', () => {
      expect(() => svc.detectCycles('bad-id')).toThrow('Graph not found');
    });

    it('buildGraphContext throws for invalid graph ID', () => {
      expect(() => svc.buildGraphContext('bad-id')).toThrow('Graph not found');
    });

    it('save throws for invalid graph ID', () => {
      expect(() => svc.save('bad-id')).toThrow('Graph not found');
    });
  });
});
