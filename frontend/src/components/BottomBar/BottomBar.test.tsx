import { describe, it, expect, beforeEach } from 'vitest';
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
  agents: [],
  deployProgress: null,
  deployChecklist: null,
  tokenUsage: { input: 0, output: 0, total: 0, costUsd: 0, maxBudget: 500_000, perAgent: {} },
  boardInfo: null,
  traceability: null,
  boundaryAnalysis: null,
  healthUpdate: null,
  healthSummary: null,
};

beforeEach(() => {
  localStorage.clear();
});

describe('BottomBar', () => {
  // --- Core rendering ---
  it('renders always-visible tabs (Tests, Learn) in design mode', () => {
    render(<BottomBar {...defaultProps} />);
    expect(screen.getByText('Tests')).toBeInTheDocument();
    expect(screen.getByText('Learn')).toBeInTheDocument();
  });

  // --- Contextual tab visibility ---
  describe('contextual tab visibility', () => {
    it('hides Board tab when no serial data and no board info', () => {
      render(<BottomBar {...defaultProps} />);
      expect(screen.queryByText('Board')).not.toBeInTheDocument();
    });

    it('shows Board tab when serialLines has data', () => {
      const props = {
        ...defaultProps,
        serialLines: [{ line: 'Hello', timestamp: '2026-02-10T12:00:00Z' }],
      };
      render(<BottomBar {...props} />);
      expect(screen.getByText('Board')).toBeInTheDocument();
    });

    it('shows Board tab when boardInfo is present', () => {
      const props = {
        ...defaultProps,
        boardInfo: { port: '/dev/ttyUSB0', board: 'ESP32' },
      };
      render(<BottomBar {...props} />);
      expect(screen.getByText('Board')).toBeInTheDocument();
    });

    it('hides Timeline tab when no commits', () => {
      render(<BottomBar {...defaultProps} />);
      expect(screen.queryByText('Timeline')).not.toBeInTheDocument();
    });

    it('shows Timeline tab when commits exist', () => {
      const commits: Commit[] = [{
        sha: 'abc',
        message: 'Sparky: Build login',
        agent_name: 'Sparky',
        task_id: 't1',
        timestamp: '2026-02-10T12:00:00Z',
        files_changed: [],
      }];
      render(<BottomBar {...defaultProps} commits={commits} />);
      expect(screen.getByText('Timeline')).toBeInTheDocument();
    });

    it('hides Tokens tab during design mode', () => {
      render(<BottomBar {...defaultProps} />);
      expect(screen.queryByText('Tokens')).not.toBeInTheDocument();
    });

    it('hides Health tab during design mode', () => {
      render(<BottomBar {...defaultProps} />);
      expect(screen.queryByText('Health')).not.toBeInTheDocument();
    });

    it('hides Progress tab during design mode', () => {
      render(<BottomBar {...defaultProps} />);
      expect(screen.queryByText('Progress')).not.toBeInTheDocument();
    });

    it('shows Tokens/Health/Progress tabs during building', () => {
      render(<BottomBar {...defaultProps} uiState="building" />);
      expect(screen.getByText('Tokens')).toBeInTheDocument();
      expect(screen.getByText('Health')).toBeInTheDocument();
      expect(screen.getByText('Progress')).toBeInTheDocument();
    });

    it('shows Tokens/Health/Progress tabs in review mode', () => {
      render(<BottomBar {...defaultProps} uiState="review" />);
      expect(screen.getByText('Tokens')).toBeInTheDocument();
      expect(screen.getByText('Health')).toBeInTheDocument();
      expect(screen.getByText('Progress')).toBeInTheDocument();
    });

    it('hides Trace tab when traceability is null', () => {
      render(<BottomBar {...defaultProps} />);
      expect(screen.queryByText('Trace')).not.toBeInTheDocument();
    });

    it('shows Trace tab when traceability data exists', () => {
      render(<BottomBar {...defaultProps} traceability={{ coverage: 80, requirements: [] }} />);
      expect(screen.getByText('Trace')).toBeInTheDocument();
    });

    it('hides System tab when boundaryAnalysis is null', () => {
      render(<BottomBar {...defaultProps} />);
      expect(screen.queryByText('System')).not.toBeInTheDocument();
    });

    it('shows System tab when boundaryAnalysis exists', () => {
      render(<BottomBar {...defaultProps} boundaryAnalysis={{ inputs: [], outputs: [], boundary_portals: [] }} />);
      expect(screen.getByText('System')).toBeInTheDocument();
    });
  });

  // --- Auto-switching ---
  describe('auto-switching', () => {
    it('auto-switches to first visible tab when active tab becomes hidden', () => {
      // Start with Board visible (has serial data) and selected
      const { rerender } = render(
        <BottomBar
          {...defaultProps}
          serialLines={[{ line: 'hello', timestamp: '2026-02-10T12:00:00Z' }]}
        />,
      );
      fireEvent.click(screen.getByText('Board'));
      expect(screen.getByText('Board').className).toContain('bg-accent-lavender');

      // Remove serial data - Board should disappear, active tab should switch
      rerender(<BottomBar {...defaultProps} serialLines={[]} />);
      expect(screen.queryByText('Board')).not.toBeInTheDocument();
      // Should fall back to first visible tab (Tests)
      expect(screen.getByText('Tests').className).toContain('bg-accent-lavender');
    });
  });

  // --- Resize handle ---
  describe('resize handle', () => {
    it('renders resize handle with correct cursor class', () => {
      render(<BottomBar {...defaultProps} />);
      const handle = screen.getByTestId('resize-handle');
      expect(handle).toBeInTheDocument();
      expect(handle.className).toContain('cursor-row-resize');
    });

    it('has default panel height of 128px', () => {
      render(<BottomBar {...defaultProps} />);
      const handle = screen.getByTestId('resize-handle');
      // The content div is the next sibling after the tab bar
      const contentDiv = handle.parentElement?.querySelector('.overflow-y-auto');
      expect(contentDiv).toHaveStyle({ height: '128px' });
    });

    it('reads stored height from localStorage', () => {
      localStorage.setItem('elisa:bottom-bar-height', '200');
      render(<BottomBar {...defaultProps} />);
      const handle = screen.getByTestId('resize-handle');
      const contentDiv = handle.parentElement?.querySelector('.overflow-y-auto');
      expect(contentDiv).toHaveStyle({ height: '200px' });
    });

    it('toggles between min and max height on double-click', () => {
      render(<BottomBar {...defaultProps} />);
      const handle = screen.getByTestId('resize-handle');
      const contentDiv = handle.parentElement?.querySelector('.overflow-y-auto');

      // Default is 128, which is less than max, so double-click should go to max
      fireEvent.doubleClick(handle);
      expect(contentDiv).toHaveStyle({ height: '320px' });

      // Now at max, double-click should go to min
      fireEvent.doubleClick(handle);
      expect(contentDiv).toHaveStyle({ height: '80px' });
    });
  });

  // --- Tab badges ---
  describe('tab badges', () => {
    it('shows red dot on Tests tab when test failures exist', () => {
      const props = {
        ...defaultProps,
        testResults: [
          { test_name: 'test_a', passed: true, details: 'OK' },
          { test_name: 'test_b', passed: false, details: 'FAIL' },
        ],
      };
      render(<BottomBar {...props} />);
      expect(screen.getByTestId('badge-tests-fail')).toBeInTheDocument();
    });

    it('does not show red dot on Tests tab when all tests pass', () => {
      const props = {
        ...defaultProps,
        testResults: [
          { test_name: 'test_a', passed: true, details: 'OK' },
        ],
      };
      render(<BottomBar {...props} />);
      expect(screen.queryByTestId('badge-tests-fail')).not.toBeInTheDocument();
    });

    it('shows health grade badge when healthSummary exists', () => {
      const props = {
        ...defaultProps,
        uiState: 'review' as const,
        healthSummary: {
          health_score: 85,
          grade: 'B' as const,
          breakdown: { tasks_score: 80, tests_score: 90, corrections_score: 85, budget_score: 80 },
        },
      };
      render(<BottomBar {...props} />);
      const badge = screen.getByTestId('badge-health-grade');
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toBe('B');
    });

    it('shows trace coverage badge when traceability exists', () => {
      const props = {
        ...defaultProps,
        traceability: { coverage: 80.5, requirements: [] },
      };
      render(<BottomBar {...props} />);
      const badge = screen.getByTestId('badge-trace-coverage');
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toBe('81%');
    });

    it('shows green pulse dot on Board tab when boardInfo is connected', () => {
      const props = {
        ...defaultProps,
        boardInfo: { port: '/dev/ttyUSB0', board: 'ESP32' },
      };
      render(<BottomBar {...props} />);
      const badge = screen.getByTestId('badge-board-connected');
      expect(badge).toBeInTheDocument();
      expect(badge.className).toContain('animate-pulse');
      expect(badge.className).toContain('bg-green-500');
    });
  });

  // --- Existing functionality preserved ---
  describe('existing behavior', () => {
    it('renders commits in timeline when Timeline tab is visible', () => {
      const commits: Commit[] = [{
        sha: 'abc',
        message: 'Sparky: Build login',
        agent_name: 'Sparky',
        task_id: 't1',
        timestamp: '2026-02-10T12:00:00Z',
        files_changed: [],
      }];
      render(<BottomBar {...defaultProps} commits={commits} />);
      fireEvent.click(screen.getByText('Timeline'));
      expect(screen.getByText('Sparky:')).toBeInTheDocument();
    });

    it('clicking Tests tab renders TestResults', () => {
      render(<BottomBar {...defaultProps} />);
      fireEvent.click(screen.getByText('Tests'));
      expect(screen.getByText('No test results yet')).toBeInTheDocument();
    });

    it('Tests tab shows build-in-progress message during build with no tester tasks', () => {
      render(<BottomBar {...defaultProps} uiState="building" />);
      // Build starts with auto-switch to Progress, so click Tests
      fireEvent.click(screen.getByText('Tests'));
      expect(screen.getByText('Tests will run after tasks complete...')).toBeInTheDocument();
    });

    it('Tests tab shows tester task progress during build', () => {
      const props = {
        ...defaultProps,
        uiState: 'building' as const,
        agents: [
          { name: 'TestBot', role: 'tester' as const, persona: 'Writes tests', status: 'working' as const },
          { name: 'Builder', role: 'builder' as const, persona: 'Builds code', status: 'working' as const },
        ],
        tasks: [
          { id: 't1', name: 'Write unit tests', description: '', status: 'done' as const, agent_name: 'TestBot', dependencies: [] },
          { id: 't2', name: 'Write integration tests', description: '', status: 'in_progress' as const, agent_name: 'TestBot', dependencies: [] },
          { id: 't3', name: 'Build login', description: '', status: 'done' as const, agent_name: 'Builder', dependencies: [] },
        ],
      };
      render(<BottomBar {...props} />);
      fireEvent.click(screen.getByText('Tests'));
      expect(screen.getByText('Test Creation')).toBeInTheDocument();
      expect(screen.getByText('(1/2)')).toBeInTheDocument();
      expect(screen.getByText('Write unit tests')).toBeInTheDocument();
      expect(screen.getByText('Write integration tests')).toBeInTheDocument();
      expect(screen.queryByText('Build login')).not.toBeInTheDocument();
    });

    it('clicking Learn tab renders TeachingSidebar', () => {
      render(<BottomBar {...defaultProps} />);
      fireEvent.click(screen.getByText('Learn'));
      expect(screen.getByText('Teaching moments will appear as you build')).toBeInTheDocument();
    });

    it('clicking Progress tab renders ProgressPanel during build', () => {
      render(<BottomBar {...defaultProps} uiState="building" />);
      fireEvent.click(screen.getByText('Progress'));
      // ProgressPanel should render something
      expect(screen.getByText('Progress')).toBeInTheDocument();
    });

    it('clicking Tokens tab renders MetricsPanel during build', () => {
      render(<BottomBar {...defaultProps} uiState="building" />);
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
      expect(screen.getByText('1/2 passing')).toBeInTheDocument();
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
});
