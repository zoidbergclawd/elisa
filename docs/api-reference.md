# API Reference

## REST Endpoints

Base URL: `http://localhost:8000/api`

### Sessions

| Method | Path | Request Body | Response | Description |
|--------|------|--------------|----------|-------------|
| POST | `/sessions` | -- | `{ session_id: string }` | Create a new build session |
| GET | `/sessions/:id` | -- | `BuildSession` | Get full session state |
| POST | `/sessions/:id/start` | `{ spec: NuggetSpec, workspace_path?: string, workspace_json?: object }` | `{ status: "started" }` | Start build with a NuggetSpec |
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

### Devices

| Method | Path | Response | Description |
|--------|------|----------|-------------|
| GET | `/devices` | `DeviceManifest[]` | List device plugin manifests (block definitions, deploy config) |

### Meetings

Base URL: `http://localhost:8000/api/sessions/:sessionId/meetings`

| Method | Path | Request Body | Response | Description |
|--------|------|--------------|----------|-------------|
| GET | `/sessions/:id/meetings` | -- | `MeetingSession[]` | List all meetings for a session |
| GET | `/sessions/:id/meetings/:mid` | -- | `MeetingSession` | Get meeting details |
| POST | `/sessions/:id/meetings/:mid/accept` | -- | `MeetingSession` | Accept a meeting invite (must be in `invited` state) |
| POST | `/sessions/:id/meetings/:mid/decline` | -- | `MeetingSession` | Decline a meeting invite (must be in `invited` state) |
| POST | `/sessions/:id/meetings/:mid/message` | `{ content: string }` | `MeetingMessage` | Send a message from the kid in an active meeting |
| POST | `/sessions/:id/meetings/:mid/end` | -- | `MeetingSession` | End an active meeting |

### Agent Runtime

Base URL: `http://localhost:8000/v1`

All endpoints except `POST /v1/agents` and `GET /v1/agents/:id/heartbeat` require the `x-api-key` header set to the API key returned during provisioning.

| Method | Path | Request Body | Response | Description |
|--------|------|--------------|----------|-------------|
| POST | `/v1/agents` | `NuggetSpec` | `{ agent_id, api_key, runtime_url, agent_name, greeting }` | Provision a new agent (no auth required) |
| PUT | `/v1/agents/:id` | `NuggetSpec` | `{ status: "updated", agent_id }` | Update agent config |
| DELETE | `/v1/agents/:id` | -- | `{ status: "deleted", agent_id }` | Deprovision agent (cleans up sessions, usage, backpack, study, gaps) |
| POST | `/v1/agents/:id/turn/text` | `{ text: string, session_id?: string }` | `{ response, session_id, input_tokens, output_tokens }` | Send a text conversation turn |
| GET | `/v1/agents/:id/history` | -- | `{ agent_id, sessions: Array<{ session_id, turn_count, created_at }> }` | List conversation sessions for agent |
| GET | `/v1/agents/:id/history?session_id=X&limit=N` | -- | `{ session_id, turns: ConversationTurn[] }` | Get turn history for a specific session |
| GET | `/v1/agents/:id/heartbeat` | -- | `{ status: "online", agent_id, agent_name, session_count, total_input_tokens, total_output_tokens }` | Agent health check (no auth required) |
| GET | `/v1/agents/:id/gaps` | -- | `{ agent_id, gaps: GapEntry[] }` | List detected knowledge gaps |
| POST | `/v1/agents/:id/backpack` | `{ title: string, content: string, source_type?: string, uri?: string }` | `{ source_id, agent_id }` | Add a source to the knowledge backpack |
| GET | `/v1/agents/:id/backpack` | -- | `{ agent_id, sources: BackpackSource[] }` | List all backpack sources |
| DELETE | `/v1/agents/:id/backpack/:sourceId` | -- | `{ status: "removed", source_id }` | Remove a backpack source |
| POST | `/v1/agents/:id/backpack/search` | `{ query: string, limit?: number }` | `{ agent_id, results: SearchResult[] }` | Search the knowledge backpack |
| PUT | `/v1/agents/:id/study` | `{ enabled?: boolean, style?: string, difficulty?: string, quiz_frequency?: number }` | `{ status: "enabled"\|"disabled", agent_id }` | Enable or disable study mode |
| GET | `/v1/agents/:id/study` | -- | `{ agent_id, config: StudyModeConfig, progress: StudyProgress }` | Get study mode config and progress |
| POST | `/v1/agents/:id/study/quiz` | -- | `QuizQuestion` | Generate a quiz question from backpack content |
| POST | `/v1/agents/:id/study/answer` | `{ question_id: string, answer: number }` | `{ correct: boolean, question_id }` | Submit a quiz answer |
| WS | `/v1/agents/:id/stream?api_key=KEY` | -- | Streaming conversation turn | WebSocket endpoint for streaming conversation turns |

### Spec Graph

Base URL: `http://localhost:8000/api/spec-graph`

| Method | Path | Request Body | Response | Description |
|--------|------|--------------|----------|-------------|
| POST | `/api/spec-graph` | `{ workspace_path: string }` | `{ graph_id }` | Create a new spec graph |
| GET | `/api/spec-graph/:id` | -- | `{ graph: SpecGraph }` | Get full graph (nodes + edges) |
| DELETE | `/api/spec-graph/:id` | -- | `{ status: "deleted" }` | Delete a graph |
| POST | `/api/spec-graph/:id/nodes` | `{ spec: NuggetSpec, label: string }` | `{ node_id }` | Add a nugget node to the graph |
| GET | `/api/spec-graph/:id/nodes` | -- | `{ nodes: SpecGraphNode[] }` | List all nodes |
| GET | `/api/spec-graph/:id/nodes/:nid` | -- | `{ node: SpecGraphNode }` | Get a single node |
| DELETE | `/api/spec-graph/:id/nodes/:nid` | -- | `{ status: "removed" }` | Remove a node and its edges |
| POST | `/api/spec-graph/:id/edges` | `{ from_id: string, to_id: string, relationship: EdgeRelationship, description?: string }` | `{ status: "added" }` | Add a directed edge between nodes |
| DELETE | `/api/spec-graph/:id/edges` | `{ from_id: string, to_id: string }` | `{ status: "removed" }` | Remove an edge |
| GET | `/api/spec-graph/:id/neighbors/:nid` | -- | `{ incoming: SpecGraphEdge[], outgoing: SpecGraphEdge[] }` | Get incoming and outgoing neighbors of a node |
| POST | `/api/spec-graph/:id/compose` | `{ node_ids: string[], system_level?: string, session_id?: string }` | `ComposeResult` | Compose selected nodes into a merged NuggetSpec |
| POST | `/api/spec-graph/:id/impact` | `{ node_id: string }` | `ImpactResult` | Detect cross-nugget impact of changing a node |
| GET | `/api/spec-graph/:id/interfaces?node_ids=A,B,C` | -- | `{ contracts: InterfaceContract[] }` | Resolve interface contracts among nodes |

**EdgeRelationship**: `"depends_on"` | `"provides_to"` | `"shares_interface"` | `"composes_into"`

### Other

| Method | Path | Response | Description |
|--------|------|----------|-------------|
| GET | `/health` | `{ status: "ready"\|"degraded", apiKey: "valid"\|"invalid"\|"missing"\|"unchecked", apiKeyError?: string, agentSdk: "available"\|"not_found" }` | Health check |

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
| `deploy_progress` | `{ step, progress: number, device_role? }` | Deploy progress (0-100) |
| `deploy_checklist` | `{ rules: Array<{ name, prompt }> }` | Pre-deploy rules checklist |
| `deploy_complete` | `{ target, url? }` | Deploy finished |
| `flash_prompt` | `{ device_role, message }` | Prompts user to connect device for flashing |
| `flash_progress` | `{ device_role, step, progress: number }` | Per-file flash progress (0-100) |
| `flash_complete` | `{ device_role, success, message? }` | Device flash finished |
| `documentation_ready` | `{ file_path }` | Generated documentation available |
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

### Systems Thinking

| Event | Payload | Description |
|-------|---------|-------------|
| `decomposition_narrated` | `{ goal, subtasks: string[], explanation }` | Narrated breakdown of the goal into subtasks |
| `impact_estimate` | `{ estimated_tasks, complexity: 'simple'\|'moderate'\|'complex', heaviest_requirements: string[], requirement_details: Array<{ description, estimated_task_count, test_linked, weight, dependents }> }` | Pre-execution complexity analysis |
| `boundary_analysis` | `{ inputs: Array<{ name, type, source? }>, outputs: Array<{ name, type, source? }>, boundary_portals: string[] }` | System boundary identification (inputs, outputs, portals) |
| `system_health_update` | `{ tasks_done, tasks_total, tests_passing, tests_total, tokens_used, health_score }` | Periodic health vital signs during execution |
| `system_health_summary` | `{ health_score, grade: 'A'\|'B'\|'C'\|'D'\|'F', breakdown: { tasks_score, tests_score, corrections_score, budget_score } }` | Post-execution health summary with grade |
| `health_history` | `{ entries: Array<{ timestamp, goal, score, grade, breakdown: { tasks, tests, corrections, budget } }> }` | Health-over-time trend data (Architect level) |
| `traceability_update` | `{ requirement_id, test_id, status: 'untested'\|'passing'\|'failing' }` | Individual requirement-test link status change |
| `traceability_summary` | `{ coverage: number, requirements: Array<{ requirement_id, description, test_id?, test_name?, status: 'untested'\|'passing'\|'failing' }> }` | Full requirement traceability coverage report |
| `correction_cycle_started` | `{ task_id, attempt_number, failure_reason, max_attempts }` | Correction cycle begun for a failed task |
| `correction_cycle_progress` | `{ task_id, attempt_number, step: 'diagnosing'\|'fixing'\|'retesting' }` | Progress within a correction cycle |
| `convergence_update` | `{ task_id, attempts_so_far, tests_passing, tests_total, trend: 'improving'\|'stalled'\|'diverging', converged: boolean, attempts: Array<{ attempt_number, status, tests_passing?, tests_total? }> }` | Feedback loop convergence tracking |

### Composition

| Event | Payload | Description |
|-------|---------|-------------|
| `composition_started` | `{ graph_id, node_ids: string[] }` | Nugget composition process started |
| `composition_impact` | `{ graph_id, changed_node_id, affected_nodes: Array<{ node_id, label, reason }>, severity }` | Cross-nugget impact detected from a node change |

### Meetings

| Event | Payload | Description |
|-------|---------|-------------|
| `meeting_invite` | `{ meetingId, meetingTypeId, agentName, title, description }` | Agent proposes a meeting to the user |
| `meeting_started` | `{ meetingId, meetingTypeId, agentName, canvasType }` | Meeting session activated |
| `meeting_message` | `{ meetingId, role: 'agent'\|'kid', content }` | Message in an active meeting |
| `meeting_canvas_update` | `{ meetingId, canvasType, data }` | Canvas state updated during meeting |
| `meeting_outcome` | `{ meetingId, outcomeType, data }` | Single outcome produced during meeting |
| `meeting_ended` | `{ meetingId, outcomes: Array<{ type, data }> }` | Meeting ended with collected outcomes |

### Context Flow

| Event | Payload | Description |
|-------|---------|-------------|
| `context_flow` | `{ from_task_id, to_task_ids: string[], summary_preview }` | Context passed from one task to its dependents |

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
node, npx, python, python3, uvx, docker, deno, bun, bunx, gcloud, firebase
```

Any command not in this list is rejected with an error.

### Execution Model

`CliPortalAdapter.execute()` uses `execFile` (not `spawn` with `shell: true`). This prevents shell injection because `execFile` bypasses the shell entirely -- arguments are passed directly to the executable without shell interpretation.

### Serial Portal Validation

Serial portals are validated via board detection (USB VID:PID matching) before flash operations proceed. This ensures the target device is actually an ESP32 before attempting to write firmware.

---

## NuggetSpec Schema

The JSON structure produced by the block interpreter and sent to `POST /sessions/:id/start`.

```typescript
interface NuggetSpec {
  nugget: {
    goal: string;           // What the user wants to build
    description: string;    // Expanded description
    type: string;           // "game" | "website" | "hardware" | "story" | "tool" | "general"
  };
  requirements?: Array<{
    type: string;           // "feature" | "constraint" | "when_then" | "data" | "timer"
    description: string;
  }>;
  style?: {
    visual: string | null;  // "fun_colorful" | "clean_simple" | "dark_techy" | "nature" | "space"
    personality: string | null;
  };
  agents?: Array<{
    name: string;
    role: string;           // "builder" | "tester" | "reviewer" | "custom"
    persona: string;
    allowed_paths?: string[];
    restricted_paths?: string[];
  }>;
  deployment?: {
    target: string;         // "preview" | "web" | "esp32" | "both"
    auto_flash: boolean;
  };
  workflow?: {
    review_enabled: boolean;
    testing_enabled: boolean;
    human_gates: string[];
    flow_hints?: Array<{ type: "sequential" | "parallel"; descriptions: string[] }>;
    iteration_conditions?: string[];
    behavioral_tests?: Array<{ when: string; then: string }>;
  };
  skills?: Array<{
    id: string;
    name: string;
    prompt: string;
    category: string;       // "agent" | "feature" | "style" | "composite"
  }>;
  rules?: Array<{
    id: string;
    name: string;
    prompt: string;
    trigger: string;        // "always" | "on_task_complete" | "on_test_fail" | "before_deploy"
  }>;
  portals?: Array<{
    id: string;
    name: string;
    description: string;
    mechanism: string;      // "mcp" | "cli" | "serial"
    capabilities?: Array<{ id: string; name: string; kind: string; description: string }>;
    interactions?: Array<{ type: "tell" | "when" | "ask"; capabilityId: string; params?: Record<string, unknown> }>;
    mcpConfig?: { command: string; args?: string[]; env?: Record<string, string> };
    cliConfig?: { command: string; args?: string[] };
  }>;
  devices?: Array<{
    pluginId: string;       // Device plugin ID (e.g., "heltec-sensor-node")
    instanceId: string;     // Unique block instance ID
    fields: Record<string, unknown>;  // User-configured field values from Blockly blocks
  }>;
  permissions?: {
    auto_approve_workspace_writes?: boolean;
    auto_approve_safe_commands?: boolean;
    allow_network?: boolean;
    escalation_threshold?: number;  // 1-10
  };
}
```

### Key Types

```typescript
type TaskStatus = "pending" | "in_progress" | "done" | "failed";
type AgentRole = "builder" | "tester" | "reviewer" | "custom";
type AgentStatus = "idle" | "working" | "done" | "error" | "waiting";
type SessionState = "idle" | "planning" | "executing" | "testing" | "deploying" | "reviewing" | "done";
```

Note: `reviewing` is a transient state during human gate pauses, not a separate pipeline phase.

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
