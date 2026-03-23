import { describe, it, expect } from 'vitest';
import {
  getLevel,
  getTestGateThreshold,
  getMaxAutoFixAttempts,
  shouldAutoMatchTests,
  getNarrationLevel,
  getDAGDetailLevel,
  getMaxNuggets,
  checkProgression,
  getProgressionProgress,
} from './systemLevelService.js';

describe('getTestGateThreshold', () => {
  it('returns null for explorer', () => {
    expect(getTestGateThreshold('explorer')).toBeNull();
  });

  it('returns 0.5 for builder', () => {
    expect(getTestGateThreshold('builder')).toBe(0.5);
  });

  it('returns 0.8 for architect', () => {
    expect(getTestGateThreshold('architect')).toBe(0.8);
  });
});

describe('getMaxAutoFixAttempts', () => {
  it('returns 0 for explorer', () => {
    expect(getMaxAutoFixAttempts('explorer')).toBe(0);
  });

  it('returns 1 for builder', () => {
    expect(getMaxAutoFixAttempts('builder')).toBe(1);
  });

  it('returns 2 for architect', () => {
    expect(getMaxAutoFixAttempts('architect')).toBe(2);
  });
});

describe('getLevel', () => {
  it('defaults to explorer when no system_level', () => {
    expect(getLevel({})).toBe('explorer');
  });

  it('returns builder when specified', () => {
    expect(getLevel({ workflow: { system_level: 'builder' } })).toBe('builder');
  });

  it('returns architect when specified', () => {
    expect(getLevel({ workflow: { system_level: 'architect' } })).toBe('architect');
  });
});
