/** CompositionService: orchestrates nugget composition and detects emergent behavior patterns. */

import type { NuggetSpec } from '../utils/specValidator.js';
import type { SpecGraphService } from './specGraph.js';
import type { SystemLevel } from './systemLevelService.js';
import { getMaxNuggets } from './systemLevelService.js';
import type {
  ComposeResult,
  EmergentBehavior,
  InterfaceContract,
  ImpactResult,
  AffectedNode,
} from '../models/composition.js';

export class CompositionService {
  constructor(private specGraphService: SpecGraphService) {}

  /**
   * Compose multiple nugget nodes into a single merged NuggetSpec.
   * Validates the composition, resolves interfaces, detects emergence,
   * and merges all spec fields from the selected nodes.
   */
  compose(graphId: string, nodeIds: string[], systemLevel?: SystemLevel): ComposeResult {
    const validation = this.validateComposition(graphId, nodeIds, systemLevel);
    if (!validation.valid) {
      throw new Error(`Invalid composition: ${validation.issues.join('; ')}`);
    }

    const contracts = this.resolveInterfaces(graphId, nodeIds);
    const emergent = this.detectEmergence(graphId, nodeIds);
    const warnings: string[] = [];

    // Collect all nodes
    const nodes = nodeIds.map((id) => {
      const node = this.specGraphService.getNode(graphId, id);
      // Validation already checked existence, but satisfy TS
      if (!node) throw new Error(`Node not found: ${id}`);
      return node;
    });

    // Detect unmet requirements: requires with no matching provides
    const allProvides = new Set<string>();
    for (const node of nodes) {
      const provides = node.nugget_spec.composition?.provides;
      if (provides) {
        for (const p of provides) {
          allProvides.add(`${p.name}:${p.type}`);
        }
      }
    }
    for (const node of nodes) {
      const requires = node.nugget_spec.composition?.requires;
      if (requires) {
        for (const r of requires) {
          const key = `${r.name}:${r.type}`;
          if (!allProvides.has(key)) {
            warnings.push(`Unmet requirement: "${r.name}" (type: ${r.type}) required by "${node.label}"`);
          }
        }
      }
    }

    // Merge specs from all nodes into a composed NuggetSpec
    const composedSpec = this.mergeSpecs(nodes.map((n) => n.nugget_spec), nodes.map((n) => n.label));

    return {
      composed_spec: composedSpec,
      emergent_behaviors: emergent,
      interface_contracts: contracts,
      warnings,
    };
  }

  /**
   * Detect emergent behavior patterns among selected nodes based on
   * their composition provides/requires arrays.
   *
   * Patterns detected:
   * - feedback_loop: Node A provides to B and B provides to A (or longer cycles)
   * - pipeline: A->B->C chain of 3+ nodes via provides/requires
   * - hub: One node provides to 3+ other nodes
   */
  detectEmergence(graphId: string, nodeIds: string[]): EmergentBehavior[] {
    const behaviors: EmergentBehavior[] = [];
    const nodeSet = new Set(nodeIds);

    // Build a provides->requires adjacency map among selected nodes.
    // An edge from A to B means A provides something that B requires.
    const adj = new Map<string, Set<string>>();
    for (const id of nodeIds) {
      adj.set(id, new Set());
    }

    const nodes = nodeIds.map((id) => {
      const node = this.specGraphService.getNode(graphId, id);
      if (!node) throw new Error(`Node not found: ${id}`);
      return node;
    });

    // Build adjacency: for each node's provides, find which other selected nodes require it
    for (const provider of nodes) {
      const provides = provider.nugget_spec.composition?.provides;
      if (!provides) continue;
      for (const p of provides) {
        for (const consumer of nodes) {
          if (consumer.id === provider.id) continue;
          const requires = consumer.nugget_spec.composition?.requires;
          if (!requires) continue;
          for (const r of requires) {
            if (r.name === p.name && r.type === p.type) {
              adj.get(provider.id)!.add(consumer.id);
            }
          }
        }
      }
    }

    // Detect feedback loops: find cycles in the adjacency graph
    const feedbackCycles = this.findCycles(adj, nodeIds);
    for (const cycle of feedbackCycles) {
      const labels = cycle.map((id) => {
        const node = nodes.find((n) => n.id === id);
        return node?.label ?? id;
      });
      behaviors.push({
        description: `Feedback loop detected: ${labels.join(' <-> ')}`,
        contributing_nodes: cycle,
        detected_pattern: 'feedback_loop',
      });
    }

    // Detect pipelines: chains of 3+ nodes where A->B->C
    const pipelines = this.findPipelines(adj, nodeIds);
    for (const pipeline of pipelines) {
      const labels = pipeline.map((id) => {
        const node = nodes.find((n) => n.id === id);
        return node?.label ?? id;
      });
      behaviors.push({
        description: `Pipeline detected: ${labels.join(' -> ')}`,
        contributing_nodes: pipeline,
        detected_pattern: 'pipeline',
      });
    }

    // Detect hubs: a node that provides to 3+ other nodes
    for (const [nodeId, consumers] of adj) {
      if (consumers.size >= 3) {
        const hubNode = nodes.find((n) => n.id === nodeId);
        const hubLabel = hubNode?.label ?? nodeId;
        const consumerIds = [...consumers];
        behaviors.push({
          description: `Hub detected: "${hubLabel}" provides to ${consumers.size} other nodes`,
          contributing_nodes: [nodeId, ...consumerIds],
          detected_pattern: 'hub',
        });
      }
    }

    return behaviors;
  }

  /**
   * Resolve interface contracts among selected nodes.
   * For each node's composition.requires, find which selected node's
   * composition.provides satisfies it (match by name and type).
   */
  resolveInterfaces(graphId: string, nodeIds: string[]): InterfaceContract[] {
    const contracts: InterfaceContract[] = [];

    const nodes = nodeIds.map((id) => {
      const node = this.specGraphService.getNode(graphId, id);
      if (!node) throw new Error(`Node not found: ${id}`);
      return node;
    });

    for (const consumer of nodes) {
      const requires = consumer.nugget_spec.composition?.requires;
      if (!requires) continue;

      for (const req of requires) {
        // Find a provider among selected nodes
        for (const provider of nodes) {
          if (provider.id === consumer.id) continue;
          const provides = provider.nugget_spec.composition?.provides;
          if (!provides) continue;

          for (const prov of provides) {
            if (prov.name === req.name && prov.type === req.type) {
              contracts.push({
                provider_node_id: provider.id,
                consumer_node_id: consumer.id,
                interface_name: req.name,
                type: req.type,
              });
            }
          }
        }
      }
    }

    return contracts;
  }

  /**
   * Validate a composition before execution.
   * Checks: non-empty nodeIds, level gating, node existence, no cycles.
   */
  validateComposition(
    graphId: string,
    nodeIds: string[],
    systemLevel?: SystemLevel,
  ): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    if (nodeIds.length === 0) {
      issues.push('No nodes selected for composition');
      return { valid: false, issues };
    }

    const level = systemLevel ?? 'architect';
    const max = getMaxNuggets(level);
    if (nodeIds.length > max) {
      issues.push(
        `Too many nodes for ${level} level: ${nodeIds.length} selected, maximum is ${max}`,
      );
    }

    // Check all nodes exist
    for (const nodeId of nodeIds) {
      const node = this.specGraphService.getNode(graphId, nodeId);
      if (!node) {
        issues.push(`Node not found: ${nodeId}`);
      }
    }

    // Check no cycles among selected nodes in the spec graph edges
    if (issues.length === 0) {
      const hasCycles = this.detectCyclesAmongNodes(graphId, nodeIds);
      if (hasCycles) {
        issues.push('Cycle detected among selected nodes in the spec graph');
      }
    }

    return { valid: issues.length === 0, issues };
  }

  /**
   * Detect the impact of changing a node on other nodes in the graph.
   * Finds consumers (via edges and composition.requires) and assigns severity.
   */
  detectCrossNuggetImpact(graphId: string, changedNodeId: string): ImpactResult {
    const affectedNodes: AffectedNode[] = [];

    const changedNode = this.specGraphService.getNode(graphId, changedNodeId);
    if (!changedNode) {
      throw new Error(`Node not found: ${changedNodeId}`);
    }

    // Find all nodes that depend on the changed node via edges
    const edges = this.specGraphService.getEdges(graphId);
    const edgeConsumerIds = new Set<string>();
    for (const edge of edges) {
      if (edge.from_id === changedNodeId) {
        edgeConsumerIds.add(edge.to_id);
      }
    }

    // Find all nodes that require something the changed node provides (via composition)
    const allNodes = this.specGraphService.getNodes(graphId);
    const changedProvides = changedNode.nugget_spec.composition?.provides;
    const provideKeys = new Set<string>();
    if (changedProvides) {
      for (const p of changedProvides) {
        provideKeys.add(`${p.name}:${p.type}`);
      }
    }

    for (const node of allNodes) {
      if (node.id === changedNodeId) continue;

      const requires = node.nugget_spec.composition?.requires;
      if (requires) {
        for (const r of requires) {
          const key = `${r.name}:${r.type}`;
          if (provideKeys.has(key) && !edgeConsumerIds.has(node.id)) {
            affectedNodes.push({
              node_id: node.id,
              label: node.label,
              reason: `Requires "${r.name}" (type: ${r.type}) provided by changed node`,
            });
          }
        }
      }
    }

    // Add edge-based consumers
    for (const consumerId of edgeConsumerIds) {
      const node = this.specGraphService.getNode(graphId, consumerId);
      if (node) {
        affectedNodes.push({
          node_id: node.id,
          label: node.label,
          reason: `Connected via edge from changed node`,
        });
      }
    }

    // Determine severity
    let severity: 'none' | 'minor' | 'breaking';
    if (affectedNodes.length === 0) {
      severity = 'none';
    } else if (edgeConsumerIds.size > 0) {
      severity = 'breaking';
    } else {
      severity = 'minor';
    }

    return { affected_nodes: affectedNodes, severity };
  }

  // --- Private helpers ---

  /**
   * Detect cycles among a subset of nodes using DFS on the spec graph edges.
   * Only considers edges where both from_id and to_id are in the nodeIds set.
   */
  private detectCyclesAmongNodes(graphId: string, nodeIds: string[]): boolean {
    const nodeSet = new Set(nodeIds);
    const edges = this.specGraphService.getEdges(graphId);

    // Build adjacency list restricted to selected nodes
    const adj = new Map<string, string[]>();
    for (const id of nodeIds) {
      adj.set(id, []);
    }
    for (const edge of edges) {
      if (nodeSet.has(edge.from_id) && nodeSet.has(edge.to_id)) {
        adj.get(edge.from_id)!.push(edge.to_id);
      }
    }

    // 3-color DFS
    const WHITE = 0;
    const GRAY = 1;
    const BLACK = 2;
    const color = new Map<string, number>();
    for (const id of nodeIds) {
      color.set(id, WHITE);
    }

    const dfs = (nodeId: string): boolean => {
      color.set(nodeId, GRAY);
      for (const neighbor of adj.get(nodeId) ?? []) {
        const c = color.get(neighbor);
        if (c === GRAY) return true;
        if (c === WHITE && dfs(neighbor)) return true;
      }
      color.set(nodeId, BLACK);
      return false;
    };

    for (const id of nodeIds) {
      if (color.get(id) === WHITE) {
        if (dfs(id)) return true;
      }
    }

    return false;
  }

  /**
   * Find all cycles in the provides/requires adjacency graph.
   * Returns arrays of node IDs forming each cycle.
   */
  private findCycles(adj: Map<string, Set<string>>, nodeIds: string[]): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const path: string[] = [];

    const dfs = (nodeId: string): void => {
      visited.add(nodeId);
      inStack.add(nodeId);
      path.push(nodeId);

      for (const neighbor of adj.get(nodeId) ?? []) {
        if (inStack.has(neighbor)) {
          // Found a cycle: extract cycle from path
          const cycleStart = path.indexOf(neighbor);
          const cycle = path.slice(cycleStart);
          // Only add if we haven't already recorded this cycle (by sorted nodes)
          const sorted = [...cycle].sort().join(',');
          const alreadyFound = cycles.some((c) => [...c].sort().join(',') === sorted);
          if (!alreadyFound) {
            cycles.push(cycle);
          }
        } else if (!visited.has(neighbor)) {
          dfs(neighbor);
        }
      }

      path.pop();
      inStack.delete(nodeId);
    };

    for (const id of nodeIds) {
      if (!visited.has(id)) {
        dfs(id);
      }
    }

    return cycles;
  }

  /**
   * Find pipeline chains (3+ nodes) in the adjacency graph.
   * A pipeline is a linear chain A->B->C where each node has exactly
   * one relevant outgoing edge in the chain.
   */
  private findPipelines(adj: Map<string, Set<string>>, nodeIds: string[]): string[][] {
    const pipelines: string[][] = [];

    // Build reverse adjacency to find chain starts (nodes with no incoming edges)
    const hasIncoming = new Set<string>();
    for (const [, targets] of adj) {
      for (const t of targets) {
        hasIncoming.add(t);
      }
    }

    // Start from nodes that have no incoming edges (chain roots)
    const roots = nodeIds.filter((id) => !hasIncoming.has(id));

    // Also consider all nodes as potential chain starts to catch
    // chains within cycles (though those will be reported as feedback loops)
    const starts = roots.length > 0 ? roots : nodeIds;

    for (const start of starts) {
      const chain: string[] = [start];
      const visited = new Set<string>([start]);
      let current = start;

      while (true) {
        const neighbors = adj.get(current);
        if (!neighbors || neighbors.size === 0) break;

        // Follow the chain -- take the first unvisited neighbor
        let next: string | null = null;
        for (const n of neighbors) {
          if (!visited.has(n)) {
            next = n;
            break;
          }
        }

        if (!next) break;
        visited.add(next);
        chain.push(next);
        current = next;
      }

      if (chain.length >= 3) {
        // Check this pipeline hasn't already been recorded as a subset
        const key = chain.join(',');
        const alreadyFound = pipelines.some((p) => p.join(',') === key);
        if (!alreadyFound) {
          pipelines.push(chain);
        }
      }
    }

    return pipelines;
  }

  /**
   * Merge multiple NuggetSpecs into a single composed spec.
   * Combines requirements, behavioral_tests, skills, rules, and portals.
   */
  private mergeSpecs(specs: NuggetSpec[], labels: string[]): NuggetSpec {
    const combinedGoal = labels.join(' + ');

    const mergedRequirements: NuggetSpec['requirements'] = [];
    const mergedBehavioralTests: NonNullable<NuggetSpec['workflow']>['behavioral_tests'] = [];
    const mergedSkills: NuggetSpec['skills'] = [];
    const mergedRules: NuggetSpec['rules'] = [];
    const mergedPortals: NuggetSpec['portals'] = [];

    for (const spec of specs) {
      if (spec.requirements) {
        mergedRequirements.push(...spec.requirements);
      }
      if (spec.workflow?.behavioral_tests) {
        mergedBehavioralTests.push(...spec.workflow.behavioral_tests);
      }
      if (spec.skills) {
        mergedSkills.push(...spec.skills);
      }
      if (spec.rules) {
        mergedRules.push(...spec.rules);
      }
      if (spec.portals) {
        mergedPortals.push(...spec.portals);
      }
    }

    const composed: NuggetSpec = {
      nugget: { goal: combinedGoal },
    };

    if (mergedRequirements.length > 0) {
      composed.requirements = mergedRequirements;
    }
    if (mergedBehavioralTests.length > 0) {
      composed.workflow = { behavioral_tests: mergedBehavioralTests };
    }
    if (mergedSkills.length > 0) {
      composed.skills = mergedSkills;
    }
    if (mergedRules.length > 0) {
      composed.rules = mergedRules;
    }
    if (mergedPortals.length > 0) {
      composed.portals = mergedPortals;
    }

    return composed;
  }
}
