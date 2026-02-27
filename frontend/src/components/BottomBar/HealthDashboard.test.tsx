import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HealthDashboard from './HealthDashboard';

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
});
