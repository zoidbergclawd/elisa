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

interface FallbackEntry {
  template: string;
  mood: NarratorMessage['mood'];
}

const FALLBACKS: Record<string, FallbackEntry[]> = {
  task_started: [
    { template: '{agent} is getting to work!', mood: 'excited' },
    { template: '{agent} is diving in!', mood: 'excited' },
    { template: '{agent} just got a new mission!', mood: 'excited' },
  ],
  task_completed: [
    { template: '{agent} finished their part!', mood: 'celebrating' },
    { template: '{agent} nailed it!', mood: 'celebrating' },
    { template: 'Another task done by {agent}!', mood: 'celebrating' },
  ],
  task_failed: [
    { template: '{agent} ran into a tricky spot. Let\'s figure it out!', mood: 'concerned' },
    { template: '{agent} hit a snag, but we can work through it!', mood: 'concerned' },
    { template: 'Oops, {agent} needs a little help here!', mood: 'concerned' },
  ],
  session_complete: [
    { template: 'Your minion squad did it! The project is complete!', mood: 'celebrating' },
    { template: 'All done! Your minions built something awesome!', mood: 'celebrating' },
    { template: 'Mission accomplished! Great teamwork by your minions!', mood: 'celebrating' },
  ],
  error: [
    { template: 'Hmm, something unexpected happened. Hang tight!', mood: 'concerned' },
    { template: 'We hit a bump in the road, but don\'t worry!', mood: 'concerned' },
    { template: 'Something tricky happened. Let\'s sort it out!', mood: 'concerned' },
  ],
  default: [
    { template: '{agent} is making progress!', mood: 'encouraging' },
    { template: '{agent} is chugging along nicely!', mood: 'encouraging' },
    { template: '{agent} is working away!', mood: 'encouraging' },
  ],
};

export class NarratorService {
  private client: Anthropic | null = null;
  private history: string[] = [];
  private model: string;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private debounceBuffers = new Map<string, string[]>();
  private lastMessageTimes = new Map<string, number>();
  private lastMessageText = '';
  private fallbackIndex = 0;

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
  ): Promise<NarratorMessage | null> {
    const prompt = narratorUserPrompt({
      eventType,
      agentName,
      content: content.slice(0, 500),
      nuggetGoal,
      recentHistory: this.history.slice(-5),
    });

    let msg: NarratorMessage;
    try {
      if (!this.client) {
        this.client = new Anthropic();
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

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
      msg = this.parseResponse(text);
    } catch {
      // Timeout or API error -- use fallback
      msg = this.fallback(eventType, agentName);
    }

    // Dedup: suppress if identical to last message
    if (msg.text === this.lastMessageText) return null;
    this.lastMessageText = msg.text;
    this.history.push(msg.text);
    if (this.history.length > 10) this.history.shift();
    return msg;
  }

  /** Record that a narrator message was emitted for a task (for rate limiting). */
  recordEmission(taskId: string): void {
    this.lastMessageTimes.set(taskId, Date.now());
  }

  /** Accumulate agent_output events and translate after 10s of silence. */
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

      // Rate limit: skip if <15s since last emission for this task
      const lastTime = this.lastMessageTimes.get(taskId) ?? 0;
      if (Date.now() - lastTime < 15000) return;

      const batchText = accumulated.join('\n').slice(0, 1000);
      const msg = await this.translate('agent_output', agentName, batchText, nuggetGoal);
      if (msg) {
        this.lastMessageTimes.set(taskId, Date.now());
        onTranslated(msg);
      }
    }, 10000);

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
    this.lastMessageTimes.delete(taskId);
  }

  reset(): void {
    this.history = [];
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
    this.debounceBuffers.clear();
    this.lastMessageTimes.clear();
    this.lastMessageText = '';
    this.fallbackIndex = 0;
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
    const entries = FALLBACKS[eventType] ?? FALLBACKS.default;
    const entry = entries[this.fallbackIndex++ % entries.length];
    return { text: entry.template.replace('{agent}', agentName), mood: entry.mood };
  }
}
