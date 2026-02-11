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
  App.tsx                    Root component. Owns all session state. Orchestrates layout + overlays.
  main.tsx                   Entry point. React 19 createRoot.
  components/
    BlockCanvas/             Blockly editor + block-to-NuggetSpec conversion
    MissionControl/          Right sidebar: agent status, task DAG, comms, metrics
    BottomBar/               Bottom tabs: git timeline, tests, board output, teaching
    Skills/                  Skills & Rules editor modal + registry
    shared/                  GoButton, HumanGateModal, QuestionModal, TeachingToast, AgentAvatar, ReadinessBadge
  hooks/
    useBuildSession.ts       All build session state (tasks, agents, commits, events, etc.)
    useHealthCheck.ts        Polls /api/health for backend readiness (API key + CLI status)
    useWebSocket.ts          WebSocket connection with auto-reconnect (3s interval)
  lib/
    nuggetFile.ts            .elisa nugget file save/load utilities (JSZip-based)
    examples/                Bundled example nuggets (ES modules, offline-ready)
  types/
    index.ts                 All TypeScript interfaces (NuggetSpec, Task, Agent, WSEvent, etc.)
```

## State Management

No state library. `useBuildSession` hook holds all session state as `useState` variables. WebSocket events arrive and are dispatched through `handleEvent()` which updates the relevant state slices.

Workspace JSON, skills, and rules auto-save to `localStorage` on every change and restore on page load. Keys: `elisa:workspace`, `elisa:skills`, `elisa:rules`.

UI phases: `design` | `building` | `review` | `deploy` | `done`

## Communication with Backend

- **REST**: `POST /api/sessions`, `POST /api/sessions/:id/start`, `POST /api/sessions/:id/gate`, `POST /api/sessions/:id/answer`, `GET /api/sessions/:id/export`
- **WebSocket**: `ws://localhost:8000/ws/session/:sessionId` - receives all streaming events
- Vite proxies both `/api/*` and `/ws/*` to backend in dev mode

## Key Conventions

- Functional components only, Props interface per component
- Tailwind utility classes for all styling
- Status colors: blue=working, green=done, red=error, yellow=warning
- Test files colocated with source (`.test.tsx` / `.test.ts`)
- WSEvent is a discriminated union - exhaustive switch in event handlers
