import { describe, it, expect, beforeEach } from 'vitest';
import { SpecGraphService } from '../services/specGraph.js';
import { CompositionService } from '../services/compositionService.js';
import type { NuggetSpec } from '../utils/specValidator.js';

/** Minimal NuggetSpec fixtures with composition fields. */
const specSnakeMovement: NuggetSpec = {
  nugget: { goal: 'Snake movement' },
  composition: {
    provides: [{ name: 'snake_position', type: 'coordinate' }],
  },
};

const specFoodSpawner: NuggetSpec = {
  nugget: { goal: 'Food spawner' },
  composition: {
    requires: [{ name: 'snake_position', type: 'coordinate' }],
    provides: [{ name: 'food_position', type: 'coordinate' }],
  },
};

const specScoreTracker: NuggetSpec = {
  nugget: { goal: 'Score tracker' },
  composition: {
    requires: [{ name: 'food_position', type: 'coordinate' }],
    provides: [{ name: 'score', type: 'number' }],
  },
};

/** Spec that requires snake_position AND provides back to snake (feedback loop). */
const specCollisionDetector: NuggetSpec = {
  nugget: { goal: 'Collision detector' },
  composition: {
    requires: [{ name: 'snake_position', type: 'coordinate' }],
    provides: [{ name: 'collision_event', type: 'event' }],
  },
};

/** Spec that requires collision_event and provides snake_position (completing a loop). */
const specSnakeController: NuggetSpec = {
  nugget: { goal: 'Snake controller' },
  composition: {
    requires: [{ name: 'collision_event', type: 'event' }],
    provides: [{ name: 'snake_position', type: 'coordinate' }],
  },
};

/** Hub spec that provides to many consumers. */
const specGameState: NuggetSpec = {
  nugget: { goal: 'Game state manager' },
  composition: {
    provides: [{ name: 'game_state', type: 'state' }],
  },
};

const specRenderer: NuggetSpec = {
  nugget: { goal: 'Renderer' },
  composition: {
    requires: [{ name: 'game_state', type: 'state' }],
  },
};

const specSoundEngine: NuggetSpec = {
  nugget: { goal: 'Sound engine' },
  composition: {
    requires: [{ name: 'game_state', type: 'state' }],
  },
};

const specHUD: NuggetSpec = {
  nugget: { goal: 'HUD display' },
  composition: {
    requires: [{ name: 'game_state', type: 'state' }],
  },
};

/** Spec with requirements and behavioral tests for merge testing. */
const specWithExtras: NuggetSpec = {
  nugget: { goal: 'Feature with extras' },
  requirements: [{ type: 'functional', description: 'Must handle input' }],
  workflow: {
    behavioral_tests: [{ when: 'user presses up', then: 'snake moves up' }],
  },
  skills: [{ name: 'movement', description: 'Handles movement' }],
  rules: [{ name: 'boundary', trigger: 'hit_wall' }],
  portals: [{ name: 'keyboard', mechanism: 'cli' }],
};

/** Spec without composition fields. */
const specPlain: NuggetSpec = {
  nugget: { goal: 'Plain nugget' },
};

describe('CompositionService', () => {
  let graphService: SpecGraphService;
  let service: CompositionService;
  let graphId: string;

  beforeEach(() => {
    graphService = new SpecGraphService();
    service = new CompositionService(graphService);
    graphId = graphService.create('/tmp/test-workspace');
  });

  // --- compose ---

  describe('compose', () => {
    it('composes two nodes with matched provides/requires', () => {
      const nodeA = graphService.addNode(graphId, specSnakeMovement, 'Snake Movement');
      const nodeB = graphService.addNode(graphId, specFoodSpawner, 'Food Spawner');

      const result = service.compose(graphId, [nodeA, nodeB]);

      expect(result.composed_spec.nugget?.goal).toBe('Snake Movement + Food Spawner');
      expect(result.interface_contracts).toHaveLength(1);
      expect(result.interface_contracts[0].interface_name).toBe('snake_position');
      expect(result.interface_contracts[0].provider_node_id).toBe(nodeA);
      expect(result.interface_contracts[0].consumer_node_id).toBe(nodeB);
      expect(result.warnings).toHaveLength(0);
    });

    it('composes three nodes in a pipeline', () => {
      const nodeA = graphService.addNode(graphId, specSnakeMovement, 'Snake Movement');
      const nodeB = graphService.addNode(graphId, specFoodSpawner, 'Food Spawner');
      const nodeC = graphService.addNode(graphId, specScoreTracker, 'Score Tracker');

      const result = service.compose(graphId, [nodeA, nodeB, nodeC]);

      expect(result.composed_spec.nugget?.goal).toBe(
        'Snake Movement + Food Spawner + Score Tracker',
      );
      expect(result.interface_contracts).toHaveLength(2);
      expect(result.warnings).toHaveLength(0);
    });

    it('merges requirements, behavioral_tests, skills, rules, and portals', () => {
      const specB: NuggetSpec = {
        nugget: { goal: 'Second feature' },
        requirements: [{ type: 'performance', description: 'Must be fast' }],
        workflow: {
          behavioral_tests: [{ when: 'user clicks button', then: 'action fires' }],
        },
        skills: [{ name: 'interaction', description: 'Handles clicks' }],
        rules: [{ name: 'speed', trigger: 'slow_response' }],
        portals: [{ name: 'mouse', mechanism: 'cli' }],
      };

      const nodeA = graphService.addNode(graphId, specWithExtras, 'Feature A');
      const nodeB = graphService.addNode(graphId, specB, 'Feature B');

      const result = service.compose(graphId, [nodeA, nodeB]);

      expect(result.composed_spec.requirements).toHaveLength(2);
      expect(result.composed_spec.workflow?.behavioral_tests).toHaveLength(2);
      expect(result.composed_spec.skills).toHaveLength(2);
      expect(result.composed_spec.rules).toHaveLength(2);
      expect(result.composed_spec.portals).toHaveLength(2);
    });

    it('adds warnings for unmet requirements', () => {
      // scoreTracker requires food_position but no node provides it
      const nodeA = graphService.addNode(graphId, specSnakeMovement, 'Snake Movement');
      const nodeC = graphService.addNode(graphId, specScoreTracker, 'Score Tracker');

      const result = service.compose(graphId, [nodeA, nodeC]);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('food_position');
    });

    it('throws when validation fails', () => {
      expect(() => service.compose(graphId, [])).toThrow('Invalid composition');
    });
  });

  // --- emergence detection ---

  describe('detectEmergence', () => {
    it('detects a feedback loop between two nodes', () => {
      // collisionDetector requires snake_position, provides collision_event
      // snakeController requires collision_event, provides snake_position
      const nodeA = graphService.addNode(graphId, specCollisionDetector, 'Collision Detector');
      const nodeB = graphService.addNode(graphId, specSnakeController, 'Snake Controller');

      const behaviors = service.detectEmergence(graphId, [nodeA, nodeB]);

      const loops = behaviors.filter((b) => b.detected_pattern === 'feedback_loop');
      expect(loops.length).toBeGreaterThan(0);
      expect(loops[0].contributing_nodes).toContain(nodeA);
      expect(loops[0].contributing_nodes).toContain(nodeB);
    });

    it('detects a pipeline of 3+ nodes', () => {
      const nodeA = graphService.addNode(graphId, specSnakeMovement, 'Snake Movement');
      const nodeB = graphService.addNode(graphId, specFoodSpawner, 'Food Spawner');
      const nodeC = graphService.addNode(graphId, specScoreTracker, 'Score Tracker');

      const behaviors = service.detectEmergence(graphId, [nodeA, nodeB, nodeC]);

      const pipelines = behaviors.filter((b) => b.detected_pattern === 'pipeline');
      expect(pipelines.length).toBeGreaterThan(0);
      expect(pipelines[0].contributing_nodes).toHaveLength(3);
    });

    it('detects a hub pattern (1 provider, 3+ consumers)', () => {
      const nodeHub = graphService.addNode(graphId, specGameState, 'Game State');
      const nodeR = graphService.addNode(graphId, specRenderer, 'Renderer');
      const nodeS = graphService.addNode(graphId, specSoundEngine, 'Sound Engine');
      const nodeH = graphService.addNode(graphId, specHUD, 'HUD');

      const behaviors = service.detectEmergence(graphId, [nodeHub, nodeR, nodeS, nodeH]);

      const hubs = behaviors.filter((b) => b.detected_pattern === 'hub');
      expect(hubs.length).toBeGreaterThan(0);
      expect(hubs[0].contributing_nodes).toContain(nodeHub);
      expect(hubs[0].contributing_nodes.length).toBe(4); // hub + 3 consumers
    });

    it('returns empty array when no patterns exist', () => {
      const nodeA = graphService.addNode(graphId, specPlain, 'Plain A');
      const nodeB = graphService.addNode(graphId, specPlain, 'Plain B');

      const behaviors = service.detectEmergence(graphId, [nodeA, nodeB]);

      expect(behaviors).toHaveLength(0);
    });
  });

  // --- interface resolution ---

  describe('resolveInterfaces', () => {
    it('resolves matched interfaces between nodes', () => {
      const nodeA = graphService.addNode(graphId, specSnakeMovement, 'Snake Movement');
      const nodeB = graphService.addNode(graphId, specFoodSpawner, 'Food Spawner');

      const contracts = service.resolveInterfaces(graphId, [nodeA, nodeB]);

      expect(contracts).toHaveLength(1);
      expect(contracts[0]).toEqual({
        provider_node_id: nodeA,
        consumer_node_id: nodeB,
        interface_name: 'snake_position',
        type: 'coordinate',
      });
    });

    it('returns empty array when no interfaces match', () => {
      const nodeA = graphService.addNode(graphId, specSnakeMovement, 'Snake Movement');
      const nodeC = graphService.addNode(graphId, specScoreTracker, 'Score Tracker');

      // snake_position does not match food_position requirement
      const contracts = service.resolveInterfaces(graphId, [nodeA, nodeC]);

      expect(contracts).toHaveLength(0);
    });

    it('resolves multiple interfaces in a chain', () => {
      const nodeA = graphService.addNode(graphId, specSnakeMovement, 'Snake Movement');
      const nodeB = graphService.addNode(graphId, specFoodSpawner, 'Food Spawner');
      const nodeC = graphService.addNode(graphId, specScoreTracker, 'Score Tracker');

      const contracts = service.resolveInterfaces(graphId, [nodeA, nodeB, nodeC]);

      expect(contracts).toHaveLength(2);
      const names = contracts.map((c) => c.interface_name);
      expect(names).toContain('snake_position');
      expect(names).toContain('food_position');
    });
  });

  // --- validation ---

  describe('validateComposition', () => {
    it('returns invalid for empty nodeIds', () => {
      const result = service.validateComposition(graphId, []);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('No nodes selected for composition');
    });

    it('returns invalid when explorer level exceeds max nuggets', () => {
      const nodeA = graphService.addNode(graphId, specSnakeMovement, 'A');
      const nodeB = graphService.addNode(graphId, specFoodSpawner, 'B');

      // Explorer max is 1
      const result = service.validateComposition(graphId, [nodeA, nodeB], 'explorer');

      expect(result.valid).toBe(false);
      expect(result.issues[0]).toContain('Too many nodes');
      expect(result.issues[0]).toContain('explorer');
    });

    it('returns invalid when nodes do not exist', () => {
      const result = service.validateComposition(graphId, ['nonexistent-id']);

      expect(result.valid).toBe(false);
      expect(result.issues[0]).toContain('Node not found');
    });

    it('returns valid for a proper composition', () => {
      const nodeA = graphService.addNode(graphId, specSnakeMovement, 'A');
      const nodeB = graphService.addNode(graphId, specFoodSpawner, 'B');

      const result = service.validateComposition(graphId, [nodeA, nodeB], 'builder');

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('returns invalid when cycles exist among selected nodes', () => {
      const nodeA = graphService.addNode(graphId, specSnakeMovement, 'A');
      const nodeB = graphService.addNode(graphId, specFoodSpawner, 'B');

      // Create a cycle via spec graph edges
      graphService.addEdge(graphId, {
        from_id: nodeA,
        to_id: nodeB,
        relationship: 'depends_on',
      });
      graphService.addEdge(graphId, {
        from_id: nodeB,
        to_id: nodeA,
        relationship: 'depends_on',
      });

      const result = service.validateComposition(graphId, [nodeA, nodeB]);

      expect(result.valid).toBe(false);
      expect(result.issues[0]).toContain('Cycle detected');
    });

    it('allows architect level with many nodes', () => {
      const ids: string[] = [];
      for (let i = 0; i < 10; i++) {
        ids.push(graphService.addNode(graphId, specPlain, `Node ${i}`));
      }

      const result = service.validateComposition(graphId, ids, 'architect');

      expect(result.valid).toBe(true);
    });

    it('allows builder level with up to 3 nodes', () => {
      const nodeA = graphService.addNode(graphId, specPlain, 'A');
      const nodeB = graphService.addNode(graphId, specPlain, 'B');
      const nodeC = graphService.addNode(graphId, specPlain, 'C');

      const result = service.validateComposition(graphId, [nodeA, nodeB, nodeC], 'builder');

      expect(result.valid).toBe(true);
    });
  });

  // --- cross-nugget impact ---

  describe('detectCrossNuggetImpact', () => {
    it('detects consumers affected via edges', () => {
      const nodeA = graphService.addNode(graphId, specSnakeMovement, 'Snake Movement');
      const nodeB = graphService.addNode(graphId, specFoodSpawner, 'Food Spawner');

      graphService.addEdge(graphId, {
        from_id: nodeA,
        to_id: nodeB,
        relationship: 'provides_to',
      });

      const impact = service.detectCrossNuggetImpact(graphId, nodeA);

      expect(impact.affected_nodes).toHaveLength(1);
      expect(impact.affected_nodes[0].node_id).toBe(nodeB);
      expect(impact.severity).toBe('breaking');
    });

    it('detects consumers affected via composition requires', () => {
      const nodeA = graphService.addNode(graphId, specSnakeMovement, 'Snake Movement');
      const nodeB = graphService.addNode(graphId, specFoodSpawner, 'Food Spawner');

      // No edge, but B requires snake_position which A provides
      const impact = service.detectCrossNuggetImpact(graphId, nodeA);

      expect(impact.affected_nodes).toHaveLength(1);
      expect(impact.affected_nodes[0].node_id).toBe(nodeB);
      expect(impact.affected_nodes[0].reason).toContain('snake_position');
      expect(impact.severity).toBe('minor');
    });

    it('returns severity none when no consumers exist', () => {
      const nodeA = graphService.addNode(graphId, specPlain, 'Isolated');

      const impact = service.detectCrossNuggetImpact(graphId, nodeA);

      expect(impact.affected_nodes).toHaveLength(0);
      expect(impact.severity).toBe('none');
    });

    it('returns breaking severity when edges exist from changed node', () => {
      const nodeA = graphService.addNode(graphId, specSnakeMovement, 'Snake Movement');
      const nodeB = graphService.addNode(graphId, specFoodSpawner, 'Food Spawner');
      const nodeC = graphService.addNode(graphId, specScoreTracker, 'Score Tracker');

      graphService.addEdge(graphId, {
        from_id: nodeA,
        to_id: nodeB,
        relationship: 'provides_to',
      });

      const impact = service.detectCrossNuggetImpact(graphId, nodeA);

      expect(impact.severity).toBe('breaking');
    });

    it('throws for nonexistent changed node', () => {
      expect(() =>
        service.detectCrossNuggetImpact(graphId, 'nonexistent'),
      ).toThrow('Node not found');
    });
  });

  // --- edge cases ---

  describe('edge cases', () => {
    it('handles single-node composition', () => {
      const nodeA = graphService.addNode(graphId, specSnakeMovement, 'Snake Movement');

      const result = service.compose(graphId, [nodeA]);

      expect(result.composed_spec.nugget?.goal).toBe('Snake Movement');
      expect(result.interface_contracts).toHaveLength(0);
      expect(result.emergent_behaviors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('handles nodes without composition fields', () => {
      const nodeA = graphService.addNode(graphId, specPlain, 'Plain A');
      const nodeB = graphService.addNode(graphId, specPlain, 'Plain B');

      const result = service.compose(graphId, [nodeA, nodeB]);

      expect(result.composed_spec.nugget?.goal).toBe('Plain A + Plain B');
      expect(result.interface_contracts).toHaveLength(0);
      expect(result.emergent_behaviors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('detects no emergence for nodes without composition fields', () => {
      const nodeA = graphService.addNode(graphId, specPlain, 'Plain A');
      const nodeB = graphService.addNode(graphId, specPlain, 'Plain B');

      const behaviors = service.detectEmergence(graphId, [nodeA, nodeB]);

      expect(behaviors).toHaveLength(0);
    });

    it('resolves no interfaces for nodes without composition fields', () => {
      const nodeA = graphService.addNode(graphId, specPlain, 'Plain A');
      const nodeB = graphService.addNode(graphId, specPlain, 'Plain B');

      const contracts = service.resolveInterfaces(graphId, [nodeA, nodeB]);

      expect(contracts).toHaveLength(0);
    });

    it('handles mixed nodes with and without composition fields', () => {
      const nodeA = graphService.addNode(graphId, specSnakeMovement, 'Snake Movement');
      const nodeB = graphService.addNode(graphId, specPlain, 'Plain');

      const result = service.compose(graphId, [nodeA, nodeB]);

      expect(result.composed_spec.nugget?.goal).toBe('Snake Movement + Plain');
      expect(result.warnings).toHaveLength(0);
    });
  });
});
