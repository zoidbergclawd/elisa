import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildRuntimeConfig } from '../../services/flashStrategy.js';
import { DEFAULT_FACE } from '../../models/display.js';

// ── Paths ──────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../');
const FIRMWARE_DIR = path.join(REPO_ROOT, 'devices/esp32-s3-box3-agent/firmware');
const MAIN_DIR = path.join(FIRMWARE_DIR, 'main');

// ── buildRuntimeConfig ─────────────────────────────────────────────────

describe('buildRuntimeConfig', () => {
  it('includes all expected fields', () => {
    const injections = {
      agent_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      api_key: 'eart_testkey123',
      runtime_url: 'http://localhost:8000',
    };
    const deviceFields = {
      WIFI_SSID: 'TestNetwork',
      WIFI_PASSWORD: 'secret123',
      AGENT_NAME: 'Buddy',
      WAKE_WORD: 'hey_box',
      DISPLAY_THEME: 'forest',
    };

    const config = buildRuntimeConfig(injections, deviceFields);

    expect(config.agent_id).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(config.api_key).toBe('eart_testkey123');
    expect(config.runtime_url).toBe('http://localhost:8000');
    expect(config.wifi_ssid).toBe('TestNetwork');
    expect(config.wifi_password).toBe('secret123');
    expect(config.agent_name).toBe('Buddy');
    expect(config.wake_word).toBe('hey_box');
    expect(config.display_theme).toBe('forest');
    expect(config.face_descriptor).toEqual(DEFAULT_FACE);
  });

  it('uses uppercase injection keys as fallback', () => {
    const injections = {
      AGENT_ID: 'uppercase-id',
      API_KEY: 'eart_upper',
      RUNTIME_URL: 'http://example.com',
    };

    const config = buildRuntimeConfig(injections, {});

    expect(config.agent_id).toBe('uppercase-id');
    expect(config.api_key).toBe('eart_upper');
    expect(config.runtime_url).toBe('http://example.com');
  });

  it('applies defaults for missing device fields', () => {
    const config = buildRuntimeConfig(
      { agent_id: 'id', api_key: 'key', runtime_url: 'url' },
      {},
    );

    expect(config.wifi_ssid).toBe('');
    expect(config.wifi_password).toBe('');
    expect(config.agent_name).toBe('Elisa Agent');
    expect(config.wake_word).toBe('Hi Elisa');
    expect(config.display_theme).toBe('default');
  });

  it('uses provided face_descriptor when available', () => {
    const customFace = {
      base_shape: 'square' as const,
      eyes: { style: 'anime' as const, size: 'large' as const, color: '#ff0000' },
      mouth: { style: 'cat' as const },
      expression: 'cool' as const,
      colors: { face: '#000000', accent: '#ffffff' },
    };

    const config = buildRuntimeConfig(
      { agent_id: 'id', api_key: 'key', runtime_url: 'url' },
      {},
      { face_descriptor: customFace },
    );

    expect(config.face_descriptor).toEqual(customFace);
  });

  it('falls back to DEFAULT_FACE when runtimeConfig has no face_descriptor', () => {
    const config = buildRuntimeConfig(
      { agent_id: 'id', api_key: 'key', runtime_url: 'url' },
      {},
      {},
    );

    expect(config.face_descriptor).toEqual(DEFAULT_FACE);
  });

  it('produces valid JSON when serialized', () => {
    const config = buildRuntimeConfig(
      { agent_id: 'test', api_key: 'eart_x', runtime_url: 'http://x' },
      { WIFI_SSID: 'net', WIFI_PASSWORD: 'pw' },
    );

    const json = JSON.stringify(config, null, 2);
    const parsed = JSON.parse(json);

    expect(parsed.agent_id).toBe('test');
    expect(parsed.face_descriptor.base_shape).toBe('round');
  });
});

// ── runtime_config.schema.json ──────────────────────────────────────────

describe('runtime_config.schema.json', () => {
  const schemaPath = path.join(FIRMWARE_DIR, 'runtime_config.schema.json');

  it('exists and is valid JSON', () => {
    expect(fs.existsSync(schemaPath)).toBe(true);
    const content = fs.readFileSync(schemaPath, 'utf-8');
    const schema = JSON.parse(content);
    expect(schema).toBeDefined();
  });

  it('has the expected JSON Schema structure', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

    expect(schema.$schema).toContain('json-schema.org');
    expect(schema.type).toBe('object');
    expect(schema.required).toContain('agent_id');
    expect(schema.required).toContain('api_key');
    expect(schema.required).toContain('runtime_url');
    expect(schema.required).toContain('wifi_ssid');
    expect(schema.required).toContain('wifi_password');
  });

  it('declares all config fields as properties', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
    const expectedFields = [
      'agent_id', 'api_key', 'runtime_url',
      'wifi_ssid', 'wifi_password',
      'agent_name', 'wake_word', 'display_theme',
      'face_descriptor',
    ];

    for (const field of expectedFields) {
      expect(schema.properties).toHaveProperty(field);
    }
  });

  it('declares face_descriptor with correct substructure', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
    const face = schema.properties.face_descriptor;

    expect(face.type).toBe('object');
    expect(face.required).toContain('base_shape');
    expect(face.required).toContain('eyes');
    expect(face.required).toContain('mouth');
    expect(face.required).toContain('expression');
    expect(face.required).toContain('colors');
    expect(face.properties.eyes.properties.style.enum).toContain('anime');
    expect(face.properties.mouth.properties.style.enum).toContain('cat');
    expect(face.properties.base_shape.enum).toEqual(['round', 'square', 'oval']);
  });

  it('schema properties match buildRuntimeConfig output keys', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
    const config = buildRuntimeConfig(
      { agent_id: 'id', api_key: 'key', runtime_url: 'url' },
      {},
    );

    const schemaKeys = Object.keys(schema.properties).sort();
    const configKeys = Object.keys(config).sort();

    expect(configKeys).toEqual(schemaKeys);
  });
});

// ── Firmware scaffold files ─────────────────────────────────────────────

describe('firmware scaffold files', () => {
  const expectedFiles = [
    'main/elisa_config.h',
    'main/elisa_config.c',
    'main/elisa_api.h',
    'main/elisa_api.c',
    'main/elisa_face.h',
    'main/elisa_face.c',
    'main/elisa_main.c',
    'runtime_config.schema.json',
    'README.md',
  ];

  for (const file of expectedFiles) {
    it(`${file} exists`, () => {
      const fullPath = path.join(FIRMWARE_DIR, file);
      expect(fs.existsSync(fullPath)).toBe(true);
    });
  }

  it('elisa_config.h declares the config struct and face state enum', () => {
    const content = fs.readFileSync(path.join(MAIN_DIR, 'elisa_config.h'), 'utf-8');
    expect(content).toContain('elisa_runtime_config_t');
    expect(content).toContain('face_state_t');
    expect(content).toContain('FACE_STATE_IDLE');
    expect(content).toContain('FACE_STATE_LISTENING');
    expect(content).toContain('FACE_STATE_THINKING');
    expect(content).toContain('FACE_STATE_SPEAKING');
    expect(content).toContain('FACE_STATE_ERROR');
    expect(content).toContain('face_descriptor_t');
  });

  it('elisa_api.h declares the runtime API functions', () => {
    const content = fs.readFileSync(path.join(MAIN_DIR, 'elisa_api.h'), 'utf-8');
    expect(content).toContain('elisa_api_init');
    expect(content).toContain('elisa_api_audio_turn');
    expect(content).toContain('elisa_api_heartbeat');
    expect(content).toContain('/v1/agents/:id/turn/audio');
  });

  it('elisa_face.h declares the face renderer functions', () => {
    const content = fs.readFileSync(path.join(MAIN_DIR, 'elisa_face.h'), 'utf-8');
    expect(content).toContain('elisa_face_init');
    expect(content).toContain('elisa_face_set_state');
    expect(content).toContain('elisa_face_set_audio_level');
  });

  it('elisa_main.c references all Elisa components', () => {
    const content = fs.readFileSync(path.join(MAIN_DIR, 'elisa_main.c'), 'utf-8');
    expect(content).toContain('#include "elisa_config.h"');
    expect(content).toContain('#include "elisa_api.h"');
    expect(content).toContain('#include "elisa_face.h"');
    expect(content).toContain('app_main');
    expect(content).toContain('elisa_load_config');
    expect(content).toContain('elisa_face_init');
    expect(content).toContain('elisa_api_init');
  });

  it('elisa_config.c reads from /spiffs/runtime_config.json', () => {
    const content = fs.readFileSync(path.join(MAIN_DIR, 'elisa_config.c'), 'utf-8');
    expect(content).toContain('/spiffs/runtime_config.json');
    expect(content).toContain('cJSON');
  });
});
