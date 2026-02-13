import type { Skill, Rule } from '../components/Skills/types';

export interface SkillTemplate extends Omit<Skill, 'workspace'> {
  description: string;
  tags: string[];
}

export interface RuleTemplate extends Rule {
  description: string;
  tags: string[];
}

export const SKILL_TEMPLATES: SkillTemplate[] = [
  {
    id: 'tmpl-explain-everything',
    name: 'Explain everything',
    prompt: 'After writing each piece of code, add a short comment explaining what it does in simple words. Explain your reasoning step by step.',
    category: 'agent',
    description: 'Agent explains each step in simple words.',
    tags: ['beginner', 'learning'],
  },
  {
    id: 'tmpl-kid-friendly-code',
    name: 'Kid-friendly code',
    prompt: 'Use simple variable names like "score" and "speed" instead of abbreviations. Add lots of comments. Keep functions short. No clever tricks.',
    category: 'agent',
    description: 'Simple names, lots of comments, no clever tricks.',
    tags: ['beginner', 'readability'],
  },
  {
    id: 'tmpl-game-mechanics',
    name: 'Detailed game mechanics',
    prompt: 'Implement proper physics with velocity and acceleration. Add collision detection using bounding boxes. Include a scoring system that rewards skill. Add difficulty progression over time.',
    category: 'feature',
    description: 'Physics, collision, scoring, and difficulty progression.',
    tags: ['game', 'advanced'],
  },
  {
    id: 'tmpl-responsive-layout',
    name: 'Responsive layout',
    prompt: 'Use a mobile-first approach. Use CSS flexbox or grid for layout. Make sure the page looks good on phones (320px), tablets (768px), and desktops (1024px+). Use relative units like rem and %.',
    category: 'feature',
    description: 'Mobile-first layout with flexbox/grid.',
    tags: ['web', 'responsive'],
  },
  {
    id: 'tmpl-accessibility',
    name: 'Accessibility first',
    prompt: 'Add ARIA labels to all interactive elements. Ensure full keyboard navigation. Use semantic HTML (nav, main, article). Maintain color contrast ratio of at least 4.5:1.',
    category: 'feature',
    description: 'ARIA labels, keyboard nav, semantic HTML.',
    tags: ['web', 'a11y'],
  },
  {
    id: 'tmpl-dark-mode',
    name: 'Dark mode',
    prompt: 'Use a dark background (#1a1a2e or similar). Use light text colors. Accent colors should be vibrant but not harsh. Add subtle shadows and borders for depth.',
    category: 'style',
    description: 'Dark backgrounds with vibrant accent colors.',
    tags: ['style', 'dark'],
  },
  {
    id: 'tmpl-pixel-art',
    name: 'Pixel art',
    prompt: 'Use a retro 8-bit aesthetic. Choose a limited color palette (16 colors max). Use pixel-style fonts like "Press Start 2P". Avoid anti-aliasing and smooth gradients.',
    category: 'style',
    description: 'Retro 8-bit aesthetic with limited palette.',
    tags: ['style', 'retro', 'game'],
  },
];

export const RULE_TEMPLATES: RuleTemplate[] = [
  {
    id: 'tmpl-always-comments',
    name: 'Always add comments',
    prompt: 'Add a comment above every function and class explaining what it does. Use plain language a beginner can understand.',
    trigger: 'always',
    description: 'Comment every function in plain language.',
    tags: ['readability', 'beginner'],
  },
  {
    id: 'tmpl-test-every-feature',
    name: 'Test every feature',
    prompt: 'Write at least one test for every feature. Tests should check the happy path and at least one error case.',
    trigger: 'always',
    description: 'Minimum one test per feature.',
    tags: ['testing', 'quality'],
  },
  {
    id: 'tmpl-no-console-log',
    name: 'No console.log',
    prompt: 'Remove all console.log, console.debug, and console.warn statements before finishing. Only console.error is allowed.',
    trigger: 'on_task_complete',
    description: 'Remove debug logs before finishing.',
    tags: ['cleanup', 'production'],
  },
  {
    id: 'tmpl-check-broken-links',
    name: 'Check for broken links',
    prompt: 'Verify all links and image sources point to valid URLs. Check that internal navigation works. Fix any 404 references.',
    trigger: 'on_task_complete',
    description: 'Verify all links and image sources work.',
    tags: ['web', 'quality'],
  },
  {
    id: 'tmpl-fix-one-thing',
    name: 'Fix one thing at a time',
    prompt: 'When a test fails, only fix the specific failing test. Do not refactor or change other code at the same time. Make the smallest change possible.',
    trigger: 'on_test_fail',
    description: 'Focused minimal fixes, no refactoring.',
    tags: ['testing', 'discipline'],
  },
  {
    id: 'tmpl-read-error-first',
    name: 'Read the error first',
    prompt: 'Before changing any code, read the full error message and stack trace. Identify the exact file and line number. Explain what the error means before attempting a fix.',
    trigger: 'on_test_fail',
    description: 'Analyze error message before changing code.',
    tags: ['testing', 'debugging'],
  },
  {
    id: 'tmpl-must-compile',
    name: 'Must compile cleanly',
    prompt: 'The code must compile or parse without any errors or warnings. Run a syntax check before deploying. Fix all linter warnings.',
    trigger: 'before_deploy',
    description: 'No errors or warnings before deploy.',
    tags: ['quality', 'deploy'],
  },
  {
    id: 'tmpl-all-tests-pass',
    name: 'All tests must pass',
    prompt: 'Every test in the test suite must pass before deploying. If any test fails, fix it before proceeding. Do not skip or disable tests.',
    trigger: 'before_deploy',
    description: 'Green test suite required before deploy.',
    tags: ['testing', 'deploy'],
  },
];
