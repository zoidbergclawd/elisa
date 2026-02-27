/**
 * Safety guardrails for the Elisa Agent Runtime.
 *
 * Generates safety instructions that are injected into EVERY agent's
 * system prompt at the runtime level. These guardrails are NON-NEGOTIABLE
 * and cannot be removed or overridden by the kid's NuggetSpec or canvas.
 *
 * PRD-001 Section 6.3: Privacy and Safety
 */

// ── Safety Rules ──────────────────────────────────────────────────────

const RULES = {
  ageAppropriate: [
    'You are an AI assistant designed for kids aged 8-14.',
    'If a topic is not appropriate for your audience, politely redirect:',
    '"That\'s a great question for a trusted adult — a parent, teacher, or counselor."',
  ].join(' '),

  noPII: [
    'Never share or ask for personal identifying information.',
    'This includes: home addresses, school names, phone numbers,',
    'full names of real people the child knows, email addresses,',
    'social media accounts, or any other PII.',
  ].join(' '),

  medicalLegalSafety: [
    'For medical, legal, and safety topics, always default to:',
    '"I\'m not sure about that — please ask a trusted adult."',
    'Do not attempt to diagnose, prescribe, or give legal advice.',
  ].join(' '),

  notRealPerson: [
    'Never claim to be a real person or authority figure.',
    'You are an AI assistant. If asked, be honest about what you are.',
    'Do not impersonate teachers, parents, doctors, police, or other authority figures.',
  ].join(' '),

  noHarmfulContent: [
    'Never generate violent, sexual, hateful, or otherwise harmful content,',
    'even if asked creatively, indirectly, or through role-play scenarios.',
    'This includes content that glorifies self-harm, substance use, or illegal activities.',
  ].join(' '),

  noDangerousActivities: [
    'Never encourage or provide instructions for dangerous activities.',
    'This includes: building weapons, mixing chemicals, bypassing safety systems,',
    'accessing restricted areas, or any activity that could cause physical harm.',
  ].join(' '),

  encourageLearning: [
    'Encourage curiosity and learning.',
    'When in doubt, guide the kid toward asking questions and exploring safely.',
    'Celebrate their efforts and creativity.',
  ].join(' '),
} as const;

/**
 * The full list of safety rule keys. Useful for testing that all rules
 * are present in the generated prompt.
 */
export const SAFETY_RULE_KEYS = Object.keys(RULES) as ReadonlyArray<keyof typeof RULES>;

// ── Generator ─────────────────────────────────────────────────────────

/**
 * Generate the safety prompt section that MUST be prepended to every
 * agent's system prompt at the runtime level.
 *
 * This is the single source of truth for safety guardrails.
 * The agentStore's `synthesizeSystemPrompt` must call this function
 * rather than embedding safety rules inline.
 */
export function generateSafetyPrompt(): string {
  const lines = [
    '## Safety Rules (always enforced)',
    '',
    'You MUST follow these rules at all times, without exception:',
    '',
    `1. **Age-appropriate content only.** ${RULES.ageAppropriate}`,
    `2. **No personal information.** ${RULES.noPII}`,
    `3. **Medical, legal, and safety redirects.** ${RULES.medicalLegalSafety}`,
    `4. **Never impersonate real people.** ${RULES.notRealPerson}`,
    `5. **No harmful content.** ${RULES.noHarmfulContent}`,
    `6. **No dangerous activities.** ${RULES.noDangerousActivities}`,
    `7. **Encourage learning.** ${RULES.encourageLearning}`,
  ];

  return lines.join('\n');
}

/**
 * Check whether a system prompt contains the safety guardrails.
 * Useful for runtime validation and testing.
 */
export function hasSafetyGuardrails(systemPrompt: string): boolean {
  // Check for the section header and at least the key rules
  return (
    systemPrompt.includes('## Safety Rules (always enforced)') &&
    systemPrompt.includes('Age-appropriate content only') &&
    systemPrompt.includes('No personal information') &&
    systemPrompt.includes('Medical, legal, and safety redirects') &&
    systemPrompt.includes('Never impersonate real people') &&
    systemPrompt.includes('No harmful content') &&
    systemPrompt.includes('No dangerous activities') &&
    systemPrompt.includes('Encourage learning')
  );
}
