import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PlanSummaryCard from './PlanSummaryCard';
import type { PlanState } from '../../types';

function makePlan(overrides: Partial<PlanState> = {}): PlanState {
  return {
    idea: '',
    goal: { description: null, confidence: 'vague' },
    promises: [],
    skills: [],
    portals: [],
    deploy: { target: null, constraints: [] },
    open_questions: [],
    ready: false,
    conversation_turn: 0,
    ...overrides,
  };
}

const readyPlan = makePlan({
  goal: { description: 'Weather app', confidence: 'solid' },
  promises: [
    { description: 'Shows temp', category: 'behavior', proofs: [] },
    { description: 'Fast load', category: 'performance', proofs: [] },
  ],
  skills: [{ name: 'Charts', description: '' }],
  portals: [{ name: 'API', subtype: 'api', description: '' }],
  deploy: { target: 'web', constraints: [] },
  ready: true,
});

const incomplePlan = makePlan({
  goal: { description: 'Something', confidence: 'rough' },
  promises: [{ description: 'One promise', category: 'behavior', proofs: [] }],
});

describe('PlanSummaryCard', () => {
  it('renders the card', () => {
    render(
      <PlanSummaryCard
        plan={readyPlan}
        summary="Your plan looks good!"
        onGenerateCanvas={vi.fn()}
        onAskMore={vi.fn()}
      />,
    );
    expect(screen.getByTestId('plan-summary-card')).toBeInTheDocument();
  });

  it('renders summary text', () => {
    render(
      <PlanSummaryCard
        plan={readyPlan}
        summary="Your plan looks good!"
        onGenerateCanvas={vi.fn()}
        onAskMore={vi.fn()}
      />,
    );
    expect(screen.getByText('Your plan looks good!')).toBeInTheDocument();
  });

  it('renders readiness checklist', () => {
    render(
      <PlanSummaryCard
        plan={readyPlan}
        summary="Ready"
        onGenerateCanvas={vi.fn()}
        onAskMore={vi.fn()}
      />,
    );
    expect(screen.getByText('Goal is solid')).toBeInTheDocument();
    expect(screen.getByText('2+ promises')).toBeInTheDocument();
    expect(screen.getByText('1+ portal')).toBeInTheDocument();
    expect(screen.getByText('1+ skill')).toBeInTheDocument();
    expect(screen.getByText('Deploy target set')).toBeInTheDocument();
  });

  it('shows all checks as met for a ready plan', () => {
    render(
      <PlanSummaryCard
        plan={readyPlan}
        summary="Ready"
        onGenerateCanvas={vi.fn()}
        onAskMore={vi.fn()}
      />,
    );
    const list = screen.getByRole('list', { name: 'Readiness checklist' });
    const items = list.querySelectorAll('li');
    items.forEach((item) => {
      expect(item.textContent).toContain('\u2713');
    });
  });

  it('shows unmet checks for incomplete plan', () => {
    render(
      <PlanSummaryCard
        plan={incomplePlan}
        summary="Not ready yet"
        onGenerateCanvas={vi.fn()}
        onAskMore={vi.fn()}
      />,
    );
    // Goal is rough, not solid -- should show X
    const goalCheck = screen.getByText('Goal is solid').closest('li');
    expect(goalCheck?.textContent).toContain('\u2717');
  });

  it('enables Generate Canvas button when all checks pass', () => {
    render(
      <PlanSummaryCard
        plan={readyPlan}
        summary="Ready"
        onGenerateCanvas={vi.fn()}
        onAskMore={vi.fn()}
      />,
    );
    expect(screen.getByText('Generate Canvas')).not.toBeDisabled();
  });

  it('shows hint but keeps Generate Canvas enabled when checks are incomplete', () => {
    render(
      <PlanSummaryCard
        plan={incomplePlan}
        summary="Not ready"
        onGenerateCanvas={vi.fn()}
        onAskMore={vi.fn()}
      />,
    );
    expect(screen.getByText('Generate Canvas')).toBeEnabled();
    expect(screen.getByText(/some criteria are unmet/i)).toBeInTheDocument();
  });

  it('calls onGenerateCanvas when Generate Canvas is clicked', () => {
    const onGenerate = vi.fn();
    render(
      <PlanSummaryCard
        plan={readyPlan}
        summary="Ready"
        onGenerateCanvas={onGenerate}
        onAskMore={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Generate Canvas'));
    expect(onGenerate).toHaveBeenCalledOnce();
  });

  it('calls onAskMore when Ask me more is clicked', () => {
    const onAskMore = vi.fn();
    render(
      <PlanSummaryCard
        plan={readyPlan}
        summary="Ready"
        onGenerateCanvas={vi.fn()}
        onAskMore={onAskMore}
      />,
    );
    fireEvent.click(screen.getByText('Ask me more'));
    expect(onAskMore).toHaveBeenCalledOnce();
  });

  it('renders both buttons', () => {
    render(
      <PlanSummaryCard
        plan={readyPlan}
        summary="Ready"
        onGenerateCanvas={vi.fn()}
        onAskMore={vi.fn()}
      />,
    );
    expect(screen.getByText('Generate Canvas')).toBeInTheDocument();
    expect(screen.getByText('Ask me more')).toBeInTheDocument();
  });
});
