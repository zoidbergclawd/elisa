/** Agent Runtime types — models for the Elisa Agent Runtime service (PRD-001). */

// ── Agent Identity ────────────────────────────────────────────────────

export interface ToolConfig {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface StudyConfig {
  enabled: boolean;
  style: 'explain' | 'quiz_me' | 'flashcards' | 'socratic';
  difficulty: 'easy' | 'medium' | 'hard';
  quiz_frequency: number;
}

export interface AgentIdentity {
  agent_id: string;
  agent_name: string;
  system_prompt: string;
  greeting: string;
  fallback_response: string;
  topic_index: string[];
  tool_configs: ToolConfig[];
  voice: string;
  display_theme: string;
  study_config: StudyConfig | null;
  created_at: number;
  updated_at: number;
}

// ── Conversation ──────────────────────────────────────────────────────

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  tokens_used?: number;
}

export interface ConversationSession {
  session_id: string;
  agent_id: string;
  turns: ConversationTurn[];
  created_at: number;
}

// ── Usage Metering ────────────────────────────────────────────────────

export interface UsageRecord {
  agent_id: string;
  input_tokens: number;
  output_tokens: number;
  tts_characters: number;
  stt_seconds: number;
  timestamp: number;
}

// ── Knowledge Backpack ────────────────────────────────────────────────

export interface BackpackSource {
  id: string;
  title: string;
  content: string;
  source_type: 'file' | 'url' | 'manual';
  uri?: string;
  added_at: number;
}

export interface SearchResult {
  source_id: string;
  title: string;
  snippet: string;
  score: number;
}

// ── Provisioning ──────────────────────────────────────────────────────

export interface ProvisionResult {
  agent_id: string;
  api_key: string;
  runtime_url: string;
}
