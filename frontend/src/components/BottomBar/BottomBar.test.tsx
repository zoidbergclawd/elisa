import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BottomBar from './BottomBar';
import type { Commit } from '../../types';

describe('BottomBar', () => {
  it('renders all tab buttons', () => {
    render(<BottomBar commits={[]} />);
    expect(screen.getByText('Timeline')).toBeInTheDocument();
    expect(screen.getByText('Tests')).toBeInTheDocument();
    expect(screen.getByText('Board')).toBeInTheDocument();
    expect(screen.getByText('Learn')).toBeInTheDocument();
  });

  it('renders GitTimeline empty state by default', () => {
    render(<BottomBar commits={[]} />);
    expect(screen.getByText('Commits will appear here as agents work')).toBeInTheDocument();
  });

  it('disables non-timeline tabs', () => {
    render(<BottomBar commits={[]} />);
    expect(screen.getByText('Tests')).toBeDisabled();
    expect(screen.getByText('Board')).toBeDisabled();
    expect(screen.getByText('Learn')).toBeDisabled();
  });

  it('renders commits in timeline', () => {
    const commits: Commit[] = [{
      sha: 'abc',
      message: 'Sparky: Build login',
      agent_name: 'Sparky',
      task_id: 't1',
      timestamp: '2026-02-10T12:00:00Z',
      files_changed: [],
    }];
    render(<BottomBar commits={commits} />);
    expect(screen.getByText('Sparky:')).toBeInTheDocument();
  });
});
