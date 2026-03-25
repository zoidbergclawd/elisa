/** Post-build iterative chat service. Lets kids fix bugs and add features via conversation. */

import fs from 'node:fs';
import path from 'node:path';
import { AgentRunner } from './agentRunner.js';
import { TestRunner, type TestRunResult } from './testRunner.js';
import { ContextManager } from '../utils/contextManager.js';
import { buildIterativeChatPrompt } from '../prompts/iterativeChatAgent.js';
import { ITERATIVE_CHAT_MAX_TURNS } from '../utils/constants.js';
import type { SendEvent } from './phases/types.js';
import type { NuggetSpec } from '../utils/specValidator.js';

export interface ChatTurn {
  role: 'kid' | 'agent';
  content: string;
  timestamp: number;
  filesChanged?: string[];
}

export interface IterativeChatSession {
  sessionId: string;
  turns: ChatTurn[];
  isProcessing: boolean;
  totalTokens: number;
}

export class IterativeChatService {
  private agentRunner = new AgentRunner();
  private testRunner = new TestRunner();

  createSession(sessionId: string): IterativeChatSession {
    return {
      sessionId,
      turns: [],
      isProcessing: false,
      totalTokens: 0,
    };
  }

  getSession(sessionId: string, chatSession: IterativeChatSession | undefined): IterativeChatSession | undefined {
    return chatSession;
  }

  async processMessage(
    sessionId: string,
    message: string,
    send: SendEvent,
    nuggetDir: string,
    spec: NuggetSpec | null,
    chatSession: IterativeChatSession,
  ): Promise<void> {
    if (chatSession.isProcessing) {
      throw new Error('Chat is already processing a message');
    }

    chatSession.isProcessing = true;

    try {
      await send({ type: 'chat_processing', message: 'Thinking about your request...' });

      // Record kid's turn
      chatSession.turns.push({
        role: 'kid',
        content: message,
        timestamp: Date.now(),
      });

      // Build context
      const fileManifest = ContextManager.buildFileManifest(nuggetDir);
      const structuralDigest = ContextManager.buildStructuralDigest(nuggetDir);
      const conversationHistory = this.formatHistory(chatSession.turns);

      const systemPrompt = buildIterativeChatPrompt({
        fileManifest,
        structuralDigest,
        conversationHistory,
      });

      // Snapshot files before agent runs
      const filesBefore = this.snapshotFiles(nuggetDir);

      // Run agent
      const taskId = `chat-${Date.now()}`;
      const userPrompt = `<user_message>\n${message}\n</user_message>`;

      const result = await this.agentRunner.execute({
        taskId,
        prompt: userPrompt,
        systemPrompt,
        onOutput: async (_id, content) => {
          await send({ type: 'chat_agent_output', content });
        },
        workingDir: nuggetDir,
        maxTurns: ITERATIVE_CHAT_MAX_TURNS,
      });

      // Track tokens
      chatSession.totalTokens += (result.inputTokens ?? 0) + (result.outputTokens ?? 0);

      // Detect changed files
      const filesAfter = this.snapshotFiles(nuggetDir);
      const filesChanged = this.diffFiles(filesBefore, filesAfter);

      // Record agent turn
      chatSession.turns.push({
        role: 'agent',
        content: result.summary,
        timestamp: Date.now(),
        filesChanged,
      });

      // Emit response
      await send({
        type: 'chat_response',
        content: result.summary,
        filesChanged,
      });

      // Re-run tests if test files exist
      const testsDir = path.join(nuggetDir, 'tests');
      if (fs.existsSync(testsDir)) {
        const testResult = await this.testRunner.runTests(nuggetDir);
        await send({
          type: 'chat_tests_completed',
          passed: testResult.passed,
          failed: testResult.failed,
          total: testResult.total,
        });
      }

      // Emit preview refresh so frontend reloads the preview
      if (filesChanged.length > 0) {
        await send({ type: 'chat_preview_refresh' });
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await send({ type: 'chat_error', message: errorMessage });
    } finally {
      chatSession.isProcessing = false;
    }
  }

  cleanup(chatSession: IterativeChatSession): void {
    chatSession.turns = [];
    chatSession.totalTokens = 0;
    chatSession.isProcessing = false;
  }

  private formatHistory(turns: ChatTurn[]): string {
    if (turns.length === 0) return '';
    // Only include the last 20 turns to keep prompt size manageable
    const recent = turns.slice(-20);
    return recent
      .map((t) => {
        const label = t.role === 'kid' ? 'Kid' : 'You';
        return `${label}: ${t.content}`;
      })
      .join('\n\n');
  }

  private snapshotFiles(dir: string): Map<string, number> {
    const snapshot = new Map<string, number>();
    this.walkFiles(dir, dir, snapshot);
    return snapshot;
  }

  private walkFiles(root: string, dir: string, snapshot: Map<string, number>): void {
    const SKIP = new Set(['.elisa', '.git', '__pycache__', 'node_modules']);
    let items: string[];
    try {
      items = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const item of items) {
      const full = path.join(dir, item);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        if (!SKIP.has(item)) this.walkFiles(root, full, snapshot);
      } else {
        const rel = path.relative(root, full).replace(/\\/g, '/');
        snapshot.set(rel, stat.mtimeMs);
      }
    }
  }

  private diffFiles(before: Map<string, number>, after: Map<string, number>): string[] {
    const changed: string[] = [];
    for (const [file, mtime] of after) {
      const prevMtime = before.get(file);
      if (prevMtime === undefined || mtime !== prevMtime) {
        changed.push(file);
      }
    }
    return changed;
  }
}
