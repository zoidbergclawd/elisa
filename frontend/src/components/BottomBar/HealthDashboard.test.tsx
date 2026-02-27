import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HealthDashboard from './HealthDashboard';
import type { HealthHistoryEntry } from '../../types';

describe('HealthDashboard', () => {
  it('renders empty state when no data', () => {
    render(<HealthDashboard healthUpdate={null} healthSummary={null} />);
    expect(screen.getByText('Health data will appear during a build')).toBeInTheDocument();
  });

  it('renders real-time health update', () => {
    render(
      <HealthDashboard
        healthUpdate={{
          tasks_done: 3,
          tasks_total: 5,
          tests_passing: 7,
          tests_total: 10,
          tokens_used: 50000,
          health_score: 65,
        }}
        healthSummary={null}
      />,
    );
    expect(screen.getByText('Score: 65')).toBeInTheDocument();
    expect(screen.getByText('3/5')).toBeInTheDocument();
    expect(screen.getByText('7/10')).toBeInTheDocument();
    expect(screen.getByText('Tokens used: 50,000')).toBeInTheDocument();
  });

  it('renders health summary with grade', () => {
    render(
      <HealthDashboard
        healthUpdate={null}
        healthSummary={{
          health_score: 90,
          grade: 'A',
          breakdown: {
            tasks_score: 30,
            tests_score: 40,
            corrections_score: 10,
            budget_score: 10,
          },
        }}
      />,
    );
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('90')).toBeInTheDocument();
    expect(screen.getByText('30/30')).toBeInTheDocument();
    expect(screen.getByText('40/40')).toBeInTheDocument();
  });

  it('prefers summary over update when both present', () => {
    render(
      <HealthDashboard
        healthUpdate={{
          tasks_done: 1,
          tasks_total: 2,
          tests_passing: 1,
          tests_total: 1,
          tokens_used: 1000,
          health_score: 50,
        }}
        healthSummary={{
          health_score: 85,
          grade: 'B',
          breakdown: {
            tasks_score: 25,
            tests_score: 35,
            corrections_score: 15,
            budget_score: 10,
          },
        }}
      />,
    );
    // Should show summary grade, not update score
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('85')).toBeInTheDocument();
    expect(screen.queryByText('Score: 50')).not.toBeInTheDocument();
  });

  it('renders breakdown labels', () => {
    render(
      <HealthDashboard
        healthUpdate={null}
        healthSummary={{
          health_score: 70,
          grade: 'C',
          breakdown: {
            tasks_score: 20,
            tests_score: 30,
            corrections_score: 10,
            budget_score: 10,
          },
        }}
      />,
    );
    expect(screen.getByText('Tasks completed')).toBeInTheDocument();
    expect(screen.getByText('Tests passing')).toBeInTheDocument();
    expect(screen.getByText('No corrections needed')).toBeInTheDocument();
    expect(screen.getByText('Under budget')).toBeInTheDocument();
  });

  // -- Health history trend tests --

  const sampleHistory: HealthHistoryEntry[] = [
    { timestamp: '2026-01-10T12:00:00Z', goal: 'Snake v1', score: 60, grade: 'D', breakdown: { tasks: 20, tests: 20, corrections: 10, budget: 10 } },
    { timestamp: '2026-01-15T12:00:00Z', goal: 'Snake v2', score: 80, grade: 'B', breakdown: { tasks: 30, tests: 30, corrections: 10, budget: 10 } },
    { timestamp: '2026-01-20T12:00:00Z', goal: 'Snake v3', score: 95, grade: 'A', breakdown: { tasks: 30, tests: 40, corrections: 15, budget: 10 } },
  ];

  it('does not show trend section at explorer level', () => {
    render(
      <HealthDashboard
        healthUpdate={null}
        healthSummary={{ health_score: 90, grade: 'A', breakdown: { tasks_score: 30, tests_score: 40, corrections_score: 10, budget_score: 10 } }}
        healthHistory={sampleHistory}
        systemLevel="explorer"
      />,
    );
    expect(screen.queryByText('Trend')).not.toBeInTheDocument();
  });

  it('does not show trend section at builder level', () => {
    render(
      <HealthDashboard
        healthUpdate={null}
        healthSummary={{ health_score: 90, grade: 'A', breakdown: { tasks_score: 30, tests_score: 40, corrections_score: 10, budget_score: 10 } }}
        healthHistory={sampleHistory}
        systemLevel="builder"
      />,
    );
    expect(screen.queryByText('Trend')).not.toBeInTheDocument();
  });

  it('shows trend section at architect level with history', () => {
    render(
      <HealthDashboard
        healthUpdate={null}
        healthSummary={{ health_score: 90, grade: 'A', breakdown: { tasks_score: 30, tests_score: 40, corrections_score: 10, budget_score: 10 } }}
        healthHistory={sampleHistory}
        systemLevel="architect"
      />,
    );
    expect(screen.getByText('Trend')).toBeInTheDocument();
  });

  it('does not show trend when history is empty at architect level', () => {
    render(
      <HealthDashboard
        healthUpdate={null}
        healthSummary={{ health_score: 90, grade: 'A', breakdown: { tasks_score: 30, tests_score: 40, corrections_score: 10, budget_score: 10 } }}
        healthHistory={[]}
        systemLevel="architect"
      />,
    );
    expect(screen.queryByText('Trend')).not.toBeInTheDocument();
  });

  it('renders grade labels for each history entry in trend', () => {
    render(
      <HealthDashboard
        healthUpdate={null}
        healthSummary={{ health_score: 95, grade: 'A', breakdown: { tasks_score: 30, tests_score: 40, corrections_score: 15, budget_score: 10 } }}
        healthHistory={sampleHistory}
        systemLevel="architect"
      />,
    );
    // The trend shows grade labels; summary also shows 'A'
    // We should have D, B from trend bars, plus A from both the summary grade and the trend
    const allDElements = screen.getAllByText('D');
    expect(allDElements.length).toBeGreaterThanOrEqual(1);
    const allBElements = screen.getAllByText('B');
    expect(allBElements.length).toBeGreaterThanOrEqual(1);
  });

  it('does not show trend in live update mode even at architect level', () => {
    render(
      <HealthDashboard
        healthUpdate={{
          tasks_done: 2,
          tasks_total: 5,
          tests_passing: 3,
          tests_total: 5,
          tokens_used: 10000,
          health_score: 40,
        }}
        healthSummary={null}
        healthHistory={sampleHistory}
        systemLevel="architect"
      />,
    );
    // Trend only shows in summary view
    expect(screen.queryByText('Trend')).not.toBeInTheDocument();
  });
});
