import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/anthropicClient.js', () => ({
  getAnthropicClient: vi.fn(),
}));

vi.mock('../utils/withTimeout.js', () => ({
  withTimeout: vi.fn((promise: Promise<any>) => promise),
}));

import { analyzeScreenshot } from './visualSmokeTest.js';
import { getAnthropicClient } from '../utils/anthropicClient.js';
import { withTimeout } from '../utils/withTimeout.js';

function mockApiResponse(text: string) {
  const create = vi.fn().mockResolvedValue({
    content: [{ type: 'text', text }],
  });
  vi.mocked(getAnthropicClient).mockReturnValue({
    messages: { create },
  } as any);
  return create;
}

describe('analyzeScreenshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(withTimeout).mockImplementation((p: any) => p);
  });

  it('sends image as base64 content block to Anthropic API', async () => {
    const create = mockApiResponse('{"passed": true, "summary": "OK", "issues": []}');
    await analyzeScreenshot('abc123', 'A game');
    expect(create).toHaveBeenCalledOnce();
    const call = create.mock.calls[0][0];
    const imageBlock = call.messages[0].content.find((b: any) => b.type === 'image');
    expect(imageBlock).toBeDefined();
    expect(imageBlock.source.data).toBe('abc123');
    expect(imageBlock.source.type).toBe('base64');
    expect(imageBlock.source.media_type).toBe('image/png');
  });

  it('sends nugget goal in the prompt text', async () => {
    const create = mockApiResponse('{"passed": true, "summary": "OK", "issues": []}');
    await analyzeScreenshot('abc', 'Build a spaceship game');
    const call = create.mock.calls[0][0];
    const textBlock = call.messages[0].content.find((b: any) => b.type === 'text');
    expect(textBlock.text).toContain('Build a spaceship game');
  });

  it('parses valid JSON response into VisualTestResult', async () => {
    mockApiResponse('{"passed": true, "summary": "Game renders", "issues": []}');
    const result = await analyzeScreenshot('img', 'A game');
    expect(result).toEqual({ passed: true, summary: 'Game renders', issues: [] });
  });

  it('strips markdown fences from JSON response', async () => {
    mockApiResponse('```json\n{"passed": true, "summary": "Looks great", "issues": []}\n```');
    const result = await analyzeScreenshot('img', 'A game');
    expect(result).toEqual({ passed: true, summary: 'Looks great', issues: [] });
  });

  it('handles malformed JSON response gracefully', async () => {
    mockApiResponse('This is not JSON at all.');
    const result = await analyzeScreenshot('img', 'A game');
    expect(result.passed).toBe(false);
    expect(result.issues).toContain('Could not parse vision model response');
  });

  it('returns timeout failure after 30s', async () => {
    vi.mocked(withTimeout).mockRejectedValue(new Error('Timed out'));
    vi.mocked(getAnthropicClient).mockReturnValue({
      messages: { create: vi.fn() },
    } as any);
    const result = await analyzeScreenshot('img', 'A game');
    expect(result.passed).toBe(false);
    expect(result.summary).toContain('Timed out');
  });

  it('returns graceful failure on API error', async () => {
    vi.mocked(getAnthropicClient).mockReturnValue({
      messages: { create: vi.fn().mockRejectedValue(new Error('API down')) },
    } as any);
    const result = await analyzeScreenshot('img', 'A game');
    expect(result.passed).toBe(false);
    expect(result.issues).toContain('API down');
  });

  it('uses Haiku model by default', async () => {
    const create = mockApiResponse('{"passed": true, "summary": "OK", "issues": []}');
    await analyzeScreenshot('img', 'A game');
    expect(create.mock.calls[0][0].model).toContain('haiku');
  });

  it('includes requirements in the prompt when provided', async () => {
    const create = mockApiResponse('{"passed": true, "summary": "OK", "issues": []}');
    await analyzeScreenshot('img', 'A game', ['Arrow keys move ship', 'Score display']);
    const textBlock = create.mock.calls[0][0].messages[0].content.find((b: any) => b.type === 'text');
    expect(textBlock.text).toContain('Arrow keys move ship');
    expect(textBlock.text).toContain('Score display');
  });
});
