import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MetricsPanel from './MetricsPanel';
import type { TokenUsage } from '../../types';

describe('MetricsPanel', () => {
  it('shows empty state when total is 0', () => {
    const usage: TokenUsage = { input: 0, output: 0, total: 0, costUsd: 0, maxBudget: 500_000, perAgent: {} };
    render(<MetricsPanel tokenUsage={usage} />);
    expect(screen.getByText('No token data yet')).toBeInTheDocument();
  });

  it('shows total tokens formatted', () => {
    const usage: TokenUsage = {
      input: 1000,
      output: 500,
      total: 1500,
      costUsd: 0.01,
      maxBudget: 500_000,
      perAgent: { Sparky: { input: 1000, output: 500 } },
    };
    render(<MetricsPanel tokenUsage={usage} />);
    expect(screen.getByText(/Total tokens: 1,500/)).toBeInTheDocument();
  });

  it('shows input/output split', () => {
    const usage: TokenUsage = {
      input: 2000,
      output: 1000,
      total: 3000,
      costUsd: 0,
      maxBudget: 500_000,
      perAgent: {},
    };
    render(<MetricsPanel tokenUsage={usage} />);
    expect(screen.getByText(/Input: 2,000/)).toBeInTheDocument();
    expect(screen.getByText(/Output: 1,000/)).toBeInTheDocument();
  });

  it('shows per-agent breakdown', () => {
    const usage: TokenUsage = {
      input: 300,
      output: 150,
      total: 450,
      costUsd: 0.005,
      maxBudget: 500_000,
      perAgent: {
        Sparky: { input: 100, output: 50 },
        Checkers: { input: 200, output: 100 },
      },
    };
    render(<MetricsPanel tokenUsage={usage} />);
    expect(screen.getByText('Sparky')).toBeInTheDocument();
    expect(screen.getByText('Checkers')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('300')).toBeInTheDocument();
  });
});
