/** Shared types for orchestrator phase handlers. */

import type { BuildSession, Agent, Task, CommitInfo, QuestionPayload } from '../../models/session.js';
import type { SessionLogger } from '../../utils/sessionLogger.js';
import type { TeachingEngine } from '../teachingEngine.js';

/** Response from a human gate prompt (approve/reject with optional feedback). */
export interface GateResponse {
  approved: boolean;
  feedback?: string;
}

/** User-provided answers to an agent question. Keys are question IDs or headers. */
export type QuestionAnswers = Record<string, unknown>;

/** Discriminated union for all WebSocket events sent from backend to frontend. */
export type WSEvent =
  | { type: 'session_started'; session_id: string }
  | { type: 'planning_started' }
  | { type: 'plan_ready'; tasks: Task[]; agents: Agent[]; explanation: string; deployment_target?: string; deploy_steps?: Array<{ id: string; name: string; method: string }> }
  | { type: 'task_started'; task_id: string; agent_name: string }
  | { type: 'task_completed'; task_id: string; summary: string; agent_name?: string }
  | { type: 'task_failed'; task_id: string; error: string; retry_count: number }
  | { type: 'agent_output'; task_id: string; agent_name: string; content: string }
  | { type: 'agent_status'; agent: Agent }
  | { type: 'agent_message'; from: string; to: string; content: string }
  | { type: 'deploy_started'; target: string }
  | { type: 'deploy_progress'; step: string; progress: number; device_role?: string }
  | { type: 'deploy_complete'; target: string; url?: string }
  | { type: 'deploy_checklist'; rules: Array<{ name: string; prompt: string }> }
  | { type: 'teaching_moment'; concept: string; headline: string; explanation: string; tell_me_more?: string; related_concepts?: string[] }
  | { type: 'commit_created'; sha: string; message: string; agent_name: string; task_id: string; timestamp: string; files_changed: string[] }
  | { type: 'test_result'; test_name: string; passed: boolean; details: string }
  | { type: 'coverage_update'; percentage: number; details?: Record<string, { statements: number; covered: number; percentage: number }> }
  | { type: 'token_usage'; agent_name: string; input_tokens: number; output_tokens: number; cost_usd: number }
  | { type: 'budget_warning'; total_tokens: number; max_budget: number; cost_usd: number }
  | { type: 'serial_data'; line: string; timestamp: string }
  | { type: 'human_gate'; task_id: string; question: string; context: string }
  | { type: 'user_question'; task_id: string; questions: QuestionPayload[] | Record<string, unknown> }
  | { type: 'skill_started'; skill_id: string; skill_name: string }
  | { type: 'skill_step'; skill_id: string; step_id: string; step_type: string; status: 'started' | 'completed' | 'failed' }
  | { type: 'skill_question'; skill_id: string; step_id: string; questions: QuestionPayload[] }
  | { type: 'skill_output'; skill_id: string; step_id: string; content: string }
  | { type: 'skill_completed'; skill_id: string; result: string }
  | { type: 'skill_error'; skill_id: string; message: string }
  | { type: 'workspace_created'; nugget_dir: string }
  | { type: 'error'; message: string; recoverable: boolean }
  | { type: 'narrator_message'; from: string; text: string; mood: 'excited' | 'encouraging' | 'concerned' | 'celebrating'; related_task_id?: string }
  | { type: 'permission_auto_resolved'; task_id: string; permission_type: string; decision: 'approved' | 'denied'; reason: string }
  | { type: 'minion_state_change'; agent_name: string; old_status: string; new_status: string }
  | { type: 'session_complete'; summary: string }
  | { type: 'flash_prompt'; device_role: string; message: string }
  | { type: 'flash_progress'; device_role: string; step: string; progress: number }
  | { type: 'flash_complete'; device_role: string; success: boolean; message?: string }
  | { type: 'context_flow'; from_task_id: string; to_task_ids: string[]; summary_preview: string }
  | { type: 'documentation_ready'; file_path: string }
  | { type: 'meeting_invite'; meetingTypeId: string; meetingId: string; agentName: string; title: string; description: string }
  | { type: 'meeting_started'; meetingId: string; meetingTypeId: string; agentName: string; canvasType: string }
  | { type: 'meeting_message'; meetingId: string; role: 'agent' | 'kid'; content: string }
  | { type: 'meeting_canvas_update'; meetingId: string; canvasType: string; data: Record<string, unknown> }
  | { type: 'meeting_outcome'; meetingId: string; outcomeType: string; data: Record<string, unknown> }
  | { type: 'meeting_ended'; meetingId: string; outcomes: Array<{ type: string; data: Record<string, unknown> }> }
  | { type: 'traceability_update'; requirement_id: string; test_id: string; status: 'untested' | 'passing' | 'failing' }
  | { type: 'traceability_summary'; coverage: number; requirements: Array<{ requirement_id: string; description: string; test_id?: string; test_name?: string; status: 'untested' | 'passing' | 'failing' }> }
  | { type: 'correction_cycle_started'; task_id: string; attempt_number: number; failure_reason: string; max_attempts: number }
  | { type: 'correction_cycle_progress'; task_id: string; attempt_number: number; step: 'diagnosing' | 'fixing' | 'retesting' }
  | { type: 'convergence_update'; task_id: string; attempts_so_far: number; tests_passing: number; tests_total: number; trend: 'improving' | 'stalled' | 'diverging'; converged: boolean; attempts: Array<{ attempt_number: number; status: string; tests_passing?: number; tests_total?: number }> }
  | { type: 'decomposition_narrated'; goal: string; subtasks: string[]; explanation: string }
  | { type: 'impact_estimate'; estimated_tasks: number; complexity: 'simple' | 'moderate' | 'complex'; heaviest_requirements: string[]; requirement_details: Array<{ description: string; estimated_task_count: number; test_linked: boolean; weight: number; dependents: number }> }
  | { type: 'system_health_update'; tasks_done: number; tasks_total: number; tests_passing: number; tests_total: number; tokens_used: number; health_score: number }
  | { type: 'system_health_summary'; health_score: number; grade: 'A' | 'B' | 'C' | 'D' | 'F'; breakdown: { tasks_score: number; tests_score: number; corrections_score: number; budget_score: number } }
  | { type: 'boundary_analysis'; inputs: Array<{ name: string; type: string; source?: string }>; outputs: Array<{ name: string; type: string; source?: string }>; boundary_portals: string[] }
  | { type: 'composition_impact'; graph_id: string; changed_node_id: string; affected_nodes: Array<{ node_id: string; label: string; reason: string }>; severity: string };

export type SendEvent = (event: WSEvent) => Promise<void>;

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
