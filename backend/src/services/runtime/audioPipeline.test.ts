import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AudioPipeline } from './audioPipeline.js';
import type { TurnPipeline } from './turnPipeline.js';
import type { AgentStore } from './agentStore.js';
import type { AgentIdentity } from '../../models/runtime.js';

// ── Mocks ────────────────────────────────────────────────────────────

/**
 * Mock the openai module so we never call the real API.
 * The factory returns a class whose instances expose the same
 * shape the AudioPipeline uses: openai.audio.transcriptions.create()
 * and openai.audio.speech.create().
 */
vi.mock('openai', () => {
  const mockTranscriptionsCreate = vi.fn().mockResolvedValue({ text: 'Hello world' });
  const mockSpeechCreate = vi.fn().mockResolvedValue({
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)),
  });

  class MockOpenAI {
    audio = {
      transcriptions: { create: mockTranscriptionsCreate },
      speech: { create: mockSpeechCreate },
    };
  }

  return {
    default: MockOpenAI,
    toFile: vi.fn().mockImplementation(async (buffer: Buffer, name: string) => {
      return { name, buffer };
    }),
    __mockTranscriptionsCreate: mockTranscriptionsCreate,
    __mockSpeechCreate: mockSpeechCreate,
  };
});

// ── Helpers ──────────────────────────────────────────────────────────

function makeMockTurnPipeline(overrides?: Record<string, unknown>): TurnPipeline {
  return {
    receiveTurn: vi.fn().mockResolvedValue({
      response: 'Hi there! How can I help?',
      session_id: 'session-abc',
      input_tokens: 50,
      output_tokens: 30,
    }),
    ...overrides,
  } as unknown as TurnPipeline;
}

function makeMockAgentStore(overrides?: Record<string, unknown>): AgentStore {
  const identity: AgentIdentity = {
    agent_id: 'agent-1',
    agent_name: 'Test Agent',
    system_prompt: 'You are a test agent.',
    greeting: 'Hello!',
    fallback_response: "I'm not sure.",
    topic_index: [],
    tool_configs: [],
    voice: 'nova',
    display_theme: 'default',
    study_config: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  return {
    get: vi.fn().mockReturnValue(identity),
    validateApiKey: vi.fn().mockReturnValue(true),
    has: vi.fn().mockReturnValue(true),
    ...overrides,
  } as unknown as AgentStore;
}

function makeSampleAudioBuffer(): Buffer {
  // Simulated audio: 1 second of 16kHz mono 16-bit PCM (32000 bytes)
  return Buffer.alloc(32000, 0);
}

// ── Tests ────────────────────────────────────────────────────────────

describe('AudioPipeline', () => {
  let pipeline: AudioPipeline;
  let turnPipeline: TurnPipeline;
  let agentStore: AgentStore;
  let savedKey: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    savedKey = process.env.OPENAI_API_KEY;
    turnPipeline = makeMockTurnPipeline();
    agentStore = makeMockAgentStore();
  });

  afterEach(() => {
    // Restore the original OPENAI_API_KEY
    if (savedKey !== undefined) {
      process.env.OPENAI_API_KEY = savedKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  describe('isAvailable()', () => {
    it('returns true when OPENAI_API_KEY is set', () => {
      process.env.OPENAI_API_KEY = 'test-key-123';
      pipeline = new AudioPipeline(turnPipeline, agentStore);
      expect(pipeline.isAvailable()).toBe(true);
    });

    it('returns false when OPENAI_API_KEY is not set', () => {
      delete process.env.OPENAI_API_KEY;
      pipeline = new AudioPipeline(turnPipeline, agentStore);
      expect(pipeline.isAvailable()).toBe(false);
    });
  });

  describe('processAudioTurn()', () => {
    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'test-key-123';
      pipeline = new AudioPipeline(turnPipeline, agentStore);
    });

    it('orchestrates STT -> text turn -> TTS', async () => {
      const audioBuffer = makeSampleAudioBuffer();
      const result = await pipeline.processAudioTurn('agent-1', audioBuffer, 'wav');

      // Verify transcript came from STT (mocked)
      expect(result.transcript).toBe('Hello world');

      // Verify text turn was called with the transcript
      expect(turnPipeline.receiveTurn).toHaveBeenCalledWith('agent-1', {
        text: 'Hello world',
        session_id: undefined,
      });

      // Verify response came from text turn
      expect(result.response_text).toBe('Hi there! How can I help?');

      // Verify audio was generated (base64 encoded)
      expect(result.audio_base64).toBeTruthy();
      expect(typeof result.audio_base64).toBe('string');
      expect(result.audio_format).toBe('mp3');

      // Verify session_id is passed through
      expect(result.session_id).toBe('session-abc');
    });

    it('passes session_id to turn pipeline when provided', async () => {
      const audioBuffer = makeSampleAudioBuffer();
      await pipeline.processAudioTurn('agent-1', audioBuffer, 'wav', 'existing-session');

      expect(turnPipeline.receiveTurn).toHaveBeenCalledWith('agent-1', {
        text: 'Hello world',
        session_id: 'existing-session',
      });
    });

    it('includes usage statistics in the result', async () => {
      const audioBuffer = makeSampleAudioBuffer();
      const result = await pipeline.processAudioTurn('agent-1', audioBuffer, 'wav');

      expect(result.usage).toBeDefined();
      expect(result.usage.stt_seconds).toBeGreaterThan(0);
      expect(result.usage.tts_characters).toBe('Hi there! How can I help?'.length);
      expect(result.usage.input_tokens).toBe(50);
      expect(result.usage.output_tokens).toBe(30);
    });

    it('estimates STT duration differently for wav vs webm', async () => {
      const audioBuffer = makeSampleAudioBuffer();

      const resultWav = await pipeline.processAudioTurn('agent-1', audioBuffer, 'wav');
      const resultWebm = await pipeline.processAudioTurn('agent-1', audioBuffer, 'webm');

      // wav: buffer.length / (16000 * 2) = 32000 / 32000 = 1.0
      expect(resultWav.usage.stt_seconds).toBe(1.0);

      // webm: buffer.length / 6000 = 32000 / 6000 ~= 5.33
      expect(resultWebm.usage.stt_seconds).toBeGreaterThan(5);
    });

    it('throws when OPENAI_API_KEY is not configured', async () => {
      delete process.env.OPENAI_API_KEY;
      const unavailablePipeline = new AudioPipeline(turnPipeline, agentStore);

      await expect(
        unavailablePipeline.processAudioTurn('agent-1', makeSampleAudioBuffer(), 'wav'),
      ).rejects.toThrow('OPENAI_API_KEY not configured');
    });

    it('looks up agent voice preference for TTS', async () => {
      const audioBuffer = makeSampleAudioBuffer();
      await pipeline.processAudioTurn('agent-1', audioBuffer, 'wav');

      // Verify agentStore.get was called to look up voice
      expect(agentStore.get).toHaveBeenCalledWith('agent-1');
    });

    it('propagates turn pipeline errors', async () => {
      const failingTurnPipeline = makeMockTurnPipeline({
        receiveTurn: vi.fn().mockRejectedValue(new Error('Agent not found: agent-999')),
      });

      process.env.OPENAI_API_KEY = 'test-key-123';
      const failingPipeline = new AudioPipeline(failingTurnPipeline, agentStore);

      await expect(
        failingPipeline.processAudioTurn('agent-999', makeSampleAudioBuffer(), 'wav'),
      ).rejects.toThrow('Agent not found: agent-999');
    });
  });
});
