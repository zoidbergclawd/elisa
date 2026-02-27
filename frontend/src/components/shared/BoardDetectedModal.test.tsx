import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BoardDetectedModal from './BoardDetectedModal';
import type { BoardInfo } from '../../hooks/useBoardDetect';
import type { DeviceManifest } from '../../lib/deviceBlocks';

const boardInfo: BoardInfo = { port: 'COM3', boardType: 'esp32-s3' };

const samplePlugin: DeviceManifest = {
  id: 'heltec-sensor-node',
  name: 'Heltec Sensor Node',
  version: '1.0.0',
  description: 'Sensor node plugin',
  colour: 120,
  board: { type: 'esp32-s3', detection: { usb_vid: '0x1A86', usb_pid: '0x55D4' } },
  capabilities: [],
  blocks: [],
  deploy: {},
};

describe('BoardDetectedModal', () => {
  it('renders board type and port', () => {
    render(
      <BoardDetectedModal boardInfo={boardInfo} matchingPlugins={[]} onDismiss={vi.fn()} />
    );

    expect(screen.getByText('esp32-s3')).toBeInTheDocument();
    expect(screen.getByText('COM3')).toBeInTheDocument();
    expect(screen.getByText('Board Connected!')).toBeInTheDocument();
  });

  it('calls onDismiss when Got it is clicked', () => {
    const onDismiss = vi.fn();
    render(
      <BoardDetectedModal boardInfo={boardInfo} matchingPlugins={[]} onDismiss={onDismiss} />
    );

    fireEvent.click(screen.getByText('Got it'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('has correct dialog aria attributes', () => {
    render(
      <BoardDetectedModal boardInfo={boardInfo} matchingPlugins={[]} onDismiss={vi.fn()} />
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('shows matching plugin names when plugins match', () => {
    render(
      <BoardDetectedModal boardInfo={boardInfo} matchingPlugins={[samplePlugin]} onDismiss={vi.fn()} />
    );

    expect(screen.getByText('Heltec Sensor Node')).toBeInTheDocument();
    expect(screen.getByText(/Drag a device block/)).toBeInTheDocument();
  });

  it('shows no-match message when no plugins match', () => {
    render(
      <BoardDetectedModal boardInfo={boardInfo} matchingPlugins={[]} onDismiss={vi.fn()} />
    );

    expect(screen.getByText(/no matching device plugins/)).toBeInTheDocument();
  });
});
