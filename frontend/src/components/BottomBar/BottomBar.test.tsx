import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BottomBar from './BottomBar';
import type { Commit } from '../../types';

const defaultProps = {
  commits: [] as Commit[],
  testResults: [],
  coveragePct: null,
  teachingMoments: [],
  serialLines: [],
  uiState: 'design' as const,
  tasks: [],
  deployProgress: null,
  deployChecklist: null,
  tokenUsage: { input: 0, output: 0, total: 0, costUsd: 0, maxBudget: 500_000, perAgent: {} },
};

describe('BottomBar', () => {
  it('renders default tabs (no Board when no serial data)', () => {
    render(<BottomBar {...defaultProps} />);
    expect(screen.getByText('Timeline')).toBeInTheDocument();
    expect(screen.getByText('Tests')).toBeInTheDocument();
    expect(screen.getByText('Learn')).toBeInTheDocument();
    expect(screen.getByText('Progress')).toBeInTheDocument();
    expect(screen.getByText('Tokens')).toBeInTheDocument();
    expect(screen.queryByText('Board')).not.toBeInTheDocument();
  });

  it('shows Board tab when serial data exists', () => {
    const props = {
      ...defaultProps,
      serialLines: [{ line: 'Hello', timestamp: '2026-02-10T12:00:00Z' }],
    };
    render(<BottomBar {...props} />);
    expect(screen.getByText('Board')).toBeInTheDocument();
  });

  it('renders GitTimeline empty state by default', () => {
    render(<BottomBar {...defaultProps} />);
    expect(screen.getByText('Commits will appear here as agents work')).toBeInTheDocument();
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
    render(<BottomBar {...defaultProps} commits={commits} />);
    expect(screen.getByText('Sparky:')).toBeInTheDocument();
  });

  it('clicking Tests tab renders TestResults', () => {
    render(<BottomBar {...defaultProps} />);
    fireEvent.click(screen.getByText('Tests'));
    expect(screen.getByText('No test results yet')).toBeInTheDocument();
  });

  it('Tests tab shows build-in-progress message during build', () => {
    render(<BottomBar {...defaultProps} uiState="building" />);
    fireEvent.click(screen.getByText('Tests'));
    expect(screen.getByText('Tests will run after tasks complete...')).toBeInTheDocument();
  });

  it('clicking Learn tab renders TeachingSidebar', () => {
    render(<BottomBar {...defaultProps} />);
    fireEvent.click(screen.getByText('Learn'));
    expect(screen.getByText('Teaching moments will appear as you build')).toBeInTheDocument();
  });

  it('clicking Progress tab renders ProgressPanel', () => {
    render(<BottomBar {...defaultProps} />);
    fireEvent.click(screen.getByText('Progress'));
    expect(screen.getByText('Progress will appear during a build')).toBeInTheDocument();
  });

  it('clicking Tokens tab renders MetricsPanel', () => {
    render(<BottomBar {...defaultProps} />);
    fireEvent.click(screen.getByText('Tokens'));
    expect(screen.getByText('No token data yet')).toBeInTheDocument();
  });

  it('Board tab shows serial lines when data exists', () => {
    const props = {
      ...defaultProps,
      serialLines: [{ line: 'Hello from board', timestamp: '2026-02-10T12:00:00Z' }],
    };
    render(<BottomBar {...props} />);
    fireEvent.click(screen.getByText('Board'));
    expect(screen.getByText('Hello from board')).toBeInTheDocument();
  });

  it('Tests tab shows test results', () => {
    const props = {
      ...defaultProps,
      testResults: [
        { test_name: 'test_add', passed: true, details: 'PASSED' },
        { test_name: 'test_sub', passed: false, details: 'FAILED' },
      ],
    };
    render(<BottomBar {...props} />);
    fireEvent.click(screen.getByText('Tests'));
    expect(screen.getByText('1/2 tests passing')).toBeInTheDocument();
  });

  it('Learn tab shows teaching moments', () => {
    const props = {
      ...defaultProps,
      teachingMoments: [
        { concept: 'testing', headline: 'Tests are passing!', explanation: 'Great news.' },
      ],
    };
    render(<BottomBar {...props} />);
    fireEvent.click(screen.getByText('Learn'));
    expect(screen.getByText('Tests are passing!')).toBeInTheDocument();
  });
});
