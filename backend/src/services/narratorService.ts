/** Translates raw agent events into kid-friendly narrator messages via Haiku. */

import Anthropic from '@anthropic-ai/sdk';
import { NARRATOR_SYSTEM_PROMPT, narratorUserPrompt } from '../prompts/narratorAgent.js';

export interface NarratorMessage {
  text: string;
  mood: 'excited' | 'encouraging' | 'concerned' | 'celebrating';
}

const VALID_MOODS = new Set(['excited', 'encouraging', 'concerned', 'celebrating']);

const TRANSLATABLE_EVENTS = new Set([
  'task_started',
  'task_completed',
  'task_failed',
  'agent_message',
  'error',
  'session_complete',
]);

export class NarratorService {
  private client: Anthropic | null = null;
  private history: string[] = [];
  private model: string;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private debounceBuffers = new Map<string, string[]>();

  constructor(model?: string) {
    this.model = model ?? process.env.NARRATOR_MODEL ?? 'claude-haiku-4-5-20241022';
  }

  isTranslatable(eventType: string): boolean {
    return TRANSLATABLE_EVENTS.has(eventType);
  }

  async translate(
    eventType: string,
    agentName: string,
    content: string,
    nuggetGoal: string,
  ): Promise<NarratorMessage> {
    const prompt = narratorUserPrompt({
      eventType,
      agentName,
      content: content.slice(0, 500),
      nuggetGoal,
      recentHistory: this.history.slice(-5),
    });

    try {
      if (!this.client) {
        this.client = new Anthropic();
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1000);

      const response = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: 150,
          system: NARRATOR_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }],
        },
        { signal: controller.signal },
      );

      clearTimeout(timeout);

      const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
      const parsed = this.parseResponse(text);
      this.history.push(parsed.text);
      if (this.history.length > 10) this.history.shift();
      return parsed;
    } catch {
      // Timeout or API error -- return fallback
      return this.fallback(eventType, agentName);
    }
  }

  /** Accumulate agent_output events and translate after 2s of silence. */
  accumulateOutput(
    taskId: string,
    content: string,
    agentName: string,
    nuggetGoal: string,
    onTranslated: (msg: NarratorMessage) => void,
  ): void {
    const buffer = this.debounceBuffers.get(taskId) ?? [];
    buffer.push(content);
    this.debounceBuffers.set(taskId, buffer);

    // Clear existing timer
    const existingTimer = this.debounceTimers.get(taskId);
    if (existingTimer) clearTimeout(existingTimer);

    // Set new debounce timer
    const timer = setTimeout(async () => {
      this.debounceTimers.delete(taskId);
      const accumulated = this.debounceBuffers.get(taskId);
      this.debounceBuffers.delete(taskId);
      if (!accumulated || accumulated.length === 0) return;

      const batchText = accumulated.join('\n').slice(0, 1000);
      try {
        const msg = await this.translate('agent_output', agentName, batchText, nuggetGoal);
        onTranslated(msg);
      } catch {
        onTranslated(this.fallback('agent_output', agentName));
      }
    }, 2000);

    this.debounceTimers.set(taskId, timer);
  }

  /** Flush any pending debounce buffer for a task (called on task completion). */
  flushTask(taskId: string): void {
    const timer = this.debounceTimers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(taskId);
    }
    this.debounceBuffers.delete(taskId);
  }

  reset(): void {
    this.history = [];
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
    this.debounceBuffers.clear();
  }

  getHistory(): string[] {
    return [...this.history];
  }

  private parseResponse(text: string): NarratorMessage {
    try {
      // Extract JSON from response (handle markdown code fences)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      const parsed = JSON.parse(jsonMatch[0]);
      const mood = VALID_MOODS.has(parsed.mood) ? parsed.mood : 'encouraging';
      return { text: String(parsed.text || '').slice(0, 200), mood };
    } catch {
      return { text: text.slice(0, 200), mood: 'encouraging' };
    }
  }

  private fallback(eventType: string, agentName: string): NarratorMessage {
    switch (eventType) {
      case 'task_started':
        return { text: `${agentName} is getting to work!`, mood: 'excited' };
      case 'task_completed':
        return { text: `${agentName} finished their part!`, mood: 'celebrating' };
      case 'task_failed':
        return { text: `${agentName} ran into a tricky spot. Let's figure it out!`, mood: 'concerned' };
      case 'session_complete':
        return { text: 'Your minion squad did it! The project is complete!', mood: 'celebrating' };
      case 'error':
        return { text: 'Hmm, something unexpected happened. Hang tight!', mood: 'concerned' };
      default:
        return { text: `${agentName} is making progress!`, mood: 'encouraging' };
    }
  }
}
