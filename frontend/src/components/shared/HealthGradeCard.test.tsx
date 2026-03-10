import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HealthGradeCard from './HealthGradeCard';

const defaultBreakdown = {
  tasks_score: 25,
  tests_score: 35,
  corrections_score: 15,
  budget_score: 8,
};

describe('HealthGradeCard', () => {
  it('renders grade letter with correct color class', () => {
    render(
      <HealthGradeCard grade="A" score={90} breakdown={defaultBreakdown} />,
    );
    const gradeEl = screen.getByText('A');
    expect(gradeEl).toBeInTheDocument();
    expect(gradeEl.className).toContain('text-accent-mint');

    // Verify B uses sky
    const { container: c2 } = render(
      <HealthGradeCard grade="B" score={80} breakdown={defaultBreakdown} />,
    );
    const gradeB = c2.querySelector('[data-testid="health-grade-card"]')!.querySelector('.text-accent-sky');
    expect(gradeB).toBeInTheDocument();
  });

  it('renders score', () => {
    render(<HealthGradeCard grade="A" score={92} breakdown={defaultBreakdown} />);
    expect(screen.getByText('92')).toBeInTheDocument();
    expect(screen.getByText('Health Score')).toBeInTheDocument();
  });

  it('renders all 4 breakdown bars with labels and values', () => {
    render(<HealthGradeCard grade="B" score={83} breakdown={defaultBreakdown} />);
    expect(screen.getByText('Tasks completed')).toBeInTheDocument();
    expect(screen.getByText('25/30')).toBeInTheDocument();
    expect(screen.getByText('Tests passing')).toBeInTheDocument();
    expect(screen.getByText('35/40')).toBeInTheDocument();
    expect(screen.getByText('No corrections needed')).toBeInTheDocument();
    expect(screen.getByText('15/20')).toBeInTheDocument();
    expect(screen.getByText('Under budget')).toBeInTheDocument();
    expect(screen.getByText('8/10')).toBeInTheDocument();
  });

  it('compact mode applies smaller text sizes', () => {
    const { container: compactContainer } = render(
      <HealthGradeCard grade="A" score={90} breakdown={defaultBreakdown} compact />,
    );
    const gradeEl = compactContainer.querySelector('[data-testid="health-grade-card"]')!;
    // Compact uses text-xl for grade, text-lg for score
    expect(gradeEl.innerHTML).toContain('text-xl');
    expect(gradeEl.innerHTML).toContain('text-lg');

    const { container: normalContainer } = render(
      <HealthGradeCard grade="A" score={90} breakdown={defaultBreakdown} />,
    );
    const normalEl = normalContainer.querySelector('[data-testid="health-grade-card"]')!;
    // Normal uses text-3xl for grade, text-2xl for score
    expect(normalEl.innerHTML).toContain('text-3xl');
    expect(normalEl.innerHTML).toContain('text-2xl');
  });
});
