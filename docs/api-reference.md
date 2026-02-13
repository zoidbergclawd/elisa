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
| POST | `/sessions/:id/gate` | `{ approved?: boolean, feedback?: string }` | `{ status: "ok" }` | Respond to a human gate |
| POST | `/sessions/:id/question` | `{ task_id: string, answers: Record<string, any> }` | `{ status: "ok" }` | Answer an agent question |

### Hardware

| Method | Path | Request Body | Response | Description |
|--------|------|--------------|----------|-------------|
| POST | `/hardware/detect` | -- | `{ detected: boolean, port?: string, board_type?: string }` | Detect connected ESP32 |
| POST | `/hardware/flash/:id` | -- | `{ success: boolean, message: string }` | Flash session output to board |

### Workspace

| Method | Path | Request Body | Response | Description |
|--------|------|--------------|----------|-------------|
| POST | `/workspace/save` | `{ workspace_path, workspace_json?, skills?, rules?, portals? }` | `{ status: "saved" }` | Save design files to directory |
| POST | `/workspace/load` | `{ workspace_path }` | `{ workspace, skills, rules, portals }` | Load design files from directory |

### Other

| Method | Path | Response | Description |
|--------|------|----------|-------------|
| GET | `/health` | `{ status: "ok" }` | Health check |
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
| `plan_ready` | `{ tasks: Task[], agents: Agent[], explanation: string }` | Task DAG ready for execution |
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
| `agent_status` | `{ agent: Agent }` | Agent status changed (idle/working/done/error) |
| `agent_message` | `{ from, to, content }` | Inter-agent communication |
| `token_usage` | `{ agent_name, input_tokens, output_tokens }` | Token consumption per agent |

### Build Artifacts

| Event | Payload | Description |
|-------|---------|-------------|
| `commit_created` | `{ sha, message, agent_name, task_id, timestamp, files_changed }` | Git commit created |
| `test_result` | `{ test_name, passed: boolean, details }` | Individual test outcome |
| `coverage_update` | `{ percentage, details?: CoverageReport }` | Code coverage report |

### Deployment

| Event | Payload | Description |
|-------|---------|-------------|
| `deploy_started` | `{ target }` | Deploy phase started |
| `deploy_progress` | `{ step, progress: number }` | Deploy progress (0-100) |
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
type AgentStatus = "idle" | "working" | "done" | "error";
type SessionState = "idle" | "planning" | "executing" | "testing" | "deploying" | "reviewing" | "done";
```
