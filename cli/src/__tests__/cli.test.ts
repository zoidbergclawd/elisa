import { describe, it, expect } from 'vitest';
import { createProgram } from '../cli.js';

describe('CLI program', () => {
  it('creates a commander program with name "elisa"', () => {
    const program = createProgram();
    expect(program.name()).toBe('elisa');
  });

  it('has a "build" command', () => {
    const program = createProgram();
    const buildCmd = program.commands.find((c) => c.name() === 'build');
    expect(buildCmd).toBeDefined();
  });

  it('has a "status" command', () => {
    const program = createProgram();
    const statusCmd = program.commands.find((c) => c.name() === 'status');
    expect(statusCmd).toBeDefined();
  });

  it('has a "stop" command', () => {
    const program = createProgram();
    const stopCmd = program.commands.find((c) => c.name() === 'stop');
    expect(stopCmd).toBeDefined();
  });
});
