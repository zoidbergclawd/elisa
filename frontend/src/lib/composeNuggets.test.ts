import { describe, it, expect } from 'vitest';
import { composeNuggets, type ResolvedNugget } from './composeNuggets';
import type { ComposeRequest } from '../components/BlockCanvas/nuggetInterpreter';
import type { NuggetSpec } from '../components/BlockCanvas/blockInterpreter';

function makeNugget(id: string, name: string, overrides: Partial<NuggetSpec> = {}): ResolvedNugget {
  return {
    id,
    name,
    spec: {
      nugget: { goal: `Build a ${name}`, description: `Build a ${name}`, type: 'general' },
      requirements: [{ type: 'feature', description: `${name} feature` }],
      agents: [],
      deployment: { target: 'web', auto_flash: false },
      workflow: { review_enabled: false, testing_enabled: false, human_gates: [] },
      ...overrides,
    },
  };
}

describe('composeNuggets', () => {
  it('composes a single nugget', () => {
    const request: ComposeRequest = {
      nuggetIds: ['dashboard'],
      placements: [{ nuggetId: 'dashboard', group: 0, position: 0 }],
      parallelGroups: 1,
    };
    const resolved = [makeNugget('dashboard', 'Web Dashboard')];
    const result = composeNuggets(request, resolved);

    expect(result.composedSpec.nugget.goal).toBe('Web Dashboard');
    expect(result.composedSpec.requirements).toHaveLength(1);
    expect(result.parallelCount).toBe(1);
    expect(result.groups).toHaveLength(1);
  });

  it('merges sequential nuggets into one group', () => {
    const request: ComposeRequest = {
      nuggetIds: ['api', 'dashboard'],
      placements: [
        { nuggetId: 'api', group: 0, position: 0 },
        { nuggetId: 'dashboard', group: 0, position: 1 },
      ],
      parallelGroups: 1,
    };
    const resolved = [
      makeNugget('api', 'REST API'),
      makeNugget('dashboard', 'Web Dashboard'),
    ];
    const result = composeNuggets(request, resolved);

    expect(result.composedSpec.nugget.goal).toBe('REST API + Web Dashboard');
    expect(result.composedSpec.requirements).toHaveLength(2);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].nuggets).toHaveLength(2);
    expect(result.summary).toContain('Sequential');
  });

  it('handles parallel nuggets as separate groups', () => {
    const request: ComposeRequest = {
      nuggetIds: ['sensor', 'dashboard'],
      placements: [
        { nuggetId: 'sensor', group: 0, position: 0 },
        { nuggetId: 'dashboard', group: 1, position: 0 },
      ],
      parallelGroups: 2,
    };
    const resolved = [
      makeNugget('sensor', 'Sensor Node', { deployment: { target: 'esp32', auto_flash: true } }),
      makeNugget('dashboard', 'Web Dashboard'),
    ];
    const result = composeNuggets(request, resolved);

    expect(result.parallelCount).toBe(2);
    expect(result.composedSpec.deployment.target).toBe('both');
    expect(result.summary).toContain('Parallel');
  });

  it('resolves deployment target: web + esp32 = both', () => {
    const request: ComposeRequest = {
      nuggetIds: ['a', 'b'],
      placements: [
        { nuggetId: 'a', group: 0, position: 0 },
        { nuggetId: 'b', group: 1, position: 0 },
      ],
      parallelGroups: 2,
    };
    const resolved = [
      makeNugget('a', 'A', { deployment: { target: 'esp32', auto_flash: true } }),
      makeNugget('b', 'B', { deployment: { target: 'web', auto_flash: false } }),
    ];
    const result = composeNuggets(request, resolved);
    expect(result.composedSpec.deployment.target).toBe('both');
  });

  it('merges skills from all nuggets', () => {
    const request: ComposeRequest = {
      nuggetIds: ['a', 'b'],
      placements: [
        { nuggetId: 'a', group: 0, position: 0 },
        { nuggetId: 'b', group: 0, position: 1 },
      ],
      parallelGroups: 1,
    };
    const resolved = [
      makeNugget('a', 'A', { skills: [{ id: 's1', name: 'Skill 1', prompt: 'do x', category: 'feature' }] }),
      makeNugget('b', 'B', { skills: [{ id: 's2', name: 'Skill 2', prompt: 'do y', category: 'style' }] }),
    ];
    const result = composeNuggets(request, resolved);
    expect(result.composedSpec.skills).toHaveLength(2);
  });

  it('merges behavioral tests from all nuggets', () => {
    const request: ComposeRequest = {
      nuggetIds: ['a', 'b'],
      placements: [
        { nuggetId: 'a', group: 0, position: 0 },
        { nuggetId: 'b', group: 0, position: 1 },
      ],
      parallelGroups: 1,
    };
    const resolved = [
      makeNugget('a', 'A', { workflow: { review_enabled: false, testing_enabled: true, human_gates: [], behavioral_tests: [{ id: 't1', when: 'x', then: 'y' }] } }),
      makeNugget('b', 'B', { workflow: { review_enabled: false, testing_enabled: true, human_gates: [], behavioral_tests: [{ id: 't2', when: 'a', then: 'b' }] } }),
    ];
    const result = composeNuggets(request, resolved);
    expect(result.composedSpec.workflow.behavioral_tests).toHaveLength(2);
    expect(result.composedSpec.workflow.testing_enabled).toBe(true);
  });

  it('adds composition context to description', () => {
    const request: ComposeRequest = {
      nuggetIds: ['api', 'dashboard'],
      placements: [
        { nuggetId: 'api', group: 0, position: 0 },
        { nuggetId: 'dashboard', group: 0, position: 1 },
      ],
      parallelGroups: 1,
    };
    const resolved = [
      makeNugget('api', 'REST API'),
      makeNugget('dashboard', 'Web Dashboard'),
    ];
    const result = composeNuggets(request, resolved);
    expect(result.composedSpec.nugget.description).toContain('Composed from 2 nuggets');
    expect(result.composedSpec.nugget.description).toContain('REST API');
    expect(result.composedSpec.nugget.description).toContain('Web Dashboard');
  });

  it('handles empty composition', () => {
    const request: ComposeRequest = {
      nuggetIds: [],
      placements: [],
      parallelGroups: 0,
    };
    const result = composeNuggets(request, []);
    expect(result.composedSpec.nugget.goal).toBe('');
    expect(result.summary).toBe('Empty composition');
  });

  it('skips unresolved nugget IDs', () => {
    const request: ComposeRequest = {
      nuggetIds: ['exists', 'missing'],
      placements: [
        { nuggetId: 'exists', group: 0, position: 0 },
        { nuggetId: 'missing', group: 0, position: 1 },
      ],
      parallelGroups: 1,
    };
    const resolved = [makeNugget('exists', 'Exists')];
    const result = composeNuggets(request, resolved);
    expect(result.groups[0].nuggets).toHaveLength(1);
  });
});
