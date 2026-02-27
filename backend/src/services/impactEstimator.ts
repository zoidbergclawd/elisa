/** Impact estimator: pre-execution complexity analysis of a NuggetSpec. */

export type Complexity = 'simple' | 'moderate' | 'complex';

export interface ImpactEstimate {
  estimated_tasks: number;
  complexity: Complexity;
  heaviest_requirements: string[];
}

/**
 * Estimates the impact of building a NuggetSpec before execution.
 * Uses count-based heuristics (not ML).
 */
export function estimate(spec: Record<string, unknown>): ImpactEstimate {
  const requirements = Array.isArray(spec.requirements) ? spec.requirements : [];
  const behavioralTests = (spec.workflow as Record<string, unknown> | undefined)?.behavioral_tests;
  const testCount = Array.isArray(behavioralTests) ? behavioralTests.length : 0;
  const devices = Array.isArray(spec.devices) ? spec.devices : [];
  const portals = Array.isArray(spec.portals) ? spec.portals : [];
  const agents = Array.isArray(spec.agents) ? spec.agents : [];
  const feedbackLoops = (spec.workflow as Record<string, unknown> | undefined)?.feedback_loops;
  const loopCount = Array.isArray(feedbackLoops) ? feedbackLoops.length : 0;

  // Base: 1 task per requirement + 1 per device + 1 for testing if tests exist
  const reqTasks = Math.max(requirements.length, 1);
  const deviceTasks = devices.length;
  const testingTask = testCount > 0 ? 1 : 0;
  const portalTasks = portals.length > 0 ? 1 : 0;
  // Review tasks if reviewer agent present
  const reviewerPresent = agents.some(
    (a: Record<string, unknown>) => a.role === 'reviewer',
  );
  const reviewTasks = reviewerPresent ? Math.ceil(reqTasks / 3) : 0;

  const estimated_tasks = reqTasks + deviceTasks + testingTask + portalTasks + reviewTasks;

  // Complexity: based on total weight
  const weight =
    requirements.length * 2 +
    testCount +
    devices.length * 3 +
    portals.length * 2 +
    loopCount * 2 +
    (reviewerPresent ? 2 : 0);

  let complexity: Complexity;
  if (weight <= 6) {
    complexity = 'simple';
  } else if (weight <= 15) {
    complexity = 'moderate';
  } else {
    complexity = 'complex';
  }

  // Find heaviest requirements: those with the longest descriptions
  // or those linked to behavioral tests (they generate more work)
  const testLinkedReqs = new Set<number>();
  if (Array.isArray(behavioralTests)) {
    for (const test of behavioralTests as Array<Record<string, unknown>>) {
      if (typeof test.requirement_id === 'string') {
        const match = test.requirement_id.match(/^req-(\d+)$/);
        if (match) testLinkedReqs.add(parseInt(match[1], 10));
      }
    }
  }

  const heaviest_requirements: string[] = requirements
    .map((r: Record<string, unknown>, i: number) => ({
      description: String(r.description ?? ''),
      index: i,
      weight:
        (String(r.description ?? '').length > 100 ? 2 : 1) +
        (testLinkedReqs.has(i) ? 2 : 0),
    }))
    .sort((a: { weight: number }, b: { weight: number }) => b.weight - a.weight)
    .slice(0, 3)
    .map((r: { description: string }) => r.description)
    .filter((d: string) => d.length > 0);

  return { estimated_tasks, complexity, heaviest_requirements };
}
