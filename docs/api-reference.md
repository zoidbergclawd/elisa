# API Reference

## REST Endpoints

Base URL: `http://localhost:8000/api`

### Sessions

| Method | Path | Request Body | Response | Description |
|--------|------|--------------|----------|-------------|
| POST | `/sessions` | -- | `{ session_id: string }` | Create a new build session |
| GET | `/sessions/:id` | -- | `BuildSession` | Get full session state |
| POST | `/sessions/:id/start` | `{ spec: ProjectSpec, workspace_path?: string, workspace_json?: object }` | `{ status: "started" }` | Start build with a ProjectSpec |
| POST | `/sessions/:id/stop` | -- | `{ status: "stopped" }` | Cancel a running build |
| GET | `/sessions/:id/tasks` | -- | `Task[]` | List all tasks in session |
| GET | `/sessions/:id/git` | -- | `CommitInfo[]` | Get commit history |
| GET | `/sessions/:id/tests` | -- | Test results object | Get test outcomes |
| GET | `/sessions/:id/export` | -- | `application/zip` | Export nugget directory as zip |
| POST | `/sessions/:id/gate` | `{ approved?: boolean, feedback?: string }` | `{ status: "ok" }` | Respond to a human gate |
| POST | `/sessions/:id/question` | `{ task_id: string, answers: Record<string, any> }` | `{ status: "ok" }` | Answer an agent question |

### Skills

| Method | Path | Request Body | Response | Description |
|--------|------|--------------|----------|-------------|
| POST | `/skills/run` | `{ plan: SkillPlan, allSkills?: SkillSpec[] }` | `{ session_id: string }` | Start standalone skill execution. `allSkills` needed for `invoke_skill` steps. |
| POST | `/skills/:sessionId/answer` | `{ step_id: string, answers: Record<string, any> }` | `{ status: "ok" }` | Answer a skill's `ask_user` question. `answers` keyed by step header. |

### Hardware

| Method | Path | Request Body | Response | Description |
|--------|------|--------------|----------|-------------|
| GET | `/hardware/detect` | -- | `{ detected: boolean, port?: string, board_type?: string }` | Detect connected ESP32 |
| POST | `/hardware/flash/:id` | -- | `{ success: boolean, message: string }` | Flash session output to board |

### Workspace

| Method | Path | Request Body | Response | Description |
|--------|------|--------------|----------|-------------|
| POST | `/workspace/save` | `{ workspace_path, workspace_json?, skills?, rules?, portals? }` | `{ status: "saved" }` | Save design files to directory |
| POST | `/workspace/load` | `{ workspace_path }` | `{ workspace, skills, rules, portals }` | Load design files from directory |

### Other

| Method | Path | Response | Description |
|--------|------|----------|-------------|
| GET | `/health` | `{ status: "ready"\|"degraded", apiKey: "valid"\|"invalid"\|"missing"\|"unchecked", apiKeyError?: string, agentSdk: "available"\|"not_found" }` | Health check |
| GET | `/templates` | `[]` | Template list (not yet implemented) |

---

## WebSocket Events

Connect to: `ws://localhost:8000/ws/session/:sessionId`

All events flow server to client as JSON with a `type` discriminator field.

### Session Lifecycle

| Event | Payload | Description |
|-------|---------|-------------|
| `session_started` | `{ session_id }` | Session created |
| `planning_started` | -- | Meta-planner decomposing spec |
| `plan_ready` | `{ tasks: Task[], agents: Agent[], explanation: string, deployment_target?: string }` | Task DAG ready for execution |
| `workspace_created` | `{ nugget_dir: string }` | Nugget workspace directory created |
| `session_complete` | `{ summary }` | Build finished |
| `error` | `{ message, recoverable: boolean }` | Error occurred |

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
| `agent_status` | `{ agent: Agent }` | Agent status changed (idle/working/done/error/waiting) |
| `agent_message` | `{ from, to, content }` | Inter-agent communication |
| `token_usage` | `{ agent_name, input_tokens, output_tokens, cost_usd }` | Token consumption per agent |
| `budget_warning` | `{ total_tokens, max_budget, cost_usd }` | Token budget threshold reached |
| `minion_state_change` | `{ agent_name, old_status, new_status }` | Minion status transition |
| `narrator_message` | `{ from, text, mood, related_task_id? }` | Narrator commentary on build events |
| `permission_auto_resolved` | `{ task_id, permission_type, decision, reason }` | Agent permission auto-resolved by policy |

### Build Artifacts

| Event | Payload | Description |
|-------|---------|-------------|
| `commit_created` | `{ sha, message, agent_name, task_id, timestamp, files_changed }` | Git commit created |
| `test_result` | `{ test_name, passed: boolean, details }` | Individual test outcome |
| `coverage_update` | `{ percentage, details?: CoverageReport }` | Code coverage report |

### Skill Execution

| Event | Payload | Description |
|-------|---------|-------------|
| `skill_started` | `{ skill_id, skill_name }` | Skill plan execution started |
| `skill_step` | `{ skill_id, step_id, step_type, status }` | Skill step started/completed/failed |
| `skill_question` | `{ skill_id, step_id, questions: QuestionPayload[] }` | Skill asking user a question |
| `skill_output` | `{ skill_id, step_id, content }` | Skill step produced output |
| `skill_completed` | `{ skill_id, result }` | Skill plan finished |
| `skill_error` | `{ skill_id, message }` | Skill plan failed |

### Deployment

| Event | Payload | Description |
|-------|---------|-------------|
| `deploy_started` | `{ target }` | Deploy phase started |
| `deploy_progress` | `{ step, progress: number }` | Deploy progress (0-100) |
| `deploy_checklist` | `{ rules: Array<{ name, prompt }> }` | Pre-deploy rules checklist |
| `deploy_complete` | `{ target, url? }` | Deploy finished |
| `serial_data` | `{ line, timestamp }` | ESP32 serial monitor output |

### User Interaction

| Event | Payload | Description |
|-------|---------|-------------|
| `human_gate` | `{ task_id, question, context }` | Build paused, awaiting user approval |
| `user_question` | `{ task_id, questions: QuestionPayload[] }` | Agent asking user a question |
| `teaching_moment` | `{ concept, headline, explanation, tell_me_more?, related_concepts? }` | Learning moment surfaced |

**QuestionPayload**:
```typescript
{
  question: string;
  header: string;
  options: Array<{ label: string; description: string }>;
  multiSelect: boolean;
}
```

**NarratorMessage moods**: `excited`, `encouraging`, `concerned`, `celebrating`

---

## Narrator System

The narrator translates raw build events into kid-friendly commentary via Claude Haiku.

### Trigger Events

Narrator messages are triggered by these build events: `task_started`, `task_completed`, `task_failed`, `agent_message`, `error`, `session_complete`.

### WebSocket Event

```typescript
{
  type: "narrator_message";
  from: string;           // narrator character name
  text: string;           // kid-friendly message (max 200 chars)
  mood: string;           // "excited" | "encouraging" | "concerned" | "celebrating"
  related_task_id?: string;
}
```

### Configuration

- `NARRATOR_MODEL` env var overrides the model (default: `claude-haiku-4-5-20241022`)

### Debounce

`agent_output` events are accumulated per task and translated after a 10-second silence window. This avoids flooding the UI with narrator messages during rapid agent output.

### Rate Limit

Max 1 narrator message per task per 15 seconds. Messages that would exceed this limit are silently dropped.

---

## Portal Security

### Command Allowlist

CLI portals validate commands against a strict allowlist before execution:

```
node, npx, python, python3, pip, pip3, mpremote, arduino-cli, esptool, git
```

Any command not in this list is rejected with an error.

### Execution Model

`CliPortalAdapter.execute()` uses `execFile` (not `spawn` with `shell: true`). This prevents shell injection because `execFile` bypasses the shell entirely -- arguments are passed directly to the executable without shell interpretation.

### Serial Portal Validation

Serial portals are validated via board detection (USB VID:PID matching) before flash operations proceed. This ensures the target device is actually an ESP32 before attempting to write firmware.

---

## ProjectSpec Schema

The JSON structure produced by the block interpreter and sent to `POST /sessions/:id/start`.

```typescript
interface ProjectSpec {
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
    visual: string | null;  // "fun_colorful" | "clean_simple" | "dark_techy" | "nature" | "space"
    personality: string | null;
  };
  agents: Array<{
    name: string;
    role: string;           // "builder" | "tester" | "reviewer" | "custom"
    persona: string;
  }>;
  hardware?: {
    target: string;         // "esp32"
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
    flow_hints?: Array<{
      type: "sequential" | "parallel";
      descriptions: string[];
    }>;
    iteration_conditions?: string[];
  };
  skills?: Array<{
    id: string;
    name: string;
    prompt: string;
    category: string;       // "agent" | "feature" | "style"
  }>;
  rules?: Array<{
    id: string;
    name: string;
    prompt: string;
    trigger: string;        // "always" | "on_task_complete" | "on_test_fail" | "before_deploy"
  }>;
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

## SkillSpec Schema

Defines a reusable skill. Simple skills have a `prompt`. Composite skills additionally have a `workspace` (Blockly JSON for the flow editor).

```typescript
interface SkillSpec {
  id: string;               // Unique skill ID (max 200 chars)
  name: string;             // Display name (max 200 chars)
  prompt: string;           // Prompt template, supports {{key}} variables (max 5000 chars)
  category: string;         // "agent" | "feature" | "style" | "composite"
  workspace?: Record<string, unknown>;  // Blockly workspace JSON (composite skills only)
}
```

---

## SkillPlan Schema

Sent to `POST /api/skills/run`. Represents a sequence of steps to execute.

```typescript
interface SkillPlan {
  skillId: string;          // ID of the skill being executed (max 200 chars, optional)
  skillName: string;        // Display name (max 200 chars)
  steps: SkillStep[];       // Ordered steps (max 50)
}
```

### SkillStep (discriminated union on `type`)

All steps share `id: string` (max 200 chars). The 6 step types:

| Type | Fields | Description |
|------|--------|-------------|
| `ask_user` | `question` (max 2000), `header` (max 200), `options: string[]` (max 50 items), `storeAs` | Pauses execution, presents choice to user. Answer stored in context under `storeAs`. |
| `branch` | `contextKey`, `matchValue` (max 500), `thenSteps: SkillStep[]` (max 50, recursive) | Runs `thenSteps` only if `context[contextKey] === matchValue`. No else. |
| `invoke_skill` | `skillId`, `storeAs` | Calls another skill. Cycle detection (max depth 10). Result stored under `storeAs`. |
| `run_agent` | `prompt` (max 5000), `storeAs` | Spawns a Claude agent. Prompt supports `{{key}}` templates. Result stored under `storeAs`. |
| `set_context` | `key`, `value` (max 5000) | Sets a context variable. Value supports `{{key}}` templates. |
| `output` | `template` (max 5000) | Produces final skill output. Template supports `{{key}}` syntax. |

### Context Resolution Chain

When `{{key}}` is resolved:
1. Check current skill's context entries
2. Walk parent contexts (for nested `invoke_skill` calls)
3. Return empty string if not found

```typescript
interface SkillContext {
  entries: Record<string, string | string[]>;
  parentContext?: SkillContext;
}
```
