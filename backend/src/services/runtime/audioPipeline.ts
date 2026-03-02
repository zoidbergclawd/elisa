/**
 * Audio pipeline for the Elisa Agent Runtime.
 *
 * Orchestrates audio conversation turns:
 *   mic audio -> OpenAI Whisper STT -> Claude text turn -> OpenAI TTS -> audio response
 *
 * Requires OPENAI_API_KEY environment variable. When not set, isAvailable()
 * returns false and all audio operations throw.
 */

import OpenAI from 'openai';
import { toFile } from 'openai';
import type { TurnPipeline } from './turnPipeline.js';
import type { AgentStore } from './agentStore.js';
import type { AudioTurnResult, AudioInputFormat } from '../../models/runtime.js';

// ── Constants ────────────────────────────────────────────────────────

/** Default TTS voice when agent has no voice preference. */
const DEFAULT_VOICE = 'coral';

/** Supported TTS voices from OpenAI. */
const VALID_VOICES = ['alloy', 'ash', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'] as const;

/** MIME types for audio input formats. */
const FORMAT_MIME: Record<AudioInputFormat, string> = {
  wav: 'audio/wav',
  webm: 'audio/webm',
};

// ── Audio Pipeline ───────────────────────────────────────────────────

export class AudioPipeline {
  private openai: OpenAI | null;

  constructor(
    private turnPipeline: TurnPipeline,
    private agentStore: AgentStore,
  ) {
    const apiKey = process.env.OPENAI_API_KEY;
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  /**
   * Whether audio features are available (OPENAI_API_KEY is set).
   */
  isAvailable(): boolean {
    return this.openai !== null;
  }

  /**
   * Process a full audio conversation turn:
   *   1. STT: audio buffer -> OpenAI Whisper -> transcript
   *   2. Text turn: transcript -> TurnPipeline.receiveTurn() -> response
   *   3. TTS: response text -> OpenAI TTS -> audio buffer
   */
  async processAudioTurn(
    agentId: string,
    audioBuffer: Buffer,
    format: AudioInputFormat,
    sessionId?: string,
  ): Promise<AudioTurnResult> {
    if (!this.openai) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    // 1. STT: audio -> transcript
    const transcript = await this.transcribe(audioBuffer, format);

    // 2. Text turn: transcript -> TurnPipeline -> response
    const textResult = await this.turnPipeline.receiveTurn(agentId, {
      text: transcript,
      session_id: sessionId,
    });

    // 3. TTS: response -> audio
    const { audio, characterCount } = await this.synthesize(textResult.response, agentId);

    // Estimate STT duration from audio buffer size (rough: 16kHz mono 16-bit PCM)
    const sttSeconds = format === 'wav'
      ? audioBuffer.length / (16000 * 2)
      : audioBuffer.length / 6000; // rough estimate for compressed formats

    return {
      transcript,
      response_text: textResult.response,
      audio_base64: audio.toString('base64'),
      audio_format: 'mp3',
      session_id: textResult.session_id,
      usage: {
        stt_seconds: Math.round(sttSeconds * 100) / 100,
        tts_characters: characterCount,
        input_tokens: textResult.input_tokens,
        output_tokens: textResult.output_tokens,
      },
    };
  }

  /**
   * Transcribe audio to text via OpenAI Whisper API.
   */
  private async transcribe(audioBuffer: Buffer, format: AudioInputFormat): Promise<string> {
    if (!this.openai) throw new Error('OPENAI_API_KEY not configured');

    const file = await toFile(audioBuffer, `audio.${format}`, {
      type: FORMAT_MIME[format],
    });

    const response = await this.openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
      language: 'en',
    });

    return response.text;
  }

  /**
   * Synthesize text to speech via OpenAI TTS API.
   */
  private async synthesize(
    text: string,
    agentId: string,
  ): Promise<{ audio: Buffer; characterCount: number }> {
    if (!this.openai) throw new Error('OPENAI_API_KEY not configured');

    // Look up agent voice preference
    const identity = this.agentStore.get(agentId);
    const voicePref = identity?.voice ?? DEFAULT_VOICE;
    const voice = VALID_VOICES.includes(voicePref as any) ? voicePref : DEFAULT_VOICE;

    const response = await this.openai.audio.speech.create({
      model: 'tts-1',
      voice: voice as any,
      input: text,
      response_format: 'mp3',
    });

    const arrayBuffer = await response.arrayBuffer();
    const audio = Buffer.from(arrayBuffer);

    return {
      audio,
      characterCount: text.length,
    };
  }
}
