/** Boundary analyzer: identifies inputs, outputs, and system boundaries of a NuggetSpec. */

import type { NuggetSpec } from '../utils/specValidator.js';

export interface BoundaryItem {
  name: string;
  type: 'user_input' | 'portal_data' | 'hardware_signal' | 'display' | 'hardware_command' | 'data_output';
  source?: string;
}

export interface BoundaryAnalysis {
  inputs: BoundaryItem[];
  outputs: BoundaryItem[];
  boundary_portals: string[];
}

/**
 * Analyzes a NuggetSpec to identify system boundaries:
 * - Inputs: user input, portal data, hardware signals
 * - Outputs: display, hardware commands, data
 * - Boundary portals: portals sit on the boundary between inside and outside
 */
export function analyze(spec: NuggetSpec): BoundaryAnalysis {
  const inputs: BoundaryItem[] = [];
  const outputs: BoundaryItem[] = [];
  const boundary_portals: string[] = [];

  const requirements = Array.isArray(spec.requirements) ? spec.requirements : [];
  const portals = Array.isArray(spec.portals) ? spec.portals : [];
  const devices = Array.isArray(spec.devices) ? spec.devices : [];
  const behavioralTests = (spec.workflow as Record<string, unknown> | undefined)?.behavioral_tests;
  const tests = Array.isArray(behavioralTests) ? behavioralTests : [];

  // Analyze requirements for inputs and outputs
  for (const req of requirements as Array<Record<string, unknown>>) {
    const desc = String(req.description ?? '').toLowerCase();

    // Detect user inputs
    if (
      desc.includes('user input') ||
      desc.includes('user clicks') ||
      desc.includes('user types') ||
      desc.includes('button') ||
      desc.includes('keyboard') ||
      desc.includes('mouse') ||
      desc.includes('touch') ||
      desc.includes('form')
    ) {
      inputs.push({
        name: truncate(String(req.description ?? ''), 60),
        type: 'user_input',
      });
    }

    // Detect display outputs
    if (
      desc.includes('display') ||
      desc.includes('show') ||
      desc.includes('render') ||
      desc.includes('screen') ||
      desc.includes('visible') ||
      desc.includes('output') ||
      desc.includes('print')
    ) {
      outputs.push({
        name: truncate(String(req.description ?? ''), 60),
        type: 'display',
      });
    }
  }

  // Analyze behavioral tests for additional I/O signals
  for (const test of tests as Array<Record<string, unknown>>) {
    const when = String(test.when ?? '').toLowerCase();
    const then = String(test.then ?? '').toLowerCase();

    if (
      when.includes('user') ||
      when.includes('click') ||
      when.includes('type') ||
      when.includes('press')
    ) {
      const name = truncate(String(test.when ?? ''), 60);
      if (!inputs.some(i => i.name === name)) {
        inputs.push({ name, type: 'user_input' });
      }
    }

    if (
      then.includes('display') ||
      then.includes('show') ||
      then.includes('appear') ||
      then.includes('visible')
    ) {
      const name = truncate(String(test.then ?? ''), 60);
      if (!outputs.some(o => o.name === name)) {
        outputs.push({ name, type: 'display' });
      }
    }
  }

  // Portals sit on the boundary
  for (const portal of portals as Array<Record<string, unknown>>) {
    const name = String(portal.name ?? portal.id ?? 'Unknown portal');
    boundary_portals.push(name);

    // Portal capabilities can be inputs or outputs
    const capabilities = Array.isArray(portal.capabilities) ? portal.capabilities : [];
    for (const cap of capabilities as Array<Record<string, unknown>>) {
      const kind = String(cap.kind ?? '').toLowerCase();
      if (kind === 'read' || kind === 'query' || kind === 'fetch' || kind === 'input') {
        inputs.push({
          name: truncate(String(cap.name ?? cap.description ?? name), 60),
          type: 'portal_data',
          source: name,
        });
      }
      if (kind === 'write' || kind === 'send' || kind === 'create' || kind === 'output') {
        outputs.push({
          name: truncate(String(cap.name ?? cap.description ?? name), 60),
          type: 'data_output',
          source: name,
        });
      }
    }

    // If no capabilities parsed, treat portal as both input and output
    if (capabilities.length === 0) {
      inputs.push({ name: `Data from ${name}`, type: 'portal_data', source: name });
      outputs.push({ name: `Data to ${name}`, type: 'data_output', source: name });
    }
  }

  // Devices are boundary elements (hardware signals in, hardware commands out)
  for (const device of devices as Array<Record<string, unknown>>) {
    const pluginId = String(device.pluginId ?? 'device');
    inputs.push({
      name: `Signals from ${pluginId}`,
      type: 'hardware_signal',
      source: pluginId,
    });
    outputs.push({
      name: `Commands to ${pluginId}`,
      type: 'hardware_command',
      source: pluginId,
    });
  }

  // If no explicit user input found but there's a goal mentioning interaction, add generic input
  const goal = String((spec.nugget as Record<string, unknown> | undefined)?.goal ?? '').toLowerCase();
  if (inputs.length === 0 && (goal.includes('game') || goal.includes('app') || goal.includes('interactive'))) {
    inputs.push({ name: 'User interaction', type: 'user_input' });
  }

  // If no outputs found, add generic display output
  if (outputs.length === 0) {
    outputs.push({ name: 'Application display', type: 'display' });
  }

  return { inputs, outputs, boundary_portals };
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 3) + '...';
}
