import { describe, it, expect } from 'vitest';
import { updatePortalOptions, getCurrentPortals } from './portalRegistry';
import type { Portal } from './types';

const makePortal = (id: string): Portal => ({
  id,
  name: `Portal ${id}`,
  description: 'test',
  mechanism: 'cli',
  status: 'unconfigured',
  capabilities: [],
});

describe('portalRegistry', () => {
  it('starts with empty array', () => {
    // Reset by setting empty
    updatePortalOptions([]);
    expect(getCurrentPortals()).toEqual([]);
  });

  it('stores and retrieves portals', () => {
    const portals = [makePortal('a'), makePortal('b')];
    updatePortalOptions(portals);
    expect(getCurrentPortals()).toEqual(portals);
  });

  it('replaces previous portals on update', () => {
    updatePortalOptions([makePortal('old')]);
    updatePortalOptions([makePortal('new')]);
    const result = getCurrentPortals();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('new');
  });

  it('returns same reference until updated', () => {
    const portals = [makePortal('x')];
    updatePortalOptions(portals);
    expect(getCurrentPortals()).toBe(getCurrentPortals());
  });
});
