/**
 * Auto test matcher: at Explorer level, auto-generates behavioral tests
 * for when_then, feature, and data requirements that have no test_id.
 *
 * This runs before the spec is passed to MetaPlanner so the tester agent
 * knows to verify these behaviors.
 */

import type { SendEvent } from './phases/types.js';
import type { NuggetSpec } from '../utils/specValidator.js';
import { getLevel, shouldAutoMatchTests } from './systemLevelService.js';

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
 * Inspect the spec and auto-generate behavioral tests for unmatched when_then
 * requirements. Mutates the spec in place. Only runs at Explorer level.
 *
 * Returns the number of tests generated.
 */
export async function autoMatchTests(
  spec: NuggetSpec,
  send: SendEvent,
): Promise<number> {
  const level = getLevel(spec);
  if (!shouldAutoMatchTests(level)) return 0;

  const requirements = spec.requirements as Requirement[] | undefined;
  if (!requirements || !Array.isArray(requirements)) return 0;

  const workflow = (spec.workflow ?? {}) as Record<string, unknown>;
  let behavioralTests = (workflow.behavioral_tests ?? []) as BehavioralTest[];
  if (!Array.isArray(behavioralTests)) behavioralTests = [];

  // Collect existing test_ids and requirement_ids that are already covered
  const coveredReqIds = new Set<string>();
  for (const test of behavioralTests) {
    if (test.requirement_id) coveredReqIds.add(test.requirement_id);
  }

  let generated = 0;

  const TESTABLE_TYPES = new Set(['when_then', 'feature', 'data']);

  for (let i = 0; i < requirements.length; i++) {
    const req = requirements[i];
    if (!TESTABLE_TYPES.has(req.type ?? '')) continue;
    if (req.test_id) continue; // already has a manually-assigned test

    const reqId = `req_${i}`;
    if (coveredReqIds.has(reqId)) continue; // already covered by an existing test

    const desc = req.description ?? '';
    let when: string;
    let then: string;

    if (req.type === 'when_then') {
      // Parse the description: "When X happens, Y should happen"
      const match = desc.match(/^When\s+(.+?)\s+happens?,\s+(.+?)\s+should\s+happen$/i);
      if (match) {
        when = match[1];
        then = match[2];
      } else {
        when = desc;
        then = 'it works as expected';
      }
    } else if (req.type === 'feature') {
      when = `the user uses the feature: ${desc}`;
      then = `${desc} works correctly`;
    } else {
      // data type
      when = `data is accessed: ${desc}`;
      then = `${desc} is stored and retrievable`;
    }

    const testId = `auto_test_${i}`;
    behavioralTests.push({
      id: testId,
      when,
      then,
      requirement_id: reqId,
    });

    // Link the requirement back to its test
    req.test_id = testId;
    generated++;

    // Narrator event for the kid
    const label = req.type === 'when_then' ? 'rule' : req.type === 'feature' ? 'feature' : 'data';
    await send({
      type: 'narrator_message',
      from: 'Narrator',
      text: `I noticed your ${label}: "${desc}" -- I'll make sure to test that!`,
      mood: 'encouraging',
    });
  }

  if (generated > 0) {
    // Ensure workflow exists and has behavioral_tests
    if (!spec.workflow) spec.workflow = {};
    (spec.workflow as Record<string, unknown>).behavioral_tests = behavioralTests;

    // Also ensure testing is enabled
    (spec.workflow as Record<string, unknown>).testing_enabled = true;
  }

  return generated;
}
