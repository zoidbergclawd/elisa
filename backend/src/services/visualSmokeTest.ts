/** Visual smoke test: sends a screenshot to a vision model for verification. */

import { getAnthropicClient } from '../utils/anthropicClient.js';
import { withTimeout } from '../utils/withTimeout.js';
import { NARRATOR_MODEL_DEFAULT } from '../utils/constants.js';

export interface VisualTestResult {
  passed: boolean;
  summary: string;
  issues: string[];
}

const VISUAL_TEST_TIMEOUT_MS = 30_000;

/**
 * Analyze a base64 PNG screenshot against the nugget goal and requirements.
 * Returns a structured verdict with issues list.
 */
export async function analyzeScreenshot(
  base64: string,
  goal: string,
  requirements: string[] = [],
): Promise<VisualTestResult> {
  const model = process.env.NARRATOR_MODEL || NARRATOR_MODEL_DEFAULT;

  const requirementsText = requirements.length > 0
    ? `\n\nRequirements to verify:\n${requirements.map(r => `- ${r}`).join('\n')}`
    : '';

  const prompt = `You are a visual QA tester for a kid's coding project.

The project goal: ${goal}${requirementsText}

Look at this screenshot and determine:
1. Does the page render correctly (not blank, not just a black screen)?
2. Are there visible UI elements or graphics matching the goal?
3. Are there any obvious visual issues?

A title screen, menu screen, or "Press to Start" screen counts as PASSING --
it means the game loaded correctly and is waiting for user input.
Only fail if the screen is completely blank, all black, shows an error,
or shows a browser default page with no game content.

Respond with ONLY a JSON object (no markdown fencing):
{"passed": true/false, "summary": "one sentence", "issues": ["issue1", "issue2"]}`;

  try {
    const client = getAnthropicClient();
    const response = await withTimeout(
      client.messages.create({
        model,
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: base64 },
            },
            { type: 'text', text: prompt },
          ],
        }],
      }),
      VISUAL_TEST_TIMEOUT_MS,
    );

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('');

    return parseResponse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      passed: false,
      summary: `Visual test failed: ${message}`,
      issues: [message],
    };
  }
}

function parseResponse(text: string): VisualTestResult {
  try {
    let cleaned = text.trim();
    // Strip markdown code fences (models often add them despite instructions)
    const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }
    const parsed = JSON.parse(cleaned);
    return {
      passed: !!parsed.passed,
      summary: String(parsed.summary ?? ''),
      issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
    };
  } catch {
    // Malformed JSON -- treat as a failure with the raw text as summary
    return {
      passed: false,
      summary: text.slice(0, 200),
      issues: ['Could not parse vision model response'],
    };
  }
}
