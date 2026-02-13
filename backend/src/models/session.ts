/** Session, Task, Agent models -- ported from Python backend. */

export type SessionState =
  | 'idle'
  | 'planning'
  | 'executing'
  | 'testing'
  | 'deploying'
  | 'reviewing'
  | 'done';

export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'failed';

export interface Task {
  id: string;
  name: string;
  description: string;
  status: TaskStatus;
  agent_name: string;
  dependencies: string[];
  acceptance_criteria: string[];
}

export type AgentRole = 'builder' | 'tester' | 'reviewer' | 'custom';

export type AgentStatus = 'idle' | 'working' | 'done' | 'error' | 'waiting';

export interface Agent {
  name: string;
  role: AgentRole;
  persona: string;
  status: AgentStatus;
  allowed_paths?: string[];
  restricted_paths?: string[];
}

export interface BuildSession {
  id: string;
  state: SessionState;
  spec: Record<string, any> | null;
  tasks: Record<string, any>[];
  agents: Record<string, any>[];
}

export interface AgentResult {
  success: boolean;
  summary: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

export interface CommitInfo {
  sha: string;
  shortSha: string;
  message: string;
  agentName: string;
  taskId: string;
  timestamp: string;
  filesChanged: string[];
}

export interface CompileResult {
  success: boolean;
  errors: string[];
  outputPath: string;
}

export interface FlashResult {
  success: boolean;
  message: string;
}

export interface BoardInfo {
  port: string;
  boardType: string;
}

export interface QuestionPayload {
  question: string;
  header: string;
  options: Array<{ label: string; description: string }>;
  multiSelect: boolean;
}

export interface PortalRuntime {
  id: string;
  name: string;
  mechanism: string;
  status: 'initializing' | 'ready' | 'error';
}
