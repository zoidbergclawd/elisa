import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PlanningPanel from './PlanningPanel';
import type { PlanState, PlanningMessage, QuestionWidget } from '../../types';

const emptyPlan: PlanState = {
  idea: '',
  goal: { description: null, confidence: 'vague' },
  promises: [],
  skills: [],
  portals: [],
  deploy: { target: null, constraints: [] },
  open_questions: [],
  ready: false,
  conversation_turn: 0,
};

const readyPlan: PlanState = {
  ...emptyPlan,
  goal: { description: 'Weather app', confidence: 'solid' },
  promises: [
    { description: 'Shows temp', category: 'behavior', proofs: [] },
    { description: 'Fast load', category: 'performance', proofs: [] },
  ],
  skills: [{ name: 'Charts', description: '' }],
  portals: [{ name: 'API', subtype: 'api', description: '' }],
  deploy: { target: 'web', constraints: [] },
  ready: true,
};

const messages: PlanningMessage[] = [
  { role: 'agent', content: 'Hi! What do you want to build?', timestamp: 1000 },
  { role: 'kid', content: 'A weather app', timestamp: 2000 },
];

const question: QuestionWidget = {
  text: 'Which platform?',
  type: 'single_select',
  options: [
    { label: 'Web', value: 'web' },
    { label: 'Mobile', value: 'mobile' },
  ],
};

const defaultProps = {
  status: 'active' as const,
  plan: emptyPlan,
  conversationHistory: [],
  currentQuestion: null,
  isAgentThinking: false,
  error: null,
  onSubmitAnswer: vi.fn(),
  onSubmitMessage: vi.fn(),
  onGenerateCanvas: vi.fn(),
};

describe('PlanningPanel', () => {
  it('renders the Planning Mode header', () => {
    render(<PlanningPanel {...defaultProps} />);
    expect(screen.getByText('Planning Mode')).toBeInTheDocument();
  });

  it('renders conversation messages', () => {
    render(<PlanningPanel {...defaultProps} conversationHistory={messages} />);
    expect(screen.getByText('Hi! What do you want to build?')).toBeInTheDocument();
    expect(screen.getByText('A weather app')).toBeInTheDocument();
  });

  it('renders the plan state panel', () => {
    render(<PlanningPanel {...defaultProps} />);
    expect(screen.getByTestId('plan-state-panel')).toBeInTheDocument();
  });

  it('shows question widget when currentQuestion is set', () => {
    render(<PlanningPanel {...defaultProps} currentQuestion={question} />);
    expect(screen.getByTestId('question-widget-area')).toBeInTheDocument();
    expect(screen.getByText('Which platform?')).toBeInTheDocument();
    expect(screen.getByText('Web')).toBeInTheDocument();
  });

  it('does not show question widget when null', () => {
    render(<PlanningPanel {...defaultProps} />);
    expect(screen.queryByTestId('question-widget-area')).not.toBeInTheDocument();
  });

  it('shows PlanSummaryCard when status is ready', () => {
    render(
      <PlanningPanel {...defaultProps} status="ready" plan={readyPlan} />,
    );
    expect(screen.getByTestId('plan-summary-card')).toBeInTheDocument();
    expect(screen.getByText('Generate Canvas')).toBeInTheDocument();
  });

  it('does not show PlanSummaryCard when status is active', () => {
    render(<PlanningPanel {...defaultProps} status="active" />);
    expect(screen.queryByTestId('plan-summary-card')).not.toBeInTheDocument();
  });

  it('calls onGenerateCanvas when Generate Canvas is clicked', () => {
    const onGenerate = vi.fn();
    render(
      <PlanningPanel
        {...defaultProps}
        status="ready"
        plan={readyPlan}
        onGenerateCanvas={onGenerate}
      />,
    );
    fireEvent.click(screen.getByText('Generate Canvas'));
    expect(onGenerate).toHaveBeenCalledOnce();
  });

  it('shows error when set', () => {
    render(<PlanningPanel {...defaultProps} error="Something went wrong" />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('shows generating indicator when status is generating', () => {
    render(<PlanningPanel {...defaultProps} status="generating" />);
    expect(screen.getByText('Generating canvas...')).toBeInTheDocument();
  });

  it('sends message via chat input', () => {
    const onSubmitMessage = vi.fn();
    render(<PlanningPanel {...defaultProps} onSubmitMessage={onSubmitMessage} />);
    const input = screen.getByLabelText('Message input');
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.submit(input.closest('form')!);
    expect(onSubmitMessage).toHaveBeenCalledWith('Hello');
  });
});
