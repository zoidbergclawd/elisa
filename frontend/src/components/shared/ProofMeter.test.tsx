import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProofMeter from './ProofMeter';
import type { TraceabilitySummary } from '../../types';

describe('ProofMeter', () => {
  it('renders nothing when requirements array is empty', () => {
    const traceability: TraceabilitySummary = { coverage: 0, requirements: [] };
    const { container } = render(<ProofMeter traceability={traceability} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders progress bar with correct label', () => {
    const traceability: TraceabilitySummary = {
      coverage: 100,
      requirements: [
        { requirement_id: 'req-0', description: 'Req A', status: 'passing' },
      ],
    };
    render(<ProofMeter traceability={traceability} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText('1/1 proven')).toBeInTheDocument();
  });

  it('renders correct counts for mixed statuses', () => {
    const traceability: TraceabilitySummary = {
      coverage: 50,
      requirements: [
        { requirement_id: 'req-0', description: 'A', status: 'passing' },
        { requirement_id: 'req-1', description: 'B', status: 'failing' },
        { requirement_id: 'req-2', description: 'C', status: 'untested' },
        { requirement_id: 'req-3', description: 'D', status: 'passing' },
      ],
    };
    render(<ProofMeter traceability={traceability} />);
    expect(screen.getByText('2/4 proven')).toBeInTheDocument();
  });

  it('has accessible aria-label', () => {
    const traceability: TraceabilitySummary = {
      coverage: 67,
      requirements: [
        { requirement_id: 'req-0', description: 'A', status: 'passing' },
        { requirement_id: 'req-1', description: 'B', status: 'passing' },
        { requirement_id: 'req-2', description: 'C', status: 'untested' },
      ],
    };
    render(<ProofMeter traceability={traceability} />);
    expect(screen.getByLabelText('2 of 3 requirements verified')).toBeInTheDocument();
  });

  it('renders green segment for passing requirements', () => {
    const traceability: TraceabilitySummary = {
      coverage: 100,
      requirements: [
        { requirement_id: 'req-0', description: 'A', status: 'passing' },
      ],
    };
    const { container } = render(<ProofMeter traceability={traceability} />);
    const greenSegment = container.querySelector('.bg-accent-mint');
    expect(greenSegment).toBeInTheDocument();
  });

  it('renders red segment for failing requirements', () => {
    const traceability: TraceabilitySummary = {
      coverage: 0,
      requirements: [
        { requirement_id: 'req-0', description: 'A', status: 'failing' },
      ],
    };
    const { container } = render(<ProofMeter traceability={traceability} />);
    const redSegment = container.querySelector('.bg-accent-coral');
    expect(redSegment).toBeInTheDocument();
  });

  it('renders amber segment for untested requirements', () => {
    const traceability: TraceabilitySummary = {
      coverage: 0,
      requirements: [
        { requirement_id: 'req-0', description: 'A', status: 'untested' },
      ],
    };
    const { container } = render(<ProofMeter traceability={traceability} />);
    const amberSegment = container.querySelector('.bg-amber-400');
    expect(amberSegment).toBeInTheDocument();
  });

  it('renders all three segments for mixed statuses', () => {
    const traceability: TraceabilitySummary = {
      coverage: 33,
      requirements: [
        { requirement_id: 'req-0', description: 'A', status: 'passing' },
        { requirement_id: 'req-1', description: 'B', status: 'failing' },
        { requirement_id: 'req-2', description: 'C', status: 'untested' },
      ],
    };
    const { container } = render(<ProofMeter traceability={traceability} />);
    expect(container.querySelector('.bg-accent-mint')).toBeInTheDocument();
    expect(container.querySelector('.bg-accent-coral')).toBeInTheDocument();
    expect(container.querySelector('.bg-amber-400')).toBeInTheDocument();
  });
});
