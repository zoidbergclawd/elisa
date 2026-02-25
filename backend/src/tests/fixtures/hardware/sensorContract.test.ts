// backend/src/tests/fixtures/hardware/sensorContract.test.ts
import { describe, it, expect } from 'vitest';

describe('DHT22 sensor data contract', () => {
  it('valid temperature range is -40 to 80 Celsius', () => {
    const isValidTemp = (t: number) => t >= -40 && t <= 80;
    expect(isValidTemp(22.5)).toBe(true);
    expect(isValidTemp(-41)).toBe(false);
    expect(isValidTemp(81)).toBe(false);
    expect(isValidTemp(NaN)).toBe(false);
  });

  it('valid humidity range is 0 to 100 percent', () => {
    const isValidHumidity = (h: number) => h >= 0 && h <= 100;
    expect(isValidHumidity(55.2)).toBe(true);
    expect(isValidHumidity(-1)).toBe(false);
    expect(isValidHumidity(101)).toBe(false);
  });

  it('sensor reading packet includes all expected fields', () => {
    const packet = {
      dht22: { temperature: 22.5, humidity: 55.0 },
      reed: { door_opened: false },
      pir: { motion_detected: true },
      ts: 1234567890,
    };
    expect(packet).toHaveProperty('dht22.temperature');
    expect(packet).toHaveProperty('dht22.humidity');
    expect(packet).toHaveProperty('reed.door_opened');
    expect(packet).toHaveProperty('pir.motion_detected');
    expect(packet).toHaveProperty('ts');
  });
});
