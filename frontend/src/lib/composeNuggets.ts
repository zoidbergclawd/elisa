/**
 * PRD-003 Phase 2: Client-side nugget composition.
 *
 * Merges multiple NuggetSpecs into a single composed spec,
 * with composition metadata for the meta planner.
 */

import type { NuggetSpec } from '../components/BlockCanvas/blockInterpreter';
import type { ComposeRequest } from '../components/BlockCanvas/nuggetInterpreter';

export interface ResolvedNugget {
  id: string;
  name: string;
  spec: NuggetSpec;
}

export interface CompositionPlan {
  /** The merged NuggetSpec ready for build. */
  composedSpec: NuggetSpec;
  /** Human-readable summary of the composition. */
  summary: string;
  /** Nuggets in sequential order per group. */
  groups: Array<{ nuggets: ResolvedNugget[]; mode: 'sequential' }>;
  /** Number of parallel groups. */
  parallelCount: number;
}

/**
 * Compose resolved nuggets according to the spatial arrangement
 * from the composition canvas.
 */
export function composeNuggets(
  request: ComposeRequest,
  resolved: ResolvedNugget[],
): CompositionPlan {
  const nuggetMap = new Map(resolved.map(n => [n.id, n]));

  // Build groups from placements
  const groupMap = new Map<number, ResolvedNugget[]>();
  for (const placement of request.placements) {
    const nugget = nuggetMap.get(placement.nuggetId);
    if (!nugget) continue;
    if (!groupMap.has(placement.group)) {
      groupMap.set(placement.group, []);
    }
    groupMap.get(placement.group)!.push(nugget);
  }

  const groups = Array.from(groupMap.values()).map(nuggets => ({
    nuggets,
    mode: 'sequential' as const,
  }));

  // Merge all specs
  const composedSpec = mergeSpecs(resolved);

  // Add composition context for meta planner
  const groupDescriptions = groups.map((g, i) =>
    `Group ${i + 1}: ${g.nuggets.map(n => n.name).join(' -> ')}`,
  );
  const summary = groups.length > 1
    ? `Parallel composition of ${groups.length} tracks:\n${groupDescriptions.join('\n')}`
    : groups.length === 1
      ? `Sequential composition: ${groups[0].nuggets.map(n => n.name).join(' -> ')}`
      : 'Empty composition';

  // Embed composition context in the goal for meta planner awareness
  if (composedSpec.nugget.goal && groups.length > 0) {
    composedSpec.nugget.description =
      `[Composed from ${resolved.length} nuggets]\n` +
      `${summary}\n\n` +
      `Original goals:\n${resolved.map(n => `- ${n.name}: ${n.spec.nugget.goal}`).join('\n')}`;
  }

  return {
    composedSpec,
    summary,
    groups,
    parallelCount: groups.length,
  };
}

/** Merge multiple NuggetSpecs into one (flatten and concatenate). */
function mergeSpecs(nuggets: ResolvedNugget[]): NuggetSpec {
  const goals = nuggets.map(n => n.name);
  const allSpecs = nuggets.map(n => n.spec);

  const merged: NuggetSpec = {
    nugget: {
      goal: goals.join(' + '),
      description: goals.join(' + '),
      type: 'general',
    },
    requirements: allSpecs.flatMap(s => s.requirements ?? []),
    agents: [],
    deployment: resolveDeployment(allSpecs),
    workflow: {
      review_enabled: allSpecs.some(s => s.workflow?.review_enabled),
      testing_enabled: allSpecs.some(s => s.workflow?.testing_enabled),
      human_gates: [],
      behavioral_tests: allSpecs.flatMap(s => s.workflow?.behavioral_tests ?? []),
    },
  };

  const allSkills = allSpecs.flatMap(s => s.skills ?? []);
  if (allSkills.length > 0) merged.skills = allSkills;

  const allPortals = allSpecs.flatMap(s => s.portals ?? []);
  if (allPortals.length > 0) merged.portals = allPortals;

  const allDevices = allSpecs.flatMap(s => s.devices ?? []);
  if (allDevices.length > 0) merged.devices = allDevices;

  return merged;
}

/** Resolve deployment target from multiple specs, flagging conflicts. */
function resolveDeployment(specs: NuggetSpec[]): NuggetSpec['deployment'] {
  const targets = new Set(specs.map(s => s.deployment?.target).filter(Boolean));
  if (targets.has('both') || (targets.has('web') && targets.has('esp32'))) {
    return { target: 'both', auto_flash: specs.some(s => s.deployment?.auto_flash) };
  }
  if (targets.has('esp32')) {
    return { target: 'esp32', auto_flash: true };
  }
  if (targets.has('web')) {
    return { target: 'web', auto_flash: false };
  }
  return { target: 'preview', auto_flash: false };
}
