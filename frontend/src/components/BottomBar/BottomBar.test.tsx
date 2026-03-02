import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BottomBar from './BottomBar';
import type { Commit } from '../../types';
import { useBuildSessionContext } from '../../contexts/BuildSessionContext';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';
import { defaultBuildSessionValue, defaultWorkspaceValue } from '../../test-utils/renderWithProviders';

vi.mock('../../contexts/BuildSessionContext', () => ({
  useBuildSessionContext: vi.fn(() => defaultBuildSessionValue),
}));

vi.mock('../../contexts/WorkspaceContext', () => ({
  useWorkspaceContext: vi.fn(() => defaultWorkspaceValue),
}));

beforeEach(() => {
  localStorage.clear();
  vi.mocked(useBuildSessionContext).mockReturnValue({ ...defaultBuildSessionValue });
  vi.mocked(useWorkspaceContext).mockReturnValue({ ...defaultWorkspaceValue });
});

function renderBottomBar(overrides?: {
  buildSession?: Partial<typeof defaultBuildSessionValue>;
  workspace?: Partial<typeof defaultWorkspaceValue>;
  boardInfo?: { port: string; board?: string; boardType?: string; vendorId?: string } | null;
}) {
  if (overrides?.buildSession) {
    vi.mocked(useBuildSessionContext).mockReturnValue({
      ...defaultBuildSessionValue,
      ...overrides.buildSession,
    });
  }
  if (overrides?.workspace) {
    vi.mocked(useWorkspaceContext).mockReturnValue({
      ...defaultWorkspaceValue,
      ...overrides.workspace,
    });
  }
  return render(<BottomBar boardInfo={overrides?.boardInfo ?? null} />);
}

describe('BottomBar', () => {
  // --- Core rendering ---
  it('renders always-visible tabs (Tests, Learn) in design mode', () => {
    renderBottomBar();
    expect(screen.getByText('Tests')).toBeInTheDocument();
    expect(screen.getByText('Learn')).toBeInTheDocument();
  });

  // --- Contextual tab visibility ---
  describe('contextual tab visibility', () => {
    it('hides Board tab when no serial data and no board info', () => {
      renderBottomBar();
      expect(screen.queryByText('Board')).not.toBeInTheDocument();
    });

    it('shows Board tab when serialLines has data', () => {
      renderBottomBar({
        buildSession: {
          serialLines: [{ line: 'Hello', timestamp: '2026-02-10T12:00:00Z' }],
        },
      });
      expect(screen.getByText('Board')).toBeInTheDocument();
    });

    it('shows Board tab when boardInfo is present', () => {
      renderBottomBar({ boardInfo: { port: '/dev/ttyUSB0', board: 'ESP32' } });
      expect(screen.getByText('Board')).toBeInTheDocument();
    });

    it('hides Timeline tab when no commits', () => {
      renderBottomBar();
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
      renderBottomBar({ buildSession: { commits } });
      expect(screen.getByText('Timeline')).toBeInTheDocument();
    });

    it('hides Tokens tab during design mode', () => {
      renderBottomBar();
      expect(screen.queryByText('Tokens')).not.toBeInTheDocument();
    });

    it('hides Health tab during design mode', () => {
      renderBottomBar();
      expect(screen.queryByText('Health')).not.toBeInTheDocument();
    });

    it('hides Progress tab during design mode', () => {
      renderBottomBar();
      expect(screen.queryByText('Progress')).not.toBeInTheDocument();
    });

    it('shows Tokens/Health/Progress tabs during building', () => {
      renderBottomBar({ buildSession: { uiState: 'building' } });
      expect(screen.getByText('Tokens')).toBeInTheDocument();
      expect(screen.getByText('Health')).toBeInTheDocument();
      expect(screen.getByText('Progress')).toBeInTheDocument();
    });

    it('shows Tokens/Health/Progress tabs in review mode', () => {
      renderBottomBar({ buildSession: { uiState: 'review' } });
      expect(screen.getByText('Tokens')).toBeInTheDocument();
      expect(screen.getByText('Health')).toBeInTheDocument();
      expect(screen.getByText('Progress')).toBeInTheDocument();
    });

    it('hides Trace tab when traceability is null', () => {
      renderBottomBar();
      expect(screen.queryByText('Trace')).not.toBeInTheDocument();
    });

    it('shows Trace tab when traceability data exists', () => {
      renderBottomBar({ buildSession: { traceability: { coverage: 80, requirements: [] } } });
      expect(screen.getByText('Trace')).toBeInTheDocument();
    });

    it('hides System tab when boundaryAnalysis is null', () => {
      renderBottomBar();
      expect(screen.queryByText('System')).not.toBeInTheDocument();
    });

    it('shows System tab when boundaryAnalysis exists', () => {
      renderBottomBar({
        buildSession: { boundaryAnalysis: { inputs: [], outputs: [], boundary_portals: [] } },
      });
      expect(screen.getByText('System')).toBeInTheDocument();
    });
  });

  // --- Auto-switching ---
  describe('auto-switching', () => {
    it('auto-switches to first visible tab when active tab becomes hidden', () => {
      // Start with Board visible (has serial data) and selected
      const { rerender } = render(<BottomBar boardInfo={null} />);

      // Set context with serial data
      vi.mocked(useBuildSessionContext).mockReturnValue({
        ...defaultBuildSessionValue,
        serialLines: [{ line: 'hello', timestamp: '2026-02-10T12:00:00Z' }],
      });
      rerender(<BottomBar boardInfo={null} />);
      fireEvent.click(screen.getByText('Board'));
      expect(screen.getByText('Board').className).toContain('bg-accent-lavender');

      // Remove serial data - Board should disappear, active tab should switch
      vi.mocked(useBuildSessionContext).mockReturnValue({
        ...defaultBuildSessionValue,
        serialLines: [],
      });
      rerender(<BottomBar boardInfo={null} />);
      expect(screen.queryByText('Board')).not.toBeInTheDocument();
      // Should fall back to first visible tab (Tests)
      expect(screen.getByText('Tests').className).toContain('bg-accent-lavender');
    });
  });

  // --- Resize handle ---
  describe('resize handle', () => {
    it('renders resize handle with correct cursor class', () => {
      renderBottomBar();
      const handle = screen.getByTestId('resize-handle');
      expect(handle).toBeInTheDocument();
      expect(handle.className).toContain('cursor-row-resize');
    });

    it('has default panel height of 128px', () => {
      renderBottomBar();
      const handle = screen.getByTestId('resize-handle');
      const contentDiv = handle.parentElement?.querySelector('.overflow-y-auto');
      expect(contentDiv).toHaveStyle({ height: '128px' });
    });

    it('reads stored height from localStorage', () => {
      localStorage.setItem('elisa:bottom-bar-height', '200');
      renderBottomBar();
      const handle = screen.getByTestId('resize-handle');
      const contentDiv = handle.parentElement?.querySelector('.overflow-y-auto');
      expect(contentDiv).toHaveStyle({ height: '200px' });
    });

    it('toggles between min and max height on double-click', () => {
      renderBottomBar();
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
      renderBottomBar({
        buildSession: {
          testResults: [
            { test_name: 'test_a', passed: true, details: 'OK' },
            { test_name: 'test_b', passed: false, details: 'FAIL' },
          ],
        },
      });
      expect(screen.getByTestId('badge-tests-fail')).toBeInTheDocument();
    });

    it('does not show red dot on Tests tab when all tests pass', () => {
      renderBottomBar({
        buildSession: {
          testResults: [
            { test_name: 'test_a', passed: true, details: 'OK' },
          ],
        },
      });
      expect(screen.queryByTestId('badge-tests-fail')).not.toBeInTheDocument();
    });

    it('shows health grade badge when healthSummary exists', () => {
      renderBottomBar({
        buildSession: {
          uiState: 'review',
          healthSummary: {
            health_score: 85,
            grade: 'B' as const,
            breakdown: { tasks_score: 80, tests_score: 90, corrections_score: 85, budget_score: 80 },
          },
        },
      });
      const badge = screen.getByTestId('badge-health-grade');
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toBe('B');
    });

    it('shows trace coverage badge when traceability exists', () => {
      renderBottomBar({
        buildSession: { traceability: { coverage: 80.5, requirements: [] } },
      });
      const badge = screen.getByTestId('badge-trace-coverage');
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toBe('81%');
    });

    it('shows green pulse dot on Board tab when boardInfo is connected', () => {
      renderBottomBar({ boardInfo: { port: '/dev/ttyUSB0', board: 'ESP32' } });
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
      renderBottomBar({ buildSession: { commits } });
      fireEvent.click(screen.getByText('Timeline'));
      expect(screen.getByText('Sparky:')).toBeInTheDocument();
    });

    it('clicking Tests tab renders TestResults', () => {
      renderBottomBar();
      fireEvent.click(screen.getByText('Tests'));
      expect(screen.getByText('No test results yet')).toBeInTheDocument();
    });

    it('Tests tab shows build-in-progress message during build with no tester tasks', () => {
      renderBottomBar({ buildSession: { uiState: 'building' } });
      // Build starts with auto-switch to Progress, so click Tests
      fireEvent.click(screen.getByText('Tests'));
      expect(screen.getByText('Tests will run after tasks complete...')).toBeInTheDocument();
    });

    it('Tests tab shows tester task progress during build', () => {
      renderBottomBar({
        buildSession: {
          uiState: 'building',
          agents: [
            { name: 'TestBot', role: 'tester' as const, persona: 'Writes tests', status: 'working' as const },
            { name: 'Builder', role: 'builder' as const, persona: 'Builds code', status: 'working' as const },
          ],
          tasks: [
            { id: 't1', name: 'Write unit tests', description: '', status: 'done' as const, agent_name: 'TestBot', dependencies: [] },
            { id: 't2', name: 'Write integration tests', description: '', status: 'in_progress' as const, agent_name: 'TestBot', dependencies: [] },
            { id: 't3', name: 'Build login', description: '', status: 'done' as const, agent_name: 'Builder', dependencies: [] },
          ],
        },
      });
      fireEvent.click(screen.getByText('Tests'));
      expect(screen.getByText('Test Creation')).toBeInTheDocument();
      expect(screen.getByText('(1/2)')).toBeInTheDocument();
      expect(screen.getByText('Write unit tests')).toBeInTheDocument();
      expect(screen.getByText('Write integration tests')).toBeInTheDocument();
      expect(screen.queryByText('Build login')).not.toBeInTheDocument();
    });

    it('clicking Learn tab renders TeachingSidebar', () => {
      renderBottomBar();
      fireEvent.click(screen.getByText('Learn'));
      expect(screen.getByText('Teaching moments will appear as you build')).toBeInTheDocument();
    });

    it('clicking Progress tab renders ProgressPanel during build', () => {
      renderBottomBar({ buildSession: { uiState: 'building' } });
      fireEvent.click(screen.getByText('Progress'));
      expect(screen.getByText('Progress')).toBeInTheDocument();
    });

    it('clicking Tokens tab renders MetricsPanel during build', () => {
      renderBottomBar({ buildSession: { uiState: 'building' } });
      fireEvent.click(screen.getByText('Tokens'));
      expect(screen.getByText('No token data yet')).toBeInTheDocument();
    });

    it('Board tab shows serial lines when data exists', () => {
      renderBottomBar({
        buildSession: {
          serialLines: [{ line: 'Hello from board', timestamp: '2026-02-10T12:00:00Z' }],
        },
      });
      fireEvent.click(screen.getByText('Board'));
      expect(screen.getByText('Hello from board')).toBeInTheDocument();
    });

    it('Tests tab shows test results', () => {
      renderBottomBar({
        buildSession: {
          testResults: [
            { test_name: 'test_add', passed: true, details: 'PASSED' },
            { test_name: 'test_sub', passed: false, details: 'FAILED' },
          ],
        },
      });
      fireEvent.click(screen.getByText('Tests'));
      expect(screen.getByText('1/2 passing')).toBeInTheDocument();
    });

    it('Learn tab shows teaching moments', () => {
      renderBottomBar({
        buildSession: {
          teachingMoments: [
            { concept: 'testing', headline: 'Tests are passing!', explanation: 'Great news.' },
          ],
        },
      });
      fireEvent.click(screen.getByText('Learn'));
      expect(screen.getByText('Tests are passing!')).toBeInTheDocument();
    });
  });
});
