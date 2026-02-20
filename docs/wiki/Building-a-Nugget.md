# Building a Nugget

Once you have designed your project with blocks, you build it by pressing GO.

## The GO Button

The GO button is in the top-right corner of the header.

| State | Appearance | Meaning |
|-------|-----------|---------|
| **Ready** | Green, gently pulsing | Your design has a goal and the backend is ready. Press it to build. |
| **Disabled** | Dimmed | Something is missing: no Goal block, or the backend is not ready. |
| **Building** | Shows "STOP" | A build is in progress. Press STOP to cancel. |

The GO button is enabled when all three conditions are met:
- You are in design mode (not already building)
- Your workspace has a Goal block with text
- The readiness badge shows "Ready"

## Choosing a Workspace Folder

The first time you press GO, Elisa asks you to pick a folder where it will save the generated project files. In the Electron app, this opens a native folder picker. In dev mode, you type the path manually.

The folder is remembered for future builds. You can change it using the Folder button in the sidebar.

## Build Lifecycle

A build goes through these phases:

```
design → building → review (optional) → deploy → done
```

| Phase | What Happens |
|-------|-------------|
| **design** | You are editing blocks on the canvas. |
| **building** | AI agents are planning tasks, writing code, and running tests. The view switches to Mission Control. |
| **review** | The build pauses because a "Check with me" block triggered. You approve or reject. |
| **deploy** | Code is deployed (web preview, hardware flash, or both). |
| **done** | Build complete. A summary dialog appears. |

### Under the Hood

1. The block interpreter converts your workspace into a **NuggetSpec** JSON (validated via Zod schema).
2. The NuggetSpec is sent to the backend via `POST /api/sessions/:id/start`.
3. The **MetaPlanner** (Claude Opus) decomposes the spec into a **task DAG** — a directed acyclic graph of tasks with dependencies.
4. The **Orchestrator** executes tasks using a streaming-parallel pool (up to 3 concurrent agents via Promise.race).
5. Each agent runs via the Claude Agent SDK's `query()` API with role-specific prompts.
6. After each task, a git commit is created and a context summary is written for subsequent agents.
7. Tests run via pytest (Python) or Node test runner (JavaScript).
8. Deployment happens last: web preview, ESP32 flash, or portal execution.

## Mission Control

When a build starts, the view switches to the Mission Control tab. It has three sections:

### Task DAG (left side)
An interactive graph showing all tasks as nodes with arrows for dependencies. Node colors indicate status:
- **Gray** = pending
- **Blue** = in progress
- **Green** = done
- **Red** = failed

### Minion Squad (top right)
Cards for each agent showing their name, role, persona, and current status (idle, working, done, error).

### Narrator Feed (bottom right)
A scrolling feed of narrator messages that describe what is happening in kid-friendly language. The narrator has different moods: excited, encouraging, concerned, and celebrating.

## Bottom Bar Tabs

The bottom bar has six tabs that fill up during a build:

| Tab | What It Shows |
|-----|--------------|
| **Timeline** | Git commits made by agents, with changed file lists |
| **Tests** | Test results (pass/fail) and code coverage percentage |
| **Board** | Serial output from a connected ESP32 board |
| **Learn** | Teaching moments — short explanations of programming concepts |
| **Progress** | Build progress bar showing current phase and task completion |
| **Tokens** | Token usage per agent, total cost, and budget percentage |

## Stopping a Build

During a build, the GO button changes to STOP. Press it to cancel. All agents stop via AbortController signal propagation, and you return to the "done" state.

## Human Gates

If you placed a "Check with me" block, the build pauses and shows a modal with context about what the agents have done so far. You can:
- **Approve** to continue the build
- **Reject** to stop

## Agent Questions

Sometimes an agent needs your input during the build. A question modal appears with options to choose from. Your answer guides what the agent does next.

## "Keep Working" Flow

When a build completes, the "Nugget Complete!" dialog offers three options:

- **Open in Browser** — If the project was deployed to web, opens it in a new tab.
- **Build something new** — Reloads the page for a fresh start.
- **Keep working on this nugget** — Returns to design mode with the same blocks. The next build picks up where you left off, using the existing code and git history.

## Token Budget

Each build session has a default budget of 500,000 tokens. A warning appears at 80% usage. When the budget is exceeded, the build stops gracefully. See [Troubleshooting](Troubleshooting) for tips on working within the budget.
