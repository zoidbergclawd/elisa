/**
 * Runtime agent provisioner interface and implementations.
 *
 * At deploy time, the runtime compiles the kid's NuggetSpec into a stored
 * agent configuration. The provisioner handles:
 *   - POST /v1/agents -> { agent_id, api_key, runtime_url }
 *   - PUT /v1/agents/:id for config-only updates (no reflash)
 *   - Classifying changes as config-only vs firmware-required
 *
 * Two implementations:
 *   - StubRuntimeProvisioner: Returns mock values (for tests/dev without runtime).
 *   - LocalRuntimeProvisioner: Calls the in-process AgentStore directly.
 */

import { randomUUID } from 'node:crypto';
import type { DeviceManifest } from '../utils/deviceManifestSchema.js';
import type { AgentStore } from './runtime/agentStore.js';

// ── Interfaces ──────────────────────────────────────────────────────────

export interface ProvisionResult {
  agent_id: string;
  api_key: string;
  runtime_url: string;
}

export interface RuntimeProvisioner {
  /** Provision a new agent in the runtime. Returns credentials for device config. */
  provision(spec: Record<string, any>): Promise<ProvisionResult>;

  /** Update an existing agent's config (no reflash needed). */
  updateConfig(agentId: string, spec: Record<string, any>): Promise<void>;

  /**
   * Check if changes require firmware reflash or just config update.
   * Config-only changes: personality, backpack, tools.
   * Firmware-required changes: WiFi credentials, wake word.
   */
  classifyChanges(
    oldSpec: Record<string, any>,
    newSpec: Record<string, any>,
    manifest: DeviceManifest,
  ): 'config_only' | 'firmware_required';
}

// ── Fields that always require firmware reflash ─────────────────────────

/**
 * Device fields that are baked into firmware and require a reflash when changed.
 * These are values written to config.py or template placeholders on the device.
 */
const FIRMWARE_FIELDS = new Set([
  'wifi_ssid',
  'wifi_password',
  'wake_word',
  'lora_channel',
  'lora_band',
  'device_name',
]);

// ── Stub Implementation ─────────────────────────────────────────────────

/**
 * Stub runtime provisioner that returns mock values.
 * The real implementation will call POST /v1/agents on the runtime service.
 * This stub is a drop-in replacement: same interface, fake data.
 */
export class StubRuntimeProvisioner implements RuntimeProvisioner {
  private runtimeUrl: string;

  constructor(runtimeUrl = 'http://localhost:9000') {
    this.runtimeUrl = runtimeUrl;
  }

  async provision(spec: Record<string, any>): Promise<ProvisionResult> {
    const agentId = randomUUID();
    const apiKey = `stub_key_${randomUUID().replace(/-/g, '').slice(0, 24)}`;

    console.log(`[RuntimeProvisioner:stub] provision called`, {
      agentId,
      specKeys: Object.keys(spec),
    });

    return {
      agent_id: agentId,
      api_key: apiKey,
      runtime_url: this.runtimeUrl,
    };
  }

  async updateConfig(agentId: string, spec: Record<string, any>): Promise<void> {
    console.log(`[RuntimeProvisioner:stub] updateConfig called`, {
      agentId,
      specKeys: Object.keys(spec),
    });
    // Stub: no-op. Real implementation will PUT /v1/agents/:id
  }

  classifyChanges(
    oldSpec: Record<string, any>,
    newSpec: Record<string, any>,
    manifest: DeviceManifest,
  ): 'config_only' | 'firmware_required' {
    // Check device fields that require firmware reflash
    const oldFields = oldSpec.fields ?? {};
    const newFields = newSpec.fields ?? {};

    for (const field of FIRMWARE_FIELDS) {
      const oldVal = oldFields[field];
      const newVal = newFields[field];
      if (oldVal !== newVal && (oldVal !== undefined || newVal !== undefined)) {
        console.log(`[RuntimeProvisioner:stub] classifyChanges: firmware_required (field: ${field})`);
        return 'firmware_required';
      }
    }

    // Check manifest-specific config_fields if runtime_provision is configured
    const deploy = manifest.deploy as any;
    if (deploy.runtime_provision?.config_fields) {
      const configFields = new Set(deploy.runtime_provision.config_fields as string[]);
      // Any field NOT in config_fields that changed => firmware required
      for (const key of Object.keys({ ...oldFields, ...newFields })) {
        if (!configFields.has(key) && !FIRMWARE_FIELDS.has(key)) {
          const oldVal = oldFields[key];
          const newVal = newFields[key];
          if (oldVal !== newVal && (oldVal !== undefined || newVal !== undefined)) {
            console.log(`[RuntimeProvisioner:stub] classifyChanges: firmware_required (non-config field: ${key})`);
            return 'firmware_required';
          }
        }
      }
    }

    console.log(`[RuntimeProvisioner:stub] classifyChanges: config_only`);
    return 'config_only';
  }
}

// ── Local Implementation (in-process AgentStore) ─────────────────────

/**
 * Local runtime provisioner that uses the in-process AgentStore.
 * Replaces StubRuntimeProvisioner when the Agent Runtime is running
 * within the same backend process.
 */
export class LocalRuntimeProvisioner implements RuntimeProvisioner {
  private agentStore: AgentStore;

  constructor(agentStore: AgentStore) {
    this.agentStore = agentStore;
  }

  async provision(spec: Record<string, any>): Promise<ProvisionResult> {
    const result = this.agentStore.provision(spec);

    console.log(`[RuntimeProvisioner:local] provision complete`, {
      agentId: result.agent_id,
      runtimeUrl: result.runtime_url,
    });

    return result;
  }

  async updateConfig(agentId: string, spec: Record<string, any>): Promise<void> {
    this.agentStore.update(agentId, spec);

    console.log(`[RuntimeProvisioner:local] updateConfig complete`, {
      agentId,
      specKeys: Object.keys(spec),
    });
  }

  classifyChanges(
    oldSpec: Record<string, any>,
    newSpec: Record<string, any>,
    manifest: DeviceManifest,
  ): 'config_only' | 'firmware_required' {
    // Check device fields that require firmware reflash
    const oldFields = oldSpec.fields ?? {};
    const newFields = newSpec.fields ?? {};

    for (const field of FIRMWARE_FIELDS) {
      const oldVal = oldFields[field];
      const newVal = newFields[field];
      if (oldVal !== newVal && (oldVal !== undefined || newVal !== undefined)) {
        return 'firmware_required';
      }
    }

    // Check manifest-specific config_fields if runtime_provision is configured
    const deploy = manifest.deploy as any;
    if (deploy.runtime_provision?.config_fields) {
      const configFields = new Set(deploy.runtime_provision.config_fields as string[]);
      for (const key of Object.keys({ ...oldFields, ...newFields })) {
        if (!configFields.has(key) && !FIRMWARE_FIELDS.has(key)) {
          const oldVal = oldFields[key];
          const newVal = newFields[key];
          if (oldVal !== newVal && (oldVal !== undefined || newVal !== undefined)) {
            return 'firmware_required';
          }
        }
      }
    }

    return 'config_only';
  }
}
