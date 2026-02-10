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
  status: 'idle' | 'working' | 'done' | 'error';
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

export type WSEvent =
  | { type: 'session_started'; session_id: string }
  | { type: 'planning_started' }
  | { type: 'plan_ready'; tasks: Task[]; agents: Agent[]; explanation: string }
  | { type: 'task_started'; task_id: string; agent_name: string }
  | { type: 'task_completed'; task_id: string; summary: string }
  | { type: 'task_failed'; task_id: string; error: string; retry_count: number }
  | { type: 'agent_output'; task_id: string; agent_name: string; content: string }
  | { type: 'agent_status'; agent: Agent }
  | { type: 'agent_message'; agent_name: string; message: string }
  | { type: 'deploy_started'; target: string }
  | { type: 'deploy_progress'; target: string; message: string }
  | { type: 'deploy_complete'; target: string; url?: string }
  | { type: 'teaching_moment'; concept: string; explanation: string }
  | { type: 'commit_created'; sha: string; message: string; agent_name: string; task_id: string; timestamp: string; files_changed: string[] }
  | { type: 'error'; message: string; recoverable: boolean }
  | { type: 'session_complete'; summary: string };
