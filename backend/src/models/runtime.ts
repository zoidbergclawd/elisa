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
  /** When true, this turn should only be retained as a summary (COPPA consent: session_summaries). */
  summary_only?: boolean;
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

// ── Study Mode ───────────────────────────────────────────────────────

export interface StudyModeConfig {
  enabled: boolean;
  style: 'flashcard' | 'quiz' | 'explain';
  difficulty: 'easy' | 'medium' | 'hard';
  quiz_frequency: number; // 1-20, quizzes per session
}

export interface QuizQuestion {
  id: string;
  source_id: string;
  question: string;
  options: string[];
  correct_index: number;
}

export interface StudyProgress {
  total_questions: number;
  correct_answers: number;
  sources_covered: number;
  total_sources: number;
  accuracy: number;
}

// ── Gap Detection ────────────────────────────────────────────────────

export interface GapEntry {
  query: string;
  timestamp: Date;
  topic?: string;
  reason?: string;
}

// ── Audio Pipeline ────────────────────────────────────────────────────

export type AudioInputFormat = 'wav' | 'webm';

export interface AudioTurnRequest {
  agent_id: string;
  audio_format: AudioInputFormat;
  session_id?: string;
}

export interface AudioTurnResult {
  transcript: string;
  response_text: string;
  audio_base64: string;
  audio_format: 'mp3';
  session_id: string;
  usage: {
    stt_seconds: number;
    tts_characters: number;
    input_tokens: number;
    output_tokens: number;
  };
}

// ── Provisioning ──────────────────────────────────────────────────────

export interface ProvisionResult {
  agent_id: string;
  api_key: string;
  runtime_url: string;
}
