import os from 'node:os';
import path from 'node:path';
import { startHeadlessServer, stopServer } from '../server.js';
import { SessionClient } from '../session.js';
import { listenForEvents } from '../wsListener.js';
import {
  formatNdjsonLine,
  formatHumanReadable,
  collectSummary,
} from '../eventStream.js';

export interface SkillOptions {
  deploy?: string;
  stream?: boolean;
  json?: boolean;
  timeout?: string;
  model?: string;
}

export interface SkillNuggetSpec {
  nugget: { goal: string; description: string; type: string };
  requirements: Array<{ type: string; description: string }>;
  agents: Array<{ name: string; role: string; persona: string }>;
  deployment: { target: string };
  workflow: { review_enabled: boolean; testing_enabled: boolean; human_gates: string[] };
  openclawConfig: { deployPath: string };
}

export function parseSkillInput(
  description: string,
  deployPath?: string,
): SkillNuggetSpec {
  if (!description || description.trim() === '') {
    throw new Error('Provide a skill description. Run: elisa skill "describe what the skill does"');
  }

  const resolvedDeploy = deployPath ?? path.join(os.homedir(), '.openclaw', 'skills');

  return {
    nugget: {
      goal: `Generate OpenClaw skill: ${description}`,
      description: `Generate a SKILL.md file for an OpenClaw skill that: ${description}`,
      type: 'openclaw-skill',
    },
    requirements: [
      { type: 'feature', description: `Skill: ${description}` },
    ],
    agents: [
      { name: 'SkillForge', role: 'builder', persona: 'An expert OpenClaw skill author' },
    ],
    deployment: { target: 'openclaw-skill' },
    workflow: { review_enabled: false, testing_enabled: true, human_gates: [] },
    openclawConfig: { deployPath: resolvedDeploy },
  };
}

export async function runSkill(
  description: string,
  options: SkillOptions,
): Promise<void> {
  const spec = parseSkillInput(description, options.deploy);

  if (options.model) {
    process.env.CLAUDE_MODEL = options.model;
  }

  const { server, authToken, port } = await startHeadlessServer();

  try {
    const client = new SessionClient(port, authToken);
    const sessionId = await client.create();

    await client.start(sessionId, spec);

    const summary = collectSummary();
    const wsUrl = `ws://127.0.0.1:${port}/ws/session/${sessionId}?token=${authToken}`;

    const timeoutMs = (parseInt(options.timeout ?? '300', 10)) * 1000;
    const timeoutHandle = setTimeout(async () => {
      process.stderr.write('Skill generation timed out. Stopping...\n');
      await client.stop(sessionId).catch(() => {});
    }, timeoutMs);

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

    if (options.json) {
      process.stdout.write(JSON.stringify(summary.getSummary(), null, 2) + '\n');
    }

    const result = summary.getSummary();
    if (result.tasksFailed > 0 || result.testsFailed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await stopServer(server);
  }
}
