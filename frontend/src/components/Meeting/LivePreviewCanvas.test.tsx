import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import LivePreviewCanvas from './LivePreviewCanvas';

const defaultProps = {
  meetingId: 'meeting-1',
  canvasState: { type: 'live-preview', data: {} },
  onCanvasUpdate: vi.fn(),
};

describe('LivePreviewCanvas', () => {
  it('renders empty state when no preview URL', () => {
    render(<LivePreviewCanvas {...defaultProps} />);
    expect(screen.getByText('Waiting for web preview URL...')).toBeInTheDocument();
  });

  it('renders iframe with preview URL', () => {
    const canvasState = {
      type: 'live-preview',
      data: { previewUrl: 'http://localhost:3000' },
    };
    render(<LivePreviewCanvas {...defaultProps} canvasState={canvasState} />);
    const iframe = screen.getByTitle('Live web preview');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('src', 'http://localhost:3000');
  });

  it('shows refresh button when URL is available', () => {
    const canvasState = {
      type: 'live-preview',
      data: { previewUrl: 'http://localhost:3000' },
    };
    render(<LivePreviewCanvas {...defaultProps} canvasState={canvasState} />);
    expect(screen.getByText('Refresh')).toBeInTheDocument();
  });
});
