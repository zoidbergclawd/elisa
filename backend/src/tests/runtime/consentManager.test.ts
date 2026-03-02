import { describe, it, expect, beforeEach } from 'vitest';
import { ConsentManager } from '../../services/runtime/consentManager.js';
import type { ConsentLevel } from '../../services/runtime/consentManager.js';

describe('ConsentManager', () => {
  let manager: ConsentManager;

  beforeEach(() => {
    manager = new ConsentManager();
  });

  describe('setConsent / getConsent', () => {
    it('stores and retrieves a consent record', () => {
      manager.setConsent('kid-1', 'full_transcripts', 'parent@example.com');
      const record = manager.getConsent('kid-1');

      expect(record).not.toBeNull();
      expect(record!.kid_id).toBe('kid-1');
      expect(record!.parent_email).toBe('parent@example.com');
      expect(record!.consent_level).toBe('full_transcripts');
      expect(record!.granted_at).toBeGreaterThan(0);
    });

    it('returns null for unknown kid', () => {
      expect(manager.getConsent('nonexistent')).toBeNull();
    });

    it('overwrites existing consent when set again', () => {
      manager.setConsent('kid-1', 'full_transcripts', 'parent@example.com');
      manager.setConsent('kid-1', 'no_history', 'parent@example.com');

      const record = manager.getConsent('kid-1');
      expect(record!.consent_level).toBe('no_history');
    });

    it('throws when kid_id is empty', () => {
      expect(() => manager.setConsent('', 'full_transcripts', 'parent@example.com'))
        .toThrow('kid_id is required');
    });

    it('throws when parent_email is empty', () => {
      expect(() => manager.setConsent('kid-1', 'full_transcripts', ''))
        .toThrow('parent_email is required');
    });

    it('supports all consent levels', () => {
      const levels: ConsentLevel[] = ['session_summaries', 'full_transcripts', 'no_history'];

      for (const level of levels) {
        manager.setConsent('kid-1', level, 'parent@example.com');
        expect(manager.getConsent('kid-1')!.consent_level).toBe(level);
      }
    });
  });

  describe('hasConsent', () => {
    it('returns true when consent exists', () => {
      manager.setConsent('kid-1', 'session_summaries', 'parent@example.com');
      expect(manager.hasConsent('kid-1')).toBe(true);
    });

    it('returns false for unknown kid', () => {
      expect(manager.hasConsent('nonexistent')).toBe(false);
    });

    it('returns false when consent has expired', () => {
      manager.setConsent('kid-1', 'full_transcripts', 'parent@example.com');
      // Set expiry to the past
      manager.setExpiry('kid-1', Date.now() - 1000);
      expect(manager.hasConsent('kid-1')).toBe(false);
    });

    it('returns true when consent has not yet expired', () => {
      manager.setConsent('kid-1', 'full_transcripts', 'parent@example.com');
      manager.setExpiry('kid-1', Date.now() + 86_400_000); // +1 day
      expect(manager.hasConsent('kid-1')).toBe(true);
    });
  });

  describe('getStoragePolicy', () => {
    it('returns the consent level when set', () => {
      manager.setConsent('kid-1', 'full_transcripts', 'parent@example.com');
      expect(manager.getStoragePolicy('kid-1')).toBe('full_transcripts');
    });

    it('defaults to session_summaries when no consent set', () => {
      expect(manager.getStoragePolicy('nonexistent')).toBe('session_summaries');
    });

    it('defaults to session_summaries when consent expired', () => {
      manager.setConsent('kid-1', 'full_transcripts', 'parent@example.com');
      manager.setExpiry('kid-1', Date.now() - 1000);
      expect(manager.getStoragePolicy('kid-1')).toBe('session_summaries');
    });
  });

  describe('revokeConsent', () => {
    it('removes the consent record', () => {
      manager.setConsent('kid-1', 'full_transcripts', 'parent@example.com');
      manager.revokeConsent('kid-1');

      expect(manager.getConsent('kid-1')).toBeNull();
      expect(manager.hasConsent('kid-1')).toBe(false);
    });

    it('is a no-op for unknown kid', () => {
      expect(() => manager.revokeConsent('nonexistent')).not.toThrow();
    });

    it('decrements size', () => {
      manager.setConsent('kid-1', 'full_transcripts', 'parent@example.com');
      expect(manager.size).toBe(1);
      manager.revokeConsent('kid-1');
      expect(manager.size).toBe(0);
    });
  });

  describe('setExpiry', () => {
    it('sets an expiry time on an existing record', () => {
      manager.setConsent('kid-1', 'full_transcripts', 'parent@example.com');
      const future = Date.now() + 86_400_000;
      manager.setExpiry('kid-1', future);

      const record = manager.getConsent('kid-1');
      expect(record!.expires_at).toBe(future);
    });

    it('throws for unknown kid', () => {
      expect(() => manager.setExpiry('nonexistent', Date.now()))
        .toThrow('No consent record for kid');
    });
  });

  describe('size', () => {
    it('tracks number of records', () => {
      expect(manager.size).toBe(0);

      manager.setConsent('kid-1', 'full_transcripts', 'parent@example.com');
      expect(manager.size).toBe(1);

      manager.setConsent('kid-2', 'no_history', 'parent2@example.com');
      expect(manager.size).toBe(2);

      manager.revokeConsent('kid-1');
      expect(manager.size).toBe(1);
    });
  });
});
