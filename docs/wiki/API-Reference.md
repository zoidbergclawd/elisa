# API Reference

## REST Endpoints

Base URL: `http://localhost:8000/api`

All endpoints (except `/api/health`) require `Authorization: Bearer <token>` header. The token is generated on server startup and shared to the Electron renderer via IPC.

### Sessions

| Method | Path | Request Body | Response | Description |
|--------|------|--------------|----------|-------------|
| POST | `/sessions` | — | `{ session_id }` | Create a new build session |
| GET | `/sessions/:id` | — | `BuildSession` | Get full session state |
| POST | `/sessions/:id/start` | `{ spec: NuggetSpec, workspace_path?, workspace_json? }` | `{ status: "started" }` | Start build with a NuggetSpec |
| POST | `/sessions/:id/stop` | — | `{ status: "stopped" }` | Cancel a running build |
| GET | `/sessions/:id/tasks` | — | `Task[]` | List all tasks in session |
| GET | `/sessions/:id/git` | — | `CommitInfo[]` | Get commit history |
| GET | `/sessions/:id/tests` | — | Test results object | Get test outcomes |
| GET | `/sessions/:id/export` | — | `application/zip` | Export nugget directory as zip |
| POST | `/sessions/:id/gate` | `{ approved?, feedback? }` | `{ status: "ok" }` | Respond to a human gate |
| POST | `/sessions/:id/question` | `{ task_id, answers }` | `{ status: "ok" }` | Answer an agent question |

### Skills

| Method | Path | Request Body | Response | Description |
|--------|------|--------------|----------|-------------|
| POST | `/skills/run` | `{ plan: SkillPlan, allSkills? }` | `{ session_id }` | Start standalone skill execution |
| POST | `/skills/:sessionId/answer` | `{ step_id, answers }` | `{ status: "ok" }` | Answer a skill's `ask_user` question |

### Hardware

| Method | Path | Request Body | Response | Description |
|--------|------|--------------|----------|-------------|
| GET | `/hardware/detect` | — | `{ detected, port?, board_type? }` | Detect connected ESP32 |
| POST | `/hardware/flash/:id` | — | `{ success, message }` | Flash session output to board |

### Workspace

| Method | Path | Request Body | Response | Description |
|--------|------|--------------|----------|-------------|
| POST | `/workspace/save` | `{ workspace_path, workspace_json?, skills?, rules?, portals? }` | `{ status: "saved" }` | Save design files to directory |
| POST | `/workspace/load` | `{ workspace_path }` | `{ workspace, skills, rules, portals }` | Load design files from directory |

### Health

| Method | Path | Response | Description |
|--------|------|----------|-------------|
| GET | `/health` | `{ status, apiKey, apiKeyError?, agentSdk }` | Health check (no auth required) |

Status values: `"ready"` or `"degraded"`. API key values: `"valid"`, `"invalid"`, `"missing"`, `"unchecked"`. Agent SDK: `"available"` or `"not_found"`.

---

## WebSocket Events

Connect to: `ws://localhost:8000/ws/session/:sessionId?token=<auth_token>`

All events flow server → client as JSON with a `type` discriminator field.

### Session Lifecycle

| Event | Payload | Description |
|-------|---------|-------------|
| `planning_started` | — | Meta-planner decomposing spec |
| `plan_ready` | `{ tasks, agents, explanation, deployment_target? }` | Task DAG ready |
| `workspace_created` | `{ nugget_dir }` | Nugget workspace directory created |
| `session_complete` | `{ summary }` | Build finished |
| `error` | `{ message, recoverable }` | Error occurred |

### Task Execution

| Event | Payload | Description |
|-------|---------|-------------|
| `task_started` | `{ task_id, agent_name }` | Agent began working on task |
| `task_completed` | `{ task_id, summary }` | Task finished successfully |
| `task_failed` | `{ task_id, error, retry_count }` | Task failed (may auto-retry) |

### Agent Activity

| Event | Payload | Description |
|-------|---------|-------------|
| `agent_output` | `{ task_id, agent_name, content }` | Streamed agent message chunk |
| `agent_status` | `{ agent }` | Agent status changed |
| `agent_message` | `{ from, to, content }` | Inter-agent communication |
| `token_usage` | `{ agent_name, input_tokens, output_tokens, cost_usd }` | Token consumption |
| `budget_warning` | `{ total_tokens, max_budget, cost_usd }` | Budget threshold reached |
| `minion_state_change` | `{ agent_name, old_status, new_status }` | Minion status transition |
| `narrator_message` | `{ from, text, mood, related_task_id? }` | Narrator commentary |
| `permission_auto_resolved` | `{ task_id, permission_type, decision, reason }` | Permission auto-resolved |

### Build Artifacts

| Event | Payload | Description |
|-------|---------|-------------|
| `commit_created` | `{ sha, message, agent_name, task_id, timestamp, files_changed }` | Git commit created |
| `test_result` | `{ test_name, passed, details }` | Individual test outcome |
| `coverage_update` | `{ percentage, details? }` | Code coverage report |

### Skill Execution

| Event | Payload | Description |
|-------|---------|-------------|
| `skill_started` | `{ skill_id, skill_name }` | Skill execution started |
| `skill_step` | `{ skill_id, step_id, step_type, status }` | Skill step progress |
| `skill_question` | `{ skill_id, step_id, questions }` | Skill asking user a question |
| `skill_output` | `{ skill_id, step_id, content }` | Skill step output |
| `skill_completed` | `{ skill_id, result }` | Skill finished |
| `skill_error` | `{ skill_id, message }` | Skill failed |

### Deployment

| Event | Payload | Description |
|-------|---------|-------------|
| `deploy_started` | `{ target }` | Deploy phase started |
| `deploy_progress` | `{ step, progress }` | Deploy progress (0–100) |
| `deploy_checklist` | `{ rules }` | Pre-deploy rules checklist |
| `deploy_complete` | `{ target, url? }` | Deploy finished |
| `serial_data` | `{ line, timestamp }` | ESP32 serial monitor output |

### User Interaction

| Event | Payload | Description |
|-------|---------|-------------|
| `human_gate` | `{ task_id, question, context }` | Build paused, awaiting approval |
| `user_question` | `{ task_id, questions }` | Agent asking user a question |
| `teaching_moment` | `{ concept, headline, explanation, tell_me_more?, related_concepts? }` | Learning moment |

---

## NuggetSpec Schema

The JSON structure produced by the block interpreter and sent to `POST /sessions/:id/start`.

```typescript
interface NuggetSpec {
  project: {
    goal: string;           // What the user wants to build
    description: string;    // Expanded description
    type: string;           // "game" | "website" | "hardware" | "story" | "tool" | "general"
  };
  requirements: Array<{
    type: string;           // "feature" | "constraint" | "when_then" | "data"
    description: string;
  }>;
  style?: {
    visual: string | null;
    personality: string | null;
  };
  agents: Array<{
    name: string;
    role: string;           // "builder" | "tester" | "reviewer" | "custom"
    persona: string;
  }>;
  hardware?: {
    target: string;
    components: Array<{ type: string; [key: string]: unknown }>;
  };
  deployment: {
    target: string;         // "preview" | "web" | "esp32" | "both"
    auto_flash: boolean;
  };
  workflow: {
    review_enabled: boolean;
    testing_enabled: boolean;
    human_gates: string[];
    flow_hints?: Array<{ type: "sequential" | "parallel"; descriptions: string[] }>;
    iteration_conditions?: string[];
  };
  skills?: Array<{ id: string; name: string; prompt: string; category: string }>;
  rules?: Array<{ id: string; name: string; prompt: string; trigger: string }>;
}
```

### Key Types

```typescript
type TaskStatus = "pending" | "in_progress" | "done" | "failed";
type AgentRole = "builder" | "tester" | "reviewer" | "custom";
type AgentStatus = "idle" | "working" | "done" | "error" | "waiting";
type SessionState = "idle" | "planning" | "executing" | "testing" | "deploying" | "reviewing" | "done";
```

---

## SkillPlan Schema

Sent to `POST /api/skills/run`. Represents a sequence of steps to execute.

```typescript
interface SkillPlan {
  skillId: string;
  skillName: string;
  steps: SkillStep[];       // Max 50 steps
}
```

### SkillStep Types

| Type | Fields | Description |
|------|--------|-------------|
| `ask_user` | `question`, `header`, `options`, `storeAs` | Pauses execution, presents choice to user |
| `branch` | `contextKey`, `matchValue`, `thenSteps` | Conditional execution based on context value |
| `invoke_skill` | `skillId`, `storeAs` | Calls another skill (max depth 10, cycle detection) |
| `run_agent` | `prompt`, `storeAs` | Spawns a Claude agent with prompt template |
| `set_context` | `key`, `value` | Sets a context variable |
| `output` | `template` | Produces final skill output |

All text fields support `{{key}}` template syntax for context variable interpolation.

---

## Narrator System

The narrator translates raw build events into kid-friendly commentary via Claude Haiku.

- **Trigger events**: `task_started`, `task_completed`, `task_failed`, `agent_message`, `error`, `session_complete`
- **Moods**: `excited`, `encouraging`, `concerned`, `celebrating`
- **Rate limit**: Max 1 message per task per 15 seconds
- **Debounce**: `agent_output` events accumulated per task, translated after 10-second silence
- **Model**: Configurable via `NARRATOR_MODEL` env var (default: `claude-haiku-4-5-20241022`)

---

## Portal Security

### Command Allowlist

CLI portals validate commands against: `node`, `npx`, `python`, `python3`, `pip`, `pip3`, `mpremote`, `arduino-cli`, `esptool`, `git`

### Execution Model

`CliPortalAdapter.execute()` uses `execFile` (not shell) — arguments passed directly to executable, preventing shell injection.

### Serial Validation

Serial portals validate via USB VID:PID board detection before flash operations.
