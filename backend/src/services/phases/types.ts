/** Shared types for orchestrator phase handlers. */

import type { BuildSession, CommitInfo, QuestionPayload } from '../../models/session.js';
import type { SessionLogger } from '../../utils/sessionLogger.js';
import type { TeachingEngine } from '../teachingEngine.js';

export type SendEvent = (event: Record<string, any>) => Promise<void>;

export interface PhaseContext {
  session: BuildSession;
  send: SendEvent;
  logger: SessionLogger | null;
  nuggetDir: string;
  nuggetType: string;
  abortSignal: AbortSignal;
}

/** Shared helper: check for a teaching moment and send it if present. */
export async function maybeTeach(
  teachingEngine: TeachingEngine,
  ctx: PhaseContext,
  eventType: string,
  eventDetails: string,
  nuggetType?: string,
): Promise<void> {
  const moment = await teachingEngine.getMoment(
    eventType,
    eventDetails,
    nuggetType ?? ctx.nuggetType,
  );
  if (moment) {
    await ctx.send({ type: 'teaching_moment', ...moment });
  }
}
