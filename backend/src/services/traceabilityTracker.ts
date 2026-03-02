/** Traceability tracker: connects requirements to tests and tracks verification status. */

import type { SendEvent } from './phases/types.js';

export type TraceabilityStatus = 'untested' | 'passing' | 'failing';

export interface RequirementTrace {
  requirement_id: string;
  description: string;
  test_id?: string;
  test_name?: string;
  status: TraceabilityStatus;
}

export interface TraceabilityCoverage {
  total_requirements: number;
  tested_requirements: number;
  passing_requirements: number;
  failing_requirements: number;
  untested_requirements: number;
}

export interface TraceabilitySummary {
  coverage: number;
  requirements: RequirementTrace[];
}

interface Requirement {
  type?: string;
  description?: string;
  test_id?: string;
}

interface BehavioralTest {
  id?: string;
  when: string;
  then: string;
  requirement_id?: string;
}

/**
 * Builds a map from requirement -> test -> result at plan time.
 * Updates with results as tests complete.
 * Emits traceability_update events after each test result.
 */
export class TraceabilityTracker {
  private requirements: RequirementTrace[] = [];
  private testToRequirement = new Map<string, string>();
  private requirementIndexById = new Map<string, number>();

  /**
   * Build the traceability map from a NuggetSpec.
   * Call this at plan time with the spec's requirements and behavioral_tests.
   */
  buildMap(
    requirements: Requirement[] | undefined,
    behavioralTests: BehavioralTest[] | undefined,
  ): void {
    this.requirements = [];
    this.testToRequirement.clear();
    this.requirementIndexById.clear();

    if (!requirements || requirements.length === 0) return;

    // Build test lookup by id
    const testById = new Map<string, BehavioralTest>();
    if (behavioralTests) {
      for (const test of behavioralTests) {
        if (test.id) {
          testById.set(test.id, test);
        }
      }
    }

    // Build requirement -> test links from both directions
    for (let i = 0; i < requirements.length; i++) {
      const req = requirements[i];
      const reqId = `req_${i}`;

      const trace: RequirementTrace = {
        requirement_id: reqId,
        description: req.description ?? '',
        status: 'untested',
      };

      // Link via requirement.test_id
      if (req.test_id) {
        trace.test_id = req.test_id;
        const linkedTest = testById.get(req.test_id);
        if (linkedTest) {
          trace.test_name = `When ${linkedTest.when} then ${linkedTest.then}`;
        }
        this.testToRequirement.set(req.test_id, reqId);
      }

      this.requirements.push(trace);
      this.requirementIndexById.set(reqId, i);
    }

    // Link via behavioral_test.requirement_id (reverse direction)
    if (behavioralTests) {
      for (const test of behavioralTests) {
        if (test.requirement_id && test.id) {
          const reqIdx = this.findRequirementIndex(test.requirement_id);
          if (reqIdx !== -1) {
            const trace = this.requirements[reqIdx];
            if (!trace.test_id) {
              trace.test_id = test.id;
              trace.test_name = `When ${test.when} then ${test.then}`;
              this.testToRequirement.set(test.id, trace.requirement_id);
            }
          }
        }
      }
    }
  }

  /**
   * Update traceability status when a test result arrives.
   * Returns the traceability_update event payload if a requirement was linked, or null.
   */
  recordTestResult(
    testName: string,
    passed: boolean,
  ): { requirement_id: string; test_id: string; status: TraceabilityStatus } | null {
    // Try matching by test_id or by test_name substring
    let matchedReqId: string | null = null;

    // Direct test_id lookup
    for (const [testId, reqId] of this.testToRequirement.entries()) {
      if (testName === testId || testName.includes(testId)) {
        matchedReqId = reqId;
        break;
      }
    }

    // Also try matching test name against stored test names
    if (!matchedReqId) {
      for (const trace of this.requirements) {
        if (trace.test_id && testName.includes(trace.test_id)) {
          matchedReqId = trace.requirement_id;
          break;
        }
      }
    }

    if (!matchedReqId) return null;

    const idx = this.requirementIndexById.get(matchedReqId);
    if (idx === undefined) return null;

    const status: TraceabilityStatus = passed ? 'passing' : 'failing';
    this.requirements[idx].status = status;

    return {
      requirement_id: matchedReqId,
      test_id: this.requirements[idx].test_id ?? '',
      status,
    };
  }

  /** Compute coverage statistics. */
  getCoverage(): TraceabilityCoverage {
    const total = this.requirements.length;
    const tested = this.requirements.filter(r => r.status !== 'untested').length;
    const passing = this.requirements.filter(r => r.status === 'passing').length;
    const failing = this.requirements.filter(r => r.status === 'failing').length;
    const untested = this.requirements.filter(r => r.status === 'untested').length;

    return {
      total_requirements: total,
      tested_requirements: tested,
      passing_requirements: passing,
      failing_requirements: failing,
      untested_requirements: untested,
    };
  }

  /** Get the full traceability summary. */
  getSummary(): TraceabilitySummary {
    const coverage = this.getCoverage();
    const pct = coverage.total_requirements > 0
      ? Math.round((coverage.passing_requirements / coverage.total_requirements) * 100)
      : 0;

    return {
      coverage: pct,
      requirements: [...this.requirements],
    };
  }

  /** Check if there are any tracked requirements. */
  hasRequirements(): boolean {
    return this.requirements.length > 0;
  }

  /**
   * Emit traceability events for all test results and then a summary.
   * Called after TestPhase completes.
   */
  async emitSummary(send: SendEvent): Promise<void> {
    if (!this.hasRequirements()) return;

    const summary = this.getSummary();
    await send({
      type: 'traceability_summary',
      coverage: summary.coverage,
      requirements: summary.requirements,
    });
  }

  private findRequirementIndex(requirementId: string): number {
    // Try direct match first
    const direct = this.requirementIndexById.get(requirementId);
    if (direct !== undefined) return direct;

    // Try matching by index suffix (e.g., "req_0" matches requirement at index 0)
    const match = requirementId.match(/^req_(\d+)$/);
    if (match) {
      const idx = parseInt(match[1], 10);
      if (idx >= 0 && idx < this.requirements.length) return idx;
    }

    return -1;
  }
}
