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
import type { NuggetSpec } from '../utils/specValidator.js';
import type { DeviceManifest } from '../utils/deviceManifestSchema.js';
import type { AgentStore } from './runtime/agentStore.js';
import { classifyChanges as classifyNuggetChanges } from './redeployClassifier.js';

// ── Interfaces ──────────────────────────────────────────────────────────

export interface ProvisionResult {
  agent_id: string;
  api_key: string;
  runtime_url: string;
}

export interface RuntimeProvisioner {
  /** Provision a new agent in the runtime. Returns credentials for device config. */
  provision(spec: NuggetSpec): Promise<ProvisionResult>;

  /** Update an existing agent's config (no reflash needed). */
  updateConfig(agentId: string, spec: NuggetSpec): Promise<void>;

  /**
   * Check if changes require firmware reflash or just config update.
   * Config-only changes: personality, backpack, tools.
   * Firmware-required changes: WiFi credentials, wake word.
   */
  classifyChanges(
    oldSpec: Record<string, unknown>,
    newSpec: Record<string, unknown>,
    manifest: DeviceManifest,
  ): 'config_only' | 'firmware_required';
}

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

  async provision(spec: NuggetSpec): Promise<ProvisionResult> {
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

  async updateConfig(agentId: string, spec: NuggetSpec): Promise<void> {
    console.log(`[RuntimeProvisioner:stub] updateConfig called`, {
      agentId,
      specKeys: Object.keys(spec),
    });
    // Stub: no-op. Real implementation will PUT /v1/agents/:id
  }

  classifyChanges(
    oldSpec: Record<string, unknown>,
    newSpec: Record<string, unknown>,
    manifest: DeviceManifest,
  ): 'config_only' | 'firmware_required' {
    // Use NuggetSpec-level classifier for firmware field detection
    const oldFields = (oldSpec.fields ?? {}) as Record<string, unknown>;
    const newFields = (newSpec.fields ?? {}) as Record<string, unknown>;
    const oldNugget = { devices: [{ pluginId: 'device', instanceId: 'i', fields: oldFields }] };
    const newNugget = { devices: [{ pluginId: 'device', instanceId: 'i', fields: newFields }] };
    const decision = classifyNuggetChanges(oldNugget, newNugget);
    if (decision.action === 'firmware_required') return 'firmware_required';

    // Additionally check manifest config_fields whitelist:
    // fields NOT in config_fields that changed require firmware
    return classifyByManifestConfigFields(oldSpec, newSpec, manifest);
  }
}

/**
 * Check device fields against the manifest's config_fields whitelist.
 * Any changed field that is not in the whitelist requires firmware.
 */
function classifyByManifestConfigFields(
  oldSpec: Record<string, unknown>,
  newSpec: Record<string, unknown>,
  manifest: DeviceManifest,
): 'config_only' | 'firmware_required' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deploy schema varies per device plugin; runtime_provision is an optional extension
  const deploy = manifest.deploy as Record<string, any>;
  if (!deploy.runtime_provision?.config_fields) return 'config_only';

  const configFields = new Set(deploy.runtime_provision.config_fields as string[]);
  const oldFields = (oldSpec.fields ?? {}) as Record<string, unknown>;
  const newFields = (newSpec.fields ?? {}) as Record<string, unknown>;

  for (const key of Object.keys({ ...oldFields, ...newFields })) {
    if (configFields.has(key)) continue;
    const oldVal = oldFields[key];
    const newVal = newFields[key];
    if (oldVal !== newVal && (oldVal !== undefined || newVal !== undefined)) {
      return 'firmware_required';
    }
  }
  return 'config_only';
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

  async provision(spec: NuggetSpec): Promise<ProvisionResult> {
    const result = this.agentStore.provision(spec);

    console.log(`[RuntimeProvisioner:local] provision complete`, {
      agentId: result.agent_id,
      runtimeUrl: result.runtime_url,
    });

    return result;
  }

  async updateConfig(agentId: string, spec: NuggetSpec): Promise<void> {
    this.agentStore.update(agentId, spec);

    console.log(`[RuntimeProvisioner:local] updateConfig complete`, {
      agentId,
      specKeys: Object.keys(spec),
    });
  }

  classifyChanges(
    oldSpec: Record<string, unknown>,
    newSpec: Record<string, unknown>,
    manifest: DeviceManifest,
  ): 'config_only' | 'firmware_required' {
    // Use NuggetSpec-level classifier for firmware field detection
    const oldFields = (oldSpec.fields ?? {}) as Record<string, unknown>;
    const newFields = (newSpec.fields ?? {}) as Record<string, unknown>;
    const oldNugget = { devices: [{ pluginId: 'device', instanceId: 'i', fields: oldFields }] };
    const newNugget = { devices: [{ pluginId: 'device', instanceId: 'i', fields: newFields }] };
    const decision = classifyNuggetChanges(oldNugget, newNugget);
    if (decision.action === 'firmware_required') return 'firmware_required';

    // Additionally check manifest config_fields whitelist
    return classifyByManifestConfigFields(oldSpec, newSpec, manifest);
  }
}
