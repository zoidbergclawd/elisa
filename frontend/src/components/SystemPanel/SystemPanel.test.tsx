import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SystemPanel from './SystemPanel';
import { defaultBuildSessionValue } from '../../test-utils/renderWithProviders';

vi.mock('../../contexts/BuildSessionContext', () => ({
  useBuildSessionContext: vi.fn(() => defaultBuildSessionValue),
}));

import { useBuildSessionContext } from '../../contexts/BuildSessionContext';

describe('SystemPanel', () => {
  it('renders empty state when boundaryAnalysis is null', () => {
    render(<SystemPanel />);
    expect(screen.getByTestId('system-empty')).toBeInTheDocument();
    expect(screen.getByText(/System boundary analysis will appear/)).toBeInTheDocument();
  });

  it('renders three columns when boundary data exists', () => {
    vi.mocked(useBuildSessionContext).mockReturnValue({
      ...defaultBuildSessionValue,
      boundaryAnalysis: {
        inputs: [{ name: 'Keyboard input', type: 'user_input' }],
        outputs: [{ name: 'Game display', type: 'display' }],
        boundary_portals: ['Weather API'],
      },
    });

    render(<SystemPanel />);
    expect(screen.getByText('Inputs')).toBeInTheDocument();
    expect(screen.getByText('System Core')).toBeInTheDocument();
    expect(screen.getByText('Outputs')).toBeInTheDocument();
    expect(screen.getByText('Keyboard input')).toBeInTheDocument();
    expect(screen.getByText('Game display')).toBeInTheDocument();
    expect(screen.getByText('Weather API')).toBeInTheDocument();
  });

  it('shows "No portals" when boundary_portals is empty', () => {
    vi.mocked(useBuildSessionContext).mockReturnValue({
      ...defaultBuildSessionValue,
      boundaryAnalysis: {
        inputs: [{ name: 'Click', type: 'user_input' }],
        outputs: [],
        boundary_portals: [],
      },
    });

    render(<SystemPanel />);
    expect(screen.getByText('No portals')).toBeInTheDocument();
  });

  it('shows "No inputs detected" when inputs array is empty', () => {
    vi.mocked(useBuildSessionContext).mockReturnValue({
      ...defaultBuildSessionValue,
      boundaryAnalysis: {
        inputs: [],
        outputs: [{ name: 'LED', type: 'hardware_command' }],
        boundary_portals: [],
      },
    });

    render(<SystemPanel />);
    expect(screen.getByText('No inputs detected')).toBeInTheDocument();
    expect(screen.getByText('LED')).toBeInTheDocument();
  });

  it('shows "No outputs detected" when outputs array is empty', () => {
    vi.mocked(useBuildSessionContext).mockReturnValue({
      ...defaultBuildSessionValue,
      boundaryAnalysis: {
        inputs: [{ name: 'Sensor', type: 'hardware_signal' }],
        outputs: [],
        boundary_portals: [],
      },
    });

    render(<SystemPanel />);
    expect(screen.getByText('No outputs detected')).toBeInTheDocument();
    expect(screen.getByText('Sensor')).toBeInTheDocument();
  });

  it('renders item source when provided', () => {
    vi.mocked(useBuildSessionContext).mockReturnValue({
      ...defaultBuildSessionValue,
      boundaryAnalysis: {
        inputs: [{ name: 'Temp reading', type: 'hardware_signal', source: 'ESP32' }],
        outputs: [],
        boundary_portals: [],
      },
    });

    render(<SystemPanel />);
    expect(screen.getByText('Temp reading')).toBeInTheDocument();
    expect(screen.getByText('ESP32')).toBeInTheDocument();
  });
});
