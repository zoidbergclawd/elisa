/** Test phase: runs test suite and reports results. */

import type { PhaseContext } from './types.js';
import { TeachingEngine } from '../teachingEngine.js';
import { TestRunner } from '../testRunner.js';

export interface TestResult {
  testResults: Record<string, any>;
}

export class TestPhase {
  private testRunner: TestRunner;
  private teachingEngine: TeachingEngine;

  constructor(testRunner: TestRunner, teachingEngine: TeachingEngine) {
    this.testRunner = testRunner;
    this.teachingEngine = teachingEngine;
  }

  async execute(ctx: PhaseContext): Promise<TestResult> {
    ctx.session.state = 'testing';
    ctx.logger?.phase('testing');
    const results = await this.testRunner.runTests(ctx.nuggetDir);
    ctx.logger?.testResults(
      results.passed ?? 0,
      results.failed ?? 0,
      results.total ?? 0,
      results.coverage_pct ?? undefined,
    );

    for (const test of results.tests ?? []) {
      await ctx.send({
        type: 'test_result',
        test_name: test.test_name,
        passed: test.passed,
        details: test.details,
      });
    }

    if (results.coverage_pct != null) {
      await ctx.send({
        type: 'coverage_update',
        percentage: results.coverage_pct,
        details: results.coverage_details ?? {},
      });
      await this.maybeTeach(ctx, 'coverage_update', `${results.coverage_pct}% coverage`);
    }

    if (results.total > 0) {
      const summary = `${results.passed}/${results.total} tests passing`;
      const eventType = results.failed === 0 ? 'test_result_pass' : 'test_result_fail';
      await this.maybeTeach(ctx, eventType, summary);
    }

    return { testResults: results };
  }

  private async maybeTeach(
    ctx: PhaseContext,
    eventType: string,
    eventDetails: string,
  ): Promise<void> {
    const moment = await this.teachingEngine.getMoment(
      eventType,
      eventDetails,
      ctx.nuggetType,
    );
    if (moment) {
      await ctx.send({ type: 'teaching_moment', ...moment });
    }
  }
}
