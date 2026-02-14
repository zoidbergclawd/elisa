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
  components/
    BlockCanvas/         Blockly workspace
      BlockCanvas.tsx      Editor wrapper (read-only during builds)
      blockDefinitions.ts  All 25 block type definitions
      blockInterpreter.ts  Workspace -> ProjectSpec JSON conversion
      toolbox.ts           Palette categories and block ordering
    MissionControl/      Right sidebar (w-80)
      MissionControl.tsx   Container with tabs/panels
      TaskDAG.tsx          @xyflow/react dependency graph
      CommsFeed.tsx        Scrolling agent message log
      MetricsPanel.tsx     Token usage bars per agent
    BottomBar/           Bottom panel (h-32, 4 tabs)
      BottomBar.tsx        Tab container
      GitTimeline.tsx      Commit list with file diffs
      TestResults.tsx      Pass/fail list + coverage bar
      BoardOutput.tsx      ESP32 serial output stream
      TeachingSidebar.tsx  Teaching moments list
    shared/              Reusable UI components
      GoButton.tsx         Floating build trigger
      HumanGateModal.tsx   Approval/reject modal
      QuestionModal.tsx    Multi-choice agent question modal
      TeachingToast.tsx    Floating notification
      AgentAvatar.tsx      Status dot + role icon
    Skills/
      SkillsModal.tsx      CRUD editor for custom skills + template library
    Rules/
      RulesModal.tsx       CRUD editor for rules + template library
  hooks/
    useBuildSession.ts   WebSocket connection + session state
  App.tsx                Root layout, all top-level state (useState)
```

## State Management

No state library. All state lives in `App.tsx` via `useState` and is passed down as props. The `useBuildSession` hook manages the WebSocket connection and dispatches incoming events to state setters.

UI state machine: `design` -> `building` -> `review` -> `deploy` -> `done`

## Adding a New Block Type

1. Define the block in `BlockCanvas/blockDefinitions.ts` following existing patterns (colour, fields, connections).
2. Add it to the appropriate category in `BlockCanvas/toolbox.ts`.
3. Add interpretation logic in `BlockCanvas/blockInterpreter.ts` to map it into `ProjectSpec`.
4. Rebuild and test -- the block appears in the palette automatically.
