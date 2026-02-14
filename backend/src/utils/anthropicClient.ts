/** Singleton factory for the Anthropic SDK client. */

import Anthropic from '@anthropic-ai/sdk';

let instance: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!instance) {
    instance = new Anthropic();
  }
  return instance;
}

/** Reset singleton (for tests). */
export function resetAnthropicClient(): void {
  instance = null;
}
