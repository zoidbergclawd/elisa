/**
 * Redeploy decision matrix classifier.
 *
 * Compares two NuggetSpec objects and determines whether changes require
 * a full firmware reflash, just a runtime config update, or no action.
 *
 * From PRD-002 Section 6.1:
 *   - config_only: personality, backpack, tools, voice, display theme
 *   - firmware_required: WiFi SSID/password changed, wake word changed,
 *     device plugin changed, devices added/removed, firmware file changed
 *   - no_change: specs are identical for device-related fields
 */

import type { NuggetSpec } from '../utils/specValidator.js';

// ── Types ───────────────────────────────────────────────────────────────

export type RedeployAction = 'config_only' | 'firmware_required' | 'no_change';

export interface RedeployDecision {
  action: RedeployAction;
  reasons: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Deep-equal comparison for JSON-serializable values. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  if (typeof a === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
    for (const key of keys) {
      if (!deepEqual(aObj[key], bObj[key])) return false;
    }
    return true;
  }

  return false;
}

/**
 * Device fields that are baked into firmware and require a reflash.
 * These correspond to values written to config.py or template placeholders
 * that are compiled into the firmware binary.
 */
const FIRMWARE_DEVICE_FIELDS = new Set([
  'wifi_ssid',
  'wifi_password',
  'WIFI_SSID',
  'WIFI_PASSWORD',
  'wake_word',
  'WAKE_WORD',
  'lora_channel',
  'lora_band',
  'device_name',
]);

// ── Classifier ──────────────────────────────────────────────────────────

/**
 * Classify what kind of redeployment is needed when a NuggetSpec changes.
 *
 * Compares device-relevant sections of two specs:
 *   - `devices` array (plugin IDs, instance IDs, field values)
 *   - `deployment` section (target, auto_flash, runtime_url, provision_runtime)
 *   - `runtime` section (agent_name, greeting, fallback_response, voice, display_theme)
 *
 * @param oldSpec - The previously deployed NuggetSpec
 * @param newSpec - The new NuggetSpec to deploy
 * @returns RedeployDecision with action and human-readable reasons
 */
export function classifyChanges(
  oldSpec: NuggetSpec,
  newSpec: NuggetSpec,
): RedeployDecision {
  const reasons: string[] = [];
  let needsFirmware = false;
  let hasChanges = false;

  // 1. Compare devices array — structural changes always require firmware
  const oldDevices: any[] = oldSpec.devices ?? [];
  const newDevices: any[] = newSpec.devices ?? [];

  // Device count changed
  if (oldDevices.length !== newDevices.length) {
    needsFirmware = true;
    hasChanges = true;
    if (newDevices.length > oldDevices.length) {
      reasons.push('New device added');
    } else {
      reasons.push('Device removed');
    }
  }

  // Compare each device
  const maxLen = Math.max(oldDevices.length, newDevices.length);
  for (let i = 0; i < maxLen; i++) {
    const oldDev = oldDevices[i];
    const newDev = newDevices[i];

    if (!oldDev || !newDev) continue; // Already counted as add/remove above

    // Plugin changed
    if (oldDev.pluginId !== newDev.pluginId) {
      needsFirmware = true;
      hasChanges = true;
      reasons.push(`Device plugin changed: ${oldDev.pluginId} -> ${newDev.pluginId}`);
      continue;
    }

    // Check device fields
    const oldFields = oldDev.fields ?? {};
    const newFields = newDev.fields ?? {};
    const allFieldKeys = new Set([...Object.keys(oldFields), ...Object.keys(newFields)]);

    for (const key of allFieldKeys) {
      if (!deepEqual(oldFields[key], newFields[key])) {
        hasChanges = true;
        if (FIRMWARE_DEVICE_FIELDS.has(key)) {
          needsFirmware = true;
          reasons.push(`Firmware field changed: ${key}`);
        } else {
          reasons.push(`Config field changed: ${key}`);
        }
      }
    }
  }

  // 2. Compare deployment section
  const oldDeploy = oldSpec.deployment ?? {};
  const newDeploy = newSpec.deployment ?? {};

  if (!deepEqual(oldDeploy, newDeploy)) {
    hasChanges = true;

    // Check specific deployment fields
    if (oldDeploy.target !== newDeploy.target) {
      needsFirmware = true;
      reasons.push('Deployment target changed');
    }
    if (oldDeploy.auto_flash !== newDeploy.auto_flash) {
      reasons.push('Auto-flash setting changed');
    }
    if (oldDeploy.runtime_url !== newDeploy.runtime_url) {
      needsFirmware = true;
      reasons.push('Runtime URL changed');
    }
    if (oldDeploy.provision_runtime !== newDeploy.provision_runtime) {
      reasons.push('Runtime provisioning setting changed');
    }
  }

  // 3. Compare runtime config — these are always config-only updates
  const oldRuntime = oldSpec.runtime ?? {};
  const newRuntime = newSpec.runtime ?? {};

  if (!deepEqual(oldRuntime, newRuntime)) {
    hasChanges = true;
    if (oldRuntime.agent_name !== newRuntime.agent_name) {
      reasons.push('Agent name changed');
    }
    if (oldRuntime.greeting !== newRuntime.greeting) {
      reasons.push('Greeting changed');
    }
    if (oldRuntime.fallback_response !== newRuntime.fallback_response) {
      reasons.push('Fallback response changed');
    }
    if (oldRuntime.voice !== newRuntime.voice) {
      reasons.push('Voice changed');
    }
    if (oldRuntime.display_theme !== newRuntime.display_theme) {
      reasons.push('Display theme changed');
    }
  }

  // Determine final action
  if (!hasChanges) {
    return { action: 'no_change', reasons: [] };
  }

  return {
    action: needsFirmware ? 'firmware_required' : 'config_only',
    reasons,
  };
}
