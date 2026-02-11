import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BoardOutput from './BoardOutput';

describe('BoardOutput', () => {
  it('shows empty state when no serial lines', () => {
    render(<BoardOutput serialLines={[]} />);
    expect(screen.getByText('Connect your board to see its output')).toBeInTheDocument();
  });

  it('renders serial lines with timestamps', () => {
    const lines = [
      { line: 'Hello from board', timestamp: '2026-02-10T12:00:00Z' },
      { line: 'LED on', timestamp: '2026-02-10T12:00:01Z' },
    ];
    render(<BoardOutput serialLines={lines} />);
    expect(screen.getByText('Hello from board')).toBeInTheDocument();
    expect(screen.getByText('LED on')).toBeInTheDocument();
  });

  it('renders multiple lines', () => {
    const lines = [
      { line: 'Line 1', timestamp: '2026-02-10T12:00:00Z' },
      { line: 'Line 2', timestamp: '2026-02-10T12:00:01Z' },
      { line: 'Line 3', timestamp: '2026-02-10T12:00:02Z' },
    ];
    render(<BoardOutput serialLines={lines} />);
    expect(screen.getByText('Line 1')).toBeInTheDocument();
    expect(screen.getByText('Line 3')).toBeInTheDocument();
  });
});
