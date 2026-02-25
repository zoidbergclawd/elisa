/** Validator for OpenClaw SKILL.md frontmatter.
 *
 * Ref: https://docs.openclaw.ai/tools/skills
 *
 * Rules:
 * - name and description are required
 * - metadata must be a JSON object (parsed, not raw string by this point)
 * - primaryEnv must exist in requires.env
 * - name should be kebab-case (warning, not error)
 * - String length caps: name 200, description 2000
 */

import { z } from 'zod';

// --- Types ---

export interface SkillFrontmatter {
  name: string;
  description: string;
  'user-invocable'?: boolean;
  'disable-model-invocation'?: boolean;
  homepage?: string;
  'command-dispatch'?: string;
  'command-tool'?: string;
  'command-arg-mode'?: string;
  metadata?: {
    openclaw?: {
      emoji?: string;
      homepage?: string;
      skillKey?: string;
      always?: boolean;
      os?: string[];
      requires?: {
        bins?: string[];
        anyBins?: string[];
        env?: string[];
        config?: string[];
      };
      primaryEnv?: string;
      install?: unknown[];
    };
  };
}

export interface SkillValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ParsedSkillMd {
  frontmatter: SkillFrontmatter;
  body: string;
  error?: string;
}

export interface TokenCostEstimate {
  totalChars: number;
  estimatedTokens: number;
  skillCount: number;
}

// --- Zod schema for frontmatter ---

const OpenClawRequiresSchema = z.object({
  bins: z.array(z.string().max(200)).max(50).optional(),
  anyBins: z.array(z.string().max(200)).max(50).optional(),
  env: z.array(z.string().max(200)).max(50).optional(),
  config: z.array(z.string().max(500)).max(50).optional(),
}).strict().optional();

const OpenClawMetadataSchema = z.object({
  emoji: z.string().max(20).optional(),
  homepage: z.string().max(500).optional(),
  skillKey: z.string().max(200).optional(),
  always: z.boolean().optional(),
  os: z.array(z.enum(['darwin', 'linux', 'win32'])).optional(),
  requires: OpenClawRequiresSchema,
  primaryEnv: z.string().max(200).optional(),
  install: z.array(z.unknown()).max(20).optional(),
}).strict().optional();

export const SkillFrontmatterSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  'user-invocable': z.boolean().optional(),
  'disable-model-invocation': z.boolean().optional(),
  homepage: z.string().max(500).optional(),
  'command-dispatch': z.string().max(50).optional(),
  'command-tool': z.string().max(200).optional(),
  'command-arg-mode': z.string().max(50).optional(),
  metadata: z.object({
    openclaw: OpenClawMetadataSchema,
  }).strict().optional(),
});

// --- Parse ---

export function parseSkillMd(content: string): ParsedSkillMd {
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') {
    return { frontmatter: {} as SkillFrontmatter, body: '', error: 'Missing frontmatter delimiters (must start with ---)' };
  }
  const endIdx = lines.indexOf('---', 1);
  if (endIdx === -1) {
    return { frontmatter: {} as SkillFrontmatter, body: '', error: 'Missing closing frontmatter delimiter (---)' };
  }

  const fmLines = lines.slice(1, endIdx);
  if (fmLines.every(l => l.trim() === '')) {
    return { frontmatter: {} as SkillFrontmatter, body: '', error: 'Frontmatter is empty' };
  }

  const fm: Record<string, unknown> = {};
  for (const line of fmLines) {
    if (line.trim() === '') continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value: unknown = line.slice(colonIdx + 1).trim();

    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (typeof value === 'string' && value.startsWith('{')) {
      try { value = JSON.parse(value); } catch { /* keep as string */ }
    }

    fm[key] = value;
  }

  const body = lines.slice(endIdx + 1).join('\n').trim();
  return { frontmatter: fm as SkillFrontmatter, body };
}

// --- Validate ---

export function validateSkillFrontmatter(fm: SkillFrontmatter): SkillValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const zodResult = SkillFrontmatterSchema.safeParse(fm);
  if (!zodResult.success) {
    for (const issue of zodResult.error.issues) {
      const path = issue.path.join('.');
      errors.push(`${path || 'root'}: ${issue.message}`);
    }
    return { valid: false, errors, warnings };
  }

  const oc = fm.metadata?.openclaw;
  if (oc?.primaryEnv && oc.requires?.env) {
    if (!oc.requires.env.includes(oc.primaryEnv)) {
      errors.push(`primaryEnv "${oc.primaryEnv}" is not listed in requires.env [${oc.requires.env.join(', ')}]`);
    }
  } else if (oc?.primaryEnv && !oc.requires?.env) {
    errors.push(`primaryEnv "${oc.primaryEnv}" set but requires.env is missing`);
  }

  if (fm.name && /\s/.test(fm.name)) {
    warnings.push(`name "${fm.name}" contains spaces — use kebab-case (e.g., "my-skill")`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

// --- Token cost estimate ---

export function estimateTokenCost(
  skills: Array<{ name: string; description: string; location: string }>,
): TokenCostEstimate {
  let totalChars = 195;
  for (const skill of skills) {
    totalChars += 97 + skill.name.length + skill.description.length + skill.location.length;
  }
  return {
    totalChars,
    estimatedTokens: Math.ceil(totalChars / 4),
    skillCount: skills.length,
  };
}

// --- Serialize frontmatter to SKILL.md string ---

export function serializeSkillMd(fm: SkillFrontmatter, body: string): string {
  const lines: string[] = ['---'];
  lines.push(`name: ${fm.name}`);
  lines.push(`description: ${fm.description}`);
  if (fm['user-invocable'] !== undefined) {
    lines.push(`user-invocable: ${fm['user-invocable']}`);
  }
  if (fm['disable-model-invocation'] !== undefined) {
    lines.push(`disable-model-invocation: ${fm['disable-model-invocation']}`);
  }
  if (fm.homepage) lines.push(`homepage: ${fm.homepage}`);
  if (fm.metadata) {
    lines.push(`metadata: ${JSON.stringify(fm.metadata)}`);
  }
  lines.push('---');
  lines.push('');
  lines.push(body);
  return lines.join('\n');
}
