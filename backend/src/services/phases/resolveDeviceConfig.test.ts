/**
 * Unit tests for resolveDeviceConfig() and setNestedValue().
 *
 * Tests the spec_mapping bridge that copies device block field values
 * into NuggetSpec paths before runtime provisioning.
 */

import { describe, it, expect } from 'vitest';
import { resolveDeviceConfig, setNestedValue } from './deployPhase.js';
import type { DeviceManifest } from '../../utils/deviceManifestSchema.js';

// ── Helpers ──────────────────────────────────────────────────────────

/** Minimal DeviceManifest stub for testing spec_mapping. */
function makeManifest(overrides: Partial<DeviceManifest> = {}): DeviceManifest {
  return {
    id: 'test-device',
    name: 'Test Device',
    version: '1.0.0',
    description: 'A test device',
    colour: 180,
    board: null,
    capabilities: [],
    blocks: [{ type: 'test_block', message: 'Test', args: [] }],
    deploy: { method: 'flash', provides: [], requires: [], flash: { files: ['main.py'], lib: [], shared_lib: [], prompt_message: 'Connect device' } },
    ...overrides,
  } as DeviceManifest;
}

function makeManifestWithMapping(extractFields: Record<string, unknown>): DeviceManifest {
  return makeManifest({
    spec_mapping: {
      role: 'test_role',
      extract_fields: extractFields,
    },
  });
}

// ── setNestedValue ───────────────────────────────────────────────────

describe('setNestedValue', () => {
  it('sets a top-level property', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'name', 'Elisa');
    expect(obj.name).toBe('Elisa');
  });

  it('sets a nested property, creating intermediate objects', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'runtime.agent_name', 'Elisa');
    expect((obj.runtime as any).agent_name).toBe('Elisa');
  });

  it('sets a deeply nested property', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'a.b.c.d', 42);
    expect((obj as any).a.b.c.d).toBe(42);
  });

  it('does not overwrite existing intermediate objects', () => {
    const obj: Record<string, unknown> = { runtime: { voice: 'nova' } };
    setNestedValue(obj, 'runtime.agent_name', 'Elisa');
    expect((obj.runtime as any).voice).toBe('nova');
    expect((obj.runtime as any).agent_name).toBe('Elisa');
  });

  it('overwrites an existing value at the target path', () => {
    const obj: Record<string, unknown> = { runtime: { agent_name: 'Old' } };
    setNestedValue(obj, 'runtime.agent_name', 'New');
    expect((obj.runtime as any).agent_name).toBe('New');
  });

  it('handles null intermediate values by replacing with object', () => {
    const obj: Record<string, unknown> = { runtime: null };
    setNestedValue(obj, 'runtime.agent_name', 'Elisa');
    expect((obj.runtime as any).agent_name).toBe('Elisa');
  });
});

// ── resolveDeviceConfig ──────────────────────────────────────────────

describe('resolveDeviceConfig', () => {
  it('returns spec unchanged when no devices array', () => {
    const spec = { nugget: { goal: 'Test' } };
    const result = resolveDeviceConfig(spec, () => undefined);
    expect(result).toBe(spec); // Same reference — no clone needed
  });

  it('returns spec unchanged when devices array is empty', () => {
    const spec = { devices: [] };
    const result = resolveDeviceConfig(spec, () => undefined);
    expect(result).toBe(spec);
  });

  it('returns spec unchanged when devices is not an array', () => {
    const spec = { devices: 'not-an-array' } as any;
    const result = resolveDeviceConfig(spec, () => undefined);
    expect(result).toBe(spec);
  });

  it('maps device fields to spec paths using spec_mapping.extract_fields', () => {
    const spec = {
      devices: [
        { pluginId: 'box3', instanceId: 'i1', fields: { AGENT_NAME: 'Elisa', TTS_VOICE: 'nova' } },
      ],
    };
    const manifest = makeManifestWithMapping({
      'runtime.agent_name': 'AGENT_NAME',
      'runtime.voice': 'TTS_VOICE',
    });

    const result = resolveDeviceConfig(spec, (id) => id === 'box3' ? manifest : undefined);

    expect((result as any).runtime.agent_name).toBe('Elisa');
    expect((result as any).runtime.voice).toBe('nova');
  });

  it('does not mutate the original spec', () => {
    const spec = {
      devices: [
        { pluginId: 'box3', instanceId: 'i1', fields: { AGENT_NAME: 'Elisa' } },
      ],
    };
    const manifest = makeManifestWithMapping({ 'runtime.agent_name': 'AGENT_NAME' });

    resolveDeviceConfig(spec, () => manifest);

    // Original should not have runtime set
    expect((spec as any).runtime).toBeUndefined();
  });

  it('skips devices with no manifest', () => {
    const spec = {
      devices: [
        { pluginId: 'unknown-device', instanceId: 'i1', fields: { FOO: 'bar' } },
      ],
    };

    const result = resolveDeviceConfig(spec, () => undefined);

    expect((result as any).FOO).toBeUndefined();
  });

  it('skips devices whose manifest has no spec_mapping', () => {
    const spec = {
      devices: [
        { pluginId: 'plain', instanceId: 'i1', fields: { AGENT_NAME: 'test' } },
      ],
    };
    const manifest = makeManifest(); // No spec_mapping

    const result = resolveDeviceConfig(spec, () => manifest);

    expect((result as any).runtime).toBeUndefined();
  });

  it('skips devices whose manifest has no extract_fields', () => {
    const spec = {
      devices: [
        { pluginId: 'partial', instanceId: 'i1', fields: { AGENT_NAME: 'test' } },
      ],
    };
    const manifest = makeManifest({
      spec_mapping: { role: 'test_role', extract_fields: {} },
    });

    const result = resolveDeviceConfig(spec, () => manifest);

    expect((result as any).runtime).toBeUndefined();
  });

  it('skips fields that are undefined in the device', () => {
    const spec = {
      devices: [
        { pluginId: 'box3', instanceId: 'i1', fields: { AGENT_NAME: 'Elisa' } },
      ],
    };
    const manifest = makeManifestWithMapping({
      'runtime.agent_name': 'AGENT_NAME',
      'runtime.voice': 'TTS_VOICE', // Not present in fields
    });

    const result = resolveDeviceConfig(spec, () => manifest);

    expect((result as any).runtime.agent_name).toBe('Elisa');
    expect((result as any).runtime.voice).toBeUndefined();
  });

  it('handles device with no fields object', () => {
    const spec = {
      devices: [
        { pluginId: 'box3', instanceId: 'i1' }, // No fields
      ],
    };
    const manifest = makeManifestWithMapping({ 'runtime.agent_name': 'AGENT_NAME' });

    const result = resolveDeviceConfig(spec, () => manifest);

    expect((result as any).runtime).toBeUndefined();
  });

  it('handles multiple devices with different mappings', () => {
    const spec = {
      devices: [
        { pluginId: 'box3', instanceId: 'i1', fields: { AGENT_NAME: 'Elisa', TTS_VOICE: 'nova' } },
        { pluginId: 'cloud-dash', instanceId: 'i2', fields: { DASHBOARD_TITLE: 'My Dashboard' } },
      ],
    };
    const box3Manifest = makeManifestWithMapping({
      'runtime.agent_name': 'AGENT_NAME',
      'runtime.voice': 'TTS_VOICE',
    });
    const cloudManifest = makeManifestWithMapping({
      'deployment.dashboard_title': 'DASHBOARD_TITLE',
    });

    const result = resolveDeviceConfig(spec, (id) => {
      if (id === 'box3') return box3Manifest;
      if (id === 'cloud-dash') return cloudManifest;
      return undefined;
    });

    expect((result as any).runtime.agent_name).toBe('Elisa');
    expect((result as any).runtime.voice).toBe('nova');
    expect((result as any).deployment.dashboard_title).toBe('My Dashboard');
  });

  it('preserves existing spec values that are not overwritten', () => {
    const spec = {
      nugget: { goal: 'Build a robot' },
      runtime: { greeting: 'Hello!' },
      devices: [
        { pluginId: 'box3', instanceId: 'i1', fields: { AGENT_NAME: 'Elisa' } },
      ],
    };
    const manifest = makeManifestWithMapping({ 'runtime.agent_name': 'AGENT_NAME' });

    const result = resolveDeviceConfig(spec, () => manifest);

    expect((result as any).nugget.goal).toBe('Build a robot');
    expect((result as any).runtime.greeting).toBe('Hello!');
    expect((result as any).runtime.agent_name).toBe('Elisa');
  });

  it('maps boolean and number field values correctly', () => {
    const spec = {
      devices: [
        { pluginId: 'box3', instanceId: 'i1', fields: { SHOW_LISTENING: true, VOLUME: 75 } },
      ],
    };
    const manifest = makeManifestWithMapping({
      'display.show_listening': 'SHOW_LISTENING',
      'audio.volume': 'VOLUME',
    });

    const result = resolveDeviceConfig(spec, () => manifest);

    expect((result as any).display.show_listening).toBe(true);
    expect((result as any).audio.volume).toBe(75);
  });

  it('skips non-string field key values in extract_fields gracefully', () => {
    const spec = {
      devices: [
        { pluginId: 'box3', instanceId: 'i1', fields: { AGENT_NAME: 'Elisa' } },
      ],
    };
    // Simulate a malformed mapping where a value is not a string
    const manifest = makeManifestWithMapping({
      'runtime.agent_name': 'AGENT_NAME',
      'runtime.bad': 42, // Non-string value, should be skipped
    });

    const result = resolveDeviceConfig(spec, () => manifest);

    expect((result as any).runtime.agent_name).toBe('Elisa');
    expect((result as any).runtime.bad).toBeUndefined();
  });

  it('later device overrides earlier device if they map to the same path', () => {
    const spec = {
      devices: [
        { pluginId: 'dev1', instanceId: 'i1', fields: { NAME: 'First' } },
        { pluginId: 'dev2', instanceId: 'i2', fields: { NAME: 'Second' } },
      ],
    };
    const manifest = makeManifestWithMapping({ 'runtime.agent_name': 'NAME' });

    const result = resolveDeviceConfig(spec, () => manifest);

    // Last device wins (sequential iteration)
    expect((result as any).runtime.agent_name).toBe('Second');
  });
});
