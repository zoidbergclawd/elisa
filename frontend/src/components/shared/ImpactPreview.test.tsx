import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ImpactPreview from './ImpactPreview';

describe('ImpactPreview', () => {
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
});
