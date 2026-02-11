# Frontend Components

Three-pane layout: BlockCanvas (left, flex-1) | MissionControl (right, w-80) | BottomBar (bottom, h-32). Overlay modals for gates, questions, skills, and completion.

## Component Tree

```
App.tsx
  BlockCanvas/BlockCanvas.tsx        Blockly editor wrapper. Read-only during build.
  MissionControl/MissionControl.tsx  Right sidebar with agent status + task progress
    TaskDAG.tsx                      @xyflow/react graph of task dependencies
    CommsFeed.tsx                    Scrolling agent message log
    MetricsPanel.tsx                 Token usage bars per agent
  BottomBar/BottomBar.tsx            Tabbed panel (4 tabs)
    GitTimeline.tsx                  Commit list with file diffs
    TestResults.tsx                  Pass/fail indicators + coverage bar
    BoardOutput.tsx                  Serial output from ESP32
    TeachingSidebar.tsx              Learning moments list
  shared/GoButton.tsx                Large build trigger button
  shared/HumanGateModal.tsx          Blocks pipeline, awaits user approve/reject
  shared/QuestionModal.tsx           Multi-choice from agent, user picks answer
  shared/TeachingToast.tsx           Floating notification for learning moments
  shared/AgentAvatar.tsx             Status dot + role icon
  Skills/SkillsRulesModal.tsx        CRUD editor for custom skills and rules
```

## BlockCanvas Subsystem

- `blockDefinitions.ts`: 25+ custom block types across 9 categories (Goal, Requirements, Style, Agents, Flow, Hardware, Deploy, Skills)
- `blockInterpreter.ts`: Walks Blockly workspace JSON, extracts fields, builds ProjectSpec. This is the bridge between visual blocks and the backend API.
- `toolbox.ts`: Defines Blockly sidebar categories and their block contents.

## Key Patterns

- All state lives in App.tsx via `useBuildSession` hook. Components receive state and callbacks as props.
- WSEvent discriminated union ensures exhaustive handling of all event types.
- Modals use fixed positioning with backdrop overlay. Only one modal shows at a time.
- Skills/Rules registry is in-memory only (not persisted across reloads).
