/** Zod schema for NuggetSpec validation. Caps string lengths and array sizes. */

import { z } from 'zod';

const CapabilitySchema = z.object({
  id: z.string().max(200).optional(),
  name: z.string().max(200).optional(),
  kind: z.string().max(50).optional(),
  description: z.string().max(2000).optional(),
}).passthrough();

const InteractionSchema = z.object({
  type: z.string().max(100).optional(),
  capabilityId: z.string().max(200).optional(),
}).passthrough();

const PortalSchema = z.object({
  name: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  mechanism: z.string().max(50).optional(),
  capabilities: z.array(CapabilitySchema).max(50).optional(),
  interactions: z.array(InteractionSchema).max(50).optional(),
}).passthrough();

const SkillSchema = z.object({
  name: z.string().max(200).optional(),
  category: z.string().max(50).optional(),
  prompt: z.string().max(5000).optional(),
  description: z.string().max(2000).optional(),
}).passthrough();

const RuleSchema = z.object({
  name: z.string().max(200).optional(),
  trigger: z.string().max(100).optional(),
  prompt: z.string().max(5000).optional(),
}).passthrough();

const RequirementSchema = z.object({
  type: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
}).passthrough();

const AgentSchema = z.object({
  name: z.string().max(200).optional(),
  role: z.string().max(50).optional(),
  persona: z.string().max(500).optional(),
  allowed_paths: z.array(z.string().max(200)).max(50).optional(),
  restricted_paths: z.array(z.string().max(200)).max(50).optional(),
}).passthrough();

export const NuggetSpecSchema = z.object({
  nugget: z.object({
    goal: z.string().max(2000).optional(),
    type: z.string().max(100).optional(),
    description: z.string().max(2000).optional(),
  }).passthrough().optional(),
  style: z.object({
    visual: z.string().max(500).nullable().optional(),
    personality: z.string().max(500).nullable().optional(),
    // Legacy fields
    colors: z.string().max(500).optional(),
    theme: z.string().max(500).optional(),
    tone: z.string().max(500).optional(),
  }).passthrough().nullable().optional(),
  requirements: z.array(RequirementSchema).max(50).optional(),
  agents: z.array(AgentSchema).max(20).optional(),
  deployment: z.object({
    target: z.string().max(100).optional(),
  }).passthrough().optional(),
  workflow: z.object({
    human_gates: z.array(z.string().max(200)).max(10).optional(),
    flow_hints: z.array(z.any()).max(50).optional(),
    iteration_conditions: z.array(z.any()).max(20).optional(),
  }).passthrough().optional(),
  skills: z.array(SkillSchema).max(50).optional(),
  rules: z.array(RuleSchema).max(50).optional(),
  portals: z.array(PortalSchema).max(20).optional(),
}).passthrough();
