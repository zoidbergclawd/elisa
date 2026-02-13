export type UIState = 'design' | 'building' | 'review' | 'deploy' | 'done';

export interface Task {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  agent_name: string;
  dependencies: string[];
  acceptance_criteria?: string[];
}

export interface Agent {
  name: string;
  role: 'builder' | 'tester' | 'reviewer' | 'custom';
  persona: string;
  status: 'idle' | 'working' | 'done' | 'error' | 'waiting';
}

export interface BuildSession {
  id: string;
  status: string;
  tasks: Task[];
  agents: Agent[];
}

export interface Commit {
  sha: string;
  message: string;
  agent_name: string;
  task_id: string;
  timestamp: string;
  files_changed: string[];
}

export interface TeachingMoment {
  concept: string;
  headline: string;
  explanation: string;
  tell_me_more?: string;
  related_concepts?: string[];
}

export interface TestResult {
  test_name: string;
  passed: boolean;
  details: string;
}

export interface CoverageReport {
  total_statements: number;
  covered_statements: number;
  files: Record<string, { statements: number; covered: number; percentage: number }>;
}

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
  costUsd: number;
  maxBudget: number;
  perAgent: Record<string, { input: number; output: number }>;
}

export interface QuestionPayload {
  question: string;
  header: string;
  options: Array<{ label: string; description: string }>;
  multiSelect: boolean;
}

export interface NarratorMessage {
  from: string;
  text: string;
  mood: 'excited' | 'encouraging' | 'concerned' | 'celebrating';
  related_task_id?: string;
  timestamp: number;
}

export type WSEvent =
  | { type: 'session_started'; session_id: string }
  | { type: 'planning_started' }
  | { type: 'plan_ready'; tasks: Task[]; agents: Agent[]; explanation: string }
  | { type: 'task_started'; task_id: string; agent_name: string }
  | { type: 'task_completed'; task_id: string; summary: string }
  | { type: 'task_failed'; task_id: string; error: string; retry_count: number }
  | { type: 'agent_output'; task_id: string; agent_name: string; content: string }
  | { type: 'agent_status'; agent: Agent }
  | { type: 'agent_message'; from: string; to: string; content: string }
  | { type: 'deploy_started'; target: string }
  | { type: 'deploy_progress'; step: string; progress: number }
  | { type: 'deploy_complete'; target: string; url?: string }
  | { type: 'teaching_moment'; concept: string; headline: string; explanation: string; tell_me_more?: string; related_concepts?: string[] }
  | { type: 'commit_created'; sha: string; message: string; agent_name: string; task_id: string; timestamp: string; files_changed: string[] }
  | { type: 'test_result'; test_name: string; passed: boolean; details: string }
  | { type: 'coverage_update'; percentage: number; details?: CoverageReport }
  | { type: 'token_usage'; agent_name: string; input_tokens: number; output_tokens: number; cost_usd: number }
  | { type: 'budget_warning'; total_tokens: number; max_budget: number; cost_usd: number }
  | { type: 'serial_data'; line: string; timestamp: string }
  | { type: 'human_gate'; task_id: string; question: string; context: string }
  | { type: 'user_question'; task_id: string; questions: QuestionPayload[] }
  | { type: 'skill_started'; skill_id: string; skill_name: string }
  | { type: 'skill_step'; skill_id: string; step_id: string; step_type: string; status: 'started' | 'completed' | 'failed' }
  | { type: 'skill_question'; skill_id: string; step_id: string; questions: QuestionPayload[] }
  | { type: 'skill_output'; skill_id: string; step_id: string; content: string }
  | { type: 'skill_completed'; skill_id: string; result: string }
  | { type: 'skill_error'; skill_id: string; message: string }
  | { type: 'deploy_checklist'; rules: Array<{ name: string; prompt: string }> }
  | { type: 'workspace_created'; nugget_dir: string }
  | { type: 'error'; message: string; recoverable: boolean }
  | { type: 'narrator_message'; from: string; text: string; mood: 'excited' | 'encouraging' | 'concerned' | 'celebrating'; related_task_id?: string }
  | { type: 'permission_auto_resolved'; task_id: string; permission_type: string; decision: 'approved' | 'denied'; reason: string }
  | { type: 'minion_state_change'; agent_name: string; old_status: string; new_status: string }
  | { type: 'session_complete'; summary: string };
