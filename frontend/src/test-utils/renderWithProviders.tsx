/**
 * Test utilities for components that consume React Context.
 *
 * Components like BottomBar, MissionControlPanel, and ModalHost now read state
 * from BuildSessionContext, WorkspaceContext, and MeetingContext instead of props.
 *
 * Tests should mock the context hooks at the module level:
 *
 *   vi.mock('../../contexts/BuildSessionContext', () => ({
 *     useBuildSessionContext: vi.fn(() => defaultBuildSessionValue),
 *   }));
 *
 * Then override per-test:
 *
 *   vi.mocked(useBuildSessionContext).mockReturnValue({
 *     ...defaultBuildSessionValue,
 *     uiState: 'building',
 *   });
 */

import type { BuildSessionContextValue } from '../contexts/BuildSessionContext';
import type { WorkspaceContextValue } from '../contexts/WorkspaceContext';
import type { MeetingContextValue } from '../contexts/MeetingContext';

export const defaultBuildSessionValue: BuildSessionContextValue = {
  uiState: 'design',
  tasks: [],
  agents: [],
  commits: [],
  events: [],
  sessionId: null,
  teachingMoments: [],
  testResults: [],
  coveragePct: null,
  tokenUsage: { input: 0, output: 0, total: 0, costUsd: 0, maxBudget: 500_000, perAgent: {} },
  serialLines: [],
  deployProgress: null,
  deployChecklist: null,
  deployUrls: {},
  gateRequest: null,
  questionRequest: null,
  nuggetDir: null,
  errorNotification: null,
  narratorMessages: [],
  isPlanning: false,
  flashWizardState: null,
  contextFlows: [],
  traceability: null,
  correctionCycles: {},
  impactEstimate: null,
  healthUpdate: null,
  healthSummary: null,
  healthHistory: [],
  boundaryAnalysis: null,
  handleEvent: () => {},
  startBuild: async () => {},
  stopBuild: async () => {},
  clearGateRequest: () => {},
  clearQuestionRequest: () => {},
  clearErrorNotification: () => {},
  resetToDesign: () => {},
};

export const defaultWorkspaceValue: WorkspaceContextValue = {
  skills: [],
  rules: [],
  portals: [],
  spec: null,
  workspacePath: null,
  workspaceJson: null,
  initialWorkspace: null,
  dirPickerOpen: false,
  examplePickerOpen: false,
  deviceManifests: [],
  systemLevel: 'explorer',
  setSkills: () => {},
  setRules: () => {},
  setPortals: () => {},
  setExamplePickerOpen: () => {},
  handleWorkspaceChange: () => {},
  handleSaveNugget: async () => {},
  handleOpenNugget: async () => {},
  handleOpenFolder: async () => {},
  handleSelectExample: () => {},
  handleDirPickerSelect: () => {},
  handleDirPickerCancel: () => {},
  ensureWorkspacePath: async () => null,
  reinterpretWorkspace: () => {},
};

export const defaultMeetingValue: MeetingContextValue = {
  inviteQueue: [],
  nextInvite: null,
  activeMeeting: null,
  isAgentThinking: false,
  messages: [],
  canvasState: { type: '', data: {} },
  handleMeetingEvent: () => false,
  acceptInvite: async () => {},
  declineInvite: async () => {},
  sendMessage: async () => {},
  endMeeting: async () => {},
  updateCanvas: async () => {},
  materializeArtifacts: async () => null,
  resetMeetings: () => {},
};
