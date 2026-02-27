/** Meeting framework types -- shared across meeting services and routes. */

export interface TriggerCondition {
  event: string;
  filter?: (data: Record<string, unknown>) => boolean;
}

export interface MeetingType {
  id: string;
  name: string;
  agentName: string;
  canvasType: string;
  triggerConditions: TriggerCondition[];
  persona: string;
}

export type MeetingStatus = 'invited' | 'active' | 'completed' | 'declined';

export interface MeetingMessage {
  role: 'agent' | 'kid';
  content: string;
  timestamp: number;
}

export interface MeetingOutcome {
  type: string;
  data: Record<string, unknown>;
}

export interface CanvasState {
  type: string;
  data: Record<string, unknown>;
}

export interface MeetingSession {
  id: string;
  meetingTypeId: string;
  sessionId: string;
  status: MeetingStatus;
  canvas: CanvasState;
  messages: MeetingMessage[];
  outcomes: MeetingOutcome[];
  agentName: string;
  title: string;
  description: string;
  createdAt: number;
}
