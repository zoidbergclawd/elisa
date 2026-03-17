import { describe, it, expect } from 'vitest';
import { inferInterfaces } from '../services/interfaceInference.js';
import type { NuggetSpec } from '../utils/specValidator.js';

describe('interfaceInference', () => {
  it('returns empty interfaces for empty spec', () => {
    const result = inferInterfaces({} as NuggetSpec);
    // Only deployment inference (no target -> no provides)
    expect(result.provides).toEqual([]);
    expect(result.requires).toEqual([]);
  });

  it('infers provides from portal action capabilities', () => {
    const spec = {
      portals: [{
        name: 'LED Strip',
        mechanism: 'serial',
        capabilities: [
          { id: 'set-color', name: 'set_color', kind: 'action', description: 'Set LED color' },
        ],
      }],
    } as NuggetSpec;
    const result = inferInterfaces(spec);
    expect(result.provides).toContainEqual({
      name: 'LED Strip/set_color',
      type: 'action',
      description: 'Set LED color',
    });
  });

  it('infers requires from portal query capabilities', () => {
    const spec = {
      portals: [{
        name: 'Weather API',
        mechanism: 'cli',
        capabilities: [
          { id: 'get-temp', name: 'temperature', kind: 'query', description: 'Get temperature' },
        ],
      }],
    } as NuggetSpec;
    const result = inferInterfaces(spec);
    expect(result.requires).toContainEqual({
      name: 'Weather API/temperature',
      type: 'query',
      description: 'Get temperature',
    });
  });

  it('infers provides from portal event capabilities', () => {
    const spec = {
      portals: [{
        name: 'Button',
        mechanism: 'serial',
        capabilities: [
          { id: 'pressed', name: 'pressed', kind: 'event', description: 'Button pressed' },
        ],
      }],
    } as NuggetSpec;
    const result = inferInterfaces(spec);
    expect(result.provides).toContainEqual({
      name: 'Button/pressed',
      type: 'event',
      description: 'Button pressed',
    });
  });

  it('infers web-endpoint provides from web deployment target', () => {
    const spec = {
      deployment: { target: 'web' },
    } as NuggetSpec;
    const result = inferInterfaces(spec);
    expect(result.provides).toContainEqual({
      name: 'web-endpoint',
      type: 'endpoint',
      description: 'Web deployment endpoint',
    });
  });

  it('infers device-output provides from esp32 deployment target', () => {
    const spec = {
      deployment: { target: 'esp32' },
    } as NuggetSpec;
    const result = inferInterfaces(spec);
    expect(result.provides).toContainEqual({
      name: 'device-output',
      type: 'device',
      description: 'Hardware device output',
    });
  });

  it('infers both endpoints from "both" deployment target', () => {
    const spec = {
      deployment: { target: 'both' },
    } as NuggetSpec;
    const result = inferInterfaces(spec);
    const provideNames = result.provides.map(p => p.name);
    expect(provideNames).toContain('web-endpoint');
    expect(provideNames).toContain('device-output');
  });

  it('infers requires from device entries', () => {
    const spec = {
      devices: [
        { pluginId: 'heltec-sensor-node', instanceId: 'sensor1', fields: {} },
      ],
    } as NuggetSpec;
    const result = inferInterfaces(spec);
    expect(result.requires).toContainEqual({
      name: 'heltec-sensor-node',
      type: 'device',
      description: 'Device plugin: heltec-sensor-node',
    });
  });

  it('infers provides from feature skills', () => {
    const spec = {
      skills: [
        { id: 'skill-1', name: 'Dashboard UX', category: 'feature', prompt: 'Use SSE' },
      ],
    } as NuggetSpec;
    const result = inferInterfaces(spec);
    expect(result.provides).toContainEqual({
      name: 'skill/Dashboard UX',
      type: 'artifact',
      description: 'Feature skill: Dashboard UX',
    });
  });

  it('does not infer provides from non-feature skills', () => {
    const spec = {
      skills: [
        { id: 'skill-1', name: 'Retro style', category: 'style', prompt: 'Apply retro style' },
      ],
    } as NuggetSpec;
    const result = inferInterfaces(spec);
    const skillProvides = result.provides.filter(p => p.name.startsWith('skill/'));
    expect(skillProvides).toEqual([]);
  });

  it('infers from portal with device subtype but no capabilities', () => {
    const spec = {
      portals: [{
        name: 'ESP32 Sensor',
        mechanism: 'serial',
        subtype: 'device',
      }],
    } as NuggetSpec;
    const result = inferInterfaces(spec);
    expect(result.provides).toContainEqual({
      name: 'ESP32 Sensor',
      type: 'device',
      description: 'Hardware interface: ESP32 Sensor',
    });
  });

  it('infers requires from portal with knowledge subtype', () => {
    const spec = {
      portals: [{
        name: 'Science Curriculum',
        mechanism: 'auto',
        subtype: 'knowledge',
      }],
    } as NuggetSpec;
    const result = inferInterfaces(spec);
    expect(result.requires).toContainEqual({
      name: 'Science Curriculum',
      type: 'knowledge',
      description: 'Knowledge source: Science Curriculum',
    });
  });

  it('infers from portal interactions when no capabilities', () => {
    const spec = {
      portals: [{
        name: 'Cloud API',
        mechanism: 'cli',
        interactions: [
          { type: 'tell' as const, capabilityId: 'send-data' },
          { type: 'ask' as const, capabilityId: 'get-status' },
        ],
      }],
    } as NuggetSpec;
    const result = inferInterfaces(spec);
    const provideNames = result.provides.map(p => p.name);
    const requireNames = result.requires.map(r => r.name);
    expect(provideNames).toContain('Cloud API');
    expect(requireNames).toContain('Cloud API');
  });

  it('full IoT sensor node spec inference', () => {
    const spec = {
      deployment: { target: 'esp32' },
      devices: [
        { pluginId: 'heltec-sensor-node', instanceId: 'sensor1', fields: {} },
      ],
      skills: [
        { id: 'skill-1', name: 'Robust IoT', category: 'agent', prompt: 'Handle failures' },
      ],
      portals: [{
        name: 'Serial Output',
        mechanism: 'serial',
        subtype: 'device',
      }],
    } as NuggetSpec;
    const result = inferInterfaces(spec);
    expect(result.provides.length).toBeGreaterThanOrEqual(2); // device-output + Serial Output
    expect(result.requires.length).toBeGreaterThanOrEqual(1); // heltec-sensor-node
  });
});
