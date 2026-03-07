import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import WhiteboardCanvas from './WhiteboardCanvas';

const defaultProps = {
  meetingId: 'meeting-1',
  canvasState: { type: 'whiteboard', data: {} },
  onCanvasUpdate: vi.fn(),
};

describe('WhiteboardCanvas', () => {
  it('renders the canvas element', () => {
    render(<WhiteboardCanvas {...defaultProps} />);
    expect(screen.getByTestId('whiteboard-canvas')).toBeInTheDocument();
  });

  it('renders tool buttons', () => {
    render(<WhiteboardCanvas {...defaultProps} />);
    expect(screen.getByText('Pen')).toBeInTheDocument();
    expect(screen.getByText('Line')).toBeInTheDocument();
    expect(screen.getByText('Rect')).toBeInTheDocument();
    expect(screen.getByText('Circle')).toBeInTheDocument();
    expect(screen.getByText('Eraser')).toBeInTheDocument();
    expect(screen.getByText('Text')).toBeInTheDocument();
  });

  it('renders color picker buttons', () => {
    const { container } = render(<WhiteboardCanvas {...defaultProps} />);
    // 7 color buttons
    const colorButtons = container.querySelectorAll('button[title]');
    expect(colorButtons.length).toBe(7);
  });
});
