import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import FlashWizardModal from './FlashWizardModal';
import type { FaceDescriptor } from '../../types';

const testFace: FaceDescriptor = {
  base_shape: 'round',
  eyes: { style: 'circles', size: 'medium', color: '#4361ee' },
  mouth: { style: 'smile' },
  expression: 'happy',
  colors: { face: '#f0f0f0', accent: '#ffb3ba' },
};

const baseProps = {
  deviceRole: 'sensor_node',
  message: 'Plug in your Sensor Node',
  onReady: vi.fn(),
  onCancel: vi.fn(),
};

describe('FlashWizardModal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── Basic rendering ───────────────────────────────────────────────
  it('renders device role and message', () => {
    render(<FlashWizardModal {...baseProps} />);
    expect(screen.getByText(/Flash Sensor Node/i)).toBeInTheDocument();
    expect(screen.getByText(/Plug in your Sensor Node/i)).toBeInTheDocument();
  });

  it('calls onReady when Ready button clicked', () => {
    const onReady = vi.fn();
    render(<FlashWizardModal {...baseProps} onReady={onReady} />);
    fireEvent.click(screen.getByText(/Ready/i));
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Cancel button clicked', () => {
    const onCancel = vi.fn();
    render(<FlashWizardModal {...baseProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText(/Cancel/i));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('has correct dialog aria attributes', () => {
    render(<FlashWizardModal {...baseProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('displays friendly name for gateway_node', () => {
    render(<FlashWizardModal {...baseProps} deviceRole="gateway_node" message="Plug in your Gateway" />);
    expect(screen.getByText(/Gateway Node/i)).toBeInTheDocument();
  });

  it('falls back to raw role when no friendly name exists', () => {
    render(<FlashWizardModal {...baseProps} deviceRole="custom_device" message="Plug in your device" />);
    expect(screen.getByText(/custom_device/i)).toBeInTheDocument();
  });

  it('uses deviceName prop over friendly names and raw role', () => {
    render(<FlashWizardModal {...baseProps} deviceRole="heltec-sensor" deviceName="Heltec Sensor Node" />);
    expect(screen.getByText(/Heltec Sensor Node/i)).toBeInTheDocument();
  });

  it('deviceName takes priority over FRIENDLY_NAMES match', () => {
    render(<FlashWizardModal {...baseProps} deviceName="Custom Name" />);
    expect(screen.getByText(/Custom Name/i)).toBeInTheDocument();
  });

  // ── Step indicator ────────────────────────────────────────────────
  it('shows step indicator on connect step', () => {
    render(<FlashWizardModal {...baseProps} />);
    expect(screen.getByTestId('step-indicator')).toBeInTheDocument();
    expect(screen.getByText('Connect')).toBeInTheDocument();
    expect(screen.getByText('Flash')).toBeInTheDocument();
    expect(screen.getByText('Wake Up')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  // ── USB port guidance ─────────────────────────────────────────────
  it('shows USB port guidance on connect step', () => {
    render(<FlashWizardModal {...baseProps} />);
    expect(screen.getByTestId('usb-guidance')).toBeInTheDocument();
    expect(screen.getByText(/BACK/)).toBeInTheDocument();
    expect(screen.getByText(/Not the front port/i)).toBeInTheDocument();
  });

  // ── Pre-flash checklist ───────────────────────────────────────────
  it('shows pre-flash checklist when provided', () => {
    render(
      <FlashWizardModal
        {...baseProps}
        agentName="Cosmo"
        preFlashChecklist={{
          specReady: true,
          runtimeProvisioned: false,
          backpackReady: false,
          firmwareReady: false,
        }}
      />
    );
    expect(screen.getByTestId('pre-flash-checklist')).toBeInTheDocument();
    expect(screen.getByText(/Preparing Cosmo/i)).toBeInTheDocument();
  });

  it('shows checklist items with correct states', () => {
    render(
      <FlashWizardModal
        {...baseProps}
        agentName="Cosmo"
        preFlashChecklist={{
          specReady: true,
          runtimeProvisioned: true,
          backpackReady: false,
          firmwareReady: false,
        }}
      />
    );
    const items = screen.getAllByTestId('checklist-item');
    expect(items).toHaveLength(4);
    // First two done, last two pending
    expect(screen.getByText(/Built Cosmo's personality/)).toBeInTheDocument();
    expect(screen.getByText(/Cosmo set up in the cloud/)).toBeInTheDocument();
    expect(screen.getByText(/Loading the knowledge backpack/i)).toBeInTheDocument();
    expect(screen.getByText(/Preparing the firmware/i)).toBeInTheDocument();
  });

  it('shows completion message when all checklist items done', () => {
    render(
      <FlashWizardModal
        {...baseProps}
        agentName="Cosmo"
        preFlashChecklist={{
          specReady: true,
          runtimeProvisioned: true,
          backpackReady: true,
          firmwareReady: true,
        }}
      />
    );
    expect(screen.getByTestId('checklist-complete')).toBeInTheDocument();
    expect(screen.getByText(/Cosmo is ready/i)).toBeInTheDocument();
  });

  it('auto-advances from pre-flash to connect when all items done', () => {
    render(
      <FlashWizardModal
        {...baseProps}
        agentName="Cosmo"
        preFlashChecklist={{
          specReady: true,
          runtimeProvisioned: true,
          backpackReady: true,
          firmwareReady: true,
        }}
      />
    );
    // Initially shows checklist
    expect(screen.getByTestId('pre-flash-checklist')).toBeInTheDocument();

    // After timeout, should advance to connect
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByTestId('connect-step')).toBeInTheDocument();
  });

  it('skips pre-flash checklist when not provided', () => {
    render(<FlashWizardModal {...baseProps} />);
    expect(screen.queryByTestId('pre-flash-checklist')).not.toBeInTheDocument();
    expect(screen.getByTestId('connect-step')).toBeInTheDocument();
  });

  // ── Agent name personalization ────────────────────────────────────
  it('uses agent name throughout wizard when provided', () => {
    render(
      <FlashWizardModal
        {...baseProps}
        agentName="Cosmo"
        preFlashChecklist={{
          specReady: false,
          runtimeProvisioned: false,
          backpackReady: false,
          firmwareReady: false,
        }}
      />
    );
    expect(screen.getByText(/Preparing Cosmo/i)).toBeInTheDocument();
    expect(screen.getByText(/Building Cosmo's personality/i)).toBeInTheDocument();
    expect(screen.getByText(/Setting up Cosmo in the cloud/i)).toBeInTheDocument();
  });

  // ── Flashing step ────────────────────────────────────────────────
  it('transitions to flashing step when isFlashing becomes true', () => {
    const { rerender } = render(<FlashWizardModal {...baseProps} />);
    expect(screen.getByTestId('connect-step')).toBeInTheDocument();

    rerender(<FlashWizardModal {...baseProps} isFlashing={true} progress={30} />);
    expect(screen.getByTestId('flashing-step')).toBeInTheDocument();
  });

  it('shows progress during flashing without esptool', () => {
    render(
      <FlashWizardModal
        {...baseProps}
        isFlashing={true}
        progress={50}
      />
    );
    // Let step transition to flashing
    expect(screen.getByText(/50% complete/i)).toBeInTheDocument();
  });

  it('uses agent name in flashing message', () => {
    render(
      <FlashWizardModal
        {...baseProps}
        agentName="Cosmo"
        isFlashing={true}
        progress={50}
      />
    );
    expect(screen.getByText(/Cosmo is loading/i)).toBeInTheDocument();
  });

  it('hides Ready button during flashing step', () => {
    render(
      <FlashWizardModal
        {...baseProps}
        isFlashing={true}
        progress={50}
      />
    );
    expect(screen.queryByText(/Ready/i)).not.toBeInTheDocument();
  });

  it('shows esptool flash step when flashMethod is esptool', () => {
    render(
      <FlashWizardModal
        {...baseProps}
        flashMethod="esptool"
      />
    );
    expect(screen.getByTestId('esptool-flash-step')).toBeInTheDocument();
  });

  // ── Waking step ──────────────────────────────────────────────────
  it('transitions to waking step after flash completes', () => {
    const { rerender } = render(<FlashWizardModal {...baseProps} />);
    rerender(<FlashWizardModal {...baseProps} isFlashing={true} progress={50} />);
    rerender(<FlashWizardModal {...baseProps} isFlashing={true} progress={100} />);

    expect(screen.getByTestId('waking-step')).toBeInTheDocument();
    expect(screen.getByText(/Flash complete/i)).toBeInTheDocument();
    expect(screen.getByText(/Unplug and replug/i)).toBeInTheDocument();
  });

  it('shows polling indicator during waking step', () => {
    const { rerender } = render(<FlashWizardModal {...baseProps} agentId="agent-123" />);
    rerender(<FlashWizardModal {...baseProps} agentId="agent-123" isFlashing={true} progress={100} />);

    expect(screen.getByTestId('heartbeat-polling')).toBeInTheDocument();
    expect(screen.getByText(/Waiting for Sensor Node to come online/i)).toBeInTheDocument();
  });

  it('uses agent name in waking polling message', () => {
    const { rerender } = render(<FlashWizardModal {...baseProps} agentName="Cosmo" agentId="agent-123" />);
    rerender(<FlashWizardModal {...baseProps} agentName="Cosmo" agentId="agent-123" isFlashing={true} progress={100} />);

    expect(screen.getByText(/Waiting for Cosmo to come online/i)).toBeInTheDocument();
  });

  it('polls heartbeat every 2 seconds', () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('not yet'));
    globalThis.fetch = fetchSpy;

    const { rerender } = render(<FlashWizardModal {...baseProps} agentId="agent-123" />);
    rerender(<FlashWizardModal {...baseProps} agentId="agent-123" isFlashing={true} progress={100} />);

    act(() => { vi.advanceTimersByTime(2000); });
    expect(fetchSpy).toHaveBeenCalledWith('/v1/agents/agent-123/heartbeat');

    act(() => { vi.advanceTimersByTime(2000); });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('shows timeout with troubleshooting after 30 seconds', () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('not yet'));

    const { rerender } = render(<FlashWizardModal {...baseProps} agentName="Cosmo" agentId="agent-123" />);
    rerender(<FlashWizardModal {...baseProps} agentName="Cosmo" agentId="agent-123" isFlashing={true} progress={100} />);

    act(() => { vi.advanceTimersByTime(31000); });
    expect(screen.getByTestId('heartbeat-timeout')).toBeInTheDocument();
    expect(screen.getByText(/Cosmo hasn't responded yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Make sure the device is plugged in/i)).toBeInTheDocument();
  });

  it('shows retry button on heartbeat timeout', () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('not yet'));

    const { rerender } = render(<FlashWizardModal {...baseProps} agentId="agent-123" />);
    rerender(<FlashWizardModal {...baseProps} agentId="agent-123" isFlashing={true} progress={100} />);

    act(() => { vi.advanceTimersByTime(31000); });
    expect(screen.getByTestId('retry-heartbeat')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('retry-heartbeat'));
    // Should go back to polling
    expect(screen.getByTestId('heartbeat-polling')).toBeInTheDocument();
  });

  // ── Celebration step ─────────────────────────────────────────────
  it('transitions to celebration when heartbeat succeeds', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    const { rerender } = render(<FlashWizardModal {...baseProps} agentName="Cosmo" agentId="agent-123" />);
    rerender(<FlashWizardModal {...baseProps} agentName="Cosmo" agentId="agent-123" isFlashing={true} progress={100} />);

    // Trigger heartbeat poll
    await act(async () => { vi.advanceTimersByTime(2000); });

    expect(screen.getByTestId('celebration-step')).toBeInTheDocument();
  });

  it('shows agent name large on celebration step', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    const { rerender } = render(<FlashWizardModal {...baseProps} agentName="Cosmo" agentId="agent-123" />);
    rerender(<FlashWizardModal {...baseProps} agentName="Cosmo" agentId="agent-123" isFlashing={true} progress={100} />);

    await act(async () => { vi.advanceTimersByTime(2000); });

    // Agent name displayed large
    const heading = screen.getByText('Cosmo');
    expect(heading.className).toContain('text-2xl');
  });

  it('shows wake word hint on celebration step', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    const { rerender } = render(
      <FlashWizardModal {...baseProps} agentName="Cosmo" agentId="agent-123" wakeWord="Hey Elisa" />
    );
    rerender(
      <FlashWizardModal {...baseProps} agentName="Cosmo" agentId="agent-123" wakeWord="Hey Elisa" isFlashing={true} progress={100} />
    );

    await act(async () => { vi.advanceTimersByTime(2000); });

    expect(screen.getByText(/Hey Elisa/)).toBeInTheDocument();
    expect(screen.getByText(/to meet Cosmo/i)).toBeInTheDocument();
  });

  it('shows confetti animation on celebration step', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    const { rerender } = render(<FlashWizardModal {...baseProps} agentName="Cosmo" agentId="agent-123" />);
    rerender(<FlashWizardModal {...baseProps} agentName="Cosmo" agentId="agent-123" isFlashing={true} progress={100} />);

    await act(async () => { vi.advanceTimersByTime(2000); });

    expect(screen.getByTestId('confetti')).toBeInTheDocument();
  });

  it('shows Go to Dashboard button on celebration step', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    const { rerender } = render(<FlashWizardModal {...baseProps} agentName="Cosmo" agentId="agent-123" />);
    rerender(<FlashWizardModal {...baseProps} agentName="Cosmo" agentId="agent-123" isFlashing={true} progress={100} />);

    await act(async () => { vi.advanceTimersByTime(2000); });

    expect(screen.getByTestId('go-to-dashboard')).toBeInTheDocument();
    expect(screen.getByText(/Go to Dashboard/i)).toBeInTheDocument();
  });

  it('calls onDashboard when Go to Dashboard clicked', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
    const onDashboard = vi.fn();

    const { rerender } = render(
      <FlashWizardModal {...baseProps} agentName="Cosmo" agentId="agent-123" onDashboard={onDashboard} />
    );
    rerender(
      <FlashWizardModal {...baseProps} agentName="Cosmo" agentId="agent-123" onDashboard={onDashboard} isFlashing={true} progress={100} />
    );

    await act(async () => { vi.advanceTimersByTime(2000); });

    fireEvent.click(screen.getByTestId('go-to-dashboard'));
    expect(onDashboard).toHaveBeenCalledTimes(1);
  });

  it('falls back to onCancel for dashboard button when onDashboard not provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
    const onCancel = vi.fn();

    const { rerender } = render(
      <FlashWizardModal {...baseProps} agentName="Cosmo" agentId="agent-123" onCancel={onCancel} />
    );
    rerender(
      <FlashWizardModal {...baseProps} agentName="Cosmo" agentId="agent-123" onCancel={onCancel} isFlashing={true} progress={100} />
    );

    await act(async () => { vi.advanceTimersByTime(2000); });

    fireEvent.click(screen.getByTestId('go-to-dashboard'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('hides Cancel/Ready buttons on celebration step', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    const { rerender } = render(<FlashWizardModal {...baseProps} agentName="Cosmo" agentId="agent-123" />);
    rerender(<FlashWizardModal {...baseProps} agentName="Cosmo" agentId="agent-123" isFlashing={true} progress={100} />);

    await act(async () => { vi.advanceTimersByTime(2000); });

    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
    expect(screen.queryByText('Ready')).not.toBeInTheDocument();
  });

  it('shows "is Alive!" title on celebration step', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    const { rerender } = render(<FlashWizardModal {...baseProps} agentName="Cosmo" agentId="agent-123" />);
    rerender(<FlashWizardModal {...baseProps} agentName="Cosmo" agentId="agent-123" isFlashing={true} progress={100} />);

    await act(async () => { vi.advanceTimersByTime(2000); });

    expect(screen.getByText(/Cosmo is Alive/i)).toBeInTheDocument();
  });

  it('shows learning tip on celebration step', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    const { rerender } = render(<FlashWizardModal {...baseProps} agentName="Cosmo" agentId="agent-123" />);
    rerender(<FlashWizardModal {...baseProps} agentName="Cosmo" agentId="agent-123" isFlashing={true} progress={100} />);

    await act(async () => { vi.advanceTimersByTime(2000); });

    expect(screen.getByText(/learn more the more you talk/i)).toBeInTheDocument();
  });

  // ── Default wake word ────────────────────────────────────────────
  it('uses default wake word when not provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    const { rerender } = render(<FlashWizardModal {...baseProps} agentName="Buddy" agentId="agent-123" />);
    rerender(<FlashWizardModal {...baseProps} agentName="Buddy" agentId="agent-123" isFlashing={true} progress={100} />);

    await act(async () => { vi.advanceTimersByTime(2000); });

    expect(screen.getByText(/Hey Elisa/)).toBeInTheDocument();
    expect(screen.getByText(/to meet Buddy/i)).toBeInTheDocument();
  });

  // ── FacePreview integration ─────────────────────────────────────
  describe('FacePreview integration', () => {
    it('does not render face preview when faceDescriptor is not provided', () => {
      render(<FlashWizardModal {...baseProps} />);
      expect(screen.queryByTestId('face-preview-container')).not.toBeInTheDocument();
    });

    it('renders face preview during pre-flash step when faceDescriptor provided', () => {
      render(
        <FlashWizardModal
          {...baseProps}
          agentName="Luna"
          faceDescriptor={testFace}
          preFlashChecklist={{
            specReady: false,
            runtimeProvisioned: false,
            backpackReady: false,
            firmwareReady: false,
          }}
        />
      );
      expect(screen.getByTestId('face-preview-container')).toBeInTheDocument();
      expect(screen.getByTestId('face-preview')).toBeInTheDocument();
    });

    it('renders face preview in idle state during pre-flash', () => {
      render(
        <FlashWizardModal
          {...baseProps}
          agentName="Luna"
          faceDescriptor={testFace}
          preFlashChecklist={{
            specReady: false,
            runtimeProvisioned: false,
            backpackReady: false,
            firmwareReady: false,
          }}
        />
      );
      const face = screen.getByTestId('face-preview');
      expect(face.getAttribute('class')).toContain('face-state-idle');
    });

    it('renders face preview in thinking state during flashing', () => {
      render(
        <FlashWizardModal
          {...baseProps}
          faceDescriptor={testFace}
          isFlashing={true}
          progress={50}
        />
      );
      expect(screen.getByTestId('face-preview-container')).toBeInTheDocument();
      const face = screen.getByTestId('face-preview');
      expect(face.getAttribute('class')).toContain('face-state-thinking');
    });

    it('renders face preview in listening state during waking', () => {
      const { rerender } = render(
        <FlashWizardModal {...baseProps} faceDescriptor={testFace} agentId="agent-123" />
      );
      rerender(
        <FlashWizardModal {...baseProps} faceDescriptor={testFace} agentId="agent-123" isFlashing={true} progress={100} />
      );
      expect(screen.getByTestId('face-preview-container')).toBeInTheDocument();
      const face = screen.getByTestId('face-preview');
      expect(face.getAttribute('class')).toContain('face-state-listening');
    });

    it('renders face preview in speaking state during celebration', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

      const { rerender } = render(
        <FlashWizardModal {...baseProps} agentName="Luna" faceDescriptor={testFace} agentId="agent-123" />
      );
      rerender(
        <FlashWizardModal {...baseProps} agentName="Luna" faceDescriptor={testFace} agentId="agent-123" isFlashing={true} progress={100} />
      );

      await act(async () => { vi.advanceTimersByTime(2000); });

      expect(screen.getByTestId('face-preview-container')).toBeInTheDocument();
      const face = screen.getByTestId('face-preview');
      expect(face.getAttribute('class')).toContain('face-state-speaking');
    });

    it('does not render face preview in flashing step without faceDescriptor', () => {
      render(
        <FlashWizardModal
          {...baseProps}
          isFlashing={true}
          progress={50}
        />
      );
      expect(screen.queryByTestId('face-preview-container')).not.toBeInTheDocument();
    });
  });

  // ── Agent greeting ──────────────────────────────────────────────
  describe('Agent greeting', () => {
    it('shows agent greeting on celebration step when provided', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

      const { rerender } = render(
        <FlashWizardModal
          {...baseProps}
          agentName="Luna"
          agentGreeting="Hi! I'm Luna!"
          agentId="agent-123"
        />
      );
      rerender(
        <FlashWizardModal
          {...baseProps}
          agentName="Luna"
          agentGreeting="Hi! I'm Luna!"
          agentId="agent-123"
          isFlashing={true}
          progress={100}
        />
      );

      await act(async () => { vi.advanceTimersByTime(2000); });

      expect(screen.getByTestId('agent-greeting')).toBeInTheDocument();
      expect(screen.getByText(/Hi! I'm Luna!/)).toBeInTheDocument();
    });

    it('does not show greeting text when agentGreeting is not provided', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

      const { rerender } = render(
        <FlashWizardModal {...baseProps} agentName="Luna" agentId="agent-123" />
      );
      rerender(
        <FlashWizardModal {...baseProps} agentName="Luna" agentId="agent-123" isFlashing={true} progress={100} />
      );

      await act(async () => { vi.advanceTimersByTime(2000); });

      expect(screen.queryByTestId('agent-greeting')).not.toBeInTheDocument();
    });
  });
});
