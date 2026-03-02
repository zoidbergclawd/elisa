import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MeetingType, MeetingMessage } from '../models/meeting.js';
import type { MeetingBuildContext } from './meetingAgentService.js';
import { MEETING_TOPIC_DESCRIPTIONS } from './meetingAgentService.js';

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

const meetingTypeNoCanvas: MeetingType = {
  id: 'no-canvas-agent',
  name: 'No Canvas Agent',
  agentName: 'Plain',
  canvasType: 'nonexistent-type',
  triggerConditions: [{ event: 'plan_ready' }],
  persona: 'An agent with no canvas instructions.',
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

describe('MeetingAgentService (dual-call)', () => {
  let service: InstanceType<typeof import('./meetingAgentService.js').MeetingAgentService>;

  beforeEach(async () => {
    mockCreate.mockReset();
    const { MeetingAgentService } = await import('./meetingAgentService.js');
    service = new MeetingAgentService('test-model');
  });

  it('makes two parallel API calls (chat + canvas)', async () => {
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Great job!' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '{"health_score": 85}' }] });

    const messages: MeetingMessage[] = [
      { role: 'kid', content: 'How is my build?', timestamp: 1000 },
    ];

    const result = await service.generateResponse(meetingType, messages, buildContext);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.text).toBe('Great job!');
    expect(result.canvasUpdate).toEqual({ health_score: 85 });
  });

  it('chat prompt contains "NEVER output JSON"', async () => {
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Hi!' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '{}' }] });

    await service.generateResponse(
      meetingType,
      [{ role: 'kid', content: 'Hi', timestamp: 1 }],
      buildContext,
    );

    // First call is chat
    const chatArgs = mockCreate.mock.calls[0][0];
    expect(chatArgs.system).toContain('NEVER output JSON');
  });

  it('canvas prompt contains "Output ONLY a valid JSON object"', async () => {
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Hi!' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '{}' }] });

    await service.generateResponse(
      meetingType,
      [{ role: 'kid', content: 'Hi', timestamp: 1 }],
      buildContext,
    );

    // Second call is canvas
    const canvasArgs = mockCreate.mock.calls[1][0];
    expect(canvasArgs.system).toContain('Output ONLY a valid JSON object');
  });

  it('chat failure returns fallback text, canvas still works', async () => {
    mockCreate
      .mockRejectedValueOnce(new Error('API error'))
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '{"health_score": 90}' }] });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await service.generateResponse(
      meetingType,
      [{ role: 'kid', content: 'Hi', timestamp: 1 }],
      buildContext,
    );

    expect(result.text).toContain('let me think');
    expect(result.canvasUpdate).toEqual({ health_score: 90 });
    consoleSpy.mockRestore();
  });

  it('canvas failure returns undefined canvasUpdate, chat text unaffected', async () => {
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Looking good!' }] })
      .mockRejectedValueOnce(new Error('Canvas API error'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await service.generateResponse(
      meetingType,
      [{ role: 'kid', content: 'Hi', timestamp: 1 }],
      buildContext,
    );

    expect(result.text).toBe('Looking good!');
    expect(result.canvasUpdate).toBeUndefined();
    consoleSpy.mockRestore();
  });

  it('both calls share the same message history', async () => {
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Chat' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '{}' }] });

    const messages: MeetingMessage[] = [
      { role: 'agent', content: 'Hello!', timestamp: 1000 },
      { role: 'kid', content: 'Hi!', timestamp: 2000 },
    ];

    await service.generateResponse(meetingType, messages, buildContext);

    const chatMessages = mockCreate.mock.calls[0][0].messages;
    const canvasMessages = mockCreate.mock.calls[1][0].messages;
    expect(chatMessages).toEqual(canvasMessages);
  });

  it('canvas strips accidental code fencing', async () => {
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Here!' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '```json\n{"health_score": 75}\n```' }] });

    const result = await service.generateResponse(
      meetingType,
      [{ role: 'kid', content: 'Status?', timestamp: 1 }],
      buildContext,
    );

    expect(result.canvasUpdate).toEqual({ health_score: 75 });
  });

  it('canvas handles literal newlines in draw code', async () => {
    const rawCanvas = '{"scene_title":"Stars","elements":[{"name":"bg","draw":"ctx.fillStyle=\'#000\';\nctx.fillRect(0,0,w,h);"}]}';
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Check it out!' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: rawCanvas }] });

    const result = await service.generateResponse(
      meetingType,
      [{ role: 'kid', content: 'Draw', timestamp: 1 }],
      buildContext,
    );

    expect(result.canvasUpdate).toBeDefined();
    expect(result.canvasUpdate?.scene_title).toBe('Stars');
  });

  it('invalid canvas JSON returns undefined without crash', async () => {
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Oops!' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '{not valid json at all}' }] });

    const result = await service.generateResponse(
      meetingType,
      [{ role: 'kid', content: 'Hi', timestamp: 1 }],
      buildContext,
    );

    expect(result.text).toBe('Oops!');
    expect(result.canvasUpdate).toBeUndefined();
  });

  it('skips canvas call when no canvas instructions exist for the type', async () => {
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Just chat!' }] });

    const result = await service.generateResponse(
      meetingTypeNoCanvas,
      [{ role: 'kid', content: 'Hi', timestamp: 1 }],
      buildContext,
    );

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result.text).toBe('Just chat!');
    expect(result.canvasUpdate).toBeUndefined();
  });

  it('uses configured model for both calls', async () => {
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Chat' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '{}' }] });

    await service.generateResponse(
      meetingType,
      [{ role: 'kid', content: 'Hi', timestamp: 1 }],
      buildContext,
    );

    expect(mockCreate.mock.calls[0][0].model).toBe('test-model');
    expect(mockCreate.mock.calls[1][0].model).toBe('test-model');
  });

  it('chat call uses MEETING_CHAT_MAX_TOKENS, canvas uses MEETING_CANVAS_MAX_TOKENS', async () => {
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Chat' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '{}' }] });

    await service.generateResponse(
      meetingType,
      [{ role: 'kid', content: 'Hi', timestamp: 1 }],
      buildContext,
    );

    expect(mockCreate.mock.calls[0][0].max_tokens).toBe(300);
    expect(mockCreate.mock.calls[1][0].max_tokens).toBe(4096);
  });

  it('converts kid messages to user role and agent to assistant', async () => {
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Response' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '{}' }] });

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
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Response' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '{}' }] });

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
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Welcome!' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '{}' }] });

    await service.generateResponse(meetingType, [], buildContext);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages).toEqual([
      { role: 'user', content: '[Meeting started]' },
    ]);
  });

  it('includes build context in chat system prompt', async () => {
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Response' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '{}' }] });

    await service.generateResponse(
      meetingType,
      [{ role: 'kid', content: 'Hi', timestamp: 1 }],
      buildContext,
    );

    const chatArgs = mockCreate.mock.calls[0][0];
    expect(chatArgs.system).toContain('Build a weather app');
    expect(chatArgs.system).toContain('Testy');
    expect(chatArgs.system).toContain('executing');
  });

  it('canvas prompt includes canvas schema instructions', async () => {
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Response' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '{}' }] });

    await service.generateResponse(
      meetingType,
      [{ role: 'kid', content: 'Hi', timestamp: 1 }],
      buildContext,
    );

    const canvasArgs = mockCreate.mock.calls[1][0];
    expect(canvasArgs.system).toContain('health_score');
  });

  it('canvas strips ```canvas fencing', async () => {
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Here!' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '```canvas\n{"health_score": 60}\n```' }] });

    const result = await service.generateResponse(
      meetingType,
      [{ role: 'kid', content: 'Status', timestamp: 1 }],
      buildContext,
    );

    expect(result.canvasUpdate).toEqual({ health_score: 60 });
  });

  it('empty canvas response returns undefined', async () => {
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Hi!' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '' }] });

    const result = await service.generateResponse(
      meetingType,
      [{ role: 'kid', content: 'Hi', timestamp: 1 }],
      buildContext,
    );

    expect(result.text).toBe('Hi!');
    expect(result.canvasUpdate).toBeUndefined();
  });

  it('logs errors to console.error on failures', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockCreate
      .mockRejectedValueOnce(new Error('chat_fail'))
      .mockRejectedValueOnce(new Error('canvas_fail'));

    await service.generateResponse(
      meetingType,
      [{ role: 'kid', content: 'Hi', timestamp: 1 }],
      buildContext,
    );

    expect(consoleSpy).toHaveBeenCalledWith('[meetingAgent] chat call failed:', 'chat_fail');
    expect(consoleSpy).toHaveBeenCalledWith('[meetingAgent] canvas call failed:', 'canvas_fail');
    consoleSpy.mockRestore();
  });

  it('canvas handles complex draw code with braces', async () => {
    const json = JSON.stringify({
      scene_title: 'Game',
      palette: ['#fff'],
      elements: [{
        name: 'stars',
        draw: "for(let i=0;i<100;i++){ctx.arc(i,i,1,0,6.28);ctx.fill()}",
      }],
    });
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Check it!' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: json }] });

    const result = await service.generateResponse(
      meetingType,
      [{ role: 'kid', content: 'Design', timestamp: 1 }],
      buildContext,
    );

    expect(result.canvasUpdate).toBeDefined();
    expect(result.canvasUpdate?.scene_title).toBe('Game');
    expect(result.text).toBe('Check it!');
    expect(result.text).not.toContain('"scene_title"');
  });

  it('chat prompt includes topic description for known canvas types', async () => {
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Hi!' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '{}' }] });

    await service.generateResponse(
      meetingType, // canvasType: 'blueprint'
      [{ role: 'kid', content: 'Hi', timestamp: 1 }],
      buildContext,
    );

    const chatArgs = mockCreate.mock.calls[0][0];
    expect(chatArgs.system).toContain('## Meeting Topic');
    expect(chatArgs.system).toContain('reviewing the architecture and build health');
  });

  it('chat prompt includes "NOT about designing the project" for campaign type', async () => {
    const campaignType: MeetingType = {
      id: 'campaign-agent',
      name: 'Campaign Agent',
      agentName: 'Canvas',
      canvasType: 'campaign',
      triggerConditions: [{ event: 'plan_ready' }],
      persona: 'A creative marketing agent.',
    };

    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Marketing!' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '{}' }] });

    await service.generateResponse(
      campaignType,
      [{ role: 'kid', content: 'Hi', timestamp: 1 }],
      buildContext,
    );

    const chatArgs = mockCreate.mock.calls[0][0];
    expect(chatArgs.system).toContain('NOT about designing the project');
  });

  it('canvas prompt includes recent user messages when provided', async () => {
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Nice!' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '{}' }] });

    const messages: MeetingMessage[] = [
      { role: 'kid', content: 'I want a space theme', timestamp: 1000 },
      { role: 'agent', content: 'Great idea!', timestamp: 2000 },
      { role: 'kid', content: 'With purple stars', timestamp: 3000 },
    ];

    await service.generateResponse(meetingType, messages, buildContext);

    // Second call is canvas
    const canvasArgs = mockCreate.mock.calls[1][0];
    expect(canvasArgs.system).toContain('## Recent Conversation');
    expect(canvasArgs.system).toContain('I want a space theme');
    expect(canvasArgs.system).toContain('With purple stars');
    expect(canvasArgs.system).toContain('Generate canvas data that reflects this conversation');
  });

  it('canvas prompt excludes [Meeting started] synthetic message from recent conversation', async () => {
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Hi!' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '{}' }] });

    // Only agent messages -- toClaudeMessages will prepend [Meeting started]
    const messages: MeetingMessage[] = [
      { role: 'agent', content: 'Welcome!', timestamp: 1000 },
    ];

    await service.generateResponse(meetingType, messages, buildContext);

    const canvasArgs = mockCreate.mock.calls[1][0];
    // Should NOT include the synthetic message in the topic summary
    expect(canvasArgs.system).not.toContain('Meeting started');
  });

  it('parseCanvasResponse logs warning on unparseable input', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Oops!' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'totally not json {{{' }] });

    const result = await service.generateResponse(
      meetingType,
      [{ role: 'kid', content: 'Hi', timestamp: 1 }],
      buildContext,
    );

    expect(result.canvasUpdate).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      '[meetingAgent] canvas response could not be parsed:',
      expect.stringContaining('totally not json'),
    );
    warnSpy.mockRestore();
  });

  it('MEETING_TOPIC_DESCRIPTIONS covers all CANVAS_INSTRUCTIONS keys', () => {
    const canvasKeys = ['blueprint', 'theme-picker', 'campaign', 'explain-it', 'launch-pad', 'interface-designer', 'bug-detective', 'design-preview'];
    for (const key of canvasKeys) {
      expect(MEETING_TOPIC_DESCRIPTIONS[key]).toBeDefined();
    }
  });

  it('parses canvas JSON preceded by explanatory text', async () => {
    const canvasResponse = 'Here is the design for your game:\n\n```json\n{"scene_title":"Space Dodge","palette":["#fff"]}\n```\nHope you like it!';
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Cool!' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: canvasResponse }] });

    const result = await service.generateResponse(
      meetingType,
      [{ role: 'kid', content: 'Design', timestamp: 1 }],
      buildContext,
    );

    expect(result.canvasUpdate).toBeDefined();
    expect(result.canvasUpdate?.scene_title).toBe('Space Dodge');
  });

  it('parses unfenced JSON mixed with prose text', async () => {
    const canvasResponse = 'Here is your data: {"health_score": 95, "tasks": []} and that is it.';
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Update!' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: canvasResponse }] });

    const result = await service.generateResponse(
      meetingType,
      [{ role: 'kid', content: 'Status', timestamp: 1 }],
      buildContext,
    );

    expect(result.canvasUpdate).toEqual({ health_score: 95, tasks: [] });
  });

  it('parses canvas fenced block with text before and literal newlines in draw code', async () => {
    const canvasResponse = "Let me show you the design:\n\n```canvas\n{\"scene_title\":\"Game\",\"elements\":[{\"name\":\"bg\",\"draw\":\"ctx.fillStyle='#000';\nctx.fillRect(0,0,w,h);\"}]}\n```";
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Check it out!' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: canvasResponse }] });

    const result = await service.generateResponse(
      meetingType,
      [{ role: 'kid', content: 'Draw', timestamp: 1 }],
      buildContext,
    );

    expect(result.canvasUpdate).toBeDefined();
    expect(result.canvasUpdate?.scene_title).toBe('Game');
  });
});
