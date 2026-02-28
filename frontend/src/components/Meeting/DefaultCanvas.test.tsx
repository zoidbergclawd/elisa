import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DefaultCanvas from './DefaultCanvas';

const defaultProps = {
  meetingId: 'meeting-1',
  canvasState: { type: 'some-canvas', data: {} },
  onCanvasUpdate: vi.fn(),
};

describe('DefaultCanvas', () => {
  it('renders placeholder text', () => {
    render(<DefaultCanvas {...defaultProps} />);
    expect(screen.getByText('Canvas coming soon')).toBeInTheDocument();
  });

  it('displays the canvas type in the description', () => {
    render(<DefaultCanvas {...defaultProps} />);
    expect(screen.getByText('some-canvas canvas is not yet available')).toBeInTheDocument();
  });

  it('shows asterisk decoration', () => {
    render(<DefaultCanvas {...defaultProps} />);
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('updates description when canvas type changes', () => {
    const { rerender } = render(<DefaultCanvas {...defaultProps} />);
    expect(screen.getByText('some-canvas canvas is not yet available')).toBeInTheDocument();

    rerender(
      <DefaultCanvas
        {...defaultProps}
        canvasState={{ type: 'diagram', data: {} }}
      />,
    );
    expect(screen.getByText('diagram canvas is not yet available')).toBeInTheDocument();
  });

  it('renders with empty canvas type', () => {
    render(
      <DefaultCanvas
        {...defaultProps}
        canvasState={{ type: '', data: {} }}
      />,
    );
    expect(screen.getByText('canvas is not yet available')).toBeInTheDocument();
  });

  it('has centered layout classes', () => {
    const { container } = render(<DefaultCanvas {...defaultProps} />);
    const outerDiv = container.firstChild as HTMLElement;
    expect(outerDiv.className).toContain('flex');
    expect(outerDiv.className).toContain('items-center');
    expect(outerDiv.className).toContain('justify-center');
  });
});
