/** Tests for plan persistence (save/load round-trip). */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PlanningService } from '../services/planningService.js';
import type { PlanState } from '../utils/planSchema.js';
import type { PlanningMessage } from '../models/planning.js';

// Mock the Anthropic client
const mockCreate = vi.fn();
vi.mock('../utils/anthropicClient.js', () => ({
  getAnthropicClient: () => ({
    messages: { create: mockCreate },
  }),
}));

function validTurnOutput() {
  return {
    message: 'What kind of project?',
    question: {
      text: 'Type?',
      type: 'single_select',
      options: [
        { label: 'Web', value: 'web' },
        { label: 'CLI', value: 'cli' },
      ],
    },
    plan_mutation_map: {
      web: { 'deploy.target': 'web' },
      cli: { 'deploy.target': 'cli' },
    },
    plan: {
      idea: 'Test app',
      goal: { description: 'Test', confidence: 'rough' },
      promises: [{ description: 'P1', category: 'behavior', proofs: [{ description: 'Proof' }] }],
      skills: [],
      portals: [],
      deploy: { target: null, constraints: [] },
      open_questions: [],
      ready: false,
      conversation_turn: 0,
    },
    teaching: null,
  };
}

function mockClaudeResponse(output: Record<string, unknown>) {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text: JSON.stringify(output) }],
  });
}

describe('Plan Persistence', () => {
  let service: PlanningService;
  let tmpDir: string;

  beforeEach(() => {
    service = new PlanningService('test-model');
    mockCreate.mockReset();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-plan-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('savePlan', () => {
    it('saves plan and conversation to .elisa/plan.json', async () => {
      mockClaudeResponse(validTurnOutput());
      await service.startPlanning('session-1', 'Test app');

      service.savePlan('session-1', tmpDir);

      const filePath = path.join(tmpDir, '.elisa', 'plan.json');
      expect(fs.existsSync(filePath)).toBe(true);

      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(data.plan).toBeDefined();
      expect(data.plan.idea).toBe('Test app');
      expect(data.conversation).toBeDefined();
      expect(Array.isArray(data.conversation)).toBe(true);
      expect(data.status).toBe('active');
      expect(data.savedAt).toBeDefined();
    });

    it('creates .elisa directory if it does not exist', async () => {
      mockClaudeResponse(validTurnOutput());
      await service.startPlanning('session-1', 'Test app');

      const subDir = path.join(tmpDir, 'nested', 'workspace');
      service.savePlan('session-1', subDir);

      expect(fs.existsSync(path.join(subDir, '.elisa', 'plan.json'))).toBe(true);
    });

    it('no-ops for unknown session', () => {
      // Should not throw
      service.savePlan('nonexistent', tmpDir);
      expect(fs.existsSync(path.join(tmpDir, '.elisa', 'plan.json'))).toBe(false);
    });

    it('saves conversation history with messages', async () => {
      mockClaudeResponse(validTurnOutput());
      await service.startPlanning('session-1', 'Test app');

      service.savePlan('session-1', tmpDir);

      const data = JSON.parse(
        fs.readFileSync(path.join(tmpDir, '.elisa', 'plan.json'), 'utf-8'),
      );
      // Should have kid message + agent response
      expect(data.conversation.length).toBeGreaterThanOrEqual(2);
      expect(data.conversation[0].role).toBe('kid');
      expect(data.conversation[1].role).toBe('agent');
    });
  });

  describe('loadPlan', () => {
    it('loads saved plan and restores session', async () => {
      mockClaudeResponse(validTurnOutput());
      await service.startPlanning('session-1', 'Test app');
      service.savePlan('session-1', tmpDir);
      service.deleteSession('session-1');

      const loaded = service.loadPlan('session-2', tmpDir);

      expect(loaded).not.toBeNull();
      expect(loaded!.sessionId).toBe('session-2');
      expect(loaded!.plan.idea).toBe('Test app');
      expect(loaded!.conversationHistory.length).toBeGreaterThanOrEqual(2);
      expect(service.getState('session-2')).toBeDefined();
    });

    it('returns null when no plan file exists', () => {
      const result = service.loadPlan('session-1', tmpDir);
      expect(result).toBeNull();
    });

    it('returns null for corrupt plan file', () => {
      const elisaDir = path.join(tmpDir, '.elisa');
      fs.mkdirSync(elisaDir, { recursive: true });
      fs.writeFileSync(path.join(elisaDir, 'plan.json'), 'not json at all');

      const result = service.loadPlan('session-1', tmpDir);
      expect(result).toBeNull();
    });

    it('preserves generated blocks and canvas context', async () => {
      mockClaudeResponse(validTurnOutput());
      await service.startPlanning('session-1', 'Test app', {
        blocks: [{ type: 'Goal', content: 'Test' }],
        hasGoal: true,
        promiseCount: 0,
        skillCount: 0,
        portalCount: 0,
        hasDeployTarget: false,
      });
      service.savePlan('session-1', tmpDir);
      service.deleteSession('session-1');

      const loaded = service.loadPlan('session-2', tmpDir);

      expect(loaded).not.toBeNull();
      expect(loaded!.canvasContext).toBeDefined();
      expect(loaded!.canvasContext!.hasGoal).toBe(true);
    });

    it('restores ready status', async () => {
      const readyOutput = validTurnOutput();
      (readyOutput.plan as any).ready = true;
      (readyOutput.plan as any).goal.confidence = 'solid';
      (readyOutput.plan as any).promises.push(
        { description: 'P2', category: 'behavior', proofs: [{ description: 'Proof2' }] },
      );
      (readyOutput.plan as any).skills = [{ name: 'S1', description: 'Skill' }];
      (readyOutput.plan as any).portals = [{ name: 'API', subtype: 'api', description: 'AI' }];
      (readyOutput.plan as any).deploy.target = 'web';
      readyOutput.question = null;
      mockClaudeResponse(readyOutput);
      await service.startPlanning('session-1', 'Test app');

      service.savePlan('session-1', tmpDir);
      service.deleteSession('session-1');

      const loaded = service.loadPlan('session-2', tmpDir);
      expect(loaded!.status).toBe('ready');
    });
  });

  describe('round-trip', () => {
    it('save and load produce equivalent state', async () => {
      mockClaudeResponse(validTurnOutput());
      await service.startPlanning('session-1', 'Test app');

      // Apply a structured answer
      service.handleStructuredAnswer('session-1', 'web');

      service.savePlan('session-1', tmpDir);

      const original = service.getState('session-1')!;
      service.deleteSession('session-1');

      service.loadPlan('session-1', tmpDir);
      const restored = service.getState('session-1')!;

      expect(restored.plan.idea).toBe(original.plan.idea);
      expect(restored.plan.deploy.target).toBe(original.plan.deploy.target);
      expect(restored.conversationHistory.length).toBe(original.conversationHistory.length);
    });
  });

  describe('auto-save', () => {
    it('overwrites previous save on second call', async () => {
      mockClaudeResponse(validTurnOutput());
      await service.startPlanning('session-1', 'Test app');
      service.savePlan('session-1', tmpDir);

      // Mutate
      service.handleStructuredAnswer('session-1', 'web');
      service.savePlan('session-1', tmpDir);

      const data = JSON.parse(
        fs.readFileSync(path.join(tmpDir, '.elisa', 'plan.json'), 'utf-8'),
      );
      expect(data.plan.deploy.target).toBe('web');
    });
  });
});
