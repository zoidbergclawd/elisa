# OpenClaw Bridge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an `elisa` CLI that exposes the backend as a headless build tool, then build the OpenClaw integration module (portal adapter, block categories, skill forge, zero-to-running setup, composable nuggets).

**Architecture:** The CLI starts Elisa's Express backend in-process on an ephemeral port (same pattern as Electron), creates a session via REST, submits a NuggetSpec, and streams WebSocket events to stdout as NDJSON. The OpenClaw module is optional — a set of block definitions, a portal adapter, and CLI commands that activate only when the module is enabled.

**Tech Stack:** TypeScript 5.9, Node.js (ES modules), Express 5, ws 8, Vitest, Zod 4, commander (CLI arg parsing)

**Design doc:** `docs/plans/2026-02-24-openclaw-bridge-design.md`

---

## Phase 1: Elisa CLI (Foundation)

Everything else depends on this. The CLI makes Elisa scriptable and headless.

### Task 1: CLI Entry Point and Argument Parsing

**Files:**
- Create: `cli/src/cli.ts`
- Create: `cli/src/commands/build.ts`
- Create: `cli/package.json`
- Create: `cli/tsconfig.json`
- Test: `cli/src/__tests__/cli.test.ts`

**Step 1: Create CLI package structure**

`cli/package.json`:
```json
{
  "name": "@elisa/cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "elisa": "dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run"
  },
  "dependencies": {
    "commander": "^13.0.0",
    "ws": "^8.18.2"
  },
  "devDependencies": {
    "typescript": "~5.9",
    "vitest": "^4.0.18",
    "@types/ws": "^8.18.1",
    "@types/node": "^22.15.0"
  }
}
```

`cli/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src"]
}
```

**Step 2: Write the failing test**

`cli/src/__tests__/cli.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { createProgram } from '../cli.js';

describe('CLI program', () => {
  it('creates a commander program with name "elisa"', () => {
    const program = createProgram();
    expect(program.name()).toBe('elisa');
  });

  it('has a "build" command', () => {
    const program = createProgram();
    const buildCmd = program.commands.find((c) => c.name() === 'build');
    expect(buildCmd).toBeDefined();
  });

  it('has a "status" command', () => {
    const program = createProgram();
    const statusCmd = program.commands.find((c) => c.name() === 'status');
    expect(statusCmd).toBeDefined();
  });

  it('has a "stop" command', () => {
    const program = createProgram();
    const stopCmd = program.commands.find((c) => c.name() === 'stop');
    expect(stopCmd).toBeDefined();
  });
});
```

**Step 3: Run test to verify it fails**

Run: `cd cli && npx vitest run src/__tests__/cli.test.ts`
Expected: FAIL — module `../cli.js` not found

**Step 4: Write minimal implementation**

`cli/src/cli.ts`:
```typescript
#!/usr/bin/env node

import { Command } from 'commander';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('elisa')
    .description('Elisa IDE — AI-powered project builder')
    .version('0.1.0');

  program
    .command('build [description]')
    .description('Build a project from a description or NuggetSpec')
    .option('--spec <path>', 'Path to NuggetSpec JSON file')
    .option('--output <dir>', 'Workspace output directory')
    .option('--workspace <dir>', 'Reuse existing workspace (iterative builds)')
    .option('--stream', 'Stream events to stdout as NDJSON')
    .option('--json', 'Output final result as JSON')
    .option('--timeout <seconds>', 'Max build time in seconds', '600')
    .option('--model <model>', 'Override agent model')
    .action(async (description, options) => {
      const { runBuild } = await import('./commands/build.js');
      await runBuild(description, options);
    });

  program
    .command('status <sessionId>')
    .description('Check build progress')
    .action(async (sessionId) => {
      // Placeholder — implemented in Task 5
      console.error('Not yet implemented');
      process.exit(1);
    });

  program
    .command('stop <sessionId>')
    .description('Cancel a running build')
    .action(async (sessionId) => {
      // Placeholder — implemented in Task 5
      console.error('Not yet implemented');
      process.exit(1);
    });

  return program;
}

// Direct execution
const isDirectRun = process.argv[1]?.endsWith('cli.js') || process.argv[1]?.endsWith('cli.ts');
if (isDirectRun) {
  createProgram().parse();
}
```

`cli/src/commands/build.ts` (stub):
```typescript
export interface BuildOptions {
  spec?: string;
  output?: string;
  workspace?: string;
  stream?: boolean;
  json?: boolean;
  timeout?: string;
  model?: string;
}

export async function runBuild(
  description: string | undefined,
  options: BuildOptions,
): Promise<void> {
  console.error('Build command not yet implemented');
  process.exit(1);
}
```

**Step 5: Run test to verify it passes**

Run: `cd cli && npx vitest run src/__tests__/cli.test.ts`
Expected: PASS (4 tests)

**Step 6: Commit**

```bash
git add cli/
git commit -m "feat(cli): add CLI entry point with commander arg parsing"
```

---

### Task 2: Headless Server Startup

**Files:**
- Create: `cli/src/server.ts`
- Test: `cli/src/__tests__/server.test.ts`

**Context:** The CLI needs to start the Elisa backend in-process, same way Electron does. It calls `startServer()` from `backend/src/server.ts` and gets back an HTTP server + auth token.

**Step 1: Write the failing test**

`cli/src/__tests__/server.test.ts`:
```typescript
import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { startHeadlessServer, stopServer } from '../server.js';

let serverInfo: { server: http.Server; authToken: string; port: number } | null = null;

afterEach(async () => {
  if (serverInfo) {
    await stopServer(serverInfo.server);
    serverInfo = null;
  }
});

describe('startHeadlessServer', () => {
  it('starts a server on an ephemeral port and returns auth token', async () => {
    serverInfo = await startHeadlessServer();
    expect(serverInfo.port).toBeGreaterThan(0);
    expect(serverInfo.authToken).toBeTruthy();
    expect(serverInfo.server.listening).toBe(true);
  });

  it('responds to /api/health', async () => {
    serverInfo = await startHeadlessServer();
    const res = await fetch(`http://127.0.0.1:${serverInfo.port}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('status');
  });
});

describe('stopServer', () => {
  it('closes the server', async () => {
    serverInfo = await startHeadlessServer();
    const srv = serverInfo.server;
    await stopServer(srv);
    expect(srv.listening).toBe(false);
    serverInfo = null; // prevent afterEach double-close
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd cli && npx vitest run src/__tests__/server.test.ts`
Expected: FAIL — module `../server.js` not found

**Step 3: Write minimal implementation**

`cli/src/server.ts`:
```typescript
import http from 'node:http';

export interface ServerInfo {
  server: http.Server;
  authToken: string;
  port: number;
}

export async function startHeadlessServer(): Promise<ServerInfo> {
  // Import the backend's startServer dynamically.
  // The CLI is a sibling to the backend dir, so resolve relative to repo root.
  const { startServer } = await import('../../backend/src/server.js');
  const { findFreePort } = await import('../../backend/src/utils/findFreePort.js');

  const port = await findFreePort(9100); // Start above default 8000 to avoid conflicts
  const { server, authToken } = await startServer(port);

  return { server, authToken, port };
}

export async function stopServer(server: http.Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
```

**Step 4: Run test to verify it passes**

Run: `cd cli && npx vitest run src/__tests__/server.test.ts`
Expected: PASS (3 tests)

Note: Requires `ANTHROPIC_API_KEY` in env (backend checks on startup). If missing, the health check may report `apiKey: false` but server still starts.

**Step 5: Commit**

```bash
git add cli/src/server.ts cli/src/__tests__/server.test.ts
git commit -m "feat(cli): add headless server startup via backend startServer()"
```

---

### Task 3: Session Client (Create, Start, Stop)

**Files:**
- Create: `cli/src/session.ts`
- Test: `cli/src/__tests__/session.test.ts`

**Context:** Wraps the REST API calls to create a session, start a build with a NuggetSpec, query status, and stop a build.

**Step 1: Write the failing test**

`cli/src/__tests__/session.test.ts`:
```typescript
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import http from 'node:http';
import { startHeadlessServer, stopServer } from '../server.js';
import { SessionClient } from '../session.js';

let server: http.Server;
let port: number;
let token: string;

beforeEach(async () => {
  const info = await startHeadlessServer();
  server = info.server;
  port = info.port;
  token = info.authToken;
});

afterEach(async () => {
  await stopServer(server);
});

describe('SessionClient', () => {
  it('creates a session and returns a session ID', async () => {
    const client = new SessionClient(port, token);
    const sessionId = await client.create();
    expect(sessionId).toBeTruthy();
    expect(typeof sessionId).toBe('string');
  });

  it('starts a session with a minimal NuggetSpec', async () => {
    const client = new SessionClient(port, token);
    const sessionId = await client.create();
    const result = await client.start(sessionId, {
      nugget: { goal: 'test', description: 'test', type: 'web' },
      requirements: [],
      agents: [],
      deployment: { target: 'web' },
      workflow: { review_enabled: false, testing_enabled: false, human_gates: [] },
    });
    expect(result.status).toBe('started');
  });

  it('stops a session', async () => {
    const client = new SessionClient(port, token);
    const sessionId = await client.create();
    // Start it first (will fail orchestrator since no real API key, but that's OK)
    await client.start(sessionId, {
      nugget: { goal: 'test', description: 'test', type: 'web' },
      requirements: [],
      agents: [],
      deployment: { target: 'web' },
      workflow: { review_enabled: false, testing_enabled: false, human_gates: [] },
    });
    const result = await client.stop(sessionId);
    expect(result.status).toBe('stopped');
  });

  it('gets session status', async () => {
    const client = new SessionClient(port, token);
    const sessionId = await client.create();
    const session = await client.getStatus(sessionId);
    expect(session).toHaveProperty('id', sessionId);
    expect(session).toHaveProperty('state');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd cli && npx vitest run src/__tests__/session.test.ts`
Expected: FAIL — module `../session.js` not found

**Step 3: Write minimal implementation**

`cli/src/session.ts`:
```typescript
export class SessionClient {
  private baseUrl: string;
  private token: string;

  constructor(port: number, token: string) {
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.token = token;
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    };
  }

  async create(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/sessions`, {
      method: 'POST',
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Create session failed: ${res.status}`);
    const body = await res.json() as { session_id: string };
    return body.session_id;
  }

  async start(
    sessionId: string,
    spec: Record<string, unknown>,
    workspacePath?: string,
  ): Promise<{ status: string }> {
    const res = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/start`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ spec, workspace_path: workspacePath }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Start session failed: ${res.status} ${JSON.stringify(body)}`);
    }
    return res.json() as Promise<{ status: string }>;
  }

  async stop(sessionId: string): Promise<{ status: string }> {
    const res = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/stop`, {
      method: 'POST',
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Stop session failed: ${res.status}`);
    return res.json() as Promise<{ status: string }>;
  }

  async getStatus(sessionId: string): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.baseUrl}/api/sessions/${sessionId}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Get status failed: ${res.status}`);
    return res.json() as Promise<Record<string, unknown>>;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd cli && npx vitest run src/__tests__/session.test.ts`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add cli/src/session.ts cli/src/__tests__/session.test.ts
git commit -m "feat(cli): add SessionClient for REST API interaction"
```

---

### Task 4: NDJSON Event Streamer

**Files:**
- Create: `cli/src/eventStream.ts`
- Test: `cli/src/__tests__/eventStream.test.ts`

**Context:** Connects to the WebSocket endpoint and converts events to NDJSON lines on stdout, or collects them for JSON summary output.

**Step 1: Write the failing test**

`cli/src/__tests__/eventStream.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { formatNdjsonLine, formatHumanReadable, collectSummary } from '../eventStream.js';

describe('formatNdjsonLine', () => {
  it('serializes an event as a single JSON line with newline', () => {
    const event = { type: 'task_started', task_id: '1', task_name: 'Setup' };
    const line = formatNdjsonLine(event);
    expect(line).toBe('{"type":"task_started","task_id":"1","task_name":"Setup"}\n');
  });

  it('handles events with nested objects', () => {
    const event = { type: 'test_result', data: { passed: 3, failed: 0 } };
    const line = formatNdjsonLine(event);
    const parsed = JSON.parse(line.trim());
    expect(parsed.data.passed).toBe(3);
  });
});

describe('formatHumanReadable', () => {
  it('formats planning_started', () => {
    const msg = formatHumanReadable({ type: 'planning_started' });
    expect(msg).toContain('Planning');
  });

  it('formats task_started with task name', () => {
    const msg = formatHumanReadable({ type: 'task_started', task_name: 'Build API' });
    expect(msg).toContain('Build API');
  });

  it('formats task_completed', () => {
    const msg = formatHumanReadable({ type: 'task_completed', task_id: '1' });
    expect(msg).toContain('completed');
  });

  it('formats session_complete with summary', () => {
    const msg = formatHumanReadable({ type: 'session_complete', summary: 'Built 3 files' });
    expect(msg).toContain('Built 3 files');
  });

  it('formats error events', () => {
    const msg = formatHumanReadable({ type: 'error', message: 'Something broke' });
    expect(msg).toContain('Something broke');
  });

  it('returns a generic message for unknown event types', () => {
    const msg = formatHumanReadable({ type: 'unknown_event_xyz' });
    expect(msg).toBeTruthy();
  });
});

describe('collectSummary', () => {
  it('accumulates events and returns a summary object', () => {
    const collector = collectSummary();
    collector.push({ type: 'planning_started' });
    collector.push({ type: 'task_started', task_id: '1', task_name: 'Setup' });
    collector.push({ type: 'task_completed', task_id: '1' });
    collector.push({ type: 'test_result', passed: 3, failed: 0 });
    collector.push({ type: 'session_complete', summary: 'Done' });

    const summary = collector.getSummary();
    expect(summary.tasksCompleted).toBe(1);
    expect(summary.testsPassed).toBe(3);
    expect(summary.testsFailed).toBe(0);
    expect(summary.summary).toBe('Done');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd cli && npx vitest run src/__tests__/eventStream.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

`cli/src/eventStream.ts`:
```typescript
export function formatNdjsonLine(event: Record<string, unknown>): string {
  return JSON.stringify(event) + '\n';
}

export function formatHumanReadable(event: Record<string, unknown>): string {
  const type = event.type as string;

  switch (type) {
    case 'planning_started':
      return 'Planning your project...';
    case 'plan_ready':
      return `Plan ready — ${event.taskCount ?? '?'} tasks identified`;
    case 'task_started':
      return `Starting: ${event.task_name ?? event.task_id}`;
    case 'task_completed':
      return `Completed: ${event.task_name ?? event.task_id}`;
    case 'task_failed':
      return `Failed: ${event.task_name ?? event.task_id} — ${event.error ?? ''}`;
    case 'agent_output':
      return `[${event.task_id}] ${event.message ?? event.content ?? ''}`;
    case 'commit_created':
      return `Committed: ${event.short_sha} ${event.message}`;
    case 'token_usage':
      return `Tokens: ${event.input_tokens}in/${event.output_tokens}out ($${event.cost_usd})`;
    case 'test_result':
      return `Tests: ${event.passed} passed, ${event.failed} failed`;
    case 'deploy_started':
      return `Deploying (${event.target})...`;
    case 'deploy_complete':
      return `Deployed${event.url ? ` at ${event.url}` : ''}`;
    case 'error':
      return `Error: ${event.message}`;
    case 'session_complete':
      return `Complete: ${event.summary}`;
    default:
      return `[${type}] ${JSON.stringify(event)}`;
  }
}

export interface BuildSummary {
  tasksCompleted: number;
  tasksFailed: number;
  testsPassed: number;
  testsFailed: number;
  summary: string;
  events: Record<string, unknown>[];
}

export function collectSummary() {
  const events: Record<string, unknown>[] = [];
  let tasksCompleted = 0;
  let tasksFailed = 0;
  let testsPassed = 0;
  let testsFailed = 0;
  let summary = '';

  return {
    push(event: Record<string, unknown>) {
      events.push(event);
      const type = event.type as string;
      if (type === 'task_completed') tasksCompleted++;
      if (type === 'task_failed') tasksFailed++;
      if (type === 'test_result') {
        testsPassed += (event.passed as number) ?? 0;
        testsFailed += (event.failed as number) ?? 0;
      }
      if (type === 'session_complete') {
        summary = (event.summary as string) ?? '';
      }
    },
    getSummary(): BuildSummary {
      return { tasksCompleted, tasksFailed, testsPassed, testsFailed, summary, events };
    },
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd cli && npx vitest run src/__tests__/eventStream.test.ts`
Expected: PASS (8 tests)

**Step 5: Commit**

```bash
git add cli/src/eventStream.ts cli/src/__tests__/eventStream.test.ts
git commit -m "feat(cli): add NDJSON formatter, human-readable formatter, and summary collector"
```

---

### Task 5: WebSocket Listener

**Files:**
- Create: `cli/src/wsListener.ts`
- Test: `cli/src/__tests__/wsListener.test.ts`

**Context:** Opens a WebSocket connection to the backend, parses incoming events, and calls a handler for each one. Resolves when the session ends (`session_complete` or `error` with `recoverable: false`).

**Step 1: Write the failing test**

`cli/src/__tests__/wsListener.test.ts`:
```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { WebSocketServer } from 'ws';
import { listenForEvents } from '../wsListener.js';

let wss: WebSocketServer | null = null;

afterEach(() => {
  if (wss) {
    wss.close();
    wss = null;
  }
});

function startMockWs(port: number, events: Record<string, unknown>[]): WebSocketServer {
  wss = new WebSocketServer({ port });
  wss.on('connection', (ws) => {
    for (const event of events) {
      ws.send(JSON.stringify(event));
    }
  });
  return wss;
}

describe('listenForEvents', () => {
  it('receives events and calls handler for each', async () => {
    const port = 19876;
    startMockWs(port, [
      { type: 'planning_started' },
      { type: 'task_started', task_id: '1' },
      { type: 'session_complete', summary: 'Done' },
    ]);

    const handler = vi.fn();
    await listenForEvents(`ws://127.0.0.1:${port}`, handler);

    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'planning_started' }));
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'session_complete' }));
  });

  it('resolves when session_complete is received', async () => {
    const port = 19877;
    startMockWs(port, [{ type: 'session_complete', summary: 'Done' }]);

    const handler = vi.fn();
    await listenForEvents(`ws://127.0.0.1:${port}`, handler);
    // If we reach here, the promise resolved correctly
    expect(true).toBe(true);
  });

  it('resolves when fatal error is received', async () => {
    const port = 19878;
    startMockWs(port, [{ type: 'error', message: 'Fatal', recoverable: false }]);

    const handler = vi.fn();
    await listenForEvents(`ws://127.0.0.1:${port}`, handler);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd cli && npx vitest run src/__tests__/wsListener.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

`cli/src/wsListener.ts`:
```typescript
import WebSocket from 'ws';

export function listenForEvents(
  url: string,
  onEvent: (event: Record<string, unknown>) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);

    ws.on('open', () => {
      // Connection established
    });

    ws.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString()) as Record<string, unknown>;
        onEvent(event);

        const type = event.type as string;
        if (type === 'session_complete') {
          ws.close();
          resolve();
        }
        if (type === 'error' && event.recoverable === false) {
          ws.close();
          resolve();
        }
      } catch {
        // Ignore non-JSON messages
      }
    });

    ws.on('close', () => {
      resolve(); // Resolve on close in case server closes first
    });

    ws.on('error', (err) => {
      reject(err);
    });
  });
}
```

**Step 4: Run test to verify it passes**

Run: `cd cli && npx vitest run src/__tests__/wsListener.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add cli/src/wsListener.ts cli/src/__tests__/wsListener.test.ts
git commit -m "feat(cli): add WebSocket event listener with session completion detection"
```

---

### Task 6: Build Command (Full Pipeline)

**Files:**
- Modify: `cli/src/commands/build.ts`
- Test: `cli/src/__tests__/build.test.ts`

**Context:** Wire everything together: start headless server, create session, start build, listen for events, output NDJSON or human-readable, and produce a JSON summary.

**Step 1: Write the failing test**

`cli/src/__tests__/build.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { parseBuildInput } from '../commands/build.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('parseBuildInput', () => {
  it('reads a NuggetSpec from a --spec file', () => {
    const tmpFile = path.join(os.tmpdir(), 'test-spec.json');
    const spec = {
      nugget: { goal: 'test', description: 'test', type: 'web' },
      requirements: [],
      agents: [],
      deployment: { target: 'web' },
      workflow: { review_enabled: false, testing_enabled: false, human_gates: [] },
    };
    fs.writeFileSync(tmpFile, JSON.stringify(spec));

    const result = parseBuildInput(undefined, tmpFile);
    expect(result.nugget.goal).toBe('test');

    fs.unlinkSync(tmpFile);
  });

  it('throws if neither description nor spec is provided', () => {
    expect(() => parseBuildInput(undefined, undefined)).toThrow();
  });

  it('returns a NuggetSpec shell from a description string', () => {
    const result = parseBuildInput('Build a REST API for bookmarks', undefined);
    expect(result.nugget.goal).toBe('Build a REST API for bookmarks');
    expect(result.nugget.description).toBe('Build a REST API for bookmarks');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd cli && npx vitest run src/__tests__/build.test.ts`
Expected: FAIL — `parseBuildInput` not exported

**Step 3: Write implementation**

`cli/src/commands/build.ts`:
```typescript
import fs from 'node:fs';
import { startHeadlessServer, stopServer } from '../server.js';
import { SessionClient } from '../session.js';
import { listenForEvents } from '../wsListener.js';
import {
  formatNdjsonLine,
  formatHumanReadable,
  collectSummary,
} from '../eventStream.js';

export interface BuildOptions {
  spec?: string;
  output?: string;
  workspace?: string;
  stream?: boolean;
  json?: boolean;
  timeout?: string;
  model?: string;
}

export function parseBuildInput(
  description: string | undefined,
  specPath: string | undefined,
): Record<string, unknown> {
  if (specPath) {
    const raw = fs.readFileSync(specPath, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  }

  if (description) {
    return {
      nugget: { goal: description, description, type: 'web' },
      requirements: [{ type: 'feature', description }],
      agents: [{ name: 'Builder', role: 'builder', persona: 'A skilled software engineer' }],
      deployment: { target: 'web' },
      workflow: { review_enabled: false, testing_enabled: true, human_gates: [] },
    };
  }

  throw new Error('Provide a description or --spec <path>. Run: elisa build "description" or elisa build --spec nugget.json');
}

export async function runBuild(
  description: string | undefined,
  options: BuildOptions,
): Promise<void> {
  // 1. Parse input
  const spec = parseBuildInput(description, options.spec);

  // Override model if specified
  if (options.model) {
    process.env.CLAUDE_MODEL = options.model;
  }

  // 2. Start headless server
  const { server, authToken, port } = await startHeadlessServer();

  try {
    // 3. Create session
    const client = new SessionClient(port, authToken);
    const sessionId = await client.create();

    // 4. Determine workspace path
    const workspacePath = options.output ?? options.workspace;

    // 5. Start build
    await client.start(sessionId, spec, workspacePath);

    // 6. Set up event handling
    const summary = collectSummary();
    const wsUrl = `ws://127.0.0.1:${port}/ws/session/${sessionId}?token=${authToken}`;

    // 7. Set up timeout
    const timeoutMs = (parseInt(options.timeout ?? '600', 10)) * 1000;
    const timeoutHandle = setTimeout(async () => {
      process.stderr.write('Build timed out. Stopping...\n');
      await client.stop(sessionId).catch(() => {});
    }, timeoutMs);

    // 8. Listen for events
    await listenForEvents(wsUrl, (event) => {
      summary.push(event);

      if (options.stream) {
        process.stdout.write(formatNdjsonLine(event));
      } else if (!options.json) {
        const msg = formatHumanReadable(event);
        if (msg) process.stderr.write(msg + '\n');
      }
    });

    clearTimeout(timeoutHandle);

    // 9. Output JSON summary if requested
    if (options.json) {
      process.stdout.write(JSON.stringify(summary.getSummary(), null, 2) + '\n');
    }

    // 10. Exit with appropriate code
    const result = summary.getSummary();
    if (result.tasksFailed > 0 || result.testsFailed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await stopServer(server);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd cli && npx vitest run src/__tests__/build.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add cli/src/commands/build.ts cli/src/__tests__/build.test.ts
git commit -m "feat(cli): implement build command with full server-session-event pipeline"
```

---

### Task 7: npm Package Configuration and Build Scripts

**Files:**
- Modify: `package.json` (root)
- Modify: `cli/package.json`
- Modify: `scripts/install-deps.mjs` (add cli to install chain)

**Step 1: Update root package.json**

Add to `scripts`:
```json
"build:cli": "cd cli && npm run build",
"test:cli": "cd cli && npx vitest run"
```

Add `bin` entry:
```json
"bin": {
  "elisa": "cli/dist/cli.js"
}
```

**Step 2: Update scripts/install-deps.mjs**

Add `cli` to the list of subdirectories that get `npm install` during `postinstall`.

**Step 3: Run all CLI tests**

Run: `cd cli && npx vitest run`
Expected: All tests PASS

**Step 4: Build the CLI**

Run: `cd cli && npm run build`
Expected: TypeScript compiles to `cli/dist/` without errors

**Step 5: Test the CLI binary**

Run: `node cli/dist/cli.js --help`
Expected: Shows help with `build`, `status`, `stop` commands

**Step 6: Commit**

```bash
git add package.json cli/package.json scripts/install-deps.mjs
git commit -m "feat(cli): wire CLI into root build and install pipeline"
```

---

### Task 8: Update Architecture Docs

**Files:**
- Modify: `ARCHITECTURE.md`
- Modify: `docs/INDEX.md`
- Modify: `.claude/CLAUDE.md`

**Step 1: Add CLI to ARCHITECTURE.md**

Add `cli/` to the monorepo layout diagram and describe the CLI in a new section.

**Step 2: Add CLI to docs/INDEX.md**

Add `cli/` directory to the directory map and key source files table.

**Step 3: Update CLAUDE.md**

Add `elisa build` and `elisa skill` to the Setup and Launch section. Note the CLI as a new module.

**Step 4: Commit**

```bash
git add ARCHITECTURE.md docs/INDEX.md .claude/CLAUDE.md
git commit -m "docs: add CLI module to architecture documentation"
```

---

## Phase 2: OpenClaw Portal Adapter (Summary)

> Detailed TDD plan to be written when Phase 1 is complete.

**Tasks:**
1. Add `openclaw` to `ALLOWED_COMMANDS` in `portalService.ts` — update allowlist + test
2. Create `OpenClawPortalAdapter` class — implements `PortalAdapter`, shells out to `openclaw chat`
3. Add `openclawConfig` to NuggetSpec Zod schema — new optional field on portal specs
4. Register adapter in `PortalService.initializePortals()` for `mechanism: 'openclaw'`
5. Update builder agent prompt to include delegation awareness
6. Add OpenClaw section to Portals modal in frontend
7. Integration test: mock `openclaw` binary, verify delegation round-trip

---

## Phase 3: OpenClaw Block Categories + Skill Forge (Summary)

> Detailed TDD plan to be written when Phase 1 is complete.

**Tasks:**
1. Create OpenClaw block definitions in `frontend/src/components/BlockCanvas/openclawBlocks.ts`
2. Create OpenClaw block interpreter in `frontend/src/components/BlockCanvas/openclawInterpreter.ts`
3. Register blocks conditionally (optional module — only when OpenClaw detected or enabled)
4. Add toolbox category for OpenClaw blocks
5. Create `cli/src/commands/skill.ts` — the `elisa skill` command
6. Create skill generator prompt in `backend/src/prompts/skillForgeAgent.ts`
7. Create SKILL.md validator in `backend/src/utils/openclawSkillValidator.ts`
8. Add skill deployment (write to `~/.openclaw/skills/`)
9. Tests for all block compilation targets
10. Tests for skill generation and validation

---

## Phase 4: Zero-to-Running Setup (Summary)

> Detailed TDD plan to be written when Phase 3 is complete.

**Tasks:**
1. Create `cli/src/commands/openclawSetup.ts` — the `elisa openclaw setup` command
2. Create `Set Up OpenClaw` master block definition
3. Implement install detection (`openclaw --version`)
4. Implement scripted installation (platform-detected)
5. Implement gateway configuration via `openclaw config patch`
6. Implement channel connection with human gates for interactive steps
7. Implement security preset application
8. Implement validation via `openclaw doctor`
9. Integration test: mock `openclaw` CLI, verify full setup flow

---

## Phase 5: Composable Nuggets (Summary)

> Detailed TDD plan to be written independently (no Phase dependency other than Phase 1).

**Tasks:**
1. Define nugget-as-block format (how a nugget embeds as a composable block)
2. Extend meta-planner to expand nested nuggets in NuggetSpec
3. Create nugget registry index format (JSON index file)
4. Implement `elisa publish` CLI command
5. Implement nugget search in meta-planner (check registry before planning from scratch)
6. Tests for nugget expansion and composition

---

## Phase 6: ClawHub Companion Skills (Summary)

> Detailed TDD plan to be written when Phases 1 and 3 are complete.

**Tasks:**
1. Generate `elisa-build` SKILL.md using Elisa's own skill forge
2. Generate `elisa-skill-forge` SKILL.md using Elisa's own skill forge
3. Validate both skills against OpenClaw frontmatter requirements
4. Create getting-started documentation
5. Test: validate generated SKILL.md files parse correctly

---

## Dependency Graph

```
Phase 1 (CLI Foundation) ← YOU ARE HERE
  ├─► Phase 2 (Portal Adapter) — can start after Task 7
  ├─► Phase 3 (Blocks + Skill Forge) — can start after Task 7
  │     └─► Phase 4 (Zero-to-Running) — needs Phase 3
  │     └─► Phase 6 (ClawHub Skills) — needs Phases 1 + 3
  └─► Phase 5 (Composable Nuggets) — can start after Task 7
```
