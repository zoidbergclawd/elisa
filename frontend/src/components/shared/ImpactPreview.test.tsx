import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ImpactPreview from './ImpactPreview';

describe('ImpactPreview', () => {
  // --- Existing static tests ---
  it('renders estimated task count', () => {
    render(
      <ImpactPreview
        estimate={{
          estimated_tasks: 5,
          complexity: 'moderate',
          heaviest_requirements: [],
        }}
      />,
    );
    expect(screen.getByText('~5')).toBeInTheDocument();
  });

  it('renders complexity label', () => {
    render(
      <ImpactPreview
        estimate={{
          estimated_tasks: 3,
          complexity: 'simple',
          heaviest_requirements: [],
        }}
      />,
    );
    expect(screen.getByText('Simple')).toBeInTheDocument();
  });

  it('renders heaviest requirements', () => {
    render(
      <ImpactPreview
        estimate={{
          estimated_tasks: 8,
          complexity: 'complex',
          heaviest_requirements: ['Build game board', 'Implement physics'],
        }}
      />,
    );
    expect(screen.getByText('- Build game board')).toBeInTheDocument();
    expect(screen.getByText('- Implement physics')).toBeInTheDocument();
  });

  it('does not render requirements section when empty', () => {
    render(
      <ImpactPreview
        estimate={{
          estimated_tasks: 1,
          complexity: 'simple',
          heaviest_requirements: [],
        }}
      />,
    );
    expect(screen.queryByText('Most work comes from:')).not.toBeInTheDocument();
  });

  it('renders build preview header', () => {
    render(
      <ImpactPreview
        estimate={{
          estimated_tasks: 3,
          complexity: 'moderate',
          heaviest_requirements: [],
        }}
      />,
    );
    expect(screen.getByText('Build Preview')).toBeInTheDocument();
  });

  // --- Hover-to-highlight tests ---
  it('shows tooltip on requirement hover', () => {
    render(
      <ImpactPreview
        estimate={{
          estimated_tasks: 5,
          complexity: 'moderate',
          heaviest_requirements: ['Build game board', 'Add scoring'],
          requirement_details: [
            { description: 'Build game board', estimated_task_count: 2, test_linked: true, weight: 3, dependents: 2 },
            { description: 'Add scoring', estimated_task_count: 1, test_linked: false, weight: 1, dependents: 0 },
          ],
        }}
      />,
    );

    // No tooltip initially
    expect(screen.queryByTestId('req-tooltip')).not.toBeInTheDocument();

    // Hover over first requirement
    fireEvent.mouseEnter(screen.getByTestId('req-item-0'));

    // Tooltip should appear with task count and test coverage info
    const tooltip = screen.getByTestId('req-tooltip');
    expect(tooltip).toBeInTheDocument();
    expect(tooltip.textContent).toContain('~2 tasks');
    expect(tooltip.textContent).toContain('test coverage');
  });

  it('shows dependent count in tooltip when requirement has dependents', () => {
    render(
      <ImpactPreview
        estimate={{
          estimated_tasks: 5,
          complexity: 'moderate',
          heaviest_requirements: ['Build game board'],
          requirement_details: [
            { description: 'Build game board', estimated_task_count: 2, test_linked: true, weight: 3, dependents: 2 },
            { description: 'Add scoring', estimated_task_count: 1, test_linked: false, weight: 1, dependents: 0 },
          ],
        }}
      />,
    );

    fireEvent.mouseEnter(screen.getByTestId('req-item-0'));
    const tooltip = screen.getByTestId('req-tooltip');
    expect(tooltip.textContent).toContain('2 of your requirements depend on this');
  });

  it('hides tooltip when mouse leaves requirement', () => {
    render(
      <ImpactPreview
        estimate={{
          estimated_tasks: 5,
          complexity: 'moderate',
          heaviest_requirements: ['Build game board'],
          requirement_details: [
            { description: 'Build game board', estimated_task_count: 2, test_linked: true, weight: 3, dependents: 1 },
          ],
        }}
      />,
    );

    fireEvent.mouseEnter(screen.getByTestId('req-item-0'));
    expect(screen.getByTestId('req-tooltip')).toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByTestId('req-item-0'));
    expect(screen.queryByTestId('req-tooltip')).not.toBeInTheDocument();
  });

  // --- Dependency awareness prompts ---
  it('shows dependency prompt for heaviest requirement', () => {
    render(
      <ImpactPreview
        estimate={{
          estimated_tasks: 5,
          complexity: 'moderate',
          heaviest_requirements: ['Build game board'],
          requirement_details: [
            { description: 'Build game board', estimated_task_count: 2, test_linked: true, weight: 3, dependents: 2 },
            { description: 'Add scoring', estimated_task_count: 1, test_linked: false, weight: 1, dependents: 0 },
          ],
        }}
      />,
    );

    const prompt = screen.getByTestId('dependency-prompt');
    expect(prompt).toBeInTheDocument();
    expect(prompt.textContent).toContain('is the most connected part of your system');
  });

  it('shows "requires the most work" when heaviest has no dependents', () => {
    render(
      <ImpactPreview
        estimate={{
          estimated_tasks: 3,
          complexity: 'moderate',
          heaviest_requirements: ['Long requirement text here'],
          requirement_details: [
            { description: 'Long requirement text here', estimated_task_count: 2, test_linked: false, weight: 2, dependents: 0 },
            { description: 'Short req', estimated_task_count: 1, test_linked: false, weight: 1, dependents: 0 },
          ],
        }}
      />,
    );

    const prompt = screen.getByTestId('dependency-prompt');
    expect(prompt.textContent).toContain('requires the most work');
  });

  it('hides dependency prompt when hovering a requirement', () => {
    render(
      <ImpactPreview
        estimate={{
          estimated_tasks: 5,
          complexity: 'moderate',
          heaviest_requirements: ['Build game board'],
          requirement_details: [
            { description: 'Build game board', estimated_task_count: 2, test_linked: true, weight: 3, dependents: 2 },
            { description: 'Add scoring', estimated_task_count: 1, test_linked: false, weight: 1, dependents: 0 },
          ],
        }}
      />,
    );

    expect(screen.getByTestId('dependency-prompt')).toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByTestId('req-item-0'));
    expect(screen.queryByTestId('dependency-prompt')).not.toBeInTheDocument();
  });

  // --- Mini complexity bar chart ---
  it('renders complexity bar chart when multiple requirements exist', () => {
    render(
      <ImpactPreview
        estimate={{
          estimated_tasks: 5,
          complexity: 'moderate',
          heaviest_requirements: ['Build game board'],
          requirement_details: [
            { description: 'Build game board', estimated_task_count: 2, test_linked: true, weight: 3, dependents: 1 },
            { description: 'Add scoring', estimated_task_count: 1, test_linked: false, weight: 1, dependents: 0 },
          ],
        }}
      />,
    );

    expect(screen.getByTestId('complexity-chart')).toBeInTheDocument();
    expect(screen.getByTestId('bar-0')).toBeInTheDocument();
    expect(screen.getByTestId('bar-1')).toBeInTheDocument();
  });

  it('does not render complexity chart with single requirement', () => {
    render(
      <ImpactPreview
        estimate={{
          estimated_tasks: 2,
          complexity: 'simple',
          heaviest_requirements: ['Solo requirement'],
          requirement_details: [
            { description: 'Solo requirement', estimated_task_count: 1, test_linked: false, weight: 1, dependents: 0 },
          ],
        }}
      />,
    );

    expect(screen.queryByTestId('complexity-chart')).not.toBeInTheDocument();
  });

  it('highlights bar on hover and shows tooltip', () => {
    render(
      <ImpactPreview
        estimate={{
          estimated_tasks: 5,
          complexity: 'moderate',
          heaviest_requirements: ['Build game board', 'Add scoring'],
          requirement_details: [
            { description: 'Build game board', estimated_task_count: 2, test_linked: false, weight: 3, dependents: 0 },
            { description: 'Add scoring', estimated_task_count: 1, test_linked: false, weight: 1, dependents: 0 },
          ],
        }}
      />,
    );

    // Hover on bar
    fireEvent.mouseEnter(screen.getByTestId('bar-1'));

    // Tooltip should appear for that requirement
    const tooltip = screen.getByTestId('req-tooltip');
    expect(tooltip).toBeInTheDocument();
    expect(tooltip.textContent).toContain('~1 task');
  });

  // --- Backwards compatibility ---
  it('works without requirement_details (backwards compat)', () => {
    render(
      <ImpactPreview
        estimate={{
          estimated_tasks: 5,
          complexity: 'moderate',
          heaviest_requirements: ['Build game board', 'Add scoring'],
        }}
      />,
    );

    // Should render the basic view without chart or prompts
    expect(screen.getByText('~5')).toBeInTheDocument();
    expect(screen.getByText('Moderate')).toBeInTheDocument();
    expect(screen.getByText('- Build game board')).toBeInTheDocument();
    expect(screen.queryByTestId('complexity-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dependency-prompt')).not.toBeInTheDocument();
  });
});
