import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FlashWizardModal from './FlashWizardModal';

describe('FlashWizardModal', () => {
  it('renders device role and message', () => {
    render(
      <FlashWizardModal
        deviceRole="sensor_node"
        message="Plug in your Sensor Node"
        onReady={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText(/Flash Sensor Node/i)).toBeInTheDocument();
    expect(screen.getByText(/Plug in your Sensor Node/i)).toBeInTheDocument();
  });

  it('calls onReady when Ready button clicked', () => {
    const onReady = vi.fn();
    render(
      <FlashWizardModal
        deviceRole="sensor_node"
        message="Plug in your Sensor Node"
        onReady={onReady}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText(/Ready/i));
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Cancel button clicked', () => {
    const onCancel = vi.fn();
    render(
      <FlashWizardModal
        deviceRole="sensor_node"
        message="Plug in your Sensor Node"
        onReady={vi.fn()}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByText(/Cancel/i));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows progress state during flash', () => {
    render(
      <FlashWizardModal
        deviceRole="sensor_node"
        message="Flashing..."
        isFlashing={true}
        progress={50}
        onReady={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText(/Flashing/i)).toBeInTheDocument();
  });

  it('disables Ready button when flashing', () => {
    render(
      <FlashWizardModal
        deviceRole="sensor_node"
        message="Flashing..."
        isFlashing={true}
        progress={50}
        onReady={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText(/Ready/i)).toBeDisabled();
  });

  it('has correct dialog aria attributes', () => {
    render(
      <FlashWizardModal
        deviceRole="sensor_node"
        message="Plug in your Sensor Node"
        onReady={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('displays friendly name for gateway_node', () => {
    render(
      <FlashWizardModal
        deviceRole="gateway_node"
        message="Plug in your Gateway"
        onReady={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText(/Gateway Node/i)).toBeInTheDocument();
  });

  it('falls back to raw role when no friendly name exists', () => {
    render(
      <FlashWizardModal
        deviceRole="custom_device"
        message="Plug in your device"
        onReady={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText(/custom_device/i)).toBeInTheDocument();
  });

  it('shows progress percentage text', () => {
    render(
      <FlashWizardModal
        deviceRole="sensor_node"
        message="Flashing..."
        isFlashing={true}
        progress={75}
        onReady={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('75% complete')).toBeInTheDocument();
  });
});
