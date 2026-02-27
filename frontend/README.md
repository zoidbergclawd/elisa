# Elisa Frontend

React + Vite + Blockly SPA. The visual editor and build monitoring interface.

## Stack

- React 19.2, TypeScript 5.9, Vite 7.3
- Tailwind CSS 4
- Blockly 12.3 (block editor)
- @xyflow/react 12.10 (task DAG visualization)

## Dev Commands

```bash
npm run dev          # Start dev server (port 5173, proxies /api and /ws to localhost:8000)
npm run build        # Type-check + production build
npm run lint         # ESLint
npm run test         # Vitest (single run)
npm run test:watch   # Vitest (watch mode)
```

## Structure

```
src/
  App.tsx                    Root component. Owns all session state. Tabbed main layout.
  components/
    BlockCanvas/             Blockly editor + block-to-NuggetSpec conversion + WorkspaceSidebar
      blockDefinitions.ts      27 block type definitions (10 categories)
      blockInterpreter.ts      Workspace -> NuggetSpec JSON conversion
      toolbox.ts               Palette categories and block ordering
    AgentTeam/               Full-width agent cards + comms feed (Agents tab)
    TaskMap/                 Full-width interactive task DAG (Tasks tab)
    MissionControl/          MissionControlPanel, MinionSquadPanel, NarratorFeed, TaskDAG, CommsFeed, MetricsPanel
    BottomBar/               Bottom panel (6 tabs: Timeline, Tests, Board, Learn, Progress, Tokens)
      GitTimeline.tsx          Commit list with file diffs
      TestResults.tsx          Pass/fail list + coverage bar
      BoardOutput.tsx          ESP32 serial output stream
      TeachingSidebar.tsx      Teaching moments list
      ProgressPanel.tsx        Build progress + deploy status
    Skills/                  Skills CRUD modal + template library + SkillFlowEditor
    Rules/                   Rules CRUD modal + template library
    Portals/                 Portal connections modal + registry
    shared/                  MainTabBar, GoButton, HumanGateModal, QuestionModal, TeachingToast,
                             AgentAvatar, MinionAvatar, ReadinessBadge, FlashWizardModal,
                             BoardDetectedModal, DirectoryPickerModal, ExamplePickerModal, ErrorBoundary
  hooks/
    useBuildSession.ts       All session state + WebSocket event dispatching
    useSkillSession.ts       Standalone skill execution state
    useBoardDetect.ts        ESP32 board detection polling
    useHealthCheck.ts        Backend readiness polling
    useWebSocket.ts          WebSocket connection with auto-reconnect
  lib/
    apiClient.ts             REST API wrapper
    nuggetFile.ts            .elisa nugget file save/load (JSZip-based)
    playChime.ts             Web Audio API chime for board detection events
    skillTemplates.ts        Pre-built skill and rule templates
    terminology.ts           Kid-friendly term mappings
    deviceBlocks.ts          Dynamic Blockly block registration from device plugins
    examples/                Bundled example nuggets
  types/
    index.ts                 All TypeScript interfaces (NuggetSpec, Task, Agent, WSEvent, etc.)
```

## State Management

No state library. `useBuildSession` hook holds all session state as `useState` variables. WebSocket events dispatched through `handleEvent()` to update state slices. Auto-saves workspace, skills, rules, and portals to `localStorage`.

UI phases: `design` | `building` | `review` | `deploy` | `done`

Main tabs: `workspace` | `agents` | `tasks` (auto-switches to `agents` when build starts)

## Adding a New Block Type

1. Define the block in `BlockCanvas/blockDefinitions.ts` following existing patterns (colour, fields, connections).
2. Add it to the appropriate category in `BlockCanvas/toolbox.ts`.
3. Add interpretation logic in `BlockCanvas/blockInterpreter.ts` to map it into `NuggetSpec`.
4. Rebuild and test -- the block appears in the palette automatically.
