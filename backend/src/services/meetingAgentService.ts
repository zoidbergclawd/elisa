/** Generates agent responses for meeting conversations using two parallel Claude API calls:
 *  one for chat text (never JSON) and one for canvas data (always JSON). */

import Anthropic from '@anthropic-ai/sdk';
import type { MeetingType, MeetingMessage } from '../models/meeting.js';
import { getAnthropicClient } from '../utils/anthropicClient.js';
import { withTimeout } from '../utils/withTimeout.js';
import { MEETING_AGENT_TIMEOUT_MS, MEETING_CHAT_MAX_TOKENS, MEETING_CANVAS_MAX_TOKENS, NARRATOR_MODEL_DEFAULT } from '../utils/constants.js';

export interface MeetingBuildContext {
  goal: string;
  requirements: string[];
  tasks: Array<{ id: string; title: string; agent: string; status: string }>;
  agents: Array<{ name: string; role: string }>;
  devices: Array<{ type: string; name: string }>;
  phase: string;
  testsPassing?: number;
  testsTotal?: number;
  healthScore?: number;
  healthGrade?: string;
}

interface AgentResponse {
  text: string;
  canvasUpdate?: Record<string, unknown>;
}

const CANVAS_INSTRUCTIONS: Record<string, string> = {
  blueprint:
    'ALWAYS include a ```canvas JSON block when discussing the build status. ' +
    'Required fields: tasks (array of {id, title, status}), requirements (array of strings), total_tasks (number), tasks_done (number), tests_passing (number), tests_total (number), health_score (number 0-100).',
  'theme-picker':
    'ALWAYS include a ```canvas JSON block when suggesting a theme. ' +
    'Required fields: currentTheme (one of: "default", "forest", "sunset", "pixel").',
  campaign:
    'ALWAYS include a ```canvas JSON block when suggesting creative assets. ' +
    'Required fields: poster_title (string), tagline (string), headline (string for social card), storyboard_panels (array of scene description strings).',
  'explain-it':
    'ALWAYS include a ```canvas JSON block when suggesting documentation content. ' +
    'Required fields: title (string -- document title), content (string -- the COMPLETE markdown body text of the entire document so far, ' +
    'including everything previously written PLUS any new additions; never send just the new paragraph, always send the full accumulated document), ' +
    'suggestions (array of {id, text} for additional content ideas).',
  'launch-pad':
    'ALWAYS include a ```canvas JSON block when suggesting a launch page design. ' +
    'Required fields: template (one of: "hero-features", "centered-minimal", "split-image-text", "full-banner"), headline (string -- project name), description (string -- tagline), primary_color (hex string), accent_color (hex string).',
  'interface-designer':
    'ALWAYS include a ```canvas JSON block when suggesting interface contracts. ' +
    'Required fields: provides (array of {name, type} where type is "data"|"event"|"function"|"stream"), requires (array of {name, type} with same type options).',
  'bug-detective':
    'ALWAYS include a ```canvas JSON block when analyzing a bug. ' +
    'Required fields: test_name (string), when (string -- trigger condition), then_expected (string -- what should happen), then_actual (string -- what actually happened), diagnosis_notes (array of strings with analysis steps).',
  'design-preview':
    'ALWAYS include a ```canvas JSON block with EVERY message so the kid sees the design evolve live. ' +
    'Required fields: scene_title (string), description (string), ' +
    'background (CSS color or gradient, e.g. "#0a0a2e" or "linear-gradient(135deg, #0a0a2e, #1a1a4e)"), ' +
    'palette (array of 3-6 hex color strings), ' +
    'elements (array ordered background-first, then foreground, then UI. Each object has: ' +
    'name (string), description (string), color (hex string from palette), ' +
    'draw (string -- Canvas 2D JavaScript code. Variables: ctx (CanvasRenderingContext2D), w (canvas width), h (canvas height), color (hex string). ' +
    'Use ctx.fillStyle, ctx.beginPath, ctx.arc, ctx.moveTo, ctx.lineTo, ctx.fill, ctx.stroke, ctx.save, ctx.restore, ' +
    'ctx.shadowBlur, ctx.shadowColor, ctx.createLinearGradient, ctx.fillRect, ctx.font, ctx.fillText, etc. ' +
    'Draw the element so it looks like the actual game asset. Background elements fill the canvas; sprites draw at a representative position; UI elements draw at edges.)). ' +
    'Update the canvas with every message so the kid sees their design evolve in real time.',
};

export class MeetingAgentService {
  private client: Anthropic | null = null;
  private model: string;

  constructor(model?: string) {
    this.model = model ?? process.env.NARRATOR_MODEL ?? NARRATOR_MODEL_DEFAULT;
  }

  async generateResponse(
    meetingType: MeetingType,
    messages: MeetingMessage[],
    buildContext: MeetingBuildContext,
  ): Promise<AgentResponse> {
    if (!this.client) {
      this.client = getAnthropicClient();
    }

    const claudeMessages = this.toClaudeMessages(messages);
    const canvasInstructions = CANVAS_INSTRUCTIONS[meetingType.canvasType];

    // Build both calls
    const chatPromise = this.callChat(meetingType, claudeMessages, buildContext);
    const canvasPromise = canvasInstructions
      ? this.callCanvas(meetingType, claudeMessages, buildContext, canvasInstructions)
      : Promise.resolve(undefined);

    // Run in parallel, graceful failure for each
    const [chatResult, canvasResult] = await Promise.allSettled([chatPromise, canvasPromise]);

    const text = chatResult.status === 'fulfilled'
      ? chatResult.value
      : "Hmm, let me think about that... Can you ask me again?";

    if (chatResult.status === 'rejected') {
      console.error('[meetingAgent] chat call failed:', chatResult.reason instanceof Error ? chatResult.reason.message : chatResult.reason);
    }

    const canvasUpdate = canvasResult.status === 'fulfilled'
      ? canvasResult.value
      : undefined;

    if (canvasResult.status === 'rejected') {
      console.error('[meetingAgent] canvas call failed:', canvasResult.reason instanceof Error ? canvasResult.reason.message : canvasResult.reason);
    }

    return { text, canvasUpdate };
  }

  private async callChat(
    meetingType: MeetingType,
    claudeMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
    ctx: MeetingBuildContext,
  ): Promise<string> {
    const systemPrompt = this.buildChatSystemPrompt(meetingType, ctx);

    const response = await withTimeout(
      this.client!.messages.create({
        model: this.model,
        max_tokens: MEETING_CHAT_MAX_TOKENS,
        system: systemPrompt,
        messages: claudeMessages,
      }),
      MEETING_AGENT_TIMEOUT_MS,
    );

    return response.content[0]?.type === 'text' ? response.content[0].text : '';
  }

  private async callCanvas(
    meetingType: MeetingType,
    claudeMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
    ctx: MeetingBuildContext,
    canvasInstructions: string,
  ): Promise<Record<string, unknown> | undefined> {
    const systemPrompt = this.buildCanvasSystemPrompt(meetingType, ctx, canvasInstructions);

    const response = await withTimeout(
      this.client!.messages.create({
        model: this.model,
        max_tokens: MEETING_CANVAS_MAX_TOKENS,
        system: systemPrompt,
        messages: claudeMessages,
      }),
      MEETING_AGENT_TIMEOUT_MS,
    );

    const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
    return this.parseCanvasResponse(raw);
  }

  private buildChatSystemPrompt(meetingType: MeetingType, ctx: MeetingBuildContext): string {
    const parts: string[] = [];

    parts.push(`You are ${meetingType.agentName}, a meeting agent in a kids' coding app called Elisa.`);
    parts.push(`Your persona: ${meetingType.persona}`);

    parts.push('\n## Current Build Context');
    parts.push(`Goal: ${ctx.goal || 'Not set yet'}`);
    parts.push(`Phase: ${ctx.phase}`);

    if (ctx.requirements.length > 0) {
      parts.push(`Requirements: ${ctx.requirements.slice(0, 5).join('; ')}`);
    }

    if (ctx.tasks.length > 0) {
      const taskList = ctx.tasks.slice(0, 8).map(t =>
        `- ${t.title} (${t.agent}, ${t.status})`
      ).join('\n');
      parts.push(`Tasks:\n${taskList}`);
    }

    if (ctx.agents.length > 0) {
      parts.push(`Agents: ${ctx.agents.map(a => `${a.name} (${a.role})`).join(', ')}`);
    }

    if (ctx.devices.length > 0) {
      parts.push(`Devices: ${ctx.devices.map(d => `${d.name} (${d.type})`).join(', ')}`);
    }

    parts.push('\n## Rules');
    parts.push('- Keep responses to 2-4 sentences. Kids have short attention spans.');
    parts.push('- Use simple, kid-friendly language (ages 8-14).');
    parts.push('- Stay in character as your persona.');
    parts.push('- Be encouraging and excited about their project.');
    parts.push('- Reference specific parts of their build when possible.');
    parts.push('- NEVER output JSON, code blocks, structured data, or backtick-fenced content. Plain conversational text ONLY.');

    return parts.join('\n');
  }

  private buildCanvasSystemPrompt(
    meetingType: MeetingType,
    ctx: MeetingBuildContext,
    canvasInstructions: string,
  ): string {
    const parts: string[] = [];

    parts.push(`You are generating canvas data for ${meetingType.agentName} in a kids' coding app.`);

    parts.push('\n## Build Context');
    parts.push(`Goal: ${ctx.goal || 'Not set yet'}`);
    parts.push(`Phase: ${ctx.phase}`);

    if (ctx.requirements.length > 0) {
      parts.push(`Requirements: ${ctx.requirements.slice(0, 5).join('; ')}`);
    }

    if (ctx.tasks.length > 0) {
      const taskList = ctx.tasks.slice(0, 8).map(t =>
        `- ${t.title} (${t.agent}, ${t.status})`
      ).join('\n');
      parts.push(`Tasks:\n${taskList}`);
    }

    parts.push('\n## Canvas Schema');
    parts.push(canvasInstructions);

    parts.push('\n## Output Format');
    parts.push('Output ONLY a valid JSON object. No markdown, no code fences, no explanation text. Just the raw JSON object.');

    return parts.join('\n');
  }

  private toClaudeMessages(messages: MeetingMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
    const result: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    for (const m of messages) {
      const role = m.role === 'kid' ? 'user' as const : 'assistant' as const;

      // Merge consecutive same-role messages (Claude API rejects them)
      if (result.length > 0 && result[result.length - 1].role === role) {
        result[result.length - 1].content += '\n' + m.content;
        continue;
      }

      result.push({ role, content: m.content });
    }

    // Claude API requires first message to be 'user' role
    if (result.length > 0 && result[0].role === 'assistant') {
      result.unshift({ role: 'user', content: '[Meeting started]' });
    }

    // If messages array was empty, provide a default user message
    if (result.length === 0) {
      result.push({ role: 'user', content: '[Meeting started]' });
    }

    return result;
  }

  /**
   * Parse the canvas call response: strip accidental fencing, try JSON.parse,
   * fallback sanitizeJsonStrings for literal newlines in draw code.
   */
  private parseCanvasResponse(raw: string): Record<string, unknown> | undefined {
    if (!raw.trim()) return undefined;

    // Strip accidental code fencing the model might add despite instructions
    let cleaned = raw.trim();
    const fenceMatch = cleaned.match(/^```(?:json|canvas)?\s*\n?([\s\S]*?)\n?```$/);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }

    // First attempt: direct parse
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // Fall through to sanitized parse
    }

    // Second attempt: fix literal newlines inside JSON string values (draw code)
    try {
      const sanitized = this.sanitizeJsonStrings(cleaned);
      const parsed = JSON.parse(sanitized);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // Give up
    }

    return undefined;
  }

  /**
   * Fix literal newlines inside JSON string values.
   * LLMs often output multi-line strings without proper \n escaping.
   */
  private sanitizeJsonStrings(text: string): string {
    let result = '';
    let inString = false;
    let escaped = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (escaped) {
        result += ch;
        escaped = false;
        continue;
      }

      if (ch === '\\' && inString) {
        result += ch;
        escaped = true;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        result += ch;
        continue;
      }

      if (inString && ch === '\n') {
        result += '\\n';
        continue;
      }
      if (inString && ch === '\r') {
        continue; // skip CR
      }

      result += ch;
    }

    return result;
  }
}
