import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CanvasPanel from './CanvasPanel';

const defaultProps = {
  meetingId: 'meeting-1',
  canvasType: 'unregistered-type',
  canvasState: { type: 'unregistered-type', data: {} },
  onCanvasUpdate: vi.fn(),
};

describe('CanvasPanel', () => {
  it('falls back to DefaultCanvas for unregistered canvas type', () => {
    render(<CanvasPanel {...defaultProps} />);
    expect(screen.getByText('Canvas coming soon')).toBeInTheDocument();
  });

  it('renders without crashing for known canvas types', () => {
    // Import side effects to register canvases
    import('./BlueprintCanvas');

    const { container } = render(
      <CanvasPanel
        {...defaultProps}
        canvasType="blueprint"
        canvasState={{ type: 'blueprint', data: {} }}
      />,
    );
    expect(container).toBeTruthy();
  });
});
