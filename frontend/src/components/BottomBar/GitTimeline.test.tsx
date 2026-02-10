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

  it('renders commit entries', () => {
    const commits = [makeCommit()];
    render(<GitTimeline commits={commits} />);
    expect(screen.getByText('Sparky:')).toBeInTheDocument();
    expect(screen.getByText(/Build login/)).toBeInTheDocument();
  });

  it('renders multiple commits', () => {
    const commits = [
      makeCommit({ sha: 'aaa', agent_name: 'Sparky', message: 'First' }),
      makeCommit({ sha: 'bbb', agent_name: 'Checkers', message: 'Second' }),
    ];
    render(<GitTimeline commits={commits} />);
    expect(screen.getByText('Sparky:')).toBeInTheDocument();
    expect(screen.getByText('Checkers:')).toBeInTheDocument();
  });

  it('expands to show files on click', () => {
    const commits = [makeCommit({ files_changed: ['src/login.py', 'src/auth.py'] })];
    render(<GitTimeline commits={commits} />);
    // Files should not be visible initially
    expect(screen.queryByText('src/login.py')).not.toBeInTheDocument();
    // Click the commit entry
    fireEvent.click(screen.getByText('Sparky:'));
    // Files should now be visible
    expect(screen.getByText('src/login.py')).toBeInTheDocument();
    expect(screen.getByText('src/auth.py')).toBeInTheDocument();
  });

  it('collapses files on second click', () => {
    const commits = [makeCommit({ files_changed: ['src/login.py'] })];
    render(<GitTimeline commits={commits} />);
    const button = screen.getByText('Sparky:');
    fireEvent.click(button);
    expect(screen.getByText('src/login.py')).toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.queryByText('src/login.py')).not.toBeInTheDocument();
  });

  it('does not show file list when files_changed is empty', () => {
    const commits = [makeCommit({ files_changed: [] })];
    render(<GitTimeline commits={commits} />);
    fireEvent.click(screen.getByText('Sparky:'));
    // No file entries should appear
    expect(screen.queryByText('src/')).not.toBeInTheDocument();
  });
});
