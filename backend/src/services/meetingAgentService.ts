/** Generates agent responses for meeting conversations using the Anthropic API. */

import Anthropic from '@anthropic-ai/sdk';
import type { MeetingType, MeetingMessage } from '../models/meeting.js';
import { getAnthropicClient } from '../utils/anthropicClient.js';
import { withTimeout } from '../utils/withTimeout.js';
import { MEETING_AGENT_TIMEOUT_MS, MEETING_AGENT_MAX_TOKENS, NARRATOR_MODEL_DEFAULT } from '../utils/constants.js';

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
    'Required fields: title (string -- document title), content (string -- markdown body text), suggestions (array of {id, text} for additional content ideas).',
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
    const systemPrompt = this.buildSystemPrompt(meetingType, buildContext);
    const claudeMessages = this.toClaudeMessages(messages);

    try {
      if (!this.client) {
        this.client = getAnthropicClient();
      }

      const response = await withTimeout(
        this.client.messages.create({
          model: this.model,
          max_tokens: MEETING_AGENT_MAX_TOKENS,
          system: systemPrompt,
          messages: claudeMessages,
        }),
        MEETING_AGENT_TIMEOUT_MS,
      );

      const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
      return this.parseResponse(text);
    } catch (err) {
      console.error('[meetingAgent] generateResponse failed:', err instanceof Error ? err.message : err);
      return { text: "Hmm, let me think about that... Can you ask me again?" };
    }
  }

  private buildSystemPrompt(meetingType: MeetingType, ctx: MeetingBuildContext): string {
    const parts: string[] = [];

    // Persona
    parts.push(`You are ${meetingType.agentName}, a meeting agent in a kids' coding app called Elisa.`);
    parts.push(`Your persona: ${meetingType.persona}`);

    // Build context
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

    // Canvas instructions
    const canvasInstructions = CANVAS_INSTRUCTIONS[meetingType.canvasType];
    if (canvasInstructions) {
      parts.push(`\n## Canvas\n${canvasInstructions}`);
    }

    // Rules
    parts.push('\n## Rules');
    parts.push('- Keep responses to 2-4 sentences. Kids have short attention spans.');
    parts.push('- Use simple, kid-friendly language (ages 8-14).');
    parts.push('- Stay in character as your persona.');
    parts.push('- Be encouraging and excited about their project.');
    parts.push('- Reference specific parts of their build when possible.');

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

  private parseResponse(text: string): AgentResponse {
    // Extract canvas JSON block if present (```canvas or ```json fallback)
    const canvasMatch = text.match(/```canvas\s*\n?([\s\S]*?)\n?```/);
    let canvasUpdate: Record<string, unknown> | undefined;
    let cleanText = text;

    if (canvasMatch) {
      try {
        canvasUpdate = JSON.parse(canvasMatch[1]);
      } catch {
        // Ignore malformed canvas JSON
      }
      cleanText = text.replace(/```canvas\s*\n?[\s\S]*?\n?```/, '').trim();
    }

    // Fallback: if no ```canvas block found, try ```json blocks that look like canvas data
    if (!canvasUpdate) {
      const jsonMatch = text.match(/```json\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          // Only treat as canvas update if it's an object with recognized canvas fields
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const hasCanvasFields = 'scene_title' in parsed || 'title' in parsed ||
              'palette' in parsed || 'elements' in parsed || 'background' in parsed ||
              'tasks' in parsed || 'requirements' in parsed || 'health_score' in parsed ||
              'poster_title' in parsed || 'headline' in parsed || 'template' in parsed ||
              'currentTheme' in parsed || 'provides' in parsed || 'requires' in parsed ||
              'test_name' in parsed || 'content' in parsed || 'suggestions' in parsed;
            if (hasCanvasFields) {
              canvasUpdate = parsed;
              cleanText = text.replace(/```json\s*\n?[\s\S]*?\n?```/, '').trim();
            }
          }
        } catch {
          // Not valid JSON, leave as-is
        }
      }
    }

    return { text: cleanText || text, canvasUpdate };
  }
}
