import { describe, it, expect, vi } from 'vitest';
import { TraceabilityTracker } from '../services/traceabilityTracker.js';
import type { SendEvent } from '../services/phases/types.js';

describe('TraceabilityTracker', () => {
  describe('buildMap', () => {
    it('starts empty with no requirements', () => {
      const tracker = new TraceabilityTracker();
      tracker.buildMap(undefined, undefined);
      expect(tracker.hasRequirements()).toBe(false);
      expect(tracker.getCoverage().total_requirements).toBe(0);
    });

    it('builds map from requirements with test_id links', () => {
      const tracker = new TraceabilityTracker();
      tracker.buildMap(
        [
          { description: 'Login should work', test_id: 'test-login' },
          { description: 'Signup should work', test_id: 'test-signup' },
        ],
        [
          { id: 'test-login', when: 'user logs in', then: 'they see dashboard' },
          { id: 'test-signup', when: 'user signs up', then: 'they see welcome' },
        ],
      );

      expect(tracker.hasRequirements()).toBe(true);
      const summary = tracker.getSummary();
      expect(summary.requirements).toHaveLength(2);
      expect(summary.requirements[0].requirement_id).toBe('req_0');
      expect(summary.requirements[0].description).toBe('Login should work');
      expect(summary.requirements[0].test_id).toBe('test-login');
      expect(summary.requirements[0].test_name).toBe('When user logs in then they see dashboard');
      expect(summary.requirements[0].status).toBe('untested');
    });

    it('links via behavioral_test.requirement_id (reverse)', () => {
      const tracker = new TraceabilityTracker();
      tracker.buildMap(
        [{ description: 'Must validate email' }],
        [{ id: 'test-email', when: 'invalid email entered', then: 'error shown', requirement_id: 'req_0' }],
      );

      const summary = tracker.getSummary();
      expect(summary.requirements[0].test_id).toBe('test-email');
      expect(summary.requirements[0].test_name).toContain('invalid email entered');
    });

    it('handles requirements with no test links', () => {
      const tracker = new TraceabilityTracker();
      tracker.buildMap(
        [
          { description: 'Looks good' },
          { description: 'Works well', test_id: 'test-works' },
        ],
        [{ id: 'test-works', when: 'used', then: 'works' }],
      );

      const summary = tracker.getSummary();
      expect(summary.requirements[0].test_id).toBeUndefined();
      expect(summary.requirements[0].status).toBe('untested');
      expect(summary.requirements[1].test_id).toBe('test-works');
    });

    it('handles empty requirements array', () => {
      const tracker = new TraceabilityTracker();
      tracker.buildMap([], []);
      expect(tracker.hasRequirements()).toBe(false);
    });
  });

  describe('recordTestResult', () => {
    it('updates requirement status to passing on test pass', () => {
      const tracker = new TraceabilityTracker();
      tracker.buildMap(
        [{ description: 'Login works', test_id: 'test-login' }],
        [{ id: 'test-login', when: 'login', then: 'success' }],
      );

      const update = tracker.recordTestResult('test-login', true);
      expect(update).not.toBeNull();
      expect(update!.requirement_id).toBe('req_0');
      expect(update!.status).toBe('passing');

      const summary = tracker.getSummary();
      expect(summary.requirements[0].status).toBe('passing');
    });

    it('updates requirement status to failing on test fail', () => {
      const tracker = new TraceabilityTracker();
      tracker.buildMap(
        [{ description: 'Login works', test_id: 'test-login' }],
        [{ id: 'test-login', when: 'login', then: 'success' }],
      );

      const update = tracker.recordTestResult('test-login', false);
      expect(update).not.toBeNull();
      expect(update!.status).toBe('failing');
    });

    it('returns null for unlinked test names', () => {
      const tracker = new TraceabilityTracker();
      tracker.buildMap(
        [{ description: 'Login works', test_id: 'test-login' }],
        [{ id: 'test-login', when: 'login', then: 'success' }],
      );

      const update = tracker.recordTestResult('test-something-else', true);
      expect(update).toBeNull();
    });

    it('matches test names that contain the test_id', () => {
      const tracker = new TraceabilityTracker();
      tracker.buildMap(
        [{ description: 'Login works', test_id: 'test-login' }],
        [{ id: 'test-login', when: 'login', then: 'success' }],
      );

      const update = tracker.recordTestResult('tests/auth/test-login.py::test_login_pass', true);
      expect(update).not.toBeNull();
      expect(update!.requirement_id).toBe('req_0');
    });
  });

  describe('getCoverage', () => {
    it('computes correct coverage statistics', () => {
      const tracker = new TraceabilityTracker();
      tracker.buildMap(
        [
          { description: 'Req A', test_id: 'test-a' },
          { description: 'Req B', test_id: 'test-b' },
          { description: 'Req C' },
        ],
        [
          { id: 'test-a', when: 'a', then: 'works' },
          { id: 'test-b', when: 'b', then: 'works' },
        ],
      );

      tracker.recordTestResult('test-a', true);
      tracker.recordTestResult('test-b', false);

      const coverage = tracker.getCoverage();
      expect(coverage.total_requirements).toBe(3);
      expect(coverage.tested_requirements).toBe(2);
      expect(coverage.passing_requirements).toBe(1);
      expect(coverage.failing_requirements).toBe(1);
      expect(coverage.untested_requirements).toBe(1);
    });

    it('returns all zeros for no requirements', () => {
      const tracker = new TraceabilityTracker();
      tracker.buildMap(undefined, undefined);
      const coverage = tracker.getCoverage();
      expect(coverage.total_requirements).toBe(0);
      expect(coverage.tested_requirements).toBe(0);
    });
  });

  describe('getSummary', () => {
    it('computes coverage percentage', () => {
      const tracker = new TraceabilityTracker();
      tracker.buildMap(
        [
          { description: 'Req A', test_id: 'test-a' },
          { description: 'Req B', test_id: 'test-b' },
        ],
        [
          { id: 'test-a', when: 'a', then: 'works' },
          { id: 'test-b', when: 'b', then: 'works' },
        ],
      );

      tracker.recordTestResult('test-a', true);
      tracker.recordTestResult('test-b', true);

      const summary = tracker.getSummary();
      expect(summary.coverage).toBe(100);
      expect(summary.requirements).toHaveLength(2);
    });

    it('returns 0 coverage when nothing passes', () => {
      const tracker = new TraceabilityTracker();
      tracker.buildMap(
        [{ description: 'Req A', test_id: 'test-a' }],
        [{ id: 'test-a', when: 'a', then: 'works' }],
      );

      const summary = tracker.getSummary();
      expect(summary.coverage).toBe(0);
    });
  });

  describe('emitSummary', () => {
    it('emits traceability_summary event', async () => {
      const tracker = new TraceabilityTracker();
      tracker.buildMap(
        [{ description: 'Req A', test_id: 'test-a' }],
        [{ id: 'test-a', when: 'a', then: 'works' }],
      );

      tracker.recordTestResult('test-a', true);

      const send = vi.fn<SendEvent>();
      await tracker.emitSummary(send);

      expect(send).toHaveBeenCalledTimes(1);
      const event = send.mock.calls[0][0] as any;
      expect(event.type).toBe('traceability_summary');
      expect(event.coverage).toBe(100);
      expect(event.requirements).toHaveLength(1);
      expect(event.requirements[0].status).toBe('passing');
    });

    it('does not emit when no requirements exist', async () => {
      const tracker = new TraceabilityTracker();
      tracker.buildMap(undefined, undefined);

      const send = vi.fn<SendEvent>();
      await tracker.emitSummary(send);

      expect(send).not.toHaveBeenCalled();
    });
  });
});
