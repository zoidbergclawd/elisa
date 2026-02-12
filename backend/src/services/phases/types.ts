/** Shared types for orchestrator phase handlers. */

import type { BuildSession, CommitInfo, QuestionPayload } from '../../models/session.js';
import type { SessionLogger } from '../../utils/sessionLogger.js';

export type SendEvent = (event: Record<string, any>) => Promise<void>;

export interface PhaseContext {
  session: BuildSession;
  send: SendEvent;
  logger: SessionLogger | null;
  nuggetDir: string;
  nuggetType: string;
  abortSignal: AbortSignal;
}
