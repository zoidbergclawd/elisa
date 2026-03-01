import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DesignPreviewCanvas from './DesignPreviewCanvas';
import { getCanvas } from './canvasRegistry';

// Mock canvas 2d context
const mockCtx = {
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  beginPath: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  measureText: vi.fn().mockReturnValue({ width: 50 }),
  createLinearGradient: vi.fn().mockReturnValue({
    addColorStop: vi.fn(),
  }),
  roundRect: vi.fn(),
  set fillStyle(_v: string) { /* noop */ },
  get fillStyle() { return '#000'; },
  set font(_v: string) { /* noop */ },
  set textAlign(_v: string) { /* noop */ },
  set textBaseline(_v: string) { /* noop */ },
};

beforeEach(() => {
  vi.restoreAllMocks();
  // Mock HTMLCanvasElement.getContext
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockCtx);
  // Mock getBoundingClientRect for canvas sizing
  HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn().mockReturnValue({
    width: 640,
    height: 360,
    top: 0,
    left: 0,
    right: 640,
    bottom: 360,
  });
  Object.keys(mockCtx).forEach((key) => {
    const val = (mockCtx as Record<string, unknown>)[key];
    if (typeof val === 'function') (val as ReturnType<typeof vi.fn>).mockClear();
  });
  // Reset the gradient mock
  mockCtx.createLinearGradient.mockReturnValue({ addColorStop: vi.fn() });
});

const baseProps = {
  meetingId: 'meeting-1',
  canvasState: { type: 'design-preview', data: {} as Record<string, unknown> },
  onCanvasUpdate: vi.fn(),
};

describe('DesignPreviewCanvas', () => {
  it('renders the heading', () => {
    render(<DesignPreviewCanvas {...baseProps} />);
    expect(screen.getByText('Design Preview')).toBeTruthy();
  });

  it('shows empty state when no data', () => {
    render(<DesignPreviewCanvas {...baseProps} />);
    expect(screen.getAllByText('Start chatting -- the preview updates as you talk!').length).toBeGreaterThan(0);
  });

  it('renders scene canvas with elements', () => {
    const props = {
      ...baseProps,
      canvasState: {
        type: 'design-preview',
        data: {
          scene_title: 'Starfield',
          description: 'A scrolling starfield with twinkling stars',
          background: '#0a0a2e',
          elements: [
            { name: 'Stars', description: 'Twinkling dots', color: '#ffffff' },
          ],
        },
      },
    };
    render(<DesignPreviewCanvas {...props} />);
    expect(screen.getByTestId('scene-canvas')).toBeTruthy();
    // Scene title is drawn on canvas, not DOM text
    // Element details still render as DOM cards
    expect(screen.getByText('Stars')).toBeTruthy();
    expect(screen.getByText('Twinkling dots')).toBeTruthy();
  });

  it('scene canvas calls getContext 2d when elements are present', () => {
    const props = {
      ...baseProps,
      canvasState: {
        type: 'design-preview',
        data: {
          scene_title: 'Test',
          background: '#111',
          elements: [{ name: 'A', description: 'B' }],
        },
      },
    };
    render(<DesignPreviewCanvas {...props} />);
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d');
  });

  it('renders color palette swatches', () => {
    const props = {
      ...baseProps,
      canvasState: {
        type: 'design-preview',
        data: {
          scene_title: 'Test',
          palette: ['#ffffff', '#4361ee', '#ff6b6b'],
        },
      },
    };
    render(<DesignPreviewCanvas {...props} />);
    expect(screen.getByTestId('color-palette')).toBeTruthy();
    expect(screen.getByText('#ffffff')).toBeTruthy();
    expect(screen.getByText('#4361ee')).toBeTruthy();
    expect(screen.getByText('#ff6b6b')).toBeTruthy();
  });

  it('renders design elements with color swatch', () => {
    const props = {
      ...baseProps,
      canvasState: {
        type: 'design-preview',
        data: {
          scene_title: 'Test',
          elements: [
            { name: 'Twinkling Stars', description: 'Small white dots that blink', color: '#ffffff' },
            { name: 'Nebula', description: 'Colorful cloud of gas' },
          ],
        },
      },
    };
    render(<DesignPreviewCanvas {...props} />);
    expect(screen.getByTestId('design-elements')).toBeTruthy();
    expect(screen.getByText('Twinkling Stars')).toBeTruthy();
    expect(screen.getByText('Small white dots that blink')).toBeTruthy();
    expect(screen.getByText('Nebula')).toBeTruthy();
  });

  it('elements without draw render fallback (no crash)', () => {
    const props = {
      ...baseProps,
      canvasState: {
        type: 'design-preview',
        data: {
          scene_title: 'Test',
          background: '#000',
          elements: [
            { name: 'NoDraw', description: 'Element without draw code' },
          ],
        },
      },
    };
    // Should not throw
    const { container } = render(<DesignPreviewCanvas {...props} />);
    expect(container).toBeTruthy();
    expect(screen.getByTestId('scene-canvas')).toBeTruthy();
    // Fallback draws a circle -- ctx.arc should have been called
    expect(mockCtx.arc).toHaveBeenCalled();
  });

  it('invalid draw code does not crash (try/catch works)', () => {
    const props = {
      ...baseProps,
      canvasState: {
        type: 'design-preview',
        data: {
          scene_title: 'Test',
          background: '#000',
          elements: [
            { name: 'BadCode', description: 'Has bad draw', draw: 'throw new Error("boom")' },
          ],
        },
      },
    };
    // Should not throw
    const { container } = render(<DesignPreviewCanvas {...props} />);
    expect(container).toBeTruthy();
    expect(screen.getByTestId('scene-canvas')).toBeTruthy();
    // Fallback should have been called after the error
    expect(mockCtx.arc).toHaveBeenCalled();
  });

  it('background gradient parsing produces valid gradient', () => {
    const props = {
      ...baseProps,
      canvasState: {
        type: 'design-preview',
        data: {
          scene_title: 'Gradient Test',
          background: 'linear-gradient(135deg, #0a0a2e, #1a1a4e)',
          elements: [],
        },
      },
    };
    render(<DesignPreviewCanvas {...props} />);
    expect(mockCtx.createLinearGradient).toHaveBeenCalled();
  });

  it('backward compat: elements with only name/description still render', () => {
    const props = {
      ...baseProps,
      canvasState: {
        type: 'design-preview',
        data: {
          scene_title: 'Compat',
          elements: [
            { name: 'OldElement', description: 'No color or draw field' },
          ],
        },
      },
    };
    render(<DesignPreviewCanvas {...props} />);
    expect(screen.getByText('OldElement')).toBeTruthy();
    expect(screen.getByText('No color or draw field')).toBeTruthy();
    expect(screen.getByTestId('scene-canvas')).toBeTruthy();
  });

  it('is registered in the canvas registry', () => {
    const canvas = getCanvas('design-preview');
    expect(canvas).toBeTruthy();
  });

  it('renders save button and calls onMaterialize', async () => {
    const onMaterialize = vi.fn().mockResolvedValue({ files: ['test.json'], primaryFile: 'test.json' });
    const props = {
      ...baseProps,
      canvasState: {
        type: 'design-preview',
        data: { scene_title: 'Test', description: 'A test scene' },
      },
      onMaterialize,
    };
    render(<DesignPreviewCanvas {...props} />);
    const saveBtn = screen.getByText('Save Design Spec');
    fireEvent.click(saveBtn);
    expect(onMaterialize).toHaveBeenCalledWith(props.canvasState.data);
    // Wait for status to update
    expect(await screen.findByText('Saved!')).toBeTruthy();
  });
});
