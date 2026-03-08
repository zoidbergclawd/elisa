import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BottomBar from './BottomBar';
import { useBuildSessionContext } from '../../contexts/BuildSessionContext';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';
import { defaultBuildSessionValue, defaultWorkspaceValue } from '../../test-utils/renderWithProviders';
import type { Commit } from '../../types';

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
  it('renders always-visible tabs (Learn) in design mode', () => {
    renderBottomBar();
    expect(screen.getByText('Learn')).toBeInTheDocument();
    expect(screen.queryByText('Tests')).not.toBeInTheDocument();
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
      // Should fall back to first visible tab (Learn)
      expect(screen.getByText('Learn').className).toContain('bg-accent-lavender');
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
      expect(screen.getByTestId('commit-node-abc')).toBeInTheDocument();
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
