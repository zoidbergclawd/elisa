# Frontend Components

Tabbed layout: Header (Logo + MainTabBar + GO + Badge) | Main (Workspace/Mission/System/Tests/Team tabs) | BottomBar (contextual tabs, resizable). Overlay modals for gates, questions, skills, and completion.

## Component Tree

```
App.tsx
  shared/MainTabBar.tsx              Workspace/Mission Control/System/Tests/Team tab switcher in header
  shared/ErrorBoundary.tsx           Class component error boundary (wraps App in main.tsx)
  shared/GoButton.tsx                Build trigger with ready/building/stop/disabled states
  shared/ReadinessBadge.tsx          Backend readiness indicator
  BlockCanvas/WorkspaceSidebar.tsx   Vertical icon toolbar (Folder/Open/Save/Skills/Portals/Examples/Help)
  BlockCanvas/BlockCanvas.tsx        Blockly editor wrapper. Read-only during build. Always mounted.
  AgentTeam/AgentTeamPanel.tsx       Full-width agent cards + comms feed (Agents tab)
  TaskMap/TaskMapPanel.tsx           Full-width interactive task DAG (Tasks tab)
  SystemPanel/SystemPanel.tsx        System main tab: three-column boundary visualization (inputs/system core/outputs)
  SystemPanel/BoundaryColumn.tsx     Reusable column for input/output boundary items with directional arrows
  MissionControl/MissionControlPanel.tsx  Main mission control layout with narrator feed + minion squad
  MissionControl/MinionSquadPanel.tsx     Minion cards with status badges and task assignments
  MissionControl/NarratorFeed.tsx         Scrolling narrator message feed with mood indicators
  MissionControl/PlanningIndicator.tsx    Planning phase status indicator
  MissionControl/TaskDAG.tsx         @xyflow/react graph of task dependencies
  MissionControl/CommsFeed.tsx       Scrolling agent message log
  MissionControl/MetricsPanel.tsx    Token usage bars per agent, cost display, budget percentage
  MissionControl/FeedbackLoopIndicator.tsx  Correction cycle animation + attempt counter for retrying tasks
  MissionControl/ConvergencePanel.tsx       Convergence tracking: attempt history, trends, teaching moments
  MissionControl/ContextFlowAnimation.tsx   Animated context flow dots between DAG nodes on task completion
  BottomBar/BottomBar.tsx            Resizable tabbed panel with contextual visibility (Timeline/Trace/Board/Learn/Progress/System/Health/Tokens)
    GitTimeline.tsx                  Railroad-style horizontal git graph (colored commit nodes per agent, hover tooltip, click-to-expand diffs)
    TraceabilityView.tsx             Requirement-to-test traceability table with status badges
    SystemBoundaryView.tsx           System boundary visualization (inputs/outputs/portals columns)
    HealthDashboard.tsx              System health vital signs (live score + post-build grade + breakdown + Architect-level trend chart)
    BoardOutput.tsx                  Serial output (conditional on serial data)
    TeachingSidebar.tsx              Learning moments list
    ProgressPanel.tsx                Build progress bar + phase text
  shared/ModalHost.tsx               Renders all overlay modals (gate, question, flash, skills, rules, portals, dir picker, board detected, examples, help)
  shared/HumanGateModal.tsx          Blocks pipeline, awaits user approve/reject
  shared/QuestionModal.tsx           Multi-choice from agent, user picks answer
  shared/TeachingToast.tsx           Floating notification for learning moments
  shared/AgentAvatar.tsx             Status dot + role icon
  shared/MinionAvatar.tsx            Animated avatar for narrator/minion characters
  shared/ProofMeter.tsx              Segmented progress bar for requirement verification (green/red/amber)
  shared/ExamplePickerModal.tsx      Card grid to choose bundled example nuggets (filters by availableDeviceIds when requiredDevices specified)
  shared/DirectoryPickerModal.tsx    Text input fallback for non-Electron workspace directory selection
  shared/BoardDetectedModal.tsx      Celebrates ESP32 connection, offers one-click Portal creation
  shared/FlashWizardModal.tsx        Multi-device flash wizard with progress bar for IoT deploy
  shared/MeetingInviteToast.tsx      Floating meeting invite notification with accept/decline + 30s auto-dismiss
  shared/MeetingInviteCard.tsx       Inline meeting invite card for embedding in done modal (non-positioned, flow layout)
  shared/LevelBadge.tsx             System level badge (Explorer/Builder/Architect) in header
  shared/ImpactPreview.tsx          Pre-execution impact preview card (task estimate, complexity, heaviest reqs)
  shared/DisplayThemePreview.tsx    BOX-3 display theme preview (320x240 ratio, theme colors, avatar style)
  shared/EsptoolFlashStep.tsx       Esptool flash progress UI (port detection, manual override, progress bar)
  Meeting/MeetingModal.tsx           Full-screen meeting modal, composes ChatPanel + CanvasPanel via MeetingLayout
  Meeting/ChatPanel.tsx              Reusable chat panel: message list, auto-scroll, typing indicator, input form
  Meeting/CanvasPanel.tsx            Reusable canvas panel: resolves canvas from registry, renders with props
  Meeting/MeetingLayout.tsx          Two-panel layout (left: w-80 chat, right: flex-1 canvas) shared by MeetingModal and TeamConversation
  Meeting/AgentAvatar.tsx            SVG avatar icons for meeting agents (Buddy, Marketing, Scribe, Pixel, etc.)
  Meeting/canvasRegistry.ts          Registry for pluggable canvas components (Map<canvasType, Component>)
  Meeting/DefaultCanvas.tsx          Placeholder canvas shown when no specialized canvas is registered
  Meeting/ThemePickerCanvas.tsx      BOX-3 display theme picker canvas for Art Agent meetings (reads canvasState.data.currentTheme)
  Meeting/BugDetectiveCanvas.tsx     Bug diagnosis canvas for debug-convergence meetings (expected vs actual, fix decision)
  Meeting/BlueprintCanvas.tsx        System overview walkthrough canvas for Architecture Agent meetings (tasks, reqs, stats)
  Meeting/CampaignCanvas.tsx         Creative asset builder canvas for Media Agent meetings (poster, social card, storyboard)
  Meeting/DesignPreviewCanvas.tsx    Design preview canvas with Canvas 2D rendering for Design Review meetings (SceneComposition sub-component executes agent-generated draw code, drawBackground handles CSS gradients with percentage stops, fallback circles for elements without draw code)
  Meeting/InterfaceDesignerCanvas.tsx Interface contract builder canvas for Integration meetings (provides/requires/connections)
  Meeting/ExplainItCanvas.tsx        Document editor canvas for Documentation Agent meetings (title, content, suggestions, word count)
  Meeting/LaunchPadCanvas.tsx        Launch page builder canvas for Web Designer Agent meetings (template selection, customization, live preview)
  Meeting/TestDashboardCanvas.tsx    Test Dashboard canvas: live pass/fail indicators, error details, Quick Fix / Deep Fix buttons
  Meeting/LivePreviewCanvas.tsx     Live Preview canvas: embeds iframe to local web preview, auto-refreshes on task_completed
  Meeting/CodeExplorerCanvas.tsx    Code Explorer canvas: syntax-highlighted code viewer with agent line annotations
  Meeting/WhiteboardCanvas.tsx      Whiteboard canvas: HTML5 Canvas free-form drawing (pen, line, rect, circle, eraser, text, colors)
  TestPanel/TestPanel.tsx            Main Tests tab: summary stats, test list, add test form
  TestPanel/TestList.tsx             Test result list with pass/fail icons and expandable error details
  TestPanel/AddTestForm.tsx          Form to add behavioral tests (when/then)
  TeamPanel/TeamPanel.tsx            Persistent Team tab: member list sidebar + inline conversation area
  TeamPanel/TeamMemberList.tsx       Sidebar with static member list, pending invite badges, Chat/dismiss buttons
  TeamPanel/TeamConversation.tsx     Inline meeting conversation using ChatPanel + CanvasPanel via MeetingLayout
  Skills/SkillsModal.tsx             CRUD editor for custom skills + template library
  Skills/SkillFlowEditor.tsx         Visual flow editor for composite skill steps
  Skills/SkillQuestionModal.tsx      Modal for skill questions during execution
  Rules/RulesModal.tsx               CRUD editor for rules + template library
  Portals/PortalsModal.tsx           CRUD editor for portal connections
```

## BlockCanvas Subsystem

- `blockDefinitions.ts`: Custom block types across 14 categories (Goals, Requirements, Tests, Style, Skills, Rules, Portals, Knowledge, Minions, Team, Flow, System, Composition, Deploy). Device plugin blocks add additional categories dynamically.
- `blockInterpreter.ts`: Walks Blockly workspace JSON, extracts fields, builds NuggetSpec. Device plugin blocks handled generically.
- `toolbox.ts`: Defines Blockly sidebar categories. Device plugin blocks dynamically added via `buildDeviceCategories()`.
- `skillFlowToolbox.ts`: Blockly toolbox definition for the skill flow editor.
- Device blocks: Loaded from `GET /api/devices` at startup and registered via `deviceBlocks.ts`.

## Key Patterns

- Build session state managed by `useBuildSession` (useReducer with typed actions). Workspace I/O in `useWorkspaceIO` hook.
- App.tsx is a thin layout shell; `ModalHost` renders all modals; hooks own the state logic.
- WSEvent discriminated union ensures exhaustive handling of all event types.
- BlockCanvas stays mounted (hidden via CSS) to preserve Blockly workspace state across tab switches.
- Auto-switch: build starts -> Agents tab + Progress bottom tab.
- Modals use fixed positioning with backdrop overlay. Only one modal shows at a time.
- Done modal: "Fix It" button appears when any task failed or tests failing, navigates to Team tab for Bug Detective. "Report a Bug" button always available post-build. "Your team wants to chat" button appears when invites are pending.
- Skills/Rules and workspace state are persisted to localStorage and restored on page load via `syncDesignToStorage` helper.
