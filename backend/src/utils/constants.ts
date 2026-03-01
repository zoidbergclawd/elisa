/** Shared constants for magic numbers used across the backend. */

/** Default Claude model used by agents and meta-planner. */
export const DEFAULT_MODEL = 'claude-opus-4-6';

/** Agent execution timeout in seconds. */
export const AGENT_TIMEOUT_SECONDS = 300;

/** Maximum concurrent agent tasks. */
export const MAX_CONCURRENT_TASKS = 3;

/** Test runner timeout in milliseconds. */
export const TEST_TIMEOUT_MS = 120_000;

/** Build step timeout in milliseconds. */
export const BUILD_TIMEOUT_MS = 120_000;

/** Flash timeout in milliseconds. */
export const FLASH_TIMEOUT_MS = 60_000;

/** Narrator debounce timeout in milliseconds. */
export const NARRATOR_TIMEOUT_MS = 4_000;

/** Rate limit delay in milliseconds. */
export const RATE_LIMIT_DELAY_MS = 15_000;

/** Session cleanup grace period in milliseconds. */
export const CLEANUP_DELAY_MS = 300_000;

/** Session max age in milliseconds. */
export const SESSION_MAX_AGE_MS = 3_600_000;

/** Session prune interval in milliseconds. */
export const PRUNE_INTERVAL_MS = 600_000;

/** Maximum predecessor word count for context. */
export const PREDECESSOR_WORD_CAP = 2000;

/** Default token budget per session. */
export const DEFAULT_TOKEN_BUDGET = 500_000;

/** Default max turns per agent invocation. */
export const MAX_TURNS_DEFAULT = 25;

/** Additional turns granted per retry attempt. */
export const MAX_TURNS_RETRY_INCREMENT = 10;

/** Meeting agent response timeout in milliseconds. */
export const MEETING_AGENT_TIMEOUT_MS = 30_000;

/** Meeting agent max tokens per response. */
export const MEETING_AGENT_MAX_TOKENS = 500;

/** Default narrator/meeting-agent model. */
export const NARRATOR_MODEL_DEFAULT = 'claude-haiku-4-5-20251001';

/** Timeout for meeting blocks on task execution (auto-proceed after timeout). */
export const MEETING_BLOCK_TIMEOUT_MS = 300_000;
