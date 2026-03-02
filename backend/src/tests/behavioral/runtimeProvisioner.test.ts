import { describe, it, expect } from 'vitest';
import { StubRuntimeProvisioner } from '../../services/runtimeProvisioner.js';
import type { DeviceManifest } from '../../utils/deviceManifestSchema.js';

// ── Helpers ─────────────────────────────────────────────────────────────

function makeManifest(overrides: Record<string, any> = {}): DeviceManifest {
  return {
    id: 'test-device',
    name: 'Test Device',
    version: '1.0.0',
    description: 'A test device',
    colour: 45,
    board: { type: 'esp32', variant: 'heltec', connection: 'serial' },
    capabilities: [],
    blocks: [{
      type: 'test_block',
      message: 'Test %1',
      args: [{ type: 'input_dummy' }],
      previousStatement: true,
      nextStatement: true,
    }],
    deploy: {
      method: 'flash',
      provides: [],
      requires: [],
      flash: {
        files: ['main.py'],
        lib: [],
        shared_lib: [],
        prompt_message: 'Plug in',
      },
    },
    ...overrides,
  } as DeviceManifest;
}

// ── StubRuntimeProvisioner ──────────────────────────────────────────────

describe('StubRuntimeProvisioner', () => {
  describe('provision', () => {
    it('returns result with agent_id, api_key, and runtime_url', async () => {
      const provisioner = new StubRuntimeProvisioner();
      const result = await provisioner.provision({ name: 'test-nugget' });

      expect(result).toHaveProperty('agent_id');
      expect(result).toHaveProperty('api_key');
      expect(result).toHaveProperty('runtime_url');
    });

    it('returns a valid UUID as agent_id', async () => {
      const provisioner = new StubRuntimeProvisioner();
      const result = await provisioner.provision({});

      // UUID v4 format
      expect(result.agent_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('returns api_key with stub_key prefix', async () => {
      const provisioner = new StubRuntimeProvisioner();
      const result = await provisioner.provision({});

      expect(result.api_key).toMatch(/^stub_key_/);
    });

    it('uses default runtime_url when none provided', async () => {
      const provisioner = new StubRuntimeProvisioner();
      const result = await provisioner.provision({});

      expect(result.runtime_url).toBe('http://localhost:9000');
    });

    it('uses custom runtime_url when provided', async () => {
      const provisioner = new StubRuntimeProvisioner('https://runtime.example.com');
      const result = await provisioner.provision({});

      expect(result.runtime_url).toBe('https://runtime.example.com');
    });

    it('returns unique agent_ids on successive calls', async () => {
      const provisioner = new StubRuntimeProvisioner();
      const r1 = await provisioner.provision({});
      const r2 = await provisioner.provision({});

      expect(r1.agent_id).not.toBe(r2.agent_id);
      expect(r1.api_key).not.toBe(r2.api_key);
    });
  });

  describe('updateConfig', () => {
    it('resolves without error', async () => {
      const provisioner = new StubRuntimeProvisioner();
      await expect(
        provisioner.updateConfig('some-id', { personality: 'friendly' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('classifyChanges', () => {
    it('returns config_only when only non-firmware fields change', () => {
      const provisioner = new StubRuntimeProvisioner();
      const manifest = makeManifest();

      const result = provisioner.classifyChanges(
        { fields: { personality: 'friendly' } },
        { fields: { personality: 'brave' } },
        manifest,
      );

      expect(result).toBe('config_only');
    });

    it('returns firmware_required when wifi_ssid changes', () => {
      const provisioner = new StubRuntimeProvisioner();
      const manifest = makeManifest();

      const result = provisioner.classifyChanges(
        { fields: { wifi_ssid: 'OldNetwork' } },
        { fields: { wifi_ssid: 'NewNetwork' } },
        manifest,
      );

      expect(result).toBe('firmware_required');
    });

    it('returns firmware_required when wifi_password changes', () => {
      const provisioner = new StubRuntimeProvisioner();
      const manifest = makeManifest();

      const result = provisioner.classifyChanges(
        { fields: { wifi_password: 'old' } },
        { fields: { wifi_password: 'new' } },
        manifest,
      );

      expect(result).toBe('firmware_required');
    });

    it('returns firmware_required when wake_word changes', () => {
      const provisioner = new StubRuntimeProvisioner();
      const manifest = makeManifest();

      const result = provisioner.classifyChanges(
        { fields: { wake_word: 'hey elisa' } },
        { fields: { wake_word: 'hello elisa' } },
        manifest,
      );

      expect(result).toBe('firmware_required');
    });

    it('returns firmware_required when lora_channel changes', () => {
      const provisioner = new StubRuntimeProvisioner();
      const manifest = makeManifest();

      const result = provisioner.classifyChanges(
        { fields: { lora_channel: 1 } },
        { fields: { lora_channel: 5 } },
        manifest,
      );

      expect(result).toBe('firmware_required');
    });

    it('returns config_only when fields are identical', () => {
      const provisioner = new StubRuntimeProvisioner();
      const manifest = makeManifest();
      const spec = { fields: { wifi_ssid: 'MyNet', personality: 'kind' } };

      const result = provisioner.classifyChanges(spec, spec, manifest);

      expect(result).toBe('config_only');
    });

    it('returns config_only when no fields exist in either spec', () => {
      const provisioner = new StubRuntimeProvisioner();
      const manifest = makeManifest();

      const result = provisioner.classifyChanges({}, {}, manifest);

      expect(result).toBe('config_only');
    });

    it('returns firmware_required when a firmware field is added (not present in old)', () => {
      const provisioner = new StubRuntimeProvisioner();
      const manifest = makeManifest();

      const result = provisioner.classifyChanges(
        { fields: {} },
        { fields: { wifi_ssid: 'NewNet' } },
        manifest,
      );

      expect(result).toBe('firmware_required');
    });

    it('respects config_fields from runtime_provision in manifest', () => {
      const provisioner = new StubRuntimeProvisioner();
      const manifest = makeManifest({
        deploy: {
          method: 'flash',
          provides: [],
          requires: [],
          flash: { files: ['main.py'], lib: [], shared_lib: [], prompt_message: 'hi' },
          runtime_provision: {
            required: true,
            config_fields: ['personality', 'backpack'],
          },
        },
      });

      // Change a config_field -> config_only
      const r1 = provisioner.classifyChanges(
        { fields: { personality: 'friendly' } },
        { fields: { personality: 'brave' } },
        manifest,
      );
      expect(r1).toBe('config_only');

      // Change a non-config, non-firmware field -> firmware_required
      const r2 = provisioner.classifyChanges(
        { fields: { custom_hardware_param: 'a' } },
        { fields: { custom_hardware_param: 'b' } },
        manifest,
      );
      expect(r2).toBe('firmware_required');
    });
  });
});
