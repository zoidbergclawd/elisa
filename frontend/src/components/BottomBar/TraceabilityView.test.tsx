import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TraceabilityView from './TraceabilityView';
import type { TraceabilitySummary } from '../../types';

describe('TraceabilityView', () => {
  it('shows empty state when no traceability data', () => {
    render(<TraceabilityView traceability={null} />);
    expect(screen.getByText('No requirement traceability data yet')).toBeInTheDocument();
  });

  it('shows empty state when requirements array is empty', () => {
    render(<TraceabilityView traceability={{ coverage: 0, requirements: [] }} />);
    expect(screen.getByText('No requirement traceability data yet')).toBeInTheDocument();
  });

  it('renders requirements with passing status', () => {
    const traceability: TraceabilitySummary = {
      coverage: 100,
      requirements: [
        { requirement_id: 'req-0', description: 'Login should work', test_id: 'test-login', test_name: 'When login then dashboard', status: 'passing' },
      ],
    };
    render(<TraceabilityView traceability={traceability} />);
    expect(screen.getByText('Login should work')).toBeInTheDocument();
    expect(screen.getByText('When login then dashboard')).toBeInTheDocument();
    expect(screen.getByText('PASS')).toBeInTheDocument();
  });

  it('renders requirements with failing status', () => {
    const traceability: TraceabilitySummary = {
      coverage: 0,
      requirements: [
        { requirement_id: 'req-0', description: 'Auth check', test_id: 'test-auth', test_name: 'When auth then ok', status: 'failing' },
      ],
    };
    render(<TraceabilityView traceability={traceability} />);
    expect(screen.getByText('Auth check')).toBeInTheDocument();
    expect(screen.getByText('FAIL')).toBeInTheDocument();
  });

  it('renders requirements with untested status showing ???', () => {
    const traceability: TraceabilitySummary = {
      coverage: 0,
      requirements: [
        { requirement_id: 'req-0', description: 'No test yet', status: 'untested' },
      ],
    };
    render(<TraceabilityView traceability={traceability} />);
    expect(screen.getByText('No test yet')).toBeInTheDocument();
    expect(screen.getByText('???')).toBeInTheDocument();
  });

  it('renders mixed statuses correctly', () => {
    const traceability: TraceabilitySummary = {
      coverage: 33,
      requirements: [
        { requirement_id: 'req-0', description: 'Passing req', test_id: 'test-pass', test_name: 'pass test', status: 'passing' },
        { requirement_id: 'req-1', description: 'Failing req', test_id: 'test-fail', test_name: 'fail test', status: 'failing' },
        { requirement_id: 'req-2', description: 'Untested req', status: 'untested' },
      ],
    };
    render(<TraceabilityView traceability={traceability} />);
    expect(screen.getByText('PASS')).toBeInTheDocument();
    expect(screen.getByText('FAIL')).toBeInTheDocument();
    expect(screen.getByText('???')).toBeInTheDocument();
    expect(screen.getByText('1/3 proven')).toBeInTheDocument();
  });

  it('shows -- for requirements without test_id or test_name', () => {
    const traceability: TraceabilitySummary = {
      coverage: 0,
      requirements: [
        { requirement_id: 'req-0', description: 'No test linked', status: 'untested' },
      ],
    };
    render(<TraceabilityView traceability={traceability} />);
    expect(screen.getByText('--')).toBeInTheDocument();
  });

  it('renders ProofMeter within the view', () => {
    const traceability: TraceabilitySummary = {
      coverage: 50,
      requirements: [
        { requirement_id: 'req-0', description: 'Req A', test_id: 'test-a', status: 'passing' },
        { requirement_id: 'req-1', description: 'Req B', status: 'untested' },
      ],
    };
    render(<TraceabilityView traceability={traceability} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText('1/2 proven')).toBeInTheDocument();
  });
});
