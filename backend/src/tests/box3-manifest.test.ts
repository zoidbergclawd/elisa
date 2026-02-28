import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DeviceManifestSchema } from '../utils/deviceManifestSchema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.resolve(__dirname, '../../../devices/esp32-s3-box3-agent/device.json');

function loadManifest(): unknown {
  const raw = fs.readFileSync(manifestPath, 'utf-8');
  return JSON.parse(raw);
}

describe('BOX-3 device.json manifest', () => {
  it('file exists on disk', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
  });

  it('validates against DeviceManifestSchema', () => {
    const raw = loadManifest();
    const result = DeviceManifestSchema.safeParse(raw);
    if (!result.success) {
      // Surface Zod errors for debugging
      const messages = result.error.issues.map(
        (i) => `${i.path.join('.')}: ${i.message}`,
      );
      throw new Error(`Schema validation failed:\n${messages.join('\n')}`);
    }
    expect(result.success).toBe(true);
  });

  describe('identity fields', () => {
    it('has correct id', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      expect(result.id).toBe('esp32-s3-box3-agent');
    });

    it('has correct version format', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      expect(result.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('has a description', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      expect(result.description.length).toBeGreaterThan(0);
    });
  });

  describe('board configuration', () => {
    it('targets esp32-s3 board type', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      expect(result.board).not.toBeNull();
      expect(result.board!.type).toBe('esp32-s3');
    });

    it('uses wifi connection (not serial)', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      expect(result.board!.connection).toBe('wifi');
    });

    it('has Espressif USB VID (0x303A)', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      expect(result.board!.detection?.usb_vid).toBe('0x303A');
    });

    it('has USB PID for detection', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      expect(result.board!.detection?.usb_pid).toBeDefined();
      expect(result.board!.detection!.usb_pid).toMatch(/^0x[0-9A-Fa-f]{4}$/);
    });
  });

  describe('capabilities', () => {
    it('has at least 7 capabilities', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      expect(result.capabilities.length).toBeGreaterThanOrEqual(7);
    });

    it('includes microphone sensor', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      const mic = result.capabilities.find((c) => c.id === 'microphone');
      expect(mic).toBeDefined();
      expect(mic!.kind).toBe('sensor');
    });

    it('includes speaker actuator', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      const spk = result.capabilities.find((c) => c.id === 'speaker');
      expect(spk).toBeDefined();
      expect(spk!.kind).toBe('actuator');
    });

    it('includes touchscreen display', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      const ts = result.capabilities.find((c) => c.id === 'touchscreen');
      expect(ts).toBeDefined();
      expect(ts!.kind).toBe('display');
    });

    it('touchscreen has width and height params', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      const ts = result.capabilities.find((c) => c.id === 'touchscreen')!;
      const width = ts.params.find((p) => p.name === 'width');
      const height = ts.params.find((p) => p.name === 'height');
      expect(width).toBeDefined();
      expect(width!.default).toBe(320);
      expect(height).toBeDefined();
      expect(height!.default).toBe(240);
    });

    it('includes wifi network capability with ssid and password params', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      const wifi = result.capabilities.find((c) => c.id === 'wifi');
      expect(wifi).toBeDefined();
      expect(wifi!.kind).toBe('network');
      const ssid = wifi!.params.find((p) => p.name === 'ssid');
      const password = wifi!.params.find((p) => p.name === 'password');
      expect(ssid).toBeDefined();
      expect(ssid!.type).toBe('string');
      expect(password).toBeDefined();
      expect(password!.type).toBe('string');
    });

    it('includes wake_word compute capability', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      const ww = result.capabilities.find((c) => c.id === 'wake_word');
      expect(ww).toBeDefined();
      expect(ww!.kind).toBe('compute');
      const param = ww!.params.find((p) => p.name === 'wake_word');
      expect(param).toBeDefined();
      expect(param!.default).toBe('hey_elisa');
    });

    it('includes runtime_client compute capability', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      const rc = result.capabilities.find((c) => c.id === 'runtime_client');
      expect(rc).toBeDefined();
      expect(rc!.kind).toBe('compute');
      const paramNames = rc!.params.map((p) => p.name);
      expect(paramNames).toContain('agent_id');
      expect(paramNames).toContain('api_key');
      expect(paramNames).toContain('runtime_url');
    });
  });

  describe('esptool deploy configuration', () => {
    it('uses esptool deploy method (not flash or cloud)', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      expect(result.deploy.method).toBe('esptool');
    });

    it('requires agent_id, api_key, and runtime_url', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      expect(result.deploy.requires).toContain('agent_id');
      expect(result.deploy.requires).toContain('api_key');
      expect(result.deploy.requires).toContain('runtime_url');
    });

    it('provides box3_agent_endpoint', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      expect(result.deploy.provides).toEqual(['box3_agent_endpoint']);
    });

    it('has esptool config with firmware file', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      // Type narrowing: only esptool deploy has the `esptool` property
      if (result.deploy.method !== 'esptool') throw new Error('Expected esptool deploy');
      expect(result.deploy.esptool.firmware_file).toBe('firmware/box3-agent.bin');
    });

    it('targets esp32s3 chip', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      if (result.deploy.method !== 'esptool') throw new Error('Expected esptool deploy');
      expect(result.deploy.esptool.chip).toBe('esp32s3');
    });

    it('uses 460800 baud rate', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      if (result.deploy.method !== 'esptool') throw new Error('Expected esptool deploy');
      expect(result.deploy.esptool.baud_rate).toBe(460800);
    });

    it('has a prompt message for USB-C connection', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      if (result.deploy.method !== 'esptool') throw new Error('Expected esptool deploy');
      expect(result.deploy.esptool.prompt_message).toContain('USB-C');
    });
  });

  describe('runtime_provision', () => {
    it('runtime_provision is required', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      if (result.deploy.method !== 'esptool') throw new Error('Expected esptool deploy');
      expect(result.deploy.runtime_provision).toBeDefined();
      expect(result.deploy.runtime_provision!.required).toBe(true);
    });

    it('config_fields include WIFI_SSID, WIFI_PASSWORD, WAKE_WORD', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      if (result.deploy.method !== 'esptool') throw new Error('Expected esptool deploy');
      const fields = result.deploy.runtime_provision!.config_fields;
      expect(fields).toContain('WIFI_SSID');
      expect(fields).toContain('WIFI_PASSWORD');
      expect(fields).toContain('WAKE_WORD');
    });
  });

  describe('block definitions', () => {
    it('has two block definitions', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      expect(result.blocks).toHaveLength(2);
    });

    it('main block type is esp32_s3_box3_agent', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      expect(result.blocks[0].type).toBe('esp32_s3_box3_agent');
    });

    it('main block has AGENT_NAME, WAKE_WORD, TTS_VOICE, WIFI_SSID, WIFI_PASSWORD fields', () => {
      const raw = loadManifest() as any;
      const args = raw.blocks[0].args;
      const fieldNames = args
        .filter((a: any) => a.name)
        .map((a: any) => a.name);
      expect(fieldNames).toContain('AGENT_NAME');
      expect(fieldNames).toContain('WAKE_WORD');
      expect(fieldNames).toContain('TTS_VOICE');
      expect(fieldNames).toContain('WIFI_SSID');
      expect(fieldNames).toContain('WIFI_PASSWORD');
    });

    it('WAKE_WORD options match PRD: hey_elisa, hey_box, hi_alex, hey_computer', () => {
      const raw = loadManifest() as any;
      const wakeWord = raw.blocks[0].args.find(
        (a: any) => a.name === 'WAKE_WORD',
      );
      expect(wakeWord).toBeDefined();
      expect(wakeWord.type).toBe('field_dropdown');
      const values = wakeWord.options.map((o: [string, string]) => o[1]);
      expect(values).toEqual(['hey_elisa', 'hey_box', 'hi_alex', 'hey_computer']);
    });

    it('TTS_VOICE options are nova, onyx, shimmer, echo', () => {
      const raw = loadManifest() as any;
      const voice = raw.blocks[0].args.find(
        (a: any) => a.name === 'TTS_VOICE',
      );
      expect(voice).toBeDefined();
      expect(voice.type).toBe('field_dropdown');
      const values = voice.options.map((o: [string, string]) => o[1]);
      expect(values).toEqual(['nova', 'onyx', 'shimmer', 'echo']);
    });

    it('display block type is esp32_s3_box3_display', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      expect(result.blocks[1].type).toBe('esp32_s3_box3_display');
    });

    it('display block has DISPLAY_THEME, SHOW_LISTENING, SHOW_TRANSCRIPTION fields', () => {
      const raw = loadManifest() as any;
      const args = raw.blocks[1].args;
      const fieldNames = args
        .filter((a: any) => a.name)
        .map((a: any) => a.name);
      expect(fieldNames).toContain('DISPLAY_THEME');
      expect(fieldNames).toContain('SHOW_LISTENING');
      expect(fieldNames).toContain('SHOW_TRANSCRIPTION');
    });

    it('DISPLAY_THEME options match all 9 canonical themes from DEFAULT_THEMES', () => {
      const raw = loadManifest() as any;
      const themeField = raw.blocks[1].args.find(
        (a: any) => a.name === 'DISPLAY_THEME',
      );
      expect(themeField).toBeDefined();
      expect(themeField.type).toBe('field_dropdown');
      const values = themeField.options.map((o: [string, string]) => o[1]);
      expect(values).toEqual([
        'default', 'forest', 'sunset', 'pixel',
        'space', 'nature', 'tech', 'candy', 'plain',
      ]);
    });
  });

  describe('spec_mapping', () => {
    it('has spec_mapping with voice_agent_device role', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      expect(result.spec_mapping).toBeDefined();
      expect(result.spec_mapping!.role).toBe('voice_agent_device');
    });

    it('extract_fields map block fields to spec fields', () => {
      const result = DeviceManifestSchema.parse(loadManifest());
      const fields = result.spec_mapping!.extract_fields;
      expect(fields).toHaveProperty('agent.name');
      expect(fields).toHaveProperty('agent.wake_word');
      expect(fields).toHaveProperty('agent.voice');
      expect(fields).toHaveProperty('wifi.ssid');
      expect(fields).toHaveProperty('wifi.password');
      expect(fields).toHaveProperty('display.theme');
      expect(fields).toHaveProperty('display.show_listening');
      expect(fields).toHaveProperty('display.show_transcription');
    });
  });

  describe('agent context prompt', () => {
    it('agent-context.md exists in prompts directory', () => {
      const promptPath = path.resolve(
        manifestPath,
        '../prompts/agent-context.md',
      );
      expect(fs.existsSync(promptPath)).toBe(true);
    });

    it('agent-context.md mentions not generating firmware or MicroPython', () => {
      const promptPath = path.resolve(
        manifestPath,
        '../prompts/agent-context.md',
      );
      const content = fs.readFileSync(promptPath, 'utf-8');
      expect(content).toContain('ESP-IDF');
      expect(content).toContain('MicroPython');
    });

    it('agent-context.md covers audio pipeline', () => {
      const promptPath = path.resolve(
        manifestPath,
        '../prompts/agent-context.md',
      );
      const content = fs.readFileSync(promptPath, 'utf-8');
      expect(content).toContain('microphone');
      expect(content).toContain('Speaker');
      expect(content).toContain('TTS');
    });

    it('agent-context.md covers display themes', () => {
      const promptPath = path.resolve(
        manifestPath,
        '../prompts/agent-context.md',
      );
      const content = fs.readFileSync(promptPath, 'utf-8');
      expect(content).toContain('touchscreen');
      expect(content).toContain('DISPLAY_THEME');
    });

    it('agent-context.md references Device Instance fields', () => {
      const promptPath = path.resolve(
        manifestPath,
        '../prompts/agent-context.md',
      );
      const content = fs.readFileSync(promptPath, 'utf-8');
      expect(content).toContain('WIFI_SSID');
      expect(content).toContain('WIFI_PASSWORD');
      expect(content).toContain('WAKE_WORD');
    });
  });

  describe('firmware placeholder', () => {
    it('firmware directory has .gitkeep', () => {
      const gitkeepPath = path.resolve(
        manifestPath,
        '../firmware/.gitkeep',
      );
      expect(fs.existsSync(gitkeepPath)).toBe(true);
    });
  });
});
