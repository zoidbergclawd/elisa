# Frontend Components

Tabbed layout: Header (Logo + MainTabBar + GO + Badge) | Main (Workspace/Agents/Tasks tabs) | BottomBar (6 tabs). Overlay modals for gates, questions, skills, and completion.

## Component Tree

```
App.tsx
  shared/MainTabBar.tsx              Workspace/Agents/Tasks tab switcher in header
  shared/ErrorBoundary.tsx             Class component error boundary (wraps App in main.tsx)
  shared/GoButton.tsx                Build trigger with ready/building/stop/disabled states
  shared/ReadinessBadge.tsx          Backend readiness indicator
  BlockCanvas/WorkspaceSidebar.tsx   Vertical icon toolbar (Folder/Open/Save/Skills/Portals/Examples/Help)
  BlockCanvas/BlockCanvas.tsx        Blockly editor wrapper. Read-only during build. Always mounted.
  AgentTeam/AgentTeamPanel.tsx       Full-width agent cards + comms feed (Agents tab)
  TaskMap/TaskMapPanel.tsx           Full-width interactive task DAG (Tasks tab)
  MissionControl/MissionControlPanel.tsx  Main mission control layout with narrator feed + minion squad
  MissionControl/MinionSquadPanel.tsx     Minion cards with status badges and task assignments
  MissionControl/NarratorFeed.tsx         Scrolling narrator message feed with mood indicators
  MissionControl/TaskDAG.tsx         @xyflow/react graph of task dependencies
  MissionControl/CommsFeed.tsx       Scrolling agent message log
  MissionControl/MetricsPanel.tsx    Token usage bars per agent, cost display, budget percentage
  BottomBar/BottomBar.tsx            Tabbed panel (6 tabs: Timeline/Tests/Board/Learn/Progress/Tokens)
    GitTimeline.tsx                  Commit list with file diffs
    TestResults.tsx                  Pass/fail indicators + coverage bar (build-state aware)
    BoardOutput.tsx                  Serial output (conditional on serial data)
    TeachingSidebar.tsx              Learning moments list
    ProgressPanel.tsx                Build progress bar + phase text
  shared/HumanGateModal.tsx          Blocks pipeline, awaits user approve/reject
  shared/QuestionModal.tsx           Multi-choice from agent, user picks answer
  shared/TeachingToast.tsx           Floating notification for learning moments
  shared/AgentAvatar.tsx             Status dot + role icon
  shared/MinionAvatar.tsx            Animated avatar for narrator/minion characters
  shared/ExamplePickerModal.tsx      Card grid to choose bundled example nuggets
  shared/DirectoryPickerModal.tsx   Text input fallback for non-Electron workspace directory selection
  shared/BoardDetectedModal.tsx    Celebrates ESP32 connection, offers one-click Portal creation
  Skills/SkillsModal.tsx             CRUD editor for custom skills + template library
  Skills/SkillFlowEditor.tsx         Visual flow editor for composite skill steps
  Rules/RulesModal.tsx               CRUD editor for rules + template library
  Portals/PortalsModal.tsx           CRUD editor for portal connections
```

## BlockCanvas Subsystem

- `blockDefinitions.ts`: 20+ custom block types across 10 categories (Goals, Requirements, Tests, Style, Minions, Skills, Rules, Portals, Flow, Deploy)
- `blockInterpreter.ts`: Walks Blockly workspace JSON, extracts fields, builds NuggetSpec.
- `toolbox.ts`: Defines Blockly sidebar categories and their block contents.

## Key Patterns

- All state lives in App.tsx via `useBuildSession` hook. Components receive state and callbacks as props.
- WSEvent discriminated union ensures exhaustive handling of all event types.
- BlockCanvas stays mounted (hidden via CSS) to preserve Blockly workspace state across tab switches.
- Auto-switch: build starts -> Agents tab + Progress bottom tab.
- Modals use fixed positioning with backdrop overlay. Only one modal shows at a time.
- Skills/Rules and workspace state are persisted to localStorage and restored on page load.
