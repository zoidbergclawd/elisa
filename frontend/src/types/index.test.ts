import { describe, it, expectTypeOf } from 'vitest';
import type { WSEvent } from './index';

/**
 * Regression tests for WSEvent type parity with backend.
 * These ensure frontend WSEvent includes all fields the backend sends.
 */
describe('WSEvent type parity with backend', () => {
  it('task_completed includes optional agent_name', () => {
    const event: WSEvent = { type: 'task_completed', task_id: 't1', summary: 'Done', agent_name: 'Builder' };
    if (event.type === 'task_completed') {
      expectTypeOf(event.agent_name).toEqualTypeOf<string | undefined>();
    }
  });

  it('deploy_progress includes optional device_role', () => {
    const event: WSEvent = { type: 'deploy_progress', step: 'flash', progress: 50, device_role: 'sensor' };
    if (event.type === 'deploy_progress') {
      expectTypeOf(event.device_role).toEqualTypeOf<string | undefined>();
    }
  });

  it('user_question questions accepts Record<string, unknown>', () => {
    const event: WSEvent = { type: 'user_question', task_id: 't1', questions: { key: 'value' } };
    if (event.type === 'user_question') {
      expectTypeOf(event.questions).toMatchTypeOf<Record<string, unknown> | Array<unknown>>();
    }
  });

  it('coverage_update details matches backend shape', () => {
    const event: WSEvent = {
      type: 'coverage_update',
      percentage: 80,
      details: { 'file.ts': { statements: 10, covered: 8, percentage: 80 } },
    };
    if (event.type === 'coverage_update') {
      expectTypeOf(event.details).toEqualTypeOf<
        Record<string, { statements: number; covered: number; percentage: number }> | undefined
      >();
    }
  });
});
