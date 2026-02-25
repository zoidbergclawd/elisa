/** Tests for CloudDeployService: API key generation, dashboard scaffolding, deploy command. */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process -- vi.mock factories are hoisted, so use vi.fn() inline
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

// Mock fs -- all functions as inline vi.fn() to avoid hoisting issues
vi.mock('node:fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    copyFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => ''),
    cpSync: vi.fn(),
  },
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  copyFileSync: vi.fn(),
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => ''),
  cpSync: vi.fn(),
}));

import fs from 'node:fs';
import { CloudDeployService } from '../../services/cloudDeployService.js';

describe('CloudDeployService', () => {
  let service: CloudDeployService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-set existsSync default return value after clearAllMocks
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('');
    service = new CloudDeployService();
  });

  it('generates an API key', () => {
    const key = service.generateApiKey();
    expect(key).toBeTruthy();
    expect(key.length).toBeGreaterThan(16);
  });

  it('generates unique API keys on each call', () => {
    const key1 = service.generateApiKey();
    const key2 = service.generateApiKey();
    expect(key1).not.toBe(key2);
  });

  it('generates a 32-character hex string', () => {
    const key = service.generateApiKey();
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it('scaffolds dashboard project in nugget directory', async () => {
    await service.scaffoldDashboard('/tmp/nugget', 'test-api-key');
    expect(fs.mkdirSync).toHaveBeenCalled();
  });

  it('scaffolds dashboard with public subdirectory', async () => {
    await service.scaffoldDashboard('/tmp/nugget', 'test-api-key');
    const mkdirCalls = vi.mocked(fs.mkdirSync).mock.calls;
    const createdPaths = mkdirCalls.map(c => c[0] as string);
    // Should create the public/ subdirectory
    expect(createdPaths.some(p => p.includes('public'))).toBe(true);
  });

  it('copies template files during scaffold', async () => {
    await service.scaffoldDashboard('/tmp/nugget', 'test-api-key');
    expect(fs.copyFileSync).toHaveBeenCalled();
  });

  it('injects API key into Dockerfile', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      'FROM node:20-alpine\nWORKDIR /app\nCMD ["node", "server.js"]\n',
    );
    await service.scaffoldDashboard('/tmp/nugget', 'test-api-key');

    const writeFileCalls = vi.mocked(fs.writeFileSync).mock.calls;
    const dockerfileWrite = writeFileCalls.find(
      c => (c[0] as string).includes('Dockerfile'),
    );
    expect(dockerfileWrite).toBeDefined();
    expect(dockerfileWrite![1]).toContain('API_KEY=test-api-key');
  });

  it('constructs correct gcloud deploy command', () => {
    const cmd = service.buildDeployCommand('/tmp/nugget/iot-dashboard', 'my-project', 'us-central1');
    expect(cmd).toContain('gcloud');
    expect(cmd).toContain('run');
    expect(cmd).toContain('deploy');
    expect(cmd).toContain('my-project');
  });

  it('includes region in deploy command', () => {
    const cmd = service.buildDeployCommand('/tmp/nugget/iot-dashboard', 'my-project', 'us-central1');
    expect(cmd).toContain('us-central1');
  });

  it('includes --allow-unauthenticated in deploy command', () => {
    const cmd = service.buildDeployCommand('/tmp/nugget/iot-dashboard', 'my-project', 'us-central1');
    expect(cmd).toContain('--allow-unauthenticated');
  });

  it('includes source directory in deploy command', () => {
    const cmd = service.buildDeployCommand('/tmp/nugget/iot-dashboard', 'my-project', 'us-central1');
    expect(cmd).toContain('/tmp/nugget/iot-dashboard');
  });
});
