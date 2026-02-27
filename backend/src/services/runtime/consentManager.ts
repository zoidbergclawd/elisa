/**
 * Parental consent manager for the Elisa Agent Runtime.
 *
 * Manages parental consent state per kid account. In-memory for now,
 * consistent with the existing sessionStore pattern.
 *
 * Consent level determines what the conversation manager stores:
 * - 'full_transcripts': Full conversation history retained
 * - 'session_summaries': Only session summaries retained (default)
 * - 'no_history': No conversation data retained after session ends
 *
 * PRD-001 Section 6: COPPA compliance infrastructure
 */

// ── Types ─────────────────────────────────────────────────────────────

export type ConsentLevel = 'session_summaries' | 'full_transcripts' | 'no_history';

export interface ConsentRecord {
  kid_id: string;
  parent_email: string;
  consent_level: ConsentLevel;
  granted_at: number;
  expires_at?: number;
}

/** Default consent level when none is explicitly set. */
const DEFAULT_CONSENT_LEVEL: ConsentLevel = 'session_summaries';

// ── Consent Manager ───────────────────────────────────────────────────

export class ConsentManager {
  private records = new Map<string, ConsentRecord>();

  /**
   * Set or update consent for a kid account.
   */
  setConsent(kidId: string, level: ConsentLevel, parentEmail: string): void {
    if (!kidId) throw new Error('kid_id is required');
    if (!parentEmail) throw new Error('parent_email is required');

    this.records.set(kidId, {
      kid_id: kidId,
      parent_email: parentEmail,
      consent_level: level,
      granted_at: Date.now(),
    });
  }

  /**
   * Get the consent record for a kid, or null if none exists.
   */
  getConsent(kidId: string): ConsentRecord | null {
    return this.records.get(kidId) ?? null;
  }

  /**
   * Check whether any consent has been granted for a kid.
   * Returns false if no record exists or if the record has expired.
   */
  hasConsent(kidId: string): boolean {
    const record = this.records.get(kidId);
    if (!record) return false;

    // Check expiry
    if (record.expires_at && record.expires_at < Date.now()) {
      return false;
    }

    return true;
  }

  /**
   * Get the storage policy (consent level) for a kid.
   * Defaults to 'session_summaries' if no consent record exists.
   */
  getStoragePolicy(kidId: string): ConsentLevel {
    const record = this.records.get(kidId);
    if (!record) return DEFAULT_CONSENT_LEVEL;

    // If expired, revert to default
    if (record.expires_at && record.expires_at < Date.now()) {
      return DEFAULT_CONSENT_LEVEL;
    }

    return record.consent_level;
  }

  /**
   * Revoke consent for a kid. Removes the record entirely.
   */
  revokeConsent(kidId: string): void {
    this.records.delete(kidId);
  }

  /**
   * Set an expiry time on an existing consent record.
   */
  setExpiry(kidId: string, expiresAt: number): void {
    const record = this.records.get(kidId);
    if (!record) throw new Error(`No consent record for kid: ${kidId}`);

    record.expires_at = expiresAt;
  }

  get size(): number {
    return this.records.size;
  }
}
