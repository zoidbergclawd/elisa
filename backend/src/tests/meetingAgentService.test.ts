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
});
