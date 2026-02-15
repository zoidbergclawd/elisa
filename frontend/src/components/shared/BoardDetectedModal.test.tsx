import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BoardDetectedModal from './BoardDetectedModal';
import type { BoardInfo } from '../../hooks/useBoardDetect';

const boardInfo: BoardInfo = { port: 'COM3', boardType: 'esp32-s3' };

describe('BoardDetectedModal', () => {
  it('renders board type and port', () => {
    render(
      <BoardDetectedModal boardInfo={boardInfo} hasExistingPortal={false} onCreatePortal={vi.fn()} onDismiss={vi.fn()} />
    );

    expect(screen.getByText('esp32-s3')).toBeInTheDocument();
    expect(screen.getByText('COM3')).toBeInTheDocument();
    expect(screen.getByText('Board Connected!')).toBeInTheDocument();
  });

  it('calls onCreatePortal when Create Portal is clicked', () => {
    const onCreatePortal = vi.fn();
    render(
      <BoardDetectedModal boardInfo={boardInfo} hasExistingPortal={false} onCreatePortal={onCreatePortal} onDismiss={vi.fn()} />
    );

    fireEvent.click(screen.getByText('Create Portal'));
    expect(onCreatePortal).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss when Maybe later is clicked', () => {
    const onDismiss = vi.fn();
    render(
      <BoardDetectedModal boardInfo={boardInfo} hasExistingPortal={false} onCreatePortal={vi.fn()} onDismiss={onDismiss} />
    );

    fireEvent.click(screen.getByText('Maybe later'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('has correct dialog aria attributes', () => {
    render(
      <BoardDetectedModal boardInfo={boardInfo} hasExistingPortal={false} onCreatePortal={vi.fn()} onDismiss={vi.fn()} />
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('shows View Portals when portal already exists', () => {
    render(
      <BoardDetectedModal boardInfo={boardInfo} hasExistingPortal={true} onCreatePortal={vi.fn()} onDismiss={vi.fn()} />
    );

    expect(screen.getByText('View Portals')).toBeInTheDocument();
    expect(screen.queryByText('Create Portal')).not.toBeInTheDocument();
  });

  it('shows reconnect message when portal already exists', () => {
    render(
      <BoardDetectedModal boardInfo={boardInfo} hasExistingPortal={true} onCreatePortal={vi.fn()} onDismiss={vi.fn()} />
    );

    expect(screen.getByText('Your board is back! A Portal is already set up for it.')).toBeInTheDocument();
  });
});
