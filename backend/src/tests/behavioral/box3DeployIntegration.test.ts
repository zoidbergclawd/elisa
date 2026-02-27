import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { DeviceRegistry } from '../../services/deviceRegistry.js';
import {
  MpremoteFlashStrategy,
  EsptoolFlashStrategy,
  selectFlashStrategy,
} from '../../services/flashStrategy.js';
import { classifyChanges } from '../../services/redeployClassifier.js';

// ── DeviceRegistry: BOX-3 manifest ────────────────────────────────────

const DEVICES_DIR = path.resolve(import.meta.dirname, '../../../../devices');

describe('BOX-3 Deploy Integration: DeviceRegistry', () => {
  it('loads the BOX-3 device.json manifest correctly', () => {
    const registry = new DeviceRegistry(DEVICES_DIR);
    const device = registry.getDevice('esp32-s3-box3-agent');
    expect(device).toBeDefined();
    expect(device!.name).toBe('ESP32-S3-BOX-3 Voice Agent');
    expect(device!.board?.type).toBe('esp32-s3');
    expect(device!.board?.variant).toBe('box-3');
  });

  it('has esptool deploy method with runtime provision', () => {
    const registry = new DeviceRegistry(DEVICES_DIR);
    const device = registry.getDevice('esp32-s3-box3-agent');
    expect(device).toBeDefined();
    expect(device!.deploy.method).toBe('esptool');
    expect(device!.deploy.requires).toEqual(['agent_id', 'api_key', 'runtime_url']);
    const provision = (device!.deploy as any).runtime_provision;
    expect(provision).toBeDefined();
    expect(provision.required).toBe(true);
    expect(provision.config_fields).toEqual(['WIFI_SSID', 'WIFI_PASSWORD', 'WAKE_WORD']);
  });
});

// ── Mocks ───────────────────────────────────────────────────────────────

function makeMockHardwareService() {
  return {
    flashFiles: async () => ({ success: true, message: 'OK' }),
    wipeBoard: async () => ({ success: true, removed: [] }),
    resetBoard: async () => {},
    detectBoard: async () => null,
    detectBoardFast: async () => null,
    compile: async () => ({ success: true, errors: [], outputPath: '' }),
  };
}

// ── Flash Strategy Selection ────────────────────────────────────────────

describe('BOX-3 Deploy Integration: selectFlashStrategy', () => {
  it('returns EsptoolFlashStrategy for method "esptool"', () => {
    const hw = makeMockHardwareService();
    const strategy = selectFlashStrategy('esptool', hw as any);
    expect(strategy).toBeInstanceOf(EsptoolFlashStrategy);
  });

  it('returns MpremoteFlashStrategy for method "flash"', () => {
    const hw = makeMockHardwareService();
    const strategy = selectFlashStrategy('flash', hw as any);
    expect(strategy).toBeInstanceOf(MpremoteFlashStrategy);
  });
});

// ── Redeploy Classifier ─────────────────────────────────────────────────

describe('BOX-3 Deploy Integration: redeployClassifier', () => {
  it('returns firmware_required when WIFI_SSID changes', () => {
    const oldSpec = {
      devices: [{
        pluginId: 'esp32-s3-box3-agent',
        fields: { WIFI_SSID: 'OldNetwork', WIFI_PASSWORD: 'pass123' },
      }],
    };
    const newSpec = {
      devices: [{
        pluginId: 'esp32-s3-box3-agent',
        fields: { WIFI_SSID: 'NewNetwork', WIFI_PASSWORD: 'pass123' },
      }],
    };

    const result = classifyChanges(oldSpec, newSpec);
    expect(result.action).toBe('firmware_required');
    expect(result.reasons.some(r => r.includes('WIFI_SSID'))).toBe(true);
  });

  it('returns no_change when specs are identical', () => {
    const spec = {
      devices: [{
        pluginId: 'esp32-s3-box3-agent',
        fields: { WIFI_SSID: 'MyNetwork', WIFI_PASSWORD: 'pass123' },
      }],
      runtime: { agent_name: 'Buddy', voice: 'alloy' },
      deployment: { target: 'device' },
    };

    const result = classifyChanges(spec, spec);
    expect(result.action).toBe('no_change');
    expect(result.reasons).toHaveLength(0);
  });

  it('returns config_only when only runtime or deployment fields change', () => {
    const oldSpec = {
      devices: [{
        pluginId: 'esp32-s3-box3-agent',
        fields: { WIFI_SSID: 'MyNetwork', WIFI_PASSWORD: 'pass123' },
      }],
      runtime: { agent_name: 'Buddy', voice: 'alloy', display_theme: 'ocean' },
      deployment: { target: 'device', auto_flash: true },
    };
    const newSpec = {
      devices: [{
        pluginId: 'esp32-s3-box3-agent',
        fields: { WIFI_SSID: 'MyNetwork', WIFI_PASSWORD: 'pass123' },
      }],
      runtime: { agent_name: 'Helper', voice: 'nova', display_theme: 'forest' },
      deployment: { target: 'device', auto_flash: false },
    };

    const result = classifyChanges(oldSpec, newSpec);
    expect(result.action).toBe('config_only');
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});
