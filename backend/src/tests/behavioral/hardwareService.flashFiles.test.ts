import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock serialport before importing HardwareService
vi.mock('serialport', () => ({
  SerialPort: vi.fn(),
}));

import { HardwareService } from '../../services/hardwareService.js';

describe('HardwareService.flashFiles', () => {
  let service: HardwareService;

  beforeEach(() => {
    service = new HardwareService();
  });

  it('flashFiles method exists', () => {
    expect(typeof service.flashFiles).toBe('function');
  });

  it('flashFiles returns success for empty file list', async () => {
    const result = await service.flashFiles('/tmp/test', []);
    expect(result.success).toBe(true);
  });
});
