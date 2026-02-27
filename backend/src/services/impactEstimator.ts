/** Impact estimator: pre-execution complexity analysis of a NuggetSpec. */

export type Complexity = 'simple' | 'moderate' | 'complex';

export interface RequirementDetail {
  description: string;
  estimated_task_count: number;
  test_linked: boolean;
  weight: number;
  dependents: number;
}

export interface ImpactEstimate {
  estimated_tasks: number;
  complexity: Complexity;
  heaviest_requirements: string[];
  requirement_details: RequirementDetail[];
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

  // Build per-requirement detail records
  const reqDetails: Array<{
    description: string;
    index: number;
    weight: number;
    testLinked: boolean;
    taskCount: number;
    dependents: number;
  }> = requirements.map((r: Record<string, unknown>, i: number) => {
    const desc = String(r.description ?? '');
    const testLinked = testLinkedReqs.has(i);
    const weight =
      (desc.length > 100 ? 2 : 1) + (testLinked ? 2 : 0);
    // Each requirement generates 1 base task, plus a review task share if reviewer is present
    const taskCount = 1 + (reviewerPresent ? 1 / requirements.length : 0);
    // Dependents: how many other requirements reference this one's outputs
    // Approximate via test linkage count (test-linked reqs are depended on more)
    const dependents = testLinked
      ? Math.min(requirements.length - 1, 3)
      : 0;
    return { description: desc, index: i, weight, testLinked, taskCount, dependents };
  });

  const heaviest_requirements: string[] = [...reqDetails]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((r) => r.description)
    .filter((d: string) => d.length > 0);

  const requirement_details: RequirementDetail[] = reqDetails.map((r) => ({
    description: r.description,
    estimated_task_count: Math.round(r.taskCount),
    test_linked: r.testLinked,
    weight: r.weight,
    dependents: r.dependents,
  }));

  return { estimated_tasks, complexity, heaviest_requirements, requirement_details };
}
