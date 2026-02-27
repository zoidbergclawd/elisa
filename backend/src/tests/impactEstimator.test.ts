import { describe, it, expect } from 'vitest';
import { estimate } from '../services/impactEstimator.js';

describe('impactEstimator', () => {
  it('returns simple complexity for a minimal spec', () => {
    const spec = {
      nugget: { goal: 'Hello world', type: 'software' },
      requirements: [{ description: 'Show hello' }],
    };
    const result = estimate(spec);
    expect(result.complexity).toBe('simple');
    expect(result.estimated_tasks).toBeGreaterThanOrEqual(1);
  });

  it('returns moderate complexity for a medium spec', () => {
    const spec = {
      nugget: { goal: 'Snake game', type: 'software' },
      requirements: [
        { description: 'Game board renders' },
        { description: 'Snake moves with arrow keys' },
        { description: 'Food spawns randomly' },
        { description: 'Score displays' },
      ],
      workflow: {
        behavioral_tests: [
          { when: 'arrow key pressed', then: 'snake moves', id: 'test-1' },
          { when: 'snake eats food', then: 'score increments', id: 'test-2' },
        ],
      },
    };
    const result = estimate(spec);
    expect(result.complexity).toBe('moderate');
    expect(result.estimated_tasks).toBeGreaterThanOrEqual(4);
  });

  it('returns complex complexity for a large spec with devices and portals', () => {
    const requirements = Array.from({ length: 8 }, (_, i) => ({
      description: `Requirement ${i}`,
    }));
    const spec = {
      nugget: { goal: 'IoT dashboard', type: 'software' },
      requirements,
      devices: [
        { pluginId: 'sensor-1', instanceId: 'i1', fields: {} },
        { pluginId: 'gateway', instanceId: 'i2', fields: {} },
      ],
      portals: [
        { name: 'Weather API', mechanism: 'mcp' },
      ],
      workflow: {
        behavioral_tests: [
          { when: 'sensor reads', then: 'data displays' },
        ],
        feedback_loops: [
          { id: 'fl-1', trigger: 'test_failure', exit_condition: 'tests pass', max_iterations: 3, connects_from: 'a', connects_to: 'b' },
        ],
      },
      agents: [
        { name: 'Builder', role: 'builder' },
        { name: 'Reviewer', role: 'reviewer' },
      ],
    };
    const result = estimate(spec);
    expect(result.complexity).toBe('complex');
    expect(result.estimated_tasks).toBeGreaterThanOrEqual(8);
  });

  it('identifies heaviest requirements linked to behavioral tests', () => {
    const spec = {
      requirements: [
        { description: 'Simple label', test_id: undefined },
        { description: 'Complex interactive game board with collision detection and physics simulation that renders at 60fps' },
        { description: 'User authentication with OAuth2' },
      ],
      workflow: {
        behavioral_tests: [
          { id: 'bt-1', when: 'collision happens', then: 'game over', requirement_id: 'req-1' },
        ],
      },
    };
    const result = estimate(spec);
    expect(result.heaviest_requirements.length).toBeGreaterThan(0);
    // The longest description and test-linked ones should be prioritized
    expect(result.heaviest_requirements).toContain(
      'Complex interactive game board with collision detection and physics simulation that renders at 60fps',
    );
  });

  it('handles empty spec gracefully', () => {
    const result = estimate({});
    expect(result.estimated_tasks).toBeGreaterThanOrEqual(1);
    expect(result.complexity).toBe('simple');
    expect(result.heaviest_requirements).toEqual([]);
  });

  it('counts device tasks correctly', () => {
    const spec = {
      requirements: [{ description: 'Blink LED' }],
      devices: [
        { pluginId: 'blink-1', instanceId: 'i1', fields: {} },
      ],
    };
    const result = estimate(spec);
    // 1 req task + 1 device task
    expect(result.estimated_tasks).toBe(2);
  });

  it('adds review tasks when reviewer agent is present', () => {
    const spec = {
      requirements: [
        { description: 'A' },
        { description: 'B' },
        { description: 'C' },
      ],
      agents: [
        { name: 'Builder', role: 'builder' },
        { name: 'Reviewer', role: 'reviewer' },
      ],
    };
    const result = estimate(spec);
    // 3 req tasks + ceil(3/3)=1 review task
    expect(result.estimated_tasks).toBe(4);
  });
});
