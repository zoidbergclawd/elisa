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
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch (e) {
      throw new Error(`Failed to parse spec file "${specPath}": ${(e as Error).message}`);
    }
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
    const timeoutSec = parseInt(options.timeout ?? '600', 10);
    if (Number.isNaN(timeoutSec) || timeoutSec <= 0) {
      throw new Error(`Invalid --timeout value: "${options.timeout}". Must be a positive integer (seconds).`);
    }
    const timeoutMs = timeoutSec * 1000;
    const timeoutHandle = setTimeout(async () => {
      process.stderr.write('Build timed out. Stopping...\n');
      await client.stop(sessionId).catch(() => {});
    }, timeoutMs);

    try {
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
      clearTimeout(timeoutHandle);
    }
  } finally {
    await stopServer(server);
  }
}
