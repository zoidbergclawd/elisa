import { useMemo } from 'react';
import type { NuggetSpec } from '../components/BlockCanvas/blockInterpreter';
import type { SystemLevel } from '../types';

/**
 * Extract the current system level from the NuggetSpec.
 * Components can use this to gate features based on the progressive mastery level.
 *
 * Returns 'explorer' by default if no spec or no level is set.
 */
export function useSystemLevel(spec: NuggetSpec | null): SystemLevel {
  return useMemo(() => {
    if (!spec) return 'explorer';
    return spec.workflow?.system_level ?? 'explorer';
  }, [spec]);
}
