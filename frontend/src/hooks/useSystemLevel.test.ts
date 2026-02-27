import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSystemLevel } from './useSystemLevel';
import type { NuggetSpec } from '../components/BlockCanvas/blockInterpreter';

function makeSpec(overrides?: Partial<NuggetSpec>): NuggetSpec {
  return {
    nugget: { goal: 'test', description: 'test', type: 'general' },
    requirements: [],
    agents: [],
    deployment: { target: 'preview', auto_flash: false },
    workflow: {
      review_enabled: false,
      testing_enabled: false,
      human_gates: [],
    },
    ...overrides,
  };
}

describe('useSystemLevel', () => {
  it('returns explorer when spec is null', () => {
    const { result } = renderHook(() => useSystemLevel(null));
    expect(result.current).toBe('explorer');
  });

  it('returns explorer when workflow has no system_level', () => {
    const spec = makeSpec();
    const { result } = renderHook(() => useSystemLevel(spec));
    expect(result.current).toBe('explorer');
  });

  it('returns explorer when system_level is explorer', () => {
    const spec = makeSpec({
      workflow: {
        review_enabled: false,
        testing_enabled: false,
        human_gates: [],
        system_level: 'explorer',
      },
    });
    const { result } = renderHook(() => useSystemLevel(spec));
    expect(result.current).toBe('explorer');
  });

  it('returns builder when system_level is builder', () => {
    const spec = makeSpec({
      workflow: {
        review_enabled: false,
        testing_enabled: false,
        human_gates: [],
        system_level: 'builder',
      },
    });
    const { result } = renderHook(() => useSystemLevel(spec));
    expect(result.current).toBe('builder');
  });

  it('returns architect when system_level is architect', () => {
    const spec = makeSpec({
      workflow: {
        review_enabled: false,
        testing_enabled: false,
        human_gates: [],
        system_level: 'architect',
      },
    });
    const { result } = renderHook(() => useSystemLevel(spec));
    expect(result.current).toBe('architect');
  });

  it('updates when spec changes', () => {
    const spec1 = makeSpec({
      workflow: {
        review_enabled: false,
        testing_enabled: false,
        human_gates: [],
        system_level: 'explorer',
      },
    });
    const spec2 = makeSpec({
      workflow: {
        review_enabled: false,
        testing_enabled: false,
        human_gates: [],
        system_level: 'architect',
      },
    });

    const { result, rerender } = renderHook(
      ({ spec }) => useSystemLevel(spec),
      { initialProps: { spec: spec1 } },
    );
    expect(result.current).toBe('explorer');

    rerender({ spec: spec2 });
    expect(result.current).toBe('architect');
  });
});
