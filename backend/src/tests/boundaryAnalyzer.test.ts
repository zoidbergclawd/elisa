import { describe, it, expect } from 'vitest';
import { analyze } from '../services/boundaryAnalyzer.js';

describe('boundaryAnalyzer', () => {
  it('identifies user inputs from requirements', () => {
    const spec = {
      requirements: [
        { description: 'User clicks the start button' },
        { description: 'Display the game board' },
      ],
    };
    const result = analyze(spec);
    expect(result.inputs.length).toBeGreaterThan(0);
    expect(result.inputs.some(i => i.type === 'user_input')).toBe(true);
  });

  it('identifies display outputs from requirements', () => {
    const spec = {
      requirements: [
        { description: 'Show the score on screen' },
      ],
    };
    const result = analyze(spec);
    expect(result.outputs.length).toBeGreaterThan(0);
    expect(result.outputs.some(o => o.type === 'display')).toBe(true);
  });

  it('identifies portals as boundary elements', () => {
    const spec = {
      portals: [
        {
          name: 'Weather API',
          mechanism: 'mcp',
          capabilities: [
            { name: 'Get weather', kind: 'read' },
            { name: 'Post data', kind: 'write' },
          ],
        },
      ],
    };
    const result = analyze(spec);
    expect(result.boundary_portals).toContain('Weather API');
    expect(result.inputs.some(i => i.type === 'portal_data' && i.source === 'Weather API')).toBe(true);
    expect(result.outputs.some(o => o.type === 'data_output' && o.source === 'Weather API')).toBe(true);
  });

  it('identifies devices as boundary elements', () => {
    const spec = {
      devices: [
        { pluginId: 'heltec-sensor-node', instanceId: 'i1', fields: {} },
      ],
    };
    const result = analyze(spec);
    expect(result.inputs.some(i => i.type === 'hardware_signal')).toBe(true);
    expect(result.outputs.some(o => o.type === 'hardware_command')).toBe(true);
  });

  it('creates generic inputs for portal without capabilities', () => {
    const spec = {
      portals: [{ name: 'Generic Portal' }],
    };
    const result = analyze(spec);
    expect(result.boundary_portals).toContain('Generic Portal');
    expect(result.inputs.some(i => i.type === 'portal_data')).toBe(true);
    expect(result.outputs.some(o => o.type === 'data_output')).toBe(true);
  });

  it('identifies inputs from behavioral tests', () => {
    const spec = {
      workflow: {
        behavioral_tests: [
          { when: 'user clicks play', then: 'game starts' },
        ],
      },
    };
    const result = analyze(spec);
    expect(result.inputs.some(i => i.type === 'user_input')).toBe(true);
  });

  it('adds generic display output when no outputs found', () => {
    const spec = {
      nugget: { goal: 'calculator' },
      requirements: [{ description: 'Compute addition' }],
    };
    const result = analyze(spec);
    expect(result.outputs.length).toBeGreaterThan(0);
    expect(result.outputs[0].name).toBe('Application display');
  });

  it('adds generic user input for interactive goals', () => {
    const spec = {
      nugget: { goal: 'Build a game' },
    };
    const result = analyze(spec);
    expect(result.inputs.some(i => i.type === 'user_input')).toBe(true);
  });

  it('handles empty spec', () => {
    const result = analyze({});
    // Should at least have a generic display output
    expect(result.outputs.length).toBeGreaterThan(0);
    expect(result.boundary_portals).toEqual([]);
  });
});
