# Frontend Module

React 19 + TypeScript + Vite SPA. Visual block editor (Blockly) for composing nugget specs, real-time dashboard for monitoring agent execution.

## Stack

- React 19.2, Vite 7.3, TypeScript 5.9, Tailwind CSS 4
- Blockly 12.3 (block editor), @xyflow/react 12.10 (task DAG viz), elkjs (graph layout)
- JSZip 3 (nugget file save/load)
- Vitest + Testing Library (tests)

## Structure

```
src/
  App.tsx                    Root component. Owns all session state. Tabbed main layout.
  main.tsx                   Entry point. React 19 createRoot.
  components/
    BlockCanvas/             Blockly editor + block-to-NuggetSpec conversion + WorkspaceSidebar
    AgentTeam/               Full-width agent cards + comms feed panel (Agents tab)
    TaskMap/                 Full-width interactive task DAG panel (Tasks tab)
    MissionControl/          MissionControlPanel (layout), MinionSquadPanel, NarratorFeed, TaskDAG, CommsFeed, MetricsPanel
    BottomBar/               Bottom tabs: timeline, tests, board, learn, progress, tokens
    Skills/                  Skills editor modal + template library + SkillFlowEditor (visual flow editor)
    Rules/                   Rules editor modal + template library
    Portals/                 Portals editor modal + registry
    shared/                  MainTabBar, GoButton, HumanGateModal, QuestionModal, TeachingToast, AgentAvatar, ReadinessBadge, ExamplePickerModal, DirectoryPickerModal
  hooks/
    useBuildSession.ts       All build session state (tasks, agents, commits, events, etc.)
    useSkillSession.ts       Standalone skill execution state + WebSocket events
    useBoardDetect.ts        ESP32 board detection polling via /api/hardware/detect
    useHealthCheck.ts        Polls /api/health for backend readiness (API key + SDK status)
    useWebSocket.ts          WebSocket connection with auto-reconnect (3s interval)
  lib/
    nuggetFile.ts            .elisa nugget file save/load utilities (JSZip-based)
    playChime.ts             Web Audio API two-tone chime for board detection events
    skillTemplates.ts        Pre-built skill and rule templates for template library
    terminology.ts           Kid-friendly term mappings (technical -> friendly labels)
    examples/                Bundled example nuggets (ES modules, offline-ready)
  types/
    index.ts                 All TypeScript interfaces (NuggetSpec, Task, Agent, WSEvent, etc.)
```

## State Management

No state library. `useBuildSession` hook holds all session state as `useState` variables. WebSocket events arrive and are dispatched through `handleEvent()` which updates the relevant state slices.

Workspace JSON, skills, and rules auto-save to `localStorage` on every change and restore on page load. Keys: `elisa:workspace`, `elisa:skills`, `elisa:rules`, `elisa:portals`, `elisa:workspace-path` (user-chosen directory).

UI phases: `design` | `building` | `review` | `deploy` | `done`

Main tabs: `workspace` | `agents` | `tasks` (auto-switches to `agents` when build starts)

## Communication with Backend

- **REST**: `POST /api/sessions`, `POST /api/sessions/:id/start` (accepts optional `workspace_path`), `POST /api/sessions/:id/stop` (cancel build), `POST /api/sessions/:id/gate`, `POST /api/sessions/:id/question`, `GET /api/sessions/:id/export`, `POST /api/workspace/save`, `POST /api/workspace/load`
- **WebSocket**: `ws://localhost:8000/ws/session/:sessionId` - receives all streaming events
- Vite proxies both `/api/*` and `/ws/*` to backend in dev mode

## Key Conventions

- Functional components only, Props interface per component
- Tailwind utility classes for all styling
- Status colors: blue=working, green=done, red=error, yellow=warning
- Test files colocated with source (`.test.tsx` / `.test.ts`)
- WSEvent is a discriminated union - exhaustive switch in event handlers
- Serial lines capped at MAX_SERIAL_LINES=1000 (oldest trimmed when exceeded)
- Backend Zod validation errors surfaced via `body.detail` + `body.errors` array
