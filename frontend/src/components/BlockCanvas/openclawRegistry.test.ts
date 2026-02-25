import { describe, it, expect, beforeEach } from 'vitest';
import {
  isOpenClawEnabled,
  setOpenClawEnabled,
  getToolboxWithOpenClaw,
} from './openclawRegistry';
import { toolbox } from './toolbox';

beforeEach(() => {
  setOpenClawEnabled(false); // Reset state between tests
});

describe('openclawRegistry', () => {
  it('is disabled by default', () => {
    expect(isOpenClawEnabled()).toBe(false);
  });

  it('can be enabled', () => {
    setOpenClawEnabled(true);
    expect(isOpenClawEnabled()).toBe(true);
  });

  it('can be disabled after enabling', () => {
    setOpenClawEnabled(true);
    setOpenClawEnabled(false);
    expect(isOpenClawEnabled()).toBe(false);
  });
});

describe('getToolboxWithOpenClaw', () => {
  it('returns base toolbox when disabled', () => {
    setOpenClawEnabled(false);
    const tb = getToolboxWithOpenClaw();
    expect(tb.contents.length).toBe(toolbox.contents.length);
    const names = tb.contents.map((c: { name: string }) => c.name);
    expect(names).not.toContain('OC: Agents');
  });

  it('appends OpenClaw categories when enabled', () => {
    setOpenClawEnabled(true);
    const tb = getToolboxWithOpenClaw();
    expect(tb.contents.length).toBeGreaterThan(toolbox.contents.length);
    const names = tb.contents.map((c: { name: string }) => c.name);
    expect(names).toContain('OC: Agents');
    expect(names).toContain('OC: Channels');
    expect(names).toContain('OC: Security');
    expect(names).toContain('OC: Automations');
    expect(names).toContain('OC: Skills');
    expect(names).toContain('OC: Deploy');
  });

  it('places OpenClaw categories after core categories', () => {
    setOpenClawEnabled(true);
    const tb = getToolboxWithOpenClaw();
    const coreCount = toolbox.contents.length;
    const ocStart = tb.contents.findIndex((c: { name: string }) => c.name.startsWith('OC:'));
    expect(ocStart).toBe(coreCount);
  });
});
