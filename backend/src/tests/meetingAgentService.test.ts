import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeetingAgentService, type MeetingBuildContext } from '../services/meetingAgentService.js';
import type { MeetingType, MeetingMessage } from '../models/meeting.js';

// Mock the Anthropic client to capture prompts
const mockCreate = vi.fn();
vi.mock('../utils/anthropicClient.js', () => ({
  getAnthropicClient: () => ({
    messages: { create: mockCreate },
  }),
}));

function makeMeetingType(overrides?: Partial<MeetingType>): MeetingType {
  return {
    id: 'design-task-agent',
    name: 'Design Review',
    agentName: 'Pixel',
    canvasType: 'design-preview',
    triggerConditions: [],
    persona: "I'm Pixel!",
    ...overrides,
  };
}

function makeBuildContext(): MeetingBuildContext {
  return {
    goal: 'Space game',
    requirements: ['Spaceship', 'Asteroids'],
    tasks: [{ id: 't1', title: 'Build spaceship', agent: 'builder', status: 'pending' }],
    agents: [{ name: 'builder', role: 'Builder' }],
    devices: [],
    phase: 'executing',
  };
}

describe('MeetingAgentService', () => {
  let service: MeetingAgentService;

  beforeEach(() => {
    service = new MeetingAgentService('test-model');
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Hello!' }],
    });
  });

  describe('focusContext in prompts', () => {
    it('injects focusContext into chat system prompt', async () => {
      const meetingType = makeMeetingType();
      const messages: MeetingMessage[] = [
        { role: 'kid', content: 'Hi', timestamp: Date.now() },
      ];

      await service.generateResponse(meetingType, messages, makeBuildContext(), {
        focusContext: 'Task: Implement spaceship\nDescription: Create sprite',
      });

      // Chat call is first
      const chatCall = mockCreate.mock.calls[0][0];
      expect(chatCall.system).toContain('## Your Focus');
      expect(chatCall.system).toContain('Task: Implement spaceship');
      expect(chatCall.system).toContain('Do NOT redesign previous elements');
    });

    it('injects focusContext into canvas system prompt', async () => {
      const meetingType = makeMeetingType();
      const messages: MeetingMessage[] = [
        { role: 'kid', content: 'Hi', timestamp: Date.now() },
      ];

      await service.generateResponse(meetingType, messages, makeBuildContext(), {
        focusContext: 'Task: Implement asteroids\nDescription: Asteroid sprites',
      });

      // Canvas call is second
      const canvasCall = mockCreate.mock.calls[1][0];
      expect(canvasCall.system).toContain('## Scope');
      expect(canvasCall.system).toContain('Task: Implement asteroids');
    });
  });

  describe('previousDesigns in prompts', () => {
    it('injects previousDesigns into chat system prompt', async () => {
      const meetingType = makeMeetingType();
      const messages: MeetingMessage[] = [
        { role: 'kid', content: 'Hi', timestamp: Date.now() },
      ];

      await service.generateResponse(meetingType, messages, makeBuildContext(), {
        previousDesigns: ['Spaceship: A blue rocket ship', 'Stars: Twinkling background'],
      });

      const chatCall = mockCreate.mock.calls[0][0];
      expect(chatCall.system).toContain('## Already Designed');
      expect(chatCall.system).toContain('Spaceship: A blue rocket ship');
      expect(chatCall.system).toContain('Stars: Twinkling background');
      expect(chatCall.system).toContain('do not include them in canvas data');
    });

    it('injects previousDesigns into canvas system prompt', async () => {
      const meetingType = makeMeetingType();
      const messages: MeetingMessage[] = [
        { role: 'kid', content: 'Hi', timestamp: Date.now() },
      ];

      await service.generateResponse(meetingType, messages, makeBuildContext(), {
        previousDesigns: ['Spaceship: A blue rocket ship'],
      });

      const canvasCall = mockCreate.mock.calls[1][0];
      expect(canvasCall.system).toContain('## Previously Designed');
      expect(canvasCall.system).toContain('Spaceship: A blue rocket ship');
      expect(canvasCall.system).toContain('Do NOT include these elements');
    });
  });

  describe('canvas timeout graceful degradation', () => {
    it('returns text response with undefined canvasUpdate when canvas call times out', async () => {
      const meetingType = makeMeetingType();
      const messages: MeetingMessage[] = [
        { role: 'kid', content: 'Hi', timestamp: Date.now() },
      ];

      // Chat call succeeds, canvas call rejects (simulating timeout)
      mockCreate
        .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Looking great!' }] })
        .mockRejectedValueOnce(new Error('Timeout after 45000ms'));

      const result = await service.generateResponse(meetingType, messages, makeBuildContext());

      expect(result.text).toBe('Looking great!');
      expect(result.canvasUpdate).toBeUndefined();
    });
  });

  describe('no options', () => {
    it('omits focus and previous sections when no options provided', async () => {
      const meetingType = makeMeetingType();
      const messages: MeetingMessage[] = [
        { role: 'kid', content: 'Hi', timestamp: Date.now() },
      ];

      await service.generateResponse(meetingType, messages, makeBuildContext());

      const chatCall = mockCreate.mock.calls[0][0];
      expect(chatCall.system).not.toContain('## Your Focus');
      expect(chatCall.system).not.toContain('## Already Designed');

      const canvasCall = mockCreate.mock.calls[1][0];
      expect(canvasCall.system).not.toContain('## Scope');
      expect(canvasCall.system).not.toContain('## Previously Designed');
    });
  });

  describe('health and architecture context in prompts', () => {
    it('chat prompt includes health grade and breakdown when available', async () => {
      const meetingType = makeMeetingType({ canvasType: 'blueprint', id: 'architecture-agent' });
      const messages: MeetingMessage[] = [
        { role: 'kid', content: 'How did my build go?', timestamp: Date.now() },
      ];
      const ctx = {
        ...makeBuildContext(),
        healthGrade: 'B',
        healthScore: 82,
        healthBreakdown: { tasks_score: 25, tests_score: 35, corrections_score: 12, budget_score: 10 },
      };

      await service.generateResponse(meetingType, messages, ctx);
      const chatCall = mockCreate.mock.calls[0][0];
      expect(chatCall.system).toContain('## Build Health');
      expect(chatCall.system).toContain('Grade: B');
      expect(chatCall.system).toContain('Tasks 25/30');
    });

    it('chat prompt includes failing tests with details', async () => {
      const meetingType = makeMeetingType({ canvasType: 'blueprint', id: 'architecture-agent' });
      const messages: MeetingMessage[] = [
        { role: 'kid', content: 'Why did tests fail?', timestamp: Date.now() },
      ];
      const ctx = {
        ...makeBuildContext(),
        testResults: [
          { test_name: 'test_move', passed: true },
          { test_name: 'test_collision', passed: false, details: 'AssertionError: wall check failed' },
          { test_name: 'test_score', passed: false, details: 'NameError: score undefined' },
        ],
      };

      await service.generateResponse(meetingType, messages, ctx);
      const chatCall = mockCreate.mock.calls[0][0];
      expect(chatCall.system).toContain('## Failing Tests');
      expect(chatCall.system).toContain('test_collision');
      expect(chatCall.system).toContain('wall check failed');
      expect(chatCall.system).toContain('test_score');
      expect(chatCall.system).not.toContain('test_move'); // passing test not listed in failing section
    });

    it('chat prompt includes architecture context when available', async () => {
      const meetingType = makeMeetingType({ canvasType: 'blueprint', id: 'architecture-agent' });
      const messages: MeetingMessage[] = [
        { role: 'kid', content: 'Tell me about my project', timestamp: Date.now() },
      ];
      const ctx = {
        ...makeBuildContext(),
        complexity: 'moderate',
        systemInputs: [{ name: 'keyboard', type: 'user_input' }],
        systemOutputs: [{ name: 'canvas', type: 'visual' }],
      };

      await service.generateResponse(meetingType, messages, ctx);
      const chatCall = mockCreate.mock.calls[0][0];
      expect(chatCall.system).toContain('## Architecture');
      expect(chatCall.system).toContain('Complexity: moderate');
      expect(chatCall.system).toContain('keyboard');
      expect(chatCall.system).toContain('canvas');
    });

    it('omits health/architecture sections when data not available', async () => {
      const meetingType = makeMeetingType({ canvasType: 'blueprint', id: 'architecture-agent' });
      const messages: MeetingMessage[] = [
        { role: 'kid', content: 'Hi', timestamp: Date.now() },
      ];

      await service.generateResponse(meetingType, messages, makeBuildContext());
      const chatCall = mockCreate.mock.calls[0][0];
      expect(chatCall.system).not.toContain('## Build Health');
      expect(chatCall.system).not.toContain('## Failing Tests');
      expect(chatCall.system).not.toContain('## Architecture');
    });
  });
});
