import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GitTimeline from './GitTimeline';
import type { Commit } from '../../types';

const makeCommit = (overrides: Partial<Commit> = {}): Commit => ({
  sha: 'abc1234',
  message: 'Sparky: Build login',
  agent_name: 'Sparky',
  task_id: 't1',
  timestamp: '2026-02-10T12:00:00Z',
  files_changed: ['src/login.py'],
  ...overrides,
});

describe('GitTimeline', () => {
  it('renders empty state when no commits', () => {
    render(<GitTimeline commits={[]} />);
    expect(screen.getByText('Commits will appear here as agents work')).toBeInTheDocument();
  });

  it('renders a commit node for each commit', () => {
    const commits = [
      makeCommit({ sha: 'aaa', agent_name: 'Sparky Builder', message: 'First' }),
      makeCommit({ sha: 'bbb', agent_name: 'Checkers Tester', message: 'Second' }),
    ];
    render(<GitTimeline commits={commits} />);
    expect(screen.getByTestId('commit-node-aaa')).toBeInTheDocument();
    expect(screen.getByTestId('commit-node-bbb')).toBeInTheDocument();
  });

  it('renders the horizontal rail line', () => {
    render(<GitTimeline commits={[makeCommit()]} />);
    expect(screen.getByTestId('rail-line')).toBeInTheDocument();
  });

  it('shows tooltip on hover with agent name, message, and file count', () => {
    const commits = [makeCommit({ files_changed: ['a.py', 'b.py'] })];
    render(<GitTimeline commits={commits} />);
    fireEvent.mouseEnter(screen.getByTestId('commit-node-abc1234'));
    const tooltip = screen.getByTestId('commit-tooltip');
    expect(tooltip).toBeInTheDocument();
    expect(tooltip).toHaveTextContent('Sparky');
    expect(tooltip).toHaveTextContent('Build login');
    expect(tooltip).toHaveTextContent('2 files changed');
  });

  it('hides tooltip on mouse leave', () => {
    render(<GitTimeline commits={[makeCommit()]} />);
    const node = screen.getByTestId('commit-node-abc1234');
    fireEvent.mouseEnter(node);
    expect(screen.getByTestId('commit-tooltip')).toBeInTheDocument();
    fireEvent.mouseLeave(node);
    expect(screen.queryByTestId('commit-tooltip')).not.toBeInTheDocument();
  });

  it('expands to show files on click', () => {
    const commits = [makeCommit({ files_changed: ['src/login.py', 'src/auth.py'] })];
    render(<GitTimeline commits={commits} />);
    expect(screen.queryByText('src/login.py')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('commit-node-abc1234'));
    expect(screen.getByText('src/login.py')).toBeInTheDocument();
    expect(screen.getByText('src/auth.py')).toBeInTheDocument();
  });

  it('collapses files on second click', () => {
    const commits = [makeCommit({ files_changed: ['src/login.py'] })];
    render(<GitTimeline commits={commits} />);
    const node = screen.getByTestId('commit-node-abc1234');
    fireEvent.click(node);
    expect(screen.getByText('src/login.py')).toBeInTheDocument();
    fireEvent.click(node);
    expect(screen.queryByText('src/login.py')).not.toBeInTheDocument();
  });

  it('does not show file list when files_changed is empty', () => {
    const commits = [makeCommit({ files_changed: [] })];
    render(<GitTimeline commits={commits} />);
    fireEvent.click(screen.getByTestId('commit-node-abc1234'));
    expect(screen.queryByTestId('commit-files')).not.toBeInTheDocument();
  });

  it('shows tooltip with singular file text for 1 file', () => {
    const commits = [makeCommit({ files_changed: ['one.py'] })];
    render(<GitTimeline commits={commits} />);
    fireEvent.mouseEnter(screen.getByTestId('commit-node-abc1234'));
    expect(screen.getByTestId('commit-tooltip')).toHaveTextContent('1 file changed');
  });

  it('hides tooltip when node is expanded (click replaces tooltip)', () => {
    const commits = [makeCommit()];
    render(<GitTimeline commits={commits} />);
    const node = screen.getByTestId('commit-node-abc1234');
    fireEvent.mouseEnter(node);
    expect(screen.getByTestId('commit-tooltip')).toBeInTheDocument();
    fireEvent.click(node);
    // Tooltip should be hidden when expanded
    expect(screen.queryByTestId('commit-tooltip')).not.toBeInTheDocument();
  });
});
