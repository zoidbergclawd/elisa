# Building

Once you have designed your project with blocks, you build it by pressing GO.

## The GO button

The GO button is in the top-right corner of the header. It has several states:

| State | Appearance | Meaning |
|-------|-----------|---------|
| **Ready** | Green, gently pulsing | Your design has a goal and the backend is ready. Press it to build. |
| **Disabled** | Dimmed | Something is missing: no Goal block, or the backend is not ready. |
| **Building** | Shows "STOP" | A build is in progress. Press STOP to cancel. |

The GO button is enabled when all three conditions are met:
- You are in design mode (not already building)
- Your workspace has a Goal block with text
- The readiness badge shows "Ready"

## Choosing a workspace folder

The first time you press GO, Elisa asks you to pick a folder where it will save the generated project files. In the Electron app, this opens a native folder picker. In dev mode, you type the path manually.

The folder is remembered for future builds. You can change it using the Folder button in the sidebar.

## Build lifecycle

A build goes through these phases:

```
design --> building --> review (optional) --> deploy --> done
```

| Phase | What happens |
|-------|-------------|
| **design** | You are editing blocks on the canvas. |
| **building** | AI agents are planning tasks, writing code, and running tests. The view switches to Mission Control. |
| **review** | The build pauses because a "Check with me" block triggered. You approve or reject in a modal dialog. |
| **deploy** | Code is deployed (web preview, hardware flash, or both). |
| **done** | Build complete. A summary dialog appears with options to build something new or keep working. |

## Mission Control

When a build starts, the view switches to the Mission Control tab. It has three sections:

### Task DAG (left side)
An interactive graph showing all tasks as nodes with arrows for dependencies. Node colors indicate status:
- Gray = pending
- Blue = in progress
- Green = done
- Red = failed

### Minion Squad (top right)
Cards for each agent showing their name, role, persona, and current status (idle, working, done, error).

### Narrator Feed (bottom right)
A scrolling feed of narrator messages that describe what is happening in kid-friendly language. The narrator has different moods: excited, encouraging, concerned, and celebrating.

## Bottom bar tabs

The bottom bar has six tabs that fill up during a build:

| Tab | What it shows |
|-----|--------------|
| **Timeline** | Git commits made by agents, with changed file lists. Each commit shows which agent made it and which task it was for. |
| **Tests** | Test results (pass/fail) and code coverage percentage. Shows a progress indicator during the test phase. |
| **Board** | Serial output from a connected ESP32 board. Only shows data when a board is active. |
| **Learn** | Teaching moments -- short explanations of programming concepts that come up during the build. |
| **Progress** | Build progress bar showing the current phase and percentage of tasks completed. |
| **Tokens** | Token usage per agent, total cost, and budget percentage. Shows usage bars for each minion. |

The Progress tab is auto-selected when a build starts. The Tests tab auto-selects when the first test result arrives.

## Stopping a build

During a build, the GO button changes to STOP. Press it to cancel the build. All agents stop, and you return to the "done" state where you can start over or keep working.

## Human gates

If you placed a "Check with me" block, the build pauses and shows a modal with a question and context about what the agents have done so far. You can approve to continue or reject to stop.

## Agent questions

Sometimes an agent needs your input during the build. A question modal appears with options to choose from. Your answer guides what the agent does next.

## "Keep working" flow

When a build completes, the "Nugget Complete!" dialog offers three options:

- **Open in Browser** -- If the project was deployed to web, opens it in a new tab.
- **Build something new** -- Reloads the page for a fresh start.
- **Keep working on this nugget** -- Returns to design mode with the same blocks. The next build picks up where you left off, using the existing code and git history.
