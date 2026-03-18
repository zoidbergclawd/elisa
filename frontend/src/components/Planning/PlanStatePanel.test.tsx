import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PlanStatePanel from './PlanStatePanel';
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

describe('PlanStatePanel', () => {
  it('renders the panel', () => {
    render(<PlanStatePanel plan={makePlan()} />);
    expect(screen.getByTestId('plan-state-panel')).toBeInTheDocument();
  });

  // --- Empty plan ---
  it('shows empty state for all primitives when plan is empty', () => {
    render(<PlanStatePanel plan={makePlan()} />);
    expect(screen.getByText('Not yet defined')).toBeInTheDocument();
    expect(screen.getByText('No promises yet')).toBeInTheDocument();
    expect(screen.getByText('No skills yet')).toBeInTheDocument();
    expect(screen.getByText('No portals yet')).toBeInTheDocument();
    expect(screen.getByText('Not yet decided')).toBeInTheDocument();
  });

  it('does not show open questions section when empty', () => {
    render(<PlanStatePanel plan={makePlan()} />);
    expect(screen.queryByText('Open Questions')).not.toBeInTheDocument();
  });

  // --- Goal ---
  it('shows goal description when set', () => {
    render(
      <PlanStatePanel
        plan={makePlan({ goal: { description: 'Build a weather app', confidence: 'rough' } })}
      />,
    );
    expect(screen.getByText('Build a weather app')).toBeInTheDocument();
  });

  it('shows vague confidence badge', () => {
    render(
      <PlanStatePanel
        plan={makePlan({ goal: { description: 'Something', confidence: 'vague' } })}
      />,
    );
    const badge = screen.getByTestId('confidence-badge');
    expect(badge).toHaveTextContent('Vague');
  });

  it('shows rough confidence badge', () => {
    render(
      <PlanStatePanel
        plan={makePlan({ goal: { description: 'Something', confidence: 'rough' } })}
      />,
    );
    expect(screen.getByTestId('confidence-badge')).toHaveTextContent('Rough');
  });

  it('shows solid confidence badge', () => {
    render(
      <PlanStatePanel
        plan={makePlan({ goal: { description: 'Something', confidence: 'solid' } })}
      />,
    );
    expect(screen.getByTestId('confidence-badge')).toHaveTextContent('Solid');
  });

  // --- Promises with nested proofs ---
  it('shows promises with proofs', () => {
    render(
      <PlanStatePanel
        plan={makePlan({
          promises: [
            {
              description: 'Shows temperature',
              category: 'behavior',
              proofs: [{ description: 'Displays Celsius value' }],
            },
            {
              description: 'Handles errors',
              category: 'constraint',
              proofs: [],
            },
          ],
        })}
      />,
    );
    expect(screen.getByText('Shows temperature')).toBeInTheDocument();
    expect(screen.getByText('Displays Celsius value')).toBeInTheDocument();
    expect(screen.getByText('Handles errors')).toBeInTheDocument();
  });

  // --- Skills ---
  it('shows skills with name and description', () => {
    render(
      <PlanStatePanel
        plan={makePlan({
          skills: [{ name: 'API Fetcher', description: 'Fetches data from REST APIs' }],
        })}
      />,
    );
    expect(screen.getByText('API Fetcher')).toBeInTheDocument();
    expect(screen.getByText('- Fetches data from REST APIs')).toBeInTheDocument();
  });

  // --- Portals with subtype badges ---
  it('shows portals with subtype badge', () => {
    render(
      <PlanStatePanel
        plan={makePlan({
          portals: [{ name: 'Weather API', subtype: 'api', description: 'OpenWeather' }],
        })}
      />,
    );
    expect(screen.getByText('Weather API')).toBeInTheDocument();
    expect(screen.getByText('api')).toBeInTheDocument();
  });

  // --- Deploy ---
  it('shows deploy target', () => {
    render(
      <PlanStatePanel
        plan={makePlan({
          deploy: { target: 'web', constraints: ['Must support HTTPS'] },
        })}
      />,
    );
    expect(screen.getByText('web')).toBeInTheDocument();
    expect(screen.getByText('Must support HTTPS')).toBeInTheDocument();
  });

  // --- Open Questions ---
  it('shows open questions when present', () => {
    render(
      <PlanStatePanel
        plan={makePlan({ open_questions: ['What database?', 'Which framework?'] })}
      />,
    );
    expect(screen.getByText('Open Questions')).toBeInTheDocument();
    expect(screen.getByText('What database?')).toBeInTheDocument();
    expect(screen.getByText('Which framework?')).toBeInTheDocument();
  });

  // --- Full plan ---
  it('renders a full plan with all primitives populated', () => {
    const fullPlan = makePlan({
      goal: { description: 'Weather dashboard', confidence: 'solid' },
      promises: [
        { description: 'Shows forecast', category: 'behavior', proofs: [{ description: 'Displays 5-day forecast' }] },
        { description: 'Loads fast', category: 'performance', proofs: [] },
      ],
      skills: [{ name: 'Charts', description: 'Renders chart visualizations' }],
      portals: [{ name: 'OpenWeather', subtype: 'api', description: 'Weather data' }],
      deploy: { target: 'web', constraints: [] },
    });
    render(<PlanStatePanel plan={fullPlan} />);
    expect(screen.getByText('Weather dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('confidence-badge')).toHaveTextContent('Solid');
    expect(screen.getByText('Shows forecast')).toBeInTheDocument();
    expect(screen.getByText('Charts')).toBeInTheDocument();
    expect(screen.getByText('OpenWeather')).toBeInTheDocument();
    expect(screen.getByText('web')).toBeInTheDocument();
  });

  // --- Status dots ---
  it('shows empty status dots for empty sections', () => {
    render(<PlanStatePanel plan={makePlan()} />);
    const dots = screen.getAllByLabelText('empty');
    // Goal, Promises, Skills, Portals, Deploy = 5
    expect(dots.length).toBe(5);
  });

  it('shows decided status dot for solid goal', () => {
    render(
      <PlanStatePanel
        plan={makePlan({ goal: { description: 'Something', confidence: 'solid' } })}
      />,
    );
    expect(screen.getByLabelText('decided')).toBeInTheDocument();
  });

  it('shows partial status dot for rough goal', () => {
    render(
      <PlanStatePanel
        plan={makePlan({ goal: { description: 'Something', confidence: 'rough' } })}
      />,
    );
    expect(screen.getByLabelText('partial')).toBeInTheDocument();
  });
});
