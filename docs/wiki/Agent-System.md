# Agent System

Elisa's backend orchestrates AI agents to build software and hardware projects. This page covers agent roles, prompts, execution, context sharing, permissions, and retries.

## Agent Roles

| Role | Purpose | Prompt Template |
|------|---------|----------------|
| **Builder** | Writes source code | `backend/src/prompts/builderAgent.ts` |
| **Tester** | Writes and runs tests | `backend/src/prompts/testerAgent.ts` |
| **Reviewer** | Reviews code quality | `backend/src/prompts/reviewerAgent.ts` |
| **Custom** | User-defined persona | Uses builder prompt as base |
| **Narrator** | Translates events to kid-friendly commentary | `backend/src/prompts/narratorAgent.ts` |

Agents are configured via Minion blocks on the canvas. If no Minion blocks are placed, Elisa uses a default team (one builder, one tester).

## Agent Prompts

Each agent receives a system prompt constructed from:

1. **Role template** — Base instructions for the agent role (builder, tester, reviewer)
2. **Persona** — The kid's description of the agent's personality (from the Minion block)
3. **Task description** — What the agent needs to do, with acceptance criteria
4. **Context from prior tasks** — Summaries of what previous agents did (the context chain)
5. **File manifest** — What files exist in the workspace
6. **Style requirements** — Visual and personality settings from Style blocks
7. **Skills** — Active skill prompts that apply to this task
8. **Rules** — Active rule prompts based on trigger type
9. **Content safety** — Age-appropriate output enforcement (ages 8–14)

### Builder Prompt Highlights

- Write clean, well-commented code understandable by beginners
- Use simple variable names
- Prefer clarity over cleverness
- Handle errors gracefully
- Write kid-friendly commit messages
- Respect file boundaries

### Tester Prompt Highlights

- Each test verifies one thing
- Test both happy path and edge cases
- Report results with pass/fail indicators
- Include test coverage when applicable

### Reviewer Prompt Highlights

- Check acceptance criteria, readability, bugs, simplicity
- Provide verdict: APPROVED or NEEDS CHANGES
- Be encouraging — point out what's good, not just problems

## Execution Model

Each agent task runs as a separate Claude Agent SDK `query()` call via `AgentRunner`:

```
AgentRunner.execute(prompt, options)
  → SDK query() with permissionMode: 'bypassPermissions', maxTurns: 20
  → Streams assistant messages via async iteration
  → Extracts result metadata (tokens, cost)
  → Returns result summary
```

**Configuration:**
- Timeout: 300 seconds per agent
- Retries: Up to 2 retries on failure
- Model: `claude-opus-4-6` (configurable via `CLAUDE_MODEL`)
- Max turns: 20

## Streaming-Parallel Execution

The Orchestrator runs tasks from the DAG using a streaming-parallel pool:

1. **Kahn's algorithm** sorts tasks topologically
2. Tasks with all dependencies satisfied enter the "ready" queue
3. Up to **3 tasks** run concurrently via `Promise.race`
4. When any task completes, the next ready task starts
5. Git commits are serialized via mutex (only one commit at a time)
6. Token budget is checked after each task completion

```
Ready queue: [task_1, task_2, task_3, task_4, ...]
Pool (max 3): [task_1 ⚙️, task_2 ⚙️, task_3 ⚙️]
                ↓ task_1 completes
Pool:          [task_4 ⚙️, task_2 ⚙️, task_3 ⚙️]
```

## Context Chain

After each task, a context summary is written so subsequent agents know what happened:

1. Agent completes a task and produces output
2. A **summary** is extracted from the output
3. A **structural digest** of the workspace files is generated
4. Both are written to `.elisa/context/nugget_context.md`
5. The next agent receives this context in its prompt under "WHAT HAPPENED BEFORE YOU"

### Context Levels

| Level | When | Context Provided |
|-------|------|-----------------|
| 1 | Scaffolding agent | Project spec only |
| 2 | First implementation agents | Spec + scaffolding summary + file manifest |
| 3 | Dependent agents | Spec + all predecessor summaries + file manifest |
| 4 | Integration/test agents | Everything + review feedback |
| 5 | Deployment agent | Everything + test results + build artifacts |

## Permission Policy

`PermissionPolicy` auto-resolves agent permission requests based on configurable rules:

| Permission Type | Policy |
|----------------|--------|
| File write (in workspace) | Auto-approved |
| File write (outside workspace) | Denied |
| Read-only commands (`ls`, `cat`, `grep`) | Always safe |
| Workspace commands (`mkdir`, `python`, `npm`) | Approved if cwd is in workspace |
| Network commands (`curl`, `wget`) | Denied by default |
| Package installs (`pip install`, `npm install`) | Escalated to user |

After 3 denied permissions per task, the policy escalates to the user.

## Task Decomposition (MetaPlanner)

The MetaPlanner calls Claude (Opus model) to decompose a NuggetSpec into a task DAG:

1. Receives the full NuggetSpec as input
2. Applies decomposition rules (4–12 tasks, each 1–5 minutes, no cycles)
3. Returns structured JSON: tasks with dependencies, acceptance criteria, agent assignments
4. Validates the DAG for cycles
5. Retries on JSON parse failure

### Decomposition Rules

- First task is always project scaffolding
- Last task is integration verification
- Each task has clear acceptance criteria
- Hardware tasks include compilation verification
- A builder should never review their own work
- Dependencies follow logical order (scaffolding → implementation → tests → integration → deploy)

## Teaching Engine

The TeachingEngine surfaces contextual learning moments during builds:

1. **Fast-path lookup**: Maps build events to a curriculum of pre-defined concepts
2. **Deduplication**: Each concept shown only once per session
3. **API fallback**: Falls back to Claude Sonnet for dynamic generation
4. **Target audience**: Ages 8–14

Concepts covered: source control, testing, decomposition, code review, architecture, hardware (GPIO, LoRa, compilation, flashing).

## Narrator Service

The NarratorService translates raw build events into kid-friendly commentary:

- Uses Claude Haiku (`NARRATOR_MODEL` env var)
- 4 moods: excited, encouraging, concerned, celebrating
- Rate limited: max 1 message per task per 15 seconds
- `agent_output` events debounced (10-second silence window)
- Fallback templates on API timeout

## Error Handling and Retries

| Scenario | Behavior |
|----------|----------|
| Agent timeout (>300s) | Retry with same prompt (max 2 retries) |
| Agent produces invalid output | Feed errors back for self-correction |
| Circular dependency in DAG | Rejected during planning |
| Token budget exceeded | Graceful stop with warning |
| All retries exhausted | Human gate: "We're having trouble with this part" |
| Hardware compilation fails | Error surfaced to user |
| Flash timeout (>60s) | Retry up to 3 times |

## Cancellation

When a build is cancelled (STOP button or error):

1. `Orchestrator.cancel()` triggers the AbortController
2. Signal propagated to all active SDK `query()` calls
3. Agents abort immediately
4. Session state set to `done`
5. WebSocket connections cleaned up
