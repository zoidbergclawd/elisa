import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EsptoolFlashStep from './EsptoolFlashStep';

const baseProps = {
  step: 'prerequisite' as const,
  progress: 0,
  deviceName: 'Cosmo',
  manualPort: '',
  onManualPortChange: vi.fn(),
};

describe('EsptoolFlashStep', () => {
  // ── Prerequisite check ─────────────────────────────────────────────

  it('renders prerequisite check in checking state', () => {
    render(<EsptoolFlashStep {...baseProps} esptoolAvailable={undefined} />);
    expect(screen.getByTestId('prerequisite-check')).toBeInTheDocument();
    expect(screen.getByText(/Checking for esptool/i)).toBeInTheDocument();
  });

  it('shows esptool found when available', () => {
    render(<EsptoolFlashStep {...baseProps} esptoolAvailable={true} />);
    expect(screen.getByText(/esptool found/i)).toBeInTheDocument();
  });

  it('shows esptool not found with install hint', () => {
    render(<EsptoolFlashStep {...baseProps} esptoolAvailable={false} />);
    expect(screen.getByText(/esptool not found/i)).toBeInTheDocument();
    expect(screen.getByText(/pip install esptool/i)).toBeInTheDocument();
  });

  // ── Port detection ─────────────────────────────────────────────────

  it('shows port detection when esptool is available', () => {
    render(<EsptoolFlashStep {...baseProps} esptoolAvailable={true} />);
    expect(screen.getByTestId('port-detection')).toBeInTheDocument();
    expect(screen.getByText(/Looking for your board/i)).toBeInTheDocument();
  });

  it('shows detected port name', () => {
    render(
      <EsptoolFlashStep {...baseProps} esptoolAvailable={true} detectedPort="/dev/ttyUSB0" />
    );
    expect(screen.getByText(/Board detected on \/dev\/ttyUSB0/i)).toBeInTheDocument();
  });

  it('hides port detection when esptool is not found', () => {
    render(<EsptoolFlashStep {...baseProps} esptoolAvailable={false} />);
    expect(screen.queryByTestId('port-detection')).not.toBeInTheDocument();
  });

  // ── Manual port override ───────────────────────────────────────────

  it('renders manual port input', () => {
    render(<EsptoolFlashStep {...baseProps} esptoolAvailable={true} />);
    expect(screen.getByTestId('manual-port-input')).toBeInTheDocument();
  });

  it('calls onManualPortChange when typing', () => {
    const onManualPortChange = vi.fn();
    render(
      <EsptoolFlashStep {...baseProps} esptoolAvailable={true} onManualPortChange={onManualPortChange} />
    );
    fireEvent.change(screen.getByTestId('manual-port-input'), { target: { value: '/dev/cu.usbserial-1234' } });
    expect(onManualPortChange).toHaveBeenCalledWith('/dev/cu.usbserial-1234');
  });

  it('shows the manual port value', () => {
    render(
      <EsptoolFlashStep {...baseProps} esptoolAvailable={true} manualPort="/dev/ttyACM0" />
    );
    expect(screen.getByTestId('manual-port-input')).toHaveValue('/dev/ttyACM0');
  });

  // ── Progress bar during flash ──────────────────────────────────────

  it('shows progress bar during flashing', () => {
    render(
      <EsptoolFlashStep {...baseProps} step="flashing" progress={42} esptoolAvailable={true} />
    );
    expect(screen.getByTestId('flash-progress')).toBeInTheDocument();
    expect(screen.getByText(/42% complete/i)).toBeInTheDocument();
  });

  it('shows device name in flashing message', () => {
    render(
      <EsptoolFlashStep {...baseProps} step="flashing" progress={50} deviceName="Cosmo" esptoolAvailable={true} />
    );
    expect(screen.getByText(/Writing Cosmo to your board/i)).toBeInTheDocument();
  });

  it('progress bar width matches percentage', () => {
    render(
      <EsptoolFlashStep {...baseProps} step="flashing" progress={65} esptoolAvailable={true} />
    );
    const fill = screen.getByTestId('progress-bar-fill');
    expect(fill.style.width).toBe('65%');
  });

  it('caps progress bar at 100%', () => {
    render(
      <EsptoolFlashStep {...baseProps} step="flashing" progress={150} esptoolAvailable={true} />
    );
    const fill = screen.getByTestId('progress-bar-fill');
    expect(fill.style.width).toBe('100%');
  });

  // ── Runtime config ─────────────────────────────────────────────────

  it('shows runtime config values', () => {
    render(
      <EsptoolFlashStep
        {...baseProps}
        esptoolAvailable={true}
        runtimeConfig={{ agent_id: 'agent-123', runtime_url: 'https://rt.example.com' }}
      />
    );
    const config = screen.getByTestId('runtime-config');
    expect(config).toBeInTheDocument();
    expect(screen.getByText(/agent_id: agent-123/)).toBeInTheDocument();
    expect(screen.getByText(/runtime_url: https:\/\/rt.example.com/)).toBeInTheDocument();
  });

  it('masks api_key values in runtime config', () => {
    render(
      <EsptoolFlashStep
        {...baseProps}
        esptoolAvailable={true}
        runtimeConfig={{ api_key: 'secret-value' }}
      />
    );
    expect(screen.getByText(/api_key: \*\*\*\*/)).toBeInTheDocument();
    expect(screen.queryByText(/secret-value/)).not.toBeInTheDocument();
  });

  it('hides runtime config when empty', () => {
    render(<EsptoolFlashStep {...baseProps} esptoolAvailable={true} runtimeConfig={{}} />);
    expect(screen.queryByTestId('runtime-config')).not.toBeInTheDocument();
  });

  it('hides runtime config in error state', () => {
    render(
      <EsptoolFlashStep
        {...baseProps}
        step="error"
        esptoolAvailable={true}
        runtimeConfig={{ agent_id: 'a1' }}
        errorMessage="Flash failed"
      />
    );
    expect(screen.queryByTestId('runtime-config')).not.toBeInTheDocument();
  });

  // ── Success state ──────────────────────────────────────────────────

  it('shows success state', () => {
    render(
      <EsptoolFlashStep {...baseProps} step="success" esptoolAvailable={true} />
    );
    expect(screen.getByTestId('flash-success')).toBeInTheDocument();
    expect(screen.getByText(/Flash complete/i)).toBeInTheDocument();
  });

  it('shows device name in success message', () => {
    render(
      <EsptoolFlashStep {...baseProps} step="success" deviceName="Buddy" esptoolAvailable={true} />
    );
    expect(screen.getByText(/Buddy is ready to go/i)).toBeInTheDocument();
  });

  // ── Error state ────────────────────────────────────────────────────

  it('shows error state with message', () => {
    render(
      <EsptoolFlashStep
        {...baseProps}
        step="error"
        errorMessage="No board detected. Connect your board via USB and try again."
      />
    );
    expect(screen.getByTestId('flash-error')).toBeInTheDocument();
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText(/No board detected/i)).toBeInTheDocument();
  });

  it('shows error state without message', () => {
    render(
      <EsptoolFlashStep {...baseProps} step="error" />
    );
    expect(screen.getByTestId('flash-error')).toBeInTheDocument();
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
  });

  it('hides port detection in error state', () => {
    render(
      <EsptoolFlashStep {...baseProps} step="error" esptoolAvailable={true} />
    );
    expect(screen.queryByTestId('port-detection')).not.toBeInTheDocument();
  });
});
