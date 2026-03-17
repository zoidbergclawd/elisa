import { describe, it, expect, beforeEach } from 'vitest';
import { updateNuggetOptions, getCurrentNuggets, type NuggetEntry } from './nuggetBlocks';

describe('nuggetBlocks', () => {
  beforeEach(() => {
    // Reset state
    updateNuggetOptions([]);
  });

  describe('updateNuggetOptions', () => {
    it('updates the current nugget list', () => {
      const nuggets: NuggetEntry[] = [
        { id: 'n1', name: 'Dashboard', goal: 'Build a dashboard' },
        { id: 'n2', name: 'API Server', goal: 'Build an API' },
      ];
      updateNuggetOptions(nuggets);
      expect(getCurrentNuggets()).toEqual(nuggets);
    });

    it('replaces previous nuggets', () => {
      updateNuggetOptions([{ id: 'old', name: 'Old', goal: 'old' }]);
      updateNuggetOptions([{ id: 'new', name: 'New', goal: 'new' }]);
      expect(getCurrentNuggets()).toHaveLength(1);
      expect(getCurrentNuggets()[0].id).toBe('new');
    });

    it('accepts empty array', () => {
      updateNuggetOptions([{ id: 'x', name: 'X', goal: 'x' }]);
      updateNuggetOptions([]);
      expect(getCurrentNuggets()).toEqual([]);
    });
  });

  describe('getCurrentNuggets', () => {
    it('returns empty array by default', () => {
      expect(getCurrentNuggets()).toEqual([]);
    });

    it('returns builtin nuggets when set', () => {
      const nuggets: NuggetEntry[] = [
        { id: 'shipped-1', name: 'Shipped', goal: 'A shipped nugget', builtin: true },
      ];
      updateNuggetOptions(nuggets);
      expect(getCurrentNuggets()).toEqual(nuggets);
      expect(getCurrentNuggets()[0].builtin).toBe(true);
    });
  });
});
