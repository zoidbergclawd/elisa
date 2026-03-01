import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MeetingType, MeetingMessage } from '../models/meeting.js';
import type { MeetingBuildContext } from './meetingAgentService.js';

const mockCreate = vi.fn();

vi.mock('../utils/anthropicClient.js', () => ({
  getAnthropicClient: () => ({
    messages: { create: mockCreate },
  }),
}));

const meetingType: MeetingType = {
  id: 'test-agent',
  name: 'Test Agent',
  agentName: 'Testy',
  canvasType: 'blueprint',
  triggerConditions: [{ event: 'plan_ready' }],
  persona: 'A helpful test agent who loves testing things.',
};

const buildContext: MeetingBuildContext = {
  goal: 'Build a weather app',
  requirements: ['Show temperature', 'Show humidity'],
  tasks: [
    { id: 't1', title: 'Create UI', agent: 'Builder', status: 'done' },
    { id: 't2', title: 'Add API', agent: 'Builder', status: 'pending' },
  ],
  agents: [{ name: 'Builder', role: 'builder' }],
  devices: [],
  phase: 'executing',
};

describe('MeetingAgentService', () => {
  let service: InstanceType<typeof import('./meetingAgentService.js').MeetingAgentService>;

  beforeEach(async () => {
    mockCreate.mockReset();
    const { MeetingAgentService } = await import('./meetingAgentService.js');
    service = new MeetingAgentService('test-model');
  });

  it('generates a response from the API', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Great job on the weather app!' }],
    });

    const messages: MeetingMessage[] = [
      { role: 'agent', content: 'Hi there!', timestamp: 1000 },
      { role: 'kid', content: 'What should I build next?', timestamp: 2000 },
    ];

    const result = await service.generateResponse(meetingType, messages, buildContext);
    expect(result.text).toBe('Great job on the weather app!');
    expect(result.canvasUpdate).toBeUndefined();
  });

  it('parses canvas update from fenced code block', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Here is an update!\n```canvas\n{"health_score": 85}\n```' }],
    });

    const messages: MeetingMessage[] = [
      { role: 'kid', content: 'How is the build going?', timestamp: 1000 },
    ];

    const result = await service.generateResponse(meetingType, messages, buildContext);
    expect(result.text).toBe('Here is an update!');
    expect(result.canvasUpdate).toEqual({ health_score: 85 });
  });

  it('ignores malformed canvas JSON', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Oops\n```canvas\n{bad json}\n```' }],
    });

    const messages: MeetingMessage[] = [
      { role: 'kid', content: 'Hello', timestamp: 1000 },
    ];

    const result = await service.generateResponse(meetingType, messages, buildContext);
    expect(result.text).toBe('Oops');
    expect(result.canvasUpdate).toBeUndefined();
  });

  it('returns fallback on API error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API error'));

    const messages: MeetingMessage[] = [
      { role: 'kid', content: 'Hello', timestamp: 1000 },
    ];

    const result = await service.generateResponse(meetingType, messages, buildContext);
    expect(result.text).toContain('let me think');
    expect(result.canvasUpdate).toBeUndefined();
  });

  it('logs error to console.error on API failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockCreate.mockRejectedValueOnce(new Error('model_not_found'));

    const messages: MeetingMessage[] = [
      { role: 'kid', content: 'Hello', timestamp: 1000 },
    ];

    await service.generateResponse(meetingType, messages, buildContext);
    expect(consoleSpy).toHaveBeenCalledWith(
      '[meetingAgent] generateResponse failed:',
      'model_not_found',
    );
    consoleSpy.mockRestore();
  });

  it('converts kid messages to user role and agent to assistant, prepending synthetic user message', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Response' }],
    });

    const messages: MeetingMessage[] = [
      { role: 'agent', content: 'Hello!', timestamp: 1000 },
      { role: 'kid', content: 'Hi!', timestamp: 2000 },
    ];

    await service.generateResponse(meetingType, messages, buildContext);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages).toEqual([
      { role: 'user', content: '[Meeting started]' },
      { role: 'assistant', content: 'Hello!' },
      { role: 'user', content: 'Hi!' },
    ]);
  });

  it('merges consecutive agent messages into one assistant message', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Response' }],
    });

    const messages: MeetingMessage[] = [
      { role: 'agent', content: 'Hello!', timestamp: 1000 },
      { role: 'agent', content: 'How are you?', timestamp: 1500 },
      { role: 'kid', content: 'Great!', timestamp: 2000 },
    ];

    await service.generateResponse(meetingType, messages, buildContext);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages).toEqual([
      { role: 'user', content: '[Meeting started]' },
      { role: 'assistant', content: 'Hello!\nHow are you?' },
      { role: 'user', content: 'Great!' },
    ]);
  });

  it('handles empty messages array with synthetic user message', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Welcome!' }],
    });

    await service.generateResponse(meetingType, [], buildContext);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages).toEqual([
      { role: 'user', content: '[Meeting started]' },
    ]);
  });

  it('does not prepend synthetic message when first message is from kid', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Response' }],
    });

    const messages: MeetingMessage[] = [
      { role: 'kid', content: 'Hi!', timestamp: 1000 },
    ];

    await service.generateResponse(meetingType, messages, buildContext);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages).toEqual([
      { role: 'user', content: 'Hi!' },
    ]);
  });

  it('includes build context in system prompt', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Response' }],
    });

    await service.generateResponse(
      meetingType,
      [{ role: 'kid', content: 'Hi', timestamp: 1 }],
      buildContext,
    );

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system).toContain('Build a weather app');
    expect(callArgs.system).toContain('Testy');
    expect(callArgs.system).toContain('executing');
  });

  it('includes canvas instructions for blueprint type', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Response' }],
    });

    await service.generateResponse(
      meetingType,
      [{ role: 'kid', content: 'Hi', timestamp: 1 }],
      buildContext,
    );

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system).toContain('canvas');
    expect(callArgs.system).toContain('health_score');
  });

  it('uses configured model', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Response' }],
    });

    await service.generateResponse(
      meetingType,
      [{ role: 'kid', content: 'Hi', timestamp: 1 }],
      buildContext,
    );

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe('test-model');
  });

  it('returns empty text when response is canvas-only (no raw JSON leak)', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '```canvas\n{"scene_title":"Stars","elements":[]}\n```' }],
    });

    const result = await service.generateResponse(
      meetingType,
      [{ role: 'kid', content: 'Show me stars', timestamp: 1 }],
      buildContext,
    );
    expect(result.text).toBe('');
    expect(result.canvasUpdate).toEqual({ scene_title: 'Stars', elements: [] });
  });

  it('extracts unfenced JSON from response text', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Here is the design!\n{"scene_title":"Galaxy","palette":["#fff"]}\nEnjoy!' }],
    });

    const result = await service.generateResponse(
      meetingType,
      [{ role: 'kid', content: 'Make a galaxy', timestamp: 1 }],
      buildContext,
    );
    expect(result.canvasUpdate).toEqual({ scene_title: 'Galaxy', palette: ['#fff'] });
    expect(result.text).toContain('Here is the design!');
    expect(result.text).toContain('Enjoy!');
    expect(result.text).not.toContain('scene_title');
  });

  it('strips malformed canvas fence without leaking to chat', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Check this out\n```canvas\n{not valid json}\n```' }],
    });

    const result = await service.generateResponse(
      meetingType,
      [{ role: 'kid', content: 'Hi', timestamp: 1 }],
      buildContext,
    );
    expect(result.text).toBe('Check this out');
    expect(result.canvasUpdate).toBeUndefined();
  });

  it('parses ```json fenced block with canvas fields', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Updated!\n```json\n{"tasks":[{"id":"t1","title":"A","status":"done"}]}\n```' }],
    });

    const result = await service.generateResponse(
      meetingType,
      [{ role: 'kid', content: 'Status?', timestamp: 1 }],
      buildContext,
    );
    expect(result.text).toBe('Updated!');
    expect(result.canvasUpdate).toEqual({ tasks: [{ id: 't1', title: 'A', status: 'done' }] });
  });
});
