import { describe, it, expect } from 'vitest';
import { interpretWorkspace } from './blockInterpreter';

function makeBlock(type: string, fields: Record<string, unknown> = {}, next?: any): any {
  return {
    type,
    id: `test_${type}_${Math.random().toString(36).slice(2)}`,
    fields,
    next: next ? { block: next } : undefined,
  };
}

function makeWorkspace(blocks: any[]): any {
  return { blocks: { blocks } };
}

describe('IoT block interpretation', () => {
  it('interprets iot_sensor_node block', () => {
    const block = makeBlock('iot_sensor_node', {
      SENSOR_DHT22: true,
      SENSOR_REED: true,
      SENSOR_PIR: false,
      HAS_OLED: true,
      LORA_CHANNEL: 1,
      INTERVAL: 10,
    });
    const ws = makeWorkspace([makeBlock('nugget_goal', { GOAL_TEXT: 'IoT' }, block)]);
    const spec = interpretWorkspace(ws);
    expect(spec.hardware).toBeDefined();
    expect(spec.hardware!.devices).toHaveLength(1);
    expect(spec.hardware!.devices[0].role).toBe('sensor_node');
    expect(spec.hardware!.devices[0].sensors).toContain('dht22');
    expect(spec.hardware!.devices[0].sensors).toContain('reed_switch');
    expect(spec.hardware!.devices[0].sensors).not.toContain('pir');
    expect(spec.hardware!.devices[0].display).toBe('oled_ssd1306');
    expect(spec.hardware!.devices[0].lora.channel).toBe(1);
    expect(spec.deployment?.target).toBe('iot');
  });

  it('interprets iot_gateway_node block', () => {
    const block = makeBlock('iot_gateway_node', {
      LORA_CHANNEL: 1,
      WIFI_SSID: 'TestNet',
      WIFI_PASS: 'secret123',
    });
    const ws = makeWorkspace([makeBlock('nugget_goal', { GOAL_TEXT: 'IoT' }, block)]);
    const spec = interpretWorkspace(ws);
    expect(spec.hardware).toBeDefined();
    const gw = spec.hardware!.devices.find(d => d.role === 'gateway_node');
    expect(gw).toBeDefined();
    expect(gw!.lora.channel).toBe(1);
  });

  it('interprets iot_cloud_dashboard block', () => {
    const block = makeBlock('iot_cloud_dashboard', { GCP_PROJECT: 'my-proj' });
    const ws = makeWorkspace([makeBlock('nugget_goal', { GOAL_TEXT: 'IoT' }, block)]);
    const spec = interpretWorkspace(ws);
    expect(spec.hardware?.cloud).toBeDefined();
    expect(spec.hardware!.cloud!.platform).toBe('cloud_run');
    expect(spec.hardware!.cloud!.project).toBe('my-proj');
  });

  it('interprets write_guide block', () => {
    const block = makeBlock('write_guide', { GUIDE_FOCUS: 'all' });
    const ws = makeWorkspace([makeBlock('nugget_goal', { GOAL_TEXT: 'test' }, block)]);
    const spec = interpretWorkspace(ws);
    expect(spec.documentation).toBeDefined();
    expect(spec.documentation!.generate).toBe(true);
    expect(spec.documentation!.focus).toBe('all');
  });

  it('sets deployment target to iot when sensor node present', () => {
    const block = makeBlock('iot_sensor_node', {
      SENSOR_DHT22: true, SENSOR_REED: false, SENSOR_PIR: false,
      HAS_OLED: false, LORA_CHANNEL: 1, INTERVAL: 5,
    });
    const ws = makeWorkspace([makeBlock('nugget_goal', { GOAL_TEXT: 'IoT' }, block)]);
    const spec = interpretWorkspace(ws);
    expect(spec.deployment?.target).toBe('iot');
  });

  it('adds hardware component blocks to requirements', () => {
    const block = makeBlock('hw_read_dht22', {}, makeBlock('hw_oled_readings'));
    const ws = makeWorkspace([makeBlock('nugget_goal', { GOAL_TEXT: 'test' }, block)]);
    const spec = interpretWorkspace(ws);
    expect(spec.requirements?.some(r => {
      if (typeof r === 'string') return r.includes('DHT22') || r.includes('temperature');
      return r.description?.includes('DHT22') || r.description?.includes('temperature');
    })).toBe(true);
  });
});
