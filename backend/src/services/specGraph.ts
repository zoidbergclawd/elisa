/** SpecGraph service: manages a directed graph of NuggetSpecs with JSON persistence. */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { NuggetSpec } from '../utils/specValidator.js';
import type {
  SpecGraph,
  SpecGraphNode,
  SpecGraphEdge,
  SpecGraphPersistence,
} from '../models/specGraph.js';

const PERSISTENCE_VERSION = 1;
const SPEC_GRAPH_FILENAME = 'spec-graph.json';

export class SpecGraphService {
  private graphs = new Map<string, SpecGraph>();

  /** Create a new empty graph for the given workspace. Returns graph_id. */
  create(workspacePath: string): string {
    const id = crypto.randomUUID();
    const now = Date.now();
    const graph: SpecGraph = {
      id,
      nodes: [],
      edges: [],
      workspace_path: workspacePath,
      created_at: now,
      updated_at: now,
    };
    this.graphs.set(id, graph);
    return id;
  }

  /** Load a graph from the workspace's .elisa/spec-graph.json. Returns null if not found or invalid. */
  load(workspacePath: string): SpecGraph | null {
    const filePath = path.join(workspacePath, '.elisa', SPEC_GRAPH_FILENAME);
    try {
      if (!fs.existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw) as SpecGraphPersistence;

      // Validate basic structure
      if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
        console.warn('SpecGraph: invalid persistence format in', filePath);
        return null;
      }

      const id = crypto.randomUUID();
      const graph: SpecGraph = {
        id,
        nodes: data.nodes,
        edges: data.edges,
        workspace_path: workspacePath,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
      this.graphs.set(id, graph);
      return graph;
    } catch (err) {
      console.warn('SpecGraph: failed to load from', filePath, (err as Error).message);
      return null;
    }
  }

  /** Persist graph to workspace's .elisa/spec-graph.json using atomic write. */
  save(graphId: string): void {
    const graph = this.graphs.get(graphId);
    if (!graph) throw new Error(`Graph not found: ${graphId}`);

    const dir = path.join(graph.workspace_path, '.elisa');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filePath = path.join(dir, SPEC_GRAPH_FILENAME);
    const tmpPath = filePath + '.tmp';

    const data: SpecGraphPersistence = {
      version: PERSISTENCE_VERSION,
      nodes: graph.nodes,
      edges: graph.edges,
      created_at: graph.created_at,
      updated_at: graph.updated_at,
    };

    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    // Atomic rename (cross-platform safe: copy + unlink)
    fs.copyFileSync(tmpPath, filePath);
    fs.unlinkSync(tmpPath);
  }

  /** Add a node to the graph. Returns node_id. */
  addNode(graphId: string, spec: NuggetSpec, label: string): string {
    const graph = this.graphs.get(graphId);
    if (!graph) throw new Error(`Graph not found: ${graphId}`);

    const nodeId = crypto.randomUUID();
    const now = Date.now();
    const node: SpecGraphNode = {
      id: nodeId,
      nugget_spec: spec,
      label,
      created_at: now,
      updated_at: now,
    };
    graph.nodes.push(node);
    graph.updated_at = now;
    return nodeId;
  }

  /** Remove a node and all its connected edges. Returns true if the node was found. */
  removeNode(graphId: string, nodeId: string): boolean {
    const graph = this.graphs.get(graphId);
    if (!graph) throw new Error(`Graph not found: ${graphId}`);

    const idx = graph.nodes.findIndex((n) => n.id === nodeId);
    if (idx === -1) return false;

    graph.nodes.splice(idx, 1);
    // Remove all edges connected to this node
    graph.edges = graph.edges.filter(
      (e) => e.from_id !== nodeId && e.to_id !== nodeId,
    );
    graph.updated_at = Date.now();
    return true;
  }

  /** Get a single node by ID. */
  getNode(graphId: string, nodeId: string): SpecGraphNode | undefined {
    const graph = this.graphs.get(graphId);
    if (!graph) throw new Error(`Graph not found: ${graphId}`);
    return graph.nodes.find((n) => n.id === nodeId);
  }

  /** Get all nodes in the graph. */
  getNodes(graphId: string): SpecGraphNode[] {
    const graph = this.graphs.get(graphId);
    if (!graph) throw new Error(`Graph not found: ${graphId}`);
    return graph.nodes;
  }

  /** Update a node's NuggetSpec and optionally its label. Returns true if the node was found. */
  updateNode(graphId: string, nodeId: string, spec: NuggetSpec, label?: string): boolean {
    const graph = this.graphs.get(graphId);
    if (!graph) throw new Error(`Graph not found: ${graphId}`);

    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) return false;

    node.nugget_spec = spec;
    if (label !== undefined) {
      node.label = label;
    }
    node.updated_at = Date.now();
    graph.updated_at = Date.now();
    return true;
  }

  /** Add an edge to the graph. Throws on self-edges or duplicates. */
  addEdge(graphId: string, edge: SpecGraphEdge): void {
    const graph = this.graphs.get(graphId);
    if (!graph) throw new Error(`Graph not found: ${graphId}`);

    if (edge.from_id === edge.to_id) {
      throw new Error('Self-edges are not allowed');
    }

    const duplicate = graph.edges.some(
      (e) =>
        e.from_id === edge.from_id &&
        e.to_id === edge.to_id &&
        e.relationship === edge.relationship,
    );
    if (duplicate) {
      throw new Error('Duplicate edge already exists');
    }

    graph.edges.push({ ...edge });
    graph.updated_at = Date.now();
  }

  /** Remove an edge between two nodes. Returns true if found and removed. */
  removeEdge(graphId: string, fromId: string, toId: string): boolean {
    const graph = this.graphs.get(graphId);
    if (!graph) throw new Error(`Graph not found: ${graphId}`);

    const idx = graph.edges.findIndex(
      (e) => e.from_id === fromId && e.to_id === toId,
    );
    if (idx === -1) return false;

    graph.edges.splice(idx, 1);
    graph.updated_at = Date.now();
    return true;
  }

  /** Get all edges in the graph. */
  getEdges(graphId: string): SpecGraphEdge[] {
    const graph = this.graphs.get(graphId);
    if (!graph) throw new Error(`Graph not found: ${graphId}`);
    return graph.edges;
  }

  /** Get incoming and outgoing neighbors for a node. */
  getNeighbors(
    graphId: string,
    nodeId: string,
  ): { incoming: SpecGraphNode[]; outgoing: SpecGraphNode[] } {
    const graph = this.graphs.get(graphId);
    if (!graph) throw new Error(`Graph not found: ${graphId}`);

    const incoming: SpecGraphNode[] = [];
    const outgoing: SpecGraphNode[] = [];

    for (const edge of graph.edges) {
      if (edge.to_id === nodeId) {
        const node = graph.nodes.find((n) => n.id === edge.from_id);
        if (node) incoming.push(node);
      }
      if (edge.from_id === nodeId) {
        const node = graph.nodes.find((n) => n.id === edge.to_id);
        if (node) outgoing.push(node);
      }
    }

    return { incoming, outgoing };
  }

  /**
   * Detect cycles using DFS with 3-color marking.
   * White = unvisited, Gray = in-progress, Black = done.
   * Returns true if cycles are detected.
   */
  detectCycles(graphId: string): boolean {
    const graph = this.graphs.get(graphId);
    if (!graph) throw new Error(`Graph not found: ${graphId}`);

    const WHITE = 0;
    const GRAY = 1;
    const BLACK = 2;

    const color = new Map<string, number>();
    for (const node of graph.nodes) {
      color.set(node.id, WHITE);
    }

    // Build adjacency list
    const adj = new Map<string, string[]>();
    for (const node of graph.nodes) {
      adj.set(node.id, []);
    }
    for (const edge of graph.edges) {
      const list = adj.get(edge.from_id);
      if (list) list.push(edge.to_id);
    }

    const dfs = (nodeId: string): boolean => {
      color.set(nodeId, GRAY);
      const neighbors = adj.get(nodeId) ?? [];
      for (const neighbor of neighbors) {
        const c = color.get(neighbor);
        if (c === GRAY) return true; // Back edge -> cycle
        if (c === WHITE && dfs(neighbor)) return true;
      }
      color.set(nodeId, BLACK);
      return false;
    };

    for (const node of graph.nodes) {
      if (color.get(node.id) === WHITE) {
        if (dfs(node.id)) return true;
      }
    }

    return false;
  }

  /** Get a graph by ID. */
  getGraph(graphId: string): SpecGraph | undefined {
    return this.graphs.get(graphId);
  }

  /** Delete a graph from memory. Returns true if found. */
  deleteGraph(graphId: string): boolean {
    return this.graphs.delete(graphId);
  }

  /**
   * Build a human-readable context string summarizing the graph,
   * suitable for injection into MetaPlanner prompts.
   * Optionally exclude a specific node (the one being planned for).
   */
  buildGraphContext(graphId: string, excludeNodeId?: string): string {
    const graph = this.graphs.get(graphId);
    if (!graph) throw new Error(`Graph not found: ${graphId}`);

    if (graph.nodes.length === 0) {
      return 'The spec graph is empty. No existing nuggets.';
    }

    const lines: string[] = ['## Spec Graph Context', ''];

    // Nodes section
    lines.push(`### Existing Nuggets (${graph.nodes.length})`);
    for (const node of graph.nodes) {
      if (node.id === excludeNodeId) continue;
      const goal = node.nugget_spec.nugget?.goal ?? '(no goal)';
      lines.push(`- **${node.label}** [${node.id.slice(0, 8)}]: ${goal}`);
    }
    lines.push('');

    // Edges section
    const relevantEdges = excludeNodeId
      ? graph.edges.filter(
          (e) => e.from_id !== excludeNodeId && e.to_id !== excludeNodeId,
        )
      : graph.edges;

    if (relevantEdges.length > 0) {
      lines.push(`### Relationships (${relevantEdges.length})`);
      for (const edge of relevantEdges) {
        const fromNode = graph.nodes.find((n) => n.id === edge.from_id);
        const toNode = graph.nodes.find((n) => n.id === edge.to_id);
        const fromLabel = fromNode?.label ?? edge.from_id.slice(0, 8);
        const toLabel = toNode?.label ?? edge.to_id.slice(0, 8);
        const desc = edge.description ? ` (${edge.description})` : '';
        lines.push(`- ${fromLabel} --[${edge.relationship}]--> ${toLabel}${desc}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
