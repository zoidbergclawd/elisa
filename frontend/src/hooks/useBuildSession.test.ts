import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBuildSession, MAX_SERIAL_LINES, MAX_EVENTS } from './useBuildSession';
import type { WSEvent, Task, Agent } from '../types';

// ---- Helpers: reusable event fixtures ----

function makePlanReady(opts?: {
  tasks?: Task[];
  agents?: Agent[];
  deploymentTarget?: string;
  deploySteps?: Array<{ id: string; name: string; method: string }>;
}): WSEvent {
  return {
    type: 'plan_ready',
    tasks: opts?.tasks ?? [
      { id: 't1', name: 'Build UI', description: 'Build the UI', status: 'pending', agent_name: 'Sparky', dependencies: [] },
    ],
    agents: opts?.agents ?? [
      { name: 'Sparky', role: 'builder', persona: 'A builder', status: 'idle' },
    ],
    explanation: 'Plan is ready',
    deployment_target: opts?.deploymentTarget,
    deploy_steps: opts?.deploySteps,
  };
}

function makePlanWithMultipleTasks(): WSEvent {
  return makePlanReady({
    tasks: [
      { id: 't1', name: 'Build UI', description: '', status: 'pending', agent_name: 'Sparky', dependencies: [] },
      { id: 't2', name: 'Write tests', description: '', status: 'pending', agent_name: 'Checkers', dependencies: ['t1'] },
    ],
    agents: [
      { name: 'Sparky', role: 'builder', persona: '', status: 'idle' },
      { name: 'Checkers', role: 'tester', persona: '', status: 'idle' },
    ],
  });
}

// ---- Tests ----

describe('useBuildSession', () => {
  // === Initial state ===

  describe('initial state', () => {
    it('starts in design state with empty arrays', () => {
      const { result } = renderHook(() => useBuildSession());
      expect(result.current.uiState).toBe('design');
      expect(result.current.tasks).toEqual([]);
      expect(result.current.agents).toEqual([]);
      expect(result.current.commits).toEqual([]);
      expect(result.current.events).toEqual([]);
      expect(result.current.sessionId).toBeNull();
    });

    it('initializes extended state correctly', () => {
      const { result } = renderHook(() => useBuildSession());
      expect(result.current.teachingMoments).toEqual([]);
      expect(result.current.testResults).toEqual([]);
      expect(result.current.coveragePct).toBeNull();
      expect(result.current.tokenUsage).toEqual({ input: 0, output: 0, total: 0, costUsd: 0, maxBudget: 500_000, perAgent: {} });
      expect(result.current.serialLines).toEqual([]);
      expect(result.current.deployProgress).toBeNull();
      expect(result.current.deployChecklist).toBeNull();
      expect(result.current.deployUrls).toEqual({});
      expect(result.current.gateRequest).toBeNull();
      expect(result.current.questionRequest).toBeNull();
      expect(result.current.nuggetDir).toBeNull();
      expect(result.current.errorNotification).toBeNull();
      expect(result.current.narratorMessages).toEqual([]);
    });
  });

  // === Event handling: plan_ready ===

  describe('plan_ready', () => {
    it('sets tasks and agents', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady()));
      expect(result.current.tasks).toHaveLength(1);
      expect(result.current.tasks[0].id).toBe('t1');
      expect(result.current.agents).toHaveLength(1);
      expect(result.current.agents[0].name).toBe('Sparky');
    });

    it('injects synthetic deploy node for esp32 deployment_target', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady({ deploymentTarget: 'esp32' })));
      expect(result.current.tasks).toHaveLength(2);
      const deployTask = result.current.tasks.find(t => t.id === '__deploy__');
      expect(deployTask).toBeDefined();
      expect(deployTask!.name).toBe('Flash to Board');
      expect(deployTask!.status).toBe('pending');
      expect(deployTask!.dependencies).toEqual(['t1']);
    });

    it('injects synthetic deploy node for "both" deployment_target', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady({ deploymentTarget: 'both' })));
      const deployTask = result.current.tasks.find(t => t.id === '__deploy__');
      expect(deployTask).toBeDefined();
    });

    it('does NOT inject deploy node for web-only deployment_target', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady({ deploymentTarget: 'web' })));
      expect(result.current.tasks.find(t => t.id === '__deploy__')).toBeUndefined();
    });

    it('does NOT inject deploy node when deployment_target is missing', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady()));
      expect(result.current.tasks.find(t => t.id === '__deploy__')).toBeUndefined();
    });

    it('deploy node has empty dependencies when plan has no tasks', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady({ tasks: [], deploymentTarget: 'esp32' })));
      const deployTask = result.current.tasks.find(t => t.id === '__deploy__');
      expect(deployTask!.dependencies).toEqual([]);
    });

    it('creates per-device deploy nodes from deploy_steps', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady({
        deploySteps: [
          { id: 'cloud-dashboard', name: 'Cloud Dashboard', method: 'cloud' },
          { id: 'heltec-gateway', name: 'Heltec Gateway', method: 'flash' },
          { id: 'heltec-sensor', name: 'Heltec Sensor Node', method: 'flash' },
        ],
      })));
      expect(result.current.tasks).toHaveLength(4); // 1 real + 3 deploy
      expect(result.current.tasks.find(t => t.id === '__deploy_cloud-dashboard__')?.name).toBe('Deploy Cloud Dashboard');
      expect(result.current.tasks.find(t => t.id === '__deploy_heltec-gateway__')?.name).toBe('Flash Heltec Gateway');
      expect(result.current.tasks.find(t => t.id === '__deploy_heltec-sensor__')?.name).toBe('Flash Heltec Sensor Node');
    });

    it('per-device deploy nodes depend on last real task', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady({
        deploySteps: [
          { id: 'dev-a', name: 'Device A', method: 'flash' },
        ],
      })));
      const node = result.current.tasks.find(t => t.id === '__deploy_dev-a__');
      expect(node!.dependencies).toEqual(['t1']);
    });

    it('falls back to legacy __deploy__ when deploy_steps is empty', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady({ deploymentTarget: 'esp32', deploySteps: [] })));
      expect(result.current.tasks.find(t => t.id === '__deploy__')).toBeDefined();
    });

    it('adds __deploy_web__ node when target is both and no cloud device', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady({
        deploymentTarget: 'both',
        deploySteps: [
          { id: 'sensor', name: 'Sensor', method: 'flash' },
        ],
      })));
      expect(result.current.tasks.find(t => t.id === '__deploy_web__')).toBeDefined();
    });

    it('does NOT add __deploy_web__ when a cloud device is present', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady({
        deploymentTarget: 'both',
        deploySteps: [
          { id: 'cloud-dash', name: 'Dashboard', method: 'cloud' },
          { id: 'sensor', name: 'Sensor', method: 'flash' },
        ],
      })));
      expect(result.current.tasks.find(t => t.id === '__deploy_web__')).toBeUndefined();
    });
  });

  // === Task lifecycle events ===

  describe('task_started', () => {
    it('sets task to in_progress and agent to working', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady()));
      act(() => result.current.handleEvent({ type: 'task_started', task_id: 't1', agent_name: 'Sparky' }));
      expect(result.current.tasks[0].status).toBe('in_progress');
      expect(result.current.agents[0].status).toBe('working');
    });

    it('does not affect unrelated tasks or agents', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanWithMultipleTasks()));
      act(() => result.current.handleEvent({ type: 'task_started', task_id: 't1', agent_name: 'Sparky' }));
      expect(result.current.tasks[1].status).toBe('pending');
      expect(result.current.agents[1].status).toBe('idle');
    });
  });

  describe('task_completed', () => {
    it('sets task to done and agent to idle', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady()));
      act(() => result.current.handleEvent({ type: 'task_started', task_id: 't1', agent_name: 'Sparky' }));
      act(() => result.current.handleEvent({ type: 'task_completed', task_id: 't1', summary: 'Done' }));
      expect(result.current.tasks[0].status).toBe('done');
      expect(result.current.agents[0].status).toBe('idle');
    });

    it('handles duplicate task_completed for same task without crashing', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady()));
      act(() => result.current.handleEvent({ type: 'task_completed', task_id: 't1', summary: 'Done' }));
      act(() => result.current.handleEvent({ type: 'task_completed', task_id: 't1', summary: 'Done again' }));
      expect(result.current.tasks[0].status).toBe('done');
    });
  });

  describe('task_failed', () => {
    it('sets task to failed and agent to error', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => {
        result.current.handleEvent(makePlanReady({
          agents: [{ name: 'Sparky', role: 'builder', persona: '', status: 'working' }],
        }));
      });
      act(() => result.current.handleEvent({ type: 'task_failed', task_id: 't1', error: 'Oops', retry_count: 2 }));
      expect(result.current.tasks[0].status).toBe('failed');
      expect(result.current.agents[0].status).toBe('error');
    });

    it('does not affect agents when task_id is unknown', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady()));
      act(() => result.current.handleEvent({ type: 'task_failed', task_id: 'unknown', error: 'X', retry_count: 0 }));
      expect(result.current.agents[0].status).toBe('idle');
    });
  });

  // === commit_created ===

  describe('commit_created', () => {
    it('appends commit with all fields', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent({
        type: 'commit_created', sha: 'abc1234', message: 'Sparky: Build login',
        agent_name: 'Sparky', task_id: 't1', timestamp: '2026-02-10T12:00:00Z',
        files_changed: ['src/login.py'],
      }));
      expect(result.current.commits).toHaveLength(1);
      expect(result.current.commits[0].sha).toBe('abc1234');
      expect(result.current.commits[0].agent_name).toBe('Sparky');
      expect(result.current.commits[0].files_changed).toEqual(['src/login.py']);
    });

    it('accumulates multiple commits', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => {
        result.current.handleEvent({
          type: 'commit_created', sha: 'aaa', message: 'First',
          agent_name: 'Sparky', task_id: 't1', timestamp: '', files_changed: [],
        });
        result.current.handleEvent({
          type: 'commit_created', sha: 'bbb', message: 'Second',
          agent_name: 'Checkers', task_id: 't2', timestamp: '', files_changed: [],
        });
      });
      expect(result.current.commits).toHaveLength(2);
    });
  });

  // === Deploy events ===

  describe('deploy_started', () => {
    it('sets uiState to building and initial deploy progress', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent({ type: 'deploy_started', target: 'esp32' }));
      expect(result.current.uiState).toBe('building');
      expect(result.current.deployProgress).toEqual({ step: 'Starting deployment...', progress: 0 });
    });

    it('marks __deploy__ task as in_progress', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady({ deploymentTarget: 'esp32' })));
      act(() => result.current.handleEvent({ type: 'deploy_started', target: 'esp32' }));
      const deployTask = result.current.tasks.find(t => t.id === '__deploy__');
      expect(deployTask!.status).toBe('in_progress');
    });

    it('marks per-device deploy node as in_progress', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady({
        deploySteps: [{ id: 'cloud-dash', name: 'Dashboard', method: 'cloud' }],
      })));
      act(() => result.current.handleEvent({ type: 'deploy_started', target: 'cloud-dash' }));
      const node = result.current.tasks.find(t => t.id === '__deploy_cloud-dash__');
      expect(node!.status).toBe('in_progress');
    });
  });

  describe('deploy_progress', () => {
    it('updates deploy progress step and percentage', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent({ type: 'deploy_progress', step: 'Flashing...', progress: 60 }));
      expect(result.current.deployProgress).toEqual({ step: 'Flashing...', progress: 60 });
    });
  });

  describe('deploy_checklist', () => {
    it('stores checklist rules', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent({
        type: 'deploy_checklist',
        rules: [
          { name: 'Must compile', prompt: 'Code must compile cleanly' },
          { name: 'Tests pass', prompt: 'All tests must pass' },
        ],
      }));
      expect(result.current.deployChecklist).toHaveLength(2);
      expect(result.current.deployChecklist![0].name).toBe('Must compile');
    });
  });

  describe('deploy_complete', () => {
    it('clears deploy progress and checklist', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent({ type: 'deploy_started', target: 'esp32' }));
      act(() => result.current.handleEvent({
        type: 'deploy_checklist',
        rules: [{ name: 'Rule', prompt: 'Prompt' }],
      }));
      act(() => result.current.handleEvent({ type: 'deploy_complete', target: 'esp32' }));
      expect(result.current.deployProgress).toBeNull();
      expect(result.current.deployChecklist).toBeNull();
    });

    it('accumulates deployUrls when url is provided', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent({ type: 'deploy_complete', target: 'web', url: 'http://localhost:3000' }));
      expect(result.current.deployUrls).toEqual({ web: 'http://localhost:3000' });
    });

    it('does not add to deployUrls when url is absent', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent({ type: 'deploy_complete', target: 'esp32' }));
      expect(result.current.deployUrls).toEqual({});
    });

    it('accumulates multiple deploy URLs from different targets', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent({ type: 'deploy_complete', target: 'cloud-dash', url: 'https://dash.example.com' }));
      act(() => result.current.handleEvent({ type: 'deploy_complete', target: 'web', url: 'http://localhost:3000' }));
      expect(result.current.deployUrls).toEqual({
        'cloud-dash': 'https://dash.example.com',
        web: 'http://localhost:3000',
      });
    });

    it('marks __deploy__ task as done', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady({ deploymentTarget: 'esp32' })));
      act(() => result.current.handleEvent({ type: 'deploy_started', target: 'esp32' }));
      act(() => result.current.handleEvent({ type: 'deploy_complete', target: 'esp32' }));
      const deployTask = result.current.tasks.find(t => t.id === '__deploy__');
      expect(deployTask!.status).toBe('done');
    });

    it('marks per-device deploy node as done', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady({
        deploySteps: [{ id: 'cloud-dash', name: 'Dashboard', method: 'cloud' }],
      })));
      act(() => result.current.handleEvent({ type: 'deploy_started', target: 'cloud-dash' }));
      act(() => result.current.handleEvent({ type: 'deploy_complete', target: 'cloud-dash', url: 'https://example.com' }));
      const node = result.current.tasks.find(t => t.id === '__deploy_cloud-dash__');
      expect(node!.status).toBe('done');
      expect(result.current.deployUrls['cloud-dash']).toBe('https://example.com');
    });
  });

  // === serial_data ===

  describe('serial_data', () => {
    it('appends serial lines', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent({
        type: 'serial_data', line: 'Hello from board', timestamp: '2026-02-10T12:00:00Z',
      }));
      expect(result.current.serialLines).toHaveLength(1);
      expect(result.current.serialLines[0].line).toBe('Hello from board');
    });

    it('caps at MAX_SERIAL_LINES, dropping oldest', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => {
        for (let i = 0; i < MAX_SERIAL_LINES + 50; i++) {
          result.current.handleEvent({
            type: 'serial_data', line: `line-${i}`,
            timestamp: `2026-02-10T12:00:${String(i).padStart(2, '0')}Z`,
          });
        }
      });
      expect(result.current.serialLines.length).toBe(MAX_SERIAL_LINES);
      expect(result.current.serialLines[0].line).toBe('line-50');
      expect(result.current.serialLines[MAX_SERIAL_LINES - 1].line).toBe(`line-${MAX_SERIAL_LINES + 49}`);
    });

    it('does not trim when under the cap', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => {
        for (let i = 0; i < 10; i++) {
          result.current.handleEvent({
            type: 'serial_data', line: `line-${i}`, timestamp: '2026-02-10T12:00:00Z',
          });
        }
      });
      expect(result.current.serialLines.length).toBe(10);
      expect(result.current.serialLines[0].line).toBe('line-0');
    });
  });

  // === human_gate ===

  describe('human_gate', () => {
    it('sets uiState to review and populates gateRequest', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent({
        type: 'human_gate', task_id: 'task-3', question: 'Check this out?', context: 'Built the UI',
      }));
      expect(result.current.uiState).toBe('review');
      expect(result.current.gateRequest).toEqual({
        task_id: 'task-3', question: 'Check this out?', context: 'Built the UI',
      });
    });
  });

  // === user_question ===

  describe('user_question', () => {
    it('populates questionRequest', () => {
      const { result } = renderHook(() => useBuildSession());
      const questions = [{ question: 'Pick a color', header: 'Color', options: [{ label: 'Red', description: '' }], multiSelect: false }];
      act(() => result.current.handleEvent({ type: 'user_question', task_id: 'task-1', questions }));
      expect(result.current.questionRequest).toEqual({ task_id: 'task-1', questions });
    });
  });

  // === skill_question ===

  describe('skill_question', () => {
    it('routes skill questions through questionRequest modal', () => {
      const { result } = renderHook(() => useBuildSession());
      const questions = [{ question: 'Choose option', header: 'Opt', options: [], multiSelect: false }];
      act(() => result.current.handleEvent({
        type: 'skill_question', skill_id: 'sk1', step_id: 'step-1', questions,
      } as WSEvent));
      expect(result.current.questionRequest).toEqual({ task_id: 'step-1', questions });
    });
  });

  // === session_complete ===

  describe('session_complete', () => {
    it('sets uiState to done and all agents to done', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanWithMultipleTasks()));
      act(() => result.current.handleEvent({ type: 'session_complete', summary: 'All done' }));
      expect(result.current.uiState).toBe('done');
      expect(result.current.agents.every(a => a.status === 'done')).toBe(true);
    });
  });

  // === teaching_moment ===

  describe('teaching_moment', () => {
    it('appends teaching moment with all fields', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent({
        type: 'teaching_moment', concept: 'source_control',
        headline: 'Saving work!', explanation: 'Your helpers are saving.',
        tell_me_more: 'More info', related_concepts: ['git', 'commits'],
      }));
      expect(result.current.teachingMoments).toHaveLength(1);
      expect(result.current.teachingMoments[0].concept).toBe('source_control');
      expect(result.current.teachingMoments[0].headline).toBe('Saving work!');
      expect(result.current.teachingMoments[0].tell_me_more).toBe('More info');
      expect(result.current.teachingMoments[0].related_concepts).toEqual(['git', 'commits']);
    });

    it('accumulates multiple teaching moments', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => {
        result.current.handleEvent({
          type: 'teaching_moment', concept: 'a', headline: '', explanation: '',
        });
        result.current.handleEvent({
          type: 'teaching_moment', concept: 'b', headline: '', explanation: '',
        });
      });
      expect(result.current.teachingMoments).toHaveLength(2);
    });
  });

  // === test_result ===

  describe('test_result', () => {
    it('appends test result', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent({
        type: 'test_result', test_name: 'test_add', passed: true, details: 'PASSED',
      }));
      expect(result.current.testResults).toHaveLength(1);
      expect(result.current.testResults[0].passed).toBe(true);
    });

    it('accumulates passed and failed test results', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => {
        result.current.handleEvent({ type: 'test_result', test_name: 'test_ok', passed: true, details: '' });
        result.current.handleEvent({ type: 'test_result', test_name: 'test_bad', passed: false, details: 'AssertionError' });
      });
      expect(result.current.testResults).toHaveLength(2);
      expect(result.current.testResults[1].passed).toBe(false);
    });
  });

  // === coverage_update ===

  describe('coverage_update', () => {
    it('updates coveragePct', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent({ type: 'coverage_update', percentage: 85.5 }));
      expect(result.current.coveragePct).toBe(85.5);
    });

    it('replaces previous coverage value', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent({ type: 'coverage_update', percentage: 50 }));
      act(() => result.current.handleEvent({ type: 'coverage_update', percentage: 90 }));
      expect(result.current.coveragePct).toBe(90);
    });
  });

  // === token_usage ===

  describe('token_usage', () => {
    it('accumulates input/output tokens and total', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent({
        type: 'token_usage', agent_name: 'Sparky', input_tokens: 100, output_tokens: 50, cost_usd: 0.01,
      }));
      expect(result.current.tokenUsage.input).toBe(100);
      expect(result.current.tokenUsage.output).toBe(50);
      expect(result.current.tokenUsage.total).toBe(150);
    });

    it('accumulates cost_usd', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent({
        type: 'token_usage', agent_name: 'Sparky', input_tokens: 100, output_tokens: 50, cost_usd: 0.01,
      }));
      act(() => result.current.handleEvent({
        type: 'token_usage', agent_name: 'Sparky', input_tokens: 200, output_tokens: 100, cost_usd: 0.02,
      }));
      expect(result.current.tokenUsage.costUsd).toBeCloseTo(0.03);
    });

    it('tracks per-agent usage separately', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => {
        result.current.handleEvent({
          type: 'token_usage', agent_name: 'Sparky', input_tokens: 100, output_tokens: 50, cost_usd: 0,
        });
        result.current.handleEvent({
          type: 'token_usage', agent_name: 'Checkers', input_tokens: 200, output_tokens: 100, cost_usd: 0,
        });
      });
      expect(result.current.tokenUsage.total).toBe(450);
      expect(result.current.tokenUsage.perAgent['Sparky']).toEqual({ input: 100, output: 50 });
      expect(result.current.tokenUsage.perAgent['Checkers']).toEqual({ input: 200, output: 100 });
    });

    it('accumulates per-agent tokens across multiple events for same agent', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => {
        result.current.handleEvent({
          type: 'token_usage', agent_name: 'Sparky', input_tokens: 100, output_tokens: 50, cost_usd: 0,
        });
        result.current.handleEvent({
          type: 'token_usage', agent_name: 'Sparky', input_tokens: 150, output_tokens: 75, cost_usd: 0,
        });
      });
      expect(result.current.tokenUsage.perAgent['Sparky']).toEqual({ input: 250, output: 125 });
    });

    it('preserves maxBudget across accumulation', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent({
        type: 'token_usage', agent_name: 'Sparky', input_tokens: 100, output_tokens: 50, cost_usd: 0,
      }));
      expect(result.current.tokenUsage.maxBudget).toBe(500_000);
    });
  });

  // === budget_warning ===

  describe('budget_warning', () => {
    it('sets errorNotification with budget warning message', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent({
        type: 'budget_warning', total_tokens: 400_000, max_budget: 500_000, cost_usd: 3.50,
      }));
      expect(result.current.errorNotification).not.toBeNull();
      expect(result.current.errorNotification!.message).toContain('80%');
      expect(result.current.errorNotification!.message).toContain('$3.50');
      expect(result.current.errorNotification!.recoverable).toBe(true);
    });
  });

  // === error ===

  describe('error event', () => {
    it('sets errorNotification', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent({
        type: 'error', message: 'Something broke', recoverable: false,
      }));
      expect(result.current.errorNotification).not.toBeNull();
      expect(result.current.errorNotification!.message).toBe('Something broke');
      expect(result.current.errorNotification!.recoverable).toBe(false);
      expect(result.current.errorNotification!.timestamp).toBeGreaterThan(0);
    });

    it('marks __deploy__ task as failed for flash-related errors', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady({ deploymentTarget: 'esp32' })));
      act(() => result.current.handleEvent({ type: 'deploy_started', target: 'esp32' }));
      act(() => result.current.handleEvent({
        type: 'error', message: 'flash failed: device not found', recoverable: false,
      }));
      const deployTask = result.current.tasks.find(t => t.id === '__deploy__');
      expect(deployTask!.status).toBe('failed');
    });

    it('marks __deploy__ task as failed for mpremote errors', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady({ deploymentTarget: 'esp32' })));
      act(() => result.current.handleEvent({ type: 'deploy_started', target: 'esp32' }));
      act(() => result.current.handleEvent({
        type: 'error', message: 'mpremote connection timeout', recoverable: true,
      }));
      const deployTask = result.current.tasks.find(t => t.id === '__deploy__');
      expect(deployTask!.status).toBe('failed');
    });

    it('marks __deploy__ as failed for "Compilation failed" errors', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady({ deploymentTarget: 'esp32' })));
      act(() => result.current.handleEvent({ type: 'deploy_started', target: 'esp32' }));
      act(() => result.current.handleEvent({
        type: 'error', message: 'Compilation failed: syntax error', recoverable: false,
      }));
      const deployTask = result.current.tasks.find(t => t.id === '__deploy__');
      expect(deployTask!.status).toBe('failed');
    });

    it('marks __deploy__ as failed for "board detected" errors', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady({ deploymentTarget: 'esp32' })));
      act(() => result.current.handleEvent({ type: 'deploy_started', target: 'esp32' }));
      act(() => result.current.handleEvent({
        type: 'error', message: 'No board detected on COM3', recoverable: false,
      }));
      const deployTask = result.current.tasks.find(t => t.id === '__deploy__');
      expect(deployTask!.status).toBe('failed');
    });

    it('does NOT mark __deploy__ as failed for unrelated errors', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady({ deploymentTarget: 'esp32' })));
      act(() => result.current.handleEvent({ type: 'deploy_started', target: 'esp32' }));
      act(() => result.current.handleEvent({
        type: 'error', message: 'API rate limit exceeded', recoverable: true,
      }));
      const deployTask = result.current.tasks.find(t => t.id === '__deploy__');
      expect(deployTask!.status).toBe('in_progress');
    });

    it('does NOT mark __deploy__ as failed if deploy task is not in_progress', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady({ deploymentTarget: 'esp32' })));
      // deploy task is still 'pending', not started
      act(() => result.current.handleEvent({
        type: 'error', message: 'flash error', recoverable: false,
      }));
      const deployTask = result.current.tasks.find(t => t.id === '__deploy__');
      expect(deployTask!.status).toBe('pending');
    });

    it('marks per-device deploy node as failed for flash errors', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady({
        deploySteps: [{ id: 'sensor', name: 'Sensor', method: 'flash' }],
      })));
      // Start deploy on the per-device node
      act(() => result.current.handleEvent({ type: 'deploy_started', target: 'sensor' }));
      act(() => result.current.handleEvent({
        type: 'error', message: 'flash failed: timeout', recoverable: false,
      }));
      const node = result.current.tasks.find(t => t.id === '__deploy_sensor__');
      expect(node!.status).toBe('failed');
    });
  });

  // === flash_prompt / flash_complete ===

  describe('flash_prompt', () => {
    it('marks per-device deploy node as in_progress', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady({
        deploySteps: [{ id: 'sensor-node', name: 'Heltec Sensor', method: 'flash' }],
      })));
      act(() => result.current.handleEvent({
        type: 'flash_prompt', device_role: 'sensor-node', message: 'Plug in sensor',
      }));
      const node = result.current.tasks.find(t => t.id === '__deploy_sensor-node__');
      expect(node!.status).toBe('in_progress');
    });

    it('includes deviceName from deploy steps in flashWizardState', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady({
        deploySteps: [{ id: 'sensor-node', name: 'Heltec Sensor', method: 'flash' }],
      })));
      act(() => result.current.handleEvent({
        type: 'flash_prompt', device_role: 'sensor-node', message: 'Plug in sensor',
      }));
      expect(result.current.flashWizardState?.deviceName).toBe('Heltec Sensor');
    });
  });

  describe('flash_complete', () => {
    it('marks per-device deploy node as done on success', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady({
        deploySteps: [{ id: 'sensor-node', name: 'Heltec Sensor', method: 'flash' }],
      })));
      act(() => result.current.handleEvent({
        type: 'flash_prompt', device_role: 'sensor-node', message: 'Plug in sensor',
      }));
      act(() => result.current.handleEvent({
        type: 'flash_complete', device_role: 'sensor-node', success: true,
      }));
      const node = result.current.tasks.find(t => t.id === '__deploy_sensor-node__');
      expect(node!.status).toBe('done');
    });

    it('marks per-device deploy node as failed on failure', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady({
        deploySteps: [{ id: 'sensor-node', name: 'Heltec Sensor', method: 'flash' }],
      })));
      act(() => result.current.handleEvent({
        type: 'flash_prompt', device_role: 'sensor-node', message: 'Plug in sensor',
      }));
      act(() => result.current.handleEvent({
        type: 'flash_complete', device_role: 'sensor-node', success: false, message: 'Flash failed',
      }));
      const node = result.current.tasks.find(t => t.id === '__deploy_sensor-node__');
      expect(node!.status).toBe('failed');
    });
  });

  // === workspace_created ===

  describe('workspace_created', () => {
    it('sets nuggetDir', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent({ type: 'workspace_created', nugget_dir: '/tmp/nugget-123' }));
      expect(result.current.nuggetDir).toBe('/tmp/nugget-123');
    });
  });

  // === narrator_message ===

  describe('narrator_message', () => {
    it('appends narrator message with timestamp', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent({
        type: 'narrator_message', from: 'Elisa', text: 'Getting started!', mood: 'excited',
      } as WSEvent));
      expect(result.current.narratorMessages).toHaveLength(1);
      expect(result.current.narratorMessages[0].from).toBe('Elisa');
      expect(result.current.narratorMessages[0].text).toBe('Getting started!');
      expect(result.current.narratorMessages[0].mood).toBe('excited');
      expect(result.current.narratorMessages[0].timestamp).toBeGreaterThan(0);
    });

    it('includes related_task_id when provided', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent({
        type: 'narrator_message', from: 'Elisa', text: 'Done!', mood: 'celebrating', related_task_id: 't1',
      } as WSEvent));
      expect(result.current.narratorMessages[0].related_task_id).toBe('t1');
    });
  });

  // === minion_state_change ===

  describe('minion_state_change', () => {
    it('updates agent status', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady()));
      act(() => result.current.handleEvent({
        type: 'minion_state_change', agent_name: 'Sparky', old_status: 'idle', new_status: 'waiting',
      } as WSEvent));
      expect(result.current.agents[0].status).toBe('waiting');
    });

    it('does not affect other agents', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanWithMultipleTasks()));
      act(() => result.current.handleEvent({
        type: 'minion_state_change', agent_name: 'Sparky', old_status: 'idle', new_status: 'working',
      } as WSEvent));
      expect(result.current.agents[1].status).toBe('idle');
    });
  });

  // === Skill events (no-op beyond event log) ===

  describe('skill events', () => {
    it.each([
      'skill_started',
      'skill_step',
      'skill_output',
      'skill_completed',
      'skill_error',
    ] as const)('handles %s without crashing and logs to events', (eventType) => {
      const { result } = renderHook(() => useBuildSession());
      const event = { type: eventType, skill_id: 'sk1' } as WSEvent;
      act(() => result.current.handleEvent(event));
      expect(result.current.events).toHaveLength(1);
      expect(result.current.events[0].type).toBe(eventType);
    });
  });

  // === permission_auto_resolved (no-op beyond event log) ===

  describe('permission_auto_resolved', () => {
    it('logs to events array without state changes', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent({
        type: 'permission_auto_resolved', task_id: 't1', permission_type: 'file_write', decision: 'approved', reason: 'auto',
      }));
      expect(result.current.events).toHaveLength(1);
      expect(result.current.events[0].type).toBe('permission_auto_resolved');
    });
  });

  // === Events array / MAX_EVENTS ===

  describe('events array', () => {
    it('accumulates all events', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => {
        result.current.handleEvent({ type: 'planning_started' } as WSEvent);
        result.current.handleEvent({ type: 'session_complete', summary: '' });
      });
      expect(result.current.events).toHaveLength(2);
    });

    it('caps events at MAX_EVENTS, dropping oldest', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => {
        for (let i = 0; i < MAX_EVENTS + 20; i++) {
          result.current.handleEvent({
            type: 'serial_data', line: `line-${i}`, timestamp: '',
          });
        }
      });
      expect(result.current.events.length).toBe(MAX_EVENTS);
      // Oldest should have been trimmed
      expect((result.current.events[0] as Record<string, unknown>).line).toBe('line-20');
    });
  });

  // === Unknown event types ===

  describe('unknown event types', () => {
    it('does not crash on unknown event type and still logs to events', () => {
      const { result } = renderHook(() => useBuildSession());
      const unknownEvent = { type: 'some_future_event', data: 'test' } as unknown as WSEvent;
      act(() => result.current.handleEvent(unknownEvent));
      expect(result.current.events).toHaveLength(1);
    });
  });

  // === Out of order events ===

  describe('edge cases: event ordering', () => {
    it('task_completed before task_started does not crash', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent(makePlanReady()));
      // Complete without starting
      act(() => result.current.handleEvent({ type: 'task_completed', task_id: 't1', summary: 'Done' }));
      expect(result.current.tasks[0].status).toBe('done');
    });

    it('session_complete before any plan does not crash', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent({ type: 'session_complete', summary: 'Done' }));
      expect(result.current.uiState).toBe('done');
      expect(result.current.agents).toEqual([]);
    });

    it('deploy_complete without deploy_started does not crash', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent({ type: 'deploy_complete', target: 'esp32' }));
      expect(result.current.deployProgress).toBeNull();
    });
  });

  // === Clear helpers ===

  describe('clear helpers', () => {
    it('clearGateRequest sets gateRequest to null', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent({
        type: 'human_gate', task_id: 'task-3', question: 'Check?', context: 'ctx',
      }));
      expect(result.current.gateRequest).not.toBeNull();
      act(() => result.current.clearGateRequest());
      expect(result.current.gateRequest).toBeNull();
    });

    it('clearQuestionRequest sets questionRequest to null', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent({
        type: 'user_question', task_id: 'task-1',
        questions: [{ question: 'Pick', header: '', options: [], multiSelect: false }],
      }));
      expect(result.current.questionRequest).not.toBeNull();
      act(() => result.current.clearQuestionRequest());
      expect(result.current.questionRequest).toBeNull();
    });

    it('clearErrorNotification sets errorNotification to null', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => result.current.handleEvent({
        type: 'error', message: 'Oops', recoverable: true,
      }));
      expect(result.current.errorNotification).not.toBeNull();
      act(() => result.current.clearErrorNotification());
      expect(result.current.errorNotification).toBeNull();
    });
  });

  // === startBuild ===

  describe('startBuild', () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('resets all state and sets uiState to building', async () => {
      const { result } = renderHook(() => useBuildSession());

      // Dirty up state first
      act(() => {
        result.current.handleEvent(makePlanReady());
        result.current.handleEvent({ type: 'teaching_moment', concept: 'a', headline: '', explanation: '' });
        result.current.handleEvent({ type: 'serial_data', line: 'x', timestamp: '' });
        result.current.handleEvent({ type: 'error', message: 'err', recoverable: true });
      });

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ session_id: 's1' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      await act(async () => {
        await result.current.startBuild({ nugget: { goal: 'test' } } as never);
      });

      expect(result.current.uiState).toBe('building');
      expect(result.current.events).toEqual([]);
      expect(result.current.tasks).toEqual([]);
      expect(result.current.agents).toEqual([]);
      expect(result.current.commits).toEqual([]);
      expect(result.current.teachingMoments).toEqual([]);
      expect(result.current.testResults).toEqual([]);
      expect(result.current.coveragePct).toBeNull();
      expect(result.current.serialLines).toEqual([]);
      expect(result.current.deployProgress).toBeNull();
      expect(result.current.deployChecklist).toBeNull();
      expect(result.current.deployUrls).toEqual({});
      expect(result.current.gateRequest).toBeNull();
      expect(result.current.questionRequest).toBeNull();
      expect(result.current.nuggetDir).toBeNull();
      expect(result.current.errorNotification).toBeNull();
      expect(result.current.narratorMessages).toEqual([]);
      expect(result.current.sessionId).toBe('s1');
    });

    it('calls waitForWs before starting build', async () => {
      const waitForWs = vi.fn().mockResolvedValue(undefined);

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ session_id: 's1' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      const { result } = renderHook(() => useBuildSession());
      await act(async () => {
        await result.current.startBuild({ nugget: { goal: 'test' } } as never, waitForWs);
      });

      expect(waitForWs).toHaveBeenCalledOnce();
    });

    it('sends workspace_path and workspace_json when provided', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ session_id: 's1' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      globalThis.fetch = fetchMock;

      const { result } = renderHook(() => useBuildSession());
      await act(async () => {
        await result.current.startBuild(
          { nugget: { goal: 'test' } } as never,
          undefined,
          '/my/workspace',
          { key: 'value' },
        );
      });

      const startCall = fetchMock.mock.calls[1];
      const body = JSON.parse(startCall[1].body);
      expect(body.workspace_path).toBe('/my/workspace');
      expect(body.workspace_json).toEqual({ key: 'value' });
    });

    it('defaults workspace_json to empty object when workspacePath provided without json', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ session_id: 's1' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      globalThis.fetch = fetchMock;

      const { result } = renderHook(() => useBuildSession());
      await act(async () => {
        await result.current.startBuild(
          { nugget: { goal: 'test' } } as never,
          undefined,
          '/my/workspace',
        );
      });

      const startCall = fetchMock.mock.calls[1];
      const body = JSON.parse(startCall[1].body);
      expect(body.workspace_json).toEqual({});
    });

    it('surfaces Zod validation errors with per-field messages', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ session_id: 's1' }) })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({
            detail: 'Invalid NuggetSpec',
            errors: [
              { path: 'nugget.goal', message: 'Required' },
              { path: 'nugget.language', message: 'Invalid enum value' },
            ],
          }),
        });

      const { result } = renderHook(() => useBuildSession());
      await act(async () => {
        await result.current.startBuild({ nugget: { goal: '', language: 'python' } } as never);
      });

      expect(result.current.uiState).toBe('design');
      expect(result.current.errorNotification!.message).toContain('Invalid NuggetSpec');
      expect(result.current.errorNotification!.message).toContain('nugget.goal: Required');
      expect(result.current.errorNotification!.message).toContain('nugget.language: Invalid enum value');
      expect(result.current.errorNotification!.recoverable).toBe(true);
    });

    it('reads body.detail for non-validation errors', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ session_id: 's1' }) })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ detail: 'Session already started' }),
        });

      const { result } = renderHook(() => useBuildSession());
      await act(async () => {
        await result.current.startBuild({ nugget: { goal: 'x' } } as never);
      });

      expect(result.current.errorNotification!.message).toBe('Session already started');
    });

    it('reads body.detail for session creation errors', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ detail: 'Server overloaded' }),
        });

      const { result } = renderHook(() => useBuildSession());
      await act(async () => {
        await result.current.startBuild({ nugget: { goal: 'x' } } as never);
      });

      expect(result.current.uiState).toBe('design');
      expect(result.current.errorNotification!.message).toBe('Server overloaded');
    });

    it('falls back to statusText when json parsing fails on session creation', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          statusText: 'Internal Server Error',
          json: async () => { throw new Error('bad json'); },
        });

      const { result } = renderHook(() => useBuildSession());
      await act(async () => {
        await result.current.startBuild({ nugget: { goal: 'x' } } as never);
      });

      expect(result.current.uiState).toBe('design');
      // When json() fails, catch fallback uses statusText as body.detail
      expect(result.current.errorNotification!.message).toBe('Internal Server Error');
    });

    it('falls back to generic message when body has no detail', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ session_id: 's1' }) })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({}),
        });

      const { result } = renderHook(() => useBuildSession());
      await act(async () => {
        await result.current.startBuild({ nugget: { goal: 'x' } } as never);
      });

      expect(result.current.errorNotification!.message).toBe('Elisa couldn\'t start building. Try again!');
    });

    it('includes error path-less messages in validation output', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ session_id: 's1' }) })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({
            detail: 'Validation error',
            errors: [
              { path: '', message: 'Spec is empty' },
            ],
          }),
        });

      const { result } = renderHook(() => useBuildSession());
      await act(async () => {
        await result.current.startBuild({ nugget: { goal: '' } } as never);
      });

      expect(result.current.errorNotification!.message).toContain('Spec is empty');
    });

    it('resets tokenUsage to defaults on new build', async () => {
      const { result } = renderHook(() => useBuildSession());

      // Accumulate some tokens
      act(() => result.current.handleEvent({
        type: 'token_usage', agent_name: 'Sparky', input_tokens: 500, output_tokens: 250, cost_usd: 0.1,
      }));

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ session_id: 's2' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      await act(async () => {
        await result.current.startBuild({ nugget: { goal: 'test' } } as never);
      });

      expect(result.current.tokenUsage).toEqual({
        input: 0, output: 0, total: 0, costUsd: 0, maxBudget: 500_000, perAgent: {},
      });
    });
  });

  // === Rapid event sequences ===

  describe('rapid event sequences', () => {
    it('handles full build lifecycle in one act', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => {
        result.current.handleEvent(makePlanReady());
        result.current.handleEvent({ type: 'task_started', task_id: 't1', agent_name: 'Sparky' });
        result.current.handleEvent({
          type: 'commit_created', sha: 'abc', message: 'Build',
          agent_name: 'Sparky', task_id: 't1', timestamp: '', files_changed: ['a.py'],
        });
        result.current.handleEvent({ type: 'task_completed', task_id: 't1', summary: 'Done' });
        result.current.handleEvent({ type: 'session_complete', summary: 'All done' });
      });

      expect(result.current.uiState).toBe('done');
      expect(result.current.tasks[0].status).toBe('done');
      expect(result.current.agents[0].status).toBe('done');
      expect(result.current.commits).toHaveLength(1);
      expect(result.current.events).toHaveLength(5);
    });

    it('handles multiple task lifecycle events in rapid succession', () => {
      const { result } = renderHook(() => useBuildSession());
      act(() => {
        result.current.handleEvent(makePlanWithMultipleTasks());
        result.current.handleEvent({ type: 'task_started', task_id: 't1', agent_name: 'Sparky' });
        result.current.handleEvent({ type: 'task_completed', task_id: 't1', summary: 'Done' });
        result.current.handleEvent({ type: 'task_started', task_id: 't2', agent_name: 'Checkers' });
        result.current.handleEvent({ type: 'task_failed', task_id: 't2', error: 'fail', retry_count: 0 });
      });

      expect(result.current.tasks[0].status).toBe('done');
      expect(result.current.tasks[1].status).toBe('failed');
      expect(result.current.agents[0].status).toBe('idle');
      expect(result.current.agents[1].status).toBe('error');
    });
  });
});
