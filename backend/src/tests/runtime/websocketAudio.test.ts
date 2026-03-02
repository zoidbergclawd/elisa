/**
 * Tests for WebSocket audio turn handling at /v1/agents/:id/stream.
 *
 * Verifies:
 * - audio_turn messages are processed (transcribe -> think -> speak -> response)
 * - Status events are sent in correct order (transcribing, thinking, speaking)
 * - audio_response contains transcript, response_text, and audio_base64
 * - Errors are returned for missing audio data, unavailable pipeline, empty audio
 * - Unknown message types produce error
 * - Text turns still work alongside audio turns
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { AudioPipeline } from '../../services/runtime/audioPipeline.js';
import type { TurnPipeline } from '../../services/runtime/turnPipeline.js';
import type { AgentStore } from '../../services/runtime/agentStore.js';

// ── Helpers ──────────────────────────────────────────────────────────

function makeMockAudioPipeline(overrides?: Partial<AudioPipeline>): AudioPipeline {
  return {
    isAvailable: vi.fn().mockReturnValue(true),
    processAudioTurn: vi.fn().mockResolvedValue({
      transcript: 'Hello world',
      response_text: 'Hi there!',
      audio_base64: Buffer.from('mock-audio-data').toString('base64'),
      audio_format: 'mp3',
      session_id: 'session-123',
      usage: {
        stt_seconds: 1.5,
        tts_characters: 9,
        input_tokens: 50,
        output_tokens: 30,
      },
    }),
    ...overrides,
  } as unknown as AudioPipeline;
}

function makeMockTurnPipeline(): TurnPipeline {
  return {
    receiveStreamingTurn: vi.fn().mockImplementation(async function* () {
      yield { type: 'text_delta', text: 'Mock' };
      yield { type: 'text_delta', text: ' response' };
      yield {
        type: 'turn_complete',
        result: {
          response: 'Mock response',
          session_id: 'session-456',
          input_tokens: 100,
          output_tokens: 50,
        },
      };
    }),
  } as unknown as TurnPipeline;
}

function makeMockAgentStore(): AgentStore {
  return {
    validateApiKey: vi.fn().mockReturnValue(true),
  } as unknown as AgentStore;
}

/**
 * Creates a minimal test WebSocket server that mirrors the real
 * server.ts handler logic for /v1/agents/:id/stream.
 */
function createTestWsServer(opts: {
  agentStore: AgentStore;
  turnPipeline: TurnPipeline;
  audioPipeline: AudioPipeline | undefined;
}) {
  const server = http.createServer();
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '', `http://${request.headers.host}`);
    const agentMatch = url.pathname.match(/^\/v1\/agents\/([^/]+)\/stream$/);

    if (!agentMatch) {
      socket.destroy();
      return;
    }

    const wsAgentId = agentMatch[1];
    const apiKey = url.searchParams.get('api_key');

    if (!apiKey || !opts.agentStore.validateApiKey(wsAgentId, apiKey)) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.on('message', async (raw) => {
        try {
          const msg = JSON.parse(String(raw));

          // ── Text turn ───────────────────────────────────────────
          if (msg.type === 'turn') {
            if (!msg.text) {
              ws.send(JSON.stringify({ type: 'error', detail: 'Expected { type: "turn", text: string, session_id?: string }' }));
              return;
            }

            for await (const chunk of opts.turnPipeline.receiveStreamingTurn(wsAgentId, {
              text: msg.text,
              session_id: msg.session_id,
            })) {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(chunk));
              }
            }
            return;
          }

          // ── Audio turn ──────────────────────────────────────────
          if (msg.type === 'audio_turn') {
            if (!opts.audioPipeline || !opts.audioPipeline.isAvailable()) {
              ws.send(JSON.stringify({ type: 'error', detail: 'Audio features require OPENAI_API_KEY environment variable' }));
              return;
            }

            if (!msg.audio_base64 || typeof msg.audio_base64 !== 'string') {
              ws.send(JSON.stringify({ type: 'error', detail: 'audio_base64 field is required' }));
              return;
            }

            const format = (msg.format === 'wav' || msg.format === 'webm') ? msg.format : 'webm';

            // Decode base64 audio
            let audioBuffer: Buffer;
            try {
              audioBuffer = Buffer.from(msg.audio_base64, 'base64');
            } catch {
              ws.send(JSON.stringify({ type: 'error', detail: 'Invalid base64 audio data' }));
              return;
            }

            if (audioBuffer.length === 0) {
              ws.send(JSON.stringify({ type: 'error', detail: 'Empty audio data' }));
              return;
            }

            // Send status events to drive face animation states
            const sendStatus = (status: string) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'audio_status', status }));
              }
            };

            sendStatus('transcribing');

            const result = await opts.audioPipeline.processAudioTurn(
              wsAgentId,
              audioBuffer,
              format,
              msg.session_id,
            );

            sendStatus('thinking');
            sendStatus('speaking');

            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'audio_response',
                transcript: result.transcript,
                response_text: result.response_text,
                audio_base64: result.audio_base64,
                audio_format: result.audio_format,
                session_id: result.session_id,
                usage: result.usage,
              }));
            }
            return;
          }

          // ── Unknown message type ────────────────────────────────
          ws.send(JSON.stringify({ type: 'error', detail: 'Unknown message type. Expected "turn" or "audio_turn"' }));
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', detail: message }));
          }
        }
      });

      // Send ready signal
      ws.send(JSON.stringify({ type: 'connected', agent_id: wsAgentId }));
    });
  });

  return { server, wss };
}

function listenOnRandomPort(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve(typeof addr === 'object' && addr ? addr.port : 0);
    });
  });
}

function connectWs(port: number, agentId: string, apiKey: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/v1/agents/${agentId}/stream?api_key=${apiKey}`);
    ws.on('error', reject);
    // Wait for 'connected' message before resolving
    ws.on('message', function onFirstMessage(raw) {
      const msg = JSON.parse(String(raw));
      if (msg.type === 'connected') {
        ws.removeListener('message', onFirstMessage);
        resolve(ws);
      }
    });
  });
}

/** Collect N messages from a WebSocket. */
function collectMessages(ws: WebSocket, count: number, timeoutMs = 5000): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const messages: any[] = [];
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${count} messages, got ${messages.length}: ${JSON.stringify(messages)}`));
    }, timeoutMs);

    ws.on('message', function onMsg(raw) {
      messages.push(JSON.parse(String(raw)));
      if (messages.length >= count) {
        ws.removeListener('message', onMsg);
        clearTimeout(timer);
        resolve(messages);
      }
    });
  });
}

// ── Tests ────────────────────────────────────────────────────────────

describe('WebSocket audio turn handling', () => {
  let server: http.Server | null = null;
  let agentStore: AgentStore;
  let turnPipeline: TurnPipeline;
  let audioPipeline: AudioPipeline;
  let port: number;

  beforeEach(async () => {
    vi.clearAllMocks();
    agentStore = makeMockAgentStore();
    turnPipeline = makeMockTurnPipeline();
    audioPipeline = makeMockAudioPipeline();

    const ctx = createTestWsServer({ agentStore, turnPipeline, audioPipeline });
    server = ctx.server;
    port = await listenOnRandomPort(server);
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((r) => server!.close(() => r()));
      server = null;
    }
  });

  it('processes audio_turn and sends status events followed by audio_response', async () => {
    const ws = await connectWs(port, 'agent-1', 'valid-key');

    // Expect 4 messages: transcribing, thinking, speaking, audio_response
    const collecting = collectMessages(ws, 4);

    ws.send(JSON.stringify({
      type: 'audio_turn',
      audio_base64: Buffer.from('fake-audio-data').toString('base64'),
      format: 'wav',
    }));

    const messages = await collecting;
    ws.close();

    // Verify status event sequence
    expect(messages[0]).toEqual({ type: 'audio_status', status: 'transcribing' });
    expect(messages[1]).toEqual({ type: 'audio_status', status: 'thinking' });
    expect(messages[2]).toEqual({ type: 'audio_status', status: 'speaking' });

    // Verify audio response
    expect(messages[3].type).toBe('audio_response');
    expect(messages[3].transcript).toBe('Hello world');
    expect(messages[3].response_text).toBe('Hi there!');
    expect(messages[3].audio_base64).toBeTruthy();
    expect(messages[3].audio_format).toBe('mp3');
    expect(messages[3].session_id).toBe('session-123');
    expect(messages[3].usage).toBeDefined();
    expect(messages[3].usage.stt_seconds).toBe(1.5);
    expect(messages[3].usage.tts_characters).toBe(9);
  });

  it('passes format and session_id to audioPipeline.processAudioTurn', async () => {
    const ws = await connectWs(port, 'agent-1', 'valid-key');
    const collecting = collectMessages(ws, 4);

    ws.send(JSON.stringify({
      type: 'audio_turn',
      audio_base64: Buffer.from('fake-audio').toString('base64'),
      format: 'wav',
      session_id: 'existing-session',
    }));

    await collecting;
    ws.close();

    expect(audioPipeline.processAudioTurn).toHaveBeenCalledWith(
      'agent-1',
      expect.any(Buffer),
      'wav',
      'existing-session',
    );
  });

  it('defaults format to webm when not specified', async () => {
    const ws = await connectWs(port, 'agent-1', 'valid-key');
    const collecting = collectMessages(ws, 4);

    ws.send(JSON.stringify({
      type: 'audio_turn',
      audio_base64: Buffer.from('fake-audio').toString('base64'),
    }));

    await collecting;
    ws.close();

    expect(audioPipeline.processAudioTurn).toHaveBeenCalledWith(
      'agent-1',
      expect.any(Buffer),
      'webm',
      undefined,
    );
  });

  it('defaults format to webm for invalid format values', async () => {
    const ws = await connectWs(port, 'agent-1', 'valid-key');
    const collecting = collectMessages(ws, 4);

    ws.send(JSON.stringify({
      type: 'audio_turn',
      audio_base64: Buffer.from('fake-audio').toString('base64'),
      format: 'mp3', // invalid — should fallback to webm
    }));

    await collecting;
    ws.close();

    expect(audioPipeline.processAudioTurn).toHaveBeenCalledWith(
      'agent-1',
      expect.any(Buffer),
      'webm',
      undefined,
    );
  });

  it('returns error when audioPipeline is unavailable', async () => {
    // Recreate server with unavailable audio pipeline
    await new Promise<void>((r) => server!.close(() => r()));
    const unavailablePipeline = makeMockAudioPipeline({
      isAvailable: vi.fn().mockReturnValue(false),
    });
    const ctx = createTestWsServer({ agentStore, turnPipeline, audioPipeline: unavailablePipeline });
    server = ctx.server;
    port = await listenOnRandomPort(server);

    const ws = await connectWs(port, 'agent-1', 'valid-key');
    const collecting = collectMessages(ws, 1);

    ws.send(JSON.stringify({
      type: 'audio_turn',
      audio_base64: Buffer.from('fake-audio').toString('base64'),
    }));

    const [msg] = await collecting;
    ws.close();

    expect(msg.type).toBe('error');
    expect(msg.detail).toContain('OPENAI_API_KEY');
  });

  it('returns error when audioPipeline is undefined', async () => {
    // Recreate server with no audio pipeline
    await new Promise<void>((r) => server!.close(() => r()));
    const ctx = createTestWsServer({ agentStore, turnPipeline, audioPipeline: undefined as any });
    server = ctx.server;
    port = await listenOnRandomPort(server);

    const ws = await connectWs(port, 'agent-1', 'valid-key');
    const collecting = collectMessages(ws, 1);

    ws.send(JSON.stringify({
      type: 'audio_turn',
      audio_base64: Buffer.from('fake-audio').toString('base64'),
    }));

    const [msg] = await collecting;
    ws.close();

    expect(msg.type).toBe('error');
    expect(msg.detail).toContain('OPENAI_API_KEY');
  });

  it('returns error when audio_base64 is missing', async () => {
    const ws = await connectWs(port, 'agent-1', 'valid-key');
    const collecting = collectMessages(ws, 1);

    ws.send(JSON.stringify({
      type: 'audio_turn',
      format: 'wav',
    }));

    const [msg] = await collecting;
    ws.close();

    expect(msg.type).toBe('error');
    expect(msg.detail).toContain('audio_base64');
  });

  it('returns error when audio_base64 is empty string', async () => {
    const ws = await connectWs(port, 'agent-1', 'valid-key');
    const collecting = collectMessages(ws, 1);

    ws.send(JSON.stringify({
      type: 'audio_turn',
      audio_base64: '',
    }));

    const [msg] = await collecting;
    ws.close();

    expect(msg.type).toBe('error');
    expect(msg.detail).toContain('audio_base64');
  });

  it('returns error for empty audio data after base64 decode', async () => {
    const ws = await connectWs(port, 'agent-1', 'valid-key');
    const collecting = collectMessages(ws, 1);

    // Empty buffer encoded as base64
    ws.send(JSON.stringify({
      type: 'audio_turn',
      audio_base64: Buffer.alloc(0).toString('base64'),
    }));

    const [msg] = await collecting;
    ws.close();

    expect(msg.type).toBe('error');
    // Either "audio_base64 field is required" (empty string) or "Empty audio data"
    expect(msg.detail).toMatch(/audio_base64|Empty audio/i);
  });

  it('returns error for unknown message type', async () => {
    const ws = await connectWs(port, 'agent-1', 'valid-key');
    const collecting = collectMessages(ws, 1);

    ws.send(JSON.stringify({
      type: 'unknown_type',
    }));

    const [msg] = await collecting;
    ws.close();

    expect(msg.type).toBe('error');
    expect(msg.detail).toContain('Unknown message type');
  });

  it('returns error when audioPipeline.processAudioTurn throws', async () => {
    // Recreate server with failing pipeline
    await new Promise<void>((r) => server!.close(() => r()));
    const failingPipeline = makeMockAudioPipeline({
      processAudioTurn: vi.fn().mockRejectedValue(new Error('Agent not found: agent-999')),
    });
    const ctx = createTestWsServer({ agentStore, turnPipeline, audioPipeline: failingPipeline });
    server = ctx.server;
    port = await listenOnRandomPort(server);

    const ws = await connectWs(port, 'agent-999', 'valid-key');

    // After transcribing status, the error will be caught
    // We get: transcribing status + error
    const collecting = collectMessages(ws, 2);

    ws.send(JSON.stringify({
      type: 'audio_turn',
      audio_base64: Buffer.from('fake-audio').toString('base64'),
      format: 'wav',
    }));

    const messages = await collecting;
    ws.close();

    // First message is the 'transcribing' status (sent before the error)
    expect(messages[0]).toEqual({ type: 'audio_status', status: 'transcribing' });
    // Second message is the error
    expect(messages[1].type).toBe('error');
    expect(messages[1].detail).toContain('Agent not found');
  });

  it('text turns still work alongside audio turns', async () => {
    const ws = await connectWs(port, 'agent-1', 'valid-key');

    // Send a text turn
    const textCollecting = collectMessages(ws, 3);

    ws.send(JSON.stringify({
      type: 'turn',
      text: 'Hello!',
    }));

    const textMessages = await textCollecting;

    expect(textMessages[0]).toEqual({ type: 'text_delta', text: 'Mock' });
    expect(textMessages[1]).toEqual({ type: 'text_delta', text: ' response' });
    expect(textMessages[2].type).toBe('turn_complete');

    // Now send an audio turn
    const audioCollecting = collectMessages(ws, 4);

    ws.send(JSON.stringify({
      type: 'audio_turn',
      audio_base64: Buffer.from('fake-audio').toString('base64'),
      format: 'wav',
    }));

    const audioMessages = await audioCollecting;
    ws.close();

    expect(audioMessages[0]).toEqual({ type: 'audio_status', status: 'transcribing' });
    expect(audioMessages[3].type).toBe('audio_response');
  });

  it('rejects WebSocket connections with invalid api_key', async () => {
    const strictStore = makeMockAgentStore();
    (strictStore.validateApiKey as any).mockReturnValue(false);

    await new Promise<void>((r) => server!.close(() => r()));
    const ctx = createTestWsServer({ agentStore: strictStore, turnPipeline, audioPipeline });
    server = ctx.server;
    port = await listenOnRandomPort(server);

    // This should fail to connect (socket destroyed)
    await expect(
      new Promise<WebSocket>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/v1/agents/agent-1/stream?api_key=bad-key`);
        ws.on('open', () => resolve(ws));
        ws.on('error', reject);
      }),
    ).rejects.toThrow();
  });
});
