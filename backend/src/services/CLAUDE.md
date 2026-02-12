# Backend Services

Each service owns one concern. Orchestrator coordinates them all.

## Service Map

### orchestrator.ts (central controller)
Runs the full build pipeline: plan -> execute -> test -> review -> deploy. Manages task state, human gates (Promise-based pause/resume), WebSocket event emission. Largest file in the backend (~22KB).

### agentRunner.ts (SDK agent runner)
Calls `query()` from `@anthropic-ai/claude-agent-sdk` to run agents programmatically. Streams `assistant` messages and extracts `result` metadata (tokens, cost). 300s timeout, 2 retries on failure.

### metaPlanner.ts (task decomposition)
Calls Claude API (opus model) with NuggetSpec + system prompt. Returns structured task DAG with dependencies, acceptance criteria, and role assignments. Validates DAG for cycles. Retry on JSON parse failure.

### gitService.ts (version control)
Wraps simple-git. Inits repo per session workspace, commits after each task with agent attribution. Tracks files changed per commit. Silently no-ops if git unavailable.

### hardwareService.ts (ESP32 integration)
Board detection via USB VID:PID matching. Compiles MicroPython with py_compile. Flashes via mpremote. Serial monitor via serialport at 115200 baud. 60s flash timeout.

### testRunner.ts (test execution)
Detects project type from file extensions in `tests/`. Runs `pytest` for `.py` files, `node` for `.js`/`.mjs` files, merges results if both exist. Parses PASS/FAIL and TAP output formats for JS; pytest verbose output for Python. Extracts coverage for Python only. 120s timeout per runner.

### teachingEngine.ts (educational moments)
Fast-path curriculum lookup maps events to concepts. Deduplicates per concept per session. Falls back to Claude Sonnet API for dynamic generation. Targets ages 8-14.

## Interaction Pattern

```
Orchestrator
  |-> MetaPlanner.plan(spec)         returns TaskDAG
  |-> for each ready task:
  |     AgentRunner.execute(prompt)  returns result + tokens
  |     GitService.commit()          returns commit metadata
  |     TeachingEngine.check()       returns teaching moment (if any)
  |     ContextManager.update()      writes summary for next agent
  |-> TestRunner.runTests()          returns test results + coverage
  |-> HardwareService.flash()        (if ESP32 target)
```
