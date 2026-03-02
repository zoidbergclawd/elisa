import { describe, it, expect } from 'vitest';
import { classifyChanges } from '../services/redeployClassifier.js';

describe('redeployClassifier', () => {
  // ── no_change ───────────────────────────────────────────────────────

  it('returns no_change for identical specs', () => {
    const spec = {
      devices: [{ pluginId: 'esp32-s3-box3-agent', instanceId: 'i1', fields: { WIFI_SSID: 'home' } }],
      runtime: { agent_name: 'Buddy', voice: 'alloy' },
      deployment: { target: 'preview' },
    };
    const result = classifyChanges(spec, spec);
    expect(result.action).toBe('no_change');
    expect(result.reasons).toEqual([]);
  });

  it('returns no_change for empty specs', () => {
    const result = classifyChanges({}, {});
    expect(result.action).toBe('no_change');
    expect(result.reasons).toEqual([]);
  });

  it('returns no_change when non-device fields differ', () => {
    // Fields outside devices/deployment/runtime are not compared
    const oldSpec = { nugget: { goal: 'Build a game' } };
    const newSpec = { nugget: { goal: 'Build a quiz' } };
    const result = classifyChanges(oldSpec, newSpec);
    expect(result.action).toBe('no_change');
  });

  // ── config_only ─────────────────────────────────────────────────────

  it('returns config_only for agent name change', () => {
    const oldSpec = { runtime: { agent_name: 'Buddy' } };
    const newSpec = { runtime: { agent_name: 'Scout' } };
    const result = classifyChanges(oldSpec, newSpec);
    expect(result.action).toBe('config_only');
    expect(result.reasons).toContain('Agent name changed');
  });

  it('returns config_only for greeting change', () => {
    const oldSpec = { runtime: { greeting: 'Hello!' } };
    const newSpec = { runtime: { greeting: 'Hi there!' } };
    const result = classifyChanges(oldSpec, newSpec);
    expect(result.action).toBe('config_only');
    expect(result.reasons).toContain('Greeting changed');
  });

  it('returns config_only for voice change', () => {
    const oldSpec = { runtime: { voice: 'alloy' } };
    const newSpec = { runtime: { voice: 'nova' } };
    const result = classifyChanges(oldSpec, newSpec);
    expect(result.action).toBe('config_only');
    expect(result.reasons).toContain('Voice changed');
  });

  it('returns config_only for display theme change', () => {
    const oldSpec = { runtime: { display_theme: 'space' } };
    const newSpec = { runtime: { display_theme: 'nature' } };
    const result = classifyChanges(oldSpec, newSpec);
    expect(result.action).toBe('config_only');
    expect(result.reasons).toContain('Display theme changed');
  });

  it('returns config_only for fallback response change', () => {
    const oldSpec = { runtime: { fallback_response: 'I cannot help with that.' } };
    const newSpec = { runtime: { fallback_response: 'Let me think...' } };
    const result = classifyChanges(oldSpec, newSpec);
    expect(result.action).toBe('config_only');
    expect(result.reasons).toContain('Fallback response changed');
  });

  it('returns config_only for non-firmware device field change', () => {
    const oldSpec = {
      devices: [{ pluginId: 'box3', instanceId: 'i1', fields: { DISPLAY_THEME: 'space' } }],
    };
    const newSpec = {
      devices: [{ pluginId: 'box3', instanceId: 'i1', fields: { DISPLAY_THEME: 'candy' } }],
    };
    const result = classifyChanges(oldSpec, newSpec);
    expect(result.action).toBe('config_only');
    expect(result.reasons).toContain('Config field changed: DISPLAY_THEME');
  });

  it('returns config_only for auto_flash setting change', () => {
    const oldSpec = { deployment: { auto_flash: false } };
    const newSpec = { deployment: { auto_flash: true } };
    const result = classifyChanges(oldSpec, newSpec);
    expect(result.action).toBe('config_only');
    expect(result.reasons).toContain('Auto-flash setting changed');
  });

  // ── firmware_required ───────────────────────────────────────────────

  it('returns firmware_required for WiFi password change', () => {
    const oldSpec = {
      devices: [{ pluginId: 'box3', instanceId: 'i1', fields: { WIFI_PASSWORD: 'old123' } }],
    };
    const newSpec = {
      devices: [{ pluginId: 'box3', instanceId: 'i1', fields: { WIFI_PASSWORD: 'new456' } }],
    };
    const result = classifyChanges(oldSpec, newSpec);
    expect(result.action).toBe('firmware_required');
    expect(result.reasons).toContain('Firmware field changed: WIFI_PASSWORD');
  });

  it('returns firmware_required for WiFi SSID change', () => {
    const oldSpec = {
      devices: [{ pluginId: 'box3', instanceId: 'i1', fields: { WIFI_SSID: 'HomeNet' } }],
    };
    const newSpec = {
      devices: [{ pluginId: 'box3', instanceId: 'i1', fields: { WIFI_SSID: 'OfficeNet' } }],
    };
    const result = classifyChanges(oldSpec, newSpec);
    expect(result.action).toBe('firmware_required');
    expect(result.reasons).toContain('Firmware field changed: WIFI_SSID');
  });

  it('returns firmware_required for wake word change', () => {
    const oldSpec = {
      devices: [{ pluginId: 'box3', instanceId: 'i1', fields: { WAKE_WORD: 'hey buddy' } }],
    };
    const newSpec = {
      devices: [{ pluginId: 'box3', instanceId: 'i1', fields: { WAKE_WORD: 'hey scout' } }],
    };
    const result = classifyChanges(oldSpec, newSpec);
    expect(result.action).toBe('firmware_required');
    expect(result.reasons).toContain('Firmware field changed: WAKE_WORD');
  });

  it('returns firmware_required for device plugin change', () => {
    const oldSpec = {
      devices: [{ pluginId: 'heltec-sensor-node', instanceId: 'i1', fields: {} }],
    };
    const newSpec = {
      devices: [{ pluginId: 'esp32-s3-box3-agent', instanceId: 'i1', fields: {} }],
    };
    const result = classifyChanges(oldSpec, newSpec);
    expect(result.action).toBe('firmware_required');
    expect(result.reasons).toContain('Device plugin changed: heltec-sensor-node -> esp32-s3-box3-agent');
  });

  it('returns firmware_required for new device added', () => {
    const oldSpec = {
      devices: [{ pluginId: 'box3', instanceId: 'i1', fields: {} }],
    };
    const newSpec = {
      devices: [
        { pluginId: 'box3', instanceId: 'i1', fields: {} },
        { pluginId: 'heltec-sensor-node', instanceId: 'i2', fields: {} },
      ],
    };
    const result = classifyChanges(oldSpec, newSpec);
    expect(result.action).toBe('firmware_required');
    expect(result.reasons).toContain('New device added');
  });

  it('returns firmware_required for device removed', () => {
    const oldSpec = {
      devices: [
        { pluginId: 'box3', instanceId: 'i1', fields: {} },
        { pluginId: 'heltec', instanceId: 'i2', fields: {} },
      ],
    };
    const newSpec = {
      devices: [{ pluginId: 'box3', instanceId: 'i1', fields: {} }],
    };
    const result = classifyChanges(oldSpec, newSpec);
    expect(result.action).toBe('firmware_required');
    expect(result.reasons).toContain('Device removed');
  });

  it('returns firmware_required for deployment target change', () => {
    const oldSpec = { deployment: { target: 'preview' } };
    const newSpec = { deployment: { target: 'web' } };
    const result = classifyChanges(oldSpec, newSpec);
    expect(result.action).toBe('firmware_required');
    expect(result.reasons).toContain('Deployment target changed');
  });

  it('returns firmware_required for runtime URL change', () => {
    const oldSpec = { deployment: { runtime_url: 'http://localhost:9000' } };
    const newSpec = { deployment: { runtime_url: 'https://prod.elisa.run' } };
    const result = classifyChanges(oldSpec, newSpec);
    expect(result.action).toBe('firmware_required');
    expect(result.reasons).toContain('Runtime URL changed');
  });

  // ── Combined changes ────────────────────────────────────────────────

  it('returns firmware_required when both config and firmware fields change', () => {
    const oldSpec = {
      devices: [{ pluginId: 'box3', instanceId: 'i1', fields: { WIFI_PASSWORD: 'old', DISPLAY_THEME: 'space' } }],
      runtime: { agent_name: 'Buddy' },
    };
    const newSpec = {
      devices: [{ pluginId: 'box3', instanceId: 'i1', fields: { WIFI_PASSWORD: 'new', DISPLAY_THEME: 'candy' } }],
      runtime: { agent_name: 'Scout' },
    };
    const result = classifyChanges(oldSpec, newSpec);
    expect(result.action).toBe('firmware_required');
    expect(result.reasons).toContain('Firmware field changed: WIFI_PASSWORD');
    expect(result.reasons).toContain('Config field changed: DISPLAY_THEME');
    expect(result.reasons).toContain('Agent name changed');
  });

  it('collects multiple config_only reasons', () => {
    const oldSpec = { runtime: { agent_name: 'Buddy', voice: 'alloy', display_theme: 'space' } };
    const newSpec = { runtime: { agent_name: 'Scout', voice: 'nova', display_theme: 'candy' } };
    const result = classifyChanges(oldSpec, newSpec);
    expect(result.action).toBe('config_only');
    expect(result.reasons).toHaveLength(3);
    expect(result.reasons).toContain('Agent name changed');
    expect(result.reasons).toContain('Voice changed');
    expect(result.reasons).toContain('Display theme changed');
  });

  // ── Edge cases ──────────────────────────────────────────────────────

  it('handles spec with missing devices array', () => {
    const oldSpec = { runtime: { agent_name: 'A' } };
    const newSpec = { devices: [{ pluginId: 'box3', instanceId: 'i1', fields: {} }], runtime: { agent_name: 'A' } };
    const result = classifyChanges(oldSpec, newSpec);
    expect(result.action).toBe('firmware_required');
    expect(result.reasons).toContain('New device added');
  });

  it('handles devices going from some to none', () => {
    const oldSpec = { devices: [{ pluginId: 'box3', instanceId: 'i1', fields: {} }] };
    const newSpec = { devices: [] };
    const result = classifyChanges(oldSpec, newSpec);
    expect(result.action).toBe('firmware_required');
    expect(result.reasons).toContain('Device removed');
  });

  it('handles new field added to device', () => {
    const oldSpec = {
      devices: [{ pluginId: 'box3', instanceId: 'i1', fields: {} }],
    };
    const newSpec = {
      devices: [{ pluginId: 'box3', instanceId: 'i1', fields: { WIFI_SSID: 'MyNet' } }],
    };
    const result = classifyChanges(oldSpec, newSpec);
    expect(result.action).toBe('firmware_required');
    expect(result.reasons).toContain('Firmware field changed: WIFI_SSID');
  });

  it('handles field removed from device', () => {
    const oldSpec = {
      devices: [{ pluginId: 'box3', instanceId: 'i1', fields: { SHOW_LISTENING: true } }],
    };
    const newSpec = {
      devices: [{ pluginId: 'box3', instanceId: 'i1', fields: {} }],
    };
    const result = classifyChanges(oldSpec, newSpec);
    expect(result.action).toBe('config_only');
    expect(result.reasons).toContain('Config field changed: SHOW_LISTENING');
  });

  it('handles lowercase firmware field variants', () => {
    const oldSpec = {
      devices: [{ pluginId: 'box3', instanceId: 'i1', fields: { wifi_password: 'old' } }],
    };
    const newSpec = {
      devices: [{ pluginId: 'box3', instanceId: 'i1', fields: { wifi_password: 'new' } }],
    };
    const result = classifyChanges(oldSpec, newSpec);
    expect(result.action).toBe('firmware_required');
    expect(result.reasons).toContain('Firmware field changed: wifi_password');
  });

  it('handles runtime section appearing where it was absent', () => {
    const oldSpec = {};
    const newSpec = { runtime: { agent_name: 'Buddy' } };
    const result = classifyChanges(oldSpec, newSpec);
    expect(result.action).toBe('config_only');
    expect(result.reasons).toContain('Agent name changed');
  });

  it('handles deployment section appearing where it was absent', () => {
    const oldSpec = {};
    const newSpec = { deployment: { target: 'web' } };
    const result = classifyChanges(oldSpec, newSpec);
    expect(result.action).toBe('firmware_required');
    expect(result.reasons).toContain('Deployment target changed');
  });
});
